import { describe, it, expect } from 'vitest';
import {
  formatFrequency,
  getFrequencyTranslation,
  shouldTrackOnDate,
} from '@/lib/habits/format';

describe('formatFrequency', () => {
  it('formats daily', () => {
    expect(formatFrequency({ type: 'daily' })).toBe('Every day');
  });

  it('formats weekdays', () => {
    expect(formatFrequency({ type: 'weekdays' })).toBe('Mon – Fri');
  });

  it('formats weekly', () => {
    expect(formatFrequency({ type: 'weekly' })).toBe('Once a week');
  });

  it('formats times_per_week with count 2', () => {
    expect(formatFrequency({ type: 'times_per_week', count: 2 })).toBe('2x/week');
  });

  it('formats times_per_week with count 3', () => {
    expect(formatFrequency({ type: 'times_per_week', count: 3 })).toBe('3x/week');
  });

  it('formats custom days in order', () => {
    expect(formatFrequency({ type: 'custom', days: [5, 1, 3] })).toBe('Mon, Wed, Fri');
  });

  it('formats single custom day', () => {
    expect(formatFrequency({ type: 'custom', days: [0] })).toBe('Sun');
  });

  it('formats all days', () => {
    expect(formatFrequency({ type: 'custom', days: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      'Sun, Mon, Tue, Wed, Thu, Fri, Sat'
    );
  });
});

describe('getFrequencyTranslation', () => {
  it('returns frequency.daily for daily', () => {
    expect(getFrequencyTranslation({ type: 'daily' })).toEqual({ key: 'frequency.daily' });
  });

  it('returns frequency.weekdays for weekdays', () => {
    expect(getFrequencyTranslation({ type: 'weekdays' })).toEqual({ key: 'frequency.weekdays' });
  });

  it('returns frequency.weekly for weekly', () => {
    expect(getFrequencyTranslation({ type: 'weekly' })).toEqual({ key: 'frequency.weekly' });
  });

  it('returns frequency.timesPerWeek with count for times_per_week (count=2)', () => {
    expect(getFrequencyTranslation({ type: 'times_per_week', count: 2 })).toEqual({
      key: 'frequency.timesPerWeek',
      params: { count: 2 },
    });
  });

  it('returns frequency.timesPerWeek with count for times_per_week (count=3)', () => {
    expect(getFrequencyTranslation({ type: 'times_per_week', count: 3 })).toEqual({
      key: 'frequency.timesPerWeek',
      params: { count: 3 },
    });
  });

  it('returns frequency.custom with sorted day keys for custom', () => {
    expect(getFrequencyTranslation({ type: 'custom', days: [5, 1, 3] })).toEqual({
      key: 'frequency.custom',
      params: { days: 'mon, wed, fri' },
    });
  });

  it('returns frequency.custom with single day key', () => {
    expect(getFrequencyTranslation({ type: 'custom', days: [0] })).toEqual({
      key: 'frequency.custom',
      params: { days: 'sun' },
    });
  });

  it('returns frequency.custom with all 7 day keys sorted', () => {
    expect(getFrequencyTranslation({ type: 'custom', days: [6, 5, 4, 3, 2, 1, 0] })).toEqual({
      key: 'frequency.custom',
      params: { days: 'sun, mon, tue, wed, thu, fri, sat' },
    });
  });

  it('returns frequency.custom with empty days (no days)', () => {
    expect(getFrequencyTranslation({ type: 'custom', days: [] })).toEqual({
      key: 'frequency.custom',
      params: { days: '' },
    });
  });
});

describe('shouldTrackOnDate', () => {
  // 2026-02-02 = Monday, 2026-02-07 = Saturday, 2026-02-08 = Sunday
  // Use local date constructors (not ISO strings) to avoid UTC timezone shifts
  const monday = new Date(2026, 1, 2);
  const tuesday = new Date(2026, 1, 3);
  const wednesday = new Date(2026, 1, 4);
  const saturday = new Date(2026, 1, 7);
  const sunday = new Date(2026, 1, 8);

  it('daily tracks every day', () => {
    expect(shouldTrackOnDate({ type: 'daily' }, monday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'daily' }, saturday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'daily' }, sunday)).toBe(true);
  });

  it('weekdays tracks Mon-Fri', () => {
    expect(shouldTrackOnDate({ type: 'weekdays' }, monday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'weekdays' }, wednesday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'weekdays' }, saturday)).toBe(false);
    expect(shouldTrackOnDate({ type: 'weekdays' }, sunday)).toBe(false);
  });

  it('weekly tracks every day (any day that week counts)', () => {
    expect(shouldTrackOnDate({ type: 'weekly' }, monday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'weekly' }, tuesday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'weekly' }, sunday)).toBe(true);
  });

  it('times_per_week tracks every day (count enforced elsewhere)', () => {
    expect(shouldTrackOnDate({ type: 'times_per_week', count: 2 }, monday)).toBe(true);
    expect(shouldTrackOnDate({ type: 'times_per_week', count: 3 }, sunday)).toBe(true);
  });

  it('custom tracks only specified days', () => {
    const freq = { type: 'custom' as const, days: [1, 3] }; // Mon, Wed
    expect(shouldTrackOnDate(freq, monday)).toBe(true);    // Monday = 1
    expect(shouldTrackOnDate(freq, tuesday)).toBe(false);   // Tuesday = 2
    expect(shouldTrackOnDate(freq, wednesday)).toBe(true);  // Wednesday = 3
    expect(shouldTrackOnDate(freq, saturday)).toBe(false);  // Saturday = 6
  });

  it('custom with empty days matches nothing', () => {
    const freq = { type: 'custom' as const, days: [] as number[] };
    expect(shouldTrackOnDate(freq, monday)).toBe(false);
  });
});
