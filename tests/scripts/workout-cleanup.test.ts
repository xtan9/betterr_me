import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { deleteFixtureWorkout } from '../../scripts/e2e/workout-cleanup.mjs';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workoutId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(read: unknown, outcome?: unknown) {
  const rpc = vi.fn().mockResolvedValueOnce({ data: read, error: null }).mockImplementationOnce((_name, args) => Promise.resolve({ error: null, data: outcome ?? { protocolVersion: 1, receipt: { ownerId, workoutId, operationId: args.p_request.operationId, operation: 'delete-workout', revision: '8', current: { id: workoutId, ownerId, revision: '8', state: 'deleted' } } } }));
  const query = { delete: vi.fn(), eq: vi.fn(), neq: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  const queryLog: Array<{ table: string; method: string; args: unknown[] }> = [];
  let table = '';
  for (const method of ['delete', 'eq', 'neq'] as const) query[method].mockImplementation((...args: unknown[]) => {
    queryLog.push({ table, method, args });
    return query;
  });
  const from = vi.fn((name: string) => {
    table = name;
    queryLog.push({ table, method: 'from', args: [name] });
    return query;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, query, queryLog };
}
const current = { protocolVersion: 1, record: { id: workoutId, ownerId, revision: '7', state: 'alive' } };

describe('disposable workout cleanup', () => {
  it('uses the current revision for completed deletion and never falls back to a raw delete', async () => {
    const f = fixture(current);
    await deleteFixtureWorkout(f.client, ownerId, workoutId);
    expect(f.rpc).toHaveBeenNthCalledWith(1, 'read_train_history_record', { p_id: workoutId });
    expect(f.rpc).toHaveBeenNthCalledWith(2, 'execute_train_history_command', { p_request: {
      protocolVersion: 1, ownerId, operationId: expect.any(String), command: { kind: 'delete-workout', workoutId, expectedRevision: '7' },
    } });
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(['version_conflict', 'not_found'])('leaves a rejected %s deletion visible as failure', async code => {
    const f = fixture(current, { protocolVersion: 1, error: { code }, rejection: { code } });
    await expect(deleteFixtureWorkout(f.client, ownerId, workoutId)).rejects.toThrow('Fixture workout deletion was not accepted');
    expect(f.from).not.toHaveBeenCalled();
  });
  it('propagates a failed authority read without destructive fallback', async () => {
    const f = fixture(current); const failure = new Error('read interrupted');
    f.rpc.mockReset().mockResolvedValueOnce({ data: null, error: failure });
    await expect(deleteFixtureWorkout(f.client, ownerId, workoutId)).rejects.toBe(failure);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('propagates a failed delete command without raw fallback', async () => {
    const f = fixture(current); const failure = new Error('command interrupted');
    f.rpc.mockReset().mockResolvedValueOnce({ data: current, error: null }).mockResolvedValueOnce({ data: null, error: failure });
    await expect(deleteFixtureWorkout(f.client, ownerId, workoutId)).rejects.toBe(failure);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('reports failed draft cleanup instead of claiming removal', async () => {
    const f = fixture({ status: 'not_found' }); const failure = new Error('draft delete failed');
    f.query.then = resolve => Promise.resolve({ error: failure }).then(resolve);
    await expect(deleteFixtureWorkout(f.client, ownerId, workoutId)).rejects.toBe(failure);
  });
  it('accepts an existing owned tombstone without another mutation', async () => {
    const f = fixture({ ...current, record: { ...current.record, state: 'deleted' } });
    await deleteFixtureWorkout(f.client, ownerId, workoutId);
    expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.from).not.toHaveBeenCalled();
  });
  it('refuses a mismatched owner before deletion', async () => {
    const f = fixture({ ...current, record: { ...current.record, ownerId: workoutId } });
    await expect(deleteFixtureWorkout(f.client, ownerId, workoutId)).rejects.toThrow('Invalid fixture history identity');
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(['not_ready', 'not_found'])('retains owner-filtered draft cleanup when authority returns %s', async status => {
    const f = fixture({ status });
    await deleteFixtureWorkout(f.client, ownerId, workoutId);
    expect(f.queryLog).toEqual([
      { table: 'workouts', method: 'from', args: ['workouts'] },
      { table: 'workouts', method: 'delete', args: [] },
      { table: 'workouts', method: 'eq', args: ['id', workoutId] },
      { table: 'workouts', method: 'eq', args: ['user_id', ownerId] },
      ...(status === 'not_found' ? [{ table: 'workouts', method: 'neq', args: ['status', 'completed'] }] : []),
    ]);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
});
