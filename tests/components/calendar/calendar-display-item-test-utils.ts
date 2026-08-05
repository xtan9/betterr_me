import {
  calendarEventToDisplayItem,
  type CalendarDisplayItem,
} from "@/lib/calendar/display";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

export function toDisplayItems(
  events: ExpandedCalendarEvent[],
): CalendarDisplayItem[] {
  return events.map(calendarEventToDisplayItem);
}

export function toDisplayMap(
  events: Map<string, ExpandedCalendarEvent[]>,
): Map<string, CalendarDisplayItem[]> {
  return new Map(
    [...events.entries()].map(([date, dayEvents]) => [date, toDisplayItems(dayEvents)]),
  );
}
