import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { getLocalDateString } from '@/lib/utils';
import { log } from '@/lib/logger';
import { createSupabaseDashboardSnapshot } from '@/lib/dashboard/supabase-dashboard-snapshot';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/dashboard
 * Get aggregated dashboard data for today
 *
 * Query parameters:
 * - date: string (YYYY-MM-DD) - defaults to today
 *
 * Response:
 * - habits: HabitWithAbsence[] - active habits with completion + absence data
 * - tasks_today: Task[] - tasks due today or overdue
 * - tasks_tomorrow: Task[] - incomplete tasks due tomorrow
 * - stats: { total_habits, completed_today, current_best_streak, total_tasks, tasks_due_today, tasks_completed_today }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return auth.status === 401
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.json(
          { error: 'Failed to fetch dashboard data' },
          { status: 500 },
        );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || getLocalDateString();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const outcome = await createSupabaseDashboardSnapshot(supabase).load({
      userId,
      date,
    });
    if (outcome.status === 'failed') {
      return NextResponse.json(
        { error: 'Failed to fetch dashboard data' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...outcome.snapshot,
      ...(outcome.status === 'degraded' && {
        _warnings: outcome.warnings,
      }),
    });
  } catch (error) {
    log.error('GET /api/dashboard error', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
