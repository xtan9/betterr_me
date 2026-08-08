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
import { TasksDB } from '@/lib/db';
import { getBottomSortOrder } from './sort-order';
import type {
  LifecycleOutcome,
  OccurrenceOverrides,
  RecurringTaskLifecyclePort,
} from '@/lib/recurring-tasks/lifecycle';

export type TaskReminderType = 'relative' | 'absolute';
export type TaskReminderChannel = 'push' | 'email';
export type TaskReminderStatus = 'pending' | 'sent' | 'failed' | 'snoozed';

/**
 * Storage-independent Task Reminder Configuration intent. The complete
 * collection is supplied on every call; an empty collection removes pending
 * configuration while terminal delivery history remains untouched.
 */
export type TaskReminderInput =
  | {
      reminderType: 'relative';
      relativeMinutes: number;
      channels: readonly TaskReminderChannel[];
    }
  | {
      reminderType: 'absolute';
      absoluteTime: string;
      channels: readonly TaskReminderChannel[];
    };

export interface TaskReminderConfigurationRequest {
  userId: string;
  taskId: string;
  reminders: readonly TaskReminderInput[];
}

export interface TaskReminderConfigurationRecord {
  userId: string;
  taskId: string;
  reminders: Array<{
    reminderType: TaskReminderType;
    relativeMinutes: number | null;
    absoluteTime: string | null;
    channels: TaskReminderChannel[];
  }>;
}

export interface TaskReminderRecord {
  id: string;
  userId: string;
  taskId: string;
  reminderType: TaskReminderType;
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: TaskReminderChannel[];
  status: TaskReminderStatus;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
}

export type TaskReminderConfigurationPersistenceOutcome =
  | { type: 'configured'; reminders: TaskReminderRecord[] }
  | { type: 'removed'; reminders: [] }
  | { type: 'already-applied'; reminders: TaskReminderRecord[] }
  | { type: 'not-found' }
  | { type: 'conflict'; resource?: 'reminder'; reason?: string }
  | { type: 'invalid'; field: string; message: string };

export interface TaskReminderConfigurationPersistence {
  configureTaskReminders(
    record: TaskReminderConfigurationRecord,
  ): Promise<TaskReminderConfigurationPersistenceOutcome>;
}

/** Storage-independent, owner-scoped task deletion intent. */
export interface TaskDeletionRequest {
  userId: string;
  taskId: string;
  scope?: EditScope;
  effectiveDate?: string;
  operationId?: string;
}

/** Storage-independent recurring-series deletion intent. */
export interface TaskSeriesDeletionRequest {
  userId: string;
  seriesId: string;
  effectiveDate?: string;
}

export type TaskDeletionPersistenceOutcome =
  | { type: 'deleted' }
  | { type: 'not-found' };

export interface TaskDeletionPersistence {
  deleteTask(
    taskId: string,
    userId: string,
  ): Promise<TaskDeletionPersistenceOutcome>;
}

export type TaskDeletionOutcome =
  | TaskDeletionPersistenceOutcome
  | {
      type: 'invalid-transition';
      reason: string;
    }
  | {
      type: 'conflict';
      reason?: string;
      expectedRevisionToken?: number;
      actualRevisionToken?: number;
    }
  | {
      type: 'coverage-unavailable';
      requestedRange: { from: string; to: string };
      coverageHorizon: string | null;
      reason: string;
    };

export type TaskSeriesDeletionOutcome = TaskDeletionOutcome;

export type TaskDeletionPresentationContext =
  | 'task'
  | 'occurrence'
  | 'series';

export function taskDeletionErrorMessage(
  outcome: Exclude<TaskDeletionOutcome, { type: 'deleted' }>,
  context: TaskDeletionPresentationContext = 'task',
): string {
  switch (outcome.type) {
    case 'not-found':
      return context === 'series' ? 'Recurring task not found' : 'Task not found';
    case 'conflict':
      return context === 'series'
        ? 'Recurring task changed concurrently'
        : context === 'occurrence'
          ? 'Task occurrence conflict'
          : 'Task deletion conflict';
    case 'coverage-unavailable':
      return 'Recurring task coverage is temporarily unavailable';
    case 'invalid-transition':
      return outcome.reason;
  }
}

