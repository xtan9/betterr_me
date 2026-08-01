import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/logger";
import {
  createSupabaseRecurringTaskLifecycle,
} from "./supabase-lifecycle";
import type { LocalDateRange } from "./lifecycle";

export type RecurringCoverageResult =
  | { status: "complete"; failedSeriesIds: [] }
  | { status: "partial"; failedSeriesIds: string[] };

/**
 * Ensure one exact local-date range for every owned Recurring Task Series.
 *
 * The database lifecycle owns the per-series transaction and serialization.
 * This adapter only translates the user-scoped read request and deliberately
 * keeps the legacy dashboard warning shape at the delivery boundary.
 */
export async function ensureRecurringTaskCoverage(
  supabase: SupabaseClient,
  userId: string,
  range: LocalDateRange,
): Promise<RecurringCoverageResult> {
  // Production Supabase clients expose rpc. A client without the lifecycle
  // boundary is an explicit degraded result, never a false success.
  if (typeof (supabase as unknown as { rpc?: unknown }).rpc !== "function") {
    return { status: "partial", failedSeriesIds: [] };
  }
  try {
    const outcome = await createSupabaseRecurringTaskLifecycle(supabase)
      .ensureUserCoverage({ userId, range });

    if (outcome.status === "complete" || outcome.status === "already-applied") {
      return { status: "complete", failedSeriesIds: [] };
    }

    log.warn("[recurring-lifecycle] coverage unavailable", {
      userId,
      from: range.from,
      to: range.to,
      outcome: outcome.status,
    });
    return { status: "partial", failedSeriesIds: [] };
  } catch (error) {
    log.error("[recurring-lifecycle] coverage failed", error, {
      userId,
      from: range.from,
      to: range.to,
    });
    throw error;
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
