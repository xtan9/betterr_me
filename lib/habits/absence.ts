import type { HabitFrequency } from '@/lib/db/types';
import { shouldTrackOnDate } from '@/lib/habits/format';

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
 * Compute consecutive missed scheduled days and the previous streak
 * for a single habit, walking backwards from yesterday.
 *
 * Today is excluded (the user still has time to complete it).
 *
 * @returns missed_scheduled_days — consecutive scheduled-but-uncompleted days
 *          previous_streak — streak length before the gap started
 */
export function computeMissedDays(
  frequency: HabitFrequency,
  completedDatesSet: Set<string>,
  todayStr: string,
  createdAtStr: string,
): { missed_scheduled_days: number; previous_streak: number } {
  const today = parseDate(todayStr);
  const createdDate = parseDate(createdAtStr.substring(0, 10));

  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1); // start from yesterday

  let phase: 'counting_missed' | 'counting_streak' = 'counting_missed';
  let missed = 0;
  let previousStreak = 0;

  for (let i = 0; i < 365; i++) {
    if (checkDate < createdDate) break;

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

  return { missed_scheduled_days: missed, previous_streak: previousStreak };
}
