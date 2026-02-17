import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as togglePost } from '@/app/api/tasks/[id]/toggle/route';
import { GET as tasksGet } from '@/app/api/tasks/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

const mockTasksDB = {
  toggleTaskCompletion: vi.fn(),
  getTodayTasks: vi.fn(),
  getUpcomingTasks: vi.fn(),
  getOverdueTasks: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  TasksDB: class {
    constructor() { return mockTasksDB; }
  },
}));

describe('POST /api/tasks/[id]/toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should toggle task completion', async () => {
    const toggledTask = { id: 'task-1', is_completed: true };
    vi.mocked(mockTasksDB.toggleTaskCompletion).mockResolvedValue(toggledTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1/toggle', {
      method: 'POST',
    });

    const response = await togglePost(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(toggledTask);
    expect(mockTasksDB.toggleTaskCompletion).toHaveBeenCalledWith('task-1', 'user-123');
  });

  it('should return 404 if task not found', async () => {
    vi.mocked(mockTasksDB.toggleTaskCompletion).mockRejectedValue(
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

describe('GET /api/tasks?view=today', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('should return today\'s tasks', async () => {
    const mockTasks = [{ id: '1', title: 'Today task' }];
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=today');
    const response = await tasksGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith('user-123', expect.any(String));
  });
});

describe('GET /api/tasks?view=upcoming', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('should return upcoming tasks with default 7 days', async () => {
    const mockTasks = [{ id: '1', title: 'Upcoming task' }];
    vi.mocked(mockTasksDB.getUpcomingTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=upcoming');
    const response = await tasksGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', 7);
  });

  it('should use custom days parameter', async () => {
    vi.mocked(mockTasksDB.getUpcomingTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=upcoming&days=14');
    await tasksGet(request);

    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', 14);
  });

  it('should return 400 if days is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks?view=upcoming&days=0');
    const response = await tasksGet(request);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/tasks?view=overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('should return overdue tasks', async () => {
    const mockTasks = [{ id: '1', title: 'Overdue task' }];
    vi.mocked(mockTasksDB.getOverdueTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=overdue');
    const response = await tasksGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(mockTasksDB.getOverdueTasks).toHaveBeenCalledWith('user-123');
  });
});
