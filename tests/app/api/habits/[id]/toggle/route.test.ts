import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/habits/[id]/toggle/route';
import { NextRequest } from 'next/server';

const { mockToggleLog, mockRecordMilestone } = vi.hoisted(() => ({
  mockToggleLog: vi.fn(),
  mockRecordMilestone: vi.fn(),
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
    toggleLog = mockToggleLog;
  },
  HabitMilestonesDB: class {
    recordMilestone = mockRecordMilestone;
  },
}));

import { createClient } from '@/lib/supabase/server';

const params = Promise.resolve({ id: 'habit-1' });

describe('POST /api/habits/[id]/toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should toggle habit completion', async () => {
    mockToggleLog.mockResolvedValue({
      log: {
        id: 'log-1',
        habit_id: 'habit-1',
        user_id: 'user-123',
        logged_date: '2026-02-03',
        completed: true,
        created_at: '2026-02-03T10:00:00Z',
        updated_at: '2026-02-03T10:00:00Z',
      },
      currentStreak: 6,
      bestStreak: 12,
    });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.completed).toBe(true);
    expect(data.currentStreak).toBe(6);
    expect(data.bestStreak).toBe(12);
  });

  it('should use provided date', async () => {
    mockToggleLog.mockResolvedValue({
      log: { completed: true } as any,
      currentStreak: 1,
      bestStreak: 1,
    });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-02-01' }),
    });
    await POST(request, { params });

    expect(mockToggleLog).toHaveBeenCalledWith('habit-1', 'user-123', '2026-02-01');
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({ date: 'not-a-date' }),
    });
    const response = await POST(request, { params });

    expect(response.status).toBe(400);
  });

  it('should return 403 when edit window exceeded', async () => {
    mockToggleLog.mockRejectedValue(new Error('EDIT_WINDOW_EXCEEDED'));

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01' }),
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('7 days');
  });

  it('should return 404 when habit not found', async () => {
    mockToggleLog.mockRejectedValue(new Error('Habit not found'));

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params });

    expect(response.status).toBe(404);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it('should return 200 even when milestone recording fails', async () => {
    mockToggleLog.mockResolvedValue({
      log: { id: 'log-1', completed: true } as any,
      currentStreak: 7,
      bestStreak: 7,
    });
    mockRecordMilestone.mockRejectedValue(new Error('DB write failed'));

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.completed).toBe(true);
    expect(data.currentStreak).toBe(7);
  });

  it('should record milestone when streak hits a threshold', async () => {
    mockToggleLog.mockResolvedValue({
      log: { id: 'log-1', completed: true } as any,
      currentStreak: 30,
      bestStreak: 30,
    });
    mockRecordMilestone.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await POST(request, { params });

    expect(mockRecordMilestone).toHaveBeenCalledWith('habit-1', 'user-123', 30);
  });

  it('should not record milestone for non-threshold streak', async () => {
    mockToggleLog.mockResolvedValue({
      log: { id: 'log-1', completed: true } as any,
      currentStreak: 6,
      bestStreak: 12,
    });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await POST(request, { params });

    expect(mockRecordMilestone).not.toHaveBeenCalled();
  });

  it('should not record milestone when uncompleting a habit', async () => {
    mockToggleLog.mockResolvedValue({
      log: { id: 'log-1', completed: false } as any,
      currentStreak: 7,
      bestStreak: 12,
    });

    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/toggle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await POST(request, { params });

    expect(mockRecordMilestone).not.toHaveBeenCalled();
  });
});
