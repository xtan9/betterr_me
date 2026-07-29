import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTaskWrites,
  TaskWrites,
  type TaskWritePersistence,
} from '@/lib/tasks/writes';
import { mockSupabaseClient } from '../../setup';
import type { SupabaseClient } from '@supabase/supabase-js';

function createPersistence(): TaskWritePersistence {
  return {
    getMaxSortOrder: vi.fn().mockResolvedValue(null),
    createTask: vi.fn(async (task) => ({ id: 'task-1', ...task } as never)),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    updateInstanceWithScope: vi.fn(),
  };
}

describe('TaskWrites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
  });

  it('uses deterministic placement persistence when executing create intent', async () => {
    mockSupabaseClient.setMockResponse({ sort_order: 131072 });
    const writes = createTaskWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await writes.execute({
      type: 'create',
      userId: 'user-1',
      values: { title: 'Plan tomorrow' },
    });

    const insertedTask = {
      user_id: 'user-1',
      title: 'Plan tomorrow',
      description: null,
      is_completed: false,
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
      completion_difficulty: null,
      status: 'todo',
      section: 'personal',
      project_id: null,
      sort_order: 196608,
      completed_at: null,
    };
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'tasks', method: 'from', args: ['tasks'] },
      { table: 'tasks', method: 'select', args: ['sort_order'] },
      { table: 'tasks', method: 'eq', args: ['user_id', 'user-1'] },
      {
        table: 'tasks',
        method: 'order',
        args: ['sort_order', { ascending: false }],
      },
      { table: 'tasks', method: 'limit', args: [1] },
      { table: 'tasks', method: 'maybeSingle', args: [] },
      { table: 'tasks', method: 'from', args: ['tasks'] },
      { table: 'tasks', method: 'insert', args: [insertedTask] },
      { table: 'tasks', method: 'select', args: [] },
      { table: 'tasks', method: 'single', args: [] },
    ]);
  });

  it('surfaces placement persistence errors without attempting creation', async () => {
    const placementError = new Error('placement unavailable');
    mockSupabaseClient.setMockResponse(null, placementError);
    const writes = createTaskWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(writes.execute({
      type: 'create',
      userId: 'user-1',
      values: { title: 'Plan tomorrow' },
    })).rejects.toBe(placementError);
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'tasks', method: 'from', args: ['tasks'] },
      { table: 'tasks', method: 'select', args: ['sort_order'] },
      { table: 'tasks', method: 'eq', args: ['user_id', 'user-1'] },
      {
        table: 'tasks',
        method: 'order',
        args: ['sort_order', { ascending: false }],
      },
      { table: 'tasks', method: 'limit', args: [1] },
      { table: 'tasks', method: 'maybeSingle', args: [] },
    ]);
  });

  it('creates a task with established defaults at the bottom', async () => {
    const persistence = createPersistence();
    const createdTask = { id: 'task-1' } as never;
    vi.mocked(persistence.createTask).mockResolvedValue(createdTask);
    const writes = new TaskWrites(persistence, () => new Date('2026-07-28T12:00:00.000Z'));

    const outcome = await writes.execute({
      type: 'create',
      userId: 'user-1',
      values: { title: '  Plan tomorrow  ' },
    });

    expect(persistence.createTask).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: 'Plan tomorrow',
      description: null,
      is_completed: false,
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
      completion_difficulty: null,
      status: 'todo',
      section: 'personal',
      project_id: null,
      sort_order: 65536,
      completed_at: null,
    });
    expect(outcome).toEqual({ type: 'created', task: createdTask });
  });

  it('persists creation values that have no default', async () => {
    const persistence = createPersistence();
    const writes = new TaskWrites(persistence);

    await writes.execute({
      type: 'create',
      userId: 'user-1',
      values: { title: 'Hard task', completion_difficulty: 3 },
    });

    expect(persistence.createTask).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: 'Hard task',
      description: null,
      is_completed: false,
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
      completion_difficulty: 3,
      status: 'todo',
      section: 'personal',
      project_id: null,
      sort_order: 65536,
      completed_at: null,
    });
  });

  it('creates a done task with synchronized completion state', async () => {
    const persistence = createPersistence();
    const writes = new TaskWrites(
      persistence,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );

    await writes.execute({
      type: 'create',
      userId: 'user-1',
      values: { title: 'Finished plan', status: 'done' },
    });

    expect(persistence.createTask).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: 'Finished plan',
      description: null,
      is_completed: true,
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
      completion_difficulty: null,
      status: 'done',
      section: 'personal',
      project_id: null,
      sort_order: 65536,
      completed_at: '2026-07-28T12:00:00.000Z',
    });
  });

  it('synchronizes status and completion when updating a task', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.updateTask).mockResolvedValue({ id: 'task-1' } as never);
    const writes = new TaskWrites(persistence, () => new Date('2026-07-28T12:00:00.000Z'));

    const outcome = await writes.execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      values: { title: '  Finished plan  ', status: 'done', is_completed: false },
    });

    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      title: 'Finished plan',
      status: 'done',
      is_completed: true,
      completed_at: '2026-07-28T12:00:00.000Z',
    });
    expect(outcome).toEqual({ type: 'updated', task: { id: 'task-1' } });
  });

  it('applies the same synchronization to scoped recurring updates', async () => {
    const persistence = createPersistence();
    const writes = new TaskWrites(persistence, () => new Date('2026-07-28T12:00:00.000Z'));

    const outcome = await writes.execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      scope: 'following',
      values: { is_completed: true },
    });

    expect(persistence.updateInstanceWithScope).toHaveBeenCalledWith(
      'task-1',
      'user-1',
      'following',
      {
        is_completed: true,
        status: 'done',
        completed_at: '2026-07-28T12:00:00.000Z',
      },
    );
    expect(outcome).toEqual({ type: 'scoped-updated' });
    expect(persistence.updateTask).not.toHaveBeenCalled();
  });

  it('toggles completion through a synchronized update', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask).mockResolvedValue({
      id: 'task-1',
      is_completed: false,
    } as never);
    vi.mocked(persistence.updateTask).mockResolvedValue({
      id: 'task-1',
      is_completed: true,
      status: 'done',
    } as never);
    const writes = new TaskWrites(persistence, () => new Date('2026-07-28T12:00:00.000Z'));

    const outcome = await writes.execute({
      type: 'toggle-completion',
      userId: 'user-1',
      taskId: 'task-1',
    });

    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      is_completed: true,
      status: 'done',
      completed_at: '2026-07-28T12:00:00.000Z',
    });
    expect(outcome).toEqual({
      type: 'toggled',
      task: { id: 'task-1', is_completed: true, status: 'done' },
    });
  });

  it('reopens a completed task through an exact synchronized update', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask).mockResolvedValue({
      id: 'task-1',
      is_completed: true,
    } as never);
    vi.mocked(persistence.updateTask).mockResolvedValue({
      id: 'task-1',
      is_completed: false,
      status: 'todo',
      completed_at: null,
    } as never);
    const writes = new TaskWrites(
      persistence,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );

    const outcome = await writes.execute({
      type: 'toggle-completion',
      userId: 'user-1',
      taskId: 'task-1',
    });

    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      is_completed: false,
      status: 'todo',
      completed_at: null,
    });
    expect(outcome).toEqual({
      type: 'toggled',
      task: {
        id: 'task-1',
        is_completed: false,
        status: 'todo',
        completed_at: null,
      },
    });
  });

  it('persists ordering as an explicit intent and returns the ordered task', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.updateTask).mockResolvedValue({
      id: 'task-1',
      sort_order: 32768,
    } as never);
    const writes = new TaskWrites(persistence);

    const outcome = await writes.execute({
      type: 'order',
      userId: 'user-1',
      taskId: 'task-1',
      sortOrder: 32768,
    });

    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      sort_order: 32768,
    });
    expect(outcome).toEqual({
      type: 'ordered',
      task: { id: 'task-1', sort_order: 32768 },
    });
  });
});
