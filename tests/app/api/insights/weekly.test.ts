import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/insights/weekly/route';

const mockGetWeeklyInsights = vi.fn();
const mockGetProfile = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    constructor() { return { getProfile: mockGetProfile }; }
  },
}));

vi.mock('@/lib/db/insights', () => ({
  InsightsDB: class {
    constructor() { return { getWeeklyInsights: mockGetWeeklyInsights }; }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/insights/weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('returns insights for authenticated user', async () => {
    const mockInsights = [
      {
        type: 'best_habit',
        message: 'bestHabit',
        params: { habit: 'Meditate', percent: 100 },
        priority: 80,
      },
    ];
    mockGetProfile.mockResolvedValue({
      id: 'user-123',
      preferences: { week_start_day: 1 },
    });
    mockGetWeeklyInsights.mockResolvedValue(mockInsights);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.insights).toEqual(mockInsights);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith('user-123', 1);
  });

  it('returns 401 for unauthenticated user', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('defaults to Monday when profile has no week_start_day', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetWeeklyInsights.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith('user-123', 1);
  });

  it('returns 500 on internal error', async () => {
    mockGetProfile.mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch weekly insights');
  });
});
