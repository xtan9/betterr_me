import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskUpdateSchema } from '@/lib/validations/recurring-task';
import { getLocalDateString } from '@/lib/utils';
import { addLocalDays } from '@/lib/recurring-tasks/recurrence';
import { createSupabaseRecurringTaskLifecycle } from '@/lib/recurring-tasks';

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

    const recurringTasksDB = new RecurringTasksDB(supabase, {
      lifecycle: createSupabaseRecurringTaskLifecycle(supabase),
    });
    const template = await recurringTasksDB.getRecurringTask(id, userId);

    if (!template) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 });
    }

    return NextResponse.json({ recurring_task: template });
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
    const recurringTasksDB = new RecurringTasksDB(supabase, {
      lifecycle: createSupabaseRecurringTaskLifecycle(supabase),
    });

    // Handle quick actions
    if (action === 'pause') {
      const template = await recurringTasksDB.pauseRecurringTask(id, userId);
      return NextResponse.json({ recurring_task: template });
    }
    if (action === 'resume') {
      const today = searchParams.get('date') || getLocalDateString();
      const throughDate = addLocalDays(today, 7);
      const template = await recurringTasksDB.resumeRecurringTask(id, userId, today, throughDate);
      return NextResponse.json({ recurring_task: template });
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

    const template = await recurringTasksDB.updateRecurringTask(id, userId, validation.data);
    return NextResponse.json({ recurring_task: template });
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

    const recurringTasksDB = new RecurringTasksDB(supabase, {
      lifecycle: createSupabaseRecurringTaskLifecycle(supabase),
    });
    await recurringTasksDB.deleteRecurringTask(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/recurring-tasks/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete recurring task' },
      { status: 500 }
    );
  }
}
