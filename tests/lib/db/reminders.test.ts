import { describe, it, expect, vi, beforeEach } from 'vitest';
import { remindersDB } from '@/lib/db/reminders';
import { mockSupabaseClient } from '../../setup';
import type { Reminder } from '@/lib/db/types';

describe('RemindersDB', () => {
  const mockUserId = 'user-123';
  const mockReminder: Reminder = {
    id: 'reminder-123',
    user_id: mockUserId,
    source_type: 'calendar_event',
    source_id: 'event-456',
    reminder_type: 'relative',
    relative_minutes: 15,
    absolute_time: null,
    channels: ['push'],
    status: 'pending',
    fire_at: '2026-03-30T09:45:00Z',
    sent_at: null,
    created_at: '2026-03-25T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReminder', () => {
    it('should insert and return a new reminder', async () => {
      mockSupabaseClient.setMockResponse(mockReminder);

      const result = await remindersDB.createReminder(mockUserId, {
        source_type: 'calendar_event',
        source_id: 'event-456',
        reminder_type: 'relative',
        relative_minutes: 15,
        absolute_time: null,
        channels: ['push'],
        fire_at: '2026-03-30T09:45:00Z',
      });

      expect(result).toEqual(mockReminder);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminders');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Insert error' });

      await expect(remindersDB.createReminder(mockUserId, {
        source_type: 'calendar_event',
        source_id: 'event-456',
        reminder_type: 'relative',
        relative_minutes: 15,
        absolute_time: null,
        channels: ['push'],
        fire_at: '2026-03-30T09:45:00Z',
      })).rejects.toEqual({ message: 'Insert error' });
    });
  });

  describe('getRemindersBySource', () => {
    it('should fetch reminders for a source entity', async () => {
      mockSupabaseClient.setMockResponse([mockReminder]);

      const reminders = await remindersDB.getRemindersBySource(mockUserId, 'calendar_event', 'event-456');

      expect(reminders).toEqual([mockReminder]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminders');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_type', 'calendar_event');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_id', 'event-456');
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const reminders = await remindersDB.getRemindersBySource(mockUserId, 'task', 'task-123');

      expect(reminders).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(remindersDB.getRemindersBySource(mockUserId, 'calendar_event', 'event-456'))
        .rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getPendingReminders', () => {
    it('should fetch pending reminders before a given time', async () => {
      mockSupabaseClient.setMockResponse([mockReminder]);

      const reminders = await remindersDB.getPendingReminders('2026-03-30T10:00:00Z');

      expect(reminders).toEqual([mockReminder]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminders');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'pending');
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('fire_at', '2026-03-30T10:00:00Z');
    });

    it('should return empty array when no pending reminders', async () => {
      mockSupabaseClient.setMockResponse(null);

      const reminders = await remindersDB.getPendingReminders('2026-03-30T10:00:00Z');

      expect(reminders).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(remindersDB.getPendingReminders('2026-03-30T10:00:00Z'))
        .rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('updateReminderStatus', () => {
    it('should update reminder status', async () => {
      const updatedReminder = { ...mockReminder, status: 'sent' as const, sent_at: '2026-03-30T09:45:00Z' };
      mockSupabaseClient.setMockResponse(updatedReminder);

      const result = await remindersDB.updateReminderStatus(mockUserId, 'reminder-123', 'sent', '2026-03-30T09:45:00Z');

      expect(result).toEqual(updatedReminder);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminders');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ status: 'sent', sent_at: '2026-03-30T09:45:00Z' });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'reminder-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should update status without sentAt', async () => {
      const snoozedReminder = { ...mockReminder, status: 'snoozed' as const };
      mockSupabaseClient.setMockResponse(snoozedReminder);

      const result = await remindersDB.updateReminderStatus(mockUserId, 'reminder-123', 'snoozed');

      expect(result).toEqual(snoozedReminder);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ status: 'snoozed' });
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Update error' });

      await expect(remindersDB.updateReminderStatus(mockUserId, 'reminder-123', 'sent'))
        .rejects.toEqual({ message: 'Update error' });
    });
  });

  describe('deleteRemindersBySource', () => {
    it('should delete reminders for a source entity', async () => {
      mockSupabaseClient.setMockResponse(null);

      await remindersDB.deleteRemindersBySource(mockUserId, 'calendar_event', 'event-456');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reminders');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_type', 'calendar_event');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('source_id', 'event-456');
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(remindersDB.deleteRemindersBySource(mockUserId, 'calendar_event', 'event-456'))
        .rejects.toEqual({ message: 'Delete error' });
    });
  });
});
