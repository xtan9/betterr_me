import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { taskFormSchema } from '@/lib/validations/task';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { getLocalDateString } from '@/lib/utils';
import { createTaskWrites } from '@/lib/tasks/writes';
import type { TaskFilters } from '@/lib/db/types';
import {
  taskCoverageWarning,
  type CoverageCompleteness,
} from '@/lib/tasks/query';
import { createSupabaseTaskQuery } from '@/lib/tasks/supabase-query';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client: supabase } = auth;

    const taskQuery = createSupabaseTaskQuery(supabase, auth.principal);
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

    let upcomingDays = 7;
    if (view === 'today' || view === 'upcoming' || view === 'overdue') {
      upcomingDays = view === 'upcoming'
        ? parseInt(searchParams.get('days') || '7')
        : 0;
      if (view === 'upcoming' && (isNaN(upcomingDays) || upcomingDays < 1)) {
        return NextResponse.json(
          { error: 'Days must be a positive number' },
          { status: 400 }
        );
      }
    }

    const withCoverageWarning = (
      response: Record<string, unknown>,
      completeness: CoverageCompleteness | null,
    ) => completeness && completeness.status !== 'complete'
      ? { ...response, _warnings: [taskCoverageWarning(completeness)] }
      : response;

    // Handle special views
    if (view === 'today') {
      const result = await taskQuery.read(
        { type: 'today', date },
        { onIncomplete: 'return-available' },
      );
      return NextResponse.json(
        withCoverageWarning({ tasks: result.tasks }, result.completeness),
      );
    }

    if (view === 'upcoming') {
      const result = await taskQuery.read(
        { type: 'upcoming', date, days: upcomingDays },
        { onIncomplete: 'return-available' },
      );
      return NextResponse.json(
        withCoverageWarning({ tasks: result.tasks }, result.completeness),
      );
    }

    if (view === 'overdue') {
      const result = await taskQuery.read(
        { type: 'overdue', date },
        { onIncomplete: 'return-available' },
      );
      return NextResponse.json(
        withCoverageWarning({ tasks: result.tasks }, result.completeness),
      );
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

    const result = await taskQuery.read(
      { type: 'list', filters },
      { onIncomplete: 'return-available' },
    );
    return NextResponse.json(
      withCoverageWarning({ tasks: result.tasks }, result.completeness),
    );
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
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
    if (auth.principal.credential === 'cookie') {
      await ensureProfile(supabase, {
        id: userId,
        ...auth.principal.profile,
      });
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
