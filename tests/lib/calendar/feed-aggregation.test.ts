import { describe, it, expect } from "vitest";
import {
  aggregateEventsForFeed,
  aggregateTasksForFeed,
  aggregateHabitsForFeed,
  aggregateBillsForFeed,
  aggregateWorkoutsForFeed,
  mergeFeedItems,
} from "@/lib/calendar/feed-aggregation";
import { DOMAIN_COLORS } from "@/lib/calendar/feed-types";
import type { Task, Habit, Workout, RecurringBill } from "@/lib/db/types";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

// --- Factories ---

function makeEvent(overrides: Partial<ExpandedCalendarEvent> = {}): ExpandedCalendarEvent {
  return {
    id: "evt-1",
    user_id: "user-1",
    title: "Team Meeting",
    description: "Weekly sync",
    start_date: "2026-04-01",
    start_time: "10:00:00",
    end_date: "2026-04-01",
    end_time: "11:00:00",
    location: "Room A",
    color: null,
    category_id: null,
    is_recurring: false,
    recurrence_rule: null,
    end_type: null,
    end_date_recurrence: null,
    end_count: null,
    recurring_event_id: null,
    original_date: null,
    is_exception: false,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    is_virtual: false,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Buy groceries",
    description: null,
    is_completed: false,
    priority: 2,
    category_id: null,
    due_date: "2026-04-01",
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "personal",
    sort_order: 0,
    project_id: null,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    user_id: "user-1",
    name: "Morning run",
    description: null,
    category_id: null,
    frequency: { type: "daily" },
    status: "active",
    current_streak: 5,
    best_streak: 10,
    paused_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    title: "Push Day",
    started_at: "2026-04-01T08:00:00Z",
    completed_at: "2026-04-01T09:00:00Z",
    duration_seconds: 3600,
    status: "completed",
    notes: null,
    routine_id: null,
    created_at: "2026-04-01T08:00:00Z",
    updated_at: "2026-04-01T09:00:00Z",
    ...overrides,
  };
}

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: "bill-1",
    household_id: "hh-1",
    plaid_stream_id: null,
    account_id: null,
    name: "Netflix",
    description: null,
    amount_cents: 1599,
    frequency: "monthly",
    next_due_date: "2026-04-05",
    user_status: "auto",
    is_active: true,
    plaid_status: null,
    category_primary: "entertainment",
    previous_amount_cents: null,
    source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- Tests ---

describe("aggregateEventsForFeed", () => {
  it("converts an event with start_time to a timed feed item", () => {
    const result = aggregateEventsForFeed([makeEvent()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "event_evt-1",
      source: "event",
      title: "Team Meeting",
      start_date: "2026-04-01",
      start_time: "10:00",
      end_time: "11:00",
      is_all_day: false,
      color: DOMAIN_COLORS.event,
      meta: {
        event_id: "evt-1",
        location: "Room A",
        description: "Weekly sync",
      },
    });
  });

  it("converts an all-day event (no start_time)", () => {
    const result = aggregateEventsForFeed([
      makeEvent({ start_time: null, end_time: null }),
    ]);
    expect(result[0].is_all_day).toBe(true);
    expect(result[0].start_time).toBeNull();
  });

  it("uses event.color when set", () => {
    const result = aggregateEventsForFeed([
      makeEvent({ color: "hsl(0 100% 50%)" }),
    ]);
    expect(result[0].color).toBe("hsl(0 100% 50%)");
  });
});

