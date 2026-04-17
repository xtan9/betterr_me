import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/calendar-events/[id]/route';
import { NextRequest } from 'next/server';

const { mockGetEvent, mockUpdateEvent, mockDeleteEvent, mockGetRemindersBySource, mockUpdateReminder } = vi.hoisted(() => ({
  mockGetEvent: vi.fn(),
  mockUpdateEvent: vi.fn(),
  mockDeleteEvent: vi.fn(),
  mockGetRemindersBySource: vi.fn(),
  mockUpdateReminder: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  CalendarEventsDB: class {
    getEvent = mockGetEvent;
    updateEvent = mockUpdateEvent;
    deleteEvent = mockDeleteEvent;
  },
  RemindersDB: class {
    getRemindersBySource = mockGetRemindersBySource;
    updateReminder = mockUpdateReminder;
  },
}));

import { createClient } from '@/lib/supabase/server';

const mockEvent = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  user_id: 'user-123',
  title: 'Test Event',
  description: null,
  start_date: '2026-04-01',
  start_time: '10:00:00',
  end_date: '2026-04-01',
  end_time: '11:00:00',
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
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const params = Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440001' });

describe('GET /api/calendar-events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
  });

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001');
    const response = await GET(request, { params });

    expect(response.status).toBe(401);
  });

  it('should return event for valid ID', async () => {
    mockGetEvent.mockResolvedValue(mockEvent);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event).toEqual(mockEvent);
    expect(mockGetEvent).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', 'user-123');
  });

  it('should return 404 when event not found', async () => {
    mockGetEvent.mockResolvedValue(null);

    const notFoundId = '550e8400-e29b-41d4-a716-446655440099';
    const request = new NextRequest(`http://localhost:3000/api/calendar-events/${notFoundId}`);
    const response = await GET(request, {
      params: Promise.resolve({ id: notFoundId }),
    });

    expect(response.status).toBe(404);
  });

  it('should return 500 on DB error', async () => {
    mockGetEvent.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch calendar event');
  });
});

describe('PATCH /api/calendar-events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
  });

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(401);
  });

  it('should return 400 for empty update body', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('should update event with valid payload', async () => {
    const updatedEvent = { ...mockEvent, title: 'Updated Title' };
    mockUpdateEvent.mockResolvedValue(updatedEvent);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event.title).toBe('Updated Title');
    expect(mockUpdateEvent).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', 'user-123', { title: 'Updated Title' });
  });

  it('should update recurring event parent (edit all occurrences)', async () => {
    const recurrenceRule = { frequency: 'daily' as const, interval: 2 };
    const updatedEvent = {
      ...mockEvent,
      is_recurring: true,
      recurrence_rule: recurrenceRule,
    };
    mockUpdateEvent.mockResolvedValue(updatedEvent);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({
        recurrence_rule: recurrenceRule,
      }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event.recurrence_rule).toEqual(recurrenceRule);
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'user-123',
      expect.objectContaining({ recurrence_rule: recurrenceRule })
    );
  });

  it('should return 404 when event not found', async () => {
    mockUpdateEvent.mockRejectedValue({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
  });

  it('should return 500 on DB error', async () => {
    mockUpdateEvent.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to update calendar event');
  });
});

describe('DELETE /api/calendar-events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
  });

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });

    expect(response.status).toBe(401);
  });

  it('should delete event successfully', async () => {
    mockDeleteEvent.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDeleteEvent).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', 'user-123');
  });

  it('should return 500 on DB error', async () => {
    mockDeleteEvent.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to delete calendar event');
  });
});

describe('Invalid UUID handling', () => {
  const invalidParams = Promise.resolve({ id: 'not-a-uuid' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET should return 400 for invalid UUID format', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/not-a-uuid');
    const response = await GET(request, { params: invalidParams });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid event ID format');
  });

  it('PATCH should return 400 for invalid UUID format', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/not-a-uuid', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params: invalidParams });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid event ID format');
  });

  it('DELETE should return 400 for invalid UUID format', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/not-a-uuid', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: invalidParams });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid event ID format');
  });
});

describe('PATCH /api/calendar-events/[id] — field mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
    mockUpdateEvent.mockResolvedValue(mockEvent);
    mockGetRemindersBySource.mockResolvedValue([]);
  });

  it('passes through all optional fields when provided', async () => {
    const payload = {
      description: 'new desc',
      end_date: '2026-04-02',
      end_time: '12:00:00',
      location: 'Office',
      color: '#ff0000',
      category_id: '550e8400-e29b-41d4-a716-446655440abc',
      is_recurring: true,
      recurrence_rule: { frequency: 'daily' as const, interval: 1 },
      end_type: 'after_count' as const,
      end_date_recurrence: '2026-12-31',
      end_count: 10,
    };

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'user-123',
      expect.objectContaining(payload)
    );
    // start_date/start_time not provided → no reminder recomputation
    expect(mockGetRemindersBySource).not.toHaveBeenCalled();
  });

  it('trims whitespace from title', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: '  Padded  ' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'user-123',
      { title: 'Padded' }
    );
  });
});

describe('PATCH /api/calendar-events/[id] — reminder recomputation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
  });

  it('recomputes fire_at for pending relative reminders when start_date changes', async () => {
    const rescheduled = { ...mockEvent, start_date: '2026-05-10', start_time: '09:00:00' };
    mockUpdateEvent.mockResolvedValue(rescheduled);
    mockGetRemindersBySource.mockResolvedValue([
      {
        id: 'rem-1',
        status: 'pending',
        reminder_type: 'relative',
        relative_minutes: 15,
        absolute_time: null,
      },
      // Should skip — not pending
      {
        id: 'rem-2',
        status: 'sent',
        reminder_type: 'relative',
        relative_minutes: 30,
        absolute_time: null,
      },
      // Should skip — absolute reminder
      {
        id: 'rem-3',
        status: 'pending',
        reminder_type: 'absolute',
        relative_minutes: null,
        absolute_time: '2026-05-10T08:00:00',
      },
      // Should skip — relative_minutes null
      {
        id: 'rem-4',
        status: 'pending',
        reminder_type: 'relative',
        relative_minutes: null,
        absolute_time: null,
      },
    ]);
    mockUpdateReminder.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ start_date: '2026-05-10' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockGetRemindersBySource).toHaveBeenCalledWith(
      'user-123',
      'calendar_event',
      '550e8400-e29b-41d4-a716-446655440001'
    );
    // Only rem-1 qualifies
    expect(mockUpdateReminder).toHaveBeenCalledTimes(1);
    expect(mockUpdateReminder).toHaveBeenCalledWith(
      'user-123',
      'rem-1',
      expect.objectContaining({ fire_at: expect.any(String) })
    );
  });

  it('recomputes using default start_time when event has no start_time', async () => {
    const rescheduled = { ...mockEvent, start_date: '2026-05-10', start_time: null };
    mockUpdateEvent.mockResolvedValue(rescheduled);
    mockGetRemindersBySource.mockResolvedValue([
      {
        id: 'rem-1',
        status: 'pending',
        reminder_type: 'relative',
        relative_minutes: 10,
        absolute_time: null,
      },
    ]);
    mockUpdateReminder.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ start_time: '08:00:00' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateReminder).toHaveBeenCalledTimes(1);
  });

  it('still returns 200 when reminder recomputation throws', async () => {
    const rescheduled = { ...mockEvent, start_date: '2026-05-10' };
    mockUpdateEvent.mockResolvedValue(rescheduled);
    mockGetRemindersBySource.mockRejectedValue(new Error('reminder lookup failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ start_date: '2026-05-10' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event).toEqual(rescheduled);
  });
});
