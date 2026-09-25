// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GoogleConnections } from '@/lib/google/connections';
import { GoogleReads } from '@/lib/google/reads';
import type { ConnectionRecord, GoogleConnectionStore } from '@/lib/google/contracts';

const owner = 'user-a';
const config = { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://www.betterr.me/api/mobile/connections/callback', encryptionKey: Buffer.alloc(32, 7).toString('base64') };
function store(): GoogleConnectionStore {
  const records = new Map<string, ConnectionRecord>();
  const attempts = new Map<string, import('@/lib/google/contracts').ConnectionAttempt>();
  return {
    list: async user => [...records.values()].filter(r => r.userId === user),
    get: async (user, service) => records.get(`${user}:${service}`) ?? null,
    begin: async (record, hash, attempt) => { records.set(`${record.userId}:${record.service}`, record); attempts.set(hash, attempt); },
    consume: async (user, hash, now) => { const value = attempts.get(hash); if (!value || value.userId !== user || value.expiresAt <= now) return null; attempts.delete(hash); return value; },
    save: async (record, revision) => { const key = `${record.userId}:${record.service}`; if (records.get(key)?.revision !== revision) return false; records.set(key, record); return true; },
    remove: async (user, service, revision) => { const key = `${user}:${service}`; return records.get(key)?.revision === revision && records.delete(key); },
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = { access_token: 'access-secret', refresh_token: 'refresh-secret', scope: 'openid email https://www.googleapis.com/auth/gmail.readonly' };
describe('Google read-only connections', () => {
  it('requests read-only access separately from login, with a one-time state and PKCE', async () => {
    const service = new GoogleConnections(store(), config, vi.fn());
    const start = await service.start(owner, 'gmail');
    const url = new URL(start.authorizationUrl);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly']);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(start.state);
    expect(JSON.stringify(start)).not.toContain('secret');
  });
  it('rejects another owner and replay, and never returns provider credentials', async () => {
    const db = store();
    const send = vi.fn().mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    const service = new GoogleConnections(db, config, send);
    const start = await service.start(owner, 'gmail');
    await expect(service.finish('user-b', start.state, 'code')).rejects.toMatchObject({ reason: 'invalid' });
    expect(send).not.toHaveBeenCalled();
    const result = await service.finish(owner, start.state, 'code');
    expect(result).toEqual({ service: 'gmail', status: 'connected', email: 'a@example.com', selectedCalendars: [] });
    expect((await db.get(owner, 'gmail'))?.credential).not.toContain('refresh-secret');
    await expect(service.finish(owner, start.state, 'code')).rejects.toMatchObject({ reason: 'invalid' });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('rejects broad legacy grants instead of silently acquiring write access', async () => {
    const db = store(), send = vi.fn().mockResolvedValue(json({ ...tokens, scope: `${tokens.scope} https://www.googleapis.com/auth/gmail.modify` }));
    const service = new GoogleConnections(db, config, send), start = await service.start(owner, 'gmail');
    await expect(service.finish(owner, start.state, 'code')).rejects.toMatchObject({ reason: 'reconnect' });
    expect((await db.get(owner, 'gmail'))?.credential).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('never resurrects a disconnected connection when an OAuth response arrives late', async () => {
    const db = store(); let release!: (value: Response) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; })).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    const service = new GoogleConnections(db, config, send), start = await service.start(owner, 'gmail');
    const finish = service.finish(owner, start.state, 'code');
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await service.disconnect(owner, 'gmail'); release(json(tokens));
    await expect(finish).rejects.toMatchObject({ reason: 'conflict' });
    expect(await db.get(owner, 'gmail')).toBeNull();
  });
  it('reads selected calendars with recurrence expansion and keeps exclusive all-day ends', async () => {
    const db = store();
    const send = vi.fn().mockResolvedValueOnce(json({ ...tokens, scope: 'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly' })).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    const service = new GoogleConnections(db, config, send), reads = new GoogleReads(service), start = await service.start(owner, 'calendar');
    expect((await service.finish(owner, start.state, 'code')).status).toBe('select-calendars');
    send.mockImplementation(async (url: string) => url.endsWith('/token') ? json({ access_token: 'refreshed' }) : url.includes('/calendarList') ? json({ items: [{ id: 'chosen', summary: 'Family', accessRole: 'owner' }, { id: 'ignored', accessRole: 'reader' }] }) : json({ items: [{ id: 'all-day', summary: 'Holiday', start: { date: '2026-09-25' }, end: { date: '2026-09-26' } }, { id: 'cancelled', status: 'cancelled' }] }));
    await reads.selectCalendars(owner, ['chosen']);
    const events = await reads.events(owner, '2026-09-25T00:00:00Z', '2026-09-26T00:00:00Z');
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ calendarTitle: 'Family', start: '2026-09-25', end: '2026-09-26', allDay: true, busy: true });
    const queries = send.mock.calls.filter(([url]) => String(url).includes('/events'));
    expect(queries).toHaveLength(1); expect(String(queries[0][0])).toContain('/chosen/events');
    expect(new URL(String(queries[0][0])).searchParams.get('singleEvents')).toBe('true');
    expect(queries[0][1]?.method).toBe('GET');
  });
  it('reads relevant plain-text mail without fetching attachments and marks incomplete search results', async () => {
    const db = store(), send = vi.fn().mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    const service = new GoogleConnections(db, config, send), start = await service.start(owner, 'gmail');
    await service.finish(owner, start.state, 'code');
    send.mockImplementation(async (url: string) => url.endsWith('/token') ? json({ access_token: 'refreshed' }) : url.includes('?q=') ? json({ messages: [{ id: 'mail1' }], nextPageToken: 'more' }) : json({ payload: { headers: [{ name: 'Subject', value: 'Hello' }], parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Your appointment is tomorrow.').toString('base64url') } }, { mimeType: 'text/plain', filename: 'secret.txt', body: { data: Buffer.from('attachment contents').toString('base64url') } }] } }));
    const found = await new GoogleReads(service).mail(owner, 'newer_than:7d');
    expect(found).toMatchObject({ more: true, messages: [{ body: 'Your appointment is tomorrow.', subject: 'Hello' }] });
    expect(send.mock.calls.some(([url]) => String(url).includes('/attachments/'))).toBe(false);
  });
  it('rejects data arriving after a disconnect and invalidates revoked refresh tokens', async () => {
    const db = store(), send = vi.fn().mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    const service = new GoogleConnections(db, config, send), start = await service.start(owner, 'gmail');
    await service.finish(owner, start.state, 'code');
    send.mockResolvedValueOnce(json({ access_token: 'refreshed' }));
    await expect(service.read(owner, 'gmail', async () => { await service.disconnect(owner, 'gmail'); return 'private'; })).rejects.toMatchObject({ reason: 'conflict' });
    const retry = await service.start(owner, 'gmail');
    send.mockResolvedValueOnce(json(tokens)).mockResolvedValueOnce(json({ sub: 'google-a', email: 'a@example.com', email_verified: true }));
    await service.finish(owner, retry.state, 'code');
    send.mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    await expect(new GoogleReads(service).mail(owner, 'test')).rejects.toMatchObject({ reason: 'reconnect' });
    expect((await db.get(owner, 'gmail'))?.status).toBe('reconnect');
  });
});
