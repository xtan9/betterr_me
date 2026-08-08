import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HabitLogsDB,
  HabitMilestonesDB,
  HabitsDB,
  LocalizationDB,
  TasksDB,
} from "@/lib/db";
import { WorkoutsDB } from "@/lib/db/workouts";
import {
  createCoverageRead,
  type AuthenticatedRecurringTaskPrincipal,
} from "@/lib/recurring-tasks/coverage-read";

import { createDashboardQuery, type DashboardQuery } from "./query";
import { createDashboardSnapshot } from "./dashboard-snapshot";

/** Compose the authenticated dashboard query over materialized Task Occurrences. */
export function createSupabaseDashboardQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): DashboardQuery {
  const coverageRead = createCoverageRead({
    supabase,
    principal,
    source: "dashboard",
  });

  const dashboardSnapshot = createDashboardSnapshot({
    habits: new HabitsDB(supabase),
    tasks: new TasksDB(supabase),
    habitLogs: new HabitLogsDB(supabase),
    milestones: new HabitMilestonesDB(supabase),
    localization: new LocalizationDB(supabase),
    workouts: new WorkoutsDB(supabase),
  });

  return createDashboardQuery(principal, {
    coverage: coverageRead,
    snapshot: dashboardSnapshot,
  });
}