export function taskDeletionHttpFailure(
  outcome: Exclude<TaskDeletionOutcome, { type: 'deleted' }>,
  context: TaskDeletionPresentationContext = 'task',
): { error: string; status: 400 | 404 | 409 | 503 } {
  switch (outcome.type) {
    case 'not-found':
      return { error: taskDeletionErrorMessage(outcome, context), status: 404 };
    case 'conflict':
      return { error: taskDeletionErrorMessage(outcome, context), status: 409 };
    case 'coverage-unavailable':
      return { error: taskDeletionErrorMessage(outcome, context), status: 503 };
    case 'invalid-transition':
      return { error: taskDeletionErrorMessage(outcome, context), status: 400 };
  }
}

export interface TaskWritePersistence {
  getMaxSortOrder(userId: string): Promise<number | null>;
  createTask(task: TaskInsert): Promise<Task>;
  getTask(taskId: string, userId: string): Promise<Task | null>;
  updateTask(taskId: string, userId: string, updates: TaskUpdate): Promise<Task>;
  deleteTask?: TaskDeletionPersistence['deleteTask'];
  configureTaskReminders?: TaskReminderConfigurationPersistence['configureTaskReminders'];
  lifecycle?: Pick<
    RecurringTaskLifecyclePort,
    | 'editOccurrence'
    | 'completeOccurrence'
    | 'reopenOccurrence'
    | 'getSeries'
    | 'skipOccurrence'
    | 'endSeries'
    | 'deleteSeries'
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
    lifecycle?: Pick<
      RecurringTaskLifecyclePort,
      | 'editOccurrence'
      | 'completeOccurrence'
      | 'reopenOccurrence'
      | 'getSeries'
      | 'skipOccurrence'
      | 'endSeries'
      | 'deleteSeries'
    >;
  } = {},
): TaskWrites {
  const tasksDB = new TasksDB(supabase);
  const taskReminderPersistence = new SupabaseTaskReminderConfigurationPersistence(
    supabase,
  );

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
    async deleteTask(taskId, userId) {
      return (await tasksDB.deleteTask(taskId, userId))
        ? { type: 'deleted' }
        : { type: 'not-found' };
    },
    configureTaskReminders: taskReminderPersistence.configureTaskReminders.bind(
      taskReminderPersistence,
    ),
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

  async configureReminder(
    request: TaskReminderConfigurationRequest,
  ): Promise<TaskReminderConfigurationPersistenceOutcome> {
    return this.configureReminders(request);
  }

  async configureReminders(
    request: TaskReminderConfigurationRequest,
  ): Promise<TaskReminderConfigurationPersistenceOutcome> {
    const normalized = normalizeTaskReminderConfigurationRequest(request);
    if (!normalized.ok) {
      if ('outcome' in normalized) return normalized.outcome;
      return {
        type: 'invalid',
        field: normalized.field,
        message: normalized.message,
      };
    }
    if (!this.persistence.configureTaskReminders) {
      throw new Error('Task reminder configuration persistence is not configured');
    }
    return this.persistence.configureTaskReminders(normalized.value);
  }

  async delete(request: TaskDeletionRequest): Promise<TaskDeletionOutcome> {
    const normalized = normalizeTaskDeletionRequest(request);
    if (!normalized.userId || !normalized.taskId) return { type: 'not-found' };

    const task = await this.persistence.getTask(
      normalized.taskId,
      normalized.userId,
    );
    if (!task) return { type: 'not-found' };

    const recurring = isRecurringTask(task);
    if (!recurring) {
      if (normalized.scope !== undefined) {
        return {
          type: 'invalid-transition',
          reason: 'Recurring deletion scope requires a Task Occurrence',
        };
      }
      if (!this.persistence.deleteTask) {
        throw new Error('Task deletion persistence is not configured');
      }
      return this.persistence.deleteTask(
        normalized.taskId,
        normalized.userId,
      );
    }

    const seriesId = task.recurring_series_id;
    const occurrenceId = task.recurring_occurrence_id;
    if (!seriesId || !occurrenceId) {
      return {
        type: 'invalid-transition',
        reason: 'Recurring Task Occurrence metadata is incomplete',
      };
    }

    const scope = normalized.scope ?? 'this';
    const occurrenceState = task.recurrence_occurrence_state;
    if (occurrenceState === 'skipped' || occurrenceState === 'withdrawn') {
      return { type: 'not-found' };
    }

    if (scope === 'this') {
      if (task.is_completed || occurrenceState === 'completed') {
        return {
          type: 'invalid-transition',
          reason: 'Completed Task Occurrences retain history',
        };
      }
      if (!this.persistence.lifecycle?.skipOccurrence) {
        return {
          type: 'invalid-transition',
          reason: 'Recurring task deletion requires lifecycle persistence',
        };
      }
      return mapDeletionLifecycleOutcome(
        await this.persistence.lifecycle.skipOccurrence({
          userId: normalized.userId,
          seriesId,
          occurrenceId,
          ...(normalized.operationId
            ? { idempotencyKey: normalized.operationId }
            : {}),
        }),
      );
    }

    const scheduledDate = task.scheduled_date;
    if (!scheduledDate) {
      return {
        type: 'invalid-transition',
        reason: 'Recurring Task Occurrence is missing its Scheduled Date',
      };
    }
    if (
      !this.persistence.lifecycle?.getSeries
      || (!this.persistence.lifecycle.endSeries && !this.persistence.lifecycle.deleteSeries)
    ) {
      return {
        type: 'invalid-transition',
        reason: 'Recurring task deletion requires lifecycle persistence',
      };
    }

    const seriesOutcome = await this.persistence.lifecycle.getSeries(
      normalized.userId,
      seriesId,
    );
    if (seriesOutcome.status === 'not-found') return { type: 'not-found' };
    if (!isLifecycleSuccess(seriesOutcome)) {
      return mapDeletionLifecycleOutcome(seriesOutcome);
    }
    if (seriesOutcome.series.status === 'ended') return { type: 'not-found' };

    const effectiveDate = normalized.effectiveDate ?? scheduledDate;
    if (scope === 'all') {
      if (!this.persistence.lifecycle.deleteSeries) {
        return {
          type: 'invalid-transition',
          reason: 'Recurring task deletion requires lifecycle persistence',
        };
      }
      return mapDeletionLifecycleOutcome(
        await this.persistence.lifecycle.deleteSeries({
          userId: normalized.userId,
          seriesId,
          effectiveDate,
          ...(normalized.operationId
            ? { idempotencyKey: normalized.operationId }
            : {}),
        }),
      );
    }

    if (!this.persistence.lifecycle.endSeries) {
      return {
        type: 'invalid-transition',
        reason: 'Recurring task deletion requires lifecycle persistence',
      };
    }

    return mapDeletionLifecycleOutcome(
      await this.persistence.lifecycle.endSeries({
        userId: normalized.userId,
        seriesId,
        effectiveDate,
        ...(normalized.operationId
          ? { idempotencyKey: normalized.operationId }
          : {}),
      }),
    );
  }

  async deleteSeries(
    request: TaskSeriesDeletionRequest,
  ): Promise<TaskSeriesDeletionOutcome> {
    const userId = request.userId.trim();
    const seriesId = request.seriesId.trim();
    if (!userId || !seriesId) return { type: 'not-found' };
    if (!this.persistence.lifecycle?.getSeries || !this.persistence.lifecycle.deleteSeries) {
      throw new Error('Recurring series deletion requires lifecycle persistence');
    }

    const seriesOutcome = await this.persistence.lifecycle.getSeries(
      userId,
      seriesId,
    );
    if (seriesOutcome.status === 'not-found') return { type: 'not-found' };
    if (!isLifecycleSuccess(seriesOutcome)) {
      return mapDeletionLifecycleOutcome(seriesOutcome);
    }
    if (seriesOutcome.series.status === 'ended') return { type: 'not-found' };

    return mapDeletionLifecycleOutcome(
      await this.persistence.lifecycle.deleteSeries({
        userId,
        seriesId,
        ...(request.effectiveDate?.trim()
          ? { effectiveDate: request.effectiveDate.trim() }
          : {}),
      }),
    );
  }

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
        throw new Error(
          `Scoped task updates must use the Recurring Task Lifecycle adapter (scope: ${intent.scope})`,
        );
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

type TaskReminderInvalid = { ok: false; field: string; message: string };
type TaskReminderNormalized<T> = { ok: true; value: T } | TaskReminderInvalid;
type TaskReminderRequestNormalization =
  | { ok: true; value: TaskReminderConfigurationRecord }
  | TaskReminderInvalid
  | { ok: false; outcome: Extract<TaskReminderConfigurationPersistenceOutcome, { type: 'conflict' }> };

const TASK_REMINDER_CHANNELS = new Set<TaskReminderChannel>(['push', 'email']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTaskIdentity(
  value: unknown,
  field: 'userId' | 'taskId',
): TaskReminderNormalized<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      ok: false,
      field,
      message: field === 'userId'
        ? 'User identity is required'
        : 'Task identity is required',
    };
  }
  return { ok: true, value: value.trim() };
}

