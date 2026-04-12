import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Habit, HabitInsert, HabitUpdate, HabitFilters, HabitWithTodayStatus } from './types';
import type { HabitFrequency } from './types';
import { getLocalDateString } from '@/lib/utils';
import { shouldTrackOnDate } from '@/lib/habits/format';
import { HabitGraduationsDB } from './habit-graduations';
import {
  HabitNotFoundError,
  HabitNotFormedError,
  HabitAlreadyFormedError,
} from './habit-errors';
import { isGraduationEligible } from '@/lib/habits/graduation';
import { log } from '@/lib/logger';

export class HabitsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all habits for a user with optional filtering
   */
  async getUserHabits(userId: string, filters?: HabitFilters): Promise<Habit[]> {
    let query = this.supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.status !== undefined) {
        query = query.eq('status', filters.status);
      }
      if (filters.category_id !== undefined) {
        query = query.eq('category_id', filters.category_id);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get active habits for a user (most common use case)
   */
  async getActiveHabits(userId: string): Promise<Habit[]> {
    return this.getUserHabits(userId, { status: 'active' });
  }

  /**
   * Get a single habit by ID
   */
  async getHabit(habitId: string, userId: string): Promise<Habit | null> {
    const { data, error } = await this.supabase
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  /**
   * Create a new habit
   */
  async createHabit(habit: HabitInsert): Promise<Habit> {
    const { data, error } = await this.supabase
      .from('habits')
      .insert(habit)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a habit
   */
  async updateHabit(habitId: string, userId: string, updates: HabitUpdate): Promise<Habit> {
    const { data, error } = await this.supabase
      .from('habits')
      .update(updates)
      .eq('id', habitId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update habit streak values
   */
  async updateHabitStreak(habitId: string, userId: string, currentStreak: number, bestStreak: number): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      current_streak: currentStreak,
      best_streak: bestStreak,
    });
  }

  /**
   * Pause a habit
   */
  async pauseHabit(habitId: string, userId: string): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      status: 'paused',
      paused_at: new Date().toISOString(),
    });
  }

  /**
   * Resume a paused habit
   */
  async resumeHabit(habitId: string, userId: string): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      status: 'active',
      paused_at: null,
    });
  }

  /**
   * Delete a habit permanently
   */
  async deleteHabit(habitId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('habits')
      .delete()
      .eq('id', habitId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Graduate a habit — mark it as formed, snapshot streak, record history row.
   */
  async graduateHabit(habitId: string, userId: string): Promise<Habit> {
    const habit = await this.getHabit(habitId, userId);
    if (!habit) throw new HabitNotFoundError(habitId);
    if (habit.status === 'formed') {
      throw new HabitAlreadyFormedError(habitId);
    }

    const graduatedAt = new Date().toISOString();
    const graduatedStreak = habit.current_streak;

    const updated = await this.updateHabit(habitId, userId, {
      status: 'formed',
      graduated_at: graduatedAt,
      graduated_streak: graduatedStreak,
      nudge_dismissed_at: null,
    });

    const graduations = new HabitGraduationsDB(this.supabase);
    try {
      await graduations.insertGraduation({
        habit_id: habitId,
        user_id: userId,
        graduated_at: graduatedAt,
        graduated_streak: graduatedStreak,
      });
    } catch (historyErr) {
      log.error(
        '[habits] graduation history insert failed; rolling back status',
        historyErr,
        { habitId, userId },
      );
      try {
        await this.updateHabit(habitId, userId, {
          status: habit.status,
          graduated_at: null,
          graduated_streak: null,
          nudge_dismissed_at: habit.nudge_dismissed_at,
        });
      } catch (rollbackErr) {
        log.error(
          '[habits] graduation rollback FAILED; habit is in inconsistent state',
          rollbackErr,
          { habitId, userId },
        );
      }
      throw historyErr;
    }

    return updated;
  }

  /**
   * Reactivate a formed habit — reset current_streak, keep best_streak, stamp reactivated_at.
   */
  async reactivateHabit(habitId: string, userId: string): Promise<Habit> {
    const habit = await this.getHabit(habitId, userId);
    if (!habit) throw new HabitNotFoundError(habitId);
    if (habit.status !== 'formed') {
      throw new HabitNotFormedError(habitId);
    }

    const updated = await this.updateHabit(habitId, userId, {
      status: 'active',
      current_streak: 0,
      graduated_at: null,
      graduated_streak: null,
      nudge_dismissed_at: null,
    });

    const graduations = new HabitGraduationsDB(this.supabase);
    try {
      await graduations.markReactivated(habitId, userId);
    } catch (err) {
      log.error(
        '[habits] markReactivated failed after status flip',
        err,
        { habitId, userId },
      );
      // Don't throw — reactivation already committed; history is best-effort.
    }

    return updated;
  }

  /**
   * Mark the graduation nudge as dismissed for this habit.
   */
  async dismissGraduationNudge(habitId: string, userId: string): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      nudge_dismissed_at: new Date().toISOString(),
    });
  }

  /**
   * Get habits with today's completion status
   * Used for dashboard view
   */
  async getHabitsWithTodayStatus(userId: string, date?: string): Promise<HabitWithTodayStatus[]> {
    const today = date || getLocalDateString();

    // Get all habits (active, paused, formed) so the UI can filter by tab
    const habits = await this.getUserHabits(userId);

    // Get today's logs for all habits
    const { data: logs, error: logsError } = await this.supabase
      .from('habit_logs')
      .select('habit_id, completed')
      .eq('user_id', userId)
      .eq('logged_date', today)
      .eq('completed', true);

    if (logsError) throw logsError;

    // Fetch a single 90-day window for both monthly progress bars AND graduation
    // eligibility. Degrades gracefully on failure: monthly rate renders as 0 and
    // nudges simply don't show, but the habits list still renders.
    const ninetyDayWindowStart = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const start = new Date(y, m - 1, d - 90);
      const yy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      const dd = String(start.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    })();

    let windowLogs: Array<{ habit_id: string; logged_date: string; completed: boolean }> = [];
    try {
      const { data, error } = await this.supabase
        .from('habit_logs')
        .select('habit_id, logged_date, completed')
        .eq('user_id', userId)
        .gte('logged_date', ninetyDayWindowStart)
        .lte('logged_date', today)
        .eq('completed', true);
      if (error) throw error;
      windowLogs = data ?? [];
    } catch (err) {
      log.warn(
        '[habits] 90-day logs query failed; monthly rate + nudges will be empty',
        { userId, error: String(err) },
      );
    }

    // Count completed days per habit this month (from monthStart onward)
    const monthStart = today.substring(0, 7) + '-01';
    const monthlyCompletions = new Map<string, number>();
    windowLogs.forEach((row) => {
      if (row.logged_date >= monthStart) {
        monthlyCompletions.set(
          row.habit_id,
          (monthlyCompletions.get(row.habit_id) || 0) + 1,
        );
      }
    });

    // Build per-habit log map for graduation eligibility (full 90-day window)
    const logsByHabit = new Map<string, { logged_date: string; completed: boolean }[]>();
    windowLogs.forEach((row) => {
      const arr = logsByHabit.get(row.habit_id) ?? [];
      arr.push({ logged_date: row.logged_date, completed: row.completed });
      logsByHabit.set(row.habit_id, arr);
    });

    // Create a set of completed habit IDs
    const completedHabitIds = new Set((logs || []).map(log => log.habit_id));

    // Count scheduled days per frequency for the month so far
    const scheduledDaysCache = new Map<string, number>();
    const getScheduledDays = (frequency: HabitFrequency): number => {
      const key = JSON.stringify(frequency);
      if (scheduledDaysCache.has(key)) return scheduledDaysCache.get(key)!;

      if (frequency.type === 'times_per_week' || frequency.type === 'weekly') {
        const targetPerWeek = frequency.type === 'times_per_week' ? frequency.count : 1;
        // Count full weeks from month start to today, multiply by target
        const [y, m, d] = today.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m - 1, d);
        let weeks = 0;
        const cursor = new Date(start);
        while (cursor <= end) {
          if (cursor.getDay() === 1) weeks++; // count Mondays as week markers
          cursor.setDate(cursor.getDate() + 1);
        }
        // At minimum 1 partial week if we have any days
        const scheduled = Math.max(weeks, 1) * targetPerWeek;
        scheduledDaysCache.set(key, scheduled);
        return scheduled;
      }

      // For daily, weekdays, weekly, custom — count days shouldTrackOnDate returns true
      const [y, m, d] = today.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m - 1, d);
      let count = 0;
      const cursor = new Date(start);
      while (cursor <= end) {
        if (shouldTrackOnDate(frequency, cursor)) count++;
        cursor.setDate(cursor.getDate() + 1);
      }
      scheduledDaysCache.set(key, count);
      return count;
    };

    // Add today status and monthly rate to each habit
    return habits.map(habit => {
      const scheduled = getScheduledDays(habit.frequency);
      const completed = monthlyCompletions.get(habit.id) || 0;
      const eligible = isGraduationEligible({
        createdAt: habit.created_at,
        today,
        frequency: habit.frequency,
        logs: logsByHabit.get(habit.id) ?? [],
        status: habit.status,
        nudgeDismissedAt: habit.nudge_dismissed_at,
      });
      return {
        ...habit,
        completed_today: completedHabitIds.has(habit.id),
        monthly_completion_rate: scheduled > 0
          ? Math.min(Math.round((completed / scheduled) * 100), 100)
          : 0,
        graduation_eligible: eligible,
      };
    });
  }

  /**
   * Get the count of active (non-deleted) habits for a user.
   * Both 'active' and 'paused' habits count toward the limit.
   * Archived habits (soft-deleted) do NOT count.
   */
  async getActiveHabitCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('habits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['active', 'paused']);

    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Get habit count by status for stats
   */
  async getHabitCountsByStatus(userId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase
      .from('habits')
      .select('status')
      .eq('user_id', userId);

    if (error) throw error;

    const counts: Record<string, number> = {
      active: 0,
      paused: 0,
      formed: 0,
    };

    (data || []).forEach(habit => {
      counts[habit.status] = (counts[habit.status] || 0) + 1;
    });

    return counts;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const habitsDB = new HabitsDB(createClient());
