import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";
import {
  createSupabaseRecurringTaskLifecycle,
} from "./supabase-lifecycle";
import { addLocalDays } from "./recurrence";
import type { LocalDateRange } from "./lifecycle";
import {
  emitRecurringLifecycleSignal,
  errorType,
} from "./observability";

export const RECURRING_COVERAGE_WARNING_CODE =
  "recurring_coverage_unavailable" as const;

export interface RecurringCoverageWarning {
  code: typeof RECURRING_COVERAGE_WARNING_CODE;
  type: "coverage-unavailable";
  message: string;
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
}

export class RecurringCoverageUnavailableError extends Error {
  readonly warning: RecurringCoverageWarning;

  constructor(warning: RecurringCoverageWarning) {
    super(warning.message);
    this.name = "RecurringCoverageUnavailableError";
    this.warning = warning;
  }
}

export type RecurringCoverageResult =
  | {
    status: "complete";
    type: "complete";
    requestedRange: LocalDateRange;
    failedSeriesIds: [];
  }
  | {
    status: "partial";
    type: "coverage-unavailable";
    requestedRange: LocalDateRange;
    failedSeriesIds: string[];
    warning: RecurringCoverageWarning;
  };

export interface TaskReadCoverageRequest {
  date?: string;
  view?: "today" | "upcoming" | "overdue" | null;
  days?: number;
  dueDate?: string | null;
}

/** Derive the exact inclusive local-date horizon represented by a task read. */
export function taskReadCoverageRange(
  request: TaskReadCoverageRequest,
): LocalDateRange | undefined {
  if (request.dueDate) {
    return { from: request.dueDate, to: request.dueDate };
  }
  if (!request.view || !request.date) return undefined;
  if (request.view === "upcoming") {
    const days = request.days ?? 7;
    return { from: request.date, to: addLocalDays(request.date, days) };
  }
  return { from: request.date, to: request.date };
}

export function recurringCoverageWarning(
  requestedRange: LocalDateRange,
  failedSeriesIds: string[] = [],
): RecurringCoverageWarning {
  return {
    code: RECURRING_COVERAGE_WARNING_CODE,
    type: "coverage-unavailable",
    message: "Recurring task coverage is unavailable for the requested date range.",
    requestedRange,
    failedSeriesIds: [...new Set(failedSeriesIds)].sort(),
  };
}

function partialCoverage(
  requestedRange: LocalDateRange,
  failedSeriesIds: string[] = [],
): RecurringCoverageResult {
  const ids = [...new Set(failedSeriesIds)].sort();
  return {
    status: "partial",
    type: "coverage-unavailable",
    requestedRange,
    failedSeriesIds: ids,
    warning: recurringCoverageWarning(requestedRange, ids),
  };
}

/**
 * Ensure one exact local-date range for every owned Recurring Task Series.
 *
 * The database lifecycle owns the per-series transaction and serialization.
 * This adapter translates the user-scoped read request into a typed complete
 * or degraded result that delivery surfaces can carry without false
 * completeness.
 */
export async function ensureRecurringTaskCoverage(
  supabase: SupabaseClient,
  userId: string,
  range: LocalDateRange,
): Promise<RecurringCoverageResult> {
  // Production Supabase clients expose rpc. A client without the lifecycle
  // boundary is an explicit degraded result, never a false success.
  if (typeof (supabase as unknown as { rpc?: unknown }).rpc !== "function") {
    emitRecurringLifecycleSignal({
      event: "lifecycle_failure",
      operation: "ensure-user-coverage",
      source: "interactive",
      userId,
      from: range.from,
      to: range.to,
      errorType: "missing-lifecycle-boundary",
    });
    return partialCoverage(range);
  }
  try {
    const outcome = await createSupabaseRecurringTaskLifecycle(supabase)
      .ensureUserCoverage({ userId, range });

    if (outcome.status === "complete" || outcome.status === "already-applied") {
      return {
        status: "complete",
        type: "complete",
        requestedRange: range,
        failedSeriesIds: [],
      };
    }

    log.warn("[recurring-lifecycle] coverage unavailable", {
      userId,
      from: range.from,
      to: range.to,
      outcome: outcome.status,
    });
    const failedSeriesIds = "failedSeriesIds" in outcome
      && Array.isArray(outcome.failedSeriesIds)
      ? outcome.failedSeriesIds.filter((id): id is string => typeof id === "string")
      : [];
    return partialCoverage(range, failedSeriesIds);
  } catch (error) {
    emitRecurringLifecycleSignal({
      event: "lifecycle_failure",
      operation: "ensure-user-coverage",
      source: "interactive",
      userId,
      from: range.from,
      to: range.to,
      errorType: errorType(error),
    });
    return partialCoverage(range);
  }
}

export async function ensureRecurringTaskCoverageThrough(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  throughDate: string,
): Promise<RecurringCoverageResult> {
  return ensureRecurringTaskCoverage(supabase, userId, {
    from: fromDate,
    to: throughDate,
  });
}