function normalizeTaskReminder(
  value: unknown,
  index: number,
): TaskReminderNormalized<TaskReminderConfigurationRecord['reminders'][number]> {
  if (!isRecord(value) || (value.reminderType !== 'relative' && value.reminderType !== 'absolute')) {
    return {
      ok: false,
      field: `reminders[${index}]`,
      message: 'Reminder type is invalid',
    };
  }
  if (!Array.isArray(value.channels) || value.channels.length === 0) {
    return {
      ok: false,
      field: `reminders[${index}].channels`,
      message: 'At least one reminder channel is required',
    };
  }

  const channels: TaskReminderChannel[] = [];
  for (const channel of value.channels) {
    if (!TASK_REMINDER_CHANNELS.has(channel as TaskReminderChannel)) {
      return {
        ok: false,
        field: `reminders[${index}].channels`,
        message: 'Reminder channel is invalid',
      };
    }
    if (channels.includes(channel as TaskReminderChannel)) {
      return {
        ok: false,
        field: `reminders[${index}].channels`,
        message: 'Reminder channels must be unique',
      };
    }
    channels.push(channel as TaskReminderChannel);
  }
  channels.sort();

  if (value.reminderType === 'relative') {
    if (
      typeof value.relativeMinutes !== 'number' ||
      !Number.isInteger(value.relativeMinutes) ||
      value.relativeMinutes < -525600 ||
      value.relativeMinutes > 525600
    ) {
      return {
        ok: false,
        field: `reminders[${index}].relativeMinutes`,
        message: 'relativeMinutes must be a whole number within one year',
      };
    }
    return {
      ok: true,
      value: {
        reminderType: 'relative',
        relativeMinutes: value.relativeMinutes,
        absoluteTime: null,
        channels,
      },
    };
  }

  if (
    typeof value.absoluteTime !== 'string' ||
    !value.absoluteTime.trim() ||
    Number.isNaN(Date.parse(value.absoluteTime))
  ) {
    return {
      ok: false,
      field: `reminders[${index}].absoluteTime`,
      message: 'absoluteTime must be a valid datetime',
    };
  }
  return {
    ok: true,
    value: {
      reminderType: 'absolute',
      relativeMinutes: null,
      absoluteTime: value.absoluteTime.trim(),
      channels,
    },
  };
}

