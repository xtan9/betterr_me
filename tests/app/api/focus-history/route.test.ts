// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ native: vi.fn(), cookie: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: mocks.native }));
vi.mock('@/lib/auth/authenticated-request', () => ({ authenticateRequest: mocks.cookie }));
import { GET, POST } from '@/app/api/mobile/focus/history/route';
import { GET as webGET } from '@/app/api/focus/history/route';

const sourceId = 'f0100000-0000-4000-8000-000000000001';
const eventId = 'f0100000-0000-4000-8000-000000000002';
const sessionId = 'f0100000-0000-4000-8000-000000000003';
const owner = 'f0100000-0000-4000-8000-000000000004';
const event = {
  id: eventId, sequence: 1, kind: 'focus-session-completed', observedAt: 1_790_000_060_000, appVersion: '0.1.0',
  session: {
    id: sessionId, startedAt: 1_790_000_000_000, endedAt: 1_790_000_060_000, completedRounds: 0,
    settings: { preset: 'open', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 20, longBreakEvery: 4 },
    link: { kind: 'task', id: 'deleted-task', title: 'Finished offline', projectName: null },
    segments: [{ start: 1_790_000_000_000, end: 1_790_000_030_000 }],
  },
};
const upload = { schemaVersion: 1, source: { id: sourceId, label: 'iPhone', platform: 'ios' }, events: [event] };
const request = (body: unknown) => new Request('https://betterr.me/api/mobile/focus/history', {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockResolvedValue({ userId: owner, client: { rpc: mocks.rpc } });
  mocks.cookie.mockResolvedValue({ ok: true, principal: { type: 'user', userId: owner, credential: 'cookie' }, client: { rpc: mocks.rpc } });
});

it('acknowledges a sanitized completed session and can read its historical snapshot', async () => {
  const acknowledgment = { schemaVersion: 1, sourceId, acceptedEventIds: [eventId], acknowledgedThrough: 1 };
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', ...acknowledgment }, error: null });
  const saved = await POST(request(upload));
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual(acknowledgment);
  expect(saved.headers.get('Cache-Control')).toBe('no-store');
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', items: [{ position: 1, source: upload.source, event, receivedAt: 1_790_000_070_000 }] }, error: null });
  const read = await GET(new Request('https://betterr.me/api/mobile/focus/history'));
  expect(await read.json()).toEqual({ schemaVersion: 1, items: [{ source: upload.source, event, receivedAt: 1_790_000_070_000 }], nextCursor: null });
});

it('exposes the same bounded historical records through a verified web cookie session', async () => {
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', items: [
    { position: 3, source: upload.source, event, receivedAt: 1_790_000_070_000 },
    { position: 5, source: upload.source, event: { ...event, id: sessionId, sequence: 2 }, receivedAt: 1_790_000_080_000 },
  ] }, error: null });
  const response = await webGET(new Request('https://betterr.me/api/focus/history?limit=1'));
  const first = await response.json();
  expect(response.status).toBe(200); expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTypeOf('string');
  mocks.rpc.mockResolvedValueOnce({ data: { status: 'complete', items: [] }, error: null });
  expect(await (await GET(new Request(`https://betterr.me/api/mobile/focus/history?after=${first.nextCursor}`))).json())
    .toEqual({ schemaVersion: 1, items: [], nextCursor: null });
});

it.each([
  { ...upload, userId: owner },
  { ...upload, source: { ...upload.source, userId: owner } },
  { ...upload, events: [{ ...event, session: { ...event.session, permission: true } }] },
  { ...upload, events: [{ ...event, session: { ...event.session, settings: { ...event.session.settings, blocking: { selectionId: 'private-token' } } } }] },
  { ...upload, events: [{ ...event, session: { ...event.session, segments: [{ start: 1_790_000_000_000, end: 1_790_000_100_000 }] } }] },
  { ...upload, events: [{ ...event, sequence: 0 }] },
  { ...upload, events: [event, event] },
  { ...upload, events: Array.from({ length: 26 }, (_, sequence) => ({ ...event, sequence: sequence + 1 })) },
])('rejects invalid or nonportable data before persistence', async body => {
  const response = await POST(request(body));
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: 'invalid' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('bounds raw streamed payloads even without Content-Length', async () => {
  const response = await POST(request({ padding: 'x'.repeat(256 * 1024) }));
  expect(response.status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not disclose records without verified native or web credentials', async () => {
  mocks.native.mockResolvedValue(null); mocks.cookie.mockResolvedValue({ ok: false, status: 401 });
  expect((await POST(request(upload))).status).toBe(401);
  expect((await GET(new Request('https://betterr.me/api/mobile/focus/history'))).status).toBe(401);
  expect((await webGET(new Request('https://betterr.me/api/focus/history'))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each(['?after=abc', '?userId=someone', '?limit=101', '?limit=1&limit=2'])('rejects ambiguous or invalid history query %s', async query => {
  expect((await GET(new Request(`https://betterr.me/api/mobile/focus/history${query}`))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  [{ data: { status: 'conflict' }, error: null }, 409],
  [{ data: null, error: { code: 'PGRST202' } }, 503],
  [{ data: { status: 'complete', schemaVersion: 1, sourceId, acceptedEventIds: [], acknowledgedThrough: 1 }, error: null }, 503],
])('retains honest failure semantics when persistence cannot acknowledge the upload', async (result, status) => {
  mocks.rpc.mockResolvedValue(result);
  expect((await POST(request(upload))).status).toBe(status);
});
