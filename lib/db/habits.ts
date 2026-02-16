import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Habit, HabitInsert, HabitUpdate, HabitFilters, HabitWithTodayStatus } from './types';
import type { HabitFrequency } from './types';
import { getLocalDateString } from '@/lib/utils';
import { shouldTrackOnDate } from '@/lib/habits/format';

export class HabitsDB {
  private supabase: SupabaseClient;

  /**
   * @param supabase - Optional Supabase client. Omit for client-side usage
   *   (uses browser client). Pass a server client in API routes:
   *   `new HabitsDB(await createClient())` from `@/lib/supabase/server`.
   */
  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createClient();
  }

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
      if (filters.category !== undefined) {
        query = query.eq('category', filters.category);
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
   * Archive a habit (soft delete)
   */
  async archiveHabit(habitId: string, userId: string): Promise<Habit> {
    return this.updateHabit(habitId, userId, {
      status: 'archived',
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
   * Get habits with today's completion status
   * Used for dashboard view
   */
  async getHabitsWithTodayStatus(userId: string, date?: string): Promise<HabitWithTodayStatus[]> {
    const today = date || getLocalDateString();

    // Get active habits
    const habits = await this.getActiveHabits(userId);

    // Get today's logs for all habits
    const { data: logs, error: logsError } = await this.supabase
      .from('habit_logs')
      .select('habit_id, completed')
      .eq('user_id', userId)
      .eq('logged_date', today)
      .eq('completed', true);

    if (logsError) throw logsError;

    // Get this month's logs for progress bars
    const monthStart = today.substring(0, 7) + '-01';
    const { data: monthLogs, error: monthLogsError } = await this.supabase
      .from('habit_logs')
      .select('habit_id, logged_date, completed')
      .eq('user_id', userId)
      .gte('logged_date', monthStart)
      .lte('logged_date', today)
      .eq('completed', true);

    if (monthLogsError) throw monthLogsError;

    // Count completed days per habit this month
    const monthlyCompletions = new Map<string, number>();
    (monthLogs || []).forEach(log => {
      monthlyCompletions.set(log.habit_id, (monthlyCompletions.get(log.habit_id) || 0) + 1);
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
      return {
        ...habit,
        completed_today: completedHabitIds.has(habit.id),
        monthly_completion_rate: scheduled > 0
          ? Math.min(Math.round((completed / scheduled) * 100), 100)
          : 0,
      };
    });
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
      archived: 0,
    };

    (data || []).forEach(habit => {
      counts[habit.status] = (counts[habit.status] || 0) + 1;
    });

    return counts;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const habitsDB = new HabitsDB();
