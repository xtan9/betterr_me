import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HabitLogsDB,
  HabitMilestonesDB,
  HabitsDB,
  ProfilesDB,
  TasksDB,
} from "@/lib/db";
import { WorkoutsDB } from "@/lib/db/workouts";
import { ensureRecurringInstances } from "@/lib/recurring-tasks";

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
    profiles: new ProfilesDB(supabase),
    workouts: new WorkoutsDB(supabase),
    generateRecurringTasks: (userId, throughDate) =>
      ensureRecurringInstances(supabase, userId, throughDate),
  });
}
