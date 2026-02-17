import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetLogsByDateRange } = vi.hoisted(() => ({
  mockGetLogsByDateRange: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  HabitLogsDB: class {
    getLogsByDateRange = mockGetLogsByDateRange;
  },
}));

vi.mock('@/lib/utils', () => ({
  getLocalDateString: vi.fn(() => '2026-02-16'),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { GET } from '@/app/api/habits/[id]/logs/route';
import { createClient } from '@/lib/supabase/server';

const params = Promise.resolve({ id: 'habit-1' });

describe('GET /api/habits/[id]/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  describe('authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Covers both no-session and expired-session (both result in user: null from getUser())
      vi.mocked(createClient).mockReturnValue({
        auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('days parameter validation', () => {
    it('should return 400 for days=0', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=0');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Days must be between 1 and 365');
    });

    it('should return 400 for days=-1', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=-1');
      const response = await GET(request, { params });

      expect(response.status).toBe(400);
    });

    it('should return 400 for days=366', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=366');
      const response = await GET(request, { params });

      expect(response.status).toBe(400);
    });

    it('should return 400 for non-numeric days', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=abc');
      const response = await GET(request, { params });

      expect(response.status).toBe(400);
    });

    it('should accept days=1 (lower boundary)', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=1');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
    });

    it('should accept days=365 (upper boundary)', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=365');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
    });
  });

  describe('date format validation', () => {
    it('should return 400 for invalid start_date format', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=not-a-date');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid date format');
    });

    it('should return 400 for invalid end_date format', async () => {
      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01&end_date=not-a-date');
      const response = await GET(request, { params });

      expect(response.status).toBe(400);
    });

    it('should accept semantically invalid but regex-valid date (2026-13-45)', async () => {
      // Route only validates format via regex, not semantic validity
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-13-45');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
    });
  });

  describe('successful responses', () => {
    it('should return logs with correct response shape', async () => {
      const mockLogs = [
        { id: 'log-1', habit_id: 'habit-1', date: '2026-01-15', completed: true },
        { id: 'log-2', habit_id: 'habit-1', date: '2026-01-20', completed: true },
      ];
      mockGetLogsByDateRange.mockResolvedValue(mockLogs);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01&end_date=2026-01-31');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        logs: mockLogs,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        count: 2,
      });
    });

    it('should use default 30 days when no params provided', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(mockGetLogsByDateRange).toHaveBeenCalled();
    });

    it('should use days param to compute start date', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?days=7');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(mockGetLogsByDateRange).toHaveBeenCalledWith(
        'habit-1',
        'user-123',
        expect.any(String),
        expect.any(String)
      );
    });

    it('should use start_date and end_date when both provided', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01&end_date=2026-01-15');
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      expect(mockGetLogsByDateRange).toHaveBeenCalledWith(
        'habit-1',
        'user-123',
        '2026-01-01',
        '2026-01-15'
      );
    });

    it('should return empty logs array when no logs exist', async () => {
      mockGetLogsByDateRange.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01&end_date=2026-01-31');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.logs).toEqual([]);
      expect(data.count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database throws', async () => {
      mockGetLogsByDateRange.mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01');
      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch logs');
    });
  });
});
