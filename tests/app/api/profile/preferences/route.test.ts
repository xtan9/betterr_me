import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/profile/preferences/route';
import { NextRequest } from 'next/server';
import { statsCache, getStatsCacheKey } from '@/lib/cache';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

const mockProfilesDB = {
  updatePreferences: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    constructor() { return mockProfilesDB; }
  },
}));

describe('PATCH /api/profile/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statsCache.clear();
  });

  it('should update preferences', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: {
        theme: 'dark',
        date_format: 'MM/DD/YYYY',
        week_start_day: 1,
      },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(updatedProfile);
    expect(mockProfilesDB.updatePreferences).toHaveBeenCalledWith('user-123', {
      theme: 'dark',
    });
  });

  it('should validate theme', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'invalid' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should validate week_start_day', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: 10 }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if no valid updates', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if body is not an object', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify('invalid'),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should invalidate all user stats cache when week_start_day changes', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: { week_start_day: 1 },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    // Pre-populate cache with multiple habits for this user
    statsCache.set(getStatsCacheKey('habit-1', 'user-123'), {
      habitId: 'habit-1',
      currentStreak: 5,
      bestStreak: 10,
      thisWeek: { completed: 3, total: 7, percent: 43 },
      thisMonth: { completed: 15, total: 30, percent: 50 },
      allTime: { completed: 100, total: 200, percent: 50 },
    });
    statsCache.set(getStatsCacheKey('habit-2', 'user-123'), {
      habitId: 'habit-2',
      currentStreak: 2,
      bestStreak: 5,
      thisWeek: { completed: 1, total: 3, percent: 33 },
      thisMonth: { completed: 8, total: 20, percent: 40 },
      allTime: { completed: 50, total: 100, percent: 50 },
    });

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: 1 }),
    });
    await PATCH(request);

    expect(statsCache.has(getStatsCacheKey('habit-1', 'user-123'))).toBe(false);
    expect(statsCache.has(getStatsCacheKey('habit-2', 'user-123'))).toBe(false);
  });

  it('should not invalidate stats cache when only theme changes', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: { theme: 'dark' },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    // Pre-populate cache
    statsCache.set(getStatsCacheKey('habit-1', 'user-123'), {
      habitId: 'habit-1',
      currentStreak: 5,
      bestStreak: 10,
      thisWeek: { completed: 3, total: 7, percent: 43 },
      thisMonth: { completed: 15, total: 30, percent: 50 },
      allTime: { completed: 100, total: 200, percent: 50 },
    });

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });
    await PATCH(request);

    expect(statsCache.has(getStatsCacheKey('habit-1', 'user-123'))).toBe(true);
  });
});
