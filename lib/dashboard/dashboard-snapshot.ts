import type {
  HabitLogsDB,
  HabitMilestonesDB,
  HabitsDB,
  LocalizationDB,
  TasksDB,
} from "@/lib/db";
import {
  DEFAULT_WEEK_START_PREFERENCE,
  weekStartPreferenceToDay,
} from "@/lib/preferences/owners";
import {
  ZERO_ABSENCE,
  type DashboardData,
  type HabitLog,
} from "@/lib/db/types";
import type { WorkoutsDB } from "@/lib/db/workouts";
import { computeMissedDays } from "@/lib/habits/absence";
import { log } from "@/lib/logger";
import type {
  RecurringCoverageResult,
} from "@/lib/recurring-tasks/coverage";
import type { LocalDateRange } from "@/lib/recurring-tasks/lifecycle";
import { addLocalDays } from "@/lib/recurring-tasks/recurrence";

export interface DashboardSnapshotDependencies {
  habits: Pick<HabitsDB, "getHabitsWithTodayStatusAcquisition">;
  tasks: Pick<TasksDB, "getTodayTasks" | "getTaskCount" | "getUserTasks">;
  habitLogs: Pick<HabitLogsDB, "getAllUserLogs">;
  milestones: Pick<HabitMilestonesDB, "getTodaysMilestones">;
  localization: Pick<LocalizationDB, "getWeekStartPreference">;
  workouts: Pick<WorkoutsDB, "getLastCompletedAt" | "getWeekWorkoutCount">;
  ensureRecurringCoverage(
    userId: string,
    range: { from: string; to: string },
  ): Promise<RecurringCoverageResult>;
}

export interface DashboardSnapshotInput {
  userId: string;
  date: string;
}

export interface CompleteDashboardSnapshot {
  status: "complete";
  snapshot: DashboardData;
}

export interface DashboardSnapshotWarning {
  code: DashboardSnapshotWarningCode;
  message: string;
  type?: "coverage-unavailable";
  requestedRange?: LocalDateRange;
  failedSeriesIds?: string[];
  habitId?: string;
}

export interface DegradedDashboardSnapshot {
  status: "degraded";
  snapshot: DashboardData;
  warnings: DashboardSnapshotWarning[];
}

export interface FailedDashboardSnapshot {
  status: "failed";
  error: {
    code: "required_data_unavailable";
    message: string;
  };
}

export type DashboardSnapshotOutcome =
  | CompleteDashboardSnapshot
  | DegradedDashboardSnapshot
  | FailedDashboardSnapshot;

export interface DashboardSnapshot {
  load(input: DashboardSnapshotInput): Promise<DashboardSnapshotOutcome>;
}

function offsetDate(date: string, days: number): string {
  return addLocalDays(date, days);
}

function getWeekStartDate(date: string, weekStartDay: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const currentDay = new Date(year, month - 1, day).getDay();
  const daysToSubtract = (currentDay - weekStartDay + 7) % 7;
  return offsetDate(date, -daysToSubtract);
}

const WARNING_DEFINITIONS = {
  habit_logs_unavailable: {
    message:
      "Absence data is unavailable because habit logs are temporarily unavailable.",
    priority: 0,
  },
  habit_enrichment_unavailable: {
    message: "Absence data is temporarily unavailable for one habit.",
    priority: 1,
  },
  habit_history_unavailable: {
    message:
      "Habit completion rates and graduation eligibility are temporarily unavailable.",
    priority: 2,
  },
  recurring_coverage_unavailable: {
    message:
      "Some recurring tasks may not appear because Coverage Horizon is unavailable for the requested range.",
    priority: 3,
  },
  localization_unavailable: {
    message:
      "The default Monday week boundary was used because Localization Preference is temporarily unavailable.",
    priority: 4,
  },
  milestones_unavailable: {
    message: "Today's milestones are temporarily unavailable.",
    priority: 5,
  },
  last_workout_unavailable: {
    message: "The latest workout date is temporarily unavailable.",
    priority: 6,
  },
  week_workout_count_unavailable: {
    message: "This week's workout count is temporarily unavailable.",
    priority: 7,
  },
};