function normalizeTaskReminderConfigurationRequest(
  request: TaskReminderConfigurationRequest,
): TaskReminderRequestNormalization {
  if (!isRecord(request)) {
    return { ok: false, field: 'request', message: 'Task reminder request is required' };
  }
  if ('sourceType' in request || 'source_type' in request) {
    return {
      ok: false,
      field: 'sourceType',
      message: 'Task reminder configuration cannot select another source',
    };
  }

  const userId = normalizeTaskIdentity(request.userId, 'userId');
  if (!userId.ok) return userId;
  const taskId = normalizeTaskIdentity(request.taskId, 'taskId');
  if (!taskId.ok) return taskId;
  if (!Array.isArray(request.reminders)) {
    return { ok: false, field: 'reminders', message: 'reminders must be an array' };
  }

  const reminders: TaskReminderConfigurationRecord['reminders'] = [];
  const seen = new Set<string>();
  for (const [index, input] of request.reminders.entries()) {
    const reminder = normalizeTaskReminder(input, index);
    if (!reminder.ok) return reminder;
    const fingerprint = JSON.stringify(reminder.value);
    if (seen.has(fingerprint)) {
      return {
        ok: false,
        outcome: {
          type: 'conflict',
          resource: 'reminder',
          reason: 'Duplicate reminder configuration',
        },
      };
    }
    seen.add(fingerprint);
    reminders.push(reminder.value);
  }

  return {
    ok: true,
    value: {
      userId: userId.value,
      taskId: taskId.value,
      reminders,
    },
  };
}

