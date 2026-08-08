import type { EndType, RecurrenceRule } from "@/lib/db/types";
import { addLocalDays } from "./internal/recurrence";
import { RECURRING_TASK_OPERATION_IDS } from "./internal/capabilities";
import type {
  CreateSeriesCommand,
  RecurringTaskFailure,
  RecurringTaskOperationId,
  EndSeriesResult,
  ReviseSeriesCommand,
  ReviseSeriesResult,
  PauseSeriesResult,
  ResumeSeriesResult,
  SeriesCommands,
  SeriesProjection,
  SeriesStateCommand,
  SeriesVersion,
} from "./internal/capabilities";

/** Supported compatibility subpath for legacy HTTP and AI translation. */

/** The product's initial lifecycle Coverage window. */
export const INITIAL_COVERAGE_DAYS = 7;

/** The historical HTTP/AI response retained only at this adapter boundary. */
export interface RecurringTaskResponse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  category_id: string | null;
  due_time: string | null;
  recurrence_rule: RecurrenceRule;
  start_date: string;
  end_type: EndType;
  end_date: string | null;
  end_count: number | null;
  status: "active" | "paused" | "archived";
  version: SeriesVersion;
  created_at: string;
  updated_at: string;
}

/**
 * Transport-neutral creation input used by the HTTP and AI compatibility
 * adapters. Ownership is deliberately absent; the authenticated capability
 * factory supplies it from the principal.
 */
export interface SeriesCreationCompatibilityInput {
  operationId: RecurringTaskOperationId;
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  categoryId: string | null;
  dueTime: string | null;
  recurrenceRule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  endType: "never" | "after_count" | "on_date";
  endDate: string | null;
  endCount: number | null;
  coverageThrough: string;
}

/**
 * Derive the initial inclusive Coverage range from the Recurrence Anchor.
 * A future anchor gets a full window of its own rather than an inverted range
 * against today's product window.
 */
export function initialSeriesCoverage(
  recurrenceAnchor: string,
  referenceDate: string = recurrenceAnchor,
) {
  const coverageStart =
    recurrenceAnchor > referenceDate ? recurrenceAnchor : referenceDate;
  return {
    from: recurrenceAnchor,
    to: addLocalDays(coverageStart, INITIAL_COVERAGE_DAYS),
  };
}

/** Translate legacy creation values into the authenticated command contract. */
export function toCreateSeriesCommand(
  input: SeriesCreationCompatibilityInput,
): CreateSeriesCommand {
  const recurrenceAnchor = input.recurrenceAnchor.trim();
  const normalizedDueTime = normalizeDueTime(input.dueTime);
  const command: CreateSeriesCommand = {
    operationId: input.operationId,
    recurrenceRule: input.recurrenceRule,
    recurrenceAnchor,
    activationDate: input.activationDate.trim(),
    defaults: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      categoryId: input.categoryId?.trim() || null,
      dueTime: normalizedDueTime,
    },
    occurrenceLimit:
      input.endType === "after_count" ? input.endCount : null,
    lastScheduledDate:
      input.endType === "on_date" ? input.endDate?.trim() || null : null,
    coverage: {
      from: recurrenceAnchor,
      to: input.coverageThrough.trim(),
    },
  };

  return command;
}

/**
 * Transport-neutral input for a definition change. The legacy HTTP and AI
 * fields are translated here so both channels invoke the same public Series
 * command with the caller's retry identity, expected projection version, and
 * explicit effective Scheduled Date.
 */
export interface SeriesRevisionCompatibilityInput {
  operationId: RecurringTaskOperationId;
  seriesId: string;
  version: SeriesVersion;
  effectiveDate: string;
  title?: string;
  description?: string | null;
  priority?: 0 | 1 | 2 | 3;
  categoryId?: string | null;
  dueTime?: string | null;
  recurrenceRule?: RecurrenceRule;
  scope?: "following" | "all";
  endType?: EndType;
  endDate?: string | null;
  endCount?: number | null;
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
}