export type DashboardSnapshotWarningCode = keyof typeof WARNING_DEFINITIONS;

function warning(
  code: DashboardSnapshotWarningCode,
  details: Partial<Pick<
    DashboardSnapshotWarning,
    "type" | "requestedRange" | "failedSeriesIds" | "habitId"
  >> = {},
): DashboardSnapshotWarning {
  return { code, message: WARNING_DEFINITIONS[code].message, ...details };
}

function recurringWarningDetails(
  requestedRange: LocalDateRange,
  result?: RecurringCoverageResult,
): Pick<
  DashboardSnapshotWarning,
  "type" | "requestedRange" | "failedSeriesIds"
> {
  const failedSeriesIds = result && "failedSeriesIds" in result
    ? result.failedSeriesIds
    : [];
  return {
    type: "coverage-unavailable",
    requestedRange,
    failedSeriesIds,
  };
}

async function optional<T>(
  promise: Promise<T>,
  fallback: T,
  warningCode: DashboardSnapshotWarningCode,
  context: { userId: string; date: string },
): Promise<{ value: T; warning?: DashboardSnapshotWarning }> {
  try {
    return { value: await promise };
  } catch (error) {
    log.error(
      `[dashboard-snapshot] ${warningCode}`,
      error,
      context,
    );
    return { value: fallback, warning: warning(warningCode) };
  }
}

function acquireRequiredDashboardData(
  dependencies: DashboardSnapshotDependencies,
  userId: string,
  date: string,
  tomorrow: string,
) {
  return Promise.all([
    dependencies.habits.getHabitsWithTodayStatusAcquisition(userId, date),
    dependencies.tasks.getTodayTasks(userId, date),
    dependencies.tasks.getTaskCount(userId),
    dependencies.tasks.getUserTasks(userId, {
      due_date: tomorrow,
      is_completed: false,
    }),
  ]);
}

