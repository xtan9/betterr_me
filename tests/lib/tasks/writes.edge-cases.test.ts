import { describe, expect, it, vi } from 'vitest';

import {
  TaskNotFoundError,
  TaskWrites,
  type TaskWritePersistence,
} from '@/lib/tasks/writes';

function persistence(): TaskWritePersistence {
  return {
    getMaxSortOrder: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
    getTask: vi.fn(),
    updateTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  };
}

describe('Task Writes edge contracts', () => {
  it('rejects a missing task before attempting a toggle mutation', async () => {
    const writes = persistence();
    vi.mocked(writes.getTask).mockResolvedValue(null);

    await expect(new TaskWrites(writes).execute({
      type: 'toggle-completion',
      userId: 'user-1',
      taskId: 'task-1',
    })).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(writes.updateTask).not.toHaveBeenCalled();
  });

  it('rejects reminder configuration when its persistence is unavailable', async () => {
    await expect(new TaskWrites(persistence()).configureReminder({
      userId: 'user-1',
      taskId: 'task-1',
      reminders: [],
    })).rejects.toThrow('Task reminder configuration persistence is not configured');
  });

  it('normalizes full ordinary updates without a recurring compatibility seam', async () => {
    const writes = persistence();

    await new TaskWrites(
      writes,
      () => new Date('2026-08-03T09:00:00.000Z'),
    ).execute({
      type: 'update',
      userId: 'user-1',
      taskId: 'task-1',
      values: {
        title: ' title ',
        description: ' description ',
        priority: 2,
        category_id: 'category-1',
        due_date: '2026-08-05',
        due_time: '09:00',
        completion_difficulty: 3,
        status: 'in_progress',
        section: 'work',
        sort_order: 7,
        project_id: 'project-1',
      },
    });

    expect(writes.updateTask).toHaveBeenCalledWith(
      'task-1',
      'user-1',
      expect.objectContaining({
        title: 'title',
        description: 'description',
        priority: 2,
        category_id: 'category-1',
        due_date: '2026-08-05',
        due_time: '09:00',
        completion_difficulty: 3,
        section: 'work',
        sort_order: 7,
        project_id: 'project-1',
        status: 'in_progress',
        is_completed: false,
        completed_at: null,
      }),
    );
  });

  it('rejects unsupported write intents', async () => {
    await expect(
      new TaskWrites(persistence()).execute({ type: 'unsupported' } as never),
    ).rejects.toThrow('Unsupported task write intent');
  });

  it('returns typed reminder validation outcomes for malformed requests', async () => {
    const writes = new TaskWrites(persistence());
    const requests = [
      [null, 'request', 'Task reminder request is required'],
      [{ userId: '', taskId: 'task-1', reminders: [] }, 'userId', 'User identity is required'],
      [{ userId: 'user-1', taskId: '', reminders: [] }, 'taskId', 'Task identity is required'],
      [{ userId: 'user-1', taskId: 'task-1', reminders: 'no' }, 'reminders', 'reminders must be an array'],
      [{ userId: 'user-1', taskId: 'task-1', reminders: [null] }, 'reminders[0]', 'Reminder type is invalid'],
      [{ userId: 'user-1', taskId: 'task-1', reminders: [{ reminderType: 'relative', channels: [] }] }, 'reminders[0].channels', 'At least one reminder channel is required'],
      [{ userId: 'user-1', taskId: 'task-1', reminders: [{ reminderType: 'relative', relativeMinutes: 1, channels: ['sms'] }] }, 'reminders[0].channels', 'Reminder channel is invalid'],
    ] as const;

    for (const [request, field, message] of requests) {
      await expect(writes.configureReminders(request as never)).resolves.toEqual({
        type: 'invalid',
        field,
        message,
      });
    }
  });
});
