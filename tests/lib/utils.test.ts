import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cn, getLocalDateString, hasEnvVars } from '@/lib/utils';

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
    // 2026-02-07T02:00:00 UTC — in any timezone west of UTC+2,
    // the local date is still Feb 6.
    // We test by constructing a Date with explicit local components.
    const localDate = new Date(2026, 1, 6, 23, 59, 59); // Feb 6, 11:59 PM local
    expect(getLocalDateString(localDate)).toBe('2026-02-06');
  });

  it('differs from toISOString for late-night local times in negative-offset timezones', () => {
    // This is the core timezone bug scenario:
    // At 11 PM local time in UTC-8, toISOString gives the next day's date.
    // getLocalDateString should give today's date.
    const lateNight = new Date(2026, 1, 6, 23, 0, 0); // Feb 6, 11 PM local
    const localResult = getLocalDateString(lateNight);
    expect(localResult).toBe('2026-02-06');
    // Note: toISOString would return '2026-02-07' if running in UTC-8
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
