import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HabitLog, HabitLogInsert, HabitFrequency } from './types';
import { HabitsDB } from './habits';

/**
 * Get the start of a week for a given date based on week start preference
 */
function getWeekStart(date: Date, weekStartDay: number = 0): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const currentDayOfWeek = result.getDay();
  const daysToSubtract = (currentDayOfWeek - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysToSubtract);
  return result;
}

/**
 * Get a week identifier string for grouping (YYYY-WW format based on week start)
 */
function getWeekKey(date: Date, weekStartDay: number = 0): string {
  const weekStart = getWeekStart(date, weekStartDay);
  return weekStart.toISOString().split('T')[0];
}

export class HabitLogsDB {
  private supabase: SupabaseClient;
  private habitsDB: HabitsDB;

  /**
   * @param supabase - Optional Supabase client. Omit for client-side usage
   *   (uses browser client). Pass a server client in API routes:
   *   `new HabitLogsDB(await createClient())` from `@/lib/supabase/server`.
   */
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
   * @param weekStartDay - 0 for Sunday (default), 1 for Monday - used for times_per_week
   */
  async calculateStreak(
    habitId: string,
    userId: string,
    frequency: HabitFrequency,
    previousBestStreak: number = 0,
    weekStartDay: number = 0
  ): Promise<{ currentStreak: number; bestStreak: number }> {
    // Get all logs for the past 365 days (max streak calculation window)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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

    // Special handling for times_per_week: count consecutive successful weeks
    if (frequency.type === 'times_per_week') {
      return this.calculateWeeklyStreak(completedDates, frequency.count, weekStartDay, today, previousBestStreak);
    }

    // Calculate streak based on frequency type (daily/weekdays/weekly/custom)
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
   * Calculate streak for times_per_week habits based on consecutive successful weeks
   */
  private calculateWeeklyStreak(
    completedDates: Set<string>,
    targetPerWeek: number,
    weekStartDay: number,
    today: Date,
    previousBestStreak: number
  ): { currentStreak: number; bestStreak: number } {
    // Group completions by week
    const weekCompletions = new Map<string, number>();

    for (const dateStr of completedDates) {
      const date = new Date(dateStr);
      const weekKey = getWeekKey(date, weekStartDay);
      weekCompletions.set(weekKey, (weekCompletions.get(weekKey) || 0) + 1);
    }

    // Count consecutive successful weeks starting from current week
    let currentStreak = 0;
    const checkWeekStart = getWeekStart(today, weekStartDay);
    const currentWeekKey = checkWeekStart.toISOString().split('T')[0];

    // Check if current week is complete (for ongoing week, don't break streak if not yet met)
    const currentWeekCompletions = weekCompletions.get(currentWeekKey) || 0;
    const isCurrentWeekInProgress = today.getDay() !== (weekStartDay + 6) % 7; // Not last day of week

    if (currentWeekCompletions >= targetPerWeek) {
      currentStreak = 1;
    } else if (isCurrentWeekInProgress) {
      // Current week is in progress and not yet failed - don't count it but don't break streak
      currentStreak = 0;
    } else {
      // Current week is complete but didn't meet target
      return { currentStreak: 0, bestStreak: previousBestStreak };
    }

    // Walk backwards through previous weeks
    checkWeekStart.setDate(checkWeekStart.getDate() - 7);

    while (true) {
      const weekKey = checkWeekStart.toISOString().split('T')[0];
      const completions = weekCompletions.get(weekKey) || 0;

      if (completions >= targetPerWeek) {
        currentStreak++;
      } else {
        break;
      }

      // Move to previous week
      checkWeekStart.setDate(checkWeekStart.getDate() - 7);

      // Safety limit (52 weeks)
      if (currentStreak > 52) {
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
    const startOfWeek = getWeekStart(today, weekStartDay);

    // Calculate start of this month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Habit creation date
    const habitCreatedAt = new Date(createdAt);
    habitCreatedAt.setHours(0, 0, 0, 0);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const todayStr = formatDate(today);
    const createdStr = formatDate(habitCreatedAt);

    // Special handling for times_per_week: needs individual dates for weekly grouping
    if (frequency.type === 'times_per_week') {
      const { data: completedLogs, error } = await this.supabase
        .from('habit_logs')
        .select('logged_date')
        .eq('habit_id', habitId)
        .eq('user_id', userId)
        .eq('completed', true)
        .gte('logged_date', createdStr)
        .lte('logged_date', todayStr);

      if (error) throw error;
      const completedDates = new Set((completedLogs || []).map(log => log.logged_date));
      return this.getTimesPerWeekStats(completedDates, frequency.count, weekStartDay, today, startOfWeek, startOfMonth, habitCreatedAt);
    }

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
        percent: total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0,
      };
    };

    // For daily habits, use optimized parallel COUNT queries (every day is scheduled)
    if (frequency.type === 'daily') {
      const countScheduledDays = (start: Date, end: Date): number => {
        let total = 0;
        const currentDate = new Date(start);
        while (currentDate <= end) {
          if (currentDate >= habitCreatedAt) total++;
          currentDate.setDate(currentDate.getDate() + 1);
        }
        return total;
      };

      const weekTotal = countScheduledDays(startOfWeek, today);
      const monthTotal = countScheduledDays(startOfMonth, today);
      const allTimeTotal = countScheduledDays(habitCreatedAt, today);

      const [weekCompleted, monthCompleted, allTimeCompleted] = await Promise.all([
        this.countCompletedLogs(habitId, userId, formatDate(startOfWeek), todayStr),
        this.countCompletedLogs(habitId, userId, formatDate(startOfMonth), todayStr),
        this.countCompletedLogs(habitId, userId, createdStr, todayStr),
      ]);

      const calcPercent = (c: number, t: number) =>
        t > 0 ? Math.min(Math.round((c / t) * 100), 100) : 0;

      return {
        thisWeek: { completed: weekCompleted, total: weekTotal, percent: calcPercent(weekCompleted, weekTotal) },
        thisMonth: { completed: monthCompleted, total: monthTotal, percent: calcPercent(monthCompleted, monthTotal) },
        allTime: { completed: allTimeCompleted, total: allTimeTotal, percent: calcPercent(allTimeCompleted, allTimeTotal) },
      };
    }

    // For non-daily habits (weekdays, weekly, custom), fetch completed dates and
    // filter by shouldTrackOnDate to avoid counting completions on non-scheduled days
    const { data: completedLogs, error: logsError } = await this.supabase
      .from('habit_logs')
      .select('logged_date')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('logged_date', createdStr)
      .lte('logged_date', todayStr);

    if (logsError) throw logsError;
    const completedDates = new Set((completedLogs || []).map(log => log.logged_date));

    return {
      thisWeek: countDaysInRange(startOfWeek, today),
      thisMonth: countDaysInRange(startOfMonth, today),
      allTime: countDaysInRange(habitCreatedAt, today),
    };
  }

  /**
   * Count completed logs in a date range using a HEAD request (returns only the count, no rows).
   * Only safe for daily habits where every day is a scheduled day.
   */
  private async countCompletedLogs(
    habitId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('habit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Get stats for times_per_week habits (counts successful weeks, not days)
   */
  private getTimesPerWeekStats(
    completedDates: Set<string>,
    targetPerWeek: number,
    weekStartDay: number,
    today: Date,
    startOfWeek: Date,
    startOfMonth: Date,
    habitCreatedAt: Date
  ): {
    thisWeek: { completed: number; total: number; percent: number };
    thisMonth: { completed: number; total: number; percent: number };
    allTime: { completed: number; total: number; percent: number };
  } {
    // Group completions by week
    const weekCompletions = new Map<string, number>();

    for (const dateStr of completedDates) {
      const date = new Date(dateStr);
      const weekKey = getWeekKey(date, weekStartDay);
      weekCompletions.set(weekKey, (weekCompletions.get(weekKey) || 0) + 1);
    }

    // thisWeek: show progress toward target (completed/target for current week)
    const currentWeekKey = getWeekKey(today, weekStartDay);
    const thisWeekCompletions = weekCompletions.get(currentWeekKey) || 0;
    const thisWeek = {
      completed: thisWeekCompletions,
      total: targetPerWeek,
      percent: Math.round((Math.min(thisWeekCompletions, targetPerWeek) / targetPerWeek) * 100),
    };

    // Helper to count successful weeks in a date range
    const countWeeksInRange = (rangeStart: Date, rangeEnd: Date): { completed: number; total: number; percent: number } => {
      let totalWeeks = 0;
      let successfulWeeks = 0;

      // Find the first week start that's >= rangeStart and >= habitCreatedAt
      const effectiveStart = rangeStart > habitCreatedAt ? rangeStart : habitCreatedAt;
      const checkWeekStart = getWeekStart(effectiveStart, weekStartDay);

      // If the effective start is after the week start, move to next week
      if (effectiveStart > checkWeekStart) {
        checkWeekStart.setDate(checkWeekStart.getDate() + 7);
      }

      while (checkWeekStart <= rangeEnd) {
        const weekKey = checkWeekStart.toISOString().split('T')[0];
        const completions = weekCompletions.get(weekKey) || 0;

        // Only count weeks that have ended, unless it's the current week
        const weekEnd = new Date(checkWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const isCurrentWeek = weekKey === currentWeekKey;
        const weekHasEnded = weekEnd < today;

        if (weekHasEnded || isCurrentWeek) {
          totalWeeks++;
          if (completions >= targetPerWeek) {
            successfulWeeks++;
          }
        }

        checkWeekStart.setDate(checkWeekStart.getDate() + 7);
      }

      return {
        completed: successfulWeeks,
        total: totalWeeks,
        percent: totalWeeks > 0 ? Math.round((successfulWeeks / totalWeeks) * 100) : 0,
      };
    };

    return {
      thisWeek,
      thisMonth: countWeeksInRange(startOfMonth, today),
      allTime: countWeeksInRange(habitCreatedAt, today),
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

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const habitLogsDB = new HabitLogsDB();
