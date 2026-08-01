import type {
  EndType,
  RecurrenceRule,
  RecurringTask,
  RecurringTaskUpdate,
  Task,
  TaskSection,
  TaskStatus,
  TaskUpdate,
} from "@/lib/db/types";
import type { EditScope } from "@/lib/validations/recurring-task";
import { addLocalDays } from "./recurrence";

import type {
  LifecycleOutcome,
  LocalDateRange,
  PrewarmSkippedOutcome,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
  ReviseSeriesRequest,
  SeriesCommandRequest,
} from "./lifecycle";

export type SeriesStateScope = Exclude<EditScope, "this">;

export interface SeriesDefaultsInput {
  title?: string;
  description?: string | null;
  priority?: 0 | 1 | 2 | 3;
  categoryId?: string | null;
  dueTime?: string | null;
  status?: TaskStatus;
  section?: TaskSection;
  sortOrder?: number;
  projectId?: string | null;
}

export interface SeriesRevisionInput extends SeriesDefaultsInput {
  userId: string;
  seriesId: string;
  seriesStatus?: RecurringTask["status"];
  startDate?: string;
  recurrenceRule?: RecurrenceRule;
  endType?: EndType;
  endDate?: string | null;
  endCount?: number | null;
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
  effectiveDate?: string;
  inferredDate?: string;
  timeZone?: string;
  timezone?: string;
  scope?: SeriesStateScope;
  coverage?: LocalDateRange;
  expectedRevisionToken?: number;
  idempotencyKey?: string;
  operationKey?: string;
}

export interface SeriesScopeEditInput
  extends Omit<SeriesRevisionInput, "seriesId"> {
  taskId: string;
  scope: SeriesStateScope;
  dueDate?: string | null;
  completed?: boolean;
}

export interface SeriesStateCommandInput {
  userId: string;
  seriesId: string;
  effectiveDate?: string;
  inferredDate?: string;
  timeZone?: string;
  timezone?: string;
  coverage?: LocalDateRange;
  coverageThrough?: string;
  expectedRevisionToken?: number;
  idempotencyKey?: string;
  operationKey?: string;
}

export interface SeriesStateLegacyPersistence {
  getRecurringTask(id: string, userId: string): Promise<RecurringTask | null>;
  updateRecurringTask(
    id: string,
    userId: string,
    updates: RecurringTaskUpdate,
  ): Promise<RecurringTask>;
  updateInstanceWithScope(
    taskId: string,
    userId: string,
    scope: EditScope,
    updates: TaskUpdate,
  ): Promise<void>;
  pauseRecurringTask(id: string, userId: string): Promise<RecurringTask>;
  resumeRecurringTask(
    id: string,
    userId: string,
    effectiveDate?: string,
    throughDate?: string,
  ): Promise<RecurringTask>;
  archiveRecurringTask(id: string, userId: string): Promise<void>;
}

export interface SeriesStatePersistence {
  getTask(taskId: string, userId: string): Promise<Task | null>;
  legacy?: SeriesStateLegacyPersistence;
}

export type SeriesStateLifecyclePort = Pick<
  RecurringTaskLifecyclePort,
  "getSeries" | "reviseSeries" | "pauseSeries" | "resumeSeries" | "endSeries"
>;

export type SeriesStateSuccess = {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  recurringTask?: RecurringTask;
};

type SeriesStateLifecycleOutcome = Exclude<
  LifecycleOutcome<RecurringTaskSeries>,
  PrewarmSkippedOutcome
>;
type SeriesStateLifecycleResult = SeriesStateLifecycleOutcome & {
  recurringTask?: RecurringTask;
};

export type SeriesStateOutcome =
  | SeriesStateLifecycleResult
  | SeriesStateSuccess;

export type SeriesStateFailure = Extract<
  SeriesStateOutcome,
  {
    status:
      | "not-found"
      | "invalid-transition"
      | "conflict"
      | "coverage-unavailable";
  }
>;

/**
 * Resolve a transport date once at the adapter boundary. An explicit date is
 * user intent and always wins over a caller's inferred local today.
 */
