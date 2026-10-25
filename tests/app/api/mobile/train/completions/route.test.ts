import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/mobile/train/completions/route';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { log } from '@/lib/logger';

vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }));
const owner = '64150000-0000-4000-8000-000000000001';
const id = '64150000-0000-4000-8000-000000000010';
const source = '64150000-0000-4000-8000-000000000020';
const receipt = { operation: 'create-completed', operationId: id, ownerId: owner, workoutId: id, sourceId: source, acceptedAt: '2026-10-25T10:02:00.000Z' };
const rpc = vi.fn();
const request = (body: unknown) => new Request('https://example.test/api/mobile/train/completions', { method: 'POST', headers: { authorization: 'Bearer captured-session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('native completed workout upload HTTP contract', () => {
  beforeEach(() => {
    vi.mocked(log.error).mockClear();
    vi.mocked(authenticateNativeRequest).mockResolvedValue({ userId: owner, client: { rpc } } as never);
    rpc.mockReset().mockResolvedValue({ data: { status: 'accepted', receipt }, error: null });
  });
  it('returns the stored receipt and preserves the frozen completion across a retry', async () => {
    const completion = { version: 1, id, ownerId: owner, sourceId: source, planId: ' opaque provenance ',
      exercises: [{ definition: { name: { en: ' Captured name ', zh: '已记录' } },
        sets: [{ performed: { weightKg: 0.123, reps: Number.MAX_SAFE_INTEGER } }] }], deferred: null };
    const envelope = { protocolVersion: 1, operationId: id, completion };
    const response = await POST(request(envelope));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ protocolVersion: 1, receipt });
    expect(await (await POST(request(envelope))).json()).toEqual({ protocolVersion: 1, receipt });
    expect(rpc).toHaveBeenLastCalledWith('upload_completed_workout', { p_operation_id: id, p_completion: completion });
  });
  it('does not turn a changed payload conflict or an unavailable database into acknowledgment', async () => {
    const envelope = { protocolVersion: 1, operationId: id, completion: { ownerId: owner, id } };
    rpc.mockResolvedValueOnce({ data: { status: 'operation_conflict' }, error: null });
    const conflict = await POST(request(envelope));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ protocolVersion: 1, error: { code: 'operation_conflict' } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    const failed = await POST(request(envelope));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    expect(log.error).toHaveBeenCalledExactlyOnceWith('[train] Completed workout upload unavailable', undefined, { classification: 'rpc_error' });
  });
  it('leaves document keys for authoritative rejection instead of stripping them into a valid upload', async () => {
    const completion = JSON.parse(`{"ownerId":"${owner}","id":"${id}","__proto__":{"untrusted":"keep for rejection"}}`);
    rpc.mockResolvedValue({ data: { status: 'invalid_completion' }, error: null });
    expect((await POST(request({ protocolVersion: 1, operationId: id, completion }))).status).toBe(422);
    expect(Object.hasOwn(rpc.mock.calls[0][1].p_completion, '__proto__')).toBe(true);
  });
  it('reports unexpected failures without reflecting request, session or exception data', async () => {
    vi.mocked(authenticateNativeRequest).mockRejectedValue(new Error('Bearer private-token; private workout payload'));
    const response = await POST(request({ protocolVersion: 1, operationId: id, completion: { id, ownerId: owner } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    expect(log.error).toHaveBeenCalledExactlyOnceWith('[train] Completed workout upload unavailable', undefined, { classification: 'unexpected_exception' });
  });
  it('records an invalid RPC response without reflecting its untrusted status', async () => {
    rpc.mockResolvedValue({ data: { status: 'private workout data' }, error: null });
    const response = await POST(request({ protocolVersion: 1, operationId: id, completion: { id, ownerId: owner } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    expect(log.error).toHaveBeenCalledExactlyOnceWith('[train] Completed workout upload unavailable', undefined, { classification: 'invalid_rpc_response' });
  });
  it.each([
    [null, 400, 'invalid_request'], [[], 400, 'invalid_request'], ['text', 400, 'invalid_request'],
    [{}, 422, 'unsupported_version'], [{ protocolVersion: 2 }, 422, 'unsupported_version'],
    [{ protocolVersion: 1, operationId: 'invalid', completion: {} }, 400, 'invalid_request'],
    [{ protocolVersion: 1, operationId: id, completion: [] }, 400, 'invalid_request'],
    [{ protocolVersion: 1, operationId: id, completion: {}, extra: true }, 400, 'invalid_request'],
    [{ protocolVersion: 1, operationId: id, completion: { ownerId: owner, id: source } }, 422, 'invalid_completion'],
  ])('keeps transport status semantics for %j', async (body, status, code) => {
    const response = await POST(request(body));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ protocolVersion: 1, error: { code } });
    expect(rpc).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
  it('rejects another owner and unsupported envelopes before any remote mutation', async () => {
    const denied = await POST(request({ protocolVersion: 1, operationId: id, completion: { ownerId: 'another-owner', id } }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe('owner_mismatch');
    const unsupported = await POST(request({ protocolVersion: 2 }));
    expect(unsupported.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    vi.mocked(authenticateNativeRequest).mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401);
  });
});
