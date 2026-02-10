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

const mockHabitsDB = {
  getHabitsWithTodayStatus: vi.fn(),
};
const mockTasksDB = {
  getTodayTasks: vi.fn(),
  getUserTasks: vi.fn().mockResolvedValue([]),
};
const mockMilestonesDB = {
  getTodaysMilestones: vi.fn().mockResolvedValue([]),
};

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    constructor() { return mockHabitsDB; }
  },
  TasksDB: class {
    constructor() { return mockTasksDB; }
  },
  HabitMilestonesDB: class {
    constructor() { return mockMilestonesDB; }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should return aggregated dashboard data', async () => {
    const habits = [
      { id: 'h1', name: 'Run', current_streak: 5, completed_today: true, monthly_completion_rate: 80 },
      { id: 'h2', name: 'Read', current_streak: 3, completed_today: false, monthly_completion_rate: 60 },
    ];
    const todayTasks = [{ id: 't1', title: 'Task 1', is_completed: false }];
    const todayDateTasks = [
      { id: 't1', title: 'Task 1', is_completed: false },
      { id: 't2', title: 'Task 2', is_completed: true },
    ];
    const allTasks = [
      { id: 't1', title: 'Task 1', is_completed: false },
      { id: 't2', title: 'Task 2', is_completed: true },
      { id: 't3', title: 'Task 3', is_completed: false },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue(todayTasks as any);
    // getUserTasks is called twice: once with due_date filter, once without
    vi.mocked(mockTasksDB.getUserTasks)
      .mockResolvedValueOnce(todayDateTasks as any)
      .mockResolvedValueOnce(allTasks as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habits).toHaveLength(2);
    expect(data.tasks_today).toHaveLength(1);
    expect(data.stats.total_habits).toBe(2);
    expect(data.stats.completed_today).toBe(1);
    expect(data.stats.current_best_streak).toBe(5);
    expect(data.stats.total_tasks).toBe(3);
    expect(data.stats.tasks_completed_today).toBe(1);
  });

  it('should handle empty state (new user)', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats.total_habits).toBe(0);
    expect(data.stats.completed_today).toBe(0);
    expect(data.stats.current_best_streak).toBe(0);
    expect(data.stats.total_tasks).toBe(0);
  });

  it('should accept a date parameter', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-01');
    await GET(request);

    expect(mockHabitsDB.getHabitsWithTodayStatus).toHaveBeenCalledWith('user-123', '2026-02-01');
  });

  it('should return milestones_today in response', async () => {
    const milestones = [
      { id: 'm1', habit_id: 'h1', user_id: 'user-123', milestone: 7, achieved_at: '2026-02-09T00:00:00Z', created_at: '2026-02-09T00:00:00Z' },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);
    vi.mocked(mockMilestonesDB.getTodaysMilestones).mockResolvedValue(milestones);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.milestones_today).toHaveLength(1);
    expect(data.milestones_today[0].milestone).toBe(7);
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
