import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/dashboard/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  habitsDB: {
    getHabitsWithTodayStatus: vi.fn(),
  },
  tasksDB: {
    getTodayTasks: vi.fn(),
    getUserTasks: vi.fn(),
  },
}));

import { createClient } from '@/lib/supabase/server';
import { habitsDB, tasksDB } from '@/lib/db';

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should return aggregated dashboard data', async () => {
    const habits = [
      { id: 'h1', name: 'Run', current_streak: 5, completed_today: true },
      { id: 'h2', name: 'Read', current_streak: 3, completed_today: false },
    ];
    const todayTasks = [{ id: 't1', title: 'Task 1', is_completed: false }];
    const allTasks = [
      { id: 't1', title: 'Task 1', is_completed: false },
      { id: 't2', title: 'Task 2', is_completed: true },
    ];

    vi.mocked(habitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(tasksDB.getTodayTasks).mockResolvedValue(todayTasks as any);
    vi.mocked(tasksDB.getUserTasks).mockResolvedValue(allTasks as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habits).toHaveLength(2);
    expect(data.tasks_today).toHaveLength(1);
    expect(data.stats.total_habits).toBe(2);
    expect(data.stats.completed_today).toBe(1);
    expect(data.stats.current_best_streak).toBe(5);
    expect(data.stats.tasks_completed_today).toBe(1);
  });

  it('should handle empty state (new user)', async () => {
    vi.mocked(habitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(tasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(tasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.total_habits).toBe(0);
    expect(data.stats.completed_today).toBe(0);
    expect(data.stats.current_best_streak).toBe(0);
  });

  it('should accept a date parameter', async () => {
    vi.mocked(habitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(tasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(tasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-01');
    await GET(request);

    expect(habitsDB.getHabitsWithTodayStatus).toHaveBeenCalledWith('user-123', '2026-02-01');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
