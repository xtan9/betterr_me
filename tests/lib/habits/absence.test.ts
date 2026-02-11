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

    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(1);
  });

  it('counts consecutive missed days (daily)', () => {
    // Today is 2026-02-09 (Mon). Last completed was 2026-02-05 (Thu).
    // Missed: Feb 6 (Fri), 7 (Sat), 8 (Sun) = 3 days
    const completed = new Set(['2026-02-05', '2026-02-04', '2026-02-03']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(3);
    expect(result.previous_streak).toBe(3);
  });

  it('skips non-scheduled days for weekdays frequency', () => {
    // Today is 2026-02-09 (Mon). Yesterday was Sun (not tracked).
    // Sat is not tracked. Last weekday was Fri Feb 6.
    // If Fri was completed, missed = 0
    const completed = new Set(['2026-02-06']); // Friday
    const result = computeMissedDays(weekdays, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(1);
  });

  it('counts missed weekdays correctly', () => {
    // Today is 2026-02-09 (Mon). Fri Feb 6 was NOT completed. Thu Feb 5 was.
    // Missed: Fri Feb 6 = 1 weekday missed
    const completed = new Set(['2026-02-05', '2026-02-04']);
    const result = computeMissedDays(weekdays, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(1);
    expect(result.previous_streak).toBe(2);
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

    expect(result.missed_scheduled_days).toBe(1);
    expect(result.previous_streak).toBe(2);
  });

  it('returns 0 missed for brand new habit (created today)', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-09');

    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('returns 1 missed day for habit created yesterday with no logs', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-08');

    expect(result.missed_scheduled_days).toBe(1);
    expect(result.previous_streak).toBe(0);
  });

  it('handles 7+ missed days (hiatus)', () => {
    // Daily habit, last completed Jan 30. Today is Feb 9.
    // Walking back from Feb 8: Feb 8,7,6,5,4,3,2,1, Jan 31 = 9 missed days
    // Then Jan 30 completed → previous_streak starts. Jan 30, 29 = 2
    const completed = new Set(['2026-01-30', '2026-01-29']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(9);
    expect(result.previous_streak).toBe(2);
  });

  it('does not count today as missed', () => {
    // Daily habit with no completion for today — should not count today
    const completed = new Set(['2026-02-08']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(0);
  });

  it('stops at habit creation date', () => {
    // Habit created Feb 7, today is Feb 9, no logs at all
    // Only Feb 7 and Feb 8 are missable (2 days)
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-02-07');

    expect(result.missed_scheduled_days).toBe(2);
    expect(result.previous_streak).toBe(0);
  });

  it('handles created_at with timestamp format', () => {
    // created_at comes as ISO timestamp, function should extract date part
    const completed = new Set(['2026-02-08']);
    const result = computeMissedDays(daily, completed, '2026-02-09', '2026-02-07T14:30:00Z');

    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(1);
  });

  it('handles weekly frequency (Monday only)', () => {
    const weekly: HabitFrequency = { type: 'weekly' };
    // Today is 2026-02-09 (Mon). Yesterday is Sun (not tracked).
    // Last Mon was Feb 2 — walk back from Feb 8...
    // Feb 8 (Sun) - not tracked
    // Feb 7 (Sat) - not tracked
    // ...
    // Feb 2 (Mon) - tracked, completed → missed = 0, previous_streak = 1
    const completed = new Set(['2026-02-02']);
    const result = computeMissedDays(weekly, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(1);
  });

  it('counts missed weeks for weekly frequency', () => {
    const weekly: HabitFrequency = { type: 'weekly' };
    // Today is 2026-02-09 (Mon). Last Mon Feb 2 NOT completed.
    // Mon Jan 26 was completed.
    // Missed: Feb 2 = 1 missed scheduled day
    const completed = new Set(['2026-01-26', '2026-01-19']);
    const result = computeMissedDays(weekly, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(1);
    expect(result.previous_streak).toBe(2);
  });

  it('treats every day as scheduled for times_per_week frequency', () => {
    const timesPerWeek: HabitFrequency = { type: 'times_per_week', count: 3 };
    // Today is Mon Feb 9. Completed Thu Feb 5 and Wed Feb 4.
    // shouldTrackOnDate returns true every day, so:
    // Feb 8 (Sun) - not completed → missed
    // Feb 7 (Sat) - not completed → missed
    // Feb 6 (Fri) - not completed → missed
    // Feb 5 (Thu) - completed → previous_streak starts
    // Feb 4 (Wed) - completed → previous_streak continues
    const completed = new Set(['2026-02-05', '2026-02-04']);
    const result = computeMissedDays(timesPerWeek, completed, '2026-02-09', '2026-01-01');

    expect(result.missed_scheduled_days).toBe(3);
    expect(result.previous_streak).toBe(2);
  });

  it('returns 0 for invalid createdAtStr', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', 'not-a-date');
    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('returns 0 for empty createdAtStr', () => {
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '');
    expect(result.missed_scheduled_days).toBe(0);
    expect(result.previous_streak).toBe(0);
  });

  it('caps backward walk at dataStartStr boundary', () => {
    // Daily habit created Jan 1, but dataStartStr is Feb 5.
    // Today Feb 9, no completions at all.
    // Without dataStartStr: would count back to Jan 1 (39 missed).
    // With dataStartStr Feb 5: only Feb 5,6,7,8 = 4 missed.
    const result = computeMissedDays(daily, new Set(), '2026-02-09', '2026-01-01', '2026-02-05');

    expect(result.missed_scheduled_days).toBe(4);
    expect(result.previous_streak).toBe(0);
  });
});