export function resolveSeriesEffectiveDate(
  explicitDate?: string,
  inferredDate?: string,
): string | undefined {
  const explicit = explicitDate?.trim();
  if (explicit) return explicit;
  const inferred = inferredDate?.trim();
  return inferred || undefined;
}

export function toSeriesRevisionRequest(
  input: SeriesRevisionInput,
): ReviseSeriesRequest {
  const effectiveDate = resolveSeriesEffectiveDate(
    input.effectiveDate,
    input.inferredDate,
  );
  const request: ReviseSeriesRequest = {
    userId: input.userId.trim(),
    seriesId: input.seriesId.trim(),
    ...(effectiveDate ? { effectiveDate } : {}),
    ...(input.timeZone?.trim() ? { timeZone: input.timeZone.trim() } : {}),
    ...(input.timezone?.trim() ? { timezone: input.timezone.trim() } : {}),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
    ...(input.recurrenceRule === undefined
      ? {}
      : { recurrenceRule: input.recurrenceRule }),
    ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
    ...(input.expectedRevisionToken === undefined
      ? {}
      : { expectedRevisionToken: input.expectedRevisionToken }),
    ...(input.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.idempotencyKey }),
    ...(input.operationKey === undefined
      ? {}
      : { operationKey: input.operationKey }),
  };

  const defaults = toSeriesDefaults(input);
  if (Object.keys(defaults).length > 0) request.defaults = defaults;

  if (input.endType !== undefined) {
    request.endType = input.endType;
    request.occurrenceLimit = input.endType === "after_count"
      ? input.endCount ?? null
      : null;
    request.lastScheduledDate = input.endType === "on_date"
      ? input.endDate ?? null
      : null;
  } else {
    if (input.occurrenceLimit !== undefined) {
      request.occurrenceLimit = input.occurrenceLimit;
    }
    if (input.lastScheduledDate !== undefined) {
      request.lastScheduledDate = input.lastScheduledDate;
    }
    if (input.endDate !== undefined) {
      request.lastScheduledDate = input.endDate;
    }
    if (input.endCount !== undefined) {
      request.occurrenceLimit = input.endCount;
    }
  }

  return request;
}

export class SeriesStateAdapter {
  constructor(
    private readonly persistence: SeriesStatePersistence,
    private readonly options: { lifecycle?: SeriesStateLifecyclePort } = {},
  ) {}

  async revise(input: SeriesRevisionInput): Promise<SeriesStateOutcome> {
    if (this.options.lifecycle) {
      if (input.startDate !== undefined) {
        return invalidTransition(
          "Recurrence Anchor edits are not supported by the Series lifecycle",
        );
      }
      return attachRecurringTask(
        await this.options.lifecycle.reviseSeries(
          toSeriesRevisionRequest(input),
        ),
      );
    }

    const updates = toLegacyRecurringTaskUpdate(input);
    return {
      ...complete(),
      recurringTask: await this.legacy().updateRecurringTask(
        input.seriesId,
        input.userId,
        updates,
      ),
    };
  }

  /**
   * Apply a recurring-series update while preserving the old status command
   * presentation. Lifecycle mode keeps status transitions as commands; a
   * default/status-only update remains a single effective-dated revision.
   */
  async update(input: SeriesRevisionInput): Promise<SeriesStateOutcome> {
    if (input.seriesStatus === "paused") return this.pause(input);
    if (input.seriesStatus === "archived") return this.archive(input);

    if (input.seriesStatus === "active" && this.options.lifecycle) {
      const current = normalizeLifecycleOutcome(
        await this.options.lifecycle.getSeries(input.userId, input.seriesId),
      );
      if (!isLifecycleSeriesSuccess(current)) {
        return current;
      }
      if (current.series.status === "paused") return this.resume(input);
      if (current.series.status === "ended") {
        return invalidTransition("Ended Series cannot be resumed");
      }
    }

    return this.revise(input);
  }