export class SupabaseTaskReminderConfigurationPersistence
  implements TaskReminderConfigurationPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  async configureTaskReminders(
    record: TaskReminderConfigurationRecord,
  ): Promise<TaskReminderConfigurationPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc('configure_task_reminders', {
      p_user_id: record.userId,
      p_task_id: record.taskId,
      p_reminders: record.reminders.map(toStoredTaskReminder),
    });

    if (error) {
      if (isTaskReminderConflictError(error)) {
        return { type: 'conflict', resource: 'reminder' };
      }
      if (isTaskReminderForeignKeyError(error)) return { type: 'not-found' };
      throw error;
    }
    return mapStoredTaskReminderConfigurationOutcome(data);
  }
}

function toStoredTaskReminder(
  reminder: TaskReminderConfigurationRecord['reminders'][number],
): Record<string, unknown> {
  return {
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
  };
}

function isTaskReminderConflictError(error: unknown): boolean {
  return isRecord(error) && error.code === '23505';
}

function isTaskReminderForeignKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === '23503';
}

function mapStoredTaskReminderConfigurationOutcome(
  value: unknown,
): TaskReminderConfigurationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid task reminder configuration outcome returned by the database');
  }
  if (value.type === 'not-found') return { type: 'not-found' };
  if (value.type === 'removed') return { type: 'removed', reminders: [] };
  if (value.type === 'conflict') {
    if (
      (value.resource === undefined || value.resource === 'reminder') &&
      (value.reason === undefined || typeof value.reason === 'string')
    ) {
      return {
        type: 'conflict',
        ...(value.resource === undefined ? {} : { resource: value.resource }),
        ...(value.reason === undefined ? {} : { reason: value.reason }),
      };
    }
  }
  if (
    value.type === 'invalid' &&
    typeof value.field === 'string' &&
    typeof value.message === 'string'
  ) {
    return { type: 'invalid', field: value.field, message: value.message };
  }
  if (
    (value.type === 'configured' || value.type === 'already-applied') &&
    Array.isArray(value.reminders)
  ) {
    return {
      type: value.type,
      reminders: value.reminders.map(toTaskReminderRecord),
    };
  }
  throw new Error('Invalid task reminder configuration outcome returned by the database');
}

function nullableTaskReminderString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  throw new Error(`Invalid task ${field} returned by the database`);
}

function requiredTaskReminderString(value: unknown, field: string): string {
  if (typeof value === 'string' && value) return value;
  throw new Error(`Invalid task ${field} returned by the database`);
}

