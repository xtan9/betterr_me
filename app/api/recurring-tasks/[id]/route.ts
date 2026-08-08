import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import {
  createTaskWrites,
  taskDeletionHttpFailure,
} from '@/lib/tasks/writes';
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
  createActivatedRecurringTaskLifecycle,
  isSeriesStateSuccess,
  seriesStateHttpFailure,
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
    const state = createSupabaseSeriesStateAdapter(supabase);

    // Handle quick actions
    if (action === 'pause') {
      const outcome = await state.pause({
        seriesId: id,
        userId,
        effectiveDate: dateParam,
      });
      if (!isSeriesStateSuccess(outcome)) {
        const failure = seriesStateHttpFailure(outcome);
        return NextResponse.json(
          { error: failure.error },
          { status: failure.status },
        );
      }
      return NextResponse.json({ recurring_task: outcome.recurringTask });
    }
    if (action === 'resume') {
      const throughDate = dateParam ? addLocalDays(dateParam, 7) : undefined;
      const outcome = await state.resume({
        seriesId: id,
        userId,
        effectiveDate: dateParam,
        coverageThrough: throughDate,
      });
      if (!isSeriesStateSuccess(outcome)) {
        const failure = seriesStateHttpFailure(outcome);
        return NextResponse.json(
          { error: failure.error },
          { status: failure.status },
        );
      }
      return NextResponse.json({ recurring_task: outcome.recurringTask });
    }
    if (action) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: pause or resume' },
        { status: 400 }
      );
    }

    // Handle general updates
    const body = await request.json();
    const validation = validateRequestBody(body, recurringTaskUpdateSchema);
    if (!validation.success) return validation.response;

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

    const dateParam = request.nextUrl.searchParams.get('date')?.trim() || undefined;
    if (dateParam && !isValidLocalDate(dateParam)) {
      return NextResponse.json(
        { error: 'Invalid date. Must be a valid YYYY-MM-DD local date' },
        { status: 400 },
      );
    }
    const outcome = await createTaskWrites(supabase, {
      lifecycle: createActivatedRecurringTaskLifecycle(supabase),
    }).deleteSeries({
      seriesId: id,
      userId,
      ...(dateParam === undefined ? {} : { effectiveDate: dateParam }),
    });
    if (outcome.type !== 'deleted') {
      const failure = taskDeletionHttpFailure(outcome, 'series');
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
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
