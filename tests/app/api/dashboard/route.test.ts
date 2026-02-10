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
const mockHabitLogsDB = {
  getAllUserLogs: vi.fn().mockResolvedValue([]),
};

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    constructor() { return mockHabitsDB; }
  },
  TasksDB: class {
    constructor() { return mockTasksDB; }
  },
  HabitLogsDB: class {
    constructor() { return mockHabitLogsDB; }
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
      {
        id: 'h1', name: 'Run', current_streak: 5, completed_today: true,
        monthly_completion_rate: 80, frequency: { type: 'daily' },
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'h2', name: 'Read', current_streak: 3, completed_today: false,
        monthly_completion_rate: 60, frequency: { type: 'daily' },
        created_at: '2026-01-01T00:00:00Z',
      },
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
    const tomorrowTasks = [{ id: 't4', title: 'Tomorrow task', is_completed: false }];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue(todayTasks as any);
    // getUserTasks is called 3 times: due_date today, all tasks, due_date tomorrow
    vi.mocked(mockTasksDB.getUserTasks)
      .mockResolvedValueOnce(todayDateTasks as any)
      .mockResolvedValueOnce(allTasks as any)
      .mockResolvedValueOnce(tomorrowTasks as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habits).toHaveLength(2);
    expect(data.tasks_today).toHaveLength(1);
    expect(data.tasks_tomorrow).toHaveLength(1);
    expect(data.tasks_tomorrow[0].title).toBe('Tomorrow task');
    expect(data.stats.total_habits).toBe(2);
    expect(data.stats.completed_today).toBe(1);
    expect(data.stats.current_best_streak).toBe(5);
    expect(data.stats.total_tasks).toBe(3);
    expect(data.stats.tasks_completed_today).toBe(1);
  });

  // TODO: Enable after feat/h1-absence-backend merges into this branch
  it.skip('should compute absence data from bulk logs', async () => {
    const habits = [
      {
        id: 'h1', name: 'Run', current_streak: 0, completed_today: false,
        monthly_completion_rate: 50, frequency: { type: 'daily' },
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockResolvedValue([
      { habit_id: 'h1', logged_date: '2026-02-05', completed: true },
      { habit_id: 'h1', logged_date: '2026-02-04', completed: true },
      { habit_id: 'h1', logged_date: '2026-02-06', completed: false },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-09');
    const response = await GET(request);
    const data = await response.json();

    expect(data.habits[0].missed_scheduled_days).toBe(3);
    expect(data.habits[0].previous_streak).toBe(2);
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

  // TODO: Enable after feat/h1-absence-backend merges into this branch
  it.skip('should call getAllUserLogs with 30-day window', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-09');
    await GET(request);

    expect(mockHabitLogsDB.getAllUserLogs).toHaveBeenCalledWith(
      'user-123',
      '2026-01-10', // 30 days before 2026-02-09
      '2026-02-09'
    );
  });

  it('should fetch tomorrow tasks based on client date param', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-28');
    await GET(request);

    const calls = vi.mocked(mockTasksDB.getUserTasks).mock.calls;
    expect(calls[2]).toEqual(['user-123', { due_date: '2026-03-01', is_completed: false }]);
  });

  it('should derive Jan 1 for Dec 31 date param (year rollover)', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-12-31');
    await GET(request);

    const calls = vi.mocked(mockTasksDB.getUserTasks).mock.calls;
    expect(calls[2]).toEqual(['user-123', { due_date: '2027-01-01', is_completed: false }]);
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/dashboard?date=not-a-date');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid date format');
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
