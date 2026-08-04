import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type {
  CalendarOverlayItem,
  HabitOverlayAction,
  HabitOverlayItem,
  TaskOverlayAction,
  TaskOverlayItem,
  WorkoutOverlayAction,
  WorkoutOverlayItem,
} from "./overlay-feed";

export type CalendarLayer = "events" | "tasks" | "habits" | "workouts";

export const CALENDAR_LAYER_COLORS: Record<CalendarLayer, { main: string; muted: string }> = {
  events: { main: "--calendar-event", muted: "--calendar-event-muted" },
  tasks: { main: "--calendar-task", muted: "--calendar-task-muted" },
  habits: { main: "--calendar-habit", muted: "--calendar-habit-muted" },
  workouts: { main: "--calendar-workout", muted: "--calendar-workout-muted" },
};

export interface CalendarDisplayEvent extends ExpandedCalendarEvent {
  _layer?: CalendarLayer;
  _completed?: boolean;
  _taskAction?: TaskOverlayAction;
  _habitAction?: HabitOverlayAction;
  _workoutAction?: WorkoutOverlayAction;
}

function overlayEvent(item: CalendarOverlayItem): CalendarDisplayEvent {
  return {
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
    _layer: item.layer,
    _completed: item.completed,
    ...(item.layer === "tasks"
      ? { _taskAction: item.action }
      : item.layer === "habits"
        ? { _habitAction: item.action }
        : { _workoutAction: item.action }),
  };
}

/** Adapt typed Calendar Overlay Feed items to the existing calendar view seam. */
export function overlayItemsToExpandedEvents(
  items: CalendarOverlayItem[],
): CalendarDisplayEvent[] {
  return items.map(overlayEvent);
}

export function taskOverlayItemsToExpandedEvents(
  items: TaskOverlayItem[],
): CalendarDisplayEvent[] {
  return overlayItemsToExpandedEvents(items);
}

export function habitOverlayItemsToExpandedEvents(
  items: HabitOverlayItem[],
): CalendarDisplayEvent[] {
  return overlayItemsToExpandedEvents(items);
}

export function workoutOverlayItemsToExpandedEvents(
  items: WorkoutOverlayItem[],
): CalendarDisplayEvent[] {
  return overlayItemsToExpandedEvents(items);
}
