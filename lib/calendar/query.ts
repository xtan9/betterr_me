import type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
  CoverageUnavailable,
} from "@/lib/recurring-tasks";

import {
  queryCalendarOverlayFeed,
  type CalendarOverlayCapabilities,
  type CalendarOverlayLayer,
  type CalendarOverlayQueryOptions,
  type CalendarOverlayQueryOutcome,
  type CalendarOverlayReadCapabilities,
  type LocalDateRange,
  type TaskOverlayRequest,
  type TaskCoverageResult,
} from "./overlay-feed";

export interface CalendarQueryReadRequest {
  range: LocalDateRange;
  layers: readonly CalendarOverlayLayer[];
  timezone?: string;
}

export interface CalendarQueryCoverageRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  range: LocalDateRange;
}

export interface CalendarQueryDependencies {
  coverage: {
    ensure(request: CalendarQueryCoverageRequest): Promise<CoverageCompleteness>;
  };
  overlay: CalendarOverlayReadCapabilities;
}

export type CalendarQueryResult = CalendarOverlayQueryOutcome & {
  /** Null when the task Calendar Layer was not selected. */
  completeness: CoverageCompleteness | null;
};

export interface CalendarQuery {
  read(
    request: CalendarQueryReadRequest,
    options?: CalendarOverlayQueryOptions,
  ): Promise<CalendarQueryResult>;
}

export function unavailableCalendarCoverage(
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

/**
 * Compose an authenticated Calendar query over materialized Task Occurrences.
 * Calendar Events are intentionally not part of this capability.
 */
export function createCalendarQuery(
  principal: AuthenticatedRecurringTaskPrincipal,
  dependencies: CalendarQueryDependencies,
): CalendarQuery {
  requireUserPrincipal(principal);

  return {
    async read(request, options = {}) {
      let completeness: CoverageCompleteness | null = null;
      const capabilities: CalendarOverlayCapabilities = {
        ...dependencies.overlay,
        coverage: {
          ensureThrough: async (coverageRequest): Promise<TaskCoverageResult> => {
            try {
              completeness = await dependencies.coverage.ensure({
                principal,
                range: coverageRequest.range,
              });
            } catch (cause) {
              completeness = unavailableCalendarCoverage(coverageRequest.range);
              reportCoverageFailure(options, coverageRequest, cause);
            }
            return toTaskCoverageResult(completeness);
          },
        },
      };

      const outcome = await queryCalendarOverlayFeed(
        {
          userId: principal.userId,
          range: request.range,
          layers: request.layers,
          ...(request.timezone === undefined ? {} : { timezone: request.timezone }),
        },
        capabilities,
        options,
      );

      return {
        ...outcome,
        completeness,
      };
    },
  };
}

function toTaskCoverageResult(
  completeness: CoverageCompleteness | null,
): TaskCoverageResult {
  if (completeness?.status === "complete") return { status: "complete" };
  return {
    status: completeness?.status === "unavailable" ? "unavailable" : "partial",
    failedSeriesIds: completeness?.failedSeriesIds ?? [],
  };
}

function reportCoverageFailure(
  options: CalendarOverlayQueryOptions,
  request: TaskOverlayRequest,
  cause: unknown,
): void {
  try {
    options.reportFailure?.({ layer: "tasks", request, cause });
  } catch {
    // Reporting must not change the classified acquisition outcome.
  }
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
