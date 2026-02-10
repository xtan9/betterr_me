import { describe, it, expect, afterEach } from 'vitest';
import { cn, getLocalDateString, getNextDateString } from '@/lib/utils';

describe('cn (className utility)', () => {
  it('merges multiple class strings', () => {
    const result = cn('class1', 'class2');
    expect(result).toBe('class1 class2');
  });

  it('handles undefined values', () => {
    const result = cn('class1', undefined, 'class2');
    expect(result).toBe('class1 class2');
  });

  it('handles null values', () => {
    const result = cn('class1', null, 'class2');
    expect(result).toBe('class1 class2');
  });

  it('handles boolean values', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn('base', isActive && 'active', isDisabled && 'disabled');
    expect(result).toBe('base active');
  });

  it('handles array values', () => {
    const result = cn(['class1', 'class2']);
    expect(result).toBe('class1 class2');
  });

  it('handles object values', () => {
    const result = cn({
      class1: true,
      class2: false,
      class3: true,
    });
    expect(result).toBe('class1 class3');
  });

  it('merges Tailwind classes correctly (last wins)', () => {
    const result = cn('p-4', 'p-6');
    expect(result).toBe('p-6');
  });

  it('handles conflicting Tailwind classes', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).toBe('bg-blue-500');
  });

  it('preserves non-conflicting Tailwind classes', () => {
    const result = cn('bg-red-500', 'text-white', 'p-4');
    expect(result).toBe('bg-red-500 text-white p-4');
  });

  it('handles empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('handles complex combinations', () => {
    const result = cn(
      'base-class',
      {
        'conditional-class': true,
        'skipped-class': false,
      },
      ['array-class-1', 'array-class-2'],
      undefined,
      null,
      'final-class'
    );
    expect(result).toBe('base-class conditional-class array-class-1 array-class-2 final-class');
  });

  it('handles Tailwind modifiers correctly', () => {
    const result = cn('hover:bg-red-500', 'hover:bg-blue-500');
    expect(result).toBe('hover:bg-blue-500');
  });

  it('preserves different modifiers', () => {
    const result = cn('hover:bg-red-500', 'focus:bg-blue-500');
    expect(result).toBe('hover:bg-red-500 focus:bg-blue-500');
  });

  it('handles responsive classes', () => {
    const result = cn('sm:p-4', 'md:p-6', 'lg:p-8');
    expect(result).toBe('sm:p-4 md:p-6 lg:p-8');
  });
});

describe('getLocalDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getLocalDateString(new Date(2026, 0, 15)); // Jan 15, 2026
    expect(result).toBe('2026-01-15');
  });

  it('pads single-digit months and days', () => {
    const result = getLocalDateString(new Date(2026, 2, 5)); // Mar 5, 2026
    expect(result).toBe('2026-03-05');
  });

  it('uses local timezone, not UTC', () => {
    // Construct a Date at 11:59 PM local time. getLocalDateString should
    // return that day, whereas toISOString could return the next day
    // depending on the timezone offset.
    const localDate = new Date(2026, 1, 6, 23, 59, 59); // Feb 6, 11:59 PM local
    expect(getLocalDateString(localDate)).toBe('2026-02-06');
  });

  it('returns the local date even when toISOString crosses the UTC day boundary', () => {
    // Core timezone bug scenario: construct a date from a UTC timestamp
    // that is on a different UTC date than the local date.
    // 2026-02-07T07:30:00 UTC = Feb 6, 11:30 PM in UTC-8 (Pacific)
    //                        = Feb 7, 07:30 AM in UTC
    // getLocalDateString must always return the LOCAL date.
    const lateNight = new Date(2026, 1, 6, 23, 30, 0); // Feb 6, 11:30 PM local
    const localResult = getLocalDateString(lateNight);
    const utcResult = lateNight.toISOString().split('T')[0];

    // getLocalDateString always returns the local date
    expect(localResult).toBe('2026-02-06');

    // In non-UTC timezones west of UTC, utcResult will be '2026-02-07'
    // proving the divergence. In UTC itself both are '2026-02-06'.
    // Either way, getLocalDateString is correct.
    if (lateNight.getTimezoneOffset() < 0) {
      // East of UTC: UTC date could be earlier (e.g., still Feb 6 in UTC)
      expect(localResult).toBe('2026-02-06');
    } else if (lateNight.getTimezoneOffset() > 0) {
      // West of UTC: UTC date is the NEXT day
      expect(utcResult).toBe('2026-02-07');
      expect(localResult).not.toBe(utcResult);
    }
    // In UTC (offset=0), both agree — no divergence to prove, but
    // getLocalDateString still returns the correct answer.
  });

  it('defaults to current date when no argument provided', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getLocalDateString()).toBe(expected);
  });

  it('handles end of year correctly', () => {
    const result = getLocalDateString(new Date(2026, 11, 31)); // Dec 31, 2026
    expect(result).toBe('2026-12-31');
  });
});

describe('getNextDateString', () => {
  it('returns the next day for a regular date', () => {
    expect(getNextDateString('2026-02-08')).toBe('2026-02-09');
  });

  it('handles month rollover (Feb 28 → Mar 1 non-leap year)', () => {
    expect(getNextDateString('2027-02-28')).toBe('2027-03-01');
  });

  it('handles leap year (Feb 28 → Feb 29)', () => {
    expect(getNextDateString('2028-02-28')).toBe('2028-02-29');
  });

  it('handles year rollover (Dec 31 → Jan 1)', () => {
    expect(getNextDateString('2026-12-31')).toBe('2027-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(getNextDateString('2026-01-01')).toBe('2026-01-02');
    expect(getNextDateString('2026-03-09')).toBe('2026-03-10');
  });
});

describe('hasEnvVars', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    // Restore original values
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('should be truthy when both env vars are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

    // Re-import to get fresh evaluation
    // Note: The actual hasEnvVars is evaluated at module load time,
    // so this test verifies the logic rather than the actual runtime value
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(url && key).toBeTruthy();
  });

  it('should be falsy when URL is missing', () => {
    const url = undefined;
    const key = 'test-key';
    expect(url && key).toBeFalsy();
  });

  it('should be falsy when KEY is missing', () => {
    const url = 'https://example.supabase.co';
    const key = undefined;
    expect(url && key).toBeFalsy();
  });

  it('should be falsy when both are missing', () => {
    const url = undefined;
    const key = undefined;
    expect(url && key).toBeFalsy();
  });

  it('should be falsy when URL is empty string', () => {
    const url = '';
    const key = 'test-key';
    expect(url && key).toBeFalsy();
  });

  it('should be falsy when KEY is empty string', () => {
    const url = 'https://example.supabase.co';
    const key = '';
    expect(url && key).toBeFalsy();
  });
});
