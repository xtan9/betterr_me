import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, TasksDB, HabitLogsDB, HabitMilestonesDB } from '@/lib/db';
import type { DashboardData, HabitMilestone } from '@/lib/db/types';
import { getLocalDateString, getNextDateString } from '@/lib/utils';
import { computeMissedDays } from '@/lib/habits/absence';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const habitsDB = new HabitsDB(supabase);
    const tasksDB = new TasksDB(supabase);
    const habitLogsDB = new HabitLogsDB(supabase);
    const milestonesDB = new HabitMilestonesDB(supabase);
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

    // 30-day lookback window for absence computation
    const [year, month, day] = date.split('-').map(Number);
    const thirtyDaysAgo = new Date(year, month - 1, day - 30);
    const thirtyDaysAgoStr = [
      thirtyDaysAgo.getFullYear(),
      String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0'),
      String(thirtyDaysAgo.getDate()).padStart(2, '0'),
    ].join('-');

    // Fetch data in parallel (including bulk logs for absence computation)
    const [habitsWithStatus, todayTasks, allTodayTasks, allTasks, tasksTomorrow, allLogs, milestonesToday] = await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      // Get all tasks for today to calculate completed count
      tasksDB.getUserTasks(user.id, { due_date: date }),
      // Get all tasks to determine if user has any tasks at all
      tasksDB.getUserTasks(user.id),
      // Get incomplete tasks for tomorrow
      tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
      // Bulk fetch 30-day logs for all habits (1 query, avoids N+1)
      habitLogsDB.getAllUserLogs(user.id, thirtyDaysAgoStr, date),
      // Get milestones achieved today
      milestonesDB.getTodaysMilestones(user.id, date).catch((err) => {
        console.error('Failed to fetch milestones:', err);
        return [] as HabitMilestone[];
      }),
    ]);

    // Group completed logs by habit_id for absence computation
    const logsByHabit = new Map<string, Set<string>>();
    for (const log of allLogs) {
      if (log.completed) {
        if (!logsByHabit.has(log.habit_id)) {
          logsByHabit.set(log.habit_id, new Set());
        }
        logsByHabit.get(log.habit_id)!.add(log.logged_date);
      }
    }

    // Enrich habits with absence data
    const enrichedHabits = habitsWithStatus.map(habit => {
      try {
        const completedDates = logsByHabit.get(habit.id) || new Set<string>();
        const { missed_scheduled_days, previous_streak } = computeMissedDays(
          habit.frequency,
          completedDates,
          date,
          habit.created_at,
          thirtyDaysAgoStr,
        );
        return { ...habit, missed_scheduled_days, previous_streak };
      } catch (err) {
        console.error('computeMissedDays failed for habit', habit.id, err);
        return { ...habit, missed_scheduled_days: 0, previous_streak: 0 };
      }
    });

    // Calculate stats
    const completedHabitsToday = enrichedHabits.filter(h => h.completed_today).length;
    const bestStreak = enrichedHabits.reduce(
      (max, h) => Math.max(max, h.current_streak),
      0
    );
    const tasksCompletedToday = allTodayTasks.filter(t => t.is_completed).length;

    const dashboardData: DashboardData = {
      habits: enrichedHabits,
      tasks_today: todayTasks,
      tasks_tomorrow: tasksTomorrow,
      milestones_today: milestonesToday,
      stats: {
        total_habits: enrichedHabits.length,
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