  async editScope(input: SeriesScopeEditInput): Promise<SeriesStateOutcome> {
    if (!this.options.lifecycle) {
      await this.legacy().updateInstanceWithScope(
        input.taskId,
        input.userId,
        input.scope,
        toLegacyScopedTaskUpdate(input),
      );
      return complete();
    }

    const targetOutcome = await this.lifecycleTarget(input.taskId, input.userId);
    if (!isLifecycleTarget(targetOutcome)) return targetOutcome;
    const target = targetOutcome;
    const unsupported = unsupportedScopedFields(input);
    if (unsupported.length > 0) {
      return invalidTransition(
        `Following-scope edits do not support: ${unsupported.join(", ")}`,
      );
    }

    const outcome = await this.options.lifecycle.reviseSeries(
      toSeriesRevisionRequest({
        ...input,
        seriesId: target.seriesId,
        effectiveDate: resolveSeriesEffectiveDate(
          input.effectiveDate,
          target.scheduledDate,
        ),
        inferredDate: undefined,
      }),
    );
    return attachRecurringTask(outcome);
  }

  async pause(input: SeriesStateCommandInput): Promise<SeriesStateOutcome> {
    if (this.options.lifecycle) {
      return attachRecurringTask(
        await this.options.lifecycle.pauseSeries(
          toSeriesCommandRequest(input),
        ),
      );
    }
    return {
      ...complete(),
      recurringTask: await this.legacy().pauseRecurringTask(
        input.seriesId,
        input.userId,
      ),
    };
  }

  async resume(input: SeriesStateCommandInput): Promise<SeriesStateOutcome> {
    const effectiveDate = resolveSeriesEffectiveDate(
      input.effectiveDate,
      input.inferredDate,
    );
    if (this.options.lifecycle) {
      return attachRecurringTask(
        await this.options.lifecycle.resumeSeries(
          toSeriesCommandRequest(input),
        ),
      );
    }
    return {
      ...complete(),
      recurringTask: await this.legacy().resumeRecurringTask(
        input.seriesId,
        input.userId,
        effectiveDate,
        input.coverageThrough,
      ),
    };
  }

  async archive(input: SeriesStateCommandInput): Promise<SeriesStateOutcome> {
    if (this.options.lifecycle) {
      return attachRecurringTask(
        await this.options.lifecycle.endSeries(
          toSeriesCommandRequest(input),
        ),
      );
    }
    await this.legacy().archiveRecurringTask(input.seriesId, input.userId);
    return {
      ...complete(),
      recurringTask: (await this.legacy().getRecurringTask(
        input.seriesId,
        input.userId,
      )) ?? undefined,
    };
  }

  async getRecurringTask(
    seriesId: string,
    userId: string,
  ): Promise<RecurringTask | null> {
    if (!this.options.lifecycle) {
      return this.legacy().getRecurringTask(seriesId, userId);
    }
    const outcome = normalizeLifecycleOutcome(
      await this.options.lifecycle.getSeries(userId, seriesId),
    );
    if (outcome.status === "not-found") return null;
    if (!isLifecycleSeriesSuccess(outcome)) {
      throw new Error(seriesStateErrorMessage(outcome));
    }
    return recurringTaskFromSeries(outcome.series);
  }

  private async lifecycleTarget(
    taskId: string,
    userId: string,
  ): Promise<
    | { seriesId: string; occurrenceId: string; scheduledDate: string }
    | SeriesStateFailure
  > {
    const task = await this.persistence.getTask(taskId, userId);
    if (!task) return notFound();
    const seriesId = task.recurring_series_id ?? task.recurring_task_id;
    if (!seriesId) {
      return invalidTransition(
        "Lifecycle mode requires a recurring Task Occurrence",
      );
    }

    const seriesOutcome = normalizeLifecycleOutcome(
      await this.options.lifecycle!.getSeries(userId, seriesId),
    );
    if (!isLifecycleSeriesSuccess(seriesOutcome)) {
      return seriesOutcome;
    }
    const occurrence = seriesOutcome.series.occurrences.find(
      (candidate) =>
        candidate.id === task.recurring_occurrence_id
        || candidate.taskId === taskId
        || candidate.scheduledDate === task.scheduled_date
        || candidate.scheduledDate === task.original_date,
    );
    if (!occurrence) return notFound();
    return {
      seriesId,
      occurrenceId: occurrence.id,
      scheduledDate: occurrence.scheduledDate,
    };
  }

