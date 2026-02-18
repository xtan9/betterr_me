import type { RecurrenceRule } from '@/lib/db/types';

/**
 * Parse a YYYY-MM-DD date string into year, month (0-based), day components.
 * Uses manual parsing to avoid timezone issues from Date constructor.
 */
function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m - 1, d]; // month is 0-based for Date constructor
}

/** Create a YYYY-MM-DD string from a Date */
function toDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Get the day of week (0=Sun) for a YYYY-MM-DD string */
function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = parseDateParts(dateStr);
  return new Date(y, m, d).getDay();
}

/** Add N days to a date string */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = parseDateParts(dateStr);
  const date = new Date(y, m, d + days);
  return toDateString(date);
}

/** Compare two YYYY-MM-DD strings: negative if a < b, 0 if equal, positive if a > b */
function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * For monthly-by-weekday: find the Nth occurrence of a given weekday in a month.
 * weekPosition: 'first'|'second'|'third'|'fourth'|'last'
 * dayOfWeek: 0-6 (Sun=0)
 */
function getNthWeekdayOfMonth(
  year: number,
  month: number, // 0-based
  weekPosition: string,
  dayOfWeek: number
): Date | null {
  if (weekPosition === 'last') {
    // Start from the last day and work backward
    const lastDay = new Date(year, month + 1, 0);
    for (let d = lastDay.getDate(); d >= 1; d--) {
      const date = new Date(year, month, d);
      if (date.getDay() === dayOfWeek) return date;
    }
    return null;
  }

  const positionMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
  };
  const target = positionMap[weekPosition];
  if (!target) return null;

  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break; // Went past the month
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === target) return date;
    }
  }
  return null;
}

/**
 * Get all occurrence dates of a recurrence rule within a date range [startDate, endDate].
 * Both dates are inclusive. Dates are YYYY-MM-DD strings.
 */
