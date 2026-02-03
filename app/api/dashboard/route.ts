import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { habitsDB, tasksDB } from '@/lib/db';
import type { DashboardData } from '@/lib/db/types';

/**
 * GET /api/dashboard
 * Get aggregated dashboard data for today
 *
 * Query parameters:
 * - date: string (YYYY-MM-DD) - defaults to today
 *
 * Response:
 * - habits: HabitWithTodayStatus[] - active habits with completion status
 * - tasks_today: Task[] - tasks due today or overdue
 * - stats: { total_habits, completed_today, current_best_streak, tasks_due_today, tasks_completed_today }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Fetch data in parallel
    const [habitsWithStatus, todayTasks, allTodayTasks] = await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      // Get all tasks for today to calculate completed count
      tasksDB.getUserTasks(user.id, { due_date: date }),
    ]);

    // Calculate stats
    const completedHabitsToday = habitsWithStatus.filter(h => h.completed_today).length;
    const bestStreak = habitsWithStatus.reduce(
      (max, h) => Math.max(max, h.current_streak),
      0
    );
    const tasksCompletedToday = allTodayTasks.filter(t => t.is_completed).length;

    const dashboardData: DashboardData = {
      habits: habitsWithStatus,
      tasks_today: todayTasks,
      stats: {
        total_habits: habitsWithStatus.length,
        completed_today: completedHabitsToday,
        current_best_streak: bestStreak,
        tasks_due_today: todayTasks.length,
        tasks_completed_today: tasksCompletedToday,
      },
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('GET /api/dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