  private legacy(): SeriesStateLegacyPersistence {
    if (!this.persistence.legacy) {
      throw new Error("Legacy Series State persistence is unavailable");
    }
    return this.persistence.legacy;
  }
}

export function toSeriesCommandRequest(
  input: SeriesStateCommandInput,
): SeriesCommandRequest {
  const effectiveDate = resolveSeriesEffectiveDate(
    input.effectiveDate,
    input.inferredDate,
  );
  const coverage = input.coverage ?? toSeriesCommandCoverage(input);
  return {
    userId: input.userId.trim(),
    seriesId: input.seriesId.trim(),
    ...(effectiveDate ? { effectiveDate } : {}),
    ...(input.timeZone?.trim() ? { timeZone: input.timeZone.trim() } : {}),
    ...(input.timezone?.trim() ? { timezone: input.timezone.trim() } : {}),
    ...(coverage === undefined ? {} : { coverage }),
    ...(input.expectedRevisionToken === undefined
      ? {}
      : { expectedRevisionToken: input.expectedRevisionToken }),
    ...(input.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.idempotencyKey }),
    ...(input.operationKey === undefined
      ? {}
      : { operationKey: input.operationKey }),
  };
}

export function isSeriesStateSuccess(
  outcome: SeriesStateOutcome,
): outcome is Extract<
  SeriesStateOutcome,
  { status: "complete" | "already-applied" }
> {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

export function seriesStateErrorMessage(
  outcome: SeriesStateFailure,
): string {
  switch (outcome.status) {
    case "not-found":
      return "Recurring task not found";
    case "conflict":
      return "Recurring task changed concurrently";
    case "coverage-unavailable":
      return "Recurring task coverage is temporarily unavailable";
    case "invalid-transition":
      return outcome.reason;
  }
}

export function seriesStateHttpFailure(
  outcome: SeriesStateFailure,
): { error: string; status: 400 | 404 | 409 | 503 } {
  switch (outcome.status) {
    case "not-found":
      return { error: seriesStateErrorMessage(outcome), status: 404 };
    case "conflict":
      return { error: seriesStateErrorMessage(outcome), status: 409 };
    case "coverage-unavailable":
      return { error: seriesStateErrorMessage(outcome), status: 503 };
    case "invalid-transition":
      return { error: seriesStateErrorMessage(outcome), status: 400 };
  }
}

function toSeriesDefaults(input: SeriesDefaultsInput): Partial<
  Pick<
    SeriesDefaultsInput,
    "title" | "description" | "priority" | "categoryId" | "dueTime" |
      "status" | "section" | "sortOrder" | "projectId"
  >
> {
  return {
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.description === undefined
      ? {}
      : { description: input.description?.trim() || null }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.categoryId === undefined
      ? {}
      : { categoryId: input.categoryId?.trim() || null }),
    ...(input.dueTime === undefined
      ? {}
      : { dueTime: input.dueTime?.trim() || null }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.section === undefined ? {} : { section: input.section }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    ...(input.projectId === undefined
      ? {}
      : { projectId: input.projectId?.trim() || null }),
  };
}

function toLegacyRecurringTaskUpdate(
  input: SeriesRevisionInput,
): RecurringTaskUpdate {
  return {
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.description === undefined
      ? {}
      : { description: input.description?.trim() || null }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.categoryId === undefined
      ? {}
      : { category_id: input.categoryId?.trim() || null }),
    ...(input.dueTime === undefined
      ? {}
      : { due_time: input.dueTime?.trim() || null }),
    ...(input.recurrenceRule === undefined
      ? {}
      : { recurrence_rule: input.recurrenceRule }),
    ...(input.endType === undefined ? {} : { end_type: input.endType }),
    ...(input.endDate === undefined ? {} : { end_date: input.endDate }),
    ...(input.endCount === undefined ? {} : { end_count: input.endCount }),
    ...(input.startDate === undefined ? {} : { start_date: input.startDate }),
    ...(input.seriesStatus === undefined
      ? {}
      : { status: input.seriesStatus }),
  };
}

