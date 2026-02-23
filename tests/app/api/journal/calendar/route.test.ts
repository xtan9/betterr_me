import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/journal/calendar/route';
import { NextRequest } from 'next/server';

const mockJournalDB = {
  getCalendarMonth: vi.fn(),
};

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
  JournalEntriesDB: class {
    constructor() {
      return mockJournalDB;
    }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/journal/calendar', () => {
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

    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026&month=2');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('should return 400 when year is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal/calendar?month=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('year and month');
  });

  it('should return 400 when month is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid month 0', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026&month=0');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid year or month');
  });

  it('should return 400 for invalid month 13', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026&month=13');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('should return calendar data for valid year/month', async () => {
    const calendarData = [
      { entry_date: '2026-02-01', mood: 4, title: 'Day 1' },
      { entry_date: '2026-02-15', mood: 3, title: 'Day 15' },
    ];
    mockJournalDB.getCalendarMonth.mockResolvedValue(calendarData);

    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026&month=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual(calendarData);
    expect(mockJournalDB.getCalendarMonth).toHaveBeenCalledWith('user-123', 2026, 2);
  });

  it('should return empty array when no entries for month', async () => {
    mockJournalDB.getCalendarMonth.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/journal/calendar?year=2026&month=3');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([]);
  });
});
