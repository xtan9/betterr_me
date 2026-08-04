/**
 * Cross-domain feed aggregation.
 *
 * Normalizes tasks, habits, and workouts into CalendarFeedItem[]
 * so the calendar can render all domains uniformly.
 */

import type { Task, Habit, HabitLog, Workout } from "@/lib/db/types";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarFeedItem, DomainCalendarEvent, FeedDomain } from "./feed-types";
import type { CalendarOverlayItem, HabitOverlayItem, TaskOverlayItem } from "./overlay-feed";
import { shouldTrackOnDate } from "@/lib/habits/format";

// ---------------------------------------------------------------------------
// Normalizers — one per domain
// ---------------------------------------------------------------------------

/** Normalize calendar events into feed items. */
export function normalizeEvents(
  events: ExpandedCalendarEvent[],
): CalendarFeedItem[] {
  return events.map((e) => ({
    id: `events:${e.id}`,
    domain: "events" as FeedDomain,
    sourceId: e.id,
    title: e.title,
    date: e.start_date,
    startTime: e.start_time,
    endTime: e.end_time,
    allDay: e.start_time === null,
    completed: false,
    actions: [],
  }));
}

/**
 * Normalize tasks with due dates into feed items.
 * Only includes tasks that have a due_date within the range.
 */
export function normalizeTasks(
  tasks: Task[],
): CalendarFeedItem[] {
  return tasks
    .filter((t) => t.due_date !== null)
    .map((t) => ({
      id: `tasks:${t.id}`,
      domain: "tasks" as FeedDomain,
      sourceId: t.id,
      title: t.title,
      date: t.due_date!,
      startTime: t.due_time,
      endTime: null,
      allDay: t.due_time === null,
      completed: t.is_completed,
      actions: ["toggle_task" as const],
      meta: { priority: t.priority, status: t.status },
    }));
}

/**
 * Normalize habits into feed items for each date in the range they should track.
 *
 * @param habits Active habits for the user
 * @param logs Completed habit logs in the date range (used to set completed=true)
 * @param startDate Range start (YYYY-MM-DD)
 * @param endDate Range end (YYYY-MM-DD)
 */
