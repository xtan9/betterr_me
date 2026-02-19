import type { HabitFrequency } from '@/lib/db/types';
import { shouldTrackOnDate } from '@/lib/habits/format';
import { getWeekStart, getWeekKey } from '@/lib/habits/week-utils';
import { getLocalDateString } from '@/lib/utils';

/**
 * Format a Date as YYYY-MM-DD (local time, no UTC shift).
 */
function formatDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Parse a YYYY-MM-DD string into a local Date (avoids UTC offset issues).
 */
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Compute consecutive missed scheduled days (or weeks) and the previous streak
 * for a single habit, walking backwards from yesterday.
 *
 * Today is excluded (the user still has time to complete it).
 * For weekly/times_per_week habits, the current week is excluded (still in progress).
 *
 * @param frequency - The habit's scheduling frequency
 * @param completedDatesSet - Set of YYYY-MM-DD strings for completed dates
 * @param todayStr - Today's date as YYYY-MM-DD
 * @param createdAtStr - Habit creation date; accepts YYYY-MM-DD or full ISO timestamp
 * @param dataStartStr - Optional earliest date with reliable log data (caps backward walk)
 * @returns An object with:
 *   - `missed_scheduled_days`: consecutive scheduled-but-uncompleted days (or weeks)
 *   - `previous_streak`: streak length before the gap started
 *   - `absence_unit`: 'days' for daily/weekdays/custom, 'weeks' for weekly/times_per_week
 */
export function computeMissedDays(
  frequency: HabitFrequency,
  completedDatesSet: Set<string>,
  todayStr: string,
  createdAtStr: string,
  dataStartStr?: string,
): { missed_scheduled_days: number; previous_streak: number; absence_unit: 'days' | 'weeks' } {
  if (!createdAtStr) {
    return { missed_scheduled_days: 0, previous_streak: 0, absence_unit: 'days' };
  }

  const today = parseDate(todayStr);
  if (isNaN(today.getTime())) {
    return { missed_scheduled_days: 0, previous_streak: 0, absence_unit: 'days' };
  }

  const createdDate = parseDate(createdAtStr.substring(0, 10));
  if (isNaN(createdDate.getTime())) {
    return { missed_scheduled_days: 0, previous_streak: 0, absence_unit: 'days' };
  }

  const dataStart = dataStartStr ? parseDate(dataStartStr) : null;

  // Weekly-type frequencies: count missed WEEKS, not days
  if (frequency.type === 'times_per_week' || frequency.type === 'weekly') {
    const targetPerWeek = frequency.type === 'times_per_week' ? frequency.count : 1;
    const weekStartDay = 0; // Sunday default, matching calculateWeeklyStreak

    // Group completed dates by week
    const weekCompletions = new Map<string, number>();
    for (const dateStr of completedDatesSet) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const wk = getWeekKey(date, weekStartDay);
      weekCompletions.set(wk, (weekCompletions.get(wk) || 0) + 1);
    }

    // Start from the previous week (current week is still in progress)
    const currentWeekStart = getWeekStart(today, weekStartDay);
    const checkWeekStart = new Date(currentWeekStart);
    checkWeekStart.setDate(checkWeekStart.getDate() - 7);

    let phase: 'counting_missed' | 'counting_streak' = 'counting_missed';
    let missed = 0;
    let previousStreak = 0;

    for (let i = 0; i < 52; i++) {
      if (checkWeekStart < createdDate) break;
      if (dataStart && checkWeekStart < dataStart) break;

      const weekKey = getLocalDateString(checkWeekStart);
      const completions = weekCompletions.get(weekKey) || 0;
      const metTarget = completions >= targetPerWeek;

      if (phase === 'counting_missed') {
        if (metTarget) {
          phase = 'counting_streak';
          previousStreak++;
        } else {
          missed++;
        }
      } else {
        if (metTarget) {
          previousStreak++;
        } else {
          break;
        }
      }

      checkWeekStart.setDate(checkWeekStart.getDate() - 7);
    }

    return { missed_scheduled_days: missed, previous_streak: previousStreak, absence_unit: 'weeks' };
  }

  // Day-based path for daily/weekdays/custom
  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1); // start from yesterday

  let phase: 'counting_missed' | 'counting_streak' = 'counting_missed';
  let missed = 0;
  let previousStreak = 0;

  for (let i = 0; i < 365; i++) {
    if (checkDate < createdDate) break;
    if (dataStart && checkDate < dataStart) break;

    const dateStr = formatDate(checkDate);

    if (shouldTrackOnDate(frequency, checkDate)) {
      const completed = completedDatesSet.has(dateStr);

      if (phase === 'counting_missed') {
        if (completed) {
          phase = 'counting_streak';
          previousStreak++;
        } else {
          missed++;
        }
      } else {
        // counting_streak
        if (completed) {
          previousStreak++;
        } else {
          break;
        }
      }
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }

  return { missed_scheduled_days: missed, previous_streak: previousStreak, absence_unit: 'days' };
}
