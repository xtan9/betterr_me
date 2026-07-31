import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  USER_API_READ_POLICY,
  USER_API_WRITE_POLICY,
} from '@/lib/auth/authenticated-request';
import { TasksDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { taskFormSchema } from '@/lib/validations/task';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { ensureRecurringInstances } from '@/lib/recurring-tasks';
import { getLocalDateString } from '@/lib/utils';
import { createTaskWrites } from '@/lib/tasks/writes';
import type { TaskFilters } from '@/lib/db/types';

/**
 * GET /api/tasks
 * Get tasks for the authenticated user with optional filters and views
 *
 * Query parameters:
 * - view: 'today' | 'upcoming' | 'overdue' (special views)
 * - days: number (for upcoming view, default 7)
 * - is_completed: boolean
 * - priority: 0-3
 * - due_date: YYYY-MM-DD
 * - has_due_date: boolean
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, USER_API_READ_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const tasksDB = new TasksDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const view = searchParams.get('view');

    // Read and validate date for view-based queries
    const date = searchParams.get('date') || getLocalDateString();
    if (view && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Generate recurring instances when loading today/upcoming views
    let recurringGenFailed = false;
    if (view === 'today' || view === 'upcoming') {
      const [dy, dm, dd] = date.split('-').map(Number);
      const throughDate = getLocalDateString(new Date(dy, dm - 1, dd + 7));
      await ensureRecurringInstances(supabase, userId, throughDate).catch((err) => {
        log.error('ensureRecurringInstances failed on tasks', err, { userId });
        recurringGenFailed = true;
      });
    }

    // Handle special views
    if (view === 'today') {
      const tasks = await tasksDB.getTodayTasks(userId, date);
      const response: Record<string, unknown> = { tasks };
      if (recurringGenFailed) response._warnings = ['Some recurring tasks may not appear'];
      return NextResponse.json(response);
    }

    if (view === 'upcoming') {
      const days = parseInt(searchParams.get('days') || '7');
      if (isNaN(days) || days < 1) {
        return NextResponse.json(
          { error: 'Days must be a positive number' },
          { status: 400 }
        );
      }
      const tasks = await tasksDB.getUpcomingTasks(userId, date, days);
      const response: Record<string, unknown> = { tasks };
      if (recurringGenFailed) response._warnings = ['Some recurring tasks may not appear'];
      return NextResponse.json(response);
    }

    if (view === 'overdue') {
      const tasks = await tasksDB.getOverdueTasks(userId, date);
      return NextResponse.json({ tasks });
    }

    // Handle regular filtering
    const filters: TaskFilters = {};

    if (searchParams.has('is_completed')) {
      filters.is_completed = searchParams.get('is_completed') === 'true';
    }
    if (searchParams.has('priority')) {
      const priority = parseInt(searchParams.get('priority')!);
      if (priority >= 0 && priority <= 3) {
        filters.priority = priority as 0 | 1 | 2 | 3;
      }
    }
    if (searchParams.has('due_date')) {
      filters.due_date = searchParams.get('due_date')!;
    }
    if (searchParams.has('has_due_date')) {
      filters.has_due_date = searchParams.get('has_due_date') === 'true';
    }
    if (searchParams.has('project_id')) {
      const projectId = searchParams.get('project_id')!;
      filters.project_id = projectId === 'null' ? null : projectId;
    }

    const tasks = await tasksDB.getUserTasks(userId, filters);
    return NextResponse.json({ tasks });
  } catch (error) {
    log.error('GET /api/tasks error', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 * Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, taskFormSchema);
    if (!validation.success) return validation.response;

    // Ensure user profile exists (required by FK constraint on tasks.user_id).
    // Skip for API key auth — users must log in via web to create keys,
    // so their profile already exists.
    if (!request.headers.get('authorization')?.startsWith('Bearer brm_')) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await ensureProfile(supabase, user);
    }

    const outcome = await createTaskWrites(supabase).execute({
      type: 'create',
      userId,
      values: validation.data,
    });
    return NextResponse.json({ task: outcome.task }, { status: 201 });
  } catch (error) {
    log.error('POST /api/tasks error', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
