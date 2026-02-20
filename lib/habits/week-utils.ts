import { getLocalDateString } from '@/lib/utils';

/**
 * Get the start of a week for a given date based on week start preference.
 */
export function getWeekStart(date: Date, weekStartDay: number = 0): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const currentDayOfWeek = result.getDay();
  const daysToSubtract = (currentDayOfWeek - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysToSubtract);
  return result;
}

/**
 * Get a week identifier string for grouping (YYYY-MM-DD of the week start date).
 */
export function getWeekKey(date: Date, weekStartDay: number = 0): string {
  const weekStart = getWeekStart(date, weekStartDay);
  return getLocalDateString(weekStart);
}
