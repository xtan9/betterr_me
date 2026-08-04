import { describe, expect, it, vi } from "vitest";

import {
  queryCalendarOverlayFeed,
  type CalendarOverlayCapabilities,
  type HabitOverlayCapabilities,
  type TaskOverlayCapabilities,
  type WorkoutOverlayCapabilities,
} from "@/lib/calendar/overlay-feed";
import type { Habit, HabitLog, Task, Workout } from "@/lib/db/types";

const request = {
  userId: "user-1",
  range: { from: "2026-04-01", to: "2026-04-07" },
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Review calendar",
    description: null,
    is_completed: false,
    priority: 1,
    category_id: null,
    due_date: "2026-04-02",
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "open",
    section: "today",
    sort_order: 0,
    project_id: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  } as Task;
}

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    user_id: "user-1",
    name: "Read",
    description: null,
    category_id: null,
    frequency: { type: "daily" },
    status: "active",
    current_streak: 3,
    best_streak: 7,
    paused_at: null,
    graduated_at: null,
    graduated_streak: null,
    nudge_dismissed_at: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function habitLog(overrides: Partial<HabitLog> = {}): HabitLog {
  return {
    id: "log-1",
    habit_id: "habit-1",
    user_id: "user-1",
    logged_date: "2026-04-02",
    completed: true,
    created_at: "2026-04-02T00:00:00Z",
    updated_at: "2026-04-02T00:00:00Z",
    ...overrides,
  };
}

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    title: "Morning lift",
    started_at: "2026-04-02T06:30:00Z",
    completed_at: "2026-04-02T07:00:00Z",
    duration_seconds: 1800,
    status: "completed",
    notes: null,
    routine_id: null,
    created_at: "2026-04-02T06:30:00Z",
    updated_at: "2026-04-02T07:00:00Z",
    ...overrides,
  };
}

