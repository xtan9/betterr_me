// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), external: vi.fn(), rpc: vi.fn(), single: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: m.auth }));
vi.mock('@/lib/google/planning', () => ({ googleDayRange: m.external }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }));
import { POST } from '@/app/api/mobile/planning/command/route';
const id = '70000000-0000-0000-0000-000000000003';
const body = { date: '2030-01-01', timezone: 'UTC', events: [{ kind: 'event-create', id, changes: { title: 'Work', start_date: '2030-01-01', end_date: '2030-01-01', start_time: '09:00', end_time: '10:00', timezone: 'UTC' } }], capture: { items: [] } };
const request = () => new Request('https://backend.test/api/mobile/planning/command', { method: 'POST', body: JSON.stringify({ operation: 'accept', operationId: id, proposalId: id, expectedVersion: id }) });
beforeEach(() => {
  vi.clearAllMocks(); const query = { select: () => query, eq: m.eq, maybeSingle: m.single }; m.eq.mockReturnValue(query);
  m.auth.mockResolvedValue({ userId: 'owner', client: { from: () => query, rpc: m.rpc } });
  m.single.mockResolvedValue({ data: { body, state: 'pending', version: id, proposal_type: 'schedule' } });
  m.external.mockResolvedValue([]); m.rpc.mockResolvedValue({ data: { status: 'complete' } });
});
it('blocks new Google conflicts before acceptance, checking the authenticated owner', async () => {
  m.external.mockResolvedValue([{ ...body.events[0].changes, id: 'external', is_protected: true, app_owned: false }]);
  expect((await POST(request())).status).toBe(409); expect(m.rpc).not.toHaveBeenCalled();
  expect(m.eq).toHaveBeenCalledWith('user_id', 'owner'); expect(m.external).toHaveBeenCalledWith('owner', '2030-01-01', '2030-01-01', 'UTC');
});
it('fails closed on unavailable Google data and permits a verified free interval', async () => {
  m.external.mockRejectedValueOnce(new Error('unavailable'));
  expect((await POST(request())).status).toBe(503); expect(m.rpc).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(200); expect(m.rpc).toHaveBeenCalledOnce();
});
it('returns an already-applied result without requiring another Google read', async () => {
  m.single.mockResolvedValue({ data: { body, state: 'accepted', version: 'changed', proposal_type: 'schedule' } });
  expect((await POST(request())).status).toBe(200); expect(m.external).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledOnce();
});
