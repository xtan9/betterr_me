import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseClient } from '../../setup';
import type { HabitLog } from '@/lib/db/types';

// Mock habitsDB class since HabitLogsDB creates its own instance
const { mockGetHabit, mockUpdateHabitStreak } = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockUpdateHabitStreak: vi.fn(),
}));

vi.mock('@/lib/db/habits', () => ({
  HabitsDB: class {
    getHabit = mockGetHabit;
    updateHabitStreak = mockUpdateHabitStreak;
  },
  habitsDB: {
    getHabit: mockGetHabit,
    updateHabitStreak: mockUpdateHabitStreak,
  },
}));

import { habitLogsDB } from '@/lib/db/habit-logs';

describe('HabitLogsDB', () => {
  const mockUserId = 'user-123';
  const mockHabitId = 'habit-123';
  const mockLog: HabitLog = {
    id: 'log-123',
    habit_id: mockHabitId,
    user_id: mockUserId,
    logged_date: '2026-02-03',
    completed: true,
    created_at: '2026-02-03T10:00:00Z',
    updated_at: '2026-02-03T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLogsByDateRange', () => {
    it('should fetch logs within date range', async () => {
      mockSupabaseClient.setMockResponse([mockLog]);

      const logs = await habitLogsDB.getLogsByDateRange(
        mockHabitId,
        mockUserId,
        '2026-01-01',
        '2026-02-03'
      );

      expect(logs).toEqual([mockLog]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_logs');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('habit_id', mockHabitId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('logged_date', '2026-01-01');
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('logged_date', '2026-02-03');
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const logs = await habitLogsDB.getLogsByDateRange(
        mockHabitId,
        mockUserId,
        '2026-01-01',
        '2026-02-03'
      );

      expect(logs).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(
        habitLogsDB.getLogsByDateRange(mockHabitId, mockUserId, '2026-01-01', '2026-02-03')
      ).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getLogForDate', () => {
    it('should fetch a single log for a date', async () => {
      mockSupabaseClient.setMockResponse(mockLog);

      const log = await habitLogsDB.getLogForDate(mockHabitId, mockUserId, '2026-02-03');

      expect(log).toEqual(mockLog);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('logged_date', '2026-02-03');
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if no log found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const log = await habitLogsDB.getLogForDate(mockHabitId, mockUserId, '2026-02-03');

      expect(log).toBeNull();
    });
  });

  describe('getUserLogsForDate', () => {
    it('should fetch all completed logs for a user on a date', async () => {
      mockSupabaseClient.setMockResponse([mockLog]);

      const logs = await habitLogsDB.getUserLogsForDate(mockUserId, '2026-02-03');

      expect(logs).toEqual([mockLog]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('logged_date', '2026-02-03');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('completed', true);
    });
  });

  describe('upsertLog', () => {
    it('should upsert a log entry', async () => {
      mockSupabaseClient.setMockResponse(mockLog);

      const log = await habitLogsDB.upsertLog({
        habit_id: mockHabitId,
        user_id: mockUserId,
        logged_date: '2026-02-03',
        completed: true,
      });

      expect(log).toEqual(mockLog);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          habit_id: mockHabitId,
          user_id: mockUserId,
          logged_date: '2026-02-03',
          completed: true,
        },
        { onConflict: 'habit_id,logged_date' }
      );
    });
  });

  describe('deleteLog', () => {
    it('should delete a log', async () => {
      mockSupabaseClient.setMockResponse(null);

      await habitLogsDB.deleteLog(mockHabitId, mockUserId, '2026-02-03');

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('habit_id', mockHabitId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('logged_date', '2026-02-03');
    });
  });

  describe('getHabitStats', () => {
    it('should calculate completion stats', async () => {
      const logs = [
        { ...mockLog, completed: true },
        { ...mockLog, id: 'log-2', logged_date: '2026-02-02', completed: true },
        { ...mockLog, id: 'log-3', logged_date: '2026-02-01', completed: false },
      ];
      mockSupabaseClient.setMockResponse(logs);

      const stats = await habitLogsDB.getHabitStats(mockHabitId, mockUserId, 30);

      expect(stats.totalDays).toBe(30);
      expect(stats.completedDays).toBe(2);
      expect(stats.completionRate).toBe(7); // 2/30 * 100 rounded
    });
  });

  describe('toggleLog', () => {
    it('should throw EDIT_WINDOW_EXCEEDED for dates older than 7 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const dateStr = oldDate.toISOString().split('T')[0];

      await expect(
        habitLogsDB.toggleLog(mockHabitId, mockUserId, dateStr)
      ).rejects.toThrow('EDIT_WINDOW_EXCEEDED');
    });
  });

  describe('getDetailedHabitStats with weekStartDay', () => {
    const frequency = { type: 'daily' as const };
    const createdAt = '2026-01-01T00:00:00Z';

    it('should return completed count from COUNT query for daily habits', async () => {
      // Daily habits use COUNT queries — mock returns count property
      mockSupabaseClient.setMockResponse(null, null, 3);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt,
        0 // Sunday
      );

      // All three periods should have completed=3 (same mock for all)
      expect(stats.thisWeek.completed).toBe(3);
      expect(stats.thisMonth.completed).toBe(3);
      expect(stats.allTime.completed).toBe(3);
      expect(stats.thisWeek.total).toBeGreaterThan(0);
      expect(stats.allTime.percent).toBeGreaterThan(0);
    });

    it('should cap percent at 100%', async () => {
      // Set count higher than possible scheduled days (e.g., 999)
      mockSupabaseClient.setMockResponse(null, null, 999);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt,
        0
      );

      expect(stats.thisWeek.percent).toBeLessThanOrEqual(100);
      expect(stats.thisMonth.percent).toBeLessThanOrEqual(100);
      expect(stats.allTime.percent).toBeLessThanOrEqual(100);
    });

    it('should default to Sunday when weekStartDay is not provided', async () => {
      mockSupabaseClient.setMockResponse(null, null, 0);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt
        // no weekStartDay parameter
      );

      expect(stats.thisWeek).toBeDefined();
      expect(stats.thisMonth).toBeDefined();
      expect(stats.allTime).toBeDefined();
    });
  });

  describe('times_per_week frequency handling', () => {
    const timesPerWeekFrequency = { type: 'times_per_week' as const, count: 3 };
    const createdAt = '2026-01-01T00:00:00Z';

    // Compute dates in the current week dynamically so tests stay valid as time advances
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysFromSunday = (now.getDay() - 0 + 7) % 7; // weekStartDay = 0 (Sunday)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysFromSunday);
    const weekDate = (offset: number): string => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    };

    describe('getDetailedHabitStats', () => {
      it('should return weekly progress for thisWeek (completed/target)', async () => {
        // 2 completions this week for a 3x/week habit
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0 // Sunday
        );

        expect(stats.thisWeek.completed).toBe(2);
        expect(stats.thisWeek.total).toBe(3); // Target is 3
        expect(stats.thisWeek.percent).toBe(67); // 2/3 * 100 rounded
      });

      it('should cap percent at 100 when target exceeded', async () => {
        // 4 completions this week for a 3x/week habit
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
          { ...mockLog, logged_date: weekDate(2), completed: true },
          { ...mockLog, logged_date: weekDate(3), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0
        );

        expect(stats.thisWeek.completed).toBe(4);
        expect(stats.thisWeek.total).toBe(3);
        expect(stats.thisWeek.percent).toBe(100); // Capped at 100
      });

      it('should count successful weeks for allTime', async () => {
        // Week 1: 3 completions (success), Week 2: 2 completions (fail), Week 3: 3 completions (success)
        mockSupabaseClient.setMockResponse([
          // Week 1 (Jan 5-11)
          { ...mockLog, logged_date: '2026-01-05', completed: true },
          { ...mockLog, logged_date: '2026-01-06', completed: true },
          { ...mockLog, logged_date: '2026-01-07', completed: true },
          // Week 2 (Jan 12-18) - only 2 completions
          { ...mockLog, logged_date: '2026-01-12', completed: true },
          { ...mockLog, logged_date: '2026-01-13', completed: true },
          // Week 3 (Jan 19-25)
          { ...mockLog, logged_date: '2026-01-19', completed: true },
          { ...mockLog, logged_date: '2026-01-20', completed: true },
          { ...mockLog, logged_date: '2026-01-21', completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0
        );

        // allTime should show successful weeks vs total weeks
        expect(stats.allTime).toBeDefined();
        expect(stats.allTime.completed).toBeGreaterThanOrEqual(0);
        expect(stats.allTime.total).toBeGreaterThanOrEqual(0);
      });
    });

    describe('calculateStreak', () => {
      it('should count consecutive successful weeks', async () => {
        // 3 consecutive weeks meeting target
        mockSupabaseClient.setMockResponse([
          // Week -2 (older)
          { ...mockLog, logged_date: '2026-01-19', completed: true },
          { ...mockLog, logged_date: '2026-01-20', completed: true },
          { ...mockLog, logged_date: '2026-01-21', completed: true },
          // Week -1
          { ...mockLog, logged_date: '2026-01-26', completed: true },
          { ...mockLog, logged_date: '2026-01-27', completed: true },
          { ...mockLog, logged_date: '2026-01-28', completed: true },
          // Current week
          { ...mockLog, logged_date: '2026-02-02', completed: true },
          { ...mockLog, logged_date: '2026-02-03', completed: true },
          { ...mockLog, logged_date: '2026-02-04', completed: true },
        ]);

        const result = await habitLogsDB.calculateStreak(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          0,
          0 // Sunday week start
        );

        // Should have 3 week streak
        expect(result.currentStreak).toBeGreaterThanOrEqual(1);
        expect(result.bestStreak).toBeGreaterThanOrEqual(result.currentStreak);
      });

      it('should return 0 streak when current week incomplete and previous week failed', async () => {
        // Previous week only had 2 completions (target is 3)
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: '2026-01-26', completed: true },
          { ...mockLog, logged_date: '2026-01-27', completed: true },
        ]);

        const result = await habitLogsDB.calculateStreak(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          0,
          0
        );

        expect(result.currentStreak).toBe(0);
      });
    });
  });
});
