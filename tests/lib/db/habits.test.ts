import { describe, it, expect, beforeEach, vi } from 'vitest';
import { habitsDB } from '@/lib/db/habits';
import { mockSupabaseClient } from '../../setup';
import type { Habit, InsertHabit } from '@/lib/types/database';

describe('HabitsDB', () => {
  beforeEach(() => {
    // Reset mock responses but keep chainable setup
    mockSupabaseClient.setMockResponse(null, null);
    // Clear call history
    vi.clearAllMocks();
  });

  describe('getUserHabits', () => {
    it('should fetch active habits for a user', async () => {
      const mockHabits: Habit[] = [
        {
          id: '1',
          user_id: 'user1',
          category_id: null,
          name: 'Morning Run',
          description: 'Run 5km every morning',
          config: {
            type: 'boolean',
            target_value: null,
            target_unit: null,
            difficulty_level: 2,
            points_reward: 20,
            style: { color: '#3B82F6', icon: 'running' },
          },
          frequency: 'daily',
          schedule_config: { days_of_week: [1, 2, 3, 4, 5] },
          is_active: true,
          archived_at: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabaseClient.setMockResponse(mockHabits, null);

      const result = await habitsDB.getUserHabits('user1');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habits');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user1');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_active', true);
      expect(result).toEqual(mockHabits);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Database connection failed');
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(habitsDB.getUserHabits('user1')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('createHabit', () => {
    it('should create a new habit', async () => {
      const newHabit: InsertHabit = {
        user_id: 'user1',
        category_id: null,
        name: 'Meditation',
        description: '10 minutes daily',
        config: {
          type: 'duration',
          target_value: 10,
          target_unit: 'minutes',
          difficulty_level: 1,
          points_reward: 10,
          style: { color: '#10B981', icon: 'brain' },
        },
        frequency: 'daily',
        schedule_config: {},
        is_active: true,
        archived_at: null,
      };

      const createdHabit: Habit = {
        ...newHabit,
        id: 'new-habit-id',
        created_at: '2024-01-29T00:00:00Z',
        updated_at: '2024-01-29T00:00:00Z',
      };

      mockSupabaseClient.setMockResponse(createdHabit, null);

      const result = await habitsDB.createHabit(newHabit);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habits');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(newHabit);
      expect(result).toEqual(createdHabit);
    });
  });

  describe('updateHabit', () => {
    it('should update an existing habit', async () => {
      const updates = { name: 'Updated Name', description: 'Updated description' };
      const updatedHabit: Habit = {
        id: 'habit1',
        user_id: 'user1',
        category_id: null,
        name: 'Updated Name',
        description: 'Updated description',
        config: {
          type: 'boolean',
          target_value: null,
          target_unit: null,
          difficulty_level: 1,
          points_reward: 10,
          style: { color: '#3B82F6', icon: 'target' },
        },
        frequency: 'daily',
        schedule_config: {},
        is_active: true,
        archived_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-29T00:00:00Z',
      };

      mockSupabaseClient.setMockResponse(updatedHabit, null);

      const result = await habitsDB.updateHabit('habit1', 'user1', updates);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'habit1');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user1');
      expect(result).toEqual(updatedHabit);
    });
  });

  describe('archiveHabit', () => {
    it('should archive a habit', async () => {
      mockSupabaseClient.setMockResponse(null, null);

      await habitsDB.archiveHabit('habit1', 'user1');

      expect(mockSupabaseClient.update).toHaveBeenCalled();
      const updateCall = mockSupabaseClient.update.mock.calls[0][0];
      expect(updateCall).toHaveProperty('archived_at');
    });
  });

  describe('getTodayLogs', () => {
    it('should fetch today\'s habit logs', async () => {
      const mockLogs = [
        {
          id: 'log1',
          habit_id: 'habit1',
          user_id: 'user1',
          logged_at: '2024-01-29T08:00:00Z',
          log_date: '2024-01-29',
          value: 1,
          duration_minutes: null,
          notes: 'Completed morning run',
          mood_rating: 4,
          metadata: {},
          created_at: '2024-01-29T08:00:00Z',
        },
      ];

      mockSupabaseClient.setMockResponse(mockLogs, null);

      const result = await habitsDB.getTodayLogs('user1');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_logs');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user1');
      expect(result).toEqual(mockLogs);
    });
  });
});
