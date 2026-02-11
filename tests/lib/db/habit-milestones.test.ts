import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HabitMilestonesDB } from '@/lib/db/habit-milestones';
import { mockSupabaseClient } from '../../setup';
import type { HabitMilestone } from '@/lib/db/types';

describe('HabitMilestonesDB', () => {
  const mockUserId = 'user-123';
  const mockHabitId = 'habit-123';
  let milestonesDB: HabitMilestonesDB;

  const mockMilestone: HabitMilestone = {
    id: 'milestone-1',
    habit_id: mockHabitId,
    user_id: mockUserId,
    milestone: 7,
    achieved_at: '2026-02-09T10:00:00Z',
    created_at: '2026-02-09T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    milestonesDB = new HabitMilestonesDB(mockSupabaseClient as any);
  });

  describe('recordMilestone', () => {
    it('should upsert a milestone with correct conflict clause', async () => {
      mockSupabaseClient.setMockResponse(null);

      await milestonesDB.recordMilestone(mockHabitId, mockUserId, 7);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_milestones');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        { habit_id: mockHabitId, user_id: mockUserId, milestone: 7 },
        { onConflict: 'habit_id,milestone' }
      );
    });

    it('should throw on Supabase error', async () => {
      const dbError = { message: 'RLS violation', code: '42501' };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        milestonesDB.recordMilestone(mockHabitId, mockUserId, 30)
      ).rejects.toEqual(dbError);
    });
  });

  describe('getHabitMilestones', () => {
    it('should fetch milestones for a habit ordered ascending', async () => {
      const milestones = [
        { ...mockMilestone, milestone: 7 },
        { ...mockMilestone, id: 'milestone-2', milestone: 14 },
      ];
      mockSupabaseClient.setMockResponse(milestones);

      const result = await milestonesDB.getHabitMilestones(mockHabitId, mockUserId);

      expect(result).toEqual(milestones);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_milestones');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('habit_id', mockHabitId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('milestone', { ascending: true });
    });

    it('should return empty array when data is null', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await milestonesDB.getHabitMilestones(mockHabitId, mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw on Supabase error', async () => {
      const dbError = { message: 'Connection failed' };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        milestonesDB.getHabitMilestones(mockHabitId, mockUserId)
      ).rejects.toEqual(dbError);
    });
  });

  describe('getTodaysMilestones', () => {
    it('should filter milestones by date range and order descending', async () => {
      mockSupabaseClient.setMockResponse([mockMilestone]);

      const result = await milestonesDB.getTodaysMilestones(mockUserId, '2026-02-09');

      expect(result).toEqual([mockMilestone]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habit_milestones');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('achieved_at', '2026-02-09T00:00:00');
      expect(mockSupabaseClient.lt).toHaveBeenCalledWith('achieved_at', '2026-02-10T00:00:00');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('milestone', { ascending: false });
    });

    it('should handle year boundary correctly', async () => {
      mockSupabaseClient.setMockResponse([]);

      await milestonesDB.getTodaysMilestones(mockUserId, '2026-12-31');

      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('achieved_at', '2026-12-31T00:00:00');
      expect(mockSupabaseClient.lt).toHaveBeenCalledWith('achieved_at', '2027-01-01T00:00:00');
    });

    it('should return empty array when data is null', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await milestonesDB.getTodaysMilestones(mockUserId, '2026-02-09');

      expect(result).toEqual([]);
    });

    it('should throw on Supabase error', async () => {
      const dbError = { message: 'Table not found' };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        milestonesDB.getTodaysMilestones(mockUserId, '2026-02-09')
      ).rejects.toEqual(dbError);
    });
  });
});
