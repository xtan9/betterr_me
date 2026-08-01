import type {
  Task,
  TaskInsert,
  TaskUpdate,
} from '@/lib/db/types';
import type {
  TaskFormValues,
  TaskUpdateValues,
} from '@/lib/validations/task';
import type { EditScope } from '@/lib/validations/recurring-task';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RecurringTasksDB, TasksDB } from '@/lib/db';
import type { RecurringTaskLifecycleAdapter } from '@/lib/db/recurring-tasks';
import { getBottomSortOrder } from './sort-order';
import type {
  LifecycleOutcome,
  OccurrenceOverrides,
  RecurringTaskLifecyclePort,
} from '@/lib/recurring-tasks/lifecycle';

export interface TaskWritePersistence {
  getMaxSortOrder(userId: string): Promise<number | null>;
  createTask(task: TaskInsert): Promise<Task>;
  getTask(taskId: string, userId: string): Promise<Task | null>;
  updateTask(taskId: string, userId: string, updates: TaskUpdate): Promise<Task>;
  updateInstanceWithScope?(
    taskId: string,
    userId: string,
    scope: EditScope,
    updates: TaskUpdate,
  ): Promise<void>;
  lifecycle?: Pick<
    RecurringTaskLifecyclePort,
    'editOccurrence' | 'completeOccurrence' | 'reopenOccurrence'
  >;
}

export type TaskWriteIntent =
  | { type: 'create'; userId: string; values: TaskFormValues }
  | { type: 'update'; userId: string; taskId: string; values: TaskUpdateValues; scope?: EditScope }
  | { type: 'toggle-completion'; userId: string; taskId: string }
  | { type: 'order'; userId: string; taskId: string; sortOrder: number };

export type TaskWriteOutcome =
  | { type: 'created' | 'updated' | 'toggled' | 'ordered'; task: Task }
  | { type: 'scoped-updated' };

type Clock = () => Date;

export function createTaskWrites(
  supabase: SupabaseClient,
  options: {
    scopedUpdates?: boolean;
    lifecycle?: RecurringTaskLifecycleAdapter;
  } = {},
): TaskWrites {
  const tasksDB = new TasksDB(supabase);
  const recurringTasksDB = options.scopedUpdates
    ? new RecurringTasksDB(supabase, {
      lifecycle: options.lifecycle,
    })
    : null;

  return new TaskWrites({
    async getMaxSortOrder(userId) {
      const { data, error } = await supabase
        .from('tasks')
        .select('sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.sort_order ?? null;
    },
    createTask: tasksDB.createTask.bind(tasksDB),
    getTask: tasksDB.getTask.bind(tasksDB),
    updateTask: tasksDB.updateTask.bind(tasksDB),
    updateInstanceWithScope: recurringTasksDB
      ? recurringTasksDB.updateInstanceWithScope.bind(recurringTasksDB)
      : undefined,
    lifecycle: options.lifecycle,
  });
}

export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'TaskNotFoundError';
  }
}

export class TaskWrites {
  constructor(
    private readonly persistence: TaskWritePersistence,
    private readonly now: Clock = () => new Date(),
  ) {}

