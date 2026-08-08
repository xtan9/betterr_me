import type { CalendarEvent } from "@/lib/db/types";
import { getOccurrencesInRange } from "@/lib/recurring-tasks/scheduling";

/**
 * An expanded calendar event with a virtual flag indicating
 * whether it was generated from a recurring parent or is a real DB record.
 */
export type ExpandedCalendarEvent = CalendarEvent & { is_virtual: boolean };

/**
 * Calculate the number of days between two YYYY-MM-DD date strings.
 * Returns a non-negative integer representing the day difference.
 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aMs = new Date(ay, am - 1, ad).getTime();
  const bMs = new Date(by, bm - 1, bd).getTime();
  return Math.round(Math.abs(bMs - aMs) / 86400000);
}

/**
 * Add N days to a YYYY-MM-DD date string. Returns a new YYYY-MM-DD string.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Check if a YYYY-MM-DD date falls within [rangeStart, rangeEnd] inclusive.
 */
function isInRange(date: string, rangeStart: string, rangeEnd: string): boolean {
  return date >= rangeStart && date <= rangeEnd;
}

/**
 * Expand a list of calendar events (standalone, recurring parents, and exceptions)
 * into a flat list of events for a given date range.
 *
 * - Standalone events pass through with is_virtual=false
 * - Recurring parents are expanded into virtual occurrences with is_virtual=true
 * - Exceptions suppress the virtual occurrence at their original_date and
 *   appear as real records (is_virtual=false) at their own start_date
 *
 * Results are sorted by start_date, then start_time (nulls first for all-day events).
 */
const MAX_OCCURRENCES_PER_EVENT = 500;

export function expandEventsForRange(
  events: CalendarEvent[],
  startDate: string,
  endDate: string,
): ExpandedCalendarEvent[] {
  const result: ExpandedCalendarEvent[] = [];

  // Separate events into categories
  const standaloneEvents: CalendarEvent[] = [];
  const recurringParents: CalendarEvent[] = [];
  // Index exceptions by recurring_event_id -> Map<original_date, exception>
  const exceptionsByParent = new Map<string, Map<string, CalendarEvent>>();

  for (const event of events) {
    if (event.is_exception && event.recurring_event_id) {
      // Exception record
      let parentMap = exceptionsByParent.get(event.recurring_event_id);
      if (!parentMap) {
        parentMap = new Map();
        exceptionsByParent.set(event.recurring_event_id, parentMap);
      }
      if (event.original_date) {
        parentMap.set(event.original_date, event);
      } else {
        // Exception without original_date — treat as standalone
        standaloneEvents.push(event);
      }
    } else if (event.is_recurring) {
      recurringParents.push(event);
    } else {
      standaloneEvents.push(event);
    }
  }

  // Add standalone events that fall within the range
  for (const event of standaloneEvents) {
    // An event is in range if its date span overlaps with [startDate, endDate]
    if (event.end_date >= startDate && event.start_date <= endDate) {
      result.push({ ...event, is_virtual: false });
    }
  }

  // Expand each recurring parent
  for (const parent of recurringParents) {
    // Guard: if no recurrence_rule, treat as standalone (data integrity issue)
    if (!parent.recurrence_rule) {
      if (parent.end_date >= startDate && parent.start_date <= endDate) {
        result.push({ ...parent, is_virtual: false });
      }
      continue;
    }

    const exceptions = exceptionsByParent.get(parent.id);
    const durationDays = daysBetween(parent.start_date, parent.end_date);

    // Determine the effective expansion range
    let effectiveEndDate = endDate;
    if (parent.end_type === "on_date" && parent.end_date_recurrence) {
      // Clamp to the recurrence end date
      if (parent.end_date_recurrence < effectiveEndDate) {
        effectiveEndDate = parent.end_date_recurrence;
      }
    }

    let occurrences: string[];

    if (parent.end_type === "after_count" && parent.end_count != null) {
      // For after_count, we need all occurrences from the start to find the first N
      const allOccurrences = getOccurrencesInRange(
        parent.recurrence_rule,
        parent.start_date,
        parent.start_date,
        endDate,
      ).slice(0, MAX_OCCURRENCES_PER_EVENT);
      // Take only the first end_count occurrences
      const limited = allOccurrences.slice(0, parent.end_count);
      // Filter to only those in the requested range
      occurrences = limited.filter((d) => d >= startDate && d <= endDate);
    } else {
      const raw = getOccurrencesInRange(
        parent.recurrence_rule,
        parent.start_date,
        startDate,
        effectiveEndDate,
      );
      occurrences = raw.slice(0, MAX_OCCURRENCES_PER_EVENT);
    }

    // Track which exception original_dates were covered by expansion
    const coveredExceptionDates = new Set<string>();

    for (const date of occurrences) {
      // Check if an exception exists for this date
      const exception = exceptions?.get(date);
      if (exception) {
        coveredExceptionDates.add(date);
        // Add the exception record (not virtual) if its start_date is in range
        if (isInRange(exception.start_date, startDate, endDate)) {
          result.push({ ...exception, is_virtual: false });
        }
      } else {
        // Create a virtual occurrence
        const virtualEvent: ExpandedCalendarEvent = {
          ...parent,
          id: `${parent.id}_${date}`,
          start_date: date,
          end_date: addDays(date, durationDays),
          recurring_event_id: parent.id,
          original_date: date,
          is_virtual: true,
        };
        result.push(virtualEvent);
      }
    }

    // Add any exceptions whose original_date was NOT covered (moved exceptions)
    // These still need to appear if their start_date is in range
    if (exceptions) {
      for (const [originalDate, exception] of exceptions) {
        if (!coveredExceptionDates.has(originalDate)) {
          if (isInRange(exception.start_date, startDate, endDate)) {
            result.push({ ...exception, is_virtual: false });
          }
        }
      }
    }
  }

  // Sort by start_date, then start_time (null = all-day, sorts first)
  result.sort((a, b) => {
    const dateCompare = a.start_date.localeCompare(b.start_date);
    if (dateCompare !== 0) return dateCompare;
    // null start_time (all-day) sorts before non-null
    if (a.start_time === null && b.start_time === null) return 0;
    if (a.start_time === null) return -1;
    if (b.start_time === null) return 1;
    return a.start_time.localeCompare(b.start_time);
  });

  return result;
}
