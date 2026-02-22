import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecurringTask, RecurringTaskInsert, RecurringTaskUpdate, TaskUpdate } from './types';
import { ensureRecurringInstances } from '@/lib/recurring-tasks';
import { getNextOccurrence } from '@/lib/recurring-tasks/recurrence';

export class RecurringTasksDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserRecurringTasks(
    userId: string,
    filters?: { status?: RecurringTask['status'] }
  ): Promise<RecurringTask[]> {
    let query = this.supabase
      .from('recurring_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getRecurringTask(id: string, userId: string): Promise<RecurringTask | null> {
    const { data, error } = await this.supabase
      .from('recurring_tasks')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createRecurringTask(
    data: RecurringTaskInsert,
    throughDate: string
  ): Promise<RecurringTask> {
    // Set next_generate_date to start_date so instances get generated immediately
    const insertData = {
      ...data,
      next_generate_date: data.start_date,
      instances_generated: 0,
    };

    const { data: created, error } = await this.supabase
      .from('recurring_tasks')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    // Generate initial instances through the rolling window
    await ensureRecurringInstances(this.supabase, data.user_id, throughDate);

    return created;
  }

  async updateRecurringTask(
    id: string,
    userId: string,
    updates: RecurringTaskUpdate
  ): Promise<RecurringTask> {
    const { data, error } = await this.supabase
      .from('recurring_tasks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async archiveRecurringTask(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('recurring_tasks')
      .update({ status: 'archived' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async deleteRecurringTask(id: string, userId: string): Promise<void> {
    // Delete all future incomplete instances first
    const { error: instancesErr } = await this.supabase
      .from('tasks')
      .delete()
      .eq('recurring_task_id', id)
      .eq('user_id', userId)
      .eq('is_completed', false);

    if (instancesErr) throw instancesErr;

    // Delete the template
    const { error } = await this.supabase
      .from('recurring_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async pauseRecurringTask(id: string, userId: string): Promise<RecurringTask> {
    return this.updateRecurringTask(id, userId, { status: 'paused' });
  }

  async resumeRecurringTask(
    id: string,
    userId: string,
    todayDate: string,
    throughDate: string
  ): Promise<RecurringTask> {
    const template = await this.getRecurringTask(id, userId);
    if (!template) throw new Error('Recurring task not found');

    // Compute next occurrence from today
    const nextOccurrence = getNextOccurrence(
      template.recurrence_rule,
      template.start_date,
      todayDate
    );

    // Use supabase directly since next_generate_date is a bookkeeping field
    // excluded from RecurringTaskUpdate
    const { data: updated, error } = await this.supabase
      .from('recurring_tasks')
      .update({
        status: 'active',
        next_generate_date: nextOccurrence ?? todayDate,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Generate instances for the rolling window
    await ensureRecurringInstances(this.supabase, userId, throughDate);

    return updated;
  }

  /**
   * Handle edit/delete scope for recurring task instances.
   * scope: 'this' | 'following' | 'all'
   */
  async updateInstanceWithScope(
    taskId: string,
    userId: string,
    scope: 'this' | 'following' | 'all',
    updates: TaskUpdate
  ): Promise<void> {
    const { data: task, error: fetchErr } = await this.supabase
      .from('tasks')
      .select('*, recurring_tasks(*)')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    if (!task || !task.recurring_task_id) {
      throw new Error('Task not found or not part of a recurring series');
    }

    switch (scope) {
      case 'this': {
        // Update just this instance and mark as exception
        const { error: updateErr } = await this.supabase
          .from('tasks')
          .update({ ...updates, is_exception: true })
          .eq('id', taskId)
          .eq('user_id', userId);
        if (updateErr) throw updateErr;
        break;
      }
      case 'following': {
        // Update the template from this date forward
        const templateUpdates: RecurringTaskUpdate = {};
        if (updates.title !== undefined) templateUpdates.title = updates.title;
        if (updates.description !== undefined) templateUpdates.description = updates.description;
        if (updates.priority !== undefined) templateUpdates.priority = updates.priority;
        if (updates.category_id !== undefined) templateUpdates.category_id = updates.category_id;
        if (updates.due_time !== undefined) templateUpdates.due_time = updates.due_time;

        if (Object.keys(templateUpdates).length > 0) {
          await this.updateRecurringTask(task.recurring_task_id, userId, templateUpdates);
        }

        // Update all future incomplete instances (from this task's original_date onward)
        if (task.original_date) {
          const { error: updateErr } = await this.supabase
            .from('tasks')
            .update(updates)
            .eq('recurring_task_id', task.recurring_task_id)
            .eq('user_id', userId)
            .eq('is_completed', false)
            .eq('is_exception', false)
            .gte('original_date', task.original_date);
          if (updateErr) throw updateErr;
        }
        break;
      }
      case 'all': {
        // Update template
        const templateUpdates: RecurringTaskUpdate = {};
        if (updates.title !== undefined) templateUpdates.title = updates.title;
        if (updates.description !== undefined) templateUpdates.description = updates.description;
        if (updates.priority !== undefined) templateUpdates.priority = updates.priority;
        if (updates.category_id !== undefined) templateUpdates.category_id = updates.category_id;
        if (updates.due_time !== undefined) templateUpdates.due_time = updates.due_time;

        if (Object.keys(templateUpdates).length > 0) {
          await this.updateRecurringTask(task.recurring_task_id, userId, templateUpdates);
        }

        // Update all future incomplete non-exception instances
        const { error: updateErr } = await this.supabase
          .from('tasks')
          .update(updates)
          .eq('recurring_task_id', task.recurring_task_id)
          .eq('user_id', userId)
          .eq('is_completed', false)
          .eq('is_exception', false);
        if (updateErr) throw updateErr;
        break;
      }
    }
  }

  async deleteInstanceWithScope(
    taskId: string,
    userId: string,
    scope: 'this' | 'following' | 'all'
  ): Promise<void> {
    const { data: task, error: fetchErr } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    if (!task || !task.recurring_task_id) {
      throw new Error('Task not found or not part of a recurring series');
    }

    switch (scope) {
      case 'this': {
        // Delete just this instance
        const { error: delErr } = await this.supabase
          .from('tasks')
          .delete()
          .eq('id', taskId)
          .eq('user_id', userId);
        if (delErr) throw delErr;
        break;
      }
      case 'following': {
        if (!task.original_date) {
          throw new Error('Cannot delete following instances: task has no original_date');
        }
        // Delete this and all future incomplete instances
        const { error: delErr } = await this.supabase
          .from('tasks')
          .delete()
          .eq('recurring_task_id', task.recurring_task_id)
          .eq('user_id', userId)
          .eq('is_completed', false)
          .gte('original_date', task.original_date);
        if (delErr) throw delErr;

        // Set template end_date to the day before this instance
        const [y, m, d] = task.original_date.split('-').map(Number);
        const prevDay = new Date(y, m - 1, d - 1);
        const endDate = [
          prevDay.getFullYear(),
          String(prevDay.getMonth() + 1).padStart(2, '0'),
          String(prevDay.getDate()).padStart(2, '0'),
        ].join('-');
        await this.updateRecurringTask(task.recurring_task_id, userId, {
          end_type: 'on_date',
          end_date: endDate,
        });
        break;
      }
      case 'all': {
        // Delete all incomplete instances and archive template
        const { error: delAllErr } = await this.supabase
          .from('tasks')
          .delete()
          .eq('recurring_task_id', task.recurring_task_id)
          .eq('user_id', userId)
          .eq('is_completed', false);
        if (delAllErr) throw delAllErr;

        await this.archiveRecurringTask(task.recurring_task_id, userId);
        break;
      }
    }
  }
}
