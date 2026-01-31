import { createClient } from '@/lib/supabase/client';
import type { Task, TaskInsert, TaskUpdate, TaskFilters } from './types';

export class TasksDB {
  private supabase = createClient();

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
   * Get today's tasks (due today or overdue)
   */
  async getTodayTasks(userId: string): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .lte('due_date', today)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get upcoming tasks (due in the future)
   */
  async getUpcomingTasks(userId: string, days: number = 7): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const future = futureDate.toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .gt('due_date', today)
      .lte('due_date', future)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(userId: string): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

export const tasksDB = new TasksDB();
