import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as togglePost } from '@/app/api/tasks/[id]/toggle/route';
import { GET as tasksGet } from '@/app/api/tasks/route';
import { NextRequest } from 'next/server';

const mockRpc = vi.fn();

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
    rpc: mockRpc,
  })),
}));

const mockTasksDB = {
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
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
    mockRpc.mockResolvedValue({
      data: {
        status: 'complete',
        type: 'complete',
        task: { id: 'task-1', is_completed: true, status: 'done' },
      },
      error: null,
    });
  });

  it('should toggle task completion', async () => {
    const toggledTask = { id: 'task-1', is_completed: true };
    vi.mocked(mockTasksDB.getTask).mockResolvedValue({
      id: 'task-1',
      is_completed: false,
    } as any);
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue(toggledTask as any);
    mockRpc.mockResolvedValueOnce({
      data: { status: 'complete', type: 'complete', task: toggledTask },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1/toggle', {
      method: 'POST',
    });

    const response = await togglePost(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(toggledTask);
    expect(mockRpc).toHaveBeenCalledWith(
      'task_command_atomic',
      expect.objectContaining({
        p_operation: 'complete',
        p_request: expect.objectContaining({
          userId: 'user-123',
          taskId: 'task-1',
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });

  it('routes recurring completion through the lifecycle command', async () => {
    const currentTask = {
      id: 'task-1',
      is_completed: false,
      recurring_series_id: 'series-1',
      recurring_occurrence_id: 'occurrence-1',
    };
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(currentTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1/toggle', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'toggle-recurring-1' },
    });

    const response = await togglePost(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(currentTask);
    expect(mockRpc).toHaveBeenCalledWith('recurring_task_lifecycle', {
      p_operation: 'complete-occurrence',
      p_request: {
        userId: 'user-123',
        taskId: 'task-1',
        seriesId: 'series-1',
        occurrenceId: 'occurrence-1',
        scope: 'this',
        idempotencyKey: 'toggle-recurring-1',
      },
    });
    expect(mockTasksDB.updateTask).not.toHaveBeenCalled();
  });

  it('should return 404 if task not found', async () => {
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(null);

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

  it('should pass explicit date param to getTodayTasks', async () => {
    vi.mocked(mockTasksDB.getTodayTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=today&date=2026-05-01');
    await tasksGet(request);

    expect(mockTasksDB.getTodayTasks).toHaveBeenCalledWith('user-123', '2026-05-01');
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
    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', expect.any(String), 7);
  });

  it('should use custom days parameter', async () => {
    vi.mocked(mockTasksDB.getUpcomingTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=upcoming&days=14');
    await tasksGet(request);

    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', expect.any(String), 14);
  });

  it('should pass explicit date param to getUpcomingTasks', async () => {
    vi.mocked(mockTasksDB.getUpcomingTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=upcoming&date=2026-05-01');
    await tasksGet(request);

    expect(mockTasksDB.getUpcomingTasks).toHaveBeenCalledWith('user-123', '2026-05-01', 7);
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
    expect(mockTasksDB.getOverdueTasks).toHaveBeenCalledWith('user-123', expect.any(String));
  });

  it('should pass explicit date param to getOverdueTasks', async () => {
    vi.mocked(mockTasksDB.getOverdueTasks).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/tasks?view=overdue&date=2026-05-01');
    await tasksGet(request);

    expect(mockTasksDB.getOverdueTasks).toHaveBeenCalledWith('user-123', '2026-05-01');
  });
});

describe('GET /api/tasks - date validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks?view=today&date=not-a-date');
    const response = await tasksGet(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid date format');
  });
});
