// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { googleConnectionStore } from '@/lib/google/store';
import type { ConnectionRecord } from '@/lib/google/contracts';
const root = process.env.GOOGLE_CONNECTIONS_TEST_URL;
describe.skipIf(!root)('Google connections against disposable Postgres and PostgREST', () => {
  let admin: SupabaseClient, user: SupabaseClient, anon: SupabaseClient;
  const owner = '70000000-0000-0000-0000-000000000001', other = '70000000-0000-0000-0000-000000000002';
  beforeAll(async () => {
    if (root !== 'http://127.0.0.1:55462') throw new Error('Only the dedicated disposable target is allowed');
    const client = async (role: string) => {
      const token = await new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setSubject(owner).setExpirationTime('1h').sign(new TextEncoder().encode('google-connection-disposable-verification-secret'));
      return createClient(root!, 'local-fixture', { global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, init) => fetch(String(url).replace('/rest/v1', ''), init) }, auth: { persistSession: false, autoRefreshToken: false } });
    };
    admin = await client('service_role'); user = await client('authenticated'); anon = await client('anon');
  });
  it('isolates records, consumes state once under concurrency and rejects stale saves after disconnect', async () => {
    await admin.from('google_connection_attempts').delete().eq('user_id', owner);
    await admin.from('google_connections').delete().eq('user_id', owner);
    const store = googleConnectionStore(admin), revision = randomUUID();
    const record: ConnectionRecord = { userId: owner, service: 'gmail', revision, status: 'disconnected', email: null, credential: null, subject: null, selectedCalendars: [] };
    await store.begin(record, 'hash', { userId: owner, service: 'gmail', revision, verifier: 'encrypted-only', expiresAt: new Date(Date.now() + 60000).toISOString() }, null);
    expect(await store.list(other)).toEqual([]);
    expect(await store.consume(other, 'hash', new Date().toISOString())).toBeNull();
    const results = await Promise.all([store.consume(owner, 'hash', new Date().toISOString()), store.consume(owner, 'hash', new Date().toISOString())]);
    expect(results.filter(Boolean)).toHaveLength(1);
    for (const client of [user, anon]) {
      expect((await client.from('google_connections').select('*')).error).not.toBeNull();
      expect((await client.from('google_connection_attempts').select('*')).error).not.toBeNull();
      expect((await client.from('google_connections').update({ credential: 'injected' }).eq('user_id', owner)).error).not.toBeNull();
    }
    expect(await store.remove(owner, 'gmail', revision)).toBe(true);
    expect(await store.save({ ...record, status: 'connected', credential: 'late-secret' }, revision)).toBe(false);
    await expect(store.begin({ ...record, revision: randomUUID() }, 'late', { userId: owner, service: 'gmail', revision, verifier: 'encrypted-only', expiresAt: new Date().toISOString() }, revision)).rejects.toMatchObject({ reason: 'conflict' });
    expect(await store.get(owner, 'gmail')).toBeNull();
    expect((await admin.from('google_connection_attempts').select('*').eq('user_id', owner)).data).toEqual([]);
  });
  it('atomically replaces the state with its connection revision under competing starts', async () => {
    await admin.from('google_connection_attempts').delete().eq('user_id', owner);
    await admin.from('google_connections').delete().eq('user_id', owner);
    const store = googleConnectionStore(admin), base = randomUUID();
    const record: ConnectionRecord = { userId: owner, service: 'gmail', revision: base, status: 'disconnected', email: null, credential: null, subject: null, selectedCalendars: [] };
    const attempt = { userId: owner, service: 'gmail' as const, revision: base, verifier: 'encrypted', expiresAt: new Date(Date.now() + 60000).toISOString() };
    await store.begin(record, 'base', attempt, null);
    const revisions = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled(revisions.map((revision, index) => store.begin({ ...record, revision }, `race-${index}`, { ...attempt, revision }, base)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.findIndex(result => result.status === 'fulfilled');
    expect((await store.get(owner, 'gmail'))?.revision).toBe(revisions[winner]);
    expect((await store.consume(owner, `race-${winner}`, new Date().toISOString()))?.revision).toBe(revisions[winner]);
    for (const client of [user, anon]) expect((await client.rpc('google_connection_begin', { p_record: {}, p_state_hash: 'bad', p_verifier: 'bad', p_expires_at: new Date().toISOString(), p_expected_revision: null })).error).not.toBeNull();
  });
});
