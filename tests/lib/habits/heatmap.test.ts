import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HabitFrequency } from '@/lib/db/types';
import { buildHeatmapData, buildMonthHeatmapData } from '@/lib/habits/heatmap';
import { makeLog } from '@/tests/helpers/habit-test-utils';

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

  it('marks all days as editable (no edit window)', () => {
    const cells = buildHeatmapData([], dailyFrequency);
    // All cells should be editable regardless of age
    expect(cells.every(c => c.isEditable)).toBe(true);
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

describe('buildMonthHeatmapData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 4)); // Feb 4, 2026 (Wed)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dailyFrequency: HabitFrequency = { type: 'daily' };

  it('returns cells for every day in the given month', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 1); // Feb 2026
    expect(cells).toHaveLength(28);
    expect(cells[0].date).toBe('2026-02-01');
    expect(cells[27].date).toBe('2026-02-28');
  });

  it('returns 31 cells for January', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 0);
    expect(cells).toHaveLength(31);
    expect(cells[0].date).toBe('2026-01-01');
    expect(cells[30].date).toBe('2026-01-31');
  });

  it('handles leap year February (29 days)', () => {
    vi.setSystemTime(new Date(2024, 2, 1));
    const cells = buildMonthHeatmapData([], dailyFrequency, 2024, 1);
    expect(cells).toHaveLength(29);
    expect(cells[28].date).toBe('2024-02-29');
  });

  it('marks today correctly when viewing current month', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 1);
    const todayCell = cells.find(c => c.date === '2026-02-04');
    expect(todayCell?.isToday).toBe(true);
    const otherCell = cells.find(c => c.date === '2026-02-03');
    expect(otherCell?.isToday).toBe(false);
  });

  it('marks no cell as today when viewing a different month', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 0);
    expect(cells.every(c => !c.isToday)).toBe(true);
  });

  it('marks completed logs correctly', () => {
    const logs = [makeLog('2026-02-03', true)];
    const cells = buildMonthHeatmapData(logs, dailyFrequency, 2026, 1);
    expect(cells.find(c => c.date === '2026-02-03')?.status).toBe('completed');
  });

  it('marks non-scheduled days for weekdays frequency', () => {
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    const cells = buildMonthHeatmapData([], weekdaysFrequency, 2026, 1);
    expect(cells.find(c => c.date === '2026-02-01')?.status).toBe('not_scheduled');
    expect(cells.find(c => c.date === '2026-02-02')?.status).toBe('missed');
  });

  it('works for historical months (1990)', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 1990, 0);
    expect(cells).toHaveLength(31);
    expect(cells[0].date).toBe('1990-01-01');
    expect(cells[30].date).toBe('1990-01-31');
  });

  it('marks all cells as editable', () => {
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 1);
    expect(cells.every(c => c.isEditable)).toBe(true);
  });

  it('marks future days in current month as not_scheduled instead of missed', () => {
    // Today is Feb 4, 2026 — Feb 5 should NOT be "missed"
    const cells = buildMonthHeatmapData([], dailyFrequency, 2026, 1);
    const feb5 = cells.find(c => c.date === '2026-02-05');
    expect(feb5?.status).toBe('not_scheduled');
    // But Feb 3 (past) should still be "missed"
    const feb3 = cells.find(c => c.date === '2026-02-03');
    expect(feb3?.status).toBe('missed');
    // And today (Feb 4) should be "missed" (not yet completed)
    const feb4 = cells.find(c => c.date === '2026-02-04');
    expect(feb4?.status).toBe('missed');
  });

  it('generates correct date strings for SWR key construction', () => {
    // This validates the pattern used in habit-detail-content.tsx for logsSwrKey
    const year = 2026;
    const month = 1; // February
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    expect(startDate).toBe('2026-02-01');
    expect(endDate).toBe('2026-02-28');

    // Test single-digit month (January)
    const janStart = `${2026}-${String(0 + 1).padStart(2, '0')}-01`;
    const janLastDay = new Date(2026, 0 + 1, 0).getDate();
    const janEnd = `${2026}-${String(0 + 1).padStart(2, '0')}-${String(janLastDay).padStart(2, '0')}`;
    expect(janStart).toBe('2026-01-01');
    expect(janEnd).toBe('2026-01-31');

    // Test December (month index 11)
    const decStart = `${2026}-${String(11 + 1).padStart(2, '0')}-01`;
    const decLastDay = new Date(2026, 11 + 1, 0).getDate();
    const decEnd = `${2026}-${String(11 + 1).padStart(2, '0')}-${String(decLastDay).padStart(2, '0')}`;
    expect(decStart).toBe('2026-12-01');
    expect(decEnd).toBe('2026-12-31');
  });
});
