import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/habits/[id]/stats/route';
import { NextRequest } from 'next/server';
import { statsCache } from '@/lib/cache';

const { mockGetHabit, mockGetDetailedHabitStats, mockGetProfile } = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockGetDetailedHabitStats: vi.fn(),
  mockGetProfile: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    getHabit = mockGetHabit;
  },
  HabitLogsDB: class {
    getDetailedHabitStats = mockGetDetailedHabitStats;
  },
  ProfilesDB: class {
    getProfile = mockGetProfile;
  },
}));

import { createClient } from '@/lib/supabase/server';

const mockHabit = {
  id: 'habit-1',
  user_id: 'user-123',
  name: 'Morning Run',
  category: 'health',
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 12,
  created_at: '2026-01-01T00:00:00Z',
};

const mockDetailedStats = {
  thisWeek: { completed: 3, total: 5, percent: 60 },
  thisMonth: { completed: 10, total: 15, percent: 67 },
  allTime: { completed: 25, total: 35, percent: 71 },
};

const params = Promise.resolve({ id: 'habit-1' });

describe('GET /api/habits/[id]/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statsCache.clear(); // Clear cache between tests
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
    // Default profile with Sunday week start
    mockGetProfile.mockResolvedValue({
      id: 'user-123',
      preferences: { week_start_day: 0 },
    });
  });

  it('should return detailed stats for a habit', async () => {
    mockGetHabit.mockResolvedValue(mockHabit as any);
    mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      habitId: 'habit-1',
      currentStreak: 5,
      bestStreak: 12,
      thisWeek: { completed: 3, total: 5, percent: 60 },
      thisMonth: { completed: 10, total: 15, percent: 67 },
      allTime: { completed: 25, total: 35, percent: 71 },
    });
    expect(mockGetHabit).toHaveBeenCalledWith('habit-1', 'user-123');
    expect(mockGetDetailedHabitStats).toHaveBeenCalledWith(
      'habit-1',
      'user-123',
      { type: 'daily' },
      '2026-01-01T00:00:00Z',
      0 // Sunday week start
    );
  });

  it('should use Monday week start from user preferences', async () => {
    mockGetProfile.mockResolvedValue({
      id: 'user-123',
      preferences: { week_start_day: 1 },
    });
    mockGetHabit.mockResolvedValue(mockHabit as any);
    mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(mockGetDetailedHabitStats).toHaveBeenCalledWith(
      'habit-1',
      'user-123',
      { type: 'daily' },
      '2026-01-01T00:00:00Z',
      1 // Monday week start
    );
  });

  it('should default to Sunday if profile has no preferences', async () => {
    mockGetProfile.mockResolvedValue({
      id: 'user-123',
      preferences: null,
    });
    mockGetHabit.mockResolvedValue(mockHabit as any);
    mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(mockGetDetailedHabitStats).toHaveBeenCalledWith(
      'habit-1',
      'user-123',
      { type: 'daily' },
      '2026-01-01T00:00:00Z',
      0 // Default to Sunday
    );
  });

  it('should return 404 if habit not found', async () => {
    mockGetHabit.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/habits/nonexistent/stats');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Habit not found');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
    const response = await GET(request, { params });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 500 on internal error', async () => {
    mockGetHabit.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch stats');
  });

  describe('caching', () => {
    it('should include Cache-Control headers with MISS on first request', async () => {
      mockGetHabit.mockResolvedValue(mockHabit as any);
      mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

      const request = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
      const response = await GET(request, { params });

      expect(response.headers.get('Cache-Control')).toBe('private, max-age=300');
      expect(response.headers.get('X-Cache')).toBe('MISS');
    });

    it('should return cached response with HIT on subsequent requests', async () => {
      mockGetHabit.mockResolvedValue(mockHabit as any);
      mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

      // First request - should be a cache miss
      const request1 = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
      const response1 = await GET(request1, { params });
      expect(response1.headers.get('X-Cache')).toBe('MISS');

      // Second request - should be a cache hit
      const request2 = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
      const response2 = await GET(request2, { params });
      expect(response2.headers.get('X-Cache')).toBe('HIT');

      // Should not call the DB again for the second request
      expect(mockGetHabit).toHaveBeenCalledTimes(1);
      expect(mockGetDetailedHabitStats).toHaveBeenCalledTimes(1);
    });

    it('should return same data from cache', async () => {
      mockGetHabit.mockResolvedValue(mockHabit as any);
      mockGetDetailedHabitStats.mockResolvedValue(mockDetailedStats);

      const request1 = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
      const response1 = await GET(request1, { params });
      const data1 = await response1.json();

      const request2 = new NextRequest('http://localhost:3000/api/habits/habit-1/stats');
      const response2 = await GET(request2, { params });
      const data2 = await response2.json();

      expect(data1).toEqual(data2);
    });
  });
});