  async execute(
    intent: Extract<TaskWriteIntent, { type: 'create' }>,
  ): Promise<{ type: 'created'; task: Task }>;
  async execute(
    intent: Extract<TaskWriteIntent, { type: 'update' }> & { scope: EditScope },
  ): Promise<{ type: 'scoped-updated' }>;
  async execute(
    intent: Extract<TaskWriteIntent, { type: 'update' }> & { scope?: undefined },
  ): Promise<{ type: 'updated'; task: Task }>;
  async execute(
    intent: Extract<TaskWriteIntent, { type: 'toggle-completion' }>,
  ): Promise<{ type: 'toggled'; task: Task }>;
  async execute(
    intent: Extract<TaskWriteIntent, { type: 'order' }>,
  ): Promise<{ type: 'ordered'; task: Task }>;
  async execute(intent: TaskWriteIntent): Promise<TaskWriteOutcome> {
    if (intent.type === 'order') {
      if (this.persistence.lifecycle) {
        const current = await this.persistence.getTask(intent.taskId, intent.userId);
        if (!current) {
          const task = await this.persistence.updateTask(intent.taskId, intent.userId, {
            sort_order: intent.sortOrder,
          });
          return { type: 'ordered', task };
        }
        if (current.recurring_series_id && current.recurring_occurrence_id) {
          assertLifecycleSuccess(await this.persistence.lifecycle.editOccurrence({
            userId: intent.userId,
            seriesId: current.recurring_series_id,
            occurrenceId: current.recurring_occurrence_id,
            updates: { sortOrder: intent.sortOrder },
          }));
          const task = await this.persistence.getTask(intent.taskId, intent.userId);
          if (!task) throw new TaskNotFoundError();
          return { type: 'ordered', task };
        }
      }
      const task = await this.persistence.updateTask(intent.taskId, intent.userId, {
        sort_order: intent.sortOrder,
      });
      return { type: 'ordered', task };
    }

    if (intent.type === 'toggle-completion') {
      const current = await this.persistence.getTask(intent.taskId, intent.userId);
      if (!current) throw new TaskNotFoundError();
      if (
        current.recurring_series_id
        && current.recurring_occurrence_id
        && this.persistence.lifecycle
      ) {
        const request = {
          userId: intent.userId,
          seriesId: current.recurring_series_id,
          occurrenceId: current.recurring_occurrence_id,
        };
        const result = current.is_completed
          ? await this.persistence.lifecycle.reopenOccurrence(request)
          : await this.persistence.lifecycle.completeOccurrence(request);
        assertLifecycleSuccess(result);
        const task = await this.persistence.getTask(intent.taskId, intent.userId);
        if (!task) throw new TaskNotFoundError();
        return { type: 'toggled', task };
      }
      const task = await this.persistence.updateTask(
        intent.taskId,
        intent.userId,
        this.prepareUpdate({ is_completed: !current.is_completed }),
      );
      return { type: 'toggled', task };
    }

    if (intent.type === 'update') {
      const updates = this.prepareUpdate(intent.values);
      if (intent.scope) {
        if (!this.persistence.updateInstanceWithScope) {
          throw new Error('Scoped task updates are not supported by this persistence');
        }
        await this.persistence.updateInstanceWithScope(
          intent.taskId,
          intent.userId,
          intent.scope,
          updates,
        );
        return { type: 'scoped-updated' };
      }
      if (this.persistence.lifecycle) {
        const current = await this.persistence.getTask(intent.taskId, intent.userId);
        if (!current) {
          const task = await this.persistence.updateTask(
            intent.taskId,
            intent.userId,
            updates,
          );
          return { type: 'updated', task };
        }
        if (current.recurring_series_id && current.recurring_occurrence_id) {
          if (isCompletionSynchronizationOnly(updates)) {
            const request = {
              userId: intent.userId,
              seriesId: current.recurring_series_id,
              occurrenceId: current.recurring_occurrence_id,
            };
            const result = updates.is_completed
              ? await this.persistence.lifecycle.completeOccurrence(request)
              : await this.persistence.lifecycle.reopenOccurrence(request);
            assertLifecycleSuccess(result);
          } else {
            assertLifecycleSuccess(await this.persistence.lifecycle.editOccurrence({
              userId: intent.userId,
              seriesId: current.recurring_series_id,
              occurrenceId: current.recurring_occurrence_id,
              updates: taskUpdatesToOccurrenceOverrides(updates),
              completed: updates.is_completed,
            }));
          }
          const task = await this.persistence.getTask(intent.taskId, intent.userId);
          if (!task) throw new TaskNotFoundError();
          return { type: 'updated', task };
        }
      }
      const task = await this.persistence.updateTask(
        intent.taskId,
        intent.userId,
        updates,
      );
      return { type: 'updated', task };
    }

    if (intent.type === 'create') {
      const sortOrder = getBottomSortOrder(
        await this.persistence.getMaxSortOrder(intent.userId),
      );
      const status = intent.values.status ?? 'todo';
      const isCompleted = status === 'done';
      const task = await this.persistence.createTask({
        user_id: intent.userId,
        title: intent.values.title.trim(),
        description: intent.values.description?.trim() || null,
        is_completed: isCompleted,
        priority: intent.values.priority ?? 0,
        category_id: intent.values.category_id ?? null,
        due_date: intent.values.due_date || null,
        due_time: intent.values.due_time || null,
        completion_difficulty: intent.values.completion_difficulty ?? null,
        status,
        section: intent.values.section ?? 'personal',
        project_id: intent.values.project_id ?? null,
        sort_order: sortOrder,
        completed_at: isCompleted ? this.now().toISOString() : null,
      });

      return { type: 'created', task };
    }

    throw new Error('Unsupported task write intent');
  }

