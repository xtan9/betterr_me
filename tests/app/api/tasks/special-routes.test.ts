import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as togglePost } from '@/app/api/tasks/[id]/toggle/route';
import { GET as todayGet } from '@/app/api/tasks/today/route';
import { GET as upcomingGet } from '@/app/api/tasks/upcoming/route';
import { GET as overdueGet } from '@/app/api/tasks/overdue/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  tasksDB: {
    toggleTaskCompletion: vi.fn(),
    getTodayTasks: vi.fn(),
    getUpcomingTasks: vi.fn(),
    getOverdueTasks: vi.fn(),
  },
}));

import { tasksDB } from '@/lib/db';

describe('POST /api/tasks/[id]/toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should toggle task completion', async () => {
    const toggledTask = { id: 'task-1', is_completed: true };
    vi.mocked(tasksDB.toggleTaskCompletion).mockResolvedValue(toggledTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1/toggle', {
      method: 'POST',
    });

    const response = await togglePost(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(toggledTask);
    expect(tasksDB.toggleTaskCompletion).toHaveBeenCalledWith('task-1', 'user-123');
  });

  it('should return 404 if task not found', async () => {
    vi.mocked(tasksDB.toggleTaskCompletion).mockRejectedValue(
      new Error('Task not found')
    );

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1/toggle', {
      method: 'POST',
    });

    const response = await togglePost(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('GET /api/tasks/today', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return today\'s tasks', async () => {
    const mockTasks = [{ id: '1', title: 'Today task' }];
    vi.mocked(tasksDB.getTodayTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/today');
    const response = await todayGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(tasksDB.getTodayTasks).toHaveBeenCalledWith('user-123');
  });
});

describe('GET /api/tasks/upcoming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return upcoming tasks with default 7 days', async () => {
    const mockTasks = [{ id: '1', title: 'Upcoming task' }];
    vi.mocked(tasksDB.getUpcomingTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/upcoming');
    const response = await upcomingGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(tasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', 7);
  });

  it('should use custom days parameter', async () => {
    vi.mocked(tasksDB.getUpcomingTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks/upcoming?days=14');
    await upcomingGet(request);

    expect(tasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', 14);
  });

  it('should return 400 if days is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks/upcoming?days=0');
    const response = await upcomingGet(request);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/tasks/overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return overdue tasks', async () => {
    const mockTasks = [{ id: '1', title: 'Overdue task' }];
    vi.mocked(tasksDB.getOverdueTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/overdue');
    const response = await overdueGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(tasksDB.getOverdueTasks).toHaveBeenCalledWith('user-123');
  });
});
