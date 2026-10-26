import { describe, expect, it } from 'vitest';
import { formatWorkoutDay, knownWorkoutDuration } from '@/lib/fitness/history-presentation';

describe('recorded workout day and duration presentation', () => {
  it('keeps leap days and DST dates civil in every viewer timezone', () => {
    for (const timeZone of ['Pacific/Honolulu', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      expect(formatWorkoutDay({ workoutDay: '2024-02-29', started_at: null }, 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })).toBe('02/29/2024');
      expect(formatWorkoutDay({ workoutDay: '2024-11-03', started_at: '2024-11-04T01:00:00Z' }, 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })).toBe('11/03/2024');
    }
  });
  it('does not turn ordering metadata or invalid/unknown facts into recorded day or duration', () => {
    expect(formatWorkoutDay({ workoutDay: null, started_at: '2026-10-26T00:00:00Z' })).toBeNull();
    expect(formatWorkoutDay({ workoutDay: '2024-02-30', started_at: null })).toBeNull();
    expect(formatWorkoutDay({ started_at: null })).toBeNull();
    expect(formatWorkoutDay({ started_at: '2026-10-26T00:00:00Z' }, 'en-US', { timeZone: 'UTC' })).toBe('10/26/2026');
    expect(knownWorkoutDuration(0)).toBe(true);
    expect(knownWorkoutDuration(90)).toBe(true);
    for (const value of [null, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(knownWorkoutDuration(value)).toBe(false);
  });
});
