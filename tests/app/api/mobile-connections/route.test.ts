// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), config: vi.fn(), start: vi.fn(), finish: vi.fn(), disconnect: vi.fn(), list: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/native-request', () => ({ authenticateNativeRequest: m.auth }));
vi.mock('@/lib/google/runtime', () => ({ googleConfig: m.config, googleRuntime: () => ({ start: m.start, finish: m.finish, disconnect: m.disconnect, store: { list: m.list } }) }));
vi.mock('@/lib/logger', () => ({ log: { error: m.log } }));
import { GET, POST } from '@/app/api/mobile/connections/route';
import { GET as callback } from '@/app/api/mobile/connections/callback/route';
const request = (body: unknown) => new Request('https://backend.test/api/mobile/connections', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: 'verified-owner' }); m.config.mockReturnValue({}); });
it('requires native authentication before touching credentials', async () => {
  m.auth.mockResolvedValue(null);
  expect((await POST(request({ action: 'start', service: 'gmail' }))).status).toBe(401);
  expect((await GET(new Request('https://backend.test/api/mobile/connections'))).status).toBe(401);
  expect(m.start).not.toHaveBeenCalled(); expect(m.list).not.toHaveBeenCalled();
});
it('derives the connection owner from the session and rejects injected scopes or identity', async () => {
  expect((await POST(request({ action: 'start', service: 'gmail', userId: 'victim' }))).status).toBe(400);
  expect((await POST(request({ action: 'start', service: 'gmail', scopes: ['gmail.modify'] }))).status).toBe(400);
  m.start.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com', state: 'safe-state' });
  expect((await POST(request({ action: 'start', service: 'gmail' }))).status).toBe(200);
  expect(m.start).toHaveBeenCalledExactlyOnceWith('verified-owner', 'gmail');
});
it('returns only public connection fields and never provider credentials', async () => {
  m.list.mockResolvedValue([{ service: 'gmail', status: 'connected', email: 'owner@example.com', selectedCalendars: [], credential: 'secret', subject: 'subject', revision: 'revision' }]);
  const response = await GET(new Request('https://backend.test/api/mobile/connections'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ configured: true, connections: [{ service: 'gmail', status: 'connected', email: 'owner@example.com', selectedCalendars: [] }] });
});
it('sanitizes failures in responses and logs', async () => {
  m.start.mockRejectedValue(new Error('secret-token-and-provider-body'));
  const response = await POST(request({ action: 'start', service: 'gmail' }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
  expect(JSON.stringify(m.log.mock.calls)).not.toContain('secret'); expect(m.log).toHaveBeenCalled();
});
it('callback only redirects to the fixed app and performs no token exchange', () => {
  const state = 'a'.repeat(43);
  const response = callback(new Request(`https://backend.test/api/mobile/connections/callback?state=${state}&code=secret-code&redirect_uri=https://evil.test`));
  const url = new URL(response.headers.get('location')!);
  expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('betterrme://connections/callback');
  expect(url.searchParams.get('state')).toBe(state); expect(url.searchParams.get('code')).toBe('secret-code');
  expect(m.finish).not.toHaveBeenCalled(); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(callback(new Request('https://backend.test/api/mobile/connections/callback?state=bad')).status).toBe(400);
});
