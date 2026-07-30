import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/calendar-events/[id]/route';
import { NextRequest } from 'next/server';

const { mockGetEvent, mockDeleteEvent, mockUpdateSchedule } = vi.hoisted(() => ({
  mockGetEvent: vi.fn(),
  mockDeleteEvent: vi.fn(),
  mockUpdateSchedule: vi.fn(),
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
    deleteEvent = mockDeleteEvent;
  },
}));

vi.mock('@/lib/scheduling/create', () => ({
  SchedulingLifecycle: class {
    update = mockUpdateSchedule;
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
    mockUpdateSchedule.mockResolvedValue({ event: updatedEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event.title).toBe('Updated Title');
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: { title: 'Updated Title' } },
    );
  });

  it('reconciles changed reminder intent in the event update lifecycle', async () => {
    const reminders = [{
      reminder_type: 'relative',
      relative_minutes: 30,
      absolute_time: null,
      channels: ['push'],
    }];
    mockUpdateSchedule.mockResolvedValue({ event: mockEvent, reminders });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated', reminders }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reminders).toEqual(reminders);
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: { title: 'Updated' }, reminders },
    );
  });

  it('normalizes omitted reminder fields in a reminder-only update', async () => {
    const reminders = [
      {
        reminder_type: 'relative',
        relative_minutes: 30,
        channels: ['push'],
      },
      {
        reminder_type: 'absolute',
        absolute_time: '2026-05-10T08:45:00Z',
        channels: ['email'],
      },
    ];
    mockUpdateSchedule.mockResolvedValue({ event: mockEvent, reminders });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ reminders }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      {
        event: {},
        reminders: [
          {
            reminder_type: 'relative',
            relative_minutes: 30,
            absolute_time: null,
            channels: ['push'],
          },
          {
            reminder_type: 'absolute',
            relative_minutes: null,
            absolute_time: '2026-05-10T08:45:00Z',
            channels: ['email'],
          },
        ],
      },
    );
  });

  it.each([
    {
      name: 'a relative reminder without relative_minutes',
      reminder: { reminder_type: 'relative', channels: ['push'] },
    },
    {
      name: 'an absolute reminder without absolute_time',
      reminder: { reminder_type: 'absolute', channels: ['push'] },
    },
    {
      name: 'an absolute reminder with malformed absolute_time',
      reminder: {
        reminder_type: 'absolute',
        absolute_time: 'tomorrow morning',
        channels: ['push'],
      },
    },
    {
      name: 'a reminder without a delivery channel',
      reminder: {
        reminder_type: 'relative',
        relative_minutes: 15,
        channels: [],
      },
    },
  ])('returns 400 for $name', async ({ reminder }) => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ reminders: [reminder] }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    expect(mockUpdateSchedule).not.toHaveBeenCalled();
  });

  it('removes reminder intent when the event update supplies an empty list', async () => {
    mockUpdateSchedule.mockResolvedValue({ event: mockEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Keep event', reminders: [] }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: { title: 'Keep event' }, reminders: [] },
    );
  });

  it('accepts a reminder-only removal request', async () => {
    mockUpdateSchedule.mockResolvedValue({ event: mockEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ reminders: [] }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: {}, reminders: [] },
    );
  });

  it('should update recurring event parent (edit all occurrences)', async () => {
    const recurrenceRule = { frequency: 'daily' as const, interval: 2 };
    const updatedEvent = {
      ...mockEvent,
      is_recurring: true,
      recurrence_rule: recurrenceRule,
    };
    mockUpdateSchedule.mockResolvedValue({ event: updatedEvent, reminders: [] });

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
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: expect.objectContaining({ recurrence_rule: recurrenceRule }) },
    );
  });

  it('should return 404 when event not found', async () => {
    mockUpdateSchedule.mockRejectedValue({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
  });

  it('returns the exact not-found response for the update RPC no-data SQLSTATE', async () => {
    mockUpdateSchedule.mockRejectedValue({
      code: 'P0002',
      message: 'no_data_found',
    });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Calendar event not found',
    });
  });

  it('should return 500 on DB error', async () => {
    mockUpdateSchedule.mockRejectedValue(new Error('DB connection failed'));

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
    mockUpdateSchedule.mockResolvedValue({ event: mockEvent, reminders: [] });
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
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: expect.objectContaining(payload) },
    );
  });

  it('trims whitespace from title', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ title: '  Padded  ' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: { title: 'Padded' } },
    );
  });
});

describe('PATCH /api/calendar-events/[id] — atomic reminder reconciliation', () => {
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

  it('moves the event through the lifecycle that returns reconciled reminders', async () => {
    const rescheduled = { ...mockEvent, start_date: '2026-05-10', start_time: '09:00:00' };
    const reconciledReminder = {
      id: 'rem-1',
      status: 'pending',
      reminder_type: 'relative',
      relative_minutes: 15,
      fire_at: '2026-05-10T08:45:00Z',
    };
    mockUpdateSchedule.mockResolvedValue({
      event: rescheduled,
      reminders: [reconciledReminder],
    });

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ start_date: '2026-05-10' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(mockUpdateSchedule).toHaveBeenCalledWith(
      'user-123',
      '550e8400-e29b-41d4-a716-446655440001',
      { event: { start_date: '2026-05-10' } },
    );
    expect(data.reminders).toEqual([reconciledReminder]);
  });

  it('fails the event update when reminder reconciliation fails', async () => {
    mockUpdateSchedule.mockRejectedValue(new Error('reminder reconciliation failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events/550e8400-e29b-41d4-a716-446655440001', {
      method: 'PATCH',
      body: JSON.stringify({ start_date: '2026-05-10' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to update calendar event');
  });
});
