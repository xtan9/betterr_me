import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventBlock } from "@/components/calendar/event-block";
import { EventChip } from "@/components/calendar/event-chip";
import {
  calendarEventToDisplayItem,
  groupCalendarDisplayItemsByDate,
  overlayItemsToDisplayItems,
} from "@/lib/calendar/overlay-adapter";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type {
  CalendarOverlayItem,
  TaskOverlayAction,
} from "@/lib/calendar/overlay-feed";

function taskItem(): CalendarOverlayItem {
  return {
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
  };
}

function habitItem(): CalendarOverlayItem {
  return {
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
  };
}

function workoutItem(): CalendarOverlayItem {
  return {
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
  };
}

function calendarEvent(): ExpandedCalendarEvent {
  return {
    id: "event-1",
    user_id: "user-1",
    title: "Appointment",
    description: "A real Calendar Event",
    start_date: "2026-04-02",
    start_time: "09:00:00",
    end_date: "2026-04-02",
    end_time: "10:00:00",
    location: "Room 1",
    color: "#2563eb",
    category_id: "category-1",
    is_recurring: true,
    recurrence_rule: { frequency: "weekly", interval: 1, days_of_week: [4] },
    end_type: "on_date",
    end_date_recurrence: "2026-05-01",
    end_count: null,
    recurring_event_id: "event-1",
    original_date: "2026-04-02",
    is_exception: false,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    is_virtual: true,
  };
}

describe("Calendar display adapter", () => {
  it("lets Calendar views render an overlay without a fabricated Calendar Event", () => {
    const [item] = overlayItemsToDisplayItems([taskItem()]);

    render(<EventChip event={item} />);

    expect(screen.getByTitle("Task")).toBeInTheDocument();
    expect(item).toMatchObject({
      kind: "overlay",
      id: "tasks:task-1",
      title: "Task",
      start_date: "2026-04-02",
      start_time: null,
      layer: "tasks",
      completed: false,
    });
    expect(item).not.toHaveProperty("user_id");
    expect(item).not.toHaveProperty("recurrence_rule");
  });

  it("preserves typed overlay actions and completion state for each Calendar Layer", () => {
    const [task, habit, workout] = overlayItemsToDisplayItems([
      taskItem(),
      habitItem(),
      workoutItem(),
    ]);

    expect(task).toMatchObject({
      kind: "overlay",
      layer: "tasks",
      action: { type: "toggle_task_completion", taskId: "task-1" },
    });
    expect(habit).toMatchObject({
      kind: "overlay",
      layer: "habits",
      completed: true,
      action: {
        type: "toggle_habit_completion",
        habitId: "habit-1",
        date: "2026-04-02",
      },
    });
    expect(workout).toMatchObject({
      kind: "overlay",
      layer: "workouts",
      action: { type: "navigate_workout", workoutId: "workout-1" },
    });

    if (task.layer !== "tasks") throw new Error("Expected a task display item");
    expectTypeOf(task.action).toEqualTypeOf<TaskOverlayAction>();
  });

  it("passes a display item back through the time-grid view seam when clicked", () => {
    const [item] = overlayItemsToDisplayItems([workoutItem()]);
    const onClick = vi.fn();

    render(
      <EventBlock
        event={item}
        top={100}
        height={48}
        left="0%"
        width="100%"
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledWith(item);
  });

  it("keeps the complete Calendar Event behind the event display item", () => {
    const event = calendarEvent();
    const item = calendarEventToDisplayItem(event);

    expect(item).toMatchObject({
      kind: "event",
      id: event.id,
      title: event.title,
      start_date: event.start_date,
    });
    expect(item.event).toBe(event);
    expect(item.event).toMatchObject({
      description: "A real Calendar Event",
      recurrence_rule: { frequency: "weekly" },
      location: "Room 1",
    });
  });

  it("keeps a multi-day Calendar Event visible on every covered date", () => {
    const item = calendarEventToDisplayItem({
      ...calendarEvent(),
      end_date: "2026-04-03",
    });

    const grouped = groupCalendarDisplayItemsByDate([item]);

    expect(grouped.get("2026-04-02")).toEqual([item]);
    expect(grouped.get("2026-04-03")).toEqual([item]);
  });
});
