import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/tasks/[id]/route';
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
  getTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  TasksDB: class {
    constructor() { return mockTasksDB; }
  },
}));

describe('GET /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return task by ID', async () => {
    const mockTask = { id: 'task-1', user_id: 'user-123', title: 'Task 1' };
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(mockTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'task-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(mockTask);
    expect(mockTasksDB.getTask).toHaveBeenCalledWith('task-1', 'user-123');
  });

  it('should return 404 if task not found', async () => {
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/tasks/nonexistent');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'nonexistent' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('should update task', async () => {
    const updatedTask = {
      id: 'task-1',
      user_id: 'user-123',
      title: 'Updated',
      priority: 3,
    };
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue(updatedTask as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated', priority: 3 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(updatedTask);
  });

  it('should return 400 if no valid updates', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 if title is empty', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: '  ' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('should delete task', async () => {
    vi.mocked(mockTasksDB.deleteTask).mockResolvedValue();

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTasksDB.deleteTask).toHaveBeenCalledWith('task-1', 'user-123');
  });
});
