import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/calendar-events/route';
import { NextRequest } from 'next/server';

const { mockGetUserEvents, mockCreateEvent } = vi.hoisted(() => ({
  mockGetUserEvents: vi.fn(),
  mockCreateEvent: vi.fn(),
}));

const { mockExpandEventsForRange } = vi.hoisted(() => ({
  mockExpandEventsForRange: vi.fn(),
}));

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
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
    getUserEvents = mockGetUserEvents;
  },
}));

vi.mock('@/lib/scheduling/lifecycle', () => ({
  SchedulingLifecycle: class {
    create = mockCreateEvent;
  },
}));
vi.mock('@/lib/calendar/recurrence', () => ({
  expandEventsForRange: mockExpandEventsForRange,
}));

vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: mockEnsureProfile,
}));

import { createClient } from '@/lib/supabase/server';

const mockEvent = {
  id: 'evt-1',
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

describe('GET /api/calendar-events', () => {
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

  it('should return 401 when user is not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/calendar-events?start_date=2026-04-01&end_date=2026-04-30'
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 400 when start_date is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/calendar-events?end_date=2026-04-30'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('start_date');
  });

  it('should return 400 when end_date is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/calendar-events?start_date=2026-04-01'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('end_date');
  });

  it('should return expanded events for valid date range', async () => {
    const rawEvents = [mockEvent];
    const expandedEvents = [{ ...mockEvent, is_virtual: false }];
    mockGetUserEvents.mockResolvedValue(rawEvents);
    mockExpandEventsForRange.mockReturnValue(expandedEvents);

    const request = new NextRequest(
      'http://localhost:3000/api/calendar-events?start_date=2026-04-01&end_date=2026-04-30'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toEqual(expandedEvents);
    expect(mockGetUserEvents).toHaveBeenCalledWith('user-123', '2026-04-01', '2026-04-30');
    expect(mockExpandEventsForRange).toHaveBeenCalledWith(rawEvents, '2026-04-01', '2026-04-30');
  });

  it('should return 500 on DB error', async () => {
    mockGetUserEvents.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest(
      'http://localhost:3000/api/calendar-events?start_date=2026-04-01&end_date=2026-04-30'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch calendar events');
  });
});

describe('POST /api/calendar-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
  });

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        start_date: '2026-04-01',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 400 for invalid body (missing title)', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        start_date: '2026-04-01',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should return 400 for invalid body (end_date before start_date)', async () => {
    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Event',
        start_date: '2026-04-10',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should create event with valid payload', async () => {
    mockCreateEvent.mockResolvedValue({ event: mockEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Event',
        start_date: '2026-04-01',
        start_time: '10:00:00',
        end_date: '2026-04-01',
        end_time: '11:00:00',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.event).toEqual(mockEvent);
    expect(mockCreateEvent).toHaveBeenCalledWith('user-123', {
      event: expect.objectContaining({
        title: 'Test Event',
        start_date: '2026-04-01',
        start_time: '10:00:00',
        end_date: '2026-04-01',
        end_time: '11:00:00',
      }),
      reminders: [],
    });
  });

  it('should create all-day event (no start_time/end_time)', async () => {
    const allDayEvent = { ...mockEvent, start_time: null, end_time: null };
    mockCreateEvent.mockResolvedValue({ event: allDayEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'All Day Event',
        start_date: '2026-04-01',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.event.start_time).toBeNull();
    expect(data.event.end_time).toBeNull();
    expect(mockCreateEvent).toHaveBeenCalledWith('user-123', {
      event: expect.objectContaining({
        start_time: null,
        end_time: null,
      }),
      reminders: [],
    });
  });

  it('should create event with recurrence fields', async () => {
    const recurrenceRule = { frequency: 'weekly' as const, interval: 1, days_of_week: [1, 3, 5] };
    const recurringEvent = {
      ...mockEvent,
      is_recurring: true,
      recurrence_rule: recurrenceRule,
      end_type: 'never',
    };
    mockCreateEvent.mockResolvedValue({ event: recurringEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Weekly Meeting',
        start_date: '2026-04-01',
        start_time: '09:00:00',
        end_date: '2026-04-01',
        end_time: '10:00:00',
        is_recurring: true,
        recurrence_rule: recurrenceRule,
        end_type: 'never',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.event.is_recurring).toBe(true);
    expect(mockCreateEvent).toHaveBeenCalledWith('user-123', {
      event: expect.objectContaining({
        is_recurring: true,
        recurrence_rule: recurrenceRule,
        end_type: 'never',
      }),
      reminders: [],
    });
  });

  it('should create exception record with recurring_event_id', async () => {
    const exceptionEvent = {
      ...mockEvent,
      is_exception: true,
      recurring_event_id: '550e8400-e29b-41d4-a716-446655440099',
      original_date: '2026-04-08',
    };
    mockCreateEvent.mockResolvedValue({ event: exceptionEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Modified Occurrence',
        start_date: '2026-04-08',
        start_time: '14:00:00',
        end_date: '2026-04-08',
        end_time: '15:00:00',
        recurring_event_id: '550e8400-e29b-41d4-a716-446655440099',
        original_date: '2026-04-08',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.event.is_exception).toBe(true);
    expect(mockCreateEvent).toHaveBeenCalledWith('user-123', {
      event: expect.objectContaining({
        is_exception: true,
        recurring_event_id: '550e8400-e29b-41d4-a716-446655440099',
        original_date: '2026-04-08',
      }),
      reminders: [],
    });
  });

  it('should return 500 on DB error', async () => {
    mockCreateEvent.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Event',
        start_date: '2026-04-01',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create calendar event');
  });

  it('should call ensureProfile before creating event', async () => {
    mockCreateEvent.mockResolvedValue({ event: mockEvent, reminders: [] });

    const request = new NextRequest('http://localhost:3000/api/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Event',
        start_date: '2026-04-01',
        end_date: '2026-04-01',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });
});
