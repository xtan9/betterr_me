import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreateSeriesRequest,
  ActiveSeriesSummary,
  EnsureCoverageRequest,
  EnsureCoverageOutcome,
  EnsureUserCoverageRequest,
  LifecycleOutcome,
  OccurrenceCommandRequest,
  OccurrenceUpdateRequest,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
  ReviseSeriesRequest,
  SeriesCommandRequest,
  UserCoverageOutcome,
  PrewarmCoverageRequest,
} from "./lifecycle";
import {
  emitRecurringLifecycleSignal,
  errorType,
  type RecurringLifecycleObserver,
} from "./observability";

type LifecycleOperation =
  | "create-series"
  | "ensure-coverage"
  | "ensure-user-coverage"
  | "list-active-series"
  | "prewarm-coverage"
  | "list-series"
  | "revise-series"
  | "edit-occurrence"
  | "skip-occurrence"
  | "complete-occurrence"
  | "reopen-occurrence"
  | "pause-series"
  | "resume-series"
  | "end-series"
  | "get-series";

/**
 * Database-backed lifecycle adapter.
 *
 * The adapter deliberately has one RPC boundary for every lifecycle command.
 * The SQL function owns row locks, RLS ownership, idempotency, and the
 * cross-table transaction; delivery adapters never sequence those writes.
 */
export class SupabaseRecurringTaskLifecycle
  implements RecurringTaskLifecyclePort
{
  private readonly observer: RecurringLifecycleObserver;

  constructor(
    private readonly supabase: SupabaseClient,
    options: { observer?: RecurringLifecycleObserver } = {},
  ) {
    this.observer = options.observer ?? emitRecurringLifecycleSignal;
  }

  async createSeries(request: CreateSeriesRequest) {
    return this.call("create-series", request);
  }

  async ensureCoverage(request: EnsureCoverageRequest) {
    return this.call("ensure-coverage", request) as Promise<EnsureCoverageOutcome>;
  }

  async ensureUserCoverage(request: EnsureUserCoverageRequest) {
    return this.call("ensure-user-coverage", request) as Promise<UserCoverageOutcome>;
  }

  async listActiveSeries(): Promise<{ series: ActiveSeriesSummary[] }> {
    return this.call("list-active-series", {}) as Promise<{
      series: ActiveSeriesSummary[];
    }>;
  }

  async prewarmCoverage(request: PrewarmCoverageRequest) {
    return this.call("prewarm-coverage", request);
  }

  async listSeries(
    userId: string,
    status?: "active" | "paused" | "ended",
  ): Promise<{ series: RecurringTaskSeries[] }> {
    return this.call("list-series", { userId, status }) as Promise<{
      series: RecurringTaskSeries[];
    }>;
  }

  async reviseSeries(request: ReviseSeriesRequest) {
    return this.call("revise-series", request);
  }

  async editOccurrence(request: OccurrenceUpdateRequest) {
    return this.call("edit-occurrence", request);
  }

  async skipOccurrence(request: OccurrenceCommandRequest) {
    return this.call("skip-occurrence", request);
  }

  async completeOccurrence(request: OccurrenceCommandRequest) {
    return this.call("complete-occurrence", request);
  }

  async reopenOccurrence(request: OccurrenceCommandRequest) {
    return this.call("reopen-occurrence", request);
  }

  async pauseSeries(request: SeriesCommandRequest) {
    return this.call("pause-series", request);
  }

  async resumeSeries(request: SeriesCommandRequest) {
    return this.call("resume-series", request);
  }

  async endSeries(request: SeriesCommandRequest) {
    return this.call("end-series", request);
  }

  async deleteSeries(request: SeriesCommandRequest) {
    // Legacy writers may still expose this method, but ending is the sole
    // destructive Series lifecycle command. Keep this alias at the
    // compatibility edge so it cannot reach a competing delete RPC.
    return this.endSeries(request);
  }

  async getSeries(userId: string, seriesId: string) {
    return this.call("get-series", { userId, seriesId });
  }

  private async call<TRequest extends object, TResult = LifecycleOutcome<RecurringTaskSeries>>(
    operation: LifecycleOperation,
    request: TRequest,
    rpcName = "recurring_task_lifecycle",
  ): Promise<TResult> {
    const safeRequest = request as Record<string, unknown>;
    if (isCoverageOperation(operation, safeRequest)) {
      this.observer({
        event: "coverage_attempt",
        operation,
        source: requestSource(safeRequest),
        userId: requestString(safeRequest, "userId"),
        seriesId: requestString(safeRequest, "seriesId"),
        ...requestRange(safeRequest),
      });
    }
    try {
      const { data, error } = await this.supabase.rpc(rpcName, {
        p_operation: operation,
        p_request: request,
      });
      if (error) throw error;
      this.observeOutcome(operation, safeRequest, data);
      return data as TResult;
    } catch (error) {
      this.observer({
        event: "lifecycle_failure",
        operation,
        source: requestSource(safeRequest),
        userId: requestString(safeRequest, "userId"),
        seriesId: requestString(safeRequest, "seriesId"),
        errorType: errorType(error),
      });
      throw error;
    }
  }

  private observeOutcome(
    operation: LifecycleOperation,
    request: Record<string, unknown>,
    outcome: unknown,
  ): void {
    if (!outcome || typeof outcome !== "object") return;
    const result = outcome as Record<string, unknown>;
    const common = {
      operation,
      source: requestSource(request),
      userId: requestString(request, "userId"),
      seriesId: requestString(request, "seriesId")
        ?? nestedString(result.series, "id"),
    };
    if (result.status === "already-applied" && isCoverageOperation(operation, request)) {
      this.observer({
        ...common,
        event: "coverage_retry",
        status: "already-applied",
      });
      return;
    }
    if (result.status === "conflict") {
      this.observer({
        ...common,
        event: "lifecycle_conflict",
        status: "conflict",
      });
      return;
    }
    if (result.status === "partial") {
      const failedSeriesIds = Array.isArray(result.failedSeriesIds)
        ? result.failedSeriesIds.filter((id): id is string => typeof id === "string")
        : [];
      this.observer({
        ...common,
        event: "coverage_partial",
        status: "partial",
        seriesCount: Array.isArray(result.series) ? result.series.length + failedSeriesIds.length : undefined,
        failedSeriesCount: failedSeriesIds.length,
        failedSeriesIds,
      });
      return;
    }
    if (typeof result.status === "string" && result.status !== "complete") {
      this.observer({
        ...common,
        event: "lifecycle_failure",
        status: result.status,
      });
      return;
    }
    const metrics = result.observability;
    if (!metrics || typeof metrics !== "object") return;
    const observability = metrics as Record<string, unknown>;
    const createdOccurrences = numberValue(observability.createdOccurrences);
    const intentionalAbsences = numberValue(observability.intentionalAbsences);
    const withdrawnOccurrences = numberValue(observability.withdrawnOccurrences);
    if (createdOccurrences > 0) {
      this.observer({ ...common, event: "occurrence_created", count: createdOccurrences });
    }
    if (intentionalAbsences > 0) {
      this.observer({ ...common, event: "intentional_absence", count: intentionalAbsences });
    }
    if (withdrawnOccurrences > 0) {
      this.observer({ ...common, event: "occurrence_withdrawn", count: withdrawnOccurrences });
    }
  }
}

