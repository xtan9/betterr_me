import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { GoogleConnectionError, type ConnectionRecord, type GoogleConnection, type GoogleConnectionStore, type GoogleService } from './contracts';

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string };
const scopes = {
  gmail: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
  calendar: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'],
};
const allowedScopes = new Set([...scopes.gmail, ...scopes.calendar, 'profile', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']);
const digest = (text: string) => createHash('sha256').update(text).digest('base64url');
export const publicConnection = ({ service, status, email, selectedCalendars }: ConnectionRecord): GoogleConnection => ({ service, status, email, selectedCalendars });

export class GoogleConnections {
  private readonly deadline = Date.now() + 45000;
  constructor(readonly store: GoogleConnectionStore, private readonly config: GoogleConfig, private readonly send: typeof fetch = fetch) {}
  private timeout() {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new GoogleConnectionError('unavailable');
    return AbortSignal.timeout(Math.min(12000, remaining));
  }

  private crypt(value: string, userId: string, service: GoogleService, decrypt = false): string {
    const key = Buffer.from(this.config.encryptionKey, 'base64');
    if (key.length !== 32) throw new GoogleConnectionError('not-configured');
    const aad = Buffer.from(`${userId}:${service}`);
    if (decrypt) {
      const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad); decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
  }

  async start(userId: string, service: GoogleService) {
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
    const old = await this.store.get(userId, service), revision = randomUUID();
    const record: ConnectionRecord = { userId, service, revision, status: 'disconnected', email: null, subject: null, credential: null, selectedCalendars: [], ...old };
    record.revision = revision;
    await this.store.begin(record, digest(state), { userId, service, revision, verifier: this.crypt(verifier, userId, service), expiresAt: new Date(Date.now() + 10 * 60000).toISOString() }, old?.revision ?? null);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: scopes[service].join(' '), access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false', state, code_challenge: digest(verifier), code_challenge_method: 'S256' }).toString();
    return { authorizationUrl: url.toString(), state };
  }

  async finish(userId: string, state: string, code: string): Promise<GoogleConnection> {
    const attempt = await this.store.consume(userId, digest(state), new Date().toISOString());
    if (!attempt) throw new GoogleConnectionError('invalid');
    const record = await this.store.get(userId, attempt.service);
    if (!record || record.revision !== attempt.revision) throw new GoogleConnectionError('conflict');
    const result = await this.token({ code, grant_type: 'authorization_code', redirect_uri: this.config.redirectUri, code_verifier: this.crypt(attempt.verifier, userId, attempt.service, true) });
    const granted = new Set((typeof result.scope === 'string' ? result.scope : '').split(' '));
    // A pre-existing broad Google grant must not turn this connector into a writer.
    if ([...granted].some(scope => !allowedScopes.has(scope)) || scopes[attempt.service].filter(scope => scope.startsWith('https:')).some(scope => !granted.has(scope))) throw new GoogleConnectionError('reconnect');
    if (typeof result.refresh_token !== 'string' || !result.refresh_token) throw new GoogleConnectionError('reconnect');
    const identity = await this.provider('https://openidconnect.googleapis.com/v1/userinfo', result.access_token);
    if (typeof identity.sub !== 'string' || typeof identity.email !== 'string' || identity.email_verified !== true) throw new GoogleConnectionError('reconnect');
    const sameAccount = record.subject === identity.sub;
    const connected: ConnectionRecord = { ...record, revision: randomUUID(), subject: identity.sub, email: identity.email, credential: this.crypt(result.refresh_token, userId, attempt.service), selectedCalendars: sameAccount ? record.selectedCalendars : [], status: attempt.service === 'calendar' && !(sameAccount && record.selectedCalendars.length) ? 'select-calendars' : 'connected' };
    if (!await this.store.save(connected, attempt.revision)) throw new GoogleConnectionError('conflict');
    return publicConnection(connected);
  }

  private async token(parameters: Record<string, string>): Promise<Record<string, string>> {
    let response: Response;
    try { response = await this.send('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ ...parameters, client_id: this.config.clientId, client_secret: this.config.clientSecret }), signal: this.timeout(), redirect: 'error' }); }
    catch { throw new GoogleConnectionError('unavailable'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new GoogleConnectionError(result.error === 'invalid_grant' ? 'reconnect' : response.status === 429 ? 'limited' : 'unavailable');
    if (typeof result.access_token !== 'string' || !result.access_token) throw new GoogleConnectionError('unavailable');
    return result;
  }

  async provider(url: string, token: string): Promise<Record<string, unknown>> {
    const parsed = new URL(url);
    if (!['https://www.googleapis.com', 'https://gmail.googleapis.com', 'https://openidconnect.googleapis.com'].includes(parsed.origin)) throw new GoogleConnectionError('invalid');
    let response: Response;
    try { response = await this.send(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: this.timeout(), redirect: 'error', cache: 'no-store' }); }
    catch { throw new GoogleConnectionError('unavailable'); }
    if (!response.ok) throw new GoogleConnectionError(response.status === 401 ? 'reconnect' : response.status === 429 ? 'limited' : 'unavailable');
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new GoogleConnectionError('unavailable');
    return result;
  }

  async read<T>(userId: string, service: GoogleService, operation: (record: ConnectionRecord, token: string) => Promise<T>): Promise<T> {
    const record = await this.store.get(userId, service);
    if (!record?.credential || record.status === 'disconnected') throw new GoogleConnectionError('disconnected');
    if (record.status === 'reconnect') throw new GoogleConnectionError('reconnect');
    try {
      const tokens = await this.token({ grant_type: 'refresh_token', refresh_token: this.crypt(record.credential, userId, service, true) });
      const result = await operation(record, tokens.access_token);
      // A disconnect, replacement, or calendar selection during the read invalidates its result.
      if ((await this.store.get(userId, service))?.revision !== record.revision) throw new GoogleConnectionError('conflict');
      return result;
    } catch (error) {
      if (error instanceof GoogleConnectionError && error.reason === 'reconnect') await this.store.save({ ...record, status: 'reconnect' }, record.revision);
      throw error;
    }
  }

  async disconnect(userId: string, service: GoogleService) {
    const record = await this.store.get(userId, service);
    if (record && !await this.store.remove(userId, service, record.revision)) throw new GoogleConnectionError('conflict');
  }

  async revokeAccount(userId: string, service: GoogleService) {
    const record = await this.store.get(userId, service);
    if (!record?.credential) return this.disconnect(userId, service);
    const siblings = (await this.store.list(userId)).filter(row => row.subject === record.subject);
    // Stop reads locally first; retain encrypted tokens for a retry if Google is unavailable.
    const stopped = siblings.map(sibling => ({ ...sibling, status: 'reconnect' as const, revision: randomUUID() }));
    for (let i = 0; i < stopped.length; i++) if (!await this.store.save(stopped[i], siblings[i].revision)) throw new GoogleConnectionError('conflict');
    let response: Response;
    try { response = await this.send('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: this.crypt(record.credential, userId, service, true) }), signal: this.timeout(), redirect: 'error' }); }
    catch { throw new GoogleConnectionError('unavailable'); }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status !== 400 || error.error !== 'invalid_token') throw new GoogleConnectionError('unavailable');
    }
    for (const sibling of stopped) if (!await this.store.remove(userId, sibling.service, sibling.revision)) throw new GoogleConnectionError('conflict');
  }
}
