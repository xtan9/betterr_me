import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HabitLog, HabitLogInsert, HabitFrequency } from './types';
import { HabitsDB } from './habits';

export class HabitLogsDB {
  private supabase: SupabaseClient;
  private habitsDB: HabitsDB;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createClient();
    this.habitsDB = new HabitsDB(this.supabase);
  }

  /**
   * Get logs for a habit within a date range
   */
  async getLogsByDateRange(
    habitId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<HabitLog[]> {
    const { data, error } = await this.supabase
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate)
      .order('logged_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single log for a specific date
   */
  async getLogForDate(habitId: string, userId: string, date: string): Promise<HabitLog | null> {
    const { data, error } = await this.supabase
      .from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .eq('logged_date', date)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  /**
   * Get all completed logs for a user on a specific date
   */
  async getUserLogsForDate(userId: string, date: string): Promise<HabitLog[]> {
    const { data, error } = await this.supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_date', date)
      .eq('completed', true);

    if (error) throw error;
    return data || [];
  }

  /**
   * Create or update a log (upsert)
   */
  async upsertLog(log: HabitLogInsert): Promise<HabitLog> {
    const { data, error } = await this.supabase
      .from('habit_logs')
      .upsert(log, { onConflict: 'habit_id,logged_date' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Toggle habit completion for a date
   * Returns the updated log and new streak values
   */
  async toggleLog(
    habitId: string,
    userId: string,
    date: string
  ): Promise<{ log: HabitLog; currentStreak: number; bestStreak: number }> {
    // Check 7-day edit window
    const logDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (logDate < sevenDaysAgo) {
      throw new Error('EDIT_WINDOW_EXCEEDED');
    }

    // Get existing log
    const existingLog = await this.getLogForDate(habitId, userId, date);

    // Toggle completion
    const newCompleted = existingLog ? !existingLog.completed : true;

    // Upsert the log
    const log = await this.upsertLog({
      habit_id: habitId,
      user_id: userId,
      logged_date: date,
      completed: newCompleted,
    });

    // Get habit for frequency info
    const habit = await this.habitsDB.getHabit(habitId, userId);
    if (!habit) throw new Error('Habit not found');

    // Recalculate streak
    const { currentStreak, bestStreak } = await this.calculateStreak(habitId, userId, habit.frequency, habit.best_streak);

    // Update habit with new streak values
    await this.habitsDB.updateHabitStreak(habitId, userId, currentStreak, bestStreak);

    return { log, currentStreak, bestStreak };
  }

  /**
   * Calculate the current streak for a habit based on frequency
   */
  async calculateStreak(
    habitId: string,
    userId: string,
    frequency: HabitFrequency,
    previousBestStreak: number = 0
  ): Promise<{ currentStreak: number; bestStreak: number }> {
    // Get all logs for the past 365 days (max streak calculation window)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 365);

    const logs = await this.getLogsByDateRange(
      habitId,
      userId,
      startDate.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );

    // Create a set of completed dates for quick lookup
    const completedDates = new Set(
      logs.filter(log => log.completed).map(log => log.logged_date)
    );

    // Calculate streak based on frequency type
    let currentStreak = 0;
    const checkDate = new Date(today);

    // Walk backwards from today counting consecutive completions
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];

      if (this.shouldTrackOnDate(frequency, checkDate)) {
        if (completedDates.has(dateStr)) {
          currentStreak++;
        } else {
          // Allow today to be incomplete without breaking streak
          if (dateStr !== today.toISOString().split('T')[0]) {
            break;
          }
        }
      }

      // Move to previous day
      checkDate.setDate(checkDate.getDate() - 1);

      // Safety limit
      if (today.getTime() - checkDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }

    const bestStreak = Math.max(currentStreak, previousBestStreak);

    return { currentStreak, bestStreak };
  }

  /**
   * Check if a habit should be tracked on a given date based on frequency
   */
  private shouldTrackOnDate(frequency: HabitFrequency, date: Date): boolean {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.

    switch (frequency.type) {
      case 'daily':
        return true;

      case 'weekdays':
        // Monday (1) through Friday (5)
        return dayOfWeek >= 1 && dayOfWeek <= 5;

      case 'weekly':
        // Track on the same day each week (use Monday as default)
        return dayOfWeek === 1;

      case 'times_per_week':
        // For times_per_week, we track daily but evaluate weekly
        // This is a simplification - full implementation would check weekly completion
        return true;

      case 'custom':
        return frequency.days.includes(dayOfWeek);

      default:
        return false;
    }
  }

  /**
   * Delete a log
   */
  async deleteLog(habitId: string, userId: string, date: string): Promise<void> {
    const { error } = await this.supabase
      .from('habit_logs')
      .delete()
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .eq('logged_date', date);

    if (error) throw error;
  }

  /**
   * Get completion stats for a habit
   */
  async getHabitStats(
    habitId: string,
    userId: string,
    days: number = 30
  ): Promise<{
    totalDays: number;
    completedDays: number;
    completionRate: number;
  }> {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.getLogsByDateRange(
      habitId,
      userId,
      startDate.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );

    const completedDays = logs.filter(log => log.completed).length;

    return {
      totalDays: days,
      completedDays,
      completionRate: days > 0 ? Math.round((completedDays / days) * 100) : 0,
    };
  }

  /**
   * Get detailed completion stats for a habit (thisWeek, thisMonth, allTime)
   * @param weekStartDay - 0 for Sunday (default), 1 for Monday
   */
  async getDetailedHabitStats(
    habitId: string,
    userId: string,
    frequency: HabitFrequency,
    createdAt: string,
    weekStartDay: number = 0
  ): Promise<{
    thisWeek: { completed: number; total: number; percent: number };
    thisMonth: { completed: number; total: number; percent: number };
    allTime: { completed: number; total: number; percent: number };
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate start of this week based on user preference
    // weekStartDay: 0 = Sunday, 1 = Monday
    const startOfWeek = new Date(today);
    const currentDayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, etc.
    const daysToSubtract = (currentDayOfWeek - weekStartDay + 7) % 7;
    startOfWeek.setDate(today.getDate() - daysToSubtract);

    // Calculate start of this month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Habit creation date
    const habitCreatedAt = new Date(createdAt);
    habitCreatedAt.setHours(0, 0, 0, 0);

    // Get all logs from habit creation to today
    const allLogs = await this.getLogsByDateRange(
      habitId,
      userId,
      habitCreatedAt.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    );

    // Create a set of completed dates for quick lookup
    const completedDates = new Set(
      allLogs.filter(log => log.completed).map(log => log.logged_date)
    );

    // Helper to count scheduled and completed days in a range
    const countDaysInRange = (start: Date, end: Date): { completed: number; total: number; percent: number } => {
      let total = 0;
      let completed = 0;
      const currentDate = new Date(start);

      while (currentDate <= end) {
        if (currentDate >= habitCreatedAt && this.shouldTrackOnDate(frequency, currentDate)) {
          total++;
          const dateStr = currentDate.toISOString().split('T')[0];
          if (completedDates.has(dateStr)) {
            completed++;
          }
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        completed,
        total,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    };

    return {
      thisWeek: countDaysInRange(startOfWeek, today),
      thisMonth: countDaysInRange(startOfMonth, today),
      allTime: countDaysInRange(habitCreatedAt, today),
    };
  }

  /**
   * Get logs for multiple habits on a specific date (for dashboard)
   */
  async getLogsForHabitsOnDate(
    habitIds: string[],
    userId: string,
    date: string
  ): Promise<Map<string, HabitLog>> {
    if (habitIds.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('habit_logs')
      .select('*')
      .in('habit_id', habitIds)
      .eq('user_id', userId)
      .eq('logged_date', date);

    if (error) throw error;

    const logsMap = new Map<string, HabitLog>();
    (data || []).forEach(log => {
      logsMap.set(log.habit_id, log);
    });

    return logsMap;
  }
}

export const habitLogsDB = new HabitLogsDB();