  private prepareUpdate(values: TaskUpdateValues): TaskUpdate {
    const updates: TaskUpdate = {};

    if (values.title !== undefined) updates.title = values.title.trim();
    if (values.description !== undefined) {
      updates.description = values.description?.trim() || null;
    }
    if (values.is_completed !== undefined) updates.is_completed = values.is_completed;
    if (values.priority !== undefined) updates.priority = values.priority;
    if (values.category_id !== undefined) updates.category_id = values.category_id;
    if (values.due_date !== undefined) updates.due_date = values.due_date || null;
    if (values.due_time !== undefined) updates.due_time = values.due_time || null;
    if (values.completion_difficulty !== undefined) {
      updates.completion_difficulty = values.completion_difficulty;
    }
    if (values.status !== undefined) updates.status = values.status;
    if (values.section !== undefined) updates.section = values.section;
    if (values.sort_order !== undefined) updates.sort_order = values.sort_order;
    if (values.project_id !== undefined) updates.project_id = values.project_id;

    if (updates.status !== undefined) {
      updates.is_completed = updates.status === 'done';
      updates.completed_at = updates.is_completed ? this.now().toISOString() : null;
    } else if (updates.is_completed !== undefined) {
      updates.status = updates.is_completed ? 'done' : 'todo';
      updates.completed_at = updates.is_completed ? this.now().toISOString() : null;
    }

    return updates;
  }
}

function taskUpdatesToOccurrenceOverrides(
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
    ...(updates.due_date === undefined ? {} : { dueDate: updates.due_date }),
    ...(updates.due_time === undefined ? {} : { dueTime: updates.due_time }),
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

function isCompletionSynchronizationOnly(updates: TaskUpdate): boolean {
  return typeof updates.is_completed === 'boolean'
    && updates.status === (updates.is_completed ? 'done' : 'todo')
    && Object.keys(updates).every((key) =>
      key === 'is_completed' || key === 'status' || key === 'completed_at'
    );
}

function assertLifecycleSuccess<T>(
  outcome: LifecycleOutcome<T>,
): Extract<LifecycleOutcome<T>, { status: 'complete' | 'already-applied' }> {
  if (outcome.status === 'complete' || outcome.status === 'already-applied') {
    return outcome as Extract<LifecycleOutcome<T>, {
      status: 'complete' | 'already-applied';
    }>;
  }
  if (outcome.status === 'conflict') {
    throw new Error(
      `Recurring task lifecycle conflict: expected revision ${outcome.expectedRevisionToken}, actual ${outcome.actualRevisionToken}`,
    );
  }
  if ('reason' in outcome) throw new Error(String(outcome.reason));
  throw new Error('Recurring task lifecycle mutation failed');
}