/** Translate the historical Series update fields into the public command. */
export function toReviseSeriesCommand(
  input: SeriesRevisionCompatibilityInput,
): ReviseSeriesCommand {
  const command: ReviseSeriesCommand = {
    operationId: input.operationId,
    seriesId: input.seriesId.trim(),
    version: input.version,
    effectiveDate: input.effectiveDate?.trim() ?? "",
    ...(input.recurrenceRule === undefined
      ? {}
      : { recurrenceRule: input.recurrenceRule }),
    ...(input.scope === undefined ? {} : { scope: input.scope }),
  };

  const defaults = {
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
      : { dueTime: normalizeDueTime(input.dueTime) }),
  };
  if (Object.keys(defaults).length > 0) command.defaults = defaults;

  if (input.endType !== undefined) {
    command.endType = input.endType;
    command.occurrenceLimit = input.endType === "after_count"
      ? input.endCount ?? null
      : null;
    command.lastScheduledDate = input.endType === "on_date"
      ? input.endDate?.trim() || null
      : null;
  } else {
    if (input.occurrenceLimit !== undefined) {
      command.occurrenceLimit = input.occurrenceLimit;
    }
    if (input.lastScheduledDate !== undefined) {
      command.lastScheduledDate = input.lastScheduledDate?.trim() || null;
    }
    if (input.endDate !== undefined) {
      command.lastScheduledDate = input.endDate?.trim() || null;
    }
    if (input.endCount !== undefined) {
      command.occurrenceLimit = input.endCount;
    }
  }

  return command;
}

export interface SeriesStateCompatibilityInput {
  operationId: RecurringTaskOperationId;
  seriesId: string;
  version: SeriesVersion;
  effectiveDate?: string;
  coverage?: { from: string; to: string };
}

/** The authenticated Series command methods used by compatibility execution. */
export type SeriesCompatibilityCommandPort = Pick<
  SeriesCommands,
  "reviseSeries" | "pauseSeries" | "resumeSeries" | "endSeries"
>;

/** A delivery-neutral, already-selected Series mutation intent. */
export type SeriesCompatibilityIntent =
  | {
      type: "revise";
      command: SeriesRevisionCompatibilityInput;
    }
  | {
      type: "pause";
      command: SeriesStateCompatibilityInput;
      referenceDate: string;
    }
  | {
      type: "resume";
      command: SeriesStateCompatibilityInput;
      referenceDate: string;
    }
  | {
      type: "end";
      command: SeriesStateCompatibilityInput;
      referenceDate: string;
    };

export type SeriesCompatibilityResult =
  | ReviseSeriesResult
  | PauseSeriesResult
  | ResumeSeriesResult
  | EndSeriesResult;

/** Execute one selected Series status intent through the authenticated port. */
export async function executeSeriesCompatibilityIntent(
  commands: SeriesCompatibilityCommandPort,
  intent: SeriesCompatibilityIntent,
): Promise<SeriesCompatibilityResult> {
  if (intent.type === "revise") {
    return commands.reviseSeries(toSeriesRevisionExecutionCommand(intent.command));
  }
  if (intent.type === "pause") {
    return commands.pauseSeries(
      toSeriesStateExecutionCommand(
        intent.command,
        intent.command.effectiveDate ?? intent.referenceDate,
      ),
    );
  }
  if (intent.type === "resume") {
    const effectiveDate = intent.command.effectiveDate ?? intent.referenceDate;
    return commands.resumeSeries(
      toSeriesStateExecutionCommand(intent.command, effectiveDate, {
        from: effectiveDate,
        to: addLocalDays(effectiveDate, INITIAL_COVERAGE_DAYS),
      }),
    );
  }
  if (intent.type === "end") {
    return commands.endSeries(
      toSeriesStateExecutionCommand(
        intent.command,
        intent.command.effectiveDate ?? intent.referenceDate,
      ),
    );
  }
  throw new Error("Unsupported compatibility intent");
}

