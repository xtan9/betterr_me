/**
 * Pure aggregation functions that convert domain data into CalendarFeedItem arrays.
 *
 * No DB imports — all inputs are typed args. This follows the same pattern
 * as lib/money/projections and lib/money/insights.
 */

import type { CalendarFeedItem } from "./feed-types";
import { DOMAIN_COLORS } from "./feed-types";
import type { Task, Habit, Workout, RecurringBill, HabitLog } from "@/lib/db/types";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import { shouldTrackOnDate } from "@/lib/habits/format";

/**
 * Convert expanded calendar events into feed items.
 */
export function aggregateEventsForFeed(
  events: ExpandedCalendarEvent[],
): CalendarFeedItem[] {
  return events.map((event) => ({
    id: `event_${event.id}`,
    source: "event" as const,
    title: event.title,
    start_date: event.start_date,
    start_time: event.start_time ? event.start_time.slice(0, 5) : null,
    end_date: event.end_date,
    end_time: event.end_time ? event.end_time.slice(0, 5) : null,
    color: event.color || DOMAIN_COLORS.event,
    is_all_day: !event.start_time,
    meta: {
      event_id: event.id,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      is_recurring: event.is_recurring,
      is_virtual: event.is_virtual,
    },
  }));
}

/**
 * Convert tasks with due_date into feed items for a date range.
 * Only includes tasks that have a due_date within the range.
 */
export function aggregateTasksForFeed(
  tasks: Task[],
  startDate: string,
  endDate: string,
): CalendarFeedItem[] {
  return tasks
    .filter(
      (task) =>
        task.due_date &&
        task.due_date >= startDate &&
        task.due_date <= endDate,
    )
    .map((task) => ({
      id: `task_${task.id}`,
      source: "task" as const,
      title: task.title,
      start_date: task.due_date!,
      start_time: task.due_time ? task.due_time.slice(0, 5) : null,
      end_date: task.due_date!,
      end_time: task.due_time
        ? (() => {
            // Add 30 min to due_time for display
            const [h, m] = task.due_time.split(":").map(Number);
            const endMinutes = h * 60 + m + 30;
            const endH = Math.floor(endMinutes / 60) % 24;
            const endM = endMinutes % 60;
            return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
          })()
        : null,
      color: DOMAIN_COLORS.task,
      is_all_day: !task.due_time,
      meta: {
        task_id: task.id,
        is_completed: task.is_completed,
        priority: task.priority,
      },
    }));
}

/**
 * Convert active habits into feed items for each day in a date range
 * where shouldTrackOnDate returns true.
 *
 * @param habits - Active habits for the user
 * @param logs - Completed habit logs in the date range (habit_id, logged_date, completed)
 * @param startDate - YYYY-MM-DD
 * @param endDate - YYYY-MM-DD
 */
export function aggregateHabitsForFeed(
  habits: Habit[],
  logs: Pick<HabitLog, "habit_id" | "logged_date" | "completed">[],
  startDate: string,
  endDate: string,
): CalendarFeedItem[] {
  const items: CalendarFeedItem[] = [];

  // Build a set of completed (habit_id, date) pairs
  const completedSet = new Set<string>();
  for (const log of logs) {
    if (log.completed) {
      completedSet.add(`${log.habit_id}_${log.logged_date}`);
    }
  }

  // Iterate over each date in the range
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  const cursor = new Date(start);
  while (cursor <= end) {
    const dateStr = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, "0"),
      String(cursor.getDate()).padStart(2, "0"),
    ].join("-");

    for (const habit of habits) {
      if (habit.status !== "active") continue;
      if (shouldTrackOnDate(habit.frequency, cursor)) {
        const isLogged = completedSet.has(`${habit.id}_${dateStr}`);
        items.push({
          id: `habit_${habit.id}_${dateStr}`,
          source: "habit" as const,
          title: habit.name,
          start_date: dateStr,
          start_time: null,
          end_date: dateStr,
          end_time: null,
          color: DOMAIN_COLORS.habit,
          is_all_day: true,
          meta: {
            habit_id: habit.id,
            is_logged: isLogged,
          },
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

/**
 * Convert recurring bills into feed items based on next_due_date.
 * Only includes active bills with next_due_date in range.
 */
export function aggregateBillsForFeed(
  bills: RecurringBill[],
  startDate: string,
  endDate: string,
): CalendarFeedItem[] {
  return bills
    .filter(
      (bill) =>
        bill.next_due_date &&
        bill.next_due_date >= startDate &&
        bill.next_due_date <= endDate &&
        bill.is_active &&
        bill.user_status !== "dismissed",
    )
    .map((bill) => ({
      id: `bill_${bill.id}`,
      source: "bill" as const,
      title: bill.name,
      start_date: bill.next_due_date!,
      start_time: null,
      end_date: bill.next_due_date!,
      end_time: null,
      color: DOMAIN_COLORS.bill,
      is_all_day: true,
      meta: {
        bill_id: bill.id,
        is_paid: bill.user_status === "confirmed",
        amount_cents: bill.amount_cents,
      },
    }));
}

/**
 * Convert completed workouts into feed items based on started_at date.
 */
export function aggregateWorkoutsForFeed(
  workouts: Workout[],
  startDate: string,
  endDate: string,
): CalendarFeedItem[] {
  return workouts
    .filter((workout) => {
      if (!workout.started_at) return false;
      // Extract date from started_at (ISO string)
      const dateStr = workout.started_at.split("T")[0];
      return dateStr >= startDate && dateStr <= endDate;
    })
    .map((workout) => {
      const dateStr = workout.started_at.split("T")[0];
      // Extract time from started_at
      const timePart = workout.started_at.split("T")[1];
      const startTime = timePart ? timePart.slice(0, 5) : null;
      // Compute end time from duration
      let endTime: string | null = null;
      if (startTime && workout.duration_seconds) {
        const [h, m] = startTime.split(":").map(Number);
        const endMinutes = h * 60 + m + Math.ceil(workout.duration_seconds / 60);
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = endMinutes % 60;
        endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      }

      return {
        id: `workout_${workout.id}`,
        source: "workout" as const,
        title: workout.title,
        start_date: dateStr,
        start_time: startTime,
        end_date: dateStr,
        end_time: endTime,
        color: DOMAIN_COLORS.workout,
        is_all_day: false,
        meta: {
          workout_id: workout.id,
          duration_seconds: workout.duration_seconds,
        },
      };
    });
}

/**
 * Merge and sort feed items by start_date, then start_time (all-day first).
 */
export function mergeFeedItems(
  ...itemArrays: CalendarFeedItem[][]
): CalendarFeedItem[] {
  const all = itemArrays.flat();
  return all.sort((a, b) => {
    const dateCompare = a.start_date.localeCompare(b.start_date);
    if (dateCompare !== 0) return dateCompare;
    // All-day items sort before timed items
    if (a.is_all_day && !b.is_all_day) return -1;
    if (!a.is_all_day && b.is_all_day) return 1;
    // Both timed: compare start_time
    if (a.start_time && b.start_time) {
      return a.start_time.localeCompare(b.start_time);
    }
    return 0;
  });
}
