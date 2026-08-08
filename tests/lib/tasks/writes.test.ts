import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTaskWrites,
  TaskWrites,
  type TaskDeletionPersistence,
  type TaskDeletionRequest,
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
  };
}

function recurringTask(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'task-1',
    is_completed: false,
    recurring_series_id: 'series-1',
    recurring_occurrence_id: 'occurrence-1',
    scheduled_date: '2026-08-04',
    recurrence_occurrence_state: 'open',
    ...overrides,
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

  it('rejects scoped updates at the ordinary Task Writes seam', async () => {
    const persistence = createPersistence();
    const writes = new TaskWrites(persistence, () => new Date('2026-07-28T12:00:00.000Z'));

    await expect(writes.execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      scope: 'following',
      values: { is_completed: true },
    })).rejects.toThrow(
      'Scoped task updates must use the Recurring Task Lifecycle adapter',
    );
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

  it('routes recurring ordering through the lifecycle boundary', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask)
      .mockResolvedValueOnce({
        id: 'task-1',
        is_completed: false,
        recurring_series_id: 'series-1',
        recurring_occurrence_id: 'occurrence-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        sort_order: 32768,
      } as never);
    const editOccurrence = vi.fn().mockResolvedValue({
      status: 'complete',
      type: 'complete',
    });
    persistence.lifecycle = { editOccurrence } as never;
    const writes = new TaskWrites(persistence);

    const outcome = await writes.execute({
      type: 'order',
      userId: 'user-1',
      taskId: 'task-1',
      sortOrder: 32768,
    });

    expect(editOccurrence).toHaveBeenCalledWith({
      userId: 'user-1',
      seriesId: 'series-1',
      occurrenceId: 'occurrence-1',
      updates: { sortOrder: 32768 },
    });
    expect(persistence.updateTask).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      type: 'ordered',
      task: { id: 'task-1', sort_order: 32768 },
    });
  });

  it('completes a recurring occurrence through the explicit lifecycle command', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask)
      .mockResolvedValueOnce({
        id: 'task-1',
        is_completed: false,
        recurring_series_id: 'series-1',
        recurring_occurrence_id: 'occurrence-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        is_completed: true,
        status: 'done',
      } as never);
    const completeOccurrence = vi.fn().mockResolvedValue({
      status: 'complete',
      type: 'complete',
    });
    const reopenOccurrence = vi.fn();
    persistence.lifecycle = { completeOccurrence, reopenOccurrence } as never;
    const writes = new TaskWrites(persistence);

    const outcome = await writes.execute({
      type: 'toggle-completion',
      userId: 'user-1',
      taskId: 'task-1',
    });

    expect(completeOccurrence).toHaveBeenCalledWith({
      userId: 'user-1',
      seriesId: 'series-1',
      occurrenceId: 'occurrence-1',
    });
    expect(reopenOccurrence).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      type: 'toggled',
      task: { id: 'task-1', is_completed: true, status: 'done' },
    });
  });

  it('reopens a recurring occurrence through a completion-only task update', async () => {
    const persistence = createPersistence();
    vi.mocked(persistence.getTask)
      .mockResolvedValueOnce({
        id: 'task-1',
        is_completed: true,
        recurring_series_id: 'series-1',
        recurring_occurrence_id: 'occurrence-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        is_completed: false,
        status: 'todo',
      } as never);
    const editOccurrence = vi.fn();
    const reopenOccurrence = vi.fn().mockResolvedValue({
      status: 'complete',
      type: 'complete',
    });
    persistence.lifecycle = { editOccurrence, reopenOccurrence } as never;
    const writes = new TaskWrites(persistence);

    await writes.execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      values: { is_completed: false },
    });

    expect(reopenOccurrence).toHaveBeenCalledWith({
      userId: 'user-1',
      seriesId: 'series-1',
      occurrenceId: 'occurrence-1',
    });
    expect(editOccurrence).not.toHaveBeenCalled();
  });

  describe('delete', () => {
    it('returns deleted through the owner-scoped standalone persistence seam', async () => {
      const persistence = createPersistence();
      const task = { id: 'task-1', is_completed: false } as never;
      const deleteTask = vi.fn().mockResolvedValue({ type: 'deleted' as const });
      vi.mocked(persistence.getTask).mockResolvedValue(task);
      persistence.deleteTask = deleteTask;
      const writes = new TaskWrites(persistence);

      await expect(
        writes.delete({ userId: 'trusted-user', taskId: 'task-1' }),
      ).resolves.toEqual({ type: 'deleted' });
      expect(deleteTask).toHaveBeenCalledWith('task-1', 'trusted-user');
    });

    it.each(['missing', 'cross-owner', 'repeated'] as const)(
      'returns the same not-found outcome for %s requests without destructive persistence',
      async () => {
        const persistence = createPersistence();
        const deleteTask = vi.fn();
        vi.mocked(persistence.getTask).mockResolvedValue(null);
        persistence.deleteTask = deleteTask;

        await expect(
          new TaskWrites(persistence).delete({
            userId: 'trusted-user',
            taskId: 'task-1',
          }),
        ).resolves.toEqual({ type: 'not-found' });
        expect(deleteTask).not.toHaveBeenCalled();
      },
    );

    it('rejects an explicit recurring scope on a standalone task', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue({
        id: 'task-1',
        is_completed: false,
      } as never);
      persistence.deleteTask = vi.fn();

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({
        type: 'invalid-transition',
        reason: 'Recurring deletion scope requires a Task Occurrence',
      });
      expect(persistence.deleteTask).not.toHaveBeenCalled();
    });

    it('routes this-scope occurrence deletion through skipOccurrence', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
      const skipOccurrence = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
      });
      persistence.deleteTask = vi.fn();
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({ type: 'deleted' });
      expect(skipOccurrence).toHaveBeenCalledWith({
        userId: 'trusted-user',
        seriesId: 'series-1',
        occurrenceId: 'occurrence-1',
      });
      expect(persistence.deleteTask).not.toHaveBeenCalled();
    });

    it('infers this-scope for a recurring task when no scope is supplied', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
      const skipOccurrence = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
      });
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
        }),
      ).resolves.toEqual({ type: 'deleted' });
      expect(skipOccurrence).toHaveBeenCalledOnce();
    });

    it('preserves completed occurrence history instead of deleting it', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(
        recurringTask({
          is_completed: true,
          recurrence_occurrence_state: 'completed',
        }) as never,
      );
      const skipOccurrence = vi.fn();
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({
        type: 'invalid-transition',
        reason: 'Completed Task Occurrences retain history',
      });
      expect(skipOccurrence).not.toHaveBeenCalled();
    });

  it.each(['following', 'all'] as const)(
      'routes %s-scope occurrence deletion through one atomic lifecycle command',
      async (scope) => {
        const persistence = createPersistence();
        vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
        const getSeries = vi.fn().mockResolvedValue({
          status: 'complete',
          type: 'complete',
          series: { id: 'series-1', status: 'active' },
        });
        const endSeries = vi.fn().mockResolvedValue({
          status: 'complete',
          type: 'complete',
        });
        const deleteSeries = vi.fn().mockResolvedValue({
          status: 'complete',
          type: 'complete',
        });
        persistence.deleteTask = vi.fn();
        persistence.lifecycle = { getSeries, endSeries, deleteSeries } as never;

        await expect(
          new TaskWrites(persistence).delete({
            userId: 'trusted-user',
            taskId: 'task-1',
            scope,
          }),
        ).resolves.toEqual({ type: 'deleted' });
        expect(getSeries).toHaveBeenCalledWith('trusted-user', 'series-1');
        const command = endSeries;
        expect(command).toHaveBeenCalledWith({
          userId: 'trusted-user',
          seriesId: 'series-1',
          effectiveDate: '2026-08-04',
        });
        expect(deleteSeries).not.toHaveBeenCalled();
        expect(persistence.deleteTask).not.toHaveBeenCalled();
      },
    );

    it('preserves completed history while deleting following occurrences', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(
        recurringTask({
          is_completed: true,
          recurrence_occurrence_state: 'completed',
        }) as never,
      );
      const getSeries = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
        series: { id: 'series-1', status: 'active' },
      });
      const endSeries = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
      });
      persistence.lifecycle = { getSeries, endSeries } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'following',
        }),
      ).resolves.toEqual({ type: 'deleted' });
      expect(endSeries).toHaveBeenCalledOnce();
    });

    it('returns a domain failure when a recurring task has no scheduled date', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(
        recurringTask({ scheduled_date: null, original_date: null }) as never,
      );
      const endSeries = vi.fn();
      persistence.lifecycle = { endSeries } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'following',
        }),
      ).resolves.toEqual({
        type: 'invalid-transition',
        reason: 'Recurring Task Occurrence is missing its Scheduled Date',
      });
      expect(endSeries).not.toHaveBeenCalled();
    });

    it('returns a domain failure when recurring occurrence metadata is incomplete', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(
        recurringTask({ recurring_occurrence_id: null }) as never,
      );
      const skipOccurrence = vi.fn();
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({
        type: 'invalid-transition',
        reason: 'Recurring Task Occurrence metadata is incomplete',
      });
      expect(skipOccurrence).not.toHaveBeenCalled();
    });

    it('maps a lifecycle not-found outcome without destructive persistence', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
      const skipOccurrence = vi.fn().mockResolvedValue({
        status: 'not-found',
        type: 'not-found',
      });
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({ type: 'not-found' });
    });

    it('maps a repeated lifecycle deletion to the same not-found outcome', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
      const skipOccurrence = vi.fn().mockResolvedValue({
        status: 'already-applied',
        type: 'already-applied',
      });
      persistence.lifecycle = { skipOccurrence } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({ type: 'not-found' });
    });

    it('returns not-found for an ended series instead of retrying destructive work', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);
      const getSeries = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
        series: { id: 'series-1', status: 'ended' },
      });
      const endSeries = vi.fn();
      persistence.lifecycle = { getSeries, endSeries } as never;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'all',
        }),
      ).resolves.toEqual({ type: 'not-found' });
      expect(endSeries).not.toHaveBeenCalled();
    });

    it('propagates unexpected standalone deletion persistence failures', async () => {
      const persistenceError = new Error('deletion transaction unavailable');
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue({
        id: 'task-1',
        is_completed: false,
      } as never);
      const deleteTask = vi.fn().mockRejectedValue(persistenceError);
      persistence.deleteTask = deleteTask;

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
        }),
      ).rejects.toBe(persistenceError);
    });

    it('deletes a recurring series through the lifecycle boundary', async () => {
      const getSeries = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
        series: { id: 'series-1', status: 'active' },
      });
      const deleteSeries = vi.fn().mockResolvedValue({
        status: 'complete',
        type: 'complete',
      });
      const writes = new TaskWrites({
        lifecycle: { getSeries, deleteSeries },
      } as never);

      await expect(
        writes.deleteSeries({
          userId: 'trusted-user',
          seriesId: 'series-1',
          effectiveDate: '2026-08-06',
        }),
      ).resolves.toEqual({ type: 'deleted' });
      expect(getSeries).toHaveBeenCalledWith('trusted-user', 'series-1');
      expect(deleteSeries).toHaveBeenCalledWith({
        userId: 'trusted-user',
        seriesId: 'series-1',
        effectiveDate: '2026-08-06',
      });
    });

    it.each(['missing', 'cross-owner', 'repeated'] as const)(
      'returns not-found for %s recurring-series deletion requests',
      async () => {
        const getSeries = vi.fn().mockResolvedValue({
          status: 'not-found',
          type: 'not-found',
        });
        const deleteSeries = vi.fn();
        const writes = new TaskWrites({
          lifecycle: { getSeries, deleteSeries },
        } as never);

        await expect(
          writes.deleteSeries({
            userId: 'trusted-user',
            seriesId: 'series-1',
          }),
        ).resolves.toEqual({ type: 'not-found' });
        expect(deleteSeries).not.toHaveBeenCalled();
      },
    );

    it('rejects recurring deletion when lifecycle persistence is unavailable', async () => {
      const persistence = createPersistence();
      vi.mocked(persistence.getTask).mockResolvedValue(recurringTask() as never);

      await expect(
        new TaskWrites(persistence).delete({
          userId: 'trusted-user',
          taskId: 'task-1',
          scope: 'this',
        }),
      ).resolves.toEqual({
        type: 'invalid-transition',
        reason: 'Recurring task deletion requires lifecycle persistence',
      });
    });

    it('keeps deletion requests storage-independent', () => {
      const request: TaskDeletionRequest = {
        userId: 'trusted-user',
        taskId: 'task-1',
        scope: 'following',
        effectiveDate: '2026-08-04',
      };
      const persistence: TaskDeletionPersistence = {
        deleteTask: vi.fn().mockResolvedValue({ type: 'deleted' }),
      };

      expect(request).toEqual({
        userId: 'trusted-user',
        taskId: 'task-1',
        scope: 'following',
        effectiveDate: '2026-08-04',
      });
      expect(persistence).toBeDefined();
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
      reminders: [
        {
          reminderType: 'relative',
          relativeMinutes: 15,
          channels: ['email', 'push'],
        },
      ],
    })).resolves.toEqual({ type: 'configured', reminders: [] });

    expect(configureTaskReminders).toHaveBeenCalledWith({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [
        {
          reminderType: 'relative',
          relativeMinutes: 15,
          absoluteTime: null,
          channels: ['email', 'push'],
        },
      ],
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
        { reminderType: 'absolute', absoluteTime: '2026-08-03T09:00:00Z', channels: ['push'] },
        { reminderType: 'absolute', absoluteTime: '2026-08-03T09:00:00Z', channels: ['push'] },
      ],
    })).resolves.toEqual({
      type: 'conflict',
      resource: 'reminder',
      reason: 'Duplicate reminder configuration',
    });

    expect(configureTaskReminders).not.toHaveBeenCalled();
  });

  it.each([
    ['configured', { type: 'configured', reminders: [] }],
    ['removed', { type: 'removed', reminders: [] }],
    ['already-applied', { type: 'already-applied', reminders: [] }],
    ['not-found', { type: 'not-found' }],
    ['conflict', { type: 'conflict', resource: 'reminder' }],
    ['invalid', { type: 'invalid', field: 'taskId', message: 'Task identity is required' }],
  ] as const)('preserves the typed %s persistence outcome', async (_label, outcome) => {
    const persistence = createPersistence();
    persistence.configureTaskReminders = vi.fn().mockResolvedValue(outcome);
    const writes = new TaskWrites(persistence);

    const request = outcome.type === 'invalid'
      ? { userId: 'user-1', taskId: 'task-1', reminders: [] }
      : { userId: 'user-1', taskId: 'task-1', reminders: [] };
    await expect(writes.configureReminders(request)).resolves.toEqual(outcome);
  });

  it('does not accept a calendar or habit source discriminator', async () => {
    const persistence = createPersistence();
    const configureTaskReminders = vi.fn();
    persistence.configureTaskReminders = configureTaskReminders;
    const writes = new TaskWrites(persistence);

    await expect(writes.configureReminders({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [],
      sourceType: 'calendar_event',
    } as never)).resolves.toEqual({
      type: 'invalid',
      field: 'sourceType',
      message: 'Task reminder configuration cannot select another source',
    });
    expect(configureTaskReminders).not.toHaveBeenCalled();
  });
});
