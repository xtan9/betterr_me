// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), cookie: vi.fn(), rpc: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: mocks.logError } }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: mocks.native }));
vi.mock('@/lib/auth/authenticated-request', () => ({ authenticateRequest: mocks.cookie }));
import { GET, POST } from '@/app/api/mobile/focus/app-limits/history/route';
import { GET as webGET } from '@/app/api/focus/app-limits/history/route';
const source = { id: 'f0200000-0000-4000-8000-000000000001', label: 'Native iPhone journal', platform: 'ios' };
const snapshot = { label: null, day: '2026-10-24', dailyUnlocks: 3, minutes: 5, current: 2, best: 4,
  status: 'paused', usedToday: 1, overridesToday: 0 };
const event = { schemaVersion: 1, id: 'f0200000-0000-4000-8000-000000000002', sequence: 1, kind: 'app-limit-baseline',
  observedAt: 1790000060000, appVersion: '0.1.0', ruleId: 'f0200000-0000-4000-8000-000000000003',
  reason: 'baseline', before: null, after: snapshot };
const upload = { schemaVersion: 1, source, events: [event] };
const request = (body: unknown) => new Request('https://example.test/api/mobile/focus/app-limits/history', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockResolvedValue({ userId: 'verified-owner', client: { rpc: mocks.rpc } });
  mocks.cookie.mockResolvedValue({ ok: true, client: { rpc: mocks.rpc } });
});
it('backs up an honest native baseline and exposes the same checkpoint through both read adapters', async () => {
  const ack = { schemaVersion: 1, sourceId: source.id, acceptedEventIds: [event.id], acknowledgedThrough: 1 };
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', ...ack }, error: null });
  expect(await (await POST(request(upload))).json()).toEqual(ack);
  const item = { source, event, receivedAt: 1790000070000, acknowledgedThrough: 1 };
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', items: [{ position: 1, ...item }] }, error: null });
  for (const read of [GET, webGET]) {
    const response = await read(new Request('https://example.test/api/focus/app-limits/history'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ schemaVersion: 1, items: [item], nextCursor: null });
  }
});
it.each([
  { ...upload, owner: 'forged' },
  { ...upload, source: { ...source, permission: true } },
  { ...upload, events: [{ ...event, schemaVersion: 2 }] },
  { ...upload, events: [{ ...event, after: { ...snapshot, authorizationApproved: true } }] },
  { ...upload, events: [{ ...event, before: { ...snapshot, selectionTokens: [] } }] },
  { ...upload, events: [{ ...event, after: { ...snapshot, activeGrant: {} } }] },
  { ...upload, events: [{ ...event, after: { ...snapshot, day: '2026-02-30' } }] },
  { ...upload, events: [{ ...event, after: { ...snapshot, best: 1 } }] },
  { ...upload, events: [{ ...event, after: { ...snapshot, label: ' ' } }] },
  { ...upload, events: [{ ...event, reason: 'signedOut' }] },
  { ...upload, events: [{ ...event, kind: 'app-limit-change', reason: 'extraUnlock' }] },
  { ...upload, events: [event, event] },
])('rejects forbidden state and invalid event provenance', async body => {
  expect((await POST(request(body))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('retains honest capability and authentication failures', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  expect((await POST(request(upload))).status).toBe(503);
  mocks.rpc.mockResolvedValue({ data: { status: 'conflict' }, error: null });
  expect((await POST(request(upload))).status).toBe(409);
  mocks.native.mockResolvedValue(null); mocks.cookie.mockResolvedValue({ ok: false, status: 401 });
  expect((await POST(request(upload))).status).toBe(401);
  expect((await webGET(new Request('https://example.test/api/focus/app-limits/history'))).status).toBe(401);
});
it('pages without losing source checkpoint and rejects malformed server receipts', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', items: [
    { position: 5, source, event, receivedAt: 1790000070000, acknowledgedThrough: 1 },
    { position: 6, source, event: { ...event, sequence: 3 }, receivedAt: 1790000070000, acknowledgedThrough: 1 },
  ] }, error: null });
  const response = await GET(new Request('https://example.test/api/mobile/focus/app-limits/history?limit=1'));
  const first = await response.json();
  expect(first.items).toHaveLength(1); expect(first.items[0].acknowledgedThrough).toBe(1); expect(first.nextCursor).toBeTypeOf('string');
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', schemaVersion: 1, sourceId: source.id, acceptedEventIds: [], acknowledgedThrough: 1 }, error: null });
  expect((await POST(request(upload))).status).toBe(503);
});

it.each([GET, webGET])('fails a native or web read safely when the database cannot return history', async read => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private rule history', details: 'private-token', hint: 'private SQL' } });
  const response = await read(new Request('https://example.test/api/focus/app-limits/history'));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.rpc).toHaveBeenCalledWith('app_limit_history_read', { p_after: 0, p_limit: 51 });
  expect(mocks.logError.mock.calls).toEqual([['[app-limit-history.read] request failed', undefined, { category: 'rpc_error', rpcCode: '42501' }]]);
});

const stored = { position: 1, source, event, receivedAt: 1790000070000, acknowledgedThrough: 1 };
it.each([
  null,
  { status: 'complete', items: [{ ...stored, event: { ...event, after: { ...snapshot, authorizationApproved: true } } }] },
  { status: 'complete', items: [{ ...stored, acknowledgedThrough: -1 }] },
  { status: 'complete', items: [stored, stored] },
])('refuses malformed history instead of exposing partial records or a false checkpoint', async data => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  const response = await GET(new Request('https://example.test/api/focus/app-limits/history'));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.logError.mock.calls).toEqual([['[app-limit-history.read] request failed', undefined, { category: 'invalid_response' }]]);
});
it('scopes upload failures without logging unexpected exception details', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('private rule and native token'));
  const response = await POST(request(upload));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.logError.mock.calls).toEqual([['[app-limit-history.upload] request failed', undefined, { category: 'unexpected' }]]);
});
