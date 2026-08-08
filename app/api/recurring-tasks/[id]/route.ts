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
  createSupabaseSeriesStateAdapter,
  createAuthenticatedRecurringTaskCapabilities,
  isSeriesStateSuccess,
  seriesStateHttpFailure,
} from '@/lib/recurring-tasks';
import type {
  SeriesCommands,
  SeriesStateCommand,
  SeriesVersion,
} from '@/lib/recurring-tasks';
import {
  recurringTaskFailureHttpStatus,
  recurringTaskFailureMessage,
  toRecurringTaskResponse,
} from '@/lib/recurring-tasks/compatibility';
import type { RecurringTaskUpdateValues } from '@/lib/validations/recurring-task';

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
 * - action: 'pause' | 'resume' | 'end' (quick actions)
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
    const seriesCommands = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    }).seriesCommands;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const dateParam = searchParams.get('date')?.trim() || undefined;
    if (dateParam && !isValidLocalDate(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    // Handle quick actions
    if (action === 'pause' || action === 'resume' || action === 'end') {
      const outcome = await runSeriesStateCommand(
        seriesCommands,
        action,
        id,
        readSeriesCommandMetadata(request),
        dateParam,
      );
      return seriesCommandResponse(outcome, userId);
    }
    if (action) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause, resume, or end' },
        { status: 400 }
      );
    }

    // Handle general updates
    const body = await request.json();
    const validation = validateRequestBody(body, recurringTaskUpdateSchema);
    if (!validation.success) return validation.response;

    if (validation.data.status) {
      const nonStateFields = Object.keys(body).filter(
        (key) => !['status', 'operationId', 'operation_id', 'version'].includes(key),
      );
      if (nonStateFields.length > 0) {
        return NextResponse.json(
          { error: 'Series state changes must be sent separately from Series revisions' },
          { status: 400 },
        );
      }
      const outcome = await runSeriesStateCommand(
        seriesCommands,
        validation.data.status === 'active'
          ? 'resume'
          : validation.data.status === 'paused'
            ? 'pause'
            : 'end',
        id,
        readSeriesCommandMetadata(request, body),
        dateParam,
      );
      return seriesCommandResponse(outcome, userId);
    }

    const state = createSupabaseSeriesStateAdapter(supabase);

    const outcome = await state.update(
      toSeriesRevisionInput(
        id,
        userId,
        validation.data,
        dateParam,
      ),
    );
    if (!isSeriesStateSuccess(outcome)) {
      const failure = seriesStateHttpFailure(outcome);
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
    return NextResponse.json({ recurring_task: outcome.recurringTask });
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
    const { principal: { userId }, client: supabase } = auth;
    const seriesCommands = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    }).seriesCommands;

    const dateParam = request.nextUrl.searchParams.get('date')?.trim() || undefined;
    if (dateParam && !isValidLocalDate(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    const outcome = await runSeriesStateCommand(
      seriesCommands,
      'end',
      id,
      readSeriesCommandMetadata(request),
      dateParam,
    );
    if (outcome.type === 'ended') return NextResponse.json({ success: true });
    return seriesCommandResponse(outcome, userId);
  } catch (error) {
    log.error('DELETE /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete recurring task' },
      { status: 500 }
    );
  }
}

type SeriesStateAction = 'pause' | 'resume' | 'end';

interface SeriesCommandMetadata {
  operationId: string;
  version: SeriesVersion;
}

function readSeriesCommandMetadata(
  request: NextRequest,
  body?: unknown,
): SeriesCommandMetadata {
  const searchParams = request.nextUrl.searchParams;
  const operationId = firstNonEmpty(
    request.headers.get('Idempotency-Key'),
    request.headers.get('X-Operation-Id'),
    readString(body, 'operationId'),
    readString(body, 'operation_id'),
    searchParams.get('operationId'),
    searchParams.get('operation_id'),
  ) ?? '';
  const version = firstNonEmpty(
    normalizeOpaqueHeader(request.headers.get('If-Match')),
    readString(body, 'version'),
    searchParams.get('version'),
  ) ?? '';

  return {
    operationId,
    version: version as SeriesVersion,
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function normalizeOpaqueHeader(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const withoutWeakPrefix = normalized.startsWith('W/')
    ? normalized.slice(2).trim()
    : normalized;
  return withoutWeakPrefix.replace(/^"(.*)"$/, '$1');
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || !(key in value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

async function runSeriesStateCommand(
  commands: SeriesCommands,
  action: SeriesStateAction,
  seriesId: string,
  metadata: SeriesCommandMetadata,
  effectiveDate?: string,
) {
  const input: SeriesStateCommand = {
    operationId: metadata.operationId,
    seriesId,
    version: metadata.version,
    ...(effectiveDate === undefined ? {} : { effectiveDate }),
  };

  if (action === 'pause') return commands.pauseSeries(input);
  if (action === 'resume') {
    return commands.resumeSeries({
      ...input,
      ...(effectiveDate === undefined
        ? {}
        : { coverage: { from: effectiveDate, to: addLocalDays(effectiveDate, 7) } }),
    });
  }
  return commands.endSeries(input);
}

function seriesCommandResponse(
  outcome: Awaited<ReturnType<SeriesCommands['pauseSeries']>>
    | Awaited<ReturnType<SeriesCommands['resumeSeries']>>
    | Awaited<ReturnType<SeriesCommands['endSeries']>>,
  userId: string,
) {
  if (outcome.type === 'paused' || outcome.type === 'resumed' || outcome.type === 'ended') {
    return NextResponse.json({
      recurring_task: toRecurringTaskResponse(outcome.series, userId),
    });
  }
  const failure = recurringTaskFailureHttpStatusAndMessage(outcome);
  return NextResponse.json(
    { error: failure.error },
    { status: failure.status },
  );
}

function recurringTaskFailureHttpStatusAndMessage(
  outcome: Exclude<
    Awaited<ReturnType<SeriesCommands['pauseSeries']>>
      | Awaited<ReturnType<SeriesCommands['resumeSeries']>>
      | Awaited<ReturnType<SeriesCommands['endSeries']>>,
    { type: 'paused' | 'resumed' | 'ended' }
  >,
) {
  return {
    error: recurringTaskFailureMessage(outcome),
    status: recurringTaskFailureHttpStatus(outcome),
  };
}

function toSeriesRevisionInput(
  seriesId: string,
  userId: string,
  values: RecurringTaskUpdateValues,
  effectiveDate?: string,
) {
  return {
    seriesId,
    userId,
    title: values.title,
    description: values.description,
    priority: values.priority,
    categoryId: values.category_id,
    dueTime: values.due_time,
    recurrenceRule: values.recurrence_rule,
    startDate: values.start_date,
    endType: values.end_type,
    endDate: values.end_date,
    endCount: values.end_count,
    seriesStatus: values.status,
    effectiveDate,
  };
}
