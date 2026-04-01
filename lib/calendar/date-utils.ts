import type { ExpandedCalendarEvent } from "./recurrence";

/**
 * Returns YYYY-MM-DD string for a Date object using local timezone.
 * Never uses toISOString() which converts to UTC.
 */
export function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
    startDate: getDateString(dates[0]),
    endDate: getDateString(dates[dates.length - 1]),
  };
}

/**
 * Groups events by their dates into a Map.
 * Multi-day events appear in each date they span.
 * Events within each day are sorted: all-day first, then by start_time ascending.
 */
export function groupEventsByDate(
  events: ExpandedCalendarEvent[],
): Map<string, ExpandedCalendarEvent[]> {
  const map = new Map<string, ExpandedCalendarEvent[]>();

  for (const event of events) {
    const start = event.start_date;
    const end = event.end_date;

    if (start === end) {
      // Single-day event
      const existing = map.get(start) || [];
      existing.push(event);
      map.set(start, existing);
    } else {
      // Multi-day event: add to each date it spans
      const startParts = start.split("-").map(Number);
      const endParts = end.split("-").map(Number);
      const startMs = new Date(startParts[0], startParts[1] - 1, startParts[2]).getTime();
      const endMs = new Date(endParts[0], endParts[1] - 1, endParts[2]).getTime();
      const dayCount = Math.round((endMs - startMs) / 86400000) + 1;

      for (let i = 0; i < dayCount; i++) {
        const d = new Date(startParts[0], startParts[1] - 1, startParts[2] + i);
        const dateStr = getDateString(d);
        const existing = map.get(dateStr) || [];
        existing.push(event);
        map.set(dateStr, existing);
      }
    }
  }

  // Sort events within each day: all-day first, then by start_time
  for (const [, dayEvents] of map) {
    dayEvents.sort((a, b) => {
      if (a.start_time === null && b.start_time === null) return 0;
      if (a.start_time === null) return -1;
      if (b.start_time === null) return 1;
      return a.start_time.localeCompare(b.start_time);
    });
  }

  return map;
}
