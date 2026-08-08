import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskUpdateSchema } from '@/lib/validations/recurring-task';
import {
  addLocalDays,
  isValidLocalDate,
} from '@/lib/recurring-tasks/recurrence';
import {
  createAuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskCapabilities,
  type SeriesVersion,
} from '@/lib/recurring-tasks';
import {
  recurringTaskFailureHttpStatus,
  recurringTaskFailureMessage,
  toReviseSeriesCommand,
  toSeriesStateCommand,
  toRecurringTaskResponse,
} from '@/lib/recurring-tasks/compatibility';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/recurring-tasks/[id]
 * Get a single recurring task template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const result = await createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    }).seriesQueries.getSeries({ seriesId: id });

    if (result.type !== 'found') {
      return NextResponse.json(
        { error: recurringTaskFailureMessage(result) },
        { status: recurringTaskFailureHttpStatus(result) },
      );
    }

    return NextResponse.json({
      recurring_task: toRecurringTaskResponse(result.series, userId),
    });
  } catch (error) {
    log.error('GET /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch recurring task' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/recurring-tasks/[id]
 * Update a recurring task template
 *
 * Query params:
 * - action: 'pause' | 'resume' (quick actions)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const dateParam = searchParams.get('date')?.trim() || undefined;
    if (dateParam && !isValidLocalDate(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    const capabilities = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    });
    let metadata = readMutationMetadata(request);

    // Handle quick actions
    if (action === 'pause') {
      const outcome = await capabilities.seriesCommands.pauseSeries(
        toSeriesStateCommand({
          operationId: metadata.operationId,
          seriesId: id,
          version: metadata.version,
          effectiveDate: dateParam,
        }),
      );
      if (!isSeriesCommandSuccess(outcome)) {
        return NextResponse.json(
          { error: recurringTaskFailureMessage(outcome) },
          { status: recurringTaskFailureHttpStatus(outcome) },
        );
      }
      return NextResponse.json({
        recurring_task: toRecurringTaskResponse(outcome.series, userId),
      });
    }
    if (action === 'resume') {
      const outcome = await capabilities.seriesCommands.resumeSeries(
        toSeriesStateCommand({
          operationId: metadata.operationId,
          seriesId: id,
          version: metadata.version,
          effectiveDate: dateParam,
          coverage: dateParam
            ? { from: dateParam, to: addLocalDays(dateParam, 7) }
            : undefined,
        }),
      );
      if (!isSeriesCommandSuccess(outcome)) {
        return NextResponse.json(
          { error: recurringTaskFailureMessage(outcome) },
          { status: recurringTaskFailureHttpStatus(outcome) },
        );
      }
      return NextResponse.json({
        recurring_task: toRecurringTaskResponse(outcome.series, userId),
      });
    }
    if (action) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause or resume' },
        { status: 400 }
      );
    }

    // Handle general effective-dated Series definition updates.
    const body = await request.json();
    metadata = readMutationMetadata(request, body);
    const validation = validateRequestBody(body, recurringTaskUpdateSchema);
    if (!validation.success) return validation.response;

    const effectiveDate = dateParam ?? readString(body, 'effective_date', 'effectiveDate');
    if (effectiveDate && !isValidLocalDate(effectiveDate)) {
      return NextResponse.json(
        { error: 'Invalid effective Scheduled Date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    if (validation.data.start_date !== undefined) {
      return NextResponse.json(
        { error: 'Recurrence Anchor edits are not supported by the Series lifecycle' },
        { status: 400 },
      );
    }

    if (validation.data.status === 'paused') {
      const outcome = await capabilities.seriesCommands.pauseSeries(
        toSeriesStateCommand({
          operationId: metadata.operationId,
          seriesId: id,
          version: metadata.version,
          effectiveDate,
        }),
      );
      return respondToSeriesCommand(outcome, userId);
    }
    if (validation.data.status === 'archived') {
      const outcome = await capabilities.seriesCommands.endSeries(
        toSeriesStateCommand({
          operationId: metadata.operationId,
          seriesId: id,
          version: metadata.version,
          effectiveDate,
        }),
      );
      return respondToSeriesCommand(outcome, userId);
    }
    if (validation.data.status === 'active') {
      const current = await capabilities.seriesQueries.getSeries({ seriesId: id });
      if (!isSeriesQuerySuccess(current)) {
        return NextResponse.json(
          { error: recurringTaskFailureMessage(current) },
          { status: recurringTaskFailureHttpStatus(current) },
        );
      }
      if (current.series.status === 'paused') {
        const outcome = await capabilities.seriesCommands.resumeSeries(
          toSeriesStateCommand({
            operationId: metadata.operationId,
            seriesId: id,
            version: metadata.version,
            effectiveDate,
            coverage: effectiveDate
              ? { from: effectiveDate, to: addLocalDays(effectiveDate, 7) }
              : undefined,
          }),
        );
        return respondToSeriesCommand(outcome, userId);
      }
      if (current.series.status === 'ended') {
        return NextResponse.json(
          { error: 'Ended Series cannot be resumed' },
          { status: 400 },
        );
      }
    }

    const outcome = await capabilities.seriesCommands.reviseSeries(
      toReviseSeriesCommand({
        operationId: metadata.operationId,
        seriesId: id,
        version: metadata.version,
        effectiveDate: effectiveDate ?? '',
        title: validation.data.title,
        description: validation.data.description,
        priority: validation.data.priority,
        categoryId: validation.data.category_id,
        dueTime: validation.data.due_time,
        recurrenceRule: validation.data.recurrence_rule,
        scope: validation.data.scope,
        endType: validation.data.end_type,
        endDate: validation.data.end_date,
        endCount: validation.data.end_count,
      }),
    );
    return respondToSeriesCommand(outcome, userId);
  } catch (error: unknown) {
    log.error('PATCH /api/recurring-tasks/[id] error', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update recurring task' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recurring-tasks/[id]
 * Delete a recurring task template and its future incomplete instances
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { client: supabase } = auth;

    const dateParam = request.nextUrl.searchParams.get('date')?.trim() || undefined;
    if (dateParam && !isValidLocalDate(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    const capabilities = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    });
    const metadata = readMutationMetadata(request);
    const outcome = await capabilities.seriesCommands.endSeries(
      toSeriesStateCommand({
        operationId: metadata.operationId,
        seriesId: id,
        version: metadata.version,
        effectiveDate: dateParam,
      }),
    );
    if (!isSeriesCommandSuccess(outcome)) {
      return NextResponse.json(
        { error: recurringTaskFailureMessage(outcome) },
        { status: recurringTaskFailureHttpStatus(outcome) },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete recurring task' },
      { status: 500 }
    );
  }
}

type SeriesCommandResult =
  | Awaited<ReturnType<AuthenticatedRecurringTaskCapabilities['seriesCommands']['reviseSeries']>>
  | Awaited<ReturnType<AuthenticatedRecurringTaskCapabilities['seriesCommands']['pauseSeries']>>
  | Awaited<ReturnType<AuthenticatedRecurringTaskCapabilities['seriesCommands']['resumeSeries']>>
  | Awaited<ReturnType<AuthenticatedRecurringTaskCapabilities['seriesCommands']['endSeries']>>;

type SeriesQueryResult = Awaited<
  ReturnType<AuthenticatedRecurringTaskCapabilities['seriesQueries']['getSeries']>
>;

function respondToSeriesCommand(
  outcome: SeriesCommandResult,
  ownerId: string,
): NextResponse {
  if (!isSeriesCommandSuccess(outcome)) {
    return NextResponse.json(
      { error: recurringTaskFailureMessage(outcome) },
      { status: recurringTaskFailureHttpStatus(outcome) },
    );
  }
  return NextResponse.json({
    recurring_task: toRecurringTaskResponse(outcome.series, ownerId),
  });
}

function isSeriesCommandSuccess(
  outcome: SeriesCommandResult,
): outcome is Extract<SeriesCommandResult, { series: unknown }> {
  return 'series' in outcome && (
    outcome.status === 'complete' || outcome.status === 'already-applied'
  );
}

function isSeriesQuerySuccess(
  outcome: SeriesQueryResult,
): outcome is Extract<typeof outcome, { type: 'found'; series: unknown }> {
  return outcome.type === 'found';
}

function readMutationMetadata(request: NextRequest, body?: unknown): {
  operationId: string;
  version: SeriesVersion;
} {
  const operationId = request.headers.get('Idempotency-Key')?.trim()
    || readString(body, 'operation_id', 'operationId')
    || '';
  const version = stripEntityTag(
    request.headers.get('If-Match')?.trim()
      || readString(body, 'version', 'expected_version', 'expectedVersion')
      || '',
  );
  return {
    operationId,
    version: version as SeriesVersion,
  };
}

function readString(
  value: unknown,
  ...keys: string[]
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string') return candidate.trim();
  }
  return undefined;
}

function stripEntityTag(value: string): string {
  if (value.startsWith('W/')) value = value.slice(2);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