function requestString(
  request: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof request[key] === "string" ? request[key] : undefined;
}

function nestedString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requestSource(
  request: Record<string, unknown>,
): "interactive" | "prewarm" | undefined {
  return request.source === "interactive" || request.source === "prewarm"
    ? request.source
    : undefined;
}

function requestRange(
  request: Record<string, unknown>,
): { from?: string; to?: string } {
  const range = request.range ?? request.coverage;
  if (range && typeof range === "object") {
    const value = range as Record<string, unknown>;
    return {
      from: typeof value.from === "string" ? value.from : undefined,
      to: typeof value.to === "string" ? value.to : undefined,
    };
  }
  return {
    from: typeof request.fromDate === "string" ? request.fromDate : undefined,
    to: typeof request.throughDate === "string" ? request.throughDate : undefined,
  };
}

function isCoverageOperation(
  operation: LifecycleOperation,
  request: Record<string, unknown>,
): boolean {
  return operation.includes("coverage")
    || operation === "prewarm-coverage"
    || "coverage" in request
    || "range" in request;
}

export function createSupabaseRecurringTaskLifecycle(
  supabase: SupabaseClient,
  options: { observer?: RecurringLifecycleObserver } = {},
): SupabaseRecurringTaskLifecycle {
  return new SupabaseRecurringTaskLifecycle(supabase, options);
}
