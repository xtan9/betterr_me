import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreateSeriesRequest,
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
} from "./lifecycle";

type LifecycleOperation =
  | "create-series"
  | "ensure-coverage"
  | "ensure-user-coverage"
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
  constructor(private readonly supabase: SupabaseClient) {}

  async createSeries(request: CreateSeriesRequest) {
    return this.call("create-series", request);
  }

  async ensureCoverage(request: EnsureCoverageRequest) {
    return this.call("ensure-coverage", request) as Promise<EnsureCoverageOutcome>;
  }

  async ensureUserCoverage(request: EnsureUserCoverageRequest) {
    return this.call("ensure-user-coverage", request) as Promise<UserCoverageOutcome>;
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

  async getSeries(userId: string, seriesId: string) {
    return this.call("get-series", { userId, seriesId });
  }

  private async call<TRequest extends object, TResult = LifecycleOutcome<RecurringTaskSeries>>(
    operation: LifecycleOperation,
    request: TRequest,
  ): Promise<TResult> {
    const { data, error } = await this.supabase.rpc("recurring_task_lifecycle", {
      p_operation: operation,
      p_request: request,
    });
    if (error) throw error;
    return data as TResult;
  }
}

export function createSupabaseRecurringTaskLifecycle(
  supabase: SupabaseClient,
): SupabaseRecurringTaskLifecycle {
  return new SupabaseRecurringTaskLifecycle(supabase);
}
