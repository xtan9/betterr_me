import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createTaskWrites,
  TaskWrites,
  type TaskWritePersistence,
} from '@/lib/tasks/writes';
import { mockSupabaseClient } from '../../setup';

function createPersistence(): TaskWritePersistence {
  return {
    getMaxSortOrder: vi.fn().mockResolvedValue(null),
    createTask: vi.fn(async (task) => ({ id: 'task-1', ...task } as never)),
    getTask: vi.fn(),
    updateTask: vi.fn(),
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

    expect(mockSupabaseClient.queryLog).toContainEqual({
      table: 'tasks',
      method: 'insert',
      args: [expect.objectContaining({
        user_id: 'user-1',
        title: 'Plan tomorrow',
        sort_order: 196608,
      })],
    });
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
    expect(mockSupabaseClient.queryLog).not.toContainEqual(
      expect.objectContaining({ method: 'insert' }),
    );
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

    expect(persistence.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Finished plan',
      is_completed: true,
      status: 'done',
      completed_at: '2026-07-28T12:00:00.000Z',
    }));
  });

  it('synchronizes status and completion when updating an ordinary task', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.updateTask).mockResolvedValue({ id: 'task-1' } as never);
    const writes = new TaskWrites(
      persistence,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );

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

  it('rejects scoped updates at the ordinary Task Writes seam', async () => {
    const persistence = createPersistence();
    const writes = new TaskWrites(persistence);

    await expect(writes.execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      scope: 'following',
      values: { is_completed: true },
    })).rejects.toThrow('Scoped task updates must use Task Commands');
    expect(persistence.updateTask).not.toHaveBeenCalled();
  });

  it('toggles completion through an ordinary synchronized update', async () => {
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
    const writes = new TaskWrites(
      persistence,
      () => new Date('2026-07-28T12:00:00.000Z'),
    );

    await expect(writes.execute({
      type: 'toggle-completion',
      userId: 'user-1',
      taskId: 'task-1',
    })).resolves.toEqual({
      type: 'toggled',
      task: { id: 'task-1', is_completed: true, status: 'done' },
    });
    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      is_completed: true,
      status: 'done',
      completed_at: '2026-07-28T12:00:00.000Z',
    });
  });

  it('persists ordinary ordering as an explicit intent', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.updateTask).mockResolvedValue({
      id: 'task-1',
      sort_order: 32768,
    } as never);
    const writes = new TaskWrites(persistence);

    await expect(writes.execute({
      type: 'order',
      userId: 'user-1',
      taskId: 'task-1',
      sortOrder: 32768,
    })).resolves.toEqual({
      type: 'ordered',
      task: { id: 'task-1', sort_order: 32768 },
    });
    expect(persistence.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      sort_order: 32768,
    });
  });
});

describe('Task Reminder Configuration', () => {
  it('normalizes a complete desired intent before delegating to persistence', async () => {
    const persistence = createPersistence();
    const configureTaskReminders = vi.fn().mockResolvedValue({
      type: 'configured',
      reminders: [],
    });
    persistence.configureTaskReminders = configureTaskReminders;
    const writes = new TaskWrites(persistence);

    await expect(writes.configureReminders({
      userId: ' user-1 ',
      taskId: ' task-1 ',
      reminders: [{
        reminderType: 'relative',
        relativeMinutes: 15,
        channels: ['email', 'push'],
      }],
    })).resolves.toEqual({ type: 'configured', reminders: [] });

    expect(configureTaskReminders).toHaveBeenCalledWith({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [{
        reminderType: 'relative',
        relativeMinutes: 15,
        absoluteTime: null,
        channels: ['email', 'push'],
      }],
    });
  });

  it('returns typed invalid and conflict outcomes without opening persistence', async () => {
    const persistence = createPersistence();
    const configureTaskReminders = vi.fn();
    persistence.configureTaskReminders = configureTaskReminders;
    const writes = new TaskWrites(persistence);

    await expect(writes.configureReminders({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [{
        reminderType: 'absolute',
        absoluteTime: 'not-a-datetime',
        channels: ['push'],
      }],
    })).resolves.toEqual({
      type: 'invalid',
      field: 'reminders[0].absoluteTime',
      message: 'absoluteTime must be a valid datetime',
    });

    await expect(writes.configureReminders({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [
        { reminderType: 'relative', relativeMinutes: 15, channels: ['push'] },
        { reminderType: 'relative', relativeMinutes: 15, channels: ['push'] },
      ],
    })).resolves.toEqual({
      type: 'conflict',
      resource: 'reminder',
      reason: 'Duplicate reminder configuration',
    });
    expect(configureTaskReminders).not.toHaveBeenCalled();
  });
});
