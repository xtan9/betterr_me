import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SupabaseTaskReminderConfigurationPersistence,
  type TaskReminderConfigurationRecord,
} from '@/lib/tasks/writes';

const reminderRow = {
  id: 'reminder-1',
  user_id: 'user-1',
  source_type: 'task',
  source_id: 'task-1',
  reminder_type: 'absolute',
  relative_minutes: null,
  absolute_time: '2026-08-03T09:00:00.000Z',
  channels: ['push'],
  status: 'pending',
  fire_at: '2026-08-03T09:00:00.000Z',
  sent_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

const record: TaskReminderConfigurationRecord = {
  userId: 'user-1',
  taskId: 'task-1',
  reminders: [
    {
      reminderType: 'absolute',
      relativeMinutes: null,
      absoluteTime: '2026-08-03T09:00:00Z',
      channels: ['push'],
    },
  ],
};

describe('SupabaseTaskReminderConfigurationPersistence', () => {
  const rpc = vi.fn();
  let persistence: SupabaseTaskReminderConfigurationPersistence;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new SupabaseTaskReminderConfigurationPersistence({ rpc } as never);
  });

  it('uses one atomic task-scoped RPC and maps configured reminders', async () => {
    rpc.mockResolvedValue({
      data: { type: 'configured', reminders: [reminderRow] },
      error: null,
    });

    await expect(persistence.configureTaskReminders(record)).resolves.toEqual({
      type: 'configured',
      reminders: [{
        id: 'reminder-1',
        userId: 'user-1',
        taskId: 'task-1',
        reminderType: 'absolute',
        relativeMinutes: null,
        absoluteTime: '2026-08-03T09:00:00.000Z',
        channels: ['push'],
        status: 'pending',
        fireAt: '2026-08-03T09:00:00.000Z',
        sentAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
      }],
    });
    expect(rpc).toHaveBeenCalledWith('configure_task_reminders', {
      p_user_id: 'user-1',
      p_task_id: 'task-1',
      p_reminders: [{
        reminder_type: 'absolute',
        relative_minutes: null,
        absolute_time: '2026-08-03T09:00:00Z',
        channels: ['push'],
      }],
    });
  });

  it.each([
    ['removed', { type: 'removed', reminders: [] }],
    ['already-applied', { type: 'already-applied', reminders: [reminderRow] }],
    ['not-found', { type: 'not-found' }],
    ['conflict', { type: 'conflict', resource: 'reminder', reason: 'busy' }],
    ['invalid', { type: 'invalid', field: 'reminders', message: 'invalid' }],
  ] as const)('maps a typed %s database outcome', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(persistence.configureTaskReminders(record)).resolves.toEqual(
      data.type === 'already-applied'
        ? {
            type: 'already-applied',
            reminders: [{
              id: 'reminder-1',
              userId: 'user-1',
              taskId: 'task-1',
              reminderType: 'absolute',
              relativeMinutes: null,
              absoluteTime: '2026-08-03T09:00:00.000Z',
              channels: ['push'],
              status: 'pending',
              fireAt: '2026-08-03T09:00:00.000Z',
              sentAt: null,
              createdAt: '2026-08-01T00:00:00.000Z',
            }],
          }
        : data,
    );
  });

  it('propagates infrastructure failures and rejects malformed outcomes', async () => {
    const failure = { code: '42P01', message: 'function missing' };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(persistence.configureTaskReminders(record)).rejects.toBe(failure);

    rpc.mockResolvedValue({ data: { type: 'configured', reminders: [{ id: 'bad' }] }, error: null });
    await expect(persistence.configureTaskReminders(record)).rejects.toThrow(
      'Invalid task reminder returned by the database',
    );

    rpc.mockResolvedValue({ data: { type: 'unexpected' }, error: null });
    await expect(persistence.configureTaskReminders(record)).rejects.toThrow(
      'Invalid task reminder configuration outcome returned by the database',
    );
  });

  it('maps reminder conflicts and foreign-key misses without leaking database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    await expect(persistence.configureTaskReminders(record)).resolves.toEqual({
      type: 'conflict',
      resource: 'reminder',
    });

    rpc.mockResolvedValue({ data: null, error: { code: '23503', message: 'missing task' } });
    await expect(persistence.configureTaskReminders(record)).resolves.toEqual({
      type: 'not-found',
    });
  });
});