/** Identify either successful lifecycle completion or an idempotent replay. */
export function isSeriesCompatibilitySuccess(
  outcome: SeriesCompatibilityResult,
): outcome is Extract<SeriesCompatibilityResult, { series: SeriesProjection }> {
  return "series" in outcome
    && (outcome.status === "complete" || outcome.status === "already-applied");
}

function toSeriesStateExecutionCommand(
  input: SeriesStateCompatibilityInput,
  effectiveDate: string,
  coverage?: SeriesStateCommand["coverage"],
): SeriesStateCommand {
  return {
    operationId: input.operationId,
    seriesId: input.seriesId,
    version: input.version,
    effectiveDate,
    ...(coverage === undefined ? {} : { coverage }),
  };
}

function toSeriesRevisionExecutionCommand(
  input: SeriesRevisionCompatibilityInput,
): ReviseSeriesCommand {
  const command = toReviseSeriesCommand(input);
  return {
    ...command,
    operationId: input.operationId,
    seriesId: input.seriesId,
    version: input.version,
    effectiveDate: input.effectiveDate,
  };
}

/** Resolve a transport date once at the compatibility boundary. */
export function resolveSeriesEffectiveDate(
  explicitDate?: string,
  inferredDate?: string,
): string | undefined {
  const explicit = explicitDate?.trim();
  if (explicit) return explicit;
  const inferred = inferredDate?.trim();
  return inferred || undefined;
}

/** Translate a state action into the shared public command contract. */
export function toSeriesStateCommand(
  input: SeriesStateCompatibilityInput,
): SeriesStateCommand {
  return {
    operationId: input.operationId,
    seriesId: input.seriesId.trim(),
    version: input.version,
    ...(input.effectiveDate === undefined
      ? {}
      : { effectiveDate: input.effectiveDate.trim() }),
    ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
  };
}

/**
 * Translate the historical transport start-date field at the adapter edge.
 * The lifecycle itself always receives the two explicit date concepts.
 */
export function toLifecycleRecurrenceDates(startDate: string): {
  recurrenceAnchor: string;
  activationDate: string;
} {
  const normalized = startDate.trim();
  return {
    recurrenceAnchor: normalized,
    activationDate: normalized,
  };
}

/**
 * Translate the lifecycle model into the existing transport shape used by
 * the web and AI adapters. No persistence or lifecycle decision belongs in
 * this compatibility boundary.
 */
export function toRecurringTaskResponse(
  series: SeriesProjection,
  ownerId: string,
): RecurringTaskResponse {
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
  const endType = series.occurrenceLimit !== null
    ? "after_count"
    : series.lastScheduledDate !== null
      ? "on_date"
      : "never";
  return {
    id: series.id,
    user_id: ownerId,
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
    status: series.status === "ended" ? "archived" : series.status,
    version: series.version,
    created_at: series.createdAt,
    updated_at: series.updatedAt,
  };
}

/** Map a typed capability failure to stable delivery text. */
export function recurringTaskFailureMessage(
  failure: RecurringTaskFailure,
): string {
  switch (failure.type) {
    case "validation":
      return failure.reason;
    case "not-found":
      return "Recurring task not found";
    case "conflict":
      return failure.operation === RECURRING_TASK_OPERATION_IDS.createSeries
        ? "Recurring task creation conflict"
        : "Recurring task operation conflict";
    case "invalid-transition":
      return failure.reason;
    case "coverage-unavailable":
      return "Recurring task coverage is temporarily unavailable";
  }
}

/** Map a typed capability failure to the HTTP status for its delivery edge. */
export function recurringTaskFailureHttpStatus(
  failure: RecurringTaskFailure,
): 400 | 404 | 409 | 503 {
  switch (failure.type) {
    case "validation":
    case "invalid-transition":
      return 400;
    case "not-found":
      return 404;
    case "conflict":
      return 409;
    case "coverage-unavailable":
      return 503;
  }
}

function normalizeDueTime(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return /^\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
}
