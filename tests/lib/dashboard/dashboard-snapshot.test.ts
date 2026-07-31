import { describe, expect, it, vi } from "vitest";

import {
  createDashboardSnapshot,
  type DashboardSnapshotDependencies,
} from "@/lib/dashboard/dashboard-snapshot";

vi.mock("@/lib/logger", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

function createDependencies(
  overrides: Partial<DashboardSnapshotDependencies> = {},
): DashboardSnapshotDependencies {
  return {
    habits: {
      getHabitsWithTodayStatusAcquisition: vi.fn().mockResolvedValue({
        habits: [
          {
            id: "habit-1",
            current_streak: 4,
            completed_today: true,
            frequency: { type: "daily" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        status: "complete",
      }),
    } as DashboardSnapshotDependencies["habits"],
    tasks: {
      getTodayTasks: vi.fn().mockResolvedValue([
        { id: "task-1", is_completed: true },
        { id: "task-2", is_completed: false },
      ]),
      getTaskCount: vi.fn().mockResolvedValue(5),
      getUserTasks: vi.fn().mockResolvedValue([
        { id: "task-3", is_completed: false },
      ]),
    } as DashboardSnapshotDependencies["tasks"],
    habitLogs: {
      getAllUserLogs: vi.fn().mockResolvedValue([
        {
          habit_id: "habit-1",
          logged_date: "2026-02-08",
          completed: true,
        },
      ]),
    } as DashboardSnapshotDependencies["habitLogs"],
    milestones: {
      getTodaysMilestones: vi.fn().mockResolvedValue([
        { id: "milestone-1", milestone: 7 },
      ]),
    } as DashboardSnapshotDependencies["milestones"],
    profiles: {
      getProfile: vi.fn().mockResolvedValue({
        preferences: { week_start_day: 0 },
      }),
    } as DashboardSnapshotDependencies["profiles"],
    workouts: {
      getLastCompletedAt: vi.fn().mockResolvedValue("2026-02-08T10:00:00Z"),
      getWeekWorkoutCount: vi.fn().mockResolvedValue(3),
    } as DashboardSnapshotDependencies["workouts"],
    generateRecurringTasks: vi.fn().mockResolvedValue({
      status: "complete",
      failedTemplateIds: [],
    }),
    ...overrides,
  };
}

describe("DashboardSnapshot", () => {
  it("returns a complete snapshot with all dashboard windows and enrichment", async () => {
    const dependencies = createDependencies();
    const snapshot = createDashboardSnapshot(dependencies);

    const outcome = await snapshot.load({
      userId: "user-1",
      date: "2026-02-09",
    });

    expect(outcome).toEqual({
      status: "complete",
      snapshot: {
        habits: [
          {
            id: "habit-1",
            current_streak: 4,
            completed_today: true,
            frequency: { type: "daily" },
            created_at: "2026-01-01T00:00:00Z",
            missed_scheduled_periods: 0,
            previous_streak: 1,
            absence_unit: "days",
          },
        ],
        tasks_today: [
          { id: "task-1", is_completed: true },
          { id: "task-2", is_completed: false },
        ],
        tasks_tomorrow: [{ id: "task-3", is_completed: false }],
        milestones_today: [{ id: "milestone-1", milestone: 7 }],
        stats: {
          total_habits: 1,
          completed_today: 1,
          current_best_streak: 4,
          total_tasks: 5,
          tasks_due_today: 2,
          tasks_completed_today: 1,
          last_workout_at: "2026-02-08T10:00:00Z",
          week_workout_count: 3,
        },
      },
    });
    expect(dependencies.generateRecurringTasks).toHaveBeenCalledWith(
      "user-1",
      "2026-02-16",
    );
    expect(dependencies.habitLogs.getAllUserLogs).toHaveBeenCalledWith(
      "user-1",
      "2026-01-10",
      "2026-02-09",
    );
    expect(dependencies.tasks.getUserTasks).toHaveBeenCalledWith("user-1", {
      due_date: "2026-02-10",
      is_completed: false,
    });
    expect(dependencies.workouts.getWeekWorkoutCount).toHaveBeenCalledWith(
      "user-1",
      "2026-02-08",
    );
  });

  it("degrades when recurring generation reports partial template failures", async () => {
    const dependencies = createDependencies({
      generateRecurringTasks: vi.fn().mockResolvedValue({
        status: "partial",
        failedTemplateIds: ["template-2"],
      }),
    });
    const snapshot = createDashboardSnapshot(dependencies);

    const outcome = await snapshot.load({
      userId: "user-1",
      date: "2026-02-09",
    });

    expect(outcome.status).toBe("degraded");
    if (outcome.status !== "degraded") {
      throw new Error("Expected degraded snapshot");
    }
    expect(outcome.warnings).toEqual([
      {
        code: "recurring_generation_unavailable",
        message:
          "Some recurring tasks may not appear because generation is temporarily unavailable.",
      },
    ]);
  });

  it("includes tasks generated for the requested window before acquiring tasks", async () => {
    let finishRecurringGeneration: (() => void) | undefined;
    const recurringGeneration = new Promise<{
      status: "complete";
      failedTemplateIds: [];
    }>((resolve) => {
      finishRecurringGeneration = () =>
        resolve({ status: "complete", failedTemplateIds: [] });
    });
    let taskAcquisitionStarted = false;
    const dependencies = createDependencies({
      generateRecurringTasks: vi.fn().mockReturnValue(recurringGeneration),
      tasks: {
        getTodayTasks: vi.fn().mockImplementation(async () => {
          taskAcquisitionStarted = true;
          return [{ id: "generated-task", is_completed: false }];
        }),
        getTaskCount: vi.fn().mockResolvedValue(1),
        getUserTasks: vi.fn().mockResolvedValue([]),
      } as DashboardSnapshotDependencies["tasks"],
    });

    const outcomePromise = createDashboardSnapshot(dependencies).load({
      userId: "user-1",
      date: "2026-02-09",
    });
    await Promise.resolve();

    expect(taskAcquisitionStarted).toBe(false);
    finishRecurringGeneration?.();
    const outcome = await outcomePromise;

    expect(outcome.status).not.toBe("failed");
    if (outcome.status === "failed") {
      throw new Error("Expected a dashboard snapshot");
    }
    expect(outcome.snapshot.tasks_today).toEqual([
      { id: "generated-task", is_completed: false },
    ]);
  });

  it("warns when optional habit history enrichment is unavailable", async () => {
    const dependencies = createDependencies({
      habits: {
        getHabitsWithTodayStatusAcquisition: vi.fn().mockResolvedValue({
          habits: [
            {
              id: "habit-1",
              current_streak: 4,
              completed_today: true,
              frequency: { type: "daily" },
              created_at: "2026-01-01T00:00:00Z",
              monthly_completion_rate: 0,
              graduation_eligible: false,
            },
          ],
          status: "degraded",
        }),
      } as DashboardSnapshotDependencies["habits"],
    });

    const outcome = await createDashboardSnapshot(dependencies).load({
      userId: "user-1",
      date: "2026-02-09",
    });

    expect(outcome.status).toBe("degraded");
    if (outcome.status !== "degraded") {
      throw new Error("Expected a degraded dashboard snapshot");
    }
    expect(outcome.warnings).toContainEqual({
      code: "habit_history_unavailable",
      message:
        "Habit completion rates and graduation eligibility are temporarily unavailable.",
    });
  });

  it("returns a degraded snapshot with warnings and predictable optional fallbacks", async () => {
    const dependencies = createDependencies({
      habitLogs: {
        getAllUserLogs: vi.fn().mockRejectedValue(new Error("logs unavailable")),
      } as DashboardSnapshotDependencies["habitLogs"],
      milestones: {
        getTodaysMilestones: vi
          .fn()
          .mockRejectedValue(new Error("milestones unavailable")),
      } as DashboardSnapshotDependencies["milestones"],
      profiles: {
        getProfile: vi.fn().mockRejectedValue(new Error("profile unavailable")),
      } as DashboardSnapshotDependencies["profiles"],
      workouts: {
        getLastCompletedAt: vi
          .fn()
          .mockRejectedValue(new Error("last workout unavailable")),
        getWeekWorkoutCount: vi
          .fn()
          .mockRejectedValue(new Error("workout count unavailable")),
      } as DashboardSnapshotDependencies["workouts"],
      generateRecurringTasks: vi
        .fn()
        .mockRejectedValue(new Error("generation unavailable")),
    });
    const snapshot = createDashboardSnapshot(dependencies);

    const outcome = await snapshot.load({
      userId: "user-1",
      date: "2026-02-11",
    });

    expect(outcome).toEqual({
      status: "degraded",
      snapshot: {
        habits: [
          {
            id: "habit-1",
            current_streak: 4,
            completed_today: true,
            frequency: { type: "daily" },
            created_at: "2026-01-01T00:00:00Z",
            missed_scheduled_periods: 0,
            previous_streak: 0,
            absence_unit: "days",
          },
        ],
        tasks_today: [
          { id: "task-1", is_completed: true },
          { id: "task-2", is_completed: false },
        ],
        tasks_tomorrow: [{ id: "task-3", is_completed: false }],
        milestones_today: [],
        stats: {
          total_habits: 1,
          completed_today: 1,
          current_best_streak: 4,
          total_tasks: 5,
          tasks_due_today: 2,
          tasks_completed_today: 1,
          last_workout_at: null,
          week_workout_count: 0,
        },
      },
      warnings: [
        {
          code: "habit_logs_unavailable",
          message:
            "Absence data is unavailable because habit logs are temporarily unavailable.",
        },
        {
          code: "recurring_generation_unavailable",
          message:
            "Some recurring tasks may not appear because generation is temporarily unavailable.",
        },
        {
          code: "profile_unavailable",
          message:
            "The default Monday week boundary was used because profile preferences are temporarily unavailable.",
        },
        {
          code: "milestones_unavailable",
          message: "Today's milestones are temporarily unavailable.",
        },
        {
          code: "last_workout_unavailable",
          message: "The latest workout date is temporarily unavailable.",
        },
        {
          code: "week_workout_count_unavailable",
          message: "This week's workout count is temporarily unavailable.",
        },
      ],
    });
    expect(dependencies.workouts.getWeekWorkoutCount).toHaveBeenCalledWith(
      "user-1",
      "2026-02-09",
    );
  });

  it("returns a defined failed outcome when required dashboard data is unavailable", async () => {
    const dependencies = createDependencies({
      tasks: {
        getTodayTasks: vi.fn().mockRejectedValue(new Error("tasks unavailable")),
        getTaskCount: vi.fn().mockResolvedValue(5),
        getUserTasks: vi.fn().mockResolvedValue([]),
      } as DashboardSnapshotDependencies["tasks"],
    });
    const snapshot = createDashboardSnapshot(dependencies);

    const outcome = await snapshot.load({
      userId: "user-1",
      date: "2026-02-09",
    });

    expect(outcome).toEqual({
      status: "failed",
      error: {
        code: "required_data_unavailable",
        message: "Required dashboard data is temporarily unavailable.",
      },
    });
  });

  it("degrades only the habit whose enrichment fails", async () => {
    const brokenFrequency = new Proxy(
      { type: "daily" },
      {
        get() {
          throw new Error("invalid frequency");
        },
      },
    );
    const dependencies = createDependencies({
      habits: {
        getHabitsWithTodayStatusAcquisition: vi.fn().mockResolvedValue({
          habits: [
            {
              id: "habit-broken",
              current_streak: 2,
              completed_today: false,
              frequency: brokenFrequency,
              created_at: "2026-01-01T00:00:00Z",
            },
            {
              id: "habit-enriched",
              current_streak: 6,
              completed_today: true,
              frequency: { type: "weekly", days: [1] },
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          status: "complete",
        }),
      } as DashboardSnapshotDependencies["habits"],
    });
    const snapshot = createDashboardSnapshot(dependencies);

    const outcome = await snapshot.load({
      userId: "user-1",
      date: "2026-02-09",
    });

    expect(outcome.status).toBe("degraded");
    if (outcome.status !== "degraded") {
      throw new Error("Expected degraded snapshot");
    }
    const [brokenHabit, enrichedHabit] = outcome.snapshot.habits;
    const { frequency: actualBrokenFrequency, ...brokenHabitData } =
      brokenHabit;
    expect(actualBrokenFrequency).toBe(brokenFrequency);
    expect(brokenHabitData).toEqual({
      id: "habit-broken",
      current_streak: 2,
      completed_today: false,
      created_at: "2026-01-01T00:00:00Z",
      missed_scheduled_periods: 0,
      previous_streak: 0,
      absence_unit: "days",
    });
    expect(enrichedHabit).toEqual({
      id: "habit-enriched",
      current_streak: 6,
      completed_today: true,
      frequency: { type: "weekly", days: [1] },
      created_at: "2026-01-01T00:00:00Z",
      missed_scheduled_periods: 4,
      previous_streak: 0,
      absence_unit: "weeks",
    });
    expect(outcome.warnings).toEqual([
      {
        code: "habit_enrichment_unavailable",
        message: "Absence data is temporarily unavailable for one habit.",
        habitId: "habit-broken",
      },
    ]);
  });
});