function capabilities(overrides: Partial<TaskOverlayCapabilities> = {}): TaskOverlayCapabilities {
  return {
    coverage: { ensureThrough: vi.fn().mockResolvedValue({ status: "complete" }) },
    read: { read: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function habitCapabilities(overrides: Partial<HabitOverlayCapabilities> = {}): HabitOverlayCapabilities {
  return {
    activeHabits: { read: vi.fn().mockResolvedValue([]) },
    completionLogs: { read: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function workoutCapabilities(overrides: Partial<WorkoutOverlayCapabilities> = {}): WorkoutOverlayCapabilities {
  return {
    read: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function allCapabilities(
  taskOverrides: Partial<TaskOverlayCapabilities> = {},
  habitOverrides: Partial<HabitOverlayCapabilities> = {},
  workoutOverrides: Partial<WorkoutOverlayCapabilities> = {},
): CalendarOverlayCapabilities {
  return {
    ...capabilities(taskOverrides),
    habits: habitCapabilities(habitOverrides),
    workouts: workoutCapabilities(workoutOverrides),
  };
}

describe("queryCalendarOverlayFeed", () => {
  it("ensures coverage through the inclusive requested end before reading tasks", async () => {
    const order: string[] = [];
    const caps = capabilities({
      coverage: { ensureThrough: vi.fn(async (value) => {
        order.push(`coverage:${value.range.to}`);
        return { status: "complete" as const };
      }) },
      read: { read: vi.fn(async () => {
        order.push("read");
        return [task()];
      }) },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(order).toEqual(["coverage:2026-04-07", "read"]);
    expect(result.status).toBe("complete");
  });

  it("skips task reads and reports exactly one stable coverage diagnostic", async () => {
    const read = vi.fn();
    const caps = capabilities({
      coverage: {
        ensureThrough: vi.fn().mockResolvedValue({
          status: "partial",
          failedSeriesIds: ["series-2", "series-2"],
        }),
      },
      read: { read },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: ["series-2"],
      }],
    });
  });

  it("classifies and reports a coverage port failure once", async () => {
    const cause = new Error("coverage down");
    const reportFailure = vi.fn();
    const read = vi.fn();
    const caps = capabilities({
      coverage: { ensureThrough: vi.fn().mockRejectedValue(cause) },
      read: { read },
    });

    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      caps,
      { reportFailure },
    );

    expect(read).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith({
      layer: "tasks",
      request,
      cause,
    });
    expect(result.status).toBe("failed");
    expect(result.unavailable).toEqual([{
      layer: "tasks",
      code: "recurring_coverage_unavailable",
      failedSeriesIds: [],
    }]);
  });

  it("reports a generic task acquisition failure once without exposing its cause", async () => {
    const cause = new Error("secret database details");
    const reportFailure = vi.fn();
    const caps = capabilities({
      read: { read: vi.fn().mockRejectedValue(cause) },
    });

    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      caps,
      { reportFailure },
    );

    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      layer: "tasks",
      cause,
      request,
    }));
    expect(JSON.stringify(result)).not.toContain("secret database details");
    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    });
  });

  it("keeps the classified outcome when the failure reporter throws", async () => {
    const reportFailure = vi.fn(() => {
      throw new Error("reporting unavailable");
    });
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      capabilities({ read: { read: vi.fn().mockRejectedValue(new Error("database unavailable")) } }),
      { reportFailure },
    );

    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    });
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("returns a successful empty task result and a typed completion action", async () => {
    const caps = capabilities({
      read: { read: vi.fn().mockResolvedValue([task(), task({
        id: "task-2",
        title: "Timed task",
        due_time: "09:00:00",
      })]) },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(result.status).toBe("complete");
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "tasks:task-1",
        layer: "tasks",
        kind: "task",
        action: { type: "toggle_task_completion", taskId: "task-1" },
      }),
      expect.objectContaining({
        id: "tasks:task-2",
        action: { type: "toggle_task_completion", taskId: "task-2" },
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty("actions");
    expect(result.items[0]).not.toHaveProperty("meta");

    const empty = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      capabilities(),
    );
    expect(empty).toEqual({ status: "complete", items: [], unavailable: [] });
  });

  it("projects active habits onto applicable dates and uses matching completion logs", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["habits"] },
      allCapabilities({}, {
        activeHabits: { read: vi.fn().mockResolvedValue([habit()]) },
        completionLogs: { read: vi.fn().mockResolvedValue([habitLog()]) },
      }),
    );

    expect(result).toMatchObject({ status: "complete", unavailable: [] });
    expect(result.items).toHaveLength(7);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "habits:habit-1:2026-04-02",
        layer: "habits",
        kind: "habit",
        date: "2026-04-02",
        completed: true,
        action: {
          type: "toggle_habit_completion",
          habitId: "habit-1",
          date: "2026-04-02",
        },
      }),
      expect.objectContaining({
        id: "habits:habit-1:2026-04-03",
        completed: false,
      }),
    ]));
    expect(result.items[0]).not.toHaveProperty("actions");
  });

  it("atomically omits habits when either habit read fails", async () => {
    const reportFailure = vi.fn();
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["habits"] },
      allCapabilities({}, {
        activeHabits: { read: vi.fn().mockResolvedValue([habit()]) },
        completionLogs: { read: vi.fn().mockRejectedValue(new Error("logs unavailable")) },
      }),
      { reportFailure },
    );

    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{ layer: "habits", code: "unavailable" }],
    });
    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ layer: "habits" }));
  });

  it("also omits habits when active-habit acquisition fails", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["habits"] },
      allCapabilities({}, {
        activeHabits: { read: vi.fn().mockRejectedValue(new Error("habits unavailable")) },
        completionLogs: { read: vi.fn().mockResolvedValue([habitLog()]) },
      }),
    );

    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{ layer: "habits", code: "unavailable" }],
    });
  });

  it("starts task and habit acquisition concurrently and preserves the successful layer", async () => {
    let resolveTasks!: (value: Task[]) => void;
    let resolveHabits!: (value: Habit[]) => void;
    const tasks = new Promise<Task[]>((resolve) => { resolveTasks = resolve; });
    const habits = new Promise<Habit[]>((resolve) => { resolveHabits = resolve; });
    const taskRead = vi.fn().mockReturnValue(tasks);
    const activeHabitRead = vi.fn().mockReturnValue(habits);

    const pending = queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "habits"] },
      allCapabilities(
        { read: { read: taskRead } },
        { activeHabits: { read: activeHabitRead } },
      ),
    );

    await Promise.resolve();
    expect(taskRead).toHaveBeenCalledTimes(1);
    expect(activeHabitRead).toHaveBeenCalledTimes(1);

    resolveTasks([task()]);
    resolveHabits([habit()]);
    const result = await pending;
    expect(result.status).toBe("complete");
    expect(result.items).toHaveLength(8);
  });

  it("returns degraded results with trustworthy task items when habits are unavailable", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "habits"] },
      allCapabilities(
        { read: { read: vi.fn().mockResolvedValue([task()]) } },
        { completionLogs: { read: vi.fn().mockRejectedValue(new Error("logs unavailable")) } },
      ),
    );

    expect(result).toEqual({
      status: "degraded",
      items: [expect.objectContaining({ id: "tasks:task-1" })],
      unavailable: [{ layer: "habits", code: "unavailable" }],
    });
  });

  it("treats a selected successful empty layer as available", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "habits"] },
      allCapabilities(
        { read: { read: vi.fn().mockResolvedValue([]) } },
        { activeHabits: { read: vi.fn().mockResolvedValue([habit()]) }, completionLogs: { read: vi.fn().mockResolvedValue([]) } },
      ),
    );

    expect(result).toEqual({ status: "complete", items: expect.any(Array), unavailable: [] });
  });

  it("projects workouts into the supplied timezone with a unique typed navigation action", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "workouts"], timezone: "America/Los_Angeles" },
      allCapabilities(
        { read: { read: vi.fn().mockResolvedValue([task({ id: "workout-1" })]) } },
        {},
        { read: vi.fn().mockResolvedValue([workout()]) },
      ),
    );

    const workoutItem = result.items.find((item) => item.layer === "workouts");
    expect(workoutItem).toEqual({
      layer: "workouts",
      kind: "workout",
      id: "workouts:workout-1",
      workoutId: "workout-1",
      title: "Morning lift",
      date: "2026-04-01",
      startTime: "23:30",
      endTime: null,
      allDay: false,
      completed: true,
      action: { type: "navigate_workout", workoutId: "workout-1" },
    });
    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["tasks:workout-1", "workouts:workout-1"]),
    );
    expect(workoutItem).not.toHaveProperty("actions");
    expect(workoutItem).not.toHaveProperty("meta");
  });

  it("starts tasks and workouts concurrently and degrades only the failed workout layer", async () => {
    let resolveWorkout!: (value: Workout[]) => void;
    const workoutRead = vi.fn().mockReturnValue(new Promise<Workout[]>((resolve) => {
      resolveWorkout = resolve;
    }));
    const taskRead = vi.fn().mockResolvedValue([task()]);

    const pending = queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "workouts"], timezone: "UTC" },
      allCapabilities(
        { read: { read: taskRead } },
        {},
        { read: workoutRead },
      ),
    );

    await Promise.resolve();
    expect(taskRead).toHaveBeenCalledTimes(1);
    expect(workoutRead).toHaveBeenCalledTimes(1);

    resolveWorkout([workout()]);
    await expect(pending).resolves.toMatchObject({ status: "complete" });

    const failed = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks", "workouts"], timezone: "UTC" },
      allCapabilities(
        { read: { read: taskRead } },
        {},
        { read: vi.fn().mockRejectedValue(new Error("workouts down")) },
      ),
    );
    expect(failed).toEqual({
      status: "degraded",
      items: [expect.objectContaining({ id: "tasks:task-1" })],
      unavailable: [{ layer: "workouts", code: "unavailable" }],
    });

    const empty = await queryCalendarOverlayFeed(
      { ...request, layers: ["workouts"], timezone: "UTC" },
      allCapabilities({}, {}, { read: vi.fn().mockResolvedValue([]) }),
    );
    expect(empty).toEqual({ status: "complete", items: [], unavailable: [] });
  });

  it("orders same-date items by all-day, time, layer, then stable identity", async () => {
    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["workouts", "habits", "tasks"], timezone: "UTC" },
      allCapabilities(
        {
          read: {
            read: vi.fn().mockResolvedValue([
              task({ id: "task-timed", due_time: "09:00:00" }),
              task({ id: "task-all-day", due_time: null }),
            ]),
          },
        },
        {
          activeHabits: {
            read: vi.fn().mockResolvedValue([
              habit({ id: "habit-all-day", frequency: { type: "custom", days: [4] } }),
            ]),
          },
        },
        {
          read: vi.fn().mockResolvedValue([
            workout({ id: "workout-timed", started_at: "2026-04-02T09:00:00Z" }),
          ]),
        },
      ),
    );

    expect(result.items.map((item) => item.id)).toEqual([
      "tasks:task-all-day",
      "habits:habit-all-day:2026-04-02",
      "tasks:task-timed",
      "workouts:workout-timed",
    ]);
  });
});
