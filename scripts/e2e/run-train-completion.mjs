import { deleteFixtureWorkout } from './workout-cleanup.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { issueAccessToken } from '../../lib/oauth/access-token.ts';

// Actual Auth, PostgREST, cookie Web and MCP requests. Never accepts a remote
// target or caller credentials, and never resets or repairs a database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function check(ok, message) { if (!ok) throw new Error(message); }
check(process.argv.slice(2).every(arg => arg === '--hold'), 'Unknown runner argument');
const hold = process.argv.includes('--hold');
const status = spawnSync(process.env.SUPABASE_CLI ?? 'supabase', ['status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
check(status.status === 0, 'Local Supabase is not ready');
const local = JSON.parse(status.stdout);
check(local.API_URL === 'http://127.0.0.1:54321' && new URL(local.DB_URL).host === '127.0.0.1:54322'
  && new URL(local.DB_URL).pathname === '/postgres', 'Refusing a non-disposable target');
check(!existsSync(resolve(root, '.env.local')) && !existsSync(resolve(root, '.env.development.local')), 'Refusing an ambient local environment file');
const psql = process.env.PSQL_BIN ?? '/opt/homebrew/bin/psql';
const sql = input => {
  const result = spawnSync(psql, [local.DB_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8' });
  check(result.status === 0, 'Isolated SQL verification failed');
  return result.stdout.trim();
};
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth });
const users = [];
const catalogRestorations = [];
const secretsDirectory = mkdtempSync(resolve(tmpdir(), 'train-415-'));
let child;
let origin;
const endpoint = '/api/mobile/train/completions';
const receiptFile = resolve(secretsDirectory, 'accounts.json');
async function account() {
  const credentials = { email: `train-415-${randomUUID()}@example.test`, password: randomUUID() };
  const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
  check(!created.error && created.data.user, 'Disposable user creation failed');
  const user = { id: created.data.user.id, credentials };
  users.push(user);
  user.client = createClient(local.API_URL, local.ANON_KEY, { auth });
  const signed = await user.client.auth.signInWithPassword(credentials);
  check(!signed.error && signed.data.session, 'Disposable user login failed');
  user.token = signed.data.session.access_token;
  const cookies = new Map();
  const browser = createServerClient(local.API_URL, local.ANON_KEY, { auth, cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  check(!(await browser.auth.signInWithPassword(credentials)).error, 'Disposable cookie login failed');
  user.cookie = [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
  return user;
}
function completion(owner, weightKg = 0.123, reps = Number.MAX_SAFE_INTEGER, kind = 'working') {
  const id = randomUUID();
  return { protocolVersion: 1, operationId: id, completion: { version: 1, id, ownerId: owner.id, sourceId: randomUUID(),
    startedAt: '2026-10-25T10:00:00.000Z', completedAt: '2026-10-25T10:01:00.000Z', durationSeconds: 60,
    timezone: 'America/Los_Angeles', workoutDay: '2026-10-25', planId: 'opaque:unverified-provenance',
    exercises: [{ id: randomUUID(), definition: { catalogKey: 'strength.barbell-bench-press.v1',
      name: { en: 'Recorded bench, before rename', zh: '已记录卧推' }, equipment: 'barbell', mode: 'weight_reps', convention: 'barbell-total' },
    sets: [{ id: randomUUID(), performed: { weightKg, reps, kind } }] }] } };
}
async function request(path, user, body, expected = 200, cookie = false, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${origin}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json', ...(user ? cookie ? { cookie: user.cookie } : { authorization: `Bearer ${user.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  check(response.status === expected, `${method} ${path} expected ${expected}, received ${response.status}`);
  return response.json();
}
let mcpId = 0;
async function mcp(user, name, args, scopes = ['read', 'write']) {
  const token = await issueAccessToken({ userId: user.id, clientId: 'train-local-proof', scopes });
  const response = await fetch(`${origin}/mcp`, { method: 'POST', signal: AbortSignal.timeout(60_000), headers: {
    authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
  }, body: JSON.stringify({ jsonrpc: '2.0', id: ++mcpId, method: 'tools/call', params: { name, arguments: args } }) });
  check(response.status === 200, `MCP ${name} HTTP ${response.status}`);
  const text = await response.text();
  const value = JSON.parse(text.startsWith('event:') || text.startsWith('data:') ? text.split('\n').find(line => line.startsWith('data:')).slice(5) : text);
  check(value.result, `MCP ${name} missing result`);
  return value.result;
}
const parsedTool = result => JSON.parse(result.content[0].text);
function restoreCatalog() {
  for (const row of catalogRestorations.splice(0)) {
    sql(`begin; alter table public.exercises disable trigger update_exercises_updated_at;
      update public.exercises set name='${row.name.replaceAll("'", "''")}',updated_at='${row.updated_at}' where id='${row.id}';
      alter table public.exercises enable trigger update_exercises_updated_at; commit;`);
    const restored = JSON.parse(sql(`select row_to_json(t) from (select id,name,updated_at from public.exercises where id='${row.id}') t;`));
    check(isDeepStrictEqual(restored, row), 'Catalog restoration changed metadata');
  }
}
async function cleanup() {
  restoreCatalog();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  rmSync(secretsDirectory, { recursive: true, force: true });
  for (const user of users) {
    const removed = await admin.auth.admin.deleteUser(user.id);
    check(!removed.error, 'Disposable user cleanup failed');
  }
  if (users.length) {
    const ids = users.map(user => `'${user.id}'::uuid`).join(',');
    check(sql(`select (select count(*) from auth.users where id in (${ids})) + (select count(*) from auth.sessions where user_id in (${ids}))
      + (select count(*) from public.workouts where user_id in (${ids})) + (select count(*) from public.train_completion_receipts where owner_id in (${ids}))
      + (select count(*) from public.routines where user_id in (${ids})) + (select count(*) from public.exercises where user_id in (${ids}));`) === '0', 'Disposable residue remained');
  }
  console.log('PASS exact disposable users, sessions, fitness records and receipt cleanup');
}

try {
  const socket = createServer();
  await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port;
  await new Promise(done => socket.close(done));
  check(port !== 8082, 'Shared Metro port is forbidden');
  origin = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.API_KEY_HMAC_SECRET = randomBytes(32).toString('hex');
  mkdirSync(resolve(root, '.artifacts'), { recursive: true });
  const log = openSync(resolve(root, '.artifacts/train-415-http-server.log'), 'w');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, API_KEY_HMAC_SECRET: process.env.API_KEY_HMAC_SECRET, NEXT_PUBLIC_APP_URL: origin },
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  let ready = false;
  for (let i = 0; i < 90; i++) {
    check(child.exitCode === null, 'Isolated Next exited');
    try { ready = (await fetch(`${origin}${endpoint}`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) })).status === 401; } catch { /* compilation */ }
    if (ready) break;
    await new Promise(done => setTimeout(done, 500));
  }
  check(ready, 'Isolated Next did not become ready');
  const a = await account(); const b = await account();
  const active = (await request('/api/workouts', a, { title: 'Existing Web active' }, 201, true)).workout;
  const forbidden = completion(a);
  Object.defineProperty(forbidden.completion, '__proto__', { value: { mustRemainJsonData: true }, enumerable: true });
  check((await request(endpoint, a, forbidden, 422)).error.code === 'invalid_completion', 'Transport stripped a forbidden document key into an accepted completion');
  const forbiddenRows = await a.client.from('workouts').select('id').eq('id', forbidden.operationId);
  check(!forbiddenRows.error && !forbiddenRows.data.length, 'Forbidden JSON key left a workout');
  for (const patch of [
    { completedAt: 'tomorrow' }, { completedAt: '2026-10-25' }, { startedAt: '2026-10-25T10:00:00' },
    { completedAt: '2026-10-25T23:59:60Z' }, { completedAt: '2026-10-25T24:00:00Z' },
    { completedAt: '2026-02-29T10:00:00Z' }, { completedAt: '294000-01-01T00:00:00Z' },
    { timezone: 'UTC+1' }, { timezone: 'PST' }, { timezone: 'Factory' }, { timezone: 'posix/UTC' },
  ]) {
    const invalid = completion(a); Object.assign(invalid.completion, patch);
    check((await request(endpoint, a, invalid, 422)).error.code === 'invalid_completion', 'Unreadable temporal document was acknowledged');
    const rows = await a.client.from('workouts').select('id').eq('id', invalid.operationId);
    const receipts = await a.client.from('train_completion_receipts').select('operation_id').eq('operation_id', invalid.operationId);
    check(!rows.error && !receipts.error && !rows.data.length && !receipts.data.length, 'Rejected time left history or a receipt');
  }
  const temporalReadbacks = [];
  for (const patch of [
    { startedAt: '2024-02-29T23:59:59.123Z', completedAt: '2024-03-01T00:00:00Z', timezone: 'UTC', workoutDay: '2024-02-29' },
    { startedAt: '2026-11-01T01:30:00-04:00', completedAt: '2026-11-01T01:30:00-05:00', timezone: 'US/Eastern', workoutDay: '2026-11-01' },
    { timezone: 'Asia/Katmandu' }, { timezone: 'america/los_angeles' }, { timezone: 'Etc/GMT+12', workoutDay: '2026-10-24' },
  ]) {
    const value = completion(a); Object.assign(value.completion, patch);
    const receipt = await request(endpoint, a, value);
    check(isDeepStrictEqual(await request(endpoint, a, value), receipt), 'Temporal retry changed its receipt');
    const raw = await a.client.from('workouts').select('started_at,completed_at,native_completion').eq('id', value.operationId).single();
    check(!raw.error && isDeepStrictEqual(raw.data.native_completion, value.completion)
      && Date.parse(raw.data.started_at) === Date.parse(value.completion.startedAt)
      && Date.parse(raw.data.completed_at) === Date.parse(value.completion.completedAt), 'Explicit instant changed during readback');
    check(new Intl.DateTimeFormat('en-CA', { timeZone: raw.data.native_completion.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(raw.data.native_completion.startedAt)) === raw.data.native_completion.workoutDay, 'Native Intl cannot read recorded timezone/day');
    temporalReadbacks.push(raw.data.native_completion);
  }
  writeFileSync(resolve(root, '.artifacts/train-415-temporal-readback.json'), JSON.stringify(temporalReadbacks));
  console.log('PASS temporal rejection without writes; explicit instants, leap day, DST offsets and IANA aliases roundtrip unchanged');
  const frozen = completion(a);
  const receipts = await Promise.all(Array.from({ length: 4 }, () => request(endpoint, a, frozen)));
  check(receipts.every(value => JSON.stringify(value) === JSON.stringify(receipts[0])), 'Concurrent retry receipt changed');
  check((await request(endpoint, a, { ...frozen, completion: { ...frozen.completion, planId: 'changed' } }, 409)).error.code === 'operation_conflict', 'Changed retry not rejected');
  await request(endpoint, b, frozen, 403);
  for (const reps of [0, 0.5, Number.MAX_SAFE_INTEGER + 1]) await request(endpoint, a, completion(a, 0.123, reps), 422);
  const empty = completion(a); empty.completion.exercises = []; await request(endpoint, a, empty, 422);
  const unavailable = completion(a); unavailable.completion.exercises[0].definition.catalogKey = 'strength.unavailable.v1';
  check((await request(endpoint, a, unavailable, 409)).error.code === 'reference_unavailable', 'Missing reference not rejected');
  const collision = completion(a); collision.completion.exercises[0].id = frozen.completion.exercises[0].id;
  check((await request(endpoint, a, collision, 409)).error.code === 'identity_conflict', 'Child collision not rejected');
  check((await a.client.from('workouts').select('id').eq('id', collision.operationId)).data.length === 0, 'Child conflict left a parent');
  for (const weight of [0, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const value = completion(a, weight, 2);
    value.completion.durationSeconds = Number.MAX_SAFE_INTEGER;
    await request(endpoint, a, value);
    const raw = await a.client.from('workout_sets').select('weight_kg,reps').eq('id', value.completion.exercises[0].sets[0].id).single();
    check(!raw.error && raw.data.weight_kg === weight && raw.data.reps === 2, 'Finite number changed through actual PostgREST');
  }
  const warmup = completion(a, 0.123, 1, 'warmup'); await request(endpoint, a, warmup);
  const detail = (await request(`/api/workouts/${frozen.operationId}`, a, undefined, 200, true)).workout;
  check(detail.exercises[0].exercise.name === frozen.completion.exercises[0].definition.name.en
    && detail.exercises[0].live_exercise.name !== detail.exercises[0].exercise.name
    && detail.exercises[0].sets[0].weight_kg === 0.123 && detail.exercises[0].sets[0].reps === Number.MAX_SAFE_INTEGER,
  'Cookie read lost captured definition or measurement');
  check(isDeepStrictEqual(detail.native_completion, frozen.completion), 'Frozen native document changed');
  const summaries = await request('/api/workouts', a, undefined, 200, true);
  check(summaries.some(value => value.totalVolume === null) && summaries.every(value => value.totalVolume === null || Number.isFinite(value.totalVolume)), 'Overflow history aggregate is misleading');
  await request(`/api/workouts/${frozen.operationId}`, b, undefined, 404, true);
  check((await b.client.from('workouts').select('id').eq('id', frozen.operationId)).data.length === 0, 'Native read crossed owners');
  const blocked = await a.client.from('workout_sets').update({ weight_kg: 9 }).eq('id', frozen.completion.exercises[0].sets[0].id);
  check(blocked.error?.code === '23514', 'Direct native projection edit succeeded');
  check((await a.client.rpc('mcp_workout_command', { p_user_id: a.id, p_operation: 'complete_workout_atomically', p_request: {} })).error, 'Untrusted caller reached service bridge');
  console.log('PASS concurrent exact receipts, atomic conflicts, number extremes, warmup, snapshot reads and owner/direct-grant isolation');

  const routine = (await request(`/api/workouts/${frozen.operationId}/save-as-routine`, a, { name: 'Exact native targets' }, 201, true)).routine;
  check(routine.exercises[0].target_weight_kg === 0.123 && routine.exercises[0].target_reps === Number.MAX_SAFE_INTEGER
    && routine.exercises[0].rest_timer_seconds === null, 'Save-as-routine rounded values or invented rest');
  await request(`/api/workouts/${active.id}`, a, { status: 'completed' }, 400, true, 'PATCH');
  await request(`/api/workouts/${active.id}`, a, { status: 'discarded' }, 200, true, 'PATCH');
  const restarted = (await request('/api/workouts', a, { routine_id: routine.id }, 201, true)).workout;
  check(restarted.exercises[0].sets[0].weight_kg === 0.123 && restarted.exercises[0].sets[0].reps === Number.MAX_SAFE_INTEGER
    && restarted.exercises[0].rest_timer_seconds === null, 'Web routine restart changed native targets');
  await request(`/api/workouts/${restarted.id}`, a, { status: 'discarded' }, 200, true, 'PATCH');
  const privateExercise = await b.client.from('exercises').insert({ user_id: b.id, name: 'Private B definition', muscle_group_primary: 'other', equipment: 'other', exercise_type: 'weight_reps', is_custom: true }).select('id').single();
  check(!privateExercise.error, 'Private definition fixture failed');
  const catalog = parsedTool(await mcp(a, 'getExercises', {}));
  check(Array.isArray(catalog) && !catalog.some(value => value.id === privateExercise.data.id), 'Trusted MCP catalog read exposed a foreign definition');
  const denied = await mcp(a, 'startWorkout', { routineId: routine.id }, ['read']);
  check(denied.isError && denied.content[0].text.includes('Write permission required'), 'Read-only MCP scope wrote a workout');
  check(parsedTool(await mcp(b, 'getWorkoutDetails', { workoutId: frozen.operationId })).error === 'Workout not found', 'MCP foreign workout read leaked');
  const recorded = parsedTool(await mcp(a, 'getWorkoutDetails', { workoutId: frozen.operationId }));
  check(recorded.exercises[0].exercise.name === frozen.completion.exercises[0].definition.name.en && recorded.exercises[0].live_exercise.name !== recorded.exercises[0].exercise.name, 'MCP replaced recorded definition with live catalog');
  const mcpStarted = parsedTool(await mcp(a, 'startWorkout', { routineId: routine.id }));
  check(mcpStarted.id && mcpStarted.exercises[0].sets[0].weight_kg === 0.123 && mcpStarted.exercises[0].sets[0].reps === Number.MAX_SAFE_INTEGER, 'Trusted MCP routine start failed exactness');
  check(parsedTool(await mcp(a, 'completeWorkout', { workoutId: mcpStarted.id })).error === 'Complete at least one set before finishing', 'MCP empty completion accepted');
  check(!(await a.client.from('workout_sets').update({ is_completed: true }).eq('id', mcpStarted.exercises[0].sets[0].id)).error, 'Preparing performed Web set failed');
  check(parsedTool(await mcp(a, 'completeWorkout', { workoutId: mcpStarted.id })).status === 'completed', 'Trusted MCP completion failed');
  const joint = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/train-measurement-contract.json'), 'utf8'));
  function measurementCompletion(allWorking = false) {
    const value = structuredClone(joint.completion);
    value.id = randomUUID(); value.ownerId = a.id; value.sourceId = randomUUID();
    for (const entry of value.exercises) {
      entry.id = randomUUID();
      for (const set of entry.sets) { set.id = randomUUID(); if (allWorking) set.performed.kind = 'working'; }
    }
    return { protocolVersion: 1, operationId: value.id, completion: value };
  }
  const measured = measurementCompletion();
  const measuredReceipt = await request(endpoint, a, measured);
  check(isDeepStrictEqual(await request(endpoint, a, measured), measuredReceipt), 'V2 retry changed its accepted receipt');
  await request(endpoint, b, measured, 403);
  const measuredRaw = await a.client.from('workouts').select('native_completion,recorded_completion').eq('id', measured.operationId).single();
  check(!measuredRaw.error && measuredRaw.data.native_completion === null && isDeepStrictEqual(measuredRaw.data.recorded_completion, measured.completion), 'V2 did not retain exactly one frozen authority');
  const projection = await a.client.from('workout_exercises').select('sort_order,sets:workout_sets(weight_kg,reps,duration_seconds,set_type,is_completed,distance_meters,rpe)').eq('workout_id', measured.operationId).order('sort_order');
  check(!projection.error && isDeepStrictEqual(projection.data.map(entry => {
    const set = entry.sets[0]; return [set.weight_kg,set.reps,set.duration_seconds,set.set_type,set.is_completed,set.distance_meters,set.rpe];
  }), [[0.123,5,null,'normal',true,null,null],[null,8,null,'warmup',true,null,null],[0.45359237,6,null,'normal',true,null,null],[0,5,null,'warmup',true,null,null],[null,null,90,'normal',true,null,null]]), 'V2 normalized projection lost exact meaning');
  for (const value of [0, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const edge = measurementCompletion(); edge.completion.exercises[0].sets[0].performed.weightKg = value;
    edge.completion.exercises[1].sets[0].performed.reps = Number.MAX_SAFE_INTEGER;
    await request(endpoint, a, edge);
    const raw = await a.client.from('workout_sets').select('weight_kg').eq('id', edge.completion.exercises[0].sets[0].id).single();
    check(!raw.error && raw.data.weight_kg === value, 'V2 finite canonical load changed');
  }
  const unsupported = measurementCompletion(); unsupported.completion.version = 99;
  check((await request(endpoint, a, unsupported, 422)).error.code === 'invalid_completion', 'Unsupported writer was acknowledged');
  const catalogBefore = JSON.parse(sql(`select row_to_json(t) from (select id,name,updated_at from public.exercises where catalog_key='strength.weighted-pull-up.v1') t;`));
  catalogRestorations.push(catalogBefore);
  sql(`update public.exercises set name='Renamed after recorded measurement' where id='${catalogBefore.id}';`);
  const measuredWeb = (await request(`/api/workouts/${measured.operationId}`, a, undefined, 200, true)).workout;
  const measuredMcp = parsedTool(await mcp(a, 'getWorkoutDetails', { workoutId: measured.operationId }));
  for (const readback of [measuredWeb, measuredMcp]) {
    check(readback.recordedStatus === 'recorded' && isDeepStrictEqual(readback.recorded_completion, measured.completion), 'Web/Assistant changed the v2 document');
    check(readback.exercises[2].exercise.name === 'Weighted Pull-up' && readback.exercises[2].live_exercise.name === 'Renamed after recorded measurement'
      && readback.exercises[2].recorded_definition.convention === 'added-load' && readback.exercises[2].sets[0].weight_kg === 0.45359237, 'Captured definition was rebuilt from live catalog');
  }
  check((await b.client.from('workouts').select('id').eq('id', measured.operationId)).data.length === 0, 'V2 read crossed owners');
  check(parsedTool(await mcp(b, 'getWorkoutDetails', { workoutId: measured.operationId })).error === 'Workout not found', 'V2 MCP crossed owners');
  restoreCatalog();
  const reusable = measurementCompletion(true); await request(endpoint, a, reusable);
  const fiveRoutine = (await request(`/api/workouts/${reusable.operationId}/save-as-routine`, a, { name: 'Exact five-mode targets' }, 201, true)).routine;
  const targets = [[0.123,5,null],[null,8,null],[0.45359237,6,null],[0,5,null],[null,null,90]];
  check(isDeepStrictEqual(fiveRoutine.exercises.map(entry => [entry.target_weight_kg,entry.target_reps,entry.target_duration_seconds]), targets), 'Five-mode routine conversion changed targets');
  const webFive = (await request('/api/workouts', a, { routine_id: fiveRoutine.id }, 201, true)).workout;
  check(isDeepStrictEqual(webFive.exercises.map(entry => [entry.sets[0].weight_kg,entry.sets[0].reps,entry.sets[0].duration_seconds]), targets), 'Five-mode Web restart changed targets');
  const previousRead = (await request('/api/workouts/active', a, undefined, 200, true)).workout;
  check(previousRead.exercises[2].previousSets.some(set => set.weight_kg === 0.45359237 && set.reps === 6)
    && previousRead.exercises[4].previousSets.some(set => set.duration_seconds === 90 && set.weight_kg === null), 'Active Web suggestions lost readable v2 facts');
  const bodyweightPath = `/api/workouts/${webFive.id}/exercises/${webFive.exercises[1].id}/sets`;
  check((await request(bodyweightPath, a, { is_completed: true }, 400, true)).field === 'measurements', 'Web completed a blank set');
  const durationEntry = webFive.exercises[4];
  check((await request(`/api/workouts/${webFive.id}/exercises/${durationEntry.id}/sets/${durationEntry.sets[0].id}`, a, { duration_seconds: 0, is_completed: true }, 400, true, 'PATCH')).field === 'measurements', 'Web completed zero duration');
  for (const entry of webFive.exercises) {
    const performed = await request(`/api/workouts/${webFive.id}/exercises/${entry.id}/sets/${entry.sets[0].id}`, a, { is_completed: true }, 200, true, 'PATCH');
    check(performed.set.is_completed, 'Valid Web measurement did not become performed');
  }
  check((await request(`/api/workouts/${webFive.id}`, a, { status: 'completed' }, 200, true, 'PATCH')).workout.status === 'completed', 'Five-mode Web finish failed');
  console.log('PASS v2 five modes/exact numbers/exclusive authority; cookie/MCP captured rename readback; routine targets; Web performed validation; catalog restored exactly');
  await deleteFixtureWorkout(a.client, a.id, frozen.operationId);
  check(JSON.stringify(await request(endpoint, a, frozen)) === JSON.stringify(receipts[0]), 'Deletion changed retained receipt');
  check((await a.client.from('workouts').select('id').eq('id', frozen.operationId)).data.length === 0, 'Retry resurrected deleted history');
  console.log('PASS actual cookie save/restart, trusted MCP start/complete, read-only denial and retry-after-deletion');
  if (hold) {
    const rootA = await account(); const rootB = await account();
    const rootActive = (await request('/api/workouts', rootA, { title: 'Root proof retained Web active' }, 201, true)).workout;
    writeFileSync(receiptFile, JSON.stringify({ apiOrigin: origin, supabaseUrl: local.API_URL, anonKey: local.ANON_KEY,
      accounts: { a: { userId: rootA.id, accessToken: rootA.token }, b: { userId: rootB.id, accessToken: rootB.token } }, webActiveWorkoutId: rootActive.id }), { mode: 0o600 });
    console.log(`READY root proof origin=${origin} credentialFile=${receiptFile} releaseFile=${resolve(secretsDirectory, 'release')}`);
    const end = Date.now() + 45 * 60_000;
    while (!existsSync(resolve(secretsDirectory, 'release')) && Date.now() < end) await new Promise(done => setTimeout(done, 1000));
    check(existsSync(resolve(secretsDirectory, 'release')), 'Root proof fixture window expired');
  }
} finally { await cleanup(); }
