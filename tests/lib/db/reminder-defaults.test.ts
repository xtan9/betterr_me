import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reminderDefaultsDB } from '@/lib/db/reminder-defaults';
import { mockSupabaseClient } from '../../setup';
import type { ReminderDefault } from '@/lib/db/types';

describe('ReminderDefaultsDB', () => {
  const mockUserId = 'user-123';
  const mockDefault: ReminderDefault = {
    id: 'default-123',
    user_id: mockUserId,
    source_type: 'calendar_event',
    relative_minutes: 15,
    channels: ['push'],
    created_at: '2026-03-25T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDefaults', () => {
    it('should fetch all defaults for a user', async () => {
      mockSupabaseClient.setMockResponse([mockDefault]);

      const defaults = await reminderDefaultsDB.getDefaults(mockUserId);

      expect(defaults).toEqual([mockDefault]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminder_defaults');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should return empty array when no defaults', async () => {
      mockSupabaseClient.setMockResponse(null);

      const defaults = await reminderDefaultsDB.getDefaults(mockUserId);

      expect(defaults).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(reminderDefaultsDB.getDefaults(mockUserId))
        .rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getDefault', () => {
    it('should fetch a single default by source type', async () => {
      mockSupabaseClient.setMockResponse(mockDefault);

      const result = await reminderDefaultsDB.getDefault(mockUserId, 'calendar_event');

      expect(result).toEqual(mockDefault);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminder_defaults');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_type', 'calendar_event');
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if default not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const result = await reminderDefaultsDB.getDefault(mockUserId, 'task');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER_ERROR', message: 'DB error' });

      await expect(reminderDefaultsDB.getDefault(mockUserId, 'calendar_event'))
        .rejects.toEqual({ code: 'OTHER_ERROR', message: 'DB error' });
    });
  });

  describe('upsertDefault', () => {
    it('should upsert and return a default', async () => {
      mockSupabaseClient.setMockResponse(mockDefault);

      const result = await reminderDefaultsDB.upsertDefault(mockUserId, {
        source_type: 'calendar_event',
        relative_minutes: 15,
        channels: ['push'],
      });

      expect(result).toEqual(mockDefault);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminder_defaults');
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Upsert error' });

      await expect(reminderDefaultsDB.upsertDefault(mockUserId, {
        source_type: 'calendar_event',
        relative_minutes: 15,
        channels: ['push'],
      })).rejects.toEqual({ message: 'Upsert error' });
    });
  });

  describe('deleteDefault', () => {
    it('should delete a specific default', async () => {
      mockSupabaseClient.setMockResponse(null);

      await reminderDefaultsDB.deleteDefault(mockUserId, 'calendar_event');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminder_defaults');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_type', 'calendar_event');
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(reminderDefaultsDB.deleteDefault(mockUserId, 'calendar_event'))
        .rejects.toEqual({ message: 'Delete error' });
    });
  });
});
