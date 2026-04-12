import { describe, it, expect } from "vitest";
import {
  normalizeEvents,
  normalizeTasks,
  normalizeHabits,
  normalizeBills,
  normalizeWorkouts,
  aggregateFeedItems,
  groupFeedItemsByDate,
  feedItemsToExpandedEvents,
} from "@/lib/calendar/feed-aggregation";
import type { Task, Habit, HabitLog, RecurringBill, Workout } from "@/lib/db/types";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarFeedItem } from "@/lib/calendar/feed-types";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ExpandedCalendarEvent> = {}): ExpandedCalendarEvent {
  return {
    id: "evt-1",
    user_id: "user-1",
    title: "Team Meeting",
    description: null,
    start_date: "2026-04-01",
    start_time: "09:00:00",
    end_date: "2026-04-01",
    end_time: "10:00:00",
    location: null,
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
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    is_virtual: false,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Fix bug",
    description: null,
    is_completed: false,
    priority: 2,
    category_id: null,
    due_date: "2026-04-01",
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "work",
    sort_order: 0,
    project_id: null,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    user_id: "user-1",
    name: "Morning Run",
    description: null,
    category_id: null,
    frequency: { type: "daily" },
    status: "active",
    current_streak: 5,
    best_streak: 10,
    paused_at: null,
    graduated_at: null,
    graduated_streak: null,
    nudge_dismissed_at: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeHabitLog(overrides: Partial<HabitLog> = {}): HabitLog {
  return {
    id: "log-1",
    habit_id: "habit-1",
    user_id: "user-1",
    logged_date: "2026-04-01",
    completed: true,
    created_at: "2026-04-01T00:00:00Z",
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
    amount_cents: -1599,
    frequency: "monthly",
    next_due_date: "2026-04-05",
    user_status: "confirmed",
    is_active: true,
    plaid_status: null,
    category_primary: "ENTERTAINMENT",
    previous_amount_cents: null,
    source: "manual",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  } as RecurringBill;
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    title: "Morning Gym",
    started_at: "2026-04-01T07:00:00Z",
    completed_at: "2026-04-01T08:00:00Z",
    duration_seconds: 3600,
    status: "completed",
    notes: null,
    routine_id: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeEvents
// ---------------------------------------------------------------------------

describe("normalizeEvents", () => {
  it("converts calendar events to feed items", () => {
    const items = normalizeEvents([makeEvent()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "events:evt-1",
      domain: "events",
      sourceId: "evt-1",
      title: "Team Meeting",
      date: "2026-04-01",
      startTime: "09:00:00",
      allDay: false,
      completed: false,
      actions: [],
    });
  });

  it("marks all-day events correctly", () => {
    const items = normalizeEvents([makeEvent({ start_time: null })]);
    expect(items[0].allDay).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeTasks
// ---------------------------------------------------------------------------

describe("normalizeTasks", () => {
  it("converts tasks with due dates to feed items", () => {
    const items = normalizeTasks([makeTask()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tasks:task-1",
      domain: "tasks",
      sourceId: "task-1",
      title: "Fix bug",
      date: "2026-04-01",
      completed: false,
      actions: ["toggle_task"],
    });
  });

  it("skips tasks without due dates", () => {
    const items = normalizeTasks([makeTask({ due_date: null })]);
    expect(items).toHaveLength(0);
  });

  it("reflects completion state", () => {
    const items = normalizeTasks([makeTask({ is_completed: true })]);
    expect(items[0].completed).toBe(true);
  });

  it("includes due_time as startTime", () => {
    const items = normalizeTasks([makeTask({ due_time: "14:00:00" })]);
    expect(items[0].startTime).toBe("14:00:00");
    expect(items[0].allDay).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeHabits
// ---------------------------------------------------------------------------

describe("normalizeHabits", () => {
  it("creates feed items for each tracking day in range", () => {
    const habit = makeHabit({ frequency: { type: "daily" } });
    const items = normalizeHabits([habit], [], "2026-04-01", "2026-04-03");
    expect(items).toHaveLength(3);
    expect(items[0].date).toBe("2026-04-01");
    expect(items[1].date).toBe("2026-04-02");
    expect(items[2].date).toBe("2026-04-03");
  });

  it("marks completed habits from logs", () => {
    const habit = makeHabit();
    const log = makeHabitLog({ logged_date: "2026-04-01" });
    const items = normalizeHabits([habit], [log], "2026-04-01", "2026-04-01");
    expect(items[0].completed).toBe(true);
  });

  it("respects custom frequency (only specific days)", () => {
    // 2026-04-01 is a Wednesday (day 3), 2026-04-02 is Thursday (day 4)
    const habit = makeHabit({ frequency: { type: "custom", days: [3] } });
    const items = normalizeHabits([habit], [], "2026-04-01", "2026-04-02");
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe("2026-04-01"); // Wednesday
  });

  it("includes toggle_habit action", () => {
    const items = normalizeHabits([makeHabit()], [], "2026-04-01", "2026-04-01");
    expect(items[0].actions).toContain("toggle_habit");
  });

  it("includes habit id and date in feed item id", () => {
    const items = normalizeHabits([makeHabit()], [], "2026-04-01", "2026-04-01");
    expect(items[0].id).toBe("habits:habit-1:2026-04-01");
  });
});

// ---------------------------------------------------------------------------
// normalizeBills
// ---------------------------------------------------------------------------

describe("normalizeBills", () => {
  it("includes active bills with due date in range", () => {
    const items = normalizeBills([makeBill()], "2026-04-01", "2026-04-10");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "bills:bill-1",
      domain: "bills",
      title: "Netflix",
      date: "2026-04-05",
      allDay: true,
      actions: ["dismiss_bill"],
    });
  });

  it("excludes dismissed bills", () => {
    const items = normalizeBills(
      [makeBill({ user_status: "dismissed" })],
      "2026-04-01",
      "2026-04-10",
    );
    expect(items).toHaveLength(0);
  });

  it("excludes inactive bills", () => {
    const items = normalizeBills(
      [makeBill({ is_active: false })],
      "2026-04-01",
      "2026-04-10",
    );
    expect(items).toHaveLength(0);
  });

  it("excludes bills with due date outside range", () => {
    const items = normalizeBills(
      [makeBill({ next_due_date: "2026-04-15" })],
      "2026-04-01",
      "2026-04-10",
    );
    expect(items).toHaveLength(0);
  });

  it("includes amount in meta", () => {
    const items = normalizeBills([makeBill()], "2026-04-01", "2026-04-10");
    expect(items[0].meta?.amountCents).toBe(-1599);
  });
});

// ---------------------------------------------------------------------------
// normalizeWorkouts
// ---------------------------------------------------------------------------

describe("normalizeWorkouts", () => {
  it("converts workouts to feed items with date from started_at", () => {
    const items = normalizeWorkouts([makeWorkout()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "workouts:workout-1",
      domain: "workouts",
      title: "Morning Gym",
      date: "2026-04-01",
      startTime: "07:00",
      allDay: false,
      completed: true,
      actions: ["navigate_workout"],
    });
  });

  it("marks discarded workouts as not completed", () => {
    const items = normalizeWorkouts([makeWorkout({ status: "discarded" })]);
    expect(items[0].completed).toBe(false);
  });

  it("extracts time from ISO timestamp and sets allDay=false (AGGR-04)", () => {
    const items = normalizeWorkouts([
      makeWorkout({ started_at: "2025-04-05T14:30:00Z" }),
    ]);
    expect(items[0].startTime).toBe("14:30");
    expect(items[0].allDay).toBe(false);
    expect(items[0].date).toBe("2025-04-05");
  });

  it("converts to local time when timezone is provided (AGGR-04)", () => {
    const items = normalizeWorkouts(
      [makeWorkout({ started_at: "2025-04-05T14:30:00Z" })],
      "America/New_York",
    );
    // 14:30 UTC = 10:30 EDT (April is DST)
    expect(items[0].startTime).toBe("10:30");
    expect(items[0].allDay).toBe(false);
    expect(items[0].date).toBe("2025-04-05");
  });

  it("sets allDay=true when started_at has no time component (AGGR-04)", () => {
    const items = normalizeWorkouts([
      makeWorkout({ started_at: "2025-04-05" }),
    ]);
    expect(items[0].startTime).toBeNull();
    expect(items[0].allDay).toBe(true);
    expect(items[0].date).toBe("2025-04-05");
  });
});

// ---------------------------------------------------------------------------
// aggregateFeedItems
// ---------------------------------------------------------------------------

describe("aggregateFeedItems", () => {
  const items: CalendarFeedItem[] = [
    {
      id: "tasks:1", domain: "tasks", sourceId: "1", title: "Task",
      date: "2026-04-01", startTime: null, endTime: null, allDay: true,
      completed: false, actions: ["toggle_task"],
    },
    {
      id: "events:1", domain: "events", sourceId: "1", title: "Event",
      date: "2026-04-01", startTime: "09:00", endTime: "10:00", allDay: false,
      completed: false, actions: [],
    },
    {
      id: "habits:1:2026-04-01", domain: "habits", sourceId: "1", title: "Habit",
      date: "2026-04-01", startTime: null, endTime: null, allDay: true,
      completed: false, actions: ["toggle_habit"],
    },
  ];

  it("filters by enabled layers", () => {
    const result = aggregateFeedItems(items, new Set(["tasks"]));
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("tasks");
  });

  it("sorts all-day items before timed items", () => {
    const result = aggregateFeedItems(items, new Set(["events", "tasks"]));
    expect(result[0].domain).toBe("tasks"); // all-day first
    expect(result[1].domain).toBe("events"); // timed second
  });

  it("sorts by domain order within all-day items", () => {
    const result = aggregateFeedItems(items, new Set(["tasks", "habits"]));
    expect(result[0].domain).toBe("tasks"); // tasks before habits
    expect(result[1].domain).toBe("habits");
  });

  it("returns empty for no enabled layers", () => {
    const result = aggregateFeedItems(items, new Set());
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// groupFeedItemsByDate
// ---------------------------------------------------------------------------

describe("groupFeedItemsByDate", () => {
  it("groups items by date", () => {
    const items: CalendarFeedItem[] = [
      {
        id: "a", domain: "tasks", sourceId: "1", title: "A",
        date: "2026-04-01", startTime: null, endTime: null, allDay: true,
        completed: false, actions: [],
      },
      {
        id: "b", domain: "tasks", sourceId: "2", title: "B",
        date: "2026-04-02", startTime: null, endTime: null, allDay: true,
        completed: false, actions: [],
      },
      {
        id: "c", domain: "events", sourceId: "1", title: "C",
        date: "2026-04-01", startTime: null, endTime: null, allDay: true,
        completed: false, actions: [],
      },
    ];
    const map = groupFeedItemsByDate(items);
    expect(map.get("2026-04-01")).toHaveLength(2);
    expect(map.get("2026-04-02")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// feedItemsToExpandedEvents
// ---------------------------------------------------------------------------

describe("feedItemsToExpandedEvents", () => {
  it("converts feed items to DomainCalendarEvent objects", () => {
    const items: CalendarFeedItem[] = [
      {
        id: "tasks:1", domain: "tasks", sourceId: "task-1", title: "Fix bug",
        date: "2026-04-01", startTime: "14:00", endTime: null, allDay: false,
        completed: true, actions: ["toggle_task"],
        meta: { priority: 2 },
      },
    ];
    const events = feedItemsToExpandedEvents(items);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "tasks:1",
      title: "Fix bug",
      start_date: "2026-04-01",
      start_time: "14:00",
      is_virtual: true,
      _domain: "tasks",
      _completed: true,
      _actions: ["toggle_task"],
      _sourceId: "task-1",
    });
  });

  it("preserves meta data", () => {
    const items: CalendarFeedItem[] = [
      {
        id: "bills:1", domain: "bills", sourceId: "1", title: "Netflix",
        date: "2026-04-05", startTime: null, endTime: null, allDay: true,
        completed: false, actions: ["dismiss_bill"],
        meta: { amountCents: -1599 },
      },
    ];
    const events = feedItemsToExpandedEvents(items);
    expect(events[0]._meta).toEqual({ amountCents: -1599 });
  });
});
