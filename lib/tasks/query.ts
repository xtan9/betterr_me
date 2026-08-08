import type { Task, TaskFilters } from "@/lib/db/types";
import type { AuthenticatedRecurringTaskPrincipal } from "@/lib/recurring-tasks/capabilities";
import type {
  CoverageCompleteness,
  CoverageUnavailable,
} from "@/lib/recurring-tasks/capabilities";
import {
  taskReadCoverageRange,
  type TaskReadCoverageRequest,
} from "@/lib/recurring-tasks/coverage";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";

export type { CoverageCompleteness } from "@/lib/recurring-tasks/capabilities";

export type TaskReadQuery =
  | {
      type: "today";
      date: string;
    }
  | {
      type: "upcoming";
      date: string;
      days?: number;
    }
  | {
      type: "overdue";
      date: string;
    }
  | {
      type: "list";
      filters?: TaskFilters;
    };

export type TaskQueryCoveragePolicy = "return-available" | "fail";

export interface TaskQueryReadOptions {
  onIncomplete?: TaskQueryCoveragePolicy;
}

export interface TaskQueryCoverageRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  range: LocalDateRange;
}

export interface TaskQueryReadRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  request: TaskReadQuery;
}

export interface TaskQueryDependencies {
  coverage: {
    ensure(request: TaskQueryCoverageRequest): Promise<CoverageCompleteness>;
  };
  taskRead: {
    read(request: TaskQueryReadRequest): Promise<Task[]>;
  };
}

export interface TaskQueryResult {
  tasks: Task[];
  /** Null means this read had no requested date-bounded Coverage. */
  completeness: CoverageCompleteness | null;
}

export interface TaskQuery {
  read(
    request: TaskReadQuery,
    options?: TaskQueryReadOptions,
  ): Promise<TaskQueryResult>;
}

export const TASK_COVERAGE_WARNING_CODE =
  "recurring_coverage_unavailable" as const;

export interface TaskCoverageWarning {
  code: typeof TASK_COVERAGE_WARNING_CODE;
  type: "coverage-unavailable";
  message: string;
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
}

type IncompleteCoverage = Exclude<CoverageCompleteness, { status: "complete" }>;

/** A typed failure used by AI task reads when Coverage is incomplete. */
export class TaskCoverageUnavailableError extends Error {
  readonly completeness: IncompleteCoverage;
  readonly warning: TaskCoverageWarning;

  constructor(completeness: IncompleteCoverage) {
    const warning = taskCoverageWarning(completeness);
    super(warning.message);
    this.name = "RecurringCoverageUnavailableError";
    this.completeness = completeness;
    this.warning = warning;
  }
}

export function taskCoverageWarning(
  completeness: IncompleteCoverage,
): TaskCoverageWarning {
  return {
    code: TASK_COVERAGE_WARNING_CODE,
    type: "coverage-unavailable",
    message: "Recurring task coverage is unavailable for the requested date range.",
    requestedRange: completeness.requestedRange,
    failedSeriesIds: [...new Set(completeness.failedSeriesIds)].sort(),
  };
}

export function unavailableTaskCoverage(
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

export function createTaskQuery(
  principal: AuthenticatedRecurringTaskPrincipal,
  dependencies: TaskQueryDependencies,
): TaskQuery {
  requireUserPrincipal(principal);

  return {
    async read(request, options = {}) {
      const range = taskQueryCoverageRange(request);
      let completeness: CoverageCompleteness | null = null;

      if (range) {
        try {
          completeness = await dependencies.coverage.ensure({
            principal,
            range,
          });
        } catch {
          completeness = unavailableTaskCoverage(range);
        }

        if (
          completeness.status !== "complete"
          && options.onIncomplete === "fail"
        ) {
          return { tasks: [], completeness };
        }
      }

      const tasks = await dependencies.taskRead.read({ principal, request });
      return { tasks, completeness };
    },
  };
}

function taskQueryCoverageRange(
  request: TaskReadQuery,
): LocalDateRange | undefined {
  if (request.type === "list") {
    const dueDate = request.filters?.due_date;
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return undefined;
    return taskReadCoverageRange({ dueDate });
  }

  const coverageRequest: TaskReadCoverageRequest = {
    view: request.type,
    date: request.date,
    ...(request.type === "upcoming" ? { days: request.days } : {}),
  };
  return taskReadCoverageRange(coverageRequest);
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
