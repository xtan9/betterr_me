import type { Task, TaskFilters } from "@/lib/db/types";
import type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
  LocalDateRange,
} from "@/lib/recurring-tasks";
import type { CoverageRead } from "@/lib/recurring-tasks/coverage-read";
import { addLocalDays } from "@/lib/recurring-tasks/scheduling";

export type { CoverageCompleteness } from "@/lib/recurring-tasks";

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

export interface TaskQueryReadRequest {
  principal: AuthenticatedRecurringTaskPrincipal;
  request: TaskReadQuery;
}

export interface TaskQueryDependencies {
  coverage: CoverageRead;
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
        completeness = await dependencies.coverage.ensure(range);

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
    return { from: dueDate, to: dueDate };
  }

  if (request.type === "upcoming") {
    return {
      from: request.date,
      to: addLocalDays(request.date, request.days ?? 7),
    };
  }
  return { from: request.date, to: request.date };
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