export function normalizeHabits(
  habits: Habit[],
  logs: HabitLog[],
  startDate: string,
  endDate: string,
): CalendarFeedItem[] {
  // Build a lookup: habitId:date -> true
  const completedSet = new Set<string>();
  for (const log of logs) {
    if (log.completed) {
      completedSet.add(`${log.habit_id}:${log.logged_date}`);
    }
  }

  const items: CalendarFeedItem[] = [];

  // Parse dates
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  for (const habit of habits) {
    const cursor = new Date(start);
    while (cursor <= end) {
      if (shouldTrackOnDate(habit.frequency, cursor)) {
        const dateStr = [
          cursor.getFullYear(),
          String(cursor.getMonth() + 1).padStart(2, "0"),
          String(cursor.getDate()).padStart(2, "0"),
        ].join("-");

        items.push({
          id: `habits:${habit.id}:${dateStr}`,
          domain: "habits",
          sourceId: habit.id,
          title: habit.name,
          date: dateStr,
          startTime: null,
          endTime: null,
          allDay: true,
          completed: completedSet.has(`${habit.id}:${dateStr}`),
          actions: ["toggle_habit"],
          meta: { streak: habit.current_streak },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return items;
}

/**
 * Normalize completed workouts into feed items.
 * Uses the started_at date as the calendar date.
 */
export function normalizeWorkouts(
  workouts: Workout[],
  timezone?: string,
): CalendarFeedItem[] {
  return workouts.map((w) => {
    // Extract date and time, converting to user's timezone if provided
    let date: string;
    let timePart: string | null;
    if (timezone) {
      const dt = new Date(w.started_at);
      date = dt.toLocaleDateString("sv-SE", { timeZone: timezone }); // YYYY-MM-DD
      timePart = dt.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
    } else {
      date = w.started_at.split("T")[0];
      timePart = w.started_at.split("T")[1]?.slice(0, 5) || null;
    }
    return {
      id: `workouts:${w.id}`,
      domain: "workouts" as FeedDomain,
      sourceId: w.id,
      title: w.title,
      date,
      startTime: timePart,
      endTime: null,
      allDay: !timePart,
      completed: w.status === "completed",
      actions: ["navigate_workout" as const],
      meta: { durationSeconds: w.duration_seconds, status: w.status },
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate feed items from all domains into a single sorted array.
 * Filters by enabled layers (domains the user has toggled on).
 *
 * @param items All normalized feed items
 * @param enabledLayers Set of domain keys the user wants visible
 */
export function aggregateFeedItems(
  items: CalendarFeedItem[],
  enabledLayers: Set<string>,
): CalendarFeedItem[] {
  return items
    .filter((item) => enabledLayers.has(item.domain))
    .sort((a, b) => {
      // Sort by date first
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // All-day items first
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      // Then by start time
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      // Then by domain order: events, tasks, habits, workouts
      const domainOrder: Record<string, number> = {
        events: 0,
        tasks: 1,
        habits: 2,
        workouts: 3,
      };
      return (domainOrder[a.domain] ?? 4) - (domainOrder[b.domain] ?? 4);
    });
}

/**
 * Group feed items by date, producing a Map<dateString, CalendarFeedItem[]>.
 */
export function groupFeedItemsByDate(
  items: CalendarFeedItem[],
): Map<string, CalendarFeedItem[]> {
  const map = new Map<string, CalendarFeedItem[]>();
  for (const item of items) {
    const existing = map.get(item.date) || [];
    existing.push(item);
    map.set(item.date, existing);
  }
  return map;
}

/**
 * Convert CalendarFeedItem[] into DomainCalendarEvent[] for compatibility
 * with existing calendar view components (MonthGrid, WeekView, DayView).
 *
 * Feed items are mapped to pseudo-events with domain metadata
 * so the UI can apply domain-specific colors and actions.
 */
export function feedItemsToExpandedEvents(
  items: CalendarFeedItem[],
): DomainCalendarEvent[] {
  return items.map((item) => ({
    id: item.id,
    user_id: "",
    title: item.title,
    description: null,
    start_date: item.date,
    start_time: item.startTime,
    end_date: item.date,
    end_time: item.endTime,
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
    created_at: "",
    updated_at: "",
    is_virtual: true,
    _domain: item.domain,
    _completed: item.completed,
    _actions: item.actions,
    _sourceId: item.sourceId,
    _meta: item.meta,
  }));
}

/** Adapt the typed task overlay into the existing calendar rendering seam. */
export function taskOverlayItemsToExpandedEvents(
  items: TaskOverlayItem[],
): DomainCalendarEvent[] {
  return overlayItemsToExpandedEvents(items);
}

/** Adapt typed task and habit overlay items into the existing calendar seam. */
export function overlayItemsToExpandedEvents(
  items: CalendarOverlayItem[],
): DomainCalendarEvent[] {
  return items.map((item) => ({
    id: item.id,
    user_id: "",
    title: item.title,
    description: null,
    start_date: item.date,
    start_time: item.startTime,
    end_date: item.date,
    end_time: item.endTime,
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
    created_at: "",
    updated_at: "",
    is_virtual: true,
    _domain: item.layer,
    _completed: item.completed,
    _sourceId: item.layer === "tasks" ? item.taskId : item.habitId,
    ...(item.layer === "tasks"
      ? { _taskAction: item.action }
      : { _habitAction: item.action }),
  }));
}

/** Adapt typed habit overlay items into the existing calendar seam. */
export function habitOverlayItemsToExpandedEvents(
  items: HabitOverlayItem[],
): DomainCalendarEvent[] {
  return overlayItemsToExpandedEvents(items);
}
