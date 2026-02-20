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
  getTaskCount: vi.fn().mockResolvedValue(0),
};
const mockHabitLogsDB = {
  getAllUserLogs: vi.fn().mockResolvedValue([]),
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
  HabitLogsDB: class {
    constructor() { return mockHabitLogsDB; }
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
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockResolvedValue([]);
    vi.mocked(mockMilestonesDB.getTodaysMilestones).mockResolvedValue([]);
  });

  it('should return aggregated dashboard data with absence info', async () => {
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
    const todayTasks = [
      { id: 't1', title: 'Task 1', is_completed: false },
      { id: 't2', title: 'Task 2', is_completed: true },
    ];
    const tomorrowTasks = [{ id: 't4', title: 'Tomorrow task', is_completed: false }];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue(todayTasks as any);
    // getTaskCount is called once: total_tasks only
    vi.mocked(mockTasksDB.getTaskCount).mockResolvedValueOnce(3);
    // getUserTasks is called once: tomorrow tasks
    vi.mocked(mockTasksDB.getUserTasks)
      .mockResolvedValueOnce(tomorrowTasks as any);
    // Return logs so absence computation can work
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.habits).toHaveLength(2);
    expect(data.tasks_today).toHaveLength(2);
    expect(data.tasks_tomorrow).toHaveLength(1);
    expect(data.tasks_tomorrow[0].title).toBe('Tomorrow task');
    expect(data.stats.total_habits).toBe(2);
    expect(data.stats.completed_today).toBe(1);
    expect(data.stats.current_best_streak).toBe(5);
    expect(data.stats.total_tasks).toBe(3);
    // tasks_completed_today is derived from todayTasks (1 completed out of 2)
    expect(data.stats.tasks_completed_today).toBe(1);
    expect(data.stats.tasks_due_today).toBe(2);
    // Absence fields should be present
    expect(data.habits[0]).toHaveProperty('missed_scheduled_periods');
    expect(data.habits[0]).toHaveProperty('previous_streak');
    expect(typeof data.habits[0].missed_scheduled_periods).toBe('number');
    expect(typeof data.habits[0].previous_streak).toBe('number');
    expect(data.habits[0]).toHaveProperty('absence_unit');
    expect(data.habits[0].absence_unit).toBe('days'); // daily frequency → days
  });

  it('should compute absence data from bulk logs', async () => {
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
    // Provide logs: completed Feb 5 and Feb 4, missed Feb 6-8
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockResolvedValue([
      { habit_id: 'h1', logged_date: '2026-02-05', completed: true },
      { habit_id: 'h1', logged_date: '2026-02-04', completed: true },
      { habit_id: 'h1', logged_date: '2026-02-06', completed: false }, // not completed
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-09');
    const response = await GET(request);
    const data = await response.json();

    // Feb 6, 7, 8 missed (3 days), previous streak = 2 (Feb 5, Feb 4)
    expect(data.habits[0].missed_scheduled_periods).toBe(3);
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
    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith('user-123', '2026-02-01');
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

  it('should call getAllUserLogs with 30-day window', async () => {
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
    expect(calls[0]).toEqual(['user-123', { due_date: '2026-03-01', is_completed: false }]);
  });

  it('should derive Jan 1 for Dec 31 date param (year rollover)', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-12-31');
    await GET(request);

    const calls = vi.mocked(mockTasksDB.getUserTasks).mock.calls;
    expect(calls[0]).toEqual(['user-123', { due_date: '2027-01-01', is_completed: false }]);
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/dashboard?date=not-a-date');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid date format');
  });

  it('should return dashboard data even when getAllUserLogs fails', async () => {
    const habits = [
      {
        id: 'h1', name: 'Run', current_streak: 3, completed_today: true,
        monthly_completion_rate: 80, frequency: { type: 'daily' },
        created_at: '2026-02-15T00:00:00Z', // Same day as query date
      },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockRejectedValue(
      new Error('DB timeout')
    );
    vi.mocked(mockMilestonesDB.getTodaysMilestones).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-15');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.habits).toHaveLength(1);
    expect(data.habits[0].name).toBe('Run');
    // Absence fields should be present (graceful fallback with empty logs)
    expect(data.habits[0]).toHaveProperty('missed_scheduled_periods');
    expect(typeof data.habits[0].missed_scheduled_periods).toBe('number');
    expect(data.habits[0]).toHaveProperty('previous_streak');
    expect(typeof data.habits[0].previous_streak).toBe('number');
    expect(data.stats).toBeDefined();
    expect(data.stats.total_habits).toBe(1);
    expect(data.stats.completed_today).toBe(1);
  });

  it('should pass client date to getTodaysMilestones', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-09');
    await GET(request);

    expect(mockMilestonesDB.getTodaysMilestones).toHaveBeenCalledWith('user-123', '2026-02-09');
  });

  it('should return dashboard data even when milestones fetch fails', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);
    vi.mocked(mockMilestonesDB.getTodaysMilestones).mockRejectedValue(
      new Error('Milestones table missing')
    );

    const request = new NextRequest('http://localhost:3000/api/dashboard');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.milestones_today).toEqual([]);
    expect(data.habits).toBeDefined();
    expect(data.stats).toBeDefined();
  });

  it('should include _warnings when getAllUserLogs fails', async () => {
    const habits = [
      {
        id: 'h1', name: 'Run', current_streak: 3, completed_today: true,
        monthly_completion_rate: 80, frequency: { type: 'daily' },
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue(habits as any);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);
    vi.mocked(mockHabitLogsDB.getAllUserLogs).mockRejectedValue(new Error('DB timeout'));
    vi.mocked(mockMilestonesDB.getTodaysMilestones).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-02-15');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Critical: _warnings must be present when logs fetch fails
    expect(data._warnings).toBeDefined();
    expect(data._warnings.length).toBeGreaterThan(0);
    expect(data._warnings[0]).toContain('Absence');
  });

  it('should pass client date to getTodayTasks', async () => {
    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-03-15');
    await GET(request);

    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith('user-123', '2026-03-15');
  });

  it('should include completed tasks in tasks_today and derive stats', async () => {
    const todayTasks = [
      { id: 't1', title: 'Incomplete task', is_completed: false },
      { id: 't2', title: 'Completed task', is_completed: true },
      { id: 't3', title: 'Another completed', is_completed: true },
    ];

    vi.mocked(mockHabitsDB.getHabitsWithTodayStatus).mockResolvedValue([]);
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue(todayTasks as any);
    vi.mocked(mockTasksDB.getTaskCount).mockResolvedValueOnce(5); // total_tasks
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/dashboard?date=2026-03-15');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // tasks_today should include both completed and incomplete
    expect(data.tasks_today).toHaveLength(3);
    expect(data.tasks_today.some((t: any) => t.is_completed)).toBe(true);
    expect(data.tasks_today.some((t: any) => !t.is_completed)).toBe(true);
    // stats derived from array, not separate DB call
    expect(data.stats.tasks_due_today).toBe(3);
    expect(data.stats.tasks_completed_today).toBe(2);
    expect(data.stats.total_tasks).toBe(5);
    // getTaskCount should only be called once (for total_tasks)
    expect(mockTasksDB.getTaskCount).toHaveBeenCalledTimes(1);
    expect(mockTasksDB.getTaskCount).toHaveBeenCalledWith('user-123');
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
