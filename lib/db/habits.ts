import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Habit, HabitInsert, HabitUpdate, HabitFilters, HabitWithTodayStatus } from './types';

export class HabitsDB {
  private supabase: SupabaseClient;

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
    const today = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

    // Create a set of completed habit IDs
    const completedHabitIds = new Set((logs || []).map(log => log.habit_id));

    // Add today status to each habit
    return habits.map(habit => ({
      ...habit,
      completed_today: completedHabitIds.has(habit.id),
    }));
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

export const habitsDB = new HabitsDB();