describe("aggregateTasksForFeed", () => {
  it("includes tasks with due_date in range", () => {
    const tasks = [makeTask()];
    const result = aggregateTasksForFeed(tasks, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "task_task-1",
      source: "task",
      title: "Buy groceries",
      start_date: "2026-04-01",
      is_all_day: true,
      color: DOMAIN_COLORS.task,
      meta: { task_id: "task-1", is_completed: false, priority: 2 },
    });
  });

  it("excludes tasks outside the date range", () => {
    const tasks = [makeTask({ due_date: "2026-05-01" })];
    const result = aggregateTasksForFeed(tasks, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(0);
  });

  it("excludes tasks with no due_date", () => {
    const tasks = [makeTask({ due_date: null })];
    const result = aggregateTasksForFeed(tasks, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(0);
  });

  it("creates timed item when due_time is set", () => {
    const tasks = [makeTask({ due_time: "14:30:00" })];
    const result = aggregateTasksForFeed(tasks, "2026-04-01", "2026-04-30");
    expect(result[0].is_all_day).toBe(false);
    expect(result[0].start_time).toBe("14:30");
    expect(result[0].end_time).toBe("15:00");
  });
});

describe("aggregateHabitsForFeed", () => {
  it("creates items for each day the habit should be tracked", () => {
    const habits = [makeHabit()];
    const logs: { habit_id: string; logged_date: string; completed: boolean }[] = [];
    const result = aggregateHabitsForFeed(
      habits,
      logs,
      "2026-04-01",
      "2026-04-03",
    );
    // Daily habit = 3 items for 3 days
    expect(result).toHaveLength(3);
    expect(result[0].start_date).toBe("2026-04-01");
    expect(result[1].start_date).toBe("2026-04-02");
    expect(result[2].start_date).toBe("2026-04-03");
    expect(result[0].is_all_day).toBe(true);
    expect(result[0].meta.is_logged).toBe(false);
  });

  it("marks habits as logged when a completed log exists", () => {
    const habits = [makeHabit()];
    const logs = [
      { habit_id: "habit-1", logged_date: "2026-04-02", completed: true },
    ];
    const result = aggregateHabitsForFeed(
      habits,
      logs,
      "2026-04-01",
      "2026-04-03",
    );
    expect(result[1].meta.is_logged).toBe(true);
    expect(result[0].meta.is_logged).toBe(false);
  });

  it("skips paused habits", () => {
    const habits = [makeHabit({ status: "paused" })];
    const result = aggregateHabitsForFeed(
      habits,
      [],
      "2026-04-01",
      "2026-04-03",
    );
    expect(result).toHaveLength(0);
  });

  it("respects weekdays frequency", () => {
    // 2026-04-01 is Wednesday, 2026-04-04 is Saturday, 2026-04-05 is Sunday
    const habits = [makeHabit({ frequency: { type: "weekdays" } })];
    const result = aggregateHabitsForFeed(
      habits,
      [],
      "2026-04-01",
      "2026-04-05",
    );
    // Wed, Thu, Fri = 3 items (Sat and Sun excluded)
    expect(result).toHaveLength(3);
  });
});

describe("aggregateBillsForFeed", () => {
  it("includes active bills with next_due_date in range", () => {
    const bills = [makeBill()];
    const result = aggregateBillsForFeed(bills, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "bill_bill-1",
      source: "bill",
      title: "Netflix",
      start_date: "2026-04-05",
      is_all_day: true,
      color: DOMAIN_COLORS.bill,
      meta: { bill_id: "bill-1", is_paid: false, amount_cents: 1599 },
    });
  });

  it("excludes dismissed bills", () => {
    const bills = [makeBill({ user_status: "dismissed" })];
    const result = aggregateBillsForFeed(bills, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(0);
  });

  it("excludes inactive bills", () => {
    const bills = [makeBill({ is_active: false })];
    const result = aggregateBillsForFeed(bills, "2026-04-01", "2026-04-30");
    expect(result).toHaveLength(0);
  });

  it("marks confirmed bills as is_paid", () => {
    const bills = [makeBill({ user_status: "confirmed" })];
    const result = aggregateBillsForFeed(bills, "2026-04-01", "2026-04-30");
    expect(result[0].meta.is_paid).toBe(true);
  });
});

describe("aggregateWorkoutsForFeed", () => {
  it("converts a completed workout to a timed feed item", () => {
    const workouts = [makeWorkout()];
    const result = aggregateWorkoutsForFeed(
      workouts,
      "2026-04-01",
      "2026-04-30",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "workout_workout-1",
      source: "workout",
      title: "Push Day",
      start_date: "2026-04-01",
      start_time: "08:00",
      is_all_day: false,
      color: DOMAIN_COLORS.workout,
      meta: { workout_id: "workout-1", duration_seconds: 3600 },
    });
  });

  it("computes end_time from duration", () => {
    const workouts = [makeWorkout({ duration_seconds: 5400 })]; // 90 min
    const result = aggregateWorkoutsForFeed(
      workouts,
      "2026-04-01",
      "2026-04-30",
    );
    expect(result[0].end_time).toBe("09:30"); // 08:00 + 90min
  });

  it("excludes workouts outside date range", () => {
    const workouts = [
      makeWorkout({ started_at: "2026-05-01T08:00:00Z" }),
    ];
    const result = aggregateWorkoutsForFeed(
      workouts,
      "2026-04-01",
      "2026-04-30",
    );
    expect(result).toHaveLength(0);
  });
});

describe("mergeFeedItems", () => {
  it("sorts by date, then all-day first, then start_time", () => {
    const items = [
      {
        id: "b",
        source: "task" as const,
        title: "Task",
        start_date: "2026-04-01",
        start_time: "14:00",
        end_date: "2026-04-01",
        end_time: "14:30",
        color: DOMAIN_COLORS.task,
        is_all_day: false,
        meta: {},
      },
      {
        id: "a",
        source: "habit" as const,
        title: "Habit",
        start_date: "2026-04-01",
        start_time: null,
        end_date: "2026-04-01",
        end_time: null,
        color: DOMAIN_COLORS.habit,
        is_all_day: true,
        meta: {},
      },
      {
        id: "c",
        source: "event" as const,
        title: "Event",
        start_date: "2026-04-02",
        start_time: "09:00",
        end_date: "2026-04-02",
        end_time: "10:00",
        color: DOMAIN_COLORS.event,
        is_all_day: false,
        meta: {},
      },
    ];

    const result = mergeFeedItems(items);
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("merges multiple arrays", () => {
    const a = [
      {
        id: "1",
        source: "event" as const,
        title: "E",
        start_date: "2026-04-02",
        start_time: null,
        end_date: "2026-04-02",
        end_time: null,
        color: "",
        is_all_day: true,
        meta: {},
      },
    ];
    const b = [
      {
        id: "2",
        source: "task" as const,
        title: "T",
        start_date: "2026-04-01",
        start_time: null,
        end_date: "2026-04-01",
        end_time: null,
        color: "",
        is_all_day: true,
        meta: {},
      },
    ];
    const result = mergeFeedItems(a, b);
    expect(result.map((i) => i.id)).toEqual(["2", "1"]);
  });
});
