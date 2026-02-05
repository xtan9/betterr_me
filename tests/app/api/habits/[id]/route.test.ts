import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/habits/[id]/route';
import { NextRequest } from 'next/server';

const { mockGetHabit, mockUpdateHabit, mockDeleteHabit, mockArchiveHabit } = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockUpdateHabit: vi.fn(),
  mockDeleteHabit: vi.fn(),
  mockArchiveHabit: vi.fn(),
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
    archiveHabit = mockArchiveHabit;
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
    mockUpdateHabit.mockResolvedValue(updated as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Evening Run' }),
    });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habit.name).toBe('Evening Run');
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

  it('should set paused_at when status changes to paused', async () => {
    const paused = { ...mockHabit, status: 'paused' };
    mockUpdateHabit.mockResolvedValue(paused as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
    });
    await PATCH(request, { params });

    expect(mockUpdateHabit).toHaveBeenCalledWith(
      'habit-1',
      'user-123',
      expect.objectContaining({ status: 'paused', paused_at: expect.any(String) })
    );
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
    mockDeleteHabit.mockResolvedValue();

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should archive when archive=true', async () => {
    const archived = { ...mockHabit, status: 'archived' };
    mockArchiveHabit.mockResolvedValue(archived as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1?archive=true', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.archived).toBe(true);
    expect(mockArchiveHabit).toHaveBeenCalledWith('habit-1', 'user-123');
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