export function createDashboardSnapshot(
  dependencies: DashboardSnapshotDependencies,
): DashboardSnapshot {
  return {
    async load({ userId, date }) {
      const tomorrow = addLocalDays(date, 1);
      const lookbackStart = offsetDate(date, -30);
      const warnings: DashboardSnapshotWarning[] = [];

      try {
        const recurringResult = await dependencies.ensureRecurringCoverage(userId, {
          from: date,
          to: tomorrow,
        });
        if (recurringResult.status === "partial") {
          warnings.push(warning(
            "recurring_coverage_unavailable",
            recurringWarningDetails({ from: date, to: tomorrow }, recurringResult),
          ));
        }
      } catch (error) {
        log.error(
          "[dashboard-snapshot] recurring generation unavailable",
          error,
          { userId, date },
        );
        warnings.push(warning(
          "recurring_coverage_unavailable",
          recurringWarningDetails({ from: date, to: tomorrow }),
        ));
      }

      let requiredData: Awaited<
        ReturnType<typeof acquireRequiredDashboardData>
      >;
      try {
        requiredData = await acquireRequiredDashboardData(
          dependencies,
          userId,
          date,
          tomorrow,
        );
      } catch (error) {
        log.error(
          "[dashboard-snapshot] required data unavailable",
          error,
          { userId, date },
        );
        return {
          status: "failed",
          error: {
            code: "required_data_unavailable",
            message: "Required dashboard data is temporarily unavailable.",
          },
        };
      }
      const [habitAcquisition, tasksToday, totalTaskCount, tasksTomorrow] =
        requiredData;
      const habits = habitAcquisition.habits;
      if (habitAcquisition.status === "degraded") {
        warnings.push(warning("habit_history_unavailable"));
      }

      const localizationResult = await optional(
        dependencies.localization.getWeekStartPreference(userId),
        null,
        "localization_unavailable",
        { userId, date },
      );
      if (localizationResult.warning) warnings.push(localizationResult.warning);
      const weekStartPreference =
        localizationResult.value ?? DEFAULT_WEEK_START_PREFERENCE;
      const weekStartDay = weekStartPreferenceToDay(weekStartPreference);
      const weekStartDate = getWeekStartDate(date, weekStartDay);

      const [
        logsResult,
        milestonesResult,
        lastWorkoutResult,
        weekWorkoutCountResult,
      ] =
        await Promise.all([
          optional(
            dependencies.habitLogs.getAllUserLogs(
              userId,
              lookbackStart,
              date,
            ),
            [],
            "habit_logs_unavailable",
            { userId, date },
          ),
          optional(
            dependencies.milestones.getTodaysMilestones(userId, date),
            [],
            "milestones_unavailable",
            { userId, date },
          ),
          optional(
            dependencies.workouts.getLastCompletedAt(userId),
            null,
            "last_workout_unavailable",
            { userId, date },
          ),
          optional(
            dependencies.workouts.getWeekWorkoutCount(userId, weekStartDate),
            0,
            "week_workout_count_unavailable",
            { userId, date },
          ),
        ]);
      const optionalResults = [
        logsResult,
        milestonesResult,
        lastWorkoutResult,
        weekWorkoutCountResult,
      ];
      warnings.push(
        ...optionalResults.flatMap((result) =>
          result.warning ? [result.warning] : [],
        ),
      );
      const logs = logsResult.value;
      const milestonesToday = milestonesResult.value;
      const lastWorkoutAt = lastWorkoutResult.value;
      const weekWorkoutCount = weekWorkoutCountResult.value;

      const completedLogsByHabit = new Map<string, Set<string>>();
      for (const log of logs as Pick<
        HabitLog,
        "habit_id" | "logged_date" | "completed"
      >[]) {
        if (!log.completed) continue;
        const completedDates =
          completedLogsByHabit.get(log.habit_id) ?? new Set<string>();
        completedDates.add(log.logged_date);
        completedLogsByHabit.set(log.habit_id, completedDates);
      }

      const enrichedHabits = habits.map((habit) => {
        if (logsResult.warning) {
          return { ...habit, ...ZERO_ABSENCE };
        }
        try {
          return {
            ...habit,
            ...computeMissedDays(
              habit.frequency,
              completedLogsByHabit.get(habit.id) ?? new Set<string>(),
              date,
              habit.created_at,
              lookbackStart,
              weekStartDay,
            ),
          };
        } catch (error) {
          log.error(
            "[dashboard-snapshot] habit enrichment unavailable",
            error,
            { userId, date, habitId: habit.id },
          );
          warnings.push(
            warning("habit_enrichment_unavailable", { habitId: habit.id }),
          );
          return { ...habit, ...ZERO_ABSENCE };
        }
      });

      const snapshot: DashboardData = {
          habits: enrichedHabits,
          tasks_today: tasksToday,
          tasks_tomorrow: tasksTomorrow,
          milestones_today: milestonesToday,
          stats: {
            total_habits: enrichedHabits.length,
            completed_today: enrichedHabits.filter(
              (habit) => habit.completed_today,
            ).length,
            current_best_streak: enrichedHabits.reduce(
              (best, habit) => Math.max(best, habit.current_streak),
              0,
            ),
            total_tasks: totalTaskCount,
            tasks_due_today: tasksToday.length,
            tasks_completed_today: tasksToday.filter(
              (task) => task.is_completed,
            ).length,
            last_workout_at: lastWorkoutAt,
            week_workout_count: weekWorkoutCount,
          },
      };
      warnings.sort(
        (left, right) =>
          WARNING_DEFINITIONS[left.code].priority -
          WARNING_DEFINITIONS[right.code].priority,
      );
      return warnings.length === 0
        ? { status: "complete" as const, snapshot }
        : { status: "degraded" as const, snapshot, warnings };
    },
  };
}
