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
    category: 'health',
    frequency: { type: 'daily' },
    status: 'active',
    current_streak: 5,
    best_streak: 12,
    paused_at: null,
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

    it('should filter by category', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      await habitsDB.getUserHabits(mockUserId, { category: 'health' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('category', 'health');
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
        category: 'learning',
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
        category: null,
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

  describe('archiveHabit', () => {
    it('should set status to archived', async () => {
      const archivedHabit = { ...mockHabit, status: 'archived' as const };
      mockSupabaseClient.setMockResponse(archivedHabit);

      const result = await habitsDB.archiveHabit('habit-123', mockUserId);

      expect(result.status).toBe('archived');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ status: 'archived' });
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