function toTaskReminderRecord(value: unknown): TaskReminderRecord {
  if (!isRecord(value)) throw new Error('Invalid task reminder returned by the database');
  if (
    value.source_type !== 'task' ||
    (value.reminder_type !== 'relative' && value.reminder_type !== 'absolute') ||
    !Array.isArray(value.channels) ||
    value.channels.some((channel) => !TASK_REMINDER_CHANNELS.has(channel as TaskReminderChannel)) ||
    !['pending', 'sent', 'failed', 'snoozed'].includes(value.status as string) ||
    (value.relative_minutes !== null && typeof value.relative_minutes !== 'number')
  ) {
    throw new Error('Invalid task reminder returned by the database');
  }
  return {
    id: requiredTaskReminderString(value.id, 'reminder'),
    userId: requiredTaskReminderString(value.user_id, 'reminder'),
    taskId: requiredTaskReminderString(value.source_id, 'reminder'),
    reminderType: value.reminder_type,
    relativeMinutes: value.relative_minutes === null ? null : value.relative_minutes,
    absoluteTime: nullableTaskReminderString(value.absolute_time, 'reminder'),
    channels: value.channels as TaskReminderChannel[],
    status: value.status as TaskReminderStatus,
    fireAt: requiredTaskReminderString(value.fire_at, 'reminder'),
    sentAt: nullableTaskReminderString(value.sent_at, 'reminder'),
    createdAt: requiredTaskReminderString(value.created_at, 'reminder'),
  };
}

export function toTaskReminderResponse(reminder: TaskReminderRecord) {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    source_type: 'task' as const,
    source_id: reminder.taskId,
    reminder_type: reminder.reminderType,
    relative_minutes: reminder.relativeMinutes,
    absolute_time: reminder.absoluteTime,
    channels: reminder.channels,
    status: reminder.status,
    fire_at: reminder.fireAt,
    sent_at: reminder.sentAt,
    created_at: reminder.createdAt,
  };
}

function normalizeTaskDeletionRequest(
  request: TaskDeletionRequest,
): TaskDeletionRequest {
  return {
    userId: request.userId.trim(),
    taskId: request.taskId.trim(),
    ...(request.scope === undefined ? {} : { scope: request.scope }),
    ...(request.effectiveDate?.trim()
      ? { effectiveDate: request.effectiveDate.trim() }
      : {}),
    ...(request.operationId?.trim()
      ? { operationId: request.operationId.trim() }
      : {}),
  };
}

function isRecurringTask(task: Task): boolean {
  return Boolean(
    task.recurring_series_id
      || task.recurring_occurrence_id
      || task.scheduled_date
      || task.recurrence_occurrence_state,
  );
}

function isLifecycleSuccess<T>(
  outcome: LifecycleOutcome<T>,
): outcome is Extract<
  LifecycleOutcome<T>,
  { status: 'complete' | 'already-applied' }
> {
  return outcome.status === 'complete' || outcome.status === 'already-applied';
}

function mapDeletionLifecycleOutcome<T>(
  outcome: LifecycleOutcome<T>,
): TaskDeletionOutcome {
  if (outcome.status === 'complete') return { type: 'deleted' };
  if (outcome.status === 'already-applied') return { type: 'not-found' };
  if (outcome.status === 'not-found') return { type: 'not-found' };
  if (outcome.status === 'conflict') {
    return {
      type: 'conflict',
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(outcome.expectedRevisionToken === undefined
        ? {}
        : { expectedRevisionToken: outcome.expectedRevisionToken }),
      ...(outcome.actualRevisionToken === undefined
        ? {}
        : { actualRevisionToken: outcome.actualRevisionToken }),
    };
  }
  if (outcome.status === 'coverage-unavailable') {
    return {
      type: 'coverage-unavailable',
      requestedRange: outcome.requestedRange,
      coverageHorizon: outcome.coverageHorizon,
      reason: outcome.reason,
    };
  }
  if (outcome.status === 'invalid-transition') {
    return { type: 'invalid-transition', reason: outcome.reason };
  }
  return {
    type: 'invalid-transition',
    reason: String(outcome.reason),
  };
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
