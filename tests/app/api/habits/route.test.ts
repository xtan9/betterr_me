import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/habits/route';
import { NextRequest } from 'next/server';

const { mockGetUserHabits, mockGetHabitsWithTodayStatus, mockCreateHabit } = vi.hoisted(() => ({
  mockGetUserHabits: vi.fn(),
  mockGetHabitsWithTodayStatus: vi.fn(),
  mockCreateHabit: vi.fn(),
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
    getUserHabits = mockGetUserHabits;
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
    createHabit = mockCreateHabit;
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
};

describe('GET /api/habits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should return habits for authenticated user', async () => {
    mockGetUserHabits.mockResolvedValue([mockHabit] as any);

    const request = new NextRequest('http://localhost:3000/api/habits');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habits).toEqual([mockHabit]);
  });

  it('should filter by status', async () => {
    mockGetUserHabits.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/habits?status=paused');
    await GET(request);

    expect(mockGetUserHabits).toHaveBeenCalledWith('user-123', { status: 'paused' });
  });

  it('should filter by category', async () => {
    mockGetUserHabits.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/habits?category=health');
    await GET(request);

    expect(mockGetUserHabits).toHaveBeenCalledWith('user-123', { category: 'health' });
  });

  it('should use getHabitsWithTodayStatus when with_today=true', async () => {
    mockGetHabitsWithTodayStatus.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/habits?with_today=true');
    await GET(request);

    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith('user-123', undefined);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/habits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should create a new habit', async () => {
    mockCreateHabit.mockResolvedValue(mockHabit as any);

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Morning Run',
        frequency: { type: 'daily' },
        category: 'health',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.habit).toEqual(mockHabit);
  });

  it('should return 400 if name is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ frequency: { type: 'daily' } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if frequency is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('frequency');
  });

  it('should return 400 if frequency type is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', frequency: { type: 'monthly' } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if category is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'daily' },
        category: 'invalid',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should validate custom frequency has days array', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'custom' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should validate times_per_week frequency has valid count', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'times_per_week', count: 5 },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', frequency: { type: 'daily' } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
