import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/tasks/route';
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
  getUserTasks: vi.fn(),
  createTask: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  TasksDB: class {
    constructor() { return mockTasksDB; }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return tasks for authenticated user', async () => {
    const mockTasks = [
      { id: '1', user_id: 'user-123', title: 'Task 1', is_completed: false },
    ];
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue(mockTasks as any);

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual(mockTasks);
    expect(mockTasksDB.getUserTasks).toHaveBeenCalledWith('user-123', {});
  });

  it('should apply filters from query params', async () => {
    vi.mocked(mockTasksDB.getUserTasks).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost:3000/api/tasks?is_completed=true&priority=2'
    );
    await GET(request);

    expect(mockTasksDB.getUserTasks).toHaveBeenCalledWith('user-123', {
      is_completed: true,
      priority: 2,
    });
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should create a new task', async () => {
    const newTask = {
      id: 'task-1',
      user_id: 'user-123',
      title: 'New task',
      is_completed: false,
      priority: 1,
    };
    vi.mocked(mockTasksDB.createTask).mockResolvedValue(newTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task', priority: 1 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.task).toEqual(newTask);
  });

  it('should return 400 if title is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ description: 'No title' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Title is required');
  });

  it('should return 400 if priority is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task', priority: 5 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Priority must be 0-3');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
