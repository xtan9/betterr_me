import type { ExpandedCalendarEvent } from "./recurrence";
import { getLocalDateString } from "@/lib/utils";

/**
 * Returns array of Date objects representing the full month grid.
 * Starts from the weekStartDay of the week containing the 1st of the month.
 * Always returns 35 or 42 dates (5 or 6 complete weeks).
 *
 * @param year - Full year (e.g. 2026)
 * @param month - 0-indexed month (0=January, 11=December)
 * @param weekStartDay - 0=Sunday, 1=Monday, ..., 6=Saturday
 */
export function getMonthGridDates(
  year: number,
  month: number,
  weekStartDay: number,
): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = firstOfMonth.getDay();

  // Calculate how many days to go back to reach the weekStartDay
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;

  const startDate = new Date(year, month, 1 - daysBack);

  // Determine if we need 5 or 6 rows
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalLeadingDays = daysBack;
  const totalCells = totalLeadingDays + daysInMonth;
  const rows = totalCells > 35 ? 6 : 5;
  const totalDates = rows * 7;

  const dates: Date[] = [];
  for (let i = 0; i < totalDates; i++) {
    dates.push(
      new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i),
    );
  }

  return dates;
}

/**
 * Returns the padded date range (first and last dates) for the month grid.
 * Useful for constructing API query parameters.
 */
export function getMonthDateRange(
  year: number,
  month: number,
  weekStartDay: number,
): { startDate: string; endDate: string } {
  const dates = getMonthGridDates(year, month, weekStartDay);
  return {
    startDate: getLocalDateString(dates[0]),
    endDate: getLocalDateString(dates[dates.length - 1]),
  };
}

interface DatedCalendarItem {
  start_date: string;
  end_date: string;
  start_time: string | null;
}

/**
 * Groups dated Calendar display items into a Map.
 * Multi-day items appear in each date they span.
 * Items within each day are sorted: all-day first, then by start_time ascending.
 */
export function groupDatedCalendarItems<T extends DatedCalendarItem>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const start = item.start_date;
    const end = item.end_date;

    if (start === end) {
      const existing = map.get(start) || [];
      existing.push(item);
      map.set(start, existing);
    } else {
      const startParts = start.split("-").map(Number);
      const endParts = end.split("-").map(Number);
      const startMs = new Date(startParts[0], startParts[1] - 1, startParts[2]).getTime();
      const endMs = new Date(endParts[0], endParts[1] - 1, endParts[2]).getTime();
      const dayCount = Math.round((endMs - startMs) / 86400000) + 1;

      for (let i = 0; i < dayCount; i++) {
        const d = new Date(startParts[0], startParts[1] - 1, startParts[2] + i);
        const dateStr = getLocalDateString(d);
        const existing = map.get(dateStr) || [];
        existing.push(item);
        map.set(dateStr, existing);
      }
    }
  }

  for (const [, dayItems] of map) {
    dayItems.sort((a, b) => {
      if (a.start_time === null && b.start_time === null) return 0;
      if (a.start_time === null) return -1;
      if (b.start_time === null) return 1;
      return a.start_time.localeCompare(b.start_time);
    });
  }

  return map;
}

/** Group full-fidelity Calendar Events while preserving their existing view contract. */
export function groupEventsByDate(
  events: ExpandedCalendarEvent[],
): Map<string, ExpandedCalendarEvent[]> {
  return groupDatedCalendarItems(events);
}

/**
 * Returns an array of 7 Date objects for the week containing `date`,
 * starting from `weekStartDay`.
 *
 * @param date - Any date within the desired week
 * @param weekStartDay - 0=Sunday, 1=Monday, ..., 6=Saturday
 */
export function getWeekDates(date: Date, weekStartDay: number): Date[] {
  const day = date.getDay();
  const daysBack = (day - weekStartDay + 7) % 7;
  const weekStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - daysBack,
  );

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + i,
      ),
    );
  }

  return dates;
}

/**
 * Returns the padded date range (first and last dates) for the week containing `date`.
 * Useful for constructing API query parameters for week view.
 */
export function getWeekDateRange(
  date: Date,
  weekStartDay: number,
): { startDate: string; endDate: string } {
  const dates = getWeekDates(date, weekStartDay);
  return {
    startDate: getLocalDateString(dates[0]),
    endDate: getLocalDateString(dates[6]),
  };
}

/**
 * Returns the date range for a single day.
 * Both startDate and endDate are the same date string.
 */
export function getDayDateRange(date: Date): { startDate: string; endDate: string } {
  const dateStr = getLocalDateString(date);
  return { startDate: dateStr, endDate: dateStr };
}
