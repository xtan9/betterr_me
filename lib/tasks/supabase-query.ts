import type { SupabaseClient } from "@supabase/supabase-js";

import { TasksDB } from "@/lib/db";
import {
  createCoverageRead,
  type AuthenticatedRecurringTaskPrincipal,
} from "@/lib/recurring-tasks/coverage-read";

import {
  createTaskQuery,
  type TaskQuery,
  type TaskQueryDependencies,
  type TaskReadQuery,
} from "./query";

/** Compose the authenticated task query over the materialized Task model. */
export function createSupabaseTaskQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): TaskQuery {
  const coverageRead = createCoverageRead({
    supabase,
    principal,
    source: "task",
  });
  const tasks = new TasksDB(supabase);

  const dependencies: TaskQueryDependencies = {
    coverage: {
      ensure: ({ range }) => coverageRead.ensure(range),
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
