import { log } from "@/lib/logger";

export type RecurringLifecycleEvent =
  | "coverage_attempt"
  | "coverage_retry"
  | "occurrence_created"
  | "intentional_absence"
  | "occurrence_withdrawn"
  | "lifecycle_conflict"
  | "coverage_partial"
  | "lifecycle_failure"
  | "prewarm_skipped";

/**
 * Operational fields for recurring-task lifecycle signals.
 *
 * Keep this type deliberately closed: task details, descriptions, override
 * values, and arbitrary request payloads must never become diagnostics.
 */
export interface RecurringLifecycleSignal {
  event: RecurringLifecycleEvent;
  operation?: string;
  source?: "interactive" | "prewarm";
  userId?: string;
  seriesId?: string;
  from?: string;
  to?: string;
  status?: string;
  count?: number;
  attempt?: number;
  maxAttempts?: number;
  seriesCount?: number;
  failedSeriesCount?: number;
  failedSeriesIds?: string[];
  errorType?: string;
}

export type RecurringLifecycleObserver = (
  signal: RecurringLifecycleSignal,
) => void;

export function emitRecurringLifecycleSignal(
  signal: RecurringLifecycleSignal,
): void {
  if (signal.event === "lifecycle_failure") {
    log.error?.("[recurring-lifecycle] signal", undefined, { ...signal });
    return;
  }
  if (
    signal.event === "lifecycle_conflict"
    || signal.event === "coverage_partial"
  ) {
    log.warn?.("[recurring-lifecycle] signal", { ...signal });
    return;
  }
  log.info?.("[recurring-lifecycle] signal", { ...signal });
}

export function errorType(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return typeof error;
}
