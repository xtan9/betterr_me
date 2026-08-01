import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { RecurringTasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { recurringTaskCreateSchema } from '@/lib/validations/recurring-task';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { getLocalDateString } from '@/lib/utils';
import type { RecurringTaskInsert } from '@/lib/db/types';

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

    const recurringTasksDB = new RecurringTasksDB(supabase);
    const templates = await recurringTasksDB.getUserRecurringTasks(
      userId,
      status ? { status } : undefined
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

    // Calculate throughDate (7 days from today)
    const today = body.date || getLocalDateString();
    const [y, m, d] = today.split('-').map(Number);
    const throughDate = new Date(y, m - 1, d + 7);
    const throughDateStr = getLocalDateString(throughDate);

    const recurringTasksDB = new RecurringTasksDB(supabase);
    const data: RecurringTaskInsert = {
      user_id: userId,
      title: validation.data.title.trim(),
      description: validation.data.description?.trim() || null,
      priority: validation.data.priority ?? 0,
      category_id: validation.data.category_id || null,
      due_time: validation.data.due_time || null,
      recurrence_rule: validation.data.recurrence_rule,
      start_date: validation.data.start_date,
      end_type: validation.data.end_type ?? 'never',
      end_date: validation.data.end_date || null,
      end_count: validation.data.end_count || null,
      status: 'active',
    };

    const template = await recurringTasksDB.createRecurringTask(data, throughDateStr);
    return NextResponse.json({ recurring_task: template }, { status: 201 });
  } catch (error) {
    log.error('POST /api/recurring-tasks error', error);
    return NextResponse.json(
      { error: 'Failed to create recurring task' },
      { status: 500 }
    );
  }
}
