import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calendarEventsDB } from '@/lib/db/calendar-events';
import { mockSupabaseClient } from '../../setup';
import type { CalendarEvent } from '@/lib/db/types';

describe('CalendarEventsDB', () => {
  const mockUserId = 'user-123';
  const mockEvent: CalendarEvent = {
    id: 'event-123',
    user_id: mockUserId,
    title: 'Team Meeting',
    description: 'Weekly sync',
    start_date: '2026-03-30',
    start_time: '10:00:00',
    end_date: '2026-03-30',
    end_time: '11:00:00',
    location: 'Conference Room A',
    color: '#4285f4',
    category_id: null,
    is_recurring: false,
    recurrence_rule: null,
    end_type: null,
    end_date_recurrence: null,
    end_count: null,
    recurring_event_id: null,
    original_date: null,
    is_exception: false,
    created_at: '2026-03-25T10:00:00Z',
    updated_at: '2026-03-25T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserEvents', () => {
    it('should fetch events in a date range', async () => {
      mockSupabaseClient.setMockResponse([mockEvent]);

      const events = await calendarEventsDB.getUserEvents(mockUserId, '2026-03-01', '2026-03-31');

      expect(events).toEqual([mockEvent]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('start_date', '2026-03-31');
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('end_date', '2026-03-01');
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const events = await calendarEventsDB.getUserEvents(mockUserId, '2026-03-01', '2026-03-31');

      expect(events).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(calendarEventsDB.getUserEvents(mockUserId, '2026-03-01', '2026-03-31'))
        .rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getEvent', () => {
    it('should fetch a single event by ID', async () => {
      mockSupabaseClient.setMockResponse(mockEvent);

      const event = await calendarEventsDB.getEvent('event-123', mockUserId);

      expect(event).toEqual(mockEvent);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'event-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if event not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const event = await calendarEventsDB.getEvent('nonexistent', mockUserId);

      expect(event).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER_ERROR', message: 'DB error' });

      await expect(calendarEventsDB.getEvent('event-123', mockUserId))
        .rejects.toEqual({ code: 'OTHER_ERROR', message: 'DB error' });
    });
  });

  describe('createEvent', () => {
    it('should insert and return a new event', async () => {
      mockSupabaseClient.setMockResponse(mockEvent);

      const result = await calendarEventsDB.createEvent(mockUserId, {
        title: 'Team Meeting',
        description: 'Weekly sync',
        start_date: '2026-03-30',
        start_time: '10:00:00',
        end_date: '2026-03-30',
        end_time: '11:00:00',
        location: 'Conference Room A',
        color: '#4285f4',
        category_id: null,
        is_recurring: false,
        recurrence_rule: null,
        end_type: null,
        end_date_recurrence: null,
        end_count: null,
        recurring_event_id: null,
        original_date: null,
        is_exception: false,
      });

      expect(result).toEqual(mockEvent);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Insert error' });

      await expect(calendarEventsDB.createEvent(mockUserId, {
        title: 'Test',
        description: null,
        start_date: '2026-03-30',
        start_time: null,
        end_date: '2026-03-30',
        end_time: null,
        location: null,
        color: null,
        category_id: null,
        is_recurring: false,
        recurrence_rule: null,
        end_type: null,
        end_date_recurrence: null,
        end_count: null,
        recurring_event_id: null,
        original_date: null,
        is_exception: false,
      })).rejects.toEqual({ message: 'Insert error' });
    });
  });

  describe('updateEvent', () => {
    it('should update and return the event', async () => {
      const updatedEvent = { ...mockEvent, title: 'Updated Meeting' };
      mockSupabaseClient.setMockResponse(updatedEvent);

      const result = await calendarEventsDB.updateEvent('event-123', mockUserId, { title: 'Updated Meeting' });

      expect(result).toEqual(updatedEvent);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ title: 'Updated Meeting' });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'event-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Update error' });

      await expect(calendarEventsDB.updateEvent('event-123', mockUserId, { title: 'New' }))
        .rejects.toEqual({ message: 'Update error' });
    });
  });

  describe('deleteEvent', () => {
    it('should delete an event', async () => {
      mockSupabaseClient.setMockResponse(null);

      await calendarEventsDB.deleteEvent('event-123', mockUserId);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'event-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(calendarEventsDB.deleteEvent('event-123', mockUserId))
        .rejects.toEqual({ message: 'Delete error' });
    });
  });

  describe('getRecurringEvents', () => {
    it('should fetch recurring events for a user', async () => {
      const recurringEvent = { ...mockEvent, is_recurring: true };
      mockSupabaseClient.setMockResponse([recurringEvent]);

      const events = await calendarEventsDB.getRecurringEvents(mockUserId);

      expect(events).toEqual([recurringEvent]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_recurring', true);
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const events = await calendarEventsDB.getRecurringEvents(mockUserId);

      expect(events).toEqual([]);
    });
  });

  describe('getExceptions', () => {
    it('should fetch exception instances for a recurring event', async () => {
      const exception = { ...mockEvent, is_exception: true, recurring_event_id: 'parent-123' };
      mockSupabaseClient.setMockResponse([exception]);

      const events = await calendarEventsDB.getExceptions(mockUserId, 'parent-123');

      expect(events).toEqual([exception]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('calendar_events');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('recurring_event_id', 'parent-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_exception', true);
    });

    it('should return empty array when no exceptions', async () => {
      mockSupabaseClient.setMockResponse(null);

      const events = await calendarEventsDB.getExceptions(mockUserId, 'parent-123');

      expect(events).toEqual([]);
    });
  });
});
