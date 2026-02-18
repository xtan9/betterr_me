import { describe, it, expect } from 'vitest';
import {
  getOccurrencesInRange,
  getNextOccurrence,
  describeRecurrence,
} from '@/lib/recurring-tasks/recurrence';
import type { RecurrenceRule } from '@/lib/db/types';

describe('getOccurrencesInRange', () => {
  describe('daily recurrence', () => {
    it('should return every day for interval=1', () => {
      const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
      const result = getOccurrencesInRange(rule, '2026-01-01', '2026-01-01', '2026-01-05');
      expect(result).toEqual([
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
      ]);
    });

    it('should return every other day for interval=2', () => {
      const rule: RecurrenceRule = { frequency: 'daily', interval: 2 };
      const result = getOccurrencesInRange(rule, '2026-01-01', '2026-01-01', '2026-01-07');
      expect(result).toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']);
    });

    it('should skip dates before range start', () => {
      const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
      const result = getOccurrencesInRange(rule, '2026-01-01', '2026-01-03', '2026-01-05');
      expect(result).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
    });

    it('should handle month boundary', () => {
      const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
      const result = getOccurrencesInRange(rule, '2026-01-30', '2026-01-30', '2026-02-02');
      expect(result).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    });

    it('should return empty for range before start date', () => {
      const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
      const result = getOccurrencesInRange(rule, '2026-02-01', '2026-01-01', '2026-01-31');
      expect(result).toEqual([]);
    });
  });

  describe('weekly recurrence', () => {
    it('should return weekly on specified days', () => {
      // Every Monday and Wednesday (1, 3)
      const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, days_of_week: [1, 3] };
      const result = getOccurrencesInRange(rule, '2026-02-02', '2026-02-02', '2026-02-15');
      // Feb 2 = Mon, Feb 4 = Wed, Feb 9 = Mon, Feb 11 = Wed
      expect(result).toEqual(['2026-02-02', '2026-02-04', '2026-02-09', '2026-02-11']);
    });

    it('should handle biweekly (interval=2)', () => {
      const rule: RecurrenceRule = { frequency: 'weekly', interval: 2, days_of_week: [1] };
      // Start Mon Feb 2, next occurrence should be Mon Feb 16 (2 weeks later)
      const result = getOccurrencesInRange(rule, '2026-02-02', '2026-02-02', '2026-03-02');
      expect(result).toContain('2026-02-02');
      expect(result).toContain('2026-02-16');
      expect(result).not.toContain('2026-02-09');
    });

    it('should handle weekdays (Mon-Fri)', () => {
      const rule: RecurrenceRule = {
        frequency: 'weekly', interval: 1,
        days_of_week: [1, 2, 3, 4, 5],
      };
      const result = getOccurrencesInRange(rule, '2026-02-02', '2026-02-02', '2026-02-08');
      // Feb 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat, 8=Sun
      expect(result).toEqual(['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06']);
    });
  });

  describe('monthly recurrence', () => {
    it('should return monthly by date', () => {
      const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, day_of_month: 15 };
      const result = getOccurrencesInRange(rule, '2026-01-15', '2026-01-15', '2026-04-15');
      expect(result).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
    });

    it('should clamp to last day for months with fewer days (day 31)', () => {
      const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, day_of_month: 31 };
      const result = getOccurrencesInRange(rule, '2026-01-31', '2026-01-31', '2026-04-30');
      expect(result).toContain('2026-01-31');
      expect(result).toContain('2026-02-28'); // Feb has 28 days in 2026
      expect(result).toContain('2026-03-31');
      expect(result).toContain('2026-04-30');
    });

    it('should handle leap year Feb 29', () => {
      const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, day_of_month: 29 };
      // 2028 is a leap year
      const result = getOccurrencesInRange(rule, '2028-01-29', '2028-01-29', '2028-03-29');
      expect(result).toContain('2028-01-29');
      expect(result).toContain('2028-02-29'); // Leap year
      expect(result).toContain('2028-03-29');
    });

    it('should return monthly by weekday position (first Monday)', () => {
      const rule: RecurrenceRule = {
        frequency: 'monthly', interval: 1,
        week_position: 'first', day_of_week_monthly: 1,
      };
      const result = getOccurrencesInRange(rule, '2026-01-05', '2026-01-05', '2026-03-31');
      // First Monday: Jan 5, Feb 2, Mar 2
      expect(result).toEqual(['2026-01-05', '2026-02-02', '2026-03-02']);
    });

    it('should handle last Friday of month', () => {
      const rule: RecurrenceRule = {
        frequency: 'monthly', interval: 1,
        week_position: 'last', day_of_week_monthly: 5,
      };
      const result = getOccurrencesInRange(rule, '2026-01-30', '2026-01-30', '2026-03-31');
      // Last Friday: Jan 30, Feb 27, Mar 27
      expect(result).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
    });

    it('should handle interval > 1 (every 3 months)', () => {
      const rule: RecurrenceRule = { frequency: 'monthly', interval: 3, day_of_month: 1 };
      const result = getOccurrencesInRange(rule, '2026-01-01', '2026-01-01', '2026-12-31');
      expect(result).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
    });
  });

  describe('yearly recurrence', () => {
    it('should return yearly on same date', () => {
      const rule: RecurrenceRule = {
        frequency: 'yearly', interval: 1,
        month_of_year: 3, day_of_month: 15,
      };
      const result = getOccurrencesInRange(rule, '2024-03-15', '2024-03-15', '2027-03-15');
      expect(result).toEqual(['2024-03-15', '2025-03-15', '2026-03-15', '2027-03-15']);
    });

    it('should handle every 2 years', () => {
      const rule: RecurrenceRule = {
        frequency: 'yearly', interval: 2,
        month_of_year: 6, day_of_month: 1,
      };
      const result = getOccurrencesInRange(rule, '2024-06-01', '2024-06-01', '2030-12-31');
      expect(result).toEqual(['2024-06-01', '2026-06-01', '2028-06-01', '2030-06-01']);
    });
  });
});

