import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task, TaskInsert, TaskUpdate, TaskFilters } from './types';
import { getLocalDateString } from '@/lib/utils';

export class TasksDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all tasks for a user with optional filtering
   */
  async getUserTasks(userId: string, filters?: TaskFilters): Promise<Task[]> {
    let query = this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.is_completed !== undefined) {
        query = query.eq('is_completed', filters.is_completed);
      }
      if (filters.priority !== undefined) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.due_date) {
        query = query.eq('due_date', filters.due_date);
      }
      if (filters.has_due_date !== undefined) {
        query = filters.has_due_date
          ? query.not('due_date', 'is', null)
          : query.is('due_date', null);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Count tasks for a user with optional filtering (HEAD-only, no row data transferred)
   */
  async getTaskCount(userId: string, filters?: TaskFilters): Promise<number> {
    let query = this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (filters) {
      if (filters.is_completed !== undefined) {
        query = query.eq('is_completed', filters.is_completed);
      }
      if (filters.priority !== undefined) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.due_date) {
        query = query.eq('due_date', filters.due_date);
      }
      if (filters.has_due_date !== undefined) {
        query = filters.has_due_date
          ? query.not('due_date', 'is', null)
          : query.is('due_date', null);
      }
    }

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string, userId: string): Promise<Task | null> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  /**
   * Create a new task
   */
  async createTask(task: TaskInsert): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, userId: string, updates: TaskUpdate): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Toggle task completion status
   */
  async toggleTaskCompletion(taskId: string, userId: string): Promise<Task> {
    // Get current status
    const task = await this.getTask(taskId, userId);
    if (!task) throw new Error('Task not found');

    // Toggle completion
    const updates: TaskUpdate = {
      is_completed: !task.is_completed,
      completed_at: !task.is_completed ? new Date().toISOString() : null,
    };

    return this.updateTask(taskId, userId, updates);
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Get today's tasks (due today or overdue), both completed and incomplete.
   * @param userId - The user's ID
   * @param date - Client-local date string (YYYY-MM-DD) to avoid timezone mismatch
   */
  async getTodayTasks(userId: string, date: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .lte('due_date', date)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get upcoming tasks (due in the future)
   * @param userId - The user's ID
   * @param date - Client-local date string (YYYY-MM-DD) to avoid timezone mismatch
   * @param days - Number of days to look ahead (default 7)
   */
  async getUpcomingTasks(userId: string, date: string, days: number = 7): Promise<Task[]> {
    const [year, month, day] = date.split('-').map(Number);
    const futureDate = new Date(year, month - 1, day + days);
    const future = getLocalDateString(futureDate);

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .gt('due_date', date)
      .lte('due_date', future)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get overdue tasks
   * @param userId - The user's ID
   * @param date - Client-local date string (YYYY-MM-DD) to avoid timezone mismatch
   */
  async getOverdueTasks(userId: string, date: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .lt('due_date', date)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const tasksDB = new TasksDB(createClient());
