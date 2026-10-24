// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), cookie: vi.fn(), rpc: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: mocks.logError } }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: mocks.native }));
vi.mock('@/lib/auth/authenticated-request', () => ({ authenticateRequest: mocks.cookie }));
import { GET, POST } from '@/app/api/mobile/focus/app-limits/continuations/route';
import { GET as contextGET } from '@/app/api/mobile/focus/app-limits/continuations/context/route';
import { GET as webGET } from '@/app/api/focus/app-limits/continuations/route';
const id = (n: number) => `f0300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = { id: id(1), label: 'Old phone', platform: 'ios' };
const snapshot = { label: 'Social', day: '2026-10-24', dailyUnlocks: 3, minutes: 5, current: 2, best: 4, status: 'paused', usedToday: 0, overridesToday: 0 };
const command = { schemaVersion: 1, operationId: id(10), source: { sourceId: source.id, ruleId: id(2), expectedCheckpoint: 1, expectedEvent: { eventId: id(3), sequence: 1 } },
  destination: { source: { ...source, id: id(4), label: 'New phone' }, ruleId: id(5), expectedCheckpoint: 0, expectedRuleEvent: null, applyEventId: id(6), label: 'New social', dailyUnlocks: 2, minutes: 5 } };
const receipt = { schemaVersion: 1, operationId: command.operationId, confirmedAt: 1790000070000,
  source: { source, ruleId: id(2), checkpoint: 1, event: command.source.expectedEvent, snapshot, observedAt: 1790000060000, receivedAt: 1790000065000 },
  destination: command.destination, restored: { current: 2, best: 4 } };
const result = { schemaVersion: 1, receipt, application: { state: 'awaiting-device' } };
const post = (body: unknown) => POST(new Request('https://example.test/api/mobile/focus/app-limits/continuations', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); mocks.native.mockResolvedValue({ client: { rpc: mocks.rpc } }); mocks.cookie.mockResolvedValue({ ok: true, client: { rpc: mocks.rpc } }); });
it('confirms only the selected server version and recovers the receipt through native and web read adapters', async () => {
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', ...result }, error: null });
  expect(await (await post(command)).json()).toEqual(result);
  expect(mocks.rpc).toHaveBeenCalledWith('app_limit_continuation_confirm', { p_request: command });
  for (const read of [GET, webGET]) {
    const response = await read(new Request(`https://example.test/api/focus/app-limits/continuations?operationId=${command.operationId}`));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(await response.json()).toEqual(result);
  }
});
it('looks up recorded lineage after local receipt loss and uses the same owner-checked operation', async () => {
  const recorded = { ...result, application: { state: 'recorded', eventId: command.destination.applyEventId, sequence: 1, receivedAt: 1790000080000 } };
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', ...recorded }, error: null });
  expect(await (await GET(new Request(`https://example.test/?destinationSourceId=${id(4)}&applyEventId=${id(6)}`))).json()).toEqual(recorded);
  expect(mocks.rpc).toHaveBeenCalledWith('app_limit_continuation_read', { p_operation: null, p_destination: id(4), p_event: id(6) });
  mocks.rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null });
  expect((await GET(new Request(`https://example.test/?destinationSourceId=${id(4)}&applyEventId=${id(6)}`))).status).toBe(404);
});
it('returns review context without creating a receipt', async () => {
  const context = { schemaVersion: 1, source: { source, ruleId: id(2), acknowledgedThrough: 1, maxReceivedSequence: 1,
    latest: { version: command.source.expectedEvent, snapshot, observedAt: 1790000060000, receivedAt: 1790000065000 } },
    destination: { sourceId: id(4), acknowledgedThrough: 0, maxReceivedSequence: 0, latestRule: null }, eligibility: { allowed: true, reason: null } };
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', ...context }, error: null });
  expect(await (await contextGET(new Request(`https://example.test/?sourceId=${id(1)}&sourceRuleId=${id(2)}&destinationSourceId=${id(4)}&destinationRuleId=${id(5)}`))).json()).toEqual(context);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls[0][0]).toBe('app_limit_continuation_context');
});
it.each([
  { ...command, owner: 'other' }, { ...command, restored: { current: 999 } },
  { ...command, destination: { ...command.destination, token: 'secret' } },
  { ...command, destination: { ...command.destination, authorizationApproved: true } },
  { ...command, destination: { ...command.destination, label: ' ' } },
  { ...command, destination: { ...command.destination, expectedCheckpoint: Number.MAX_SAFE_INTEGER } },
  { ...command, source: { ...command.source, expectedEvent: { ...command.source.expectedEvent, receipt: 'fake' } } },
])('rejects unsupported client authority and native state', async body => {
  expect((await post(body)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['', `operationId=${id(10)}&operationId=${id(10)}`, `operationId=${id(10)}&applyEventId=${id(6)}`, `destinationSourceId=${id(4)}`, `operationId=${id(10)}&owner=x`])('rejects ambiguous receipt lookup', async query => {
  expect((await GET(new Request(`https://example.test/?${query}`))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([['source_changed', 409], ['source_incomplete', 409], ['destination_not_pristine', 409], ['operation_conflict', 409], ['source_ended', 422], ['settings_loosened', 422], ['not_found', 404], ['unavailable', 503]])('preserves actionable %s response', async (status, expected) => {
  mocks.rpc.mockResolvedValue({ data: { status }, error: null });
  const response = await post(command); expect(response.status).toBe(expected); expect(await response.json()).toEqual({ error: status });
});
it('bounds input before RPC and refuses invalid server records', async () => {
  expect((await post({ ...command, extra: 'x'.repeat(17_000) })).status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', ...result, receipt: { ...receipt, restored: { current: 999, best: 999 } } }, error: null });
  expect((await post(command)).status).toBe(503);
  mocks.native.mockResolvedValue(null); expect((await post(command)).status).toBe(401);
  mocks.cookie.mockResolvedValue({ ok: false, status: 401 }); expect((await webGET(new Request(`https://example.test/?operationId=${id(10)}`))).status).toBe(401);
});

const operations = [
  { scope: 'confirm', invoke: () => post(command), rpc: 'app_limit_continuation_confirm', args: { p_request: command } },
  { scope: 'read', invoke: () => GET(new Request(`https://example.test/?operationId=${id(10)}`)), rpc: 'app_limit_continuation_read', args: { p_operation: id(10), p_destination: null, p_event: null } },
  { scope: 'read', invoke: () => webGET(new Request(`https://example.test/?destinationSourceId=${id(4)}&applyEventId=${id(6)}`)), rpc: 'app_limit_continuation_read', args: { p_operation: null, p_destination: id(4), p_event: id(6) } },
  { scope: 'context', invoke: () => contextGET(new Request(`https://example.test/?sourceId=${id(1)}&sourceRuleId=${id(2)}&destinationSourceId=${id(4)}&destinationRuleId=${id(5)}`)), rpc: 'app_limit_continuation_context', args: { p_source: id(1), p_rule: id(2), p_destination: id(4), p_destination_rule: id(5) } },
];
it.each(operations)('fails $scope safely on RPC errors and keeps diagnostic bodies private', async operation => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private source snapshot', details: 'Bearer private-token', hint: 'private SQL' } });
  const response = await operation.invoke();
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.rpc).toHaveBeenCalledWith(operation.rpc, operation.args);
  expect(mocks.logError.mock.calls).toEqual([[`[app-limit-continuations.${operation.scope}] request failed`, undefined, { category: 'rpc_error', rpcCode: 'PGRST202' }]]);
});

it.each(operations)('fails $scope closed if the database returns a malformed receipt or context', async operation => {
  mocks.rpc.mockResolvedValue({ data: { status: 'complete', ...result, receipt: { ...receipt, destination: { ...receipt.destination, selectionToken: 'private-token' } } }, error: null });
  const response = await operation.invoke();
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.logError.mock.calls).toEqual([[`[app-limit-continuations.${operation.scope}] request failed`, undefined, { category: 'invalid_response' }]]);
});
it.each(operations)('reports unexpected $scope failures without exception contents', async operation => {
  mocks.rpc.mockRejectedValueOnce(new Error('private source snapshot and Bearer private-token'));
  const response = await operation.invoke();
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
  expect(mocks.logError.mock.calls).toEqual([[`[app-limit-continuations.${operation.scope}] request failed`, undefined, { category: 'unexpected' }]]);
});
