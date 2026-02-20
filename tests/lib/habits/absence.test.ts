import { describe, it, expect } from 'vitest';
import { computeMissedDays } from '@/lib/habits/absence';
import type { HabitFrequency } from '@/lib/db/types';

describe('computeMissedDays', () => {
  const daily: HabitFrequency = { type: 'daily' };
  const weekdays: HabitFrequency = { type: 'weekdays' };
  const custom: HabitFrequency = { type: 'custom', days: [1, 3, 5] }; // Mon, Wed, Fri

  it('returns 0 missed days when yesterday was completed (daily)', () => {
    const completed = new Set(['2026-02-08']); // yesterday
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('days');
  });

  it('counts consecutive missed days (daily)', () => {
    // Today is 2026-02-09 (Mon). Last completed was 2026-02-05 (Thu).
    // Missed: Feb 6 (Fri), 7 (Sat), 8 (Sun) = 3 days
    const completed = new Set(['2026-02-05', '2026-02-04', '2026-02-03']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(3);
    expect(result.previous_streak).toBe(3);
    expect(result.absence_unit).toBe('days');
  });

  it('skips non-scheduled days for weekdays frequency', () => {
    // Today is 2026-02-09 (Mon). Yesterday was Sun (not tracked).
    // Sat is not tracked. Last weekday was Fri Feb 6.
    // If Fri was completed, missed = 0
    const completed = new Set(['2026-02-06']); // Friday
    const result = computeMissedDays(weekdays, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('days');
  });

  it('counts missed weekdays correctly', () => {
    // Today is 2026-02-09 (Mon). Fri Feb 6 was NOT completed. Thu Feb 5 was.
    // Missed: Fri Feb 6 = 1 weekday missed
    const completed = new Set(['2026-02-05', '2026-02-04']);
    const result = computeMissedDays(weekdays, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(1);
    expect(result.previous_streak).toBe(2);
    expect(result.absence_unit).toBe('days');
  });

  it('handles custom frequency (Mon/Wed/Fri)', () => {
    // Today is 2026-02-09 (Mon). Walking back:
    // Feb 8 (Sun) - not tracked
    // Feb 7 (Sat) - not tracked
    // Feb 6 (Fri) - tracked, not completed → missed = 1
    // Feb 5 (Thu) - not tracked
    // Feb 4 (Wed) - tracked, completed → previous_streak = 1
    // Feb 3 (Tue) - not tracked
    // Feb 2 (Mon) - tracked, completed → previous_streak = 2
    const completed = new Set(['2026-02-04', '2026-02-02']);
    const result = computeMissedDays(custom, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(1);
    expect(result.previous_streak).toBe(2);
    expect(result.absence_unit).toBe('days');
  });

  it('returns 0 missed for brand new habit (created today)', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-09');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('returns 1 missed day for habit created yesterday with no logs', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-08');

    expect(result.missed_scheduled_periods).toBe(1);
    expect(result.previous_streak).toBe(0);
  });

  it('handles 7+ missed days (hiatus)', () => {
    // Daily habit, last completed Jan 30. Today is Feb 9.
    // Walking back from Feb 8: Feb 8,7,6,5,4,3,2,1, Jan 31 = 9 missed days
    // Then Jan 30 completed → previous_streak starts. Jan 30, 29 = 2
    const completed = new Set(['2026-01-30', '2026-01-29']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(9);
    expect(result.previous_streak).toBe(2);
  });

  it('does not count today as missed', () => {
    // Daily habit with no completion for today — should not count today
    const completed = new Set(['2026-02-08']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(0);
  });

  it('stops at habit creation date', () => {
    // Habit created Feb 7, today is Feb 9, no logs at all
    // Only Feb 7 and Feb 8 are missable (2 days)
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-07');

    expect(result.missed_scheduled_periods).toBe(2);
    expect(result.previous_streak).toBe(0);
  });

  it('handles created_at with timestamp format', () => {
    // created_at comes as ISO timestamp, function should extract date part
    const completed = new Set(['2026-02-08']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-02-07T14:30:00Z');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(1);
  });

  // --- Weekly frequency: week-based absence tracking ---
  // weekStartDay=0 (Sunday). Today 2026-02-09 is Monday.
  // Current week: Sun Feb 8 – Sat Feb 14 (in progress, skipped)
  // Previous week: Sun Feb 1 – Sat Feb 7
  // Week before: Sun Jan 25 – Sat Jan 31

  it('handles weekly frequency with week-based tracking', () => {
    const weekly: HabitFrequency = { type: 'weekly' };
    // Today is 2026-02-09 (Mon). Current week (Feb 8+) is in progress → skip.
    // Previous week (Feb 1-7): completed Feb 2 → target 1 met → 0 missed weeks.
    const completed = new Set(['2026-02-02']);
    const result = computeMissedDays(weekly, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('weeks');
  });

  it('counts missed weeks for weekly frequency', () => {
    const weekly: HabitFrequency = { type: 'weekly' };
    // Today is 2026-02-09 (Mon). Current week (Feb 8+) in progress.
    // Previous week (Feb 1-7): 0 completions → missed.
    // Week before (Jan 25-31): 0 completions → missed.
    // Jan 18-24: completed Jan 20 → met → previous_streak = 1.
    const completed = new Set(['2026-01-20']);
    const result = computeMissedDays(weekly, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(2);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('weeks');
  });

  // --- times_per_week frequency: week-based absence tracking ---

  it('returns 0 missed for times_per_week habit with current week in progress and prior week met', () => {
    const timesPerWeek: HabitFrequency = { type: 'times_per_week', count: 3 };
    // Today is Mon Feb 9. Current week (Feb 8+) in progress.
    // Previous week (Feb 1-7): completed Feb 3, 4, 5 = 3 completions = target met.
    const completed = new Set(['2026-02-03', '2026-02-04', '2026-02-05']);
    const result = computeMissedDays(timesPerWeek, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('weeks');
  });

  it('returns 1 missed week for times_per_week habit when last week fell short', () => {
    const timesPerWeek: HabitFrequency = { type: 'times_per_week', count: 3 };
    // Today is Mon Feb 9. Current week (Feb 8+) in progress.
    // Previous week (Feb 1-7): completed Feb 3 only = 1 < 3 = missed.
    // Week before (Jan 25-31): completed Jan 27, 28, 29 = 3 = met.
    const completed = new Set(['2026-02-03', '2026-01-27', '2026-01-28', '2026-01-29']);
    const result = computeMissedDays(timesPerWeek, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(1);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('weeks');
  });

  it('returns multiple missed weeks for times_per_week habit', () => {
    const timesPerWeek: HabitFrequency = { type: 'times_per_week', count: 2 };
    // Today is Mon Feb 9. Current week (Feb 8+) in progress.
    // Previous week (Feb 1-7): 0 completions → missed.
    // Week before (Jan 25-31): completed Jan 26 only = 1 < 2 → missed.
    // Jan 18-24: completed Jan 19, 20 = 2 = met → previous_streak = 1.
    const completed = new Set(['2026-01-26', '2026-01-19', '2026-01-20']);
    const result = computeMissedDays(timesPerWeek, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_periods).toBe(2);
    expect(result.previous_streak).toBe(1);
    expect(result.absence_unit).toBe('weeks');
  });

  it('returns days unit for daily habits', () => {
    const completed = new Set(['2026-02-08']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.absence_unit).toBe('days');
  });

  it('returns 0 for invalid createdAtStr', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', 'not-a-date');
    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('returns 0 for empty createdAtStr', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '');
    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('caps backward walk at dataStartStr boundary', () => {
    // Daily habit created Jan 1, but dataStartStr is Feb 5.
    // Today Feb 9, no completions at all.
    // Without dataStartStr: would count back to Jan 1 (39 missed).
    // With dataStartStr Feb 5: only Feb 5,6,7,8 = 4 missed.
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-01-01', '2026-02-05');

    expect(result.missed_scheduled_periods).toBe(4);
    expect(result.previous_streak).toBe(0);
  });

  it('stops weekly walk at habit creation date', () => {
    const weekly: HabitFrequency = { type: 'weekly' };
    // Habit created Feb 5 (Wed), today Feb 9 (Mon).
    // Current week (Feb 8+) in progress.
    // Previous week (Feb 1-7): habit was created mid-week on Feb 5.
    //   Week start (Feb 1) is before creation date (Feb 5), so this week is skipped.
    const result = computeMissedDays(weekly, new Set(), '2026-02-09', '2026-02-05');

    expect(result.missed_scheduled_periods).toBe(0);
    expect(result.absence_unit).toBe('weeks');
  });
});
