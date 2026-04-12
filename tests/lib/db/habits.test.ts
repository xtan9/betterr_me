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

    it('falls back to empty logs when 90-day query fails (graceful degrade)', async () => {
      const habit = {
        ...mockHabit,
        id: 'h1',
        status: 'active' as const,
        frequency: { type: 'daily' } as const,
        created_at: '2026-01-01T00:00:00Z',
      };

      // The thenable `then` is called once per awaited query:
      //  1) getUserHabits → returns [habit]
      //  2) today-logs query → returns []
      //  3) 90-day window query → rejects with timeout
      const thenSpy = vi.spyOn(mockSupabaseClient, 'then');
      thenSpy.mockImplementationOnce((onFulfilled: any, onRejected: any) =>
        Promise.resolve({ data: [habit], error: null, count: null }).then(onFulfilled, onRejected)
      );
      thenSpy.mockImplementationOnce((onFulfilled: any, onRejected: any) =>
        Promise.resolve({ data: [], error: null, count: null }).then(onFulfilled, onRejected)
      );
      thenSpy.mockImplementationOnce((_onFulfilled: any, onRejected: any) =>
        Promise.reject(new Error('query timeout')).catch((e) => {
          if (onRejected) return onRejected(e);
          throw e;
        })
      );

      const result = await habitsDB.getHabitsWithTodayStatus(mockUserId, '2026-04-12');
      thenSpy.mockRestore();

      expect(result).toHaveLength(1);
      expect(result[0].graduation_eligible).toBe(false);
      expect(result[0].monthly_completion_rate).toBe(0);
    });

    it('returns graduation_eligible flag per habit', async () => {
      const activeHabit = {
        ...mockHabit,
        id: 'h-active',
        status: 'active' as const,
        created_at: '2026-01-01T00:00:00Z', // well over 21 days
        frequency: { type: 'daily' } as const,
      };
      const formedHabit = {
        ...mockHabit,
        id: 'h-formed',
        status: 'formed' as const,
        created_at: '2026-01-01T00:00:00Z',
        frequency: { type: 'daily' } as const,
      };

      // All thenable queries share the mock; habit objects lack log fields
      // so logs parsing yields empty per-habit lists. That's fine — this test
      // only asserts the property is present and that formed is never eligible.
      mockSupabaseClient.setMockResponse([activeHabit, formedHabit]);

      const result = await habitsDB.getHabitsWithTodayStatus(mockUserId, '2026-04-12');
      expect(result.find((h: { id: string }) => h.id === 'h-active')).toHaveProperty(
        'graduation_eligible'
      );
      // Formed is never eligible
      expect(
        result.find((h: { id: string; graduation_eligible: boolean }) => h.id === 'h-formed')
          ?.graduation_eligible
      ).toBe(false);
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

    it('reactivateHabit does NOT reset best_streak in the update payload', async () => {
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
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: formedHabit, error: null })
        .mockResolvedValueOnce({ data: activeHabit, error: null });
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { id: 'grad-1' },
        error: null,
      });
      mockSupabaseClient.update.mockClear();

      await habitsDB.reactivateHabit('habit-123', mockUserId);

      // Find the update call that flipped status to active
      const statusUpdateCall = mockSupabaseClient.update.mock.calls.find(
        (c: unknown[]) => (c[0] as { status?: string }).status === 'active'
      );
      expect(statusUpdateCall).toBeDefined();
      expect(statusUpdateCall![0]).not.toHaveProperty('best_streak');
      expect((statusUpdateCall![0] as { current_streak: number }).current_streak).toBe(0);
    });

    it('graduateHabit throws HabitAlreadyFormedError when habit is already formed', async () => {
      const { HabitAlreadyFormedError } = await import('@/lib/db/habit-errors');
      const alreadyFormed = { ...mockHabit, status: 'formed' as const };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: alreadyFormed,
        error: null,
      });
      await expect(
        habitsDB.graduateHabit('habit-123', mockUserId)
      ).rejects.toThrow(HabitAlreadyFormedError);
    });

    it('graduateHabit rolls back status when history insert fails', async () => {
      const activeHabit = {
        ...mockHabit,
        status: 'active' as const,
        current_streak: 42,
        nudge_dismissed_at: '2026-04-01T00:00:00Z',
      };
      const formedHabit = {
        ...activeHabit,
        status: 'formed' as const,
        graduated_at: '2026-04-12T00:00:00Z',
        graduated_streak: 42,
        nudge_dismissed_at: null,
      };

      // 1st single(): getHabit → activeHabit
      // 2nd single(): updateHabit forward-flip → formedHabit
      // 3rd single(): insertGraduation rejects
      // 4th single(): rollback updateHabit → activeHabit
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: activeHabit, error: null })
        .mockResolvedValueOnce({ data: formedHabit, error: null })
        .mockRejectedValueOnce(new Error('history insert failed'))
        .mockResolvedValueOnce({ data: activeHabit, error: null });

      mockSupabaseClient.update.mockClear();

      await expect(
        habitsDB.graduateHabit('habit-123', mockUserId)
      ).rejects.toThrow('history insert failed');

      // Rollback payload should restore nudge_dismissed_at and clear graduation fields
      const rollbackCall = mockSupabaseClient.update.mock.calls.find((c: unknown[]) => {
        const payload = c[0] as Record<string, unknown>;
        return (
          payload.status === 'active' &&
          payload.graduated_at === null &&
          payload.graduated_streak === null
        );
      });
      expect(rollbackCall).toBeDefined();
      expect((rollbackCall![0] as { nudge_dismissed_at: string }).nudge_dismissed_at).toBe(
        '2026-04-01T00:00:00Z'
      );
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
