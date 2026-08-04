import { describe, expect, it } from "vitest";

import {
  habitOverlayItemsToExpandedEvents,
  taskOverlayItemsToExpandedEvents,
  workoutOverlayItemsToExpandedEvents,
} from "@/lib/calendar/feed-aggregation";

describe("calendar task overlay adapter", () => {
  it("preserves task identity and completion action while leaving event fields editable", () => {
    const [event] = taskOverlayItemsToExpandedEvents([{
      layer: "tasks",
      kind: "task",
      id: "tasks:task-1",
      taskId: "task-1",
      title: "Task",
      date: "2026-04-02",
      startTime: null,
      endTime: null,
      allDay: true,
      completed: false,
      action: { type: "toggle_task_completion", taskId: "task-1" },
    }]);

    expect(event).toMatchObject({
      id: "tasks:task-1",
      _domain: "tasks",
      _taskAction: { type: "toggle_task_completion", taskId: "task-1" },
      is_virtual: true,
    });
    expect(event._actions).toBeUndefined();
  });
});

describe("calendar habit overlay adapter", () => {
  it("preserves the displayed date in the typed toggle action", () => {
    const [event] = habitOverlayItemsToExpandedEvents([{
      layer: "habits",
      kind: "habit",
      id: "habits:habit-1:2026-04-02",
      habitId: "habit-1",
      title: "Read",
      date: "2026-04-02",
      startTime: null,
      endTime: null,
      allDay: true,
      completed: true,
      action: {
        type: "toggle_habit_completion",
        habitId: "habit-1",
        date: "2026-04-02",
      },
    }]);

    expect(event).toMatchObject({
      id: "habits:habit-1:2026-04-02",
      _domain: "habits",
      _completed: true,
      _habitAction: {
        type: "toggle_habit_completion",
        habitId: "habit-1",
        date: "2026-04-02",
      },
      is_virtual: true,
    });
    expect(event._actions).toBeUndefined();
  });
});

describe("calendar workout overlay adapter", () => {
  it("preserves the typed navigation action and workout identity", () => {
    const [event] = workoutOverlayItemsToExpandedEvents([{
      layer: "workouts",
      kind: "workout",
      id: "workouts:workout-1",
      workoutId: "workout-1",
      title: "Morning lift",
      date: "2026-04-02",
      startTime: "06:30",
      endTime: null,
      allDay: false,
      completed: true,
      action: { type: "navigate_workout", workoutId: "workout-1" },
    }]);

    expect(event).toMatchObject({
      id: "workouts:workout-1",
      _domain: "workouts",
      _sourceId: "workout-1",
      _workoutAction: { type: "navigate_workout", workoutId: "workout-1" },
      is_virtual: true,
    });
    expect(event._actions).toBeUndefined();
  });
});
