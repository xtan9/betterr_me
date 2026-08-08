import type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
} from "@/lib/recurring-tasks";
import type { CoverageRead } from "@/lib/recurring-tasks/coverage-read";

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

export interface CalendarQueryDependencies {
  coverage: CoverageRead;
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
            completeness = await dependencies.coverage.ensure(
              coverageRequest.range,
              (cause) => reportCoverageFailure(options, coverageRequest, cause),
            );
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
