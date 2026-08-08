import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskCreateSchema } from '@/lib/validations/recurring-task';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { getLocalDateString } from '@/lib/utils';
import {
  initialSeriesCoverage,
  toCreateSeriesCommand,
  toLifecycleRecurrenceDates,
  toRecurringTaskResponse,
  recurringTaskFailureHttpStatus,
  recurringTaskFailureMessage,
} from '@/lib/recurring-tasks/compatibility';
import { createAuthenticatedRecurringTaskCapabilities } from '@/lib/recurring-tasks';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/recurring-tasks
 * List recurring task templates for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const validStatuses = ['active', 'paused', 'archived'] as const;
    const statusParam = searchParams.get('status');
    const status = statusParam && (validStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as 'active' | 'paused' | 'archived')
      : null;

    const capabilities = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    });
    const result = await capabilities.seriesQueries.listSeries({
      status: status === 'archived' ? 'ended' : status ?? undefined,
    });
    if (result.type !== 'listed') {
      return NextResponse.json(
        { error: recurringTaskFailureMessage(result) },
        { status: recurringTaskFailureHttpStatus(result) },
      );
    }
    const templates = result.series.map((series) =>
      toRecurringTaskResponse(series, userId),
    );

    return NextResponse.json({ recurring_tasks: templates });
  } catch (error) {
    log.error('GET /api/recurring-tasks error', error);
    return NextResponse.json(
      { error: 'Failed to fetch recurring tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recurring-tasks
 * Create a new recurring task template and generate initial instances
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, recurringTaskCreateSchema);
    if (!validation.success) return validation.response;

    await ensureProfile(supabase, {
      id: userId,
      ...auth.principal.profile,
    });

    // Keep the product's local-date reference as an adapter concern. The
    // shared creation seam turns it into the same initial Coverage request as
    // the AI adapter.
    const today = body.date || getLocalDateString();
    const recurrenceDates = toLifecycleRecurrenceDates(validation.data.start_date);
    const operationId = request.headers.get('Idempotency-Key') ?? '';
    const command = toCreateSeriesCommand({
      operationId,
      title: validation.data.title,
      description: validation.data.description ?? null,
      priority: validation.data.priority ?? 0,
      categoryId: validation.data.category_id ?? null,
      dueTime: validation.data.due_time ?? null,
      recurrenceRule: validation.data.recurrence_rule,
      ...recurrenceDates,
      endType: validation.data.end_type ?? 'never',
      endDate: validation.data.end_date ?? null,
      endCount: validation.data.end_count ?? null,
      coverageThrough: initialSeriesCoverage(
        recurrenceDates.recurrenceAnchor,
        today,
      ).to,
    });
    const capabilities = createAuthenticatedRecurringTaskCapabilities({
      supabase,
      principal: auth.principal,
    });
    const result = await capabilities.seriesCommands.createSeries(command);
    if (result.type === 'created') {
      return NextResponse.json(
        { recurring_task: toRecurringTaskResponse(result.series, userId) },
        { status: result.status === 'already-applied' ? 200 : 201 },
      );
    }
    return NextResponse.json(
      { error: recurringTaskFailureMessage(result) },
      { status: recurringTaskFailureHttpStatus(result) },
    );
  } catch (error) {
    log.error('POST /api/recurring-tasks error', error);
    return NextResponse.json(
      { error: 'Failed to create recurring task' },
      { status: 500 }
    );
  }
}
