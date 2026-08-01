import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RecurringTask,
  RecurringTaskInsert,
  RecurringTaskUpdate,
  TaskSection,
  TaskUpdate,
} from './types';
import { ensureRecurringInstances } from '@/lib/recurring-tasks';
import { getNextOccurrence } from '@/lib/recurring-tasks/recurrence';
import type {
  LifecycleOutcome,
  OccurrenceOverrides,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
  ReviseSeriesRequest,
} from '@/lib/recurring-tasks/lifecycle';
import { addLocalDays } from '@/lib/recurring-tasks/recurrence';

export interface RecurringTaskLifecycleAdapter extends RecurringTaskLifecyclePort {
  listSeries?(
    userId: string,
    status?: 'active' | 'paused' | 'ended',
  ): Promise<{ series: RecurringTaskSeries[] }>;
}

export interface RecurringTasksDBOptions {
  lifecycle?: RecurringTaskLifecycleAdapter;
  timeZone?: string;
  effectiveDate?: () => string;
}

export class RecurringTasksDB {
  constructor(
    private supabase: SupabaseClient,
    private readonly options: RecurringTasksDBOptions = {},
  ) {}

  async getUserRecurringTasks(
    userId: string,
    filters?: { status?: RecurringTask['status'] }
  ): Promise<RecurringTask[]> {
    if (this.options.lifecycle?.listSeries) {
      const result = await this.options.lifecycle.listSeries(
        userId,
        filters?.status === 'archived'
          ? 'ended'
          : filters?.status,
      );
      return result.series
        .filter((series) =>
          filters?.status
            ? legacyStatus(series) === filters.status
            : true,
        )
        .map(recurringTaskFromSeries);
    }

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
    if (this.options.lifecycle) {
      const result = await this.options.lifecycle.getSeries(userId, id);
      if (result.status === 'not-found') return null;
      return recurringTaskFromLifecycleOutcome(result);
    }

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
    if (this.options.lifecycle) {
      const result = await this.options.lifecycle.createSeries({
        userId: data.user_id,
        recurrenceRule: data.recurrence_rule,
        recurrenceAnchor: data.start_date,
        activationDate: data.start_date,
        timeZone: this.options.timeZone,
        defaults: {
          title: data.title,
          description: data.description,
          priority: data.priority as 0 | 1 | 2 | 3,
          categoryId: data.category_id,
          dueTime: data.due_time,
        },
        occurrenceLimit: data.end_type === 'after_count'
          ? data.end_count
          : null,
        lastScheduledDate: data.end_type === 'on_date'
          ? data.end_date
          : null,
        coverage: { from: data.start_date, to: throughDate },
      });
      return recurringTaskFromLifecycleOutcome(result);
    }

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
    if (this.options.lifecycle) {
      const current = await this.options.lifecycle.getSeries(userId, id);
      const currentSeries = requireLifecycleSeries(current);
      const explicitEffectiveDate = this.options.effectiveDate?.();
      const revisionRequest: ReviseSeriesRequest = {
        userId,
        seriesId: id,
        effectiveDate: explicitEffectiveDate,
        timeZone: this.options.timeZone,
        recurrenceRule: updates.recurrence_rule,
        defaults: legacyDefaultsPatch(updates),
        ...(updates.end_type === 'after_count'
          ? { occurrenceLimit: updates.end_count ?? null, lastScheduledDate: null }
          : updates.end_type === 'on_date'
            ? { occurrenceLimit: null, lastScheduledDate: updates.end_date ?? null }
            : updates.end_type === 'never'
              ? { occurrenceLimit: null, lastScheduledDate: null }
              : {}),
        endType: updates.end_type,
        coverage: explicitEffectiveDate && currentSeries.coverageHorizon
          ? { from: explicitEffectiveDate, to: currentSeries.coverageHorizon }
          : undefined,
      };
      if (updates.status === 'paused') {
        return recurringTaskFromLifecycleOutcome(
          await this.options.lifecycle.pauseSeries({
            userId,
            seriesId: id,
            effectiveDate: explicitEffectiveDate,
            timeZone: this.options.timeZone,
          }),
        );
      }
      if (updates.status === 'archived') {
        return recurringTaskFromLifecycleOutcome(
          await this.options.lifecycle.endSeries({
            userId,
            seriesId: id,
            effectiveDate: explicitEffectiveDate,
            timeZone: this.options.timeZone,
          }),
        );
      }
      if (updates.status === 'active' && currentSeries.status === 'paused') {
        return recurringTaskFromLifecycleOutcome(
          await this.options.lifecycle.resumeSeries({
            userId,
            seriesId: id,
            effectiveDate: explicitEffectiveDate,
            timeZone: this.options.timeZone,
          }),
        );
      }
      return recurringTaskFromLifecycleOutcome(
        await this.options.lifecycle.reviseSeries(revisionRequest),
      );
    }

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
    if (this.options.lifecycle) {
      await this.options.lifecycle.endSeries({
        userId,
        seriesId: id,
        effectiveDate: this.options.effectiveDate?.(),
        timeZone: this.options.timeZone,
      });
      return;
    }

    const { error } = await this.supabase
      .from('recurring_tasks')
      .update({ status: 'archived' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async deleteRecurringTask(id: string, userId: string): Promise<void> {
    if (this.options.lifecycle) {
      await this.options.lifecycle.endSeries({
        userId,
        seriesId: id,
        effectiveDate: this.options.effectiveDate?.(),
        timeZone: this.options.timeZone,
      });
      return;
    }

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
    if (this.options.lifecycle) {
      return recurringTaskFromLifecycleOutcome(
        await this.options.lifecycle.pauseSeries({
          userId,
          seriesId: id,
          effectiveDate: this.options.effectiveDate?.(),
          timeZone: this.options.timeZone,
        }),
      );
    }
    return this.updateRecurringTask(id, userId, { status: 'paused' });
  }

  async resumeRecurringTask(
    id: string,
    userId: string,
    todayDate?: string,
    throughDate?: string,
  ): Promise<RecurringTask> {
    if (this.options.lifecycle) {
      return recurringTaskFromLifecycleOutcome(
        await this.options.lifecycle.resumeSeries({
          userId,
          seriesId: id,
          effectiveDate: todayDate,
          timeZone: this.options.timeZone,
          coverage: todayDate && throughDate
            ? { from: todayDate, to: throughDate }
            : undefined,
        }),
      );
    }

    if (!todayDate || !throughDate) {
      throw new Error('A resume date and coverage horizon are required');
    }

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
    if (this.options.lifecycle) {
      const { data: task, error } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      const seriesId = task?.recurring_series_id ?? task?.recurring_task_id;
      if (!task || !seriesId) {
        throw new Error('Task not found or not part of a recurring series');
      }
      const series = requireLifecycleSeries(
        await this.options.lifecycle.getSeries(userId, seriesId),
      );
      const occurrence = series.occurrences.find(
        (candidate) =>
          candidate.id === task.recurring_occurrence_id
          || candidate.taskId === taskId
          || candidate.scheduledDate === task.scheduled_date
          || candidate.scheduledDate === task.original_date,
      );
      if (!occurrence) {
        throw new Error('Task occurrence not found');
      }
      const completed = updates.is_completed
        ?? (updates.status === 'done'
          ? true
          : updates.status === 'todo'
            ? false
            : undefined);
      const occurrenceUpdates = legacyOccurrenceOverrides(updates);
      if (scope === 'this') {
        const completionOnly = completed !== undefined
          && Object.keys(updates).every((key) =>
            key === 'is_completed' || key === 'status' || key === 'completed_at'
          )
          && (updates.status === undefined
            || updates.status === (completed ? 'done' : 'todo'));
        if (completionOnly) {
          const result = completed
            ? await this.options.lifecycle.completeOccurrence({
              userId,
              seriesId,
              occurrenceId: occurrence.id,
              timeZone: this.options.timeZone,
            })
            : await this.options.lifecycle.reopenOccurrence({
              userId,
              seriesId,
              occurrenceId: occurrence.id,
              timeZone: this.options.timeZone,
            });
          requireLifecycleSeries(result);
        } else {
          requireLifecycleSeries(
            await this.options.lifecycle.editOccurrence({
              userId,
              seriesId,
              occurrenceId: occurrence.id,
              timeZone: this.options.timeZone,
              updates: occurrenceUpdates,
              completed,
            }),
          );
        }
        return;
      }
      requireLifecycleSeries(
        await this.options.lifecycle.reviseSeries({
          userId,
          seriesId,
          effectiveDate: occurrence.scheduledDate,
          scope,
          timeZone: this.options.timeZone,
          defaults: legacyDefaultsPatch(updates),
          coverage: series.coverageHorizon
            ? { from: occurrence.scheduledDate, to: series.coverageHorizon }
            : undefined,
        }),
      );
      return;
    }

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
    if (this.options.lifecycle) {
      const { data: task, error } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      const seriesId = task?.recurring_series_id ?? task?.recurring_task_id;
      if (!task || !seriesId) {
        throw new Error('Task not found or not part of a recurring series');
      }
      const series = requireLifecycleSeries(
        await this.options.lifecycle.getSeries(userId, seriesId),
      );
      const occurrence = series.occurrences.find(
        (candidate) =>
          candidate.id === task.recurring_occurrence_id
          || candidate.taskId === taskId
          || candidate.scheduledDate === task.scheduled_date
          || candidate.scheduledDate === task.original_date,
      );
      if (!occurrence) throw new Error('Task occurrence not found');
      if (scope === 'this') {
        requireLifecycleSeries(
          await this.options.lifecycle.skipOccurrence({
            userId,
            seriesId,
            occurrenceId: occurrence.id,
            timeZone: this.options.timeZone,
          }),
        );
        return;
      }
      requireLifecycleSeries(
        await this.options.lifecycle.endSeries({
          userId,
          seriesId,
          effectiveDate: occurrence.scheduledDate,
          timeZone: this.options.timeZone,
        }),
      );
      return;
    }

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

function requireLifecycleSeries(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): RecurringTaskSeries {
  if (outcome.status === 'complete' || outcome.status === 'already-applied') {
    return outcome.series;
  }
  if (outcome.status === 'not-found') {
    throw new Error('Recurring task not found');
  }
  if (outcome.status === 'invalid-transition') {
    throw new Error(outcome.reason);
  }
  if (outcome.status === 'conflict') {
    throw new Error('Recurring task changed concurrently');
  }
  throw new Error(String(outcome.reason));
}

function recurringTaskFromLifecycleOutcome(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): RecurringTask {
  return recurringTaskFromSeries(requireLifecycleSeries(outcome));
}

function legacyStatus(
  series: RecurringTaskSeries,
): RecurringTask['status'] {
  return series.status === 'ended' ? 'archived' : series.status;
}

export function recurringTaskFromSeries(series: RecurringTaskSeries): RecurringTask {
  const revision = series.revisions.find(
    (candidate) => candidate.id === series.currentRevisionId,
  ) ?? series.revisions[series.revisions.length - 1];
  const defaults = revision?.defaults ?? {
    title: '',
    description: null,
    priority: 0 as const,
    categoryId: null,
    dueTime: null,
  };
  const endType = series.occurrenceLimit !== null
    ? 'after_count'
    : series.lastScheduledDate !== null
      ? 'on_date'
      : 'never';
  return {
    id: series.id,
    user_id: series.userId,
    title: defaults.title,
    description: defaults.description,
    priority: defaults.priority,
    category_id: defaults.categoryId,
    due_time: defaults.dueTime,
    recurrence_rule: revision?.recurrenceRule ?? {
      frequency: 'daily',
      interval: 1,
    },
    start_date: series.recurrenceAnchor,
    end_type: endType,
    end_date: series.lastScheduledDate,
    end_count: series.occurrenceLimit,
    instances_generated: series.occurrences.filter(
      (occurrence) => occurrence.state !== 'withdrawn',
    ).length,
    next_generate_date: series.coverageHorizon
      ? addLocalDays(series.coverageHorizon, 1)
      : null,
    status: legacyStatus(series),
    created_at: series.createdAt,
    updated_at: series.updatedAt,
  };
}

type LegacyDefaultUpdates = {
  title?: string;
  description?: string | null;
  priority?: 0 | 1 | 2 | 3;
  category_id?: string | null;
  due_time?: string | null;
  sort_order?: number;
  section?: TaskSection;
  project_id?: string | null;
};

function legacyDefaultsPatch(
  updates: LegacyDefaultUpdates,
): Partial<{
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  categoryId: string | null;
  dueTime: string | null;
  sortOrder: number;
  section: TaskSection;
  projectId: string | null;
}> {
  return {
    ...(updates.title === undefined ? {} : { title: updates.title }),
    ...(updates.description === undefined
      ? {}
      : { description: updates.description }),
    ...(updates.priority === undefined ? {} : { priority: updates.priority }),
    ...(updates.category_id === undefined
      ? {}
      : { categoryId: updates.category_id }),
    ...(updates.due_time === undefined ? {} : { dueTime: updates.due_time }),
    ...(updates.sort_order === undefined ? {} : { sortOrder: updates.sort_order }),
    ...(updates.section === undefined ? {} : { section: updates.section }),
    ...(updates.project_id === undefined ? {} : { projectId: updates.project_id }),
  };
}

function legacyOccurrenceOverrides(
  updates: TaskUpdate,
): OccurrenceOverrides {
  return {
    ...(updates.title === undefined ? {} : { title: updates.title }),
    ...(updates.description === undefined
      ? {}
      : { description: updates.description }),
    ...(updates.priority === undefined ? {} : { priority: updates.priority }),
    ...(updates.category_id === undefined
      ? {}
      : { categoryId: updates.category_id }),
    ...(updates.due_time === undefined ? {} : { dueTime: updates.due_time }),
    ...(updates.due_date === undefined ? {} : { dueDate: updates.due_date }),
    ...(updates.status === undefined ? {} : { status: updates.status }),
    ...(updates.section === undefined ? {} : { section: updates.section }),
    ...(updates.project_id === undefined
      ? {}
      : { projectId: updates.project_id }),
    ...(updates.sort_order === undefined
      ? {}
      : { sortOrder: updates.sort_order }),
  };
}
