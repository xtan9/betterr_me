import { describe, it, expect, vi, beforeEach } from 'vitest';
import { habitsDB } from '@/lib/db/habits';
import { mockSupabaseClient } from '../../setup';
import type { Habit, HabitInsert } from '@/lib/db/types';

describe('HabitsDB', () => {
  const mockUserId = 'user-123';
  const mockHabit: Habit = {
    id: 'habit-123',
    user_id: mockUserId,
    name: 'Morning Run',
    description: 'Run 5km every morning',
    category_id: null,
    frequency: { type: 'daily' },
    status: 'active',
    current_streak: 5,
    best_streak: 12,
    paused_at: null,
    graduated_at: null,
    graduated_streak: null,
    nudge_dismissed_at: null,
    created_at: '2026-01-30T10:00:00Z',
    updated_at: '2026-01-30T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserHabits', () => {
    it('should fetch all habits for a user', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      const habits = await habitsDB.getUserHabits(mockUserId);

      expect(habits).toEqual([mockHabit]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habits');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should filter by status', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      await habitsDB.getUserHabits(mockUserId, { status: 'active' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('should filter by category_id', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      await habitsDB.getUserHabits(mockUserId, { category_id: 'cat-123' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('category_id', 'cat-123');
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(habitsDB.getUserHabits(mockUserId)).rejects.toEqual({ message: 'DB error' });
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const habits = await habitsDB.getUserHabits(mockUserId);

      expect(habits).toEqual([]);
    });
  });

  describe('getActiveHabits', () => {
    it('should fetch only active habits', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      await habitsDB.getActiveHabits(mockUserId);

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'active');
    });
  });

  describe('getHabit', () => {
    it('should fetch a single habit by ID', async () => {
      mockSupabaseClient.setMockResponse(mockHabit);

      const habit = await habitsDB.getHabit('habit-123', mockUserId);

      expect(habit).toEqual(mockHabit);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'habit-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if habit not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const habit = await habitsDB.getHabit('nonexistent', mockUserId);

      expect(habit).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER_ERROR', message: 'DB error' });

      await expect(habitsDB.getHabit('habit-123', mockUserId)).rejects.toEqual({
        code: 'OTHER_ERROR',
        message: 'DB error',
      });
    });
  });

  describe('createHabit', () => {
    it('should create a new habit', async () => {
      const newHabit: HabitInsert = {
        user_id: mockUserId,
        name: 'Read Books',
        description: 'Read for 30 minutes',
        category_id: null,
        frequency: { type: 'daily' },
        status: 'active',
      };

      mockSupabaseClient.setMockResponse(mockHabit);

      const created = await habitsDB.createHabit(newHabit);

      expect(created).toEqual(mockHabit);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(newHabit);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Insert failed' });

      const newHabit: HabitInsert = {
        user_id: mockUserId,
        name: 'Test',
        description: null,
        category_id: null,
        frequency: { type: 'daily' },
        status: 'active',
      };

      await expect(habitsDB.createHabit(newHabit)).rejects.toEqual({ message: 'Insert failed' });
    });
  });

  describe('updateHabit', () => {
    it('should update a habit', async () => {
      const updates = { name: 'Evening Run' };
      const updatedHabit = { ...mockHabit, ...updates };

      mockSupabaseClient.setMockResponse(updatedHabit);

      const result = await habitsDB.updateHabit('habit-123', mockUserId, updates);

      expect(result).toEqual(updatedHabit);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'habit-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });
  });

  describe('updateHabitStreak', () => {
    it('should update streak values', async () => {
      const updatedHabit = { ...mockHabit, current_streak: 10, best_streak: 15 };
      mockSupabaseClient.setMockResponse(updatedHabit);

      const result = await habitsDB.updateHabitStreak('habit-123', mockUserId, 10, 15);

      expect(result).toEqual(updatedHabit);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        current_streak: 10,
        best_streak: 15,
      });
    });
  });

  describe('pauseHabit', () => {
    it('should set status to paused with timestamp', async () => {
      const pausedHabit = { ...mockHabit, status: 'paused' as const };
      mockSupabaseClient.setMockResponse(pausedHabit);

      const result = await habitsDB.pauseHabit('habit-123', mockUserId);

      expect(result.status).toBe('paused');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused', paused_at: expect.any(String) })
      );
    });
  });

  describe('resumeHabit', () => {
    it('should set status to active and clear paused_at', async () => {
      const activeHabit = { ...mockHabit, status: 'active' as const, paused_at: null };
      mockSupabaseClient.setMockResponse(activeHabit);

      const result = await habitsDB.resumeHabit('habit-123', mockUserId);

      expect(result.status).toBe('active');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ status: 'active', paused_at: null });
    });
  });

  describe('getHabitsWithTodayStatus', () => {
    it('should fetch ALL habits (not just active) so paused/formed appear in their tabs', async () => {
      const pausedHabit = { ...mockHabit, id: 'habit-paused', status: 'paused' as const };
      const formedHabit = { ...mockHabit, id: 'habit-formed', status: 'formed' as const };
      const allHabits = [mockHabit, pausedHabit, formedHabit];

      // First call: getUserHabits (no status filter)
      mockSupabaseClient.setMockResponse(allHabits);

      const result = await habitsDB.getHabitsWithTodayStatus(mockUserId, '2026-02-04');

      // Verify it called getUserHabits WITHOUT a status filter
      // (i.e. eq should NOT have been called with 'status', 'active')
      const eqCalls = mockSupabaseClient.eq.mock.calls;
      const statusFilterCalls = eqCalls.filter(
        (call: string[]) => call[0] === 'status' && call[1] === 'active'
      );
      expect(statusFilterCalls).toHaveLength(0);

      // Should return all 3 habits
      expect(result).toHaveLength(3);
      expect(result.map((h: { id: string }) => h.id)).toEqual(
        expect.arrayContaining(['habit-123', 'habit-paused', 'habit-formed'])
      );
    });
  });

  describe('graduation', () => {
    it('graduateHabit sets status=formed, snapshots streak, inserts graduation row', async () => {
      const activeHabit = { ...mockHabit, status: 'active' as const, current_streak: 42 };
      const formedHabit = {
        ...mockHabit,
        status: 'formed' as const,
        current_streak: 42,
        graduated_streak: 42,
        graduated_at: '2026-04-12T00:00:00Z',
        nudge_dismissed_at: null,
      };
      // 1st single(): getHabit → activeHabit
      // 2nd single(): updateHabit → formedHabit
      // 3rd single(): insertGraduation → grad row
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: activeHabit, error: null })
        .mockResolvedValueOnce({ data: formedHabit, error: null })
        .mockResolvedValueOnce({ data: { id: 'grad-1', habit_id: 'habit-123' }, error: null });

      const result = await habitsDB.graduateHabit('habit-123', mockUserId);

      expect(result.status).toBe('formed');
      expect(result.graduated_streak).toBe(42);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_graduations');
    });

    it('graduateHabit throws when habit not found', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });
      await expect(habitsDB.graduateHabit('missing', mockUserId)).rejects.toThrow(/not found/i);
    });

    it('reactivateHabit sets status=active, resets current_streak, preserves best_streak', async () => {
      const formedHabit = {
        ...mockHabit,
        status: 'formed' as const,
        current_streak: 0,
        best_streak: 87,
        graduated_streak: 87,
        graduated_at: '2026-04-01T00:00:00Z',
      };
      const activeHabit = {
        ...mockHabit,
        status: 'active' as const,
        current_streak: 0,
        best_streak: 87,
        graduated_at: null,
        graduated_streak: null,
      };
      // 1st single(): getHabit → formedHabit
      // 2nd single(): updateHabit → activeHabit
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: formedHabit, error: null })
        .mockResolvedValueOnce({ data: activeHabit, error: null });
      // maybeSingle for markReactivated's select
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: 'grad-1' },
        error: null,
      });
      // update (thenable) uses mockData; last setMockResponse applies
      mockSupabaseClient.setMockResponse({});

      const result = await habitsDB.reactivateHabit('habit-123', mockUserId);

      expect(result.status).toBe('active');
      expect(result.current_streak).toBe(0);
      expect(result.best_streak).toBe(87);
      expect(result.graduated_at).toBeNull();
    });

    it('reactivateHabit throws when habit is not formed', async () => {
      const activeHabit = { ...mockHabit, status: 'active' as const };
      mockSupabaseClient.single.mockResolvedValueOnce({ data: activeHabit, error: null });
      await expect(habitsDB.reactivateHabit('habit-123', mockUserId)).rejects.toThrow(/not formed/i);
    });

    it('dismissGraduationNudge stamps nudge_dismissed_at', async () => {
      const updated = { ...mockHabit, nudge_dismissed_at: '2026-04-12T00:00:00Z' };
      mockSupabaseClient.single.mockResolvedValueOnce({ data: updated, error: null });

      const result = await habitsDB.dismissGraduationNudge('habit-123', mockUserId);
      expect(result.nudge_dismissed_at).toBe('2026-04-12T00:00:00Z');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ nudge_dismissed_at: expect.any(String) })
      );
    });
  });

  describe('deleteHabit', () => {
    it('should delete a habit', async () => {
      mockSupabaseClient.setMockResponse(null);

      await habitsDB.deleteHabit('habit-123', mockUserId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'habit-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on delete error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete failed' });

      await expect(habitsDB.deleteHabit('habit-123', mockUserId)).rejects.toEqual({
        message: 'Delete failed',
      });
    });
  });
});
