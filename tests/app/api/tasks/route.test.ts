import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/tasks/route';
import { NextRequest } from 'next/server';

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
}));

// Chainable mock for Supabase sort_order query
const mockSortOrderChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
};

const mockSupabaseFrom = vi.fn(() => mockSortOrderChain);

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })),
    },
    from: mockSupabaseFrom,
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
    mockSortOrderChain.select.mockReturnThis();
    mockSortOrderChain.eq.mockReturnThis();
    mockSortOrderChain.order.mockReturnThis();
    mockSortOrderChain.limit.mockReturnThis();
    mockSortOrderChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseFrom.mockReturnValue(mockSortOrderChain);
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123', email: 'test@example.com' } } })) },
      from: mockSupabaseFrom,
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
      status: 'todo',
      section: 'personal',
      sort_order: 65536.0,
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

  it('should create task with status=todo, section=personal, and sort_order by default', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test task' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'todo',
        section: 'personal',
        sort_order: 65536.0,
        is_completed: false,
        completed_at: null,
      })
    );
  });

  it('should compute sort_order based on existing max', async () => {
    mockSortOrderChain.maybeSingle.mockResolvedValue({
      data: { sort_order: 131072.0 },
      error: null,
    });
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test task' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sort_order: 196608.0, // 131072 + 65536
      })
    );
  });

  it('should create task with section=work when provided', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', section: 'work' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'work' })
    );
  });

  it('should create task with project_id when provided', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', project_id: '550e8400-e29b-41d4-a716-446655440000' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: '550e8400-e29b-41d4-a716-446655440000' })
    );
  });

  it('should create task with project_id=null when not provided', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: null })
    );
  });

  it('should accept status in request body for forward compatibility', async () => {
    vi.mocked(mockTasksDB.createTask).mockResolvedValue({ id: 'task-1' } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', status: 'backlog' }),
    });

    await POST(request);

    expect(mockTasksDB.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'backlog',
        is_completed: false,
      })
    );
  });
});
