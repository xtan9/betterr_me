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
});
