/**
 * Database utilities for Habit operations
 */

import { createClient } from '@/lib/supabase/client';
import type {
  Habit,
  InsertHabit,
  UpdateHabit,
  HabitLog,
  InsertHabitLog,
  Streak,
} from '@/lib/types/database';

export class HabitsDB {
  private supabase = createClient();

  /**
   * Get all active habits for a user
   */
  async getUserHabits(userId: string): Promise<Habit[]> {
    const { data, error } = await this.supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
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
  async createHabit(habit: InsertHabit): Promise<Habit> {
    const { data, error } = await this.supabase
      .from('habits')
      .insert(habit)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update an existing habit
   */
  async updateHabit(
    habitId: string,
    userId: string,
    updates: UpdateHabit
  ): Promise<Habit> {
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
   * Archive a habit (soft delete)
   */
  async archiveHabit(habitId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('habits')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', habitId)
      .eq('user_id', userId);

    if (error) throw error;
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
   * Log a habit completion
   */
  async logHabit(log: InsertHabitLog): Promise<HabitLog> {
    const { data, error } = await this.supabase
      .from('habit_logs')
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get habit logs for a specific date range
   */
  async getHabitLogs(
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
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get today's logs for all user habits
   */
  async getTodayLogs(userId: string): Promise<HabitLog[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await this.supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', today);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get streak for a habit
   */
  async getStreak(habitId: string, userId: string): Promise<Streak | null> {
    const { data, error } = await this.supabase
      .from('streaks')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * Get habits with category info
   */
  async getHabitsWithCategories(userId: string) {
    const { data, error } = await this.supabase
      .from('habits')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

// Export singleton instance
export const habitsDB = new HabitsDB();
