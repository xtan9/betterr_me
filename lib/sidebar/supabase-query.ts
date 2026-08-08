import type { SupabaseClient } from "@supabase/supabase-js";

import { HabitsDB, TasksDB } from "@/lib/db";
import {
  type AuthenticatedRecurringTaskPrincipal,
  createCoverageRead,
} from "@/lib/recurring-tasks/coverage-read";

import {
  createSidebarCountsQuery,
  type SidebarCounts,
  type SidebarCountsQuery,
  type SidebarCountsQueryDependencies,
} from "./query";

/** Compose the authenticated sidebar query over materialized Task Occurrences. */
export function createSupabaseSidebarCountsQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): SidebarCountsQuery {
  const coverageRead = createCoverageRead({
    supabase,
    principal,
    source: "sidebar",
  });
  const habits = new HabitsDB(supabase);
  const tasks = new TasksDB(supabase);

  const dependencies: SidebarCountsQueryDependencies = {
    coverage: {
      ensure: ({ range }) => coverageRead.ensure(range),
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
