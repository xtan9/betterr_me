import {
  addLocalDays,
  compareLocalDates,
  getLocalDateInTimeZone,
} from "./recurrence";
import {
  emitRecurringLifecycleSignal,
  errorType,
  type RecurringLifecycleObserver,
} from "./observability";
import type {
  ActiveSeriesSummary,
  LifecycleOutcome,
  LocalDateRange,
  PrewarmCoverageRequest,
  RecurringTaskSeries,
} from "./lifecycle";

const DEFAULT_PREWARM_DAYS = 14;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

export interface RecurringTaskPrewarmingLifecycle {
  listActiveSeries(): Promise<{ series: ActiveSeriesSummary[] }>;
  prewarmCoverage(
    request: PrewarmCoverageRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
}

export interface PrewarmAttemptResult {
  seriesId: string;
  attempts: number;
  status: "complete" | "already-applied" | "already-covered" | "skipped" | "failed";
}

export interface PrewarmResult {
  status: "complete" | "partial";
  type: "complete" | "partial";
  seriesCount: number;
  warmedSeriesCount: number;
  skippedSeriesCount: number;
  failedSeriesIds: string[];
  attempts: PrewarmAttemptResult[];
}

export interface PrewarmOptions {
  now?: () => Date;
  days?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  observer?: RecurringLifecycleObserver;
}

export async function prewarmActiveRecurringTaskCoverage(
  lifecycle: RecurringTaskPrewarmingLifecycle,
  options: PrewarmOptions = {},
): Promise<PrewarmResult> {
  const now = options.now ?? (() => new Date());
  const days = Math.max(0, options.days ?? DEFAULT_PREWARM_DAYS);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const observer = options.observer ?? emitRecurringLifecycleSignal;
  let series: ActiveSeriesSummary[];
  try {
    ({ series } = await lifecycle.listActiveSeries());
  } catch (error) {
    observer({
      event: "lifecycle_failure",
      operation: "list-active-series",
      source: "prewarm",
      errorType: errorType(error),
    });
    throw error;
  }
  const attempts: PrewarmAttemptResult[] = [];
  const failedSeriesIds: string[] = [];
  let warmedSeriesCount = 0;
  let skippedSeriesCount = 0;

  for (const candidate of series) {
    const range = prewarmRange(candidate, now(), days);
    if (!range) {
      skippedSeriesCount += 1;
      attempts.push({
        seriesId: candidate.id,
        attempts: 0,
        status: "already-covered",
      });
      observer({
        event: "prewarm_skipped",
        operation: "prewarm-coverage",
        source: "prewarm",
        userId: candidate.userId,
        seriesId: candidate.id,
        status: "already-covered",
      });
      continue;
    }

    const operationKey = `recurring-prewarm:${candidate.id}:${range.from}:${range.to}`;
    let finalStatus: PrewarmAttemptResult["status"] = "failed";
    let completed = false;
    let skipped = false;
    let completedOnAttempt = maxAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) {
        observer({
          event: "coverage_retry",
          operation: "prewarm-coverage",
          source: "prewarm",
          userId: candidate.userId,
          seriesId: candidate.id,
          from: range.from,
          to: range.to,
          attempt,
          maxAttempts,
        });
        if (retryDelayMs > 0) await sleep(retryDelayMs);
      }
      try {
        const outcome = await lifecycle.prewarmCoverage({
          userId: candidate.userId,
          seriesId: candidate.id,
          range,
          operationKey,
          source: "prewarm",
        });
        if (outcome.status === "complete" || outcome.status === "already-applied") {
          finalStatus = outcome.status;
          completed = true;
          completedOnAttempt = attempt;
          break;
        }
        if (outcome.status === "skipped") {
          finalStatus = outcome.reason === "already-covered"
            ? "already-covered"
            : "skipped";
          skipped = true;
          completedOnAttempt = attempt;
          break;
        }
        observer({
          event: "lifecycle_failure",
          operation: "prewarm-coverage",
          source: "prewarm",
          userId: candidate.userId,
          seriesId: candidate.id,
          from: range.from,
          to: range.to,
          attempt,
          maxAttempts,
          status: outcome.status,
        });
      } catch (error) {
        observer({
          event: "lifecycle_failure",
          operation: "prewarm-coverage",
          source: "prewarm",
          userId: candidate.userId,
          seriesId: candidate.id,
          from: range.from,
          to: range.to,
          attempt,
          maxAttempts,
          errorType: errorType(error),
        });
      }
    }

    if (!completed && !skipped) {
      observer({
        event: "lifecycle_failure",
        operation: "prewarm-coverage",
        source: "prewarm",
        userId: candidate.userId,
        seriesId: candidate.id,
        from: range.from,
        to: range.to,
        attempt: maxAttempts,
        maxAttempts,
        status: "retry-exhausted",
      });
    }

    attempts.push({
      seriesId: candidate.id,
      attempts: completed || skipped ? completedOnAttempt : maxAttempts,
      status: finalStatus,
    });
    if (completed) {
      warmedSeriesCount += 1;
    } else if (skipped) {
      skippedSeriesCount += 1;
    } else {
      failedSeriesIds.push(candidate.id);
    }
  }

  const sortedFailedSeriesIds = [...new Set(failedSeriesIds)].sort();
  if (sortedFailedSeriesIds.length > 0) {
    observer({
      event: "coverage_partial",
      operation: "prewarm-coverage",
      source: "prewarm",
      seriesCount: series.length,
      failedSeriesCount: sortedFailedSeriesIds.length,
      failedSeriesIds: sortedFailedSeriesIds,
    });
  }
  return {
    status: sortedFailedSeriesIds.length === 0 ? "complete" : "partial",
    type: sortedFailedSeriesIds.length === 0 ? "complete" : "partial",
    seriesCount: series.length,
    warmedSeriesCount,
    skippedSeriesCount,
    failedSeriesIds: sortedFailedSeriesIds,
    attempts,
  };
}

function prewarmRange(
  series: ActiveSeriesSummary,
  now: Date,
  days: number,
): LocalDateRange | undefined {
  const today = getLocalDateInTimeZone(now, series.timeZone);
  const through = addLocalDays(today, days);
  const from = series.coverageHorizon
    ? addLocalDays(series.coverageHorizon, 1)
    : today;
  return compareLocalDates(from, through) > 0
    ? undefined
    : { from, to: through };
}
