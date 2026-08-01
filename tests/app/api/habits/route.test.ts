import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/habits/route';
import { NextRequest } from 'next/server';

const {
  mockGetUserHabits,
  mockGetHabitsWithTodayStatus,
  mockCreateHabitMutation,
  mockToHabitResponse,
} = vi.hoisted(() => ({
  mockGetUserHabits: vi.fn(),
  mockGetHabitsWithTodayStatus: vi.fn(),
  mockCreateHabitMutation: vi.fn(),
  mockToHabitResponse: vi.fn((habit) => ({
    id: habit.id,
    user_id: habit.userId,
    name: habit.name,
    description: habit.description,
    category_id: habit.categoryId,
    frequency: habit.frequency,
    status: habit.status,
    current_streak: habit.currentStreak,
    best_streak: habit.bestStreak,
    paused_at: habit.pausedAt,
    graduated_at: habit.graduatedAt,
    graduated_streak: habit.graduatedStreak,
    nudge_dismissed_at: habit.nudgeDismissedAt,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  })),
}));

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    getUserHabits = mockGetUserHabits;
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
  },
}));

vi.mock('@/lib/habits/writes', () => ({
  createHabitWrites: vi.fn(() => ({ create: mockCreateHabitMutation })),
  toHabitResponse: mockToHabitResponse,
}));

vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock('@/lib/constants', () => ({
  MAX_HABITS_PER_USER: 20,
}));

import { createClient } from '@/lib/supabase/server';

const mockHabit = {
  id: 'habit-1',
  user_id: 'user-123',
  name: 'Morning Run',
  description: null,
  category_id: null,
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 12,
  paused_at: null,
  graduated_at: null,
  graduated_streak: null,
  nudge_dismissed_at: null,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
};

const mockCreatedHabit = {
  id: 'habit-1',
  userId: 'user-123',
  name: 'Morning Run',
  description: null,
  categoryId: null,
  frequency: { type: 'daily' },
  status: 'active',
  currentStreak: 5,
  bestStreak: 12,
  pausedAt: null,
  graduatedAt: null,
  graduatedStreak: null,
  nudgeDismissedAt: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

describe('GET /api/habits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })) },
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

  it('should filter by category_id', async () => {
    mockGetUserHabits.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/habits?category_id=cat-123');
    await GET(request);

    expect(mockGetUserHabits).toHaveBeenCalledWith('user-123', { category_id: 'cat-123' });
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
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })) },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
    mockCreateHabitMutation.mockResolvedValue({
      type: 'created',
      habit: mockCreatedHabit,
    });
    mockToHabitResponse.mockReturnValue(mockHabit);
  });

  it('should create a new habit', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Morning Run',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.habit).toEqual(mockHabit);
  });

  it('creates through HabitWrites and preserves the HTTP habit response contract', async () => {
    const createdHabit = {
      id: 'habit-1',
      userId: 'user-123',
      name: 'Morning Run',
      description: null,
      categoryId: null,
      frequency: { type: 'daily' },
      status: 'active',
      currentStreak: 0,
      bestStreak: 0,
      pausedAt: null,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    const presentedHabit = {
      id: 'habit-1',
      user_id: 'user-123',
      name: 'Morning Run',
      description: null,
      category_id: null,
      frequency: { type: 'daily' },
      status: 'active',
      current_streak: 0,
      best_streak: 0,
      paused_at: null,
      graduated_at: null,
      graduated_streak: null,
      nudge_dismissed_at: null,
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    };
    mockCreateHabitMutation.mockResolvedValue({ type: 'created', habit: createdHabit });
    mockToHabitResponse.mockReturnValue(presentedHabit);

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Morning Run  ',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ habit: presentedHabit });
    expect(mockCreateHabitMutation).toHaveBeenCalledWith({
      userId: 'user-123',
      name: 'Morning Run',
      description: null,
      categoryId: null,
      frequency: { type: 'daily' },
    });
    expect(mockToHabitResponse).toHaveBeenCalledWith(createdHabit);
    expect(mockCreateHabitMutation).toHaveBeenCalledTimes(1);
  });

  it('should return 400 if name is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ frequency: { type: 'daily' } }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should return 400 if frequency is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should return 400 if frequency type is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', frequency: { type: 'monthly' } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if category_id is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'daily' },
        category_id: 'invalid',
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

  it('should return 500 when database throws', async () => {
    mockCreateHabitMutation.mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create habit');
  });

  it('should create habit with description', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Morning Run',
        description: 'My description',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockCreateHabitMutation).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'My description' }),
    );
  });

  it('should create habit without category_id (null)', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Meditate',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockCreateHabitMutation).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
    );
  });

  it('should create habit with valid custom frequency', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Yoga',
        frequency: { type: 'custom', days: [1, 3, 5] },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should create habit with valid times_per_week frequency', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Gym',
        frequency: { type: 'times_per_week', count: 2 },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('should trim whitespace from name', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Morning Run  ',
        frequency: { type: 'daily' },
      }),
    });

    await POST(request);
    expect(mockCreateHabitMutation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Morning Run' }),
    );
  });

  it('should call ensureProfile before creating habit', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });

  it('should return 500 when ensureProfile throws', async () => {
    mockEnsureProfile.mockRejectedValue(new Error('Profile creation failed'));

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create habit');
  });

  it('should return 400 for whitespace-only name', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: '   ',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 when habit limit reached', async () => {
    mockCreateHabitMutation.mockResolvedValue({
      type: 'limit-reached',
      activeCount: 20,
      limit: 20,
    });

    const request = new NextRequest('http://localhost:3000/api/habits', {
      method: 'POST',
      body: JSON.stringify({
        name: 'One too many',
        frequency: { type: 'daily' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});
