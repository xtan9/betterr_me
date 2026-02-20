import { describe, it, expect } from 'vitest';
import { getWeekStart, getWeekKey } from '@/lib/habits/week-utils';

describe('getWeekStart', () => {
  it('returns Sunday for a mid-week date (weekStartDay=0)', () => {
    // Wed Feb 4 2026 → Sun Feb 1 2026
    const result = getWeekStart(new Date(2026, 1, 4), 0);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(1);
    expect(result.getDay()).toBe(0); // Sunday
  });

  it('returns Monday for a mid-week date (weekStartDay=1)', () => {
    // Wed Feb 4 2026 → Mon Feb 2 2026
    const result = getWeekStart(new Date(2026, 1, 4), 1);
    expect(result.getDate()).toBe(2);
    expect(result.getDay()).toBe(1); // Monday
  });

  it('returns the same date when date is the week start day', () => {
    // Sun Feb 1 2026, weekStartDay=0
    const result = getWeekStart(new Date(2026, 1, 1), 0);
    expect(result.getDate()).toBe(1);
  });

  it('handles Saturday as week start (weekStartDay=6)', () => {
    // Wed Feb 4 2026 → Sat Jan 31 2026
    const result = getWeekStart(new Date(2026, 1, 4), 6);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(31);
    expect(result.getDay()).toBe(6); // Saturday
  });

  it('zeroes out hours/minutes/seconds', () => {
    const result = getWeekStart(new Date(2026, 1, 4, 15, 30, 45), 0);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe('getWeekKey', () => {
  it('returns YYYY-MM-DD string of week start', () => {
    // Wed Feb 4 2026, weekStartDay=0 → "2026-02-01"
    const result = getWeekKey(new Date(2026, 1, 4), 0);
    expect(result).toBe('2026-02-01');
  });

  it('pads single-digit months and days', () => {
    // Tue Jan 6 2026, weekStartDay=0 → Sun Jan 4 → "2026-01-04"
    const result = getWeekKey(new Date(2026, 0, 6), 0);
    expect(result).toBe('2026-01-04');
  });
});