function toLegacyScopedTaskUpdate(input: SeriesScopeEditInput): TaskUpdate {
  return {
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.description === undefined
      ? {}
      : { description: input.description?.trim() || null }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.categoryId === undefined
      ? {}
      : { category_id: input.categoryId?.trim() || null }),
    ...(input.dueDate === undefined
      ? {}
      : { due_date: input.dueDate?.trim() || null }),
    ...(input.dueTime === undefined
      ? {}
      : { due_time: input.dueTime?.trim() || null }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.completed === undefined
      ? {}
      : { is_completed: input.completed }),
    ...(input.section === undefined ? {} : { section: input.section }),
    ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
    ...(input.projectId === undefined
      ? {}
      : { project_id: input.projectId?.trim() || null }),
  };
}

function unsupportedScopedFields(input: SeriesScopeEditInput): string[] {
  const unsupported: string[] = [];
  if (input.dueDate !== undefined) unsupported.push("Scheduled Date");
  if (input.completed !== undefined) unsupported.push("completion state");
  return unsupported;
}

function toSeriesCommandCoverage(
  input: SeriesStateCommandInput,
): LocalDateRange | undefined {
  const effectiveDate = resolveSeriesEffectiveDate(
    input.effectiveDate,
    input.inferredDate,
  );
  if (!effectiveDate || !input.coverageThrough) return input.coverage;
  return {
    from: effectiveDate,
    to: input.coverageThrough.trim(),
  };
}

function complete(): SeriesStateSuccess {
  return { status: "complete", type: "complete" };
}

function notFound(): SeriesStateFailure {
  return { status: "not-found", type: "not-found" };
}

function invalidTransition(reason: string): SeriesStateFailure {
  return { status: "invalid-transition", type: "invalid-transition", reason };
}

function isLifecycleTarget(
  value:
    | { seriesId: string; occurrenceId: string; scheduledDate: string }
    | SeriesStateFailure,
): value is { seriesId: string; occurrenceId: string; scheduledDate: string } {
  return !("status" in value);
}

function attachRecurringTask(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): SeriesStateOutcome {
  const normalized = normalizeLifecycleOutcome(outcome);
  if (!isLifecycleSeriesSuccess(normalized)) {
    return normalized;
  }
  const recurringTask = Array.isArray(normalized.series.revisions)
    ? recurringTaskFromSeries(normalized.series)
    : undefined;
  return {
    ...normalized,
    ...(recurringTask ? { recurringTask } : {}),
  };
}

function normalizeLifecycleOutcome(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): SeriesStateLifecycleResult {
  if (outcome.status === "skipped") {
    return invalidTransition(
      `Series State command was skipped: ${outcome.reason}`,
    );
  }
  return outcome;
}

function isLifecycleSeriesSuccess(
  outcome: SeriesStateLifecycleResult,
): outcome is Extract<
  SeriesStateLifecycleResult,
  { status: "complete" | "already-applied" }
> {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

function recurringTaskFromSeries(series: RecurringTaskSeries): RecurringTask {
  const revision = series.revisions.find(
    (candidate) => candidate.id === series.currentRevisionId,
  ) ?? series.revisions[series.revisions.length - 1];
  const defaults = revision?.defaults ?? {
    title: "",
    description: null,
    priority: 0 as const,
    categoryId: null,
    dueTime: null,
  };
  const endType: EndType = series.occurrenceLimit !== null
    ? "after_count"
    : series.lastScheduledDate !== null
      ? "on_date"
      : "never";
  return {
    id: series.id,
    user_id: series.userId,
    title: defaults.title,
    description: defaults.description,
    priority: defaults.priority,
    category_id: defaults.categoryId,
    due_time: defaults.dueTime,
    recurrence_rule: revision?.recurrenceRule ?? {
      frequency: "daily",
      interval: 1,
    },
    start_date: series.recurrenceAnchor,
    end_type: endType,
    end_date: series.lastScheduledDate,
    end_count: series.occurrenceLimit,
    instances_generated: series.occurrences.filter(
      (occurrence) => occurrence.state !== "withdrawn",
    ).length,
    next_generate_date: series.coverageHorizon
      ? addLocalDays(series.coverageHorizon, 1)
      : null,
    status: series.status === "ended" ? "archived" : series.status,
    created_at: series.createdAt,
    updated_at: series.updatedAt,
  };
}
