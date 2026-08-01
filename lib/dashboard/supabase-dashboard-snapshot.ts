import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HabitLogsDB,
  HabitMilestonesDB,
  HabitsDB,
  LocalizationDB,
  TasksDB,
} from "@/lib/db";
import { WorkoutsDB } from "@/lib/db/workouts";
import { ensureRecurringTaskCoverage } from "@/lib/recurring-tasks/coverage";

import {
  createDashboardSnapshot,
  type DashboardSnapshot,
} from "./dashboard-snapshot";

export function createSupabaseDashboardSnapshot(
  supabase: SupabaseClient,
): DashboardSnapshot {
  return createDashboardSnapshot({
    habits: new HabitsDB(supabase),
    tasks: new TasksDB(supabase),
    habitLogs: new HabitLogsDB(supabase),
    milestones: new HabitMilestonesDB(supabase),
    localization: new LocalizationDB(supabase),
    workouts: new WorkoutsDB(supabase),
    ensureRecurringCoverage: (userId, range) =>
      ensureRecurringTaskCoverage(supabase, userId, range),
  });
}
