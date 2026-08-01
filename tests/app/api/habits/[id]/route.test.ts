import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/habits/[id]/route';
import { NextRequest } from 'next/server';

const {
  mockGetHabit,
  mockUpdateHabit,
  mockUpdateHabitMutation,
  mockToHabitResponse,
  mockDeleteHabit,
} = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockUpdateHabit: vi.fn(),
  mockUpdateHabitMutation: vi.fn(),
  mockToHabitResponse: vi.fn(),
  mockDeleteHabit: vi.fn(),
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
    updateHabit = mockUpdateHabit;
    deleteHabit = mockDeleteHabit;
  },
}));

vi.mock('@/lib/habits/writes', () => ({
  createHabitWrites: vi.fn(() => ({ update: mockUpdateHabitMutation })),
  toHabitResponse: mockToHabitResponse,
}));

import { createClient } from '@/lib/supabase/server';

const mockHabit = {
  id: 'habit-1',
  user_id: 'user-123',
  name: 'Morning Run',
  category_id: null,
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 12,
};

const params = Promise.resolve({ id: 'habit-1' });

describe('GET /api/habits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should return a habit by id', async () => {
    mockGetHabit.mockResolvedValue(mockHabit as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1');
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habit).toEqual(mockHabit);
    expect(mockGetHabit).toHaveBeenCalledWith('habit-1', 'user-123');
  });

  it('should return 404 if habit not found', async () => {
    mockGetHabit.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/habits/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(response.status).toBe(404);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1');
    const response = await GET(request, { params });

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/habits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should update habit name', async () => {
    const updated = { ...mockHabit, name: 'Evening Run' };
    const updatedDomainHabit = {
      id: 'habit-1',
      userId: 'user-123',
      name: 'Evening Run',
    };
    mockUpdateHabitMutation.mockResolvedValue({
      type: 'updated',
      habit: updatedDomainHabit,
    });
    mockToHabitResponse.mockReturnValue(updated);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Evening Run' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habit.name).toBe('Evening Run');
    expect(mockUpdateHabitMutation).toHaveBeenCalledWith({
      userId: 'user-123',
      habitId: 'habit-1',
      name: 'Evening Run',
    });
    expect(mockUpdateHabit).not.toHaveBeenCalled();
  });

  it('should return 400 for empty name', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: '' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid category', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ category: 'invalid' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid status', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('should return 400 for empty update body', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('does not route lifecycle status changes through the detail update', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    expect(mockUpdateHabitMutation).not.toHaveBeenCalled();
  });

  it('maps a domain not-found outcome without exposing ownership', async () => {
    mockUpdateHabitMutation.mockResolvedValue({ type: 'not-found' });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Private name' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Habit not found' });
  });

  it('maps a domain conflict outcome to the HTTP conflict presentation', async () => {
    mockUpdateHabitMutation.mockResolvedValue({ type: 'conflict' });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Evening Run' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Habit update conflict' });
  });

  it('does not infer a typed outcome from an unexpected error message', async () => {
    mockUpdateHabitMutation.mockRejectedValue(new Error('not found while updating'));

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Evening Run' }),
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to update habit' });
  });
});

describe('DELETE /api/habits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should hard delete a habit', async () => {
    mockDeleteHabit.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });

    expect(response.status).toBe(401);
  });
});
