import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// This runner never accepts a remote target or caller-supplied credentials.
// SQL fixture policy remains in the separate constrained fixture runner.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = process.env.SUPABASE_CLI ?? 'supabase';
const psql = process.env.PSQL_BIN ?? spawnSync('which', ['psql'], { encoding: 'utf8' }).stdout?.trim();
function check(condition, label) {
  if (!condition) throw new Error(label);
}
const status = spawnSync(cli, ['status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
check(status.status === 0, 'Local Supabase must already be running');
const local = JSON.parse(status.stdout);
const api = new URL(local.API_URL);
const database = new URL(local.DB_URL);
check(api.origin === 'http://127.0.0.1:54321' && api.pathname === '/', 'Refusing non-disposable Auth/API target');
check(database.hostname === '127.0.0.1' && database.port === '54322' && database.pathname === '/postgres'
  && database.protocol === 'postgresql:', 'Refusing non-disposable PostgreSQL target');
check(typeof local.ANON_KEY === 'string' && typeof local.SERVICE_ROLE_KEY === 'string', 'Local CLI credentials unavailable');
check(psql?.startsWith('/') && spawnSync(psql, ['--version']).status === 0,
  'An absolute psql path is required for read-only local cleanup verification');

const authOptions = { persistSession: false, autoRefreshToken: false };
const admin = createClient(api.origin, local.SERVICE_ROLE_KEY, { auth: authOptions });
const users = [];
const sessions = new Map();
let child;
let stopped = false;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  check(port !== 8082, 'Shared Metro port is forbidden');
  return port;
}
async function signIn(user) {
  const client = createClient(api.origin, local.ANON_KEY, { auth: authOptions });
  const { data, error } = await client.auth.signInWithPassword(user.credentials);
  check(!error && data.session, 'Ephemeral local sign-in failed');
  sessions.set(user.id, data.session.access_token);
  return { client, token: data.session.access_token };
}
async function createUser() {
  const credentials = { email: `focus-history-${randomUUID()}@example.test`, password: randomUUID() };
  const { data, error } = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
  check(!error && data.user, 'Ephemeral local user creation failed');
  const user = { id: data.user.id, credentials };
  users.push(user);
  return user;
}
async function stopServer() {
  if (!child || stopped) return;
  stopped = true;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5_000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    if (child.exitCode !== null) { clearTimeout(timeout); resolve(); }
  });
}
async function cleanUp() {
  const failures = [];
  for (const token of sessions.values()) {
    const { error } = await admin.auth.admin.signOut(token, 'global');
    if (error && error.status !== 404) failures.push('session revocation');
  }
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) failures.push('ephemeral user deletion');
  }
  if (users.length) {
    // The service role intentionally has no SELECT grant on these tables.
    // Use the already-guarded disposable database only for cleanup inspection;
    // setup/deletion stays in Auth admin, and all history writes use user HTTP.
    check(users.every(user => /^[0-9a-f-]{36}$/i.test(user.id)), 'Invalid test identity');
    const ids = users.map(user => `'${user.id}'::uuid`).join(',');
    const query = `select
      (select count(*) from auth.users where id in (${ids})) +
      (select count(*) from auth.sessions where user_id in (${ids})) +
      (select count(*) from public.profiles where id in (${ids})) +
      (select count(*) from public.focus_history_sources where user_id in (${ids})) +
      (select count(*) from public.focus_history_events where user_id in (${ids}));`;
    const result = spawnSync(psql, [local.DB_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      input: query, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    });
    if (result.status !== 0 || result.stdout.trim() !== '0') failures.push('read-only database cleanup verification');
  }
  await stopServer();
  check(!failures.length, `Cleanup failed: ${failures.join(', ')}`);
}

