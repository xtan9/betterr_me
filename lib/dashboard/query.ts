import type { DashboardData } from "@/lib/db/types";
import type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
  CoverageComplete,
  LocalDateRange,
  CoverageUnavailable,
} from "@/lib/recurring-tasks";
import { addLocalDays } from "@/lib/recurring-tasks/scheduling";

import type {
  DashboardSnapshot,
  DashboardSnapshotOutcome,
  DashboardSnapshotWarning,
} from "./dashboard-snapshot";
import {
  DASHBOARD_COVERAGE_WARNING_CODE,
  dashboardCoverageWarning,
  sortDashboardSnapshotWarnings,
} from "./dashboard-snapshot";

export type DashboardQueryCoveragePolicy = "return-available" | "fail";

export interface DashboardQueryReadOptions {
  onIncomplete?: DashboardQueryCoveragePolicy;
}

export interface DashboardQueryCoverageRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  range: LocalDateRange;
}

export interface DashboardQueryReadRequest {
  date: string;
}

export interface DashboardQueryDependencies {
  coverage: {
    ensure(
      request: DashboardQueryCoverageRequest,
    ): Promise<CoverageCompleteness>;
  };
  snapshot: Pick<DashboardSnapshot, "load">;
}

export interface CompleteDashboardQuery {
  status: "complete";
  snapshot: DashboardData;
  completeness: CoverageComplete;
}

export interface DegradedDashboardQuery {
  status: "degraded";
  snapshot: DashboardData;
  completeness: CoverageCompleteness;
  warnings: DashboardSnapshotWarning[];
}

export interface FailedDashboardQuery {
  status: "failed";
  completeness: CoverageCompleteness;
  error: {
    code: "required_data_unavailable" | "coverage_unavailable";
    message: string;
  };
}

export type DashboardQueryResult =
  | CompleteDashboardQuery
  | DegradedDashboardQuery
  | FailedDashboardQuery;

export interface DashboardQuery {
  read(
    request: DashboardQueryReadRequest,
    options?: DashboardQueryReadOptions,
  ): Promise<DashboardQueryResult>;
}

export { DASHBOARD_COVERAGE_WARNING_CODE, dashboardCoverageWarning };

export function unavailableDashboardCoverage(
  range: LocalDateRange,
  reason = "Coverage could not be ensured",
): CoverageUnavailable {
  return {
    status: "unavailable",
    type: "unavailable",
    requestedRange: range,
    failedSeriesIds: [],
    reason,
  };
}

export function createDashboardQuery(
  principal: AuthenticatedRecurringTaskPrincipal,
  dependencies: DashboardQueryDependencies,
): DashboardQuery {
  requireUserPrincipal(principal);

  return {
    async read({ date }, options = {}) {
      const range = { from: date, to: addLocalDays(date, 1) };
      let completeness: CoverageCompleteness;

      try {
        completeness = await dependencies.coverage.ensure({
          principal,
          range,
        });
      } catch {
        completeness = unavailableDashboardCoverage(range);
      }

      if (
        completeness.status !== "complete"
        && options.onIncomplete === "fail"
      ) {
        return {
          status: "failed",
          completeness,
          error: {
            code: "coverage_unavailable",
            message: "Recurring task coverage is temporarily unavailable.",
          },
        };
      }

      const snapshot = await dependencies.snapshot.load({
        userId: principal.userId,
        date,
      });
      return withCoverage(snapshot, completeness);
    },
  };
}

function withCoverage(
  snapshot: DashboardSnapshotOutcome,
  completeness: CoverageCompleteness,
): DashboardQueryResult {
  if (snapshot.status === "failed") {
    return { ...snapshot, completeness };
  }

  const warnings = snapshot.status === "degraded"
    ? [...snapshot.warnings]
    : [];
  if (completeness.status !== "complete") {
    warnings.push(dashboardCoverageWarning(completeness));
  }

  if (snapshot.status === "complete" && completeness.status === "complete") {
    return {
      status: "complete",
      snapshot: snapshot.snapshot,
      completeness,
    };
  }

  return {
    status: "degraded",
    snapshot: snapshot.snapshot,
    completeness,
    warnings: sortDashboardSnapshotWarnings(warnings),
  };
}

function requireUserPrincipal(
  principal: AuthenticatedRecurringTaskPrincipal,
): void {
  if (
    principal.type !== "user"
    || typeof principal.userId !== "string"
    || !principal.userId.trim()
  ) {
    throw new TypeError("An authenticated user principal is required");
  }
}
