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
  createAuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskPrincipal,
  type CoverageCapabilityResult,
  type CoverageCompleteness,
} from "@/lib/recurring-tasks/capabilities";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";

import { createDashboardQuery, unavailableDashboardCoverage, type DashboardQuery } from "./query";
import { createDashboardSnapshot } from "./dashboard-snapshot";

/** Compose the authenticated dashboard query over materialized Task Occurrences. */
export function createSupabaseDashboardQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): DashboardQuery {
  const recurringCapabilities = createAuthenticatedRecurringTaskCapabilities(
    supabase,
    principal,
  );

  const dashboardSnapshot = createDashboardSnapshot({
    habits: new HabitsDB(supabase),
    tasks: new TasksDB(supabase),
    habitLogs: new HabitLogsDB(supabase),
    milestones: new HabitMilestonesDB(supabase),
    localization: new LocalizationDB(supabase),
    workouts: new WorkoutsDB(supabase),
  });

  return createDashboardQuery(principal, {
    coverage: {
      async ensure({ principal: owner, range }) {
        const outcome = await recurringCapabilities.coverage.ensure({
          operationId: dashboardCoverageOperationId(owner.userId, range),
          range,
        });
        return coverageCompleteness(outcome, range);
      },
    },
    snapshot: dashboardSnapshot,
  });
}

function coverageCompleteness(
  outcome: CoverageCapabilityResult,
  range: LocalDateRange,
): CoverageCompleteness {
  if (outcome.type === "coverage") return outcome.completeness;
  if (outcome.type === "coverage-unavailable") {
    return unavailableDashboardCoverage(range, outcome.reason);
  }
  return unavailableDashboardCoverage(
    range,
    "reason" in outcome && typeof outcome.reason === "string"
      ? outcome.reason
      : undefined,
  );
}

function dashboardCoverageOperationId(
  userId: string,
  range: LocalDateRange,
): string {
  return `dashboard-read-coverage:${userId}:${range.from}:${range.to}`;
}
