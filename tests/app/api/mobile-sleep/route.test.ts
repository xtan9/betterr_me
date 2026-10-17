// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), external: vi.fn(), rpc: vi.fn(), admin: vi.fn(), receipt: vi.fn(), events: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: m.auth }));
vi.mock('@/lib/google/planning', () => ({ googleDayRange: m.external }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.admin }) }));
import { GET, POST } from '@/app/api/mobile/sleep/route';

const id = '73000000-0000-4000-8000-000000000001';
const change = { operation: 'setup', expectedVersion: null, timezone: 'UTC', startTime: '23:00', endTime: '07:00' };
const core = { status: 'complete', token: 'core-token', effectiveDate: '2030-01-01', rangeStart: '2030-01-01', rangeEnd: '2030-01-02', timezone: 'UTC', preserved: 0,
  intervals: [{ nightDate: '2030-01-01', startDate: '2030-01-01', endDate: '2030-01-02', startTime: '23:00', endTime: '07:00', start: '2030-01-01T23:00:00Z', end: '2030-01-02T07:00:00Z' }] };
const request = (body: unknown) => new Request('https://backend.test/api/mobile/sleep', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: () => query, eq: m.eq, is: () => query, order: () => query, range: m.events, maybeSingle: m.receipt };
  m.eq.mockReturnValue(query);
  m.auth.mockResolvedValue({ userId: id, client: { from: () => query, rpc: m.rpc } });
  m.rpc.mockResolvedValue({ data: { status: 'complete', schedule: null } });
  m.admin.mockImplementation(async name => ({ data: name === 'planner_sleep_prepare' ? core : { status: 'complete' } }));
  m.receipt.mockResolvedValue({ data: null }); m.events.mockResolvedValue({ data: [] }); m.external.mockResolvedValue([]);
});
it('requires native authentication on both reads and writes', async () => {
  m.auth.mockResolvedValue(null);
  expect((await GET(new Request('https://backend.test/api/mobile/sleep'))).status).toBe(401);
  expect((await POST(request({ action: 'preview', change }))).status).toBe(401);
  expect(m.admin).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it('derives the owner from native authentication and rejects client-supplied ownership', async () => {
  expect((await POST(request({ action: 'preview', change: { ...change, userId: 'other' } }))).status).toBe(400);
  expect(m.admin).not.toHaveBeenCalled();
  const preview = await (await POST(request({ action: 'preview', change }))).json();
  expect(preview.status).toBe('complete');
  expect(m.admin).toHaveBeenCalledWith('planner_sleep_prepare', { p_owner: id, p_change: change });
  expect(m.eq).toHaveBeenCalledWith('user_id', id);
  expect(m.external).toHaveBeenCalledWith(id, core.rangeStart, core.rangeEnd, 'UTC');
  expect(m.rpc).toHaveBeenCalledWith('planner_sleep_routine_coverage', { p_start: '2029-12-31', p_end: '2030-01-02' });
});
it('rechecks external conflicts at confirmation and saves only an unchanged preview', async () => {
  const preview = await (await POST(request({ action: 'preview', change }))).json();
  const command = { action: 'save', change, operationId: id, previewToken: preview.token };
  m.external.mockResolvedValueOnce([{ id: 'external', title: 'Late meeting', start_date: '2030-01-01', end_date: '2030-01-02', start_time: '23:30', end_time: '00:30', timezone: 'UTC', app_owned: false, is_protected: true }]);
  expect(await (await POST(request(command))).json()).toEqual({ status: 'conflict' });
  expect(m.admin.mock.calls.filter(([name]) => name === 'planner_sleep_commit')).toHaveLength(0);
  expect(await (await POST(request(command))).json()).toEqual({ status: 'complete' });
  expect(m.admin).toHaveBeenCalledWith('planner_sleep_commit', { p_owner: id, p_request: command, p_token: core.token });
});
it('never writes when calendar conflict evidence is unavailable', async () => {
  m.external.mockRejectedValue(new Error('offline'));
  expect((await POST(request({ action: 'save', change, operationId: id, previewToken: 'a'.repeat(64) }))).status).toBe(503);
  expect(m.admin.mock.calls.filter(([name]) => name === 'planner_sleep_commit')).toHaveLength(0);
});
it('replays an exact committed request without needing another external read', async () => {
  const command = { action: 'save', change, operationId: id, previewToken: 'a'.repeat(64) };
  m.receipt.mockResolvedValue({ data: { request: command, outcome: { status: 'complete', scheduleId: id } } });
  expect(await (await POST(request(command))).json()).toEqual({ status: 'already-applied', scheduleId: id });
  expect(m.external).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled();
  expect(await (await POST(request({ ...command, change: { ...change, startTime: '22:00' } }))).json()).toEqual({ status: 'conflict' });
});
