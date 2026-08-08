import type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
  CoverageComplete,
  CoverageUnavailable,
} from "@/lib/recurring-tasks/capabilities";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";

export interface SidebarCounts {
  habits_incomplete: number;
  tasks_due: number;
}

export interface SidebarCountsCoverageRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  range: LocalDateRange;
}

export interface SidebarCountsReadRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  date: string;
}

export interface SidebarCountsQueryDependencies {
  coverage: {
    ensure(
      request: SidebarCountsCoverageRequest,
    ): Promise<CoverageCompleteness>;
  };
  counts: {
    read(request: SidebarCountsReadRequest): Promise<SidebarCounts>;
  };
}

export interface SidebarCoverageWarning {
  code: "recurring_coverage_unavailable";
  type: "coverage-unavailable";
  message: string;
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
}

type IncompleteCoverage = Exclude<CoverageCompleteness, { status: "complete" }>;

export interface CompleteSidebarCountsQuery {
  status: "complete";
  counts: SidebarCounts;
  completeness: CoverageComplete;
}

export interface FailedSidebarCountsQuery {
  status: "failed";
  completeness: IncompleteCoverage;
  warning: SidebarCoverageWarning;
  error: {
    code: "coverage_unavailable";
    message: "Recurring task coverage is temporarily unavailable.";
  };
}

export type SidebarCountsQueryResult =
  | CompleteSidebarCountsQuery
  | FailedSidebarCountsQuery;

export interface SidebarCountsQuery {
  read(request: { date: string }): Promise<SidebarCountsQueryResult>;
}

export function sidebarCoverageWarning(
  completeness: IncompleteCoverage,
): SidebarCoverageWarning {
  return {
    code: "recurring_coverage_unavailable",
    type: "coverage-unavailable",
    message: "Recurring task coverage is unavailable for the requested date range.",
    requestedRange: completeness.requestedRange,
    failedSeriesIds: [...new Set(completeness.failedSeriesIds)].sort(),
  };
}

export function unavailableSidebarCoverage(
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

export function createSidebarCountsQuery(
  principal: AuthenticatedRecurringTaskPrincipal,
  dependencies: SidebarCountsQueryDependencies,
): SidebarCountsQuery {
  requireUserPrincipal(principal);

  return {
    async read({ date }) {
      const range = { from: date, to: date };
      let completeness: CoverageCompleteness;

      try {
        completeness = await dependencies.coverage.ensure({
          principal,
          range,
        });
      } catch {
        completeness = unavailableSidebarCoverage(range);
      }

      if (completeness.status !== "complete") {
        return {
          status: "failed",
          completeness,
          warning: sidebarCoverageWarning(completeness),
          error: {
            code: "coverage_unavailable",
            message: "Recurring task coverage is temporarily unavailable.",
          },
        };
      }

      return {
        status: "complete",
        counts: await dependencies.counts.read({ principal, date }),
        completeness,
      };
    },
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