try {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // Only this child receives the local public configuration. No service key,
  // hosted variables or user credentials are given to Next or written to disk.
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: api.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    check(child.exitCode === null, 'Isolated Next server exited');
    let response;
    try {
      response = await fetch(`${origin}/api/mobile/focus/history`, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    } catch { /* Startup compilation is not yet ready. */ }
    if (response) {
      check(response.status < 300 || response.status >= 400, 'History API was redirected before bearer authentication');
      if (response.status === 401) { ready = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check(ready, 'Isolated Next server did not become ready');
  console.log('PASS isolated local Next server and unauthenticated 401');

  const owner = await createUser();
  const other = await createUser();
  const a = await signIn(owner);
  const b = await signIn(other);
  const source = { id: randomUUID(), label: 'Disposable integration journal', platform: 'ios' };
  const event = sequence => ({ id: randomUUID(), sequence, kind: 'focus-session-completed', observedAt: 1_000_000 + sequence,
    appVersion: '0.1.0', session: { id: randomUUID(), startedAt: 1_000, endedAt: 61_000, completedRounds: 1,
      settings: { preset: 'quick', focusMinutes: 10, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      link: { kind: 'task', id: randomUUID(), title: 'Deleted planner link snapshot', projectName: 'Historical project' },
      segments: [{ start: 1_000, end: 61_000 }] } });
  const events = [event(1), event(2), event(3)];
  const upload = records => ({ schemaVersion: 1, source, events: records });
  async function request(path, token, body, status = 200, cookie) {
    const response = await fetch(`${origin}${path}`, { method: body ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000) });
    check(response.status === status, `${body ? 'POST' : 'GET'} ${path.split('?')[0]} expected ${status}, received ${response.status}`);
    check(response.headers.get('cache-control')?.includes('no-store'), 'History response must not be cached');
    return response.json();
  }
  const native = '/api/mobile/focus/history';
  await request(native, a.token, upload([events[0]])); // Deliberately discard the committed receipt.
  const replay = await request(native, a.token, upload([events[0]]));
  check(replay.acknowledgedThrough === 1 && replay.acceptedEventIds[0] === events[0].id, 'Lost receipt replay failed');
  check((await request(native, a.token)).items.length === 1, 'Replay duplicated completion');
  await request(native, a.token, upload([{ ...events[0], observedAt: 7 }]), 409);
  console.log('PASS durable upload, discarded-receipt replay, immutable conflict');

  const late = await request(native, a.token, upload([events[2]]));
  check(late.acknowledgedThrough === 1, 'Gap was incorrectly acknowledged');
  check((await request(native, a.token, upload([events[1]]))).acknowledgedThrough === 3, 'Filled gap did not advance checkpoint');
  const cleanClient = await signIn(owner);
  const restored = [];
  let cursor = null;
  for (let page = 0; page < 5; page++) {
    const result = await request(`${native}?limit=1${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, cleanClient.token);
    restored.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  check(cursor === null && restored.length === 3 && new Set(restored.map(item => item.event.id)).size === 3, 'Clean-client paging lost or duplicated records');
  check(restored.map(item => item.event.sequence).join(',') === '1,3,2', 'Receipt order replaced original source sequence');
  check(restored.every(item => item.event.session.link.title === 'Deleted planner link snapshot'), 'Historical link snapshot lost');
  console.log('PASS gap acknowledgement and clean-client paged history recovery');

  const cookies = new Map();
  const browser = createServerClient(api.origin, local.ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  const webSession = await browser.auth.signInWithPassword(owner.credentials);
  check(!webSession.error && webSession.data.session, 'Local cookie sign-in failed');
  sessions.set(owner.id, webSession.data.session.access_token);
  const cookie = [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
  const web = await request('/api/focus/history', null, undefined, 200, cookie);
  check(web.items.length === 3 && web.items.every((item, index) => item.event.id === restored[index].event.id), 'Cookie and bearer history diverged');
  await request('/api/focus/history', a.token, undefined, 401);
  console.log('PASS actual web cookie and native bearer adapters share history');

  check((await request(native, b.token)).items.length === 0, 'Second owner saw first owner history');
  await request(native, b.token, { ...upload([events[0]]), userId: owner.id }, 400);
  const direct = await b.client.from('focus_history_events').select('id').eq('user_id', owner.id);
  check(!direct.error && direct.data.length === 0, 'RLS exposed another owner');
  const forged = await b.client.from('focus_history_sources').insert({ user_id: owner.id, id: randomUUID(), source });
  check(Boolean(forged.error), 'Direct forged-owner mutation was allowed');
  await request(native, b.token, upload([events[0]]));
  check((await request(native, b.token)).items.length === 1 && (await request(native, a.token)).items.length === 3, 'Shared UUIDs crossed owner boundary');
  for (const forbidden of ['selectionTokens', 'activeGrant', 'authorizationApproved', 'monitorRegistration']) {
    await request(native, a.token, upload([{ ...events[0], session: { ...events[0].session, [forbidden]: true } }]), 400);
  }
  check(restored.every(item => Object.keys(item.event.session).sort().join(',')
    === ['id', 'startedAt', 'endedAt', 'completedRounds', 'settings', 'link', 'segments'].sort().join(',')), 'History contains active native state');
  console.log('PASS cross-account isolation, forged-owner denial and native-state rejection');
} finally {
  await cleanUp();
  console.log('PASS ephemeral Auth users, sessions and history rows removed; owned Next server stopped');
}
