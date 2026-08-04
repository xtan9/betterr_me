import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import { groupDatedCalendarItems } from "./date-utils";
import type {
  CalendarOverlayItem,
  CalendarOverlayLayer,
  HabitOverlayAction,
  TaskOverlayAction,
  WorkoutOverlayAction,
} from "./overlay-feed";

export type CalendarLayer = "events" | CalendarOverlayLayer;

export const CALENDAR_LAYER_COLORS: Record<CalendarLayer, { main: string; muted: string }> = {
  events: { main: "--calendar-event", muted: "--calendar-event-muted" },
  tasks: { main: "--calendar-task", muted: "--calendar-task-muted" },
  habits: { main: "--calendar-habit", muted: "--calendar-habit-muted" },
  workouts: { main: "--calendar-workout", muted: "--calendar-workout-muted" },
};

interface CalendarDisplayFields {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
}

export interface CalendarEventDisplayItem extends CalendarDisplayFields {
  kind: "event";
  /** Full-fidelity Calendar Event data used by editing and event-specific actions. */
  event: ExpandedCalendarEvent;
}

export type CalendarOverlayAction =
  | TaskOverlayAction
  | HabitOverlayAction
  | WorkoutOverlayAction;

export interface CalendarOverlayDisplayItem extends CalendarDisplayFields {
  kind: "overlay";
  layer: CalendarOverlayLayer;
  completed: boolean;
  action: CalendarOverlayAction;
}

export type CalendarDisplayItem =
  | CalendarEventDisplayItem
  | CalendarOverlayDisplayItem;

/** Adapt a full-fidelity Calendar Event to the Calendar views' display seam. */
export function calendarEventToDisplayItem(
  event: ExpandedCalendarEvent,
): CalendarEventDisplayItem {
  return {
    kind: "event",
    event,
    id: event.id,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    start_time: event.start_time,
    end_time: event.end_time,
    color: event.color,
  };
}

function overlayItemToDisplayItem(item: CalendarOverlayItem): CalendarOverlayDisplayItem {
  return {
    kind: "overlay",
    id: item.id,
    title: item.title,
    start_date: item.date,
    end_date: item.date,
    start_time: item.startTime,
    end_time: item.endTime,
    color: null,
    layer: item.layer,
    completed: item.completed,
    action: item.action,
  };
}

/** Adapt selected Calendar Overlay Feed items without manufacturing Calendar Event fields. */
export function overlayItemsToDisplayItems(
  items: CalendarOverlayItem[],
): CalendarOverlayDisplayItem[] {
  return items.map(overlayItemToDisplayItem);
}

/** Group the display seam by the local start date consumed by Calendar views. */
export function groupCalendarDisplayItemsByDate(
  items: CalendarDisplayItem[],
): Map<string, CalendarDisplayItem[]> {
  return groupDatedCalendarItems(items);
}
