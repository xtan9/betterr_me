import type { SupabaseClient } from "@supabase/supabase-js";

import { HabitsDB, TasksDB } from "@/lib/db";
import {
  createAuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskPrincipal,
  type CoverageCapabilityResult,
  type CoverageCompleteness,
} from "@/lib/recurring-tasks/capabilities";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";

import {
  createSidebarCountsQuery,
  unavailableSidebarCoverage,
  type SidebarCounts,
  type SidebarCountsQuery,
  type SidebarCountsQueryDependencies,
} from "./query";

/** Compose the authenticated sidebar query over materialized Task Occurrences. */
export function createSupabaseSidebarCountsQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): SidebarCountsQuery {
  const recurringCapabilities = createAuthenticatedRecurringTaskCapabilities(
    supabase,
    principal,
  );
  const habits = new HabitsDB(supabase);
  const tasks = new TasksDB(supabase);

  const dependencies: SidebarCountsQueryDependencies = {
    coverage: {
      async ensure({ principal: owner, range }) {
        const outcome = await recurringCapabilities.coverage.ensure({
          operationId: sidebarCoverageOperationId(owner.userId, range),
          range,
        });
        return coverageCompleteness(outcome, range);
      },
    },
    counts: {
      read: ({ principal: owner, date }) =>
        readSidebarCounts(habits, tasks, owner.userId, date),
    },
  };

  return createSidebarCountsQuery(principal, dependencies);
}

async function readSidebarCounts(
  habits: Pick<HabitsDB, "getHabitsWithTodayStatus">,
  tasks: Pick<TasksDB, "getTodayTasks">,
  userId: string,
  date: string,
): Promise<SidebarCounts> {
  const [habitsWithStatus, tasksDueToday] = await Promise.all([
    habits.getHabitsWithTodayStatus(userId, date),
    tasks.getTodayTasks(userId, date),
  ]);

  return {
    habits_incomplete: habitsWithStatus.filter(
      (habit) => !habit.completed_today,
    ).length,
    tasks_due: tasksDueToday.filter((task) => !task.is_completed).length,
  };
}

function coverageCompleteness(
  outcome: CoverageCapabilityResult,
  range: LocalDateRange,
): CoverageCompleteness {
  if (outcome.type === "coverage") return outcome.completeness;

  return unavailableSidebarCoverage(
    range,
    "reason" in outcome && typeof outcome.reason === "string"
      ? outcome.reason
      : undefined,
  );
}

function sidebarCoverageOperationId(
  userId: string,
  range: LocalDateRange,
): string {
  return `sidebar-read-coverage:${userId}:${range.from}:${range.to}`;
}
