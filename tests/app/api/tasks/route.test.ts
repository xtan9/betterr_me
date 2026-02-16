import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/tasks/route';
import { NextRequest } from 'next/server';

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
}));

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })),
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

vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: mockEnsureProfile,
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
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })) },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
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
    expect(data.error).toBe('Validation failed');
  });

  it('should return 400 if priority is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task', priority: 5 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should pass intention to task data', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Gym', intention: 'Stay healthy' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ intention: 'Stay healthy' })
    );
  });

  it('should trim intention whitespace', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Gym', intention: '  Stay healthy  ' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ intention: 'Stay healthy' })
    );
  });

  it('should set intention to null when not provided', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Quick task' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ intention: null })
    );
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

  it('should call ensureProfile before creating task', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });
});
