import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/habits/[id]/stats/route';
import { NextRequest } from 'next/server';

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
});
