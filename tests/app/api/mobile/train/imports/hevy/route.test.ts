import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { POST } from '@/app/api/mobile/train/imports/hevy/route';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { log } from '@/lib/logger';

vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }));
const owner = '64150000-0000-4000-8000-000000000001', batchId = '64150000-0000-4000-8000-000000000002';
const csv = readFileSync('tests/fixtures/hevy-import.csv', 'utf8'), hash = createHash('sha256').update(csv).digest('hex');
const preview = { protocolVersion: 1, ownerId: owner, fingerprint: hash, workouts: 2, sets: 3, newWorkouts: 2, duplicateWorkouts: 0, changedWorkouts: 0, previousImport: null };
const rpc = vi.fn();
const request = (body: unknown) => new Request('https://example.test/api/mobile/train/imports/hevy', { method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer captured-session' } });
describe('authenticated Hevy import boundary', () => {
  beforeEach(() => {
    vi.mocked(authenticateNativeRequest).mockResolvedValue({ userId: owner, client: { rpc } } as never);
    vi.mocked(log.error).mockReset(); rpc.mockReset().mockResolvedValue({ data: preview, error: null });
  });
  it('parses quoted source rows before previewing, preserving special sets and original unit strings', async () => {
    const response = await POST(request({ protocolVersion: 1, action: 'preview', csv }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(preview);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('import_hevy_workouts'); expect(args.p_action).toBe('preview'); expect(args.p_fingerprint).toBe(hash);
    expect(args.p_workouts).toHaveLength(2);
    expect(args.p_workouts[0][0]).toEqual(['Import strength', '11 Mar 2026, 23:50', '12 Mar 2026, 00:20', 'Notes, "quoted"\nSecond line', 'Imported press', '1', 'Keep tempo', '0', 'warmup', '10', '8', '', '', '9.5']);
    expect(args.p_workouts[0][1][8]).toBe('failure');
  });
  it('rejects an unauthenticated request, invalid data and changed confirmation before a database write', async () => {
    vi.mocked(authenticateNativeRequest).mockResolvedValueOnce(null);
    expect((await POST(request({ protocolVersion: 1, action: 'commit', csv, fingerprint: hash }))).status).toBe(401);
    expect((await POST(request({ protocolVersion: 1, action: 'preview', csv: csv.replace('10,8', 'NaN,8') }))).status).toBe(422);
    expect((await POST(request({ protocolVersion: 1, action: 'commit', csv, fingerprint: '0'.repeat(64) }))).status).toBe(409);
    expect((await POST(request({ protocolVersion: 1, action: 'preview', csv, ownerId: batchId }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not acknowledge a different account or invented result counts', async () => {
    rpc.mockResolvedValueOnce({ data: { ...preview, ownerId: batchId }, error: null }).mockResolvedValueOnce({ data: { ...preview, sets: 4 }, error: null });
    expect((await POST(request({ protocolVersion: 1, action: 'preview', csv }))).status).toBe(503);
    expect((await POST(request({ protocolVersion: 1, action: 'preview', csv }))).status).toBe(503);
  });
  it('passes only the batch identity for owner-scoped undo and preserves unavailable outcomes without private logging', async () => {
    rpc.mockResolvedValueOnce({ data: { protocolVersion: 1, ownerId: owner, batchId, removedWorkouts: 1, changedWorkouts: 1 }, error: null });
    const undone = await POST(request({ protocolVersion: 1, action: 'undo', batchId }));
    expect(undone.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith('import_hevy_workouts', { p_action: 'undo', p_fingerprint: null, p_workouts: null, p_batch_id: batchId });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database and workout contents' } });
    const unavailable = await POST(request({ protocolVersion: 1, action: 'preview', csv }));
    expect(await unavailable.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    expect(log.error).toHaveBeenLastCalledWith('[train] Hevy import unavailable', undefined, { classification: 'unavailable' });
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain('private');
  });
  it('requires a complete unique committed-workout acknowledgment', async () => {
    const receipt = { protocolVersion: 1, ownerId: owner, fingerprint: hash, batchId, importedWorkouts: 2, importedSets: 3, duplicateWorkouts: 0, changedWorkouts: 0, workoutIds: [owner, batchId] };
    rpc.mockResolvedValueOnce({ data: receipt, error: null });
    expect((await POST(request({ protocolVersion: 1, action: 'commit', csv, fingerprint: hash }))).status).toBe(200);
    rpc.mockResolvedValueOnce({ data: { ...receipt, workoutIds: [owner, owner] }, error: null });
    expect((await POST(request({ protocolVersion: 1, action: 'commit', csv, fingerprint: hash }))).status).toBe(503);
  });
});