export function getOccurrencesInRange(
  rule: RecurrenceRule,
  ruleStartDate: string,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const occurrences: string[] = [];

  switch (rule.frequency) {
    case 'daily': {
      // Every N days from ruleStartDate
      let current = ruleStartDate;
      // Fast-forward to rangeStart if rule starts before range
      if (compareDates(current, rangeStart) < 0) {
        const [sy, sm, sd] = parseDateParts(ruleStartDate);
        const [ry, rm, rd] = parseDateParts(rangeStart);
        const startMs = new Date(sy, sm, sd).getTime();
        const rangeMs = new Date(ry, rm, rd).getTime();
        const daysDiff = Math.floor((rangeMs - startMs) / (86400000));
        const skip = Math.floor(daysDiff / rule.interval) * rule.interval;
        current = addDays(ruleStartDate, skip);
        if (compareDates(current, rangeStart) < 0) {
          current = addDays(current, rule.interval);
        }
      }
      while (compareDates(current, rangeEnd) <= 0) {
        if (compareDates(current, rangeStart) >= 0) {
          occurrences.push(current);
        }
        current = addDays(current, rule.interval);
      }
      break;
    }

    case 'weekly': {
      const daysOfWeek = rule.days_of_week ?? [getDayOfWeek(ruleStartDate)];
      // Walk week by week from ruleStartDate
      // Find the Monday of the week containing ruleStartDate
      const [sy, sm, sd] = parseDateParts(ruleStartDate);
      const startDow = new Date(sy, sm, sd).getDay();
      const weekStart = addDays(ruleStartDate, -startDow); // Sunday of that week

      // Fast-forward to near rangeStart
      let currentWeekStart = weekStart;
      if (compareDates(currentWeekStart, rangeStart) < 0) {
        const [wy, wm, wd] = parseDateParts(currentWeekStart);
        const [ry, rm, rd] = parseDateParts(rangeStart);
        const weekMs = new Date(wy, wm, wd).getTime();
        const rangeMs = new Date(ry, rm, rd).getTime();
        const weeksDiff = Math.floor((rangeMs - weekMs) / (7 * 86400000));
        const skip = Math.floor(weeksDiff / rule.interval) * rule.interval;
        currentWeekStart = addDays(weekStart, skip * 7);
      }

      while (true) {
        for (const dow of daysOfWeek) {
          const dateStr = addDays(currentWeekStart, dow);
          if (
            compareDates(dateStr, ruleStartDate) >= 0 &&
            compareDates(dateStr, rangeStart) >= 0 &&
            compareDates(dateStr, rangeEnd) <= 0
          ) {
            occurrences.push(dateStr);
          }
        }
        currentWeekStart = addDays(currentWeekStart, 7 * rule.interval);
        if (compareDates(currentWeekStart, rangeEnd) > 0) break;
      }

      occurrences.sort();
      break;
    }

    case 'monthly': {
      const [sy, sm] = parseDateParts(ruleStartDate);
      const [ry, rm] = parseDateParts(rangeStart);
      // Start from ruleStartDate's month and iterate
      let monthOffset = 0;
      // Fast-forward
      const totalMonthsStart = sy * 12 + sm;
      const totalMonthsRange = ry * 12 + rm;
      if (totalMonthsRange > totalMonthsStart) {
        const diff = totalMonthsRange - totalMonthsStart;
        monthOffset = Math.floor(diff / rule.interval) * rule.interval;
      }

      for (let i = monthOffset; ; i += rule.interval) {
        const targetMonth = new Date(sy, sm + i, 1);
        const year = targetMonth.getFullYear();
        const month = targetMonth.getMonth();

        let dateStr: string | null = null;

        if (rule.week_position && rule.day_of_week_monthly !== undefined) {
          // Monthly by weekday position
          const result = getNthWeekdayOfMonth(year, month, rule.week_position, rule.day_of_week_monthly);
          if (result) dateStr = toDateString(result);
        } else {
          // Monthly by date
          const dayOfMonth = rule.day_of_month ?? parseInt(ruleStartDate.split('-')[2]);
          const lastDay = new Date(year, month + 1, 0).getDate();
          const day = Math.min(dayOfMonth, lastDay);
          dateStr = toDateString(new Date(year, month, day));
        }

        if (dateStr) {
          if (compareDates(dateStr, rangeEnd) > 0) break;
          if (
            compareDates(dateStr, ruleStartDate) >= 0 &&
            compareDates(dateStr, rangeStart) >= 0
          ) {
            occurrences.push(dateStr);
          }
        }
        // Safety: if we've gone too far past the range end
        if (year > parseInt(rangeEnd.split('-')[0]) + 1) break;
      }
      break;
    }

    case 'yearly': {
      const [sy] = parseDateParts(ruleStartDate);
      const [ry] = parseDateParts(rangeStart);
      const monthOfYear = (rule.month_of_year ?? parseInt(ruleStartDate.split('-')[1])) - 1; // 0-based
      const dayOfMonth = rule.day_of_month ?? parseInt(ruleStartDate.split('-')[2]);

      let yearOffset = 0;
      if (ry > sy) {
        const diff = ry - sy;
        yearOffset = Math.floor(diff / rule.interval) * rule.interval;
      }

      for (let i = yearOffset; ; i += rule.interval) {
        const year = sy + i;
        const lastDay = new Date(year, monthOfYear + 1, 0).getDate();
        const day = Math.min(dayOfMonth, lastDay);
        const dateStr = toDateString(new Date(year, monthOfYear, day));

        if (compareDates(dateStr, rangeEnd) > 0) break;
        if (
          compareDates(dateStr, ruleStartDate) >= 0 &&
          compareDates(dateStr, rangeStart) >= 0
        ) {
          occurrences.push(dateStr);
        }
        if (year > parseInt(rangeEnd.split('-')[0]) + 1) break;
      }
      break;
    }
  }

  return occurrences;
}

/**
 * Get the next occurrence date after a given date.
 */
export function getNextOccurrence(
  rule: RecurrenceRule,
  ruleStartDate: string,
  afterDate: string
): string | null {
  // Look up to 2 years ahead for the next occurrence
  const searchEnd = addDays(afterDate, 731);
  const nextDay = addDays(afterDate, 1);
  const occurrences = getOccurrencesInRange(rule, ruleStartDate, nextDay, searchEnd);
  return occurrences[0] ?? null;
}

/** Day name abbreviations (0=Sun) */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Generate a human-readable description of a recurrence rule.
 */
export function describeRecurrence(rule: RecurrenceRule): string {
  const interval = rule.interval;

  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Every day' : `Every ${interval} days`;

    case 'weekly': {
      const days = (rule.days_of_week ?? []).map(d => DAY_NAMES[d]).join(', ');
      const prefix = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
      return days ? `${prefix} on ${days}` : prefix;
    }

    case 'monthly': {
      const prefix = interval === 1 ? 'Every month' : `Every ${interval} months`;
      if (rule.week_position && rule.day_of_week_monthly !== undefined) {
        return `${prefix} on the ${rule.week_position} ${DAY_NAMES[rule.day_of_week_monthly]}`;
      }
      if (rule.day_of_month) {
        return `${prefix} on the ${ordinal(rule.day_of_month)}`;
      }
      return prefix;
    }

    case 'yearly': {
      const prefix = interval === 1 ? 'Every year' : `Every ${interval} years`;
      if (rule.month_of_year && rule.day_of_month) {
        const monthName = new Date(2024, rule.month_of_year - 1, 1).toLocaleDateString('en-US', { month: 'long' });
        return `${prefix} on ${monthName} ${rule.day_of_month}`;
      }
      return prefix;
    }
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
