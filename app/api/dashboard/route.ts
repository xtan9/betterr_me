import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, TasksDB } from '@/lib/db';
import type { DashboardData } from '@/lib/db/types';
import { getLocalDateString, getNextDateString } from '@/lib/utils';

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
 * - tasks_tomorrow: Task[] - incomplete tasks due tomorrow
 * - stats: { total_habits, completed_today, current_best_streak, total_tasks, tasks_due_today, tasks_completed_today }
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

    const habitsDB = new HabitsDB(supabase);
    const tasksDB = new TasksDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || getLocalDateString();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const tomorrowStr = getNextDateString(date);

    // Fetch data in parallel
    const [habitsWithStatus, todayTasks, allTodayTasks, allTasks, tasksTomorrow] = await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      // Get all tasks for today to calculate completed count
      tasksDB.getUserTasks(user.id, { due_date: date }),
      // Get all tasks to determine if user has any tasks at all
      tasksDB.getUserTasks(user.id),
      // Get incomplete tasks for tomorrow
      tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
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
      tasks_tomorrow: tasksTomorrow,
      stats: {
        total_habits: habitsWithStatus.length,
        completed_today: completedHabitsToday,
        current_best_streak: bestStreak,
        total_tasks: allTasks.length,
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