describe('getNextOccurrence', () => {
  it('should find the next daily occurrence', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
    expect(getNextOccurrence(rule, '2026-01-01', '2026-01-05')).toBe('2026-01-06');
  });

  it('should find the next weekly occurrence', () => {
    const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, days_of_week: [1] };
    // After Wed Feb 4, next Monday is Feb 9
    expect(getNextOccurrence(rule, '2026-02-02', '2026-02-04')).toBe('2026-02-09');
  });

  it('should find the next monthly occurrence', () => {
    const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, day_of_month: 15 };
    expect(getNextOccurrence(rule, '2026-01-15', '2026-01-16')).toBe('2026-02-15');
  });
});

describe('describeRecurrence', () => {
  it('should describe daily', () => {
    expect(describeRecurrence({ frequency: 'daily', interval: 1 }))
      .toBe('Every day');
  });

  it('should describe every N days', () => {
    expect(describeRecurrence({ frequency: 'daily', interval: 3 }))
      .toBe('Every 3 days');
  });

  it('should describe weekly with days', () => {
    expect(describeRecurrence({ frequency: 'weekly', interval: 1, days_of_week: [1, 3, 5] }))
      .toBe('Every week on Mon, Wed, Fri');
  });

  it('should describe biweekly', () => {
    expect(describeRecurrence({ frequency: 'weekly', interval: 2, days_of_week: [1] }))
      .toBe('Every 2 weeks on Mon');
  });

  it('should describe monthly by date', () => {
    expect(describeRecurrence({ frequency: 'monthly', interval: 1, day_of_month: 15 }))
      .toBe('Every month on the 15th');
  });

  it('should describe monthly by weekday', () => {
    expect(describeRecurrence({
      frequency: 'monthly', interval: 1,
      week_position: 'first', day_of_week_monthly: 1,
    })).toBe('Every month on the first Mon');
  });

  it('should describe yearly', () => {
    expect(describeRecurrence({
      frequency: 'yearly', interval: 1,
      month_of_year: 12, day_of_month: 25,
    })).toBe('Every year on December 25');
  });
});
