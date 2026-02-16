import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HabitFrequency, HabitLog } from '@/lib/db/types';
import { buildHeatmapData } from '@/lib/habits/heatmap';

describe('buildHeatmapData', () => {
  beforeEach(() => {
    // Fix "today" to Wednesday, 2026-02-04 for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 4)); // Feb 4, 2026 (Wed)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dailyFrequency: HabitFrequency = { type: 'daily' };

  const makeLog = (date: string, completed: boolean): HabitLog => ({
    id: `log-${date}`,
    habit_id: 'habit-1',
    user_id: 'user-1',
    logged_date: date,
    completed,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  });

  it('returns 30 cells by default', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    expect(cells).toHaveLength(30);
  });

  it('returns cells in chronological order (oldest first)', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    expect(cells[0].date).toBe('2026-01-06'); // 29 days ago
    expect(cells[29].date).toBe('2026-02-04'); // today
  });

  it('marks today cell with isToday=true', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    const todayCell = cells.find(c => c.date === '2026-02-04');
    expect(todayCell?.isToday).toBe(true);

    const yesterdayCell = cells.find(c => c.date === '2026-02-03');
    expect(yesterdayCell?.isToday).toBe(false);
  });

  it('marks completed logs as "completed"', () => {
    const logs = [makeLog('2026-02-03', true)];
    const cells = buildHeatmapData(logs, dailyFrequency);
    const cell = cells.find(c => c.date === '2026-02-03');
    expect(cell?.status).toBe('completed');
  });

  it('marks missed scheduled days as "missed"', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    // Yesterday with no log should be missed for daily frequency
    const cell = cells.find(c => c.date === '2026-02-03');
    expect(cell?.status).toBe('missed');
  });

  it('marks non-scheduled days as "not_scheduled" for weekdays frequency', () => {
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    const cells = buildHeatmapData([], weekdaysFrequency);
    // 2026-02-01 is a Sunday → not scheduled for weekdays
    const sundayCell = cells.find(c => c.date === '2026-02-01');
    expect(sundayCell?.status).toBe('not_scheduled');
  });

  it('marks non-scheduled days as "not_scheduled" for custom frequency', () => {
    const customFrequency: HabitFrequency = { type: 'custom', days: [1, 3, 5] }; // Mon, Wed, Fri
    const cells = buildHeatmapData([], customFrequency);
    // 2026-02-03 is a Tuesday → not scheduled
    const tuesdayCell = cells.find(c => c.date === '2026-02-03');
    expect(tuesdayCell?.status).toBe('not_scheduled');
  });

  it('marks today as editable', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    const todayCell = cells.find(c => c.date === '2026-02-04');
    expect(todayCell?.isEditable).toBe(true);
  });

  it('marks days within last 7 days as editable', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    // Jan 29 is 6 days ago → editable
    const cell6DaysAgo = cells.find(c => c.date === '2026-01-29');
    expect(cell6DaysAgo?.isEditable).toBe(true);
  });

  it('marks days older than 7 days as not editable', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    // Jan 27 is 8 days ago → not editable
    const cell8DaysAgo = cells.find(c => c.date === '2026-01-27');
    expect(cell8DaysAgo?.isEditable).toBe(false);
  });

  it('correctly handles a log with completed=false as missed', () => {
    const logs = [makeLog('2026-02-02', false)];
    const cells = buildHeatmapData(logs, dailyFrequency);
    const cell = cells.find(c => c.date === '2026-02-02');
    expect(cell?.status).toBe('missed');
  });

  it('supports custom day count', () => {
    const cells = buildHeatmapData([], dailyFrequency, 7);
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe('2026-01-29');
    expect(cells[6].date).toBe('2026-02-04');
  });

  it('marks today as "missed" if no log (for daily habit, today is still trackable)', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    const todayCell = cells.find(c => c.date === '2026-02-04');
    // Today with no log is "missed" (the user hasn't completed it yet)
    expect(todayCell?.status).toBe('missed');
  });

  it('handles weekly frequency: all days are scheduled (any day counts)', () => {
    const weeklyFrequency: HabitFrequency = { type: 'weekly' };
    const cells = buildHeatmapData([], weeklyFrequency);
    // 2026-02-02 is Monday → scheduled (missed), 2026-02-03 is Tuesday → also scheduled (missed)
    const mondayCell = cells.find(c => c.date === '2026-02-02');
    expect(mondayCell?.status).toBe('missed');
    const tuesdayCell = cells.find(c => c.date === '2026-02-03');
    expect(tuesdayCell?.status).toBe('missed'); // Was 'not_scheduled', now 'missed' because weekly tracks all days
  });

  it('handles times_per_week frequency: all days are scheduled', () => {
    const timesPerWeek: HabitFrequency = { type: 'times_per_week', count: 3 };
    const cells = buildHeatmapData([], timesPerWeek);
    // All days should be scheduled (missed since no logs)
    const sundayCell = cells.find(c => c.date === '2026-02-01');
    expect(sundayCell?.status).toBe('missed');
  });

  it('each cell has correct date format (YYYY-MM-DD)', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    for (const cell of cells) {
      expect(cell.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
