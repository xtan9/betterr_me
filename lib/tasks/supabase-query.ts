import type { SupabaseClient } from "@supabase/supabase-js";

import { TasksDB } from "@/lib/db";
import {
  createAuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskPrincipal,
  type CoverageCapabilityResult,
} from "@/lib/recurring-tasks/capabilities";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";

import {
  createTaskQuery,
  unavailableTaskCoverage,
  type TaskQuery,
  type TaskQueryDependencies,
  type TaskReadQuery,
} from "./query";

/** Compose the authenticated task query over the materialized Task model. */
export function createSupabaseTaskQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): TaskQuery {
  const recurringCapabilities = createAuthenticatedRecurringTaskCapabilities(
    supabase,
    principal,
  );
  const tasks = new TasksDB(supabase);

  const dependencies: TaskQueryDependencies = {
    coverage: {
      async ensure({ principal: owner, range }) {
        const outcome = await recurringCapabilities.coverage.ensure({
          operationId: taskCoverageOperationId(owner.userId, range),
          range,
        });
        return coverageCompleteness(outcome, range);
      },
    },
    taskRead: {
      read: ({ principal: owner, request }) =>
        readMaterializedTasks(tasks, owner.userId, request),
    },
  };

  return createTaskQuery(principal, dependencies);
}

function readMaterializedTasks(
  tasks: Pick<
    TasksDB,
    "getTodayTasks" | "getUpcomingTasks" | "getOverdueTasks" | "getUserTasks"
  >,
  userId: string,
  request: TaskReadQuery,
) {
  switch (request.type) {
    case "today":
      return tasks.getTodayTasks(userId, request.date);
    case "upcoming":
      return tasks.getUpcomingTasks(userId, request.date, request.days);
    case "overdue":
      return tasks.getOverdueTasks(userId, request.date);
    case "list":
      return tasks.getUserTasks(userId, request.filters);
  }
}

function coverageCompleteness(
  outcome: CoverageCapabilityResult,
  range: LocalDateRange,
) {
  if (outcome.type === "coverage") return outcome.completeness;
  if (outcome.type === "coverage-unavailable") {
    return unavailableTaskCoverage(range, outcome.reason);
  }
  return unavailableTaskCoverage(range);
}

function taskCoverageOperationId(userId: string, range: LocalDateRange): string {
  return `task-read-coverage:${userId}:${range.from}:${range.to}`;
}
