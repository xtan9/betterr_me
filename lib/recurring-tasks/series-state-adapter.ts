import type {
  EndType,
  RecurrenceRule,
  Task,
  TaskSection,
  TaskStatus,
} from "@/lib/db/types";
import type { EditScope } from "@/lib/validations/recurring-task";
import {
  toRecurringTaskResponse,
  type RecurringTaskResponse,
} from "./compatibility";

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
  seriesStatus?: RecurringTaskResponse["status"];
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

export interface SeriesStatePersistence {
  getTask(taskId: string, userId: string): Promise<Task | null>;
}

export type SeriesStateLifecyclePort = Pick<
  RecurringTaskLifecyclePort,
  "getSeries" | "reviseSeries" | "pauseSeries" | "resumeSeries" | "endSeries"
>;

export type SeriesStateSuccess = {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  recurringTask?: RecurringTaskResponse;
};

type SeriesStateLifecycleOutcome = Exclude<
  LifecycleOutcome<RecurringTaskSeries>,
  PrewarmSkippedOutcome
>;
type SeriesStateLifecycleResult = SeriesStateLifecycleOutcome & {
  recurringTask?: RecurringTaskResponse;
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
    if (!this.options.lifecycle) {
      return invalidTransition("Recurring Task Lifecycle is not configured");
    }
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
      return invalidTransition("Recurring Task Lifecycle is not configured");
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
    if (!this.options.lifecycle) {
      return invalidTransition("Recurring Task Lifecycle is not configured");
    }
    return attachRecurringTask(
      await this.options.lifecycle.pauseSeries(
        toSeriesCommandRequest(input),
      ),
    );
  }

  async resume(input: SeriesStateCommandInput): Promise<SeriesStateOutcome> {
    if (!this.options.lifecycle) {
      return invalidTransition("Recurring Task Lifecycle is not configured");
    }
    return attachRecurringTask(
      await this.options.lifecycle.resumeSeries(
        toSeriesCommandRequest(input),
      ),
    );
  }

  async archive(input: SeriesStateCommandInput): Promise<SeriesStateOutcome> {
    if (!this.options.lifecycle) {
      return invalidTransition("Recurring Task Lifecycle is not configured");
    }
    return attachRecurringTask(
      await this.options.lifecycle.endSeries(
        toSeriesCommandRequest(input),
      ),
    );
  }

  async getRecurringTask(
    seriesId: string,
    userId: string,
  ): Promise<RecurringTaskResponse | null> {
    if (!this.options.lifecycle) return null;
    const outcome = normalizeLifecycleOutcome(
      await this.options.lifecycle.getSeries(userId, seriesId),
    );
    if (outcome.status === "not-found") return null;
    if (!isLifecycleSeriesSuccess(outcome)) {
      throw new Error(seriesStateErrorMessage(outcome));
    }
    return toRecurringTaskResponse(outcome.series, userId);
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
    const seriesId = task.recurring_series_id;
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
        || candidate.scheduledDate === task.scheduled_date,
    );
    if (!occurrence) return notFound();
    return {
      seriesId,
      occurrenceId: occurrence.id,
      scheduledDate: occurrence.scheduledDate,
    };
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
    ? toRecurringTaskResponse(normalized.series, normalized.series.userId)
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
