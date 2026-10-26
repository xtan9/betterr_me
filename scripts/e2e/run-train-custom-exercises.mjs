import { deleteFixtureWorkout } from './workout-cleanup.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';
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
const receipt = { source: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(), cases: [], cleaned: false };
const sourcePaths = ['app/api/exercises/route.ts', 'app/api/exercises/commands/route.ts', 'app/api/mobile/train/exercises/commands/route.ts', 'lib/fitness/recorded-definition.ts', 'supabase/migrations/20261025214904_train_custom_exercises_expand.sql'];
receipt.sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const originalPrivileges = JSON.parse(sql(`select json_agg(json_build_object('role',r,'privilege',p,'granted',has_table_privilege(r,'public.exercises',p))) from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`));
check(sql('select ready from fitness_private.custom_exercise_rollout') === 'f', 'Expected an inactive A database');
let contracted = false;
let browser;
const secretsDirectory = mkdtempSync(resolve(tmpdir(), 'train-418-'));
let child;
let origin;
const endpoint = '/api/mobile/train/exercises/commands';
const uploadEndpoint = '/api/mobile/train/completions';
const artifact = resolve(root, '.artifacts/train-418-http-proof.json');
function passed(name) { receipt.cases.push(name); writeFileSync(artifact, JSON.stringify(receipt, null, 2)); console.log(`PASS ${name}`); }
const receiptFile = resolve(secretsDirectory, 'accounts.json');
async function account() {
  const credentials = { email: `train-418-${randomUUID()}@example.test`, password: randomUUID() };
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
  user.cookies = [...cookies].map(([name, value]) => ({ name, value: encodeURIComponent(value) }));
  user.cookie = [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
  return user;
}
async function request(path, user, body, expected = 200, cookie = false, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${origin}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json', ...(cookie && user ? { 'X-Train-Owner': user.id } : {}), ...(user ? cookie ? { cookie: user.cookie } : { authorization: `Bearer ${user.token}` } : {}) },
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
async function cleanup() {
  if (browser) await browser.close();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  rmSync(secretsDirectory, { recursive: true, force: true });
  for (const user of users) check(!(await admin.auth.admin.deleteUser(user.id)).error, 'Disposable user cleanup failed');
  if (users.length) {
    const ids = users.map(user => `'${user.id}'::uuid`).join(',');
    check(sql(`select (select count(*) from auth.users where id in (${ids}))+(select count(*) from auth.sessions where user_id in (${ids}))
      +(select count(*) from public.exercises where user_id in (${ids}))+(select count(*) from public.workouts where user_id in (${ids}))
      +(select count(*) from public.routines where user_id in (${ids}))+(select count(*) from public.train_exercise_command_outcomes where owner_id in (${ids}))
      +(select count(*) from public.train_completion_receipts where owner_id in (${ids}));`) === '0', 'Disposable residue remained');
  }
  if (contracted) {
    const grants = originalPrivileges.map(({role,privilege,granted}) => `${granted ? 'grant' : 'revoke'} ${privilege} on public.exercises ${granted ? 'to' : 'from'} ${role};`).join('\n');
    sql(`begin; update fitness_private.custom_exercise_rollout set ready=false; ${grants} commit;`);
  }
  check(sql('select ready from fitness_private.custom_exercise_rollout') === 'f', 'Readiness restoration failed');
  const restored = JSON.parse(sql(`select json_agg(json_build_object('role',r,'privilege',p,'granted',has_table_privilege(r,'public.exercises',p))) from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`));
  check(isDeepStrictEqual(restored, originalPrivileges), 'Original grants were not restored');
  for (const path of sourcePaths) check(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex') === receipt.sourceHashes[path], 'Runtime source changed during proof');
  receipt.cleaned = true; writeFileSync(artifact, JSON.stringify(receipt,null,2));
  console.log('CLEAN exact fixture accounts/rows/credentials/server; original inactive gate and grants restored');
}
function command(kind, fields) { return { protocolVersion: 1, operationId: randomUUID(), command: { kind, ...fields } }; }
async function legacy(user, mode, name) {
  const result = await user.client.from('exercises').insert({ user_id:user.id, is_custom:true, name, equipment:'band', exercise_type:mode,
    muscle_group_primary:'other', muscle_groups_secondary:null, created_at:null, updated_at:null }).select('id').single();
  check(!result.error, 'A legacy definition fixture failed'); return result.data.id;
}
function customCompletion(user, definition) {
  const id=randomUUID();
  return { protocolVersion:1, operationId:id, completion:{ version:3,id,ownerId:user.id,sourceId:randomUUID(),
    startedAt:'2026-10-25T10:00:00Z',completedAt:'2026-10-25T10:05:00Z',durationSeconds:300,timezone:'UTC',workoutDay:'2026-10-25',planId:null,
    exercises:[{id:randomUUID(),definition:{reference:{kind:'custom',exerciseId:definition.id,ownerId:user.id},name:definition.name,
      equipment:definition.equipment,mode:definition.mode,convention:definition.convention},
      sets:[{id:randomUUID(),performed:{mode:'weight_reps',weightKg:0.123,reps:5,kind:'working'}}]}] } };
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
  const log = openSync(resolve(root, '.artifacts/train-418-http-server.log'), 'w');
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
  const a=await account(), b=await account(), rootA=hold?await account():null, rootB=hold?await account():null;
  const legacyId=await legacy(a,'weight_reps','Legacy custom'), deferredId=await legacy(a,'duration_weight','Deferred custom');
  const rootLegacy=rootA?await legacy(rootA,'weight_reps','Root legacy unknown convention'):null;
  const rootDeferred=rootA?await legacy(rootA,'duration_weight','Root deferred mode'):null;
  const rootActive=rootA?(await request('/api/workouts',rootA,{title:'Retained Web active'},201,true)).workout:null;
  const capability=await request('/api/mobile/train/exercises/capabilities',a);
  check(capability.customExercises.ready===false && isDeepStrictEqual(capability.completionVersions,[1,2]),'A advertised readiness');
  const library=await request('/api/exercises?archived=all',a,undefined,200,true);
  check(library.ownerId===a.id && library.exercises.some(row=>row.id===legacyId && row.version==='1' && row.measurement_convention===null),'B+A library lost precise versions or unknown meaning');
  const renameA=command('update-metadata',{exerciseId:legacyId,expectedVersion:'1',patch:{name:'A maintained legacy'}});
  check((await request(`/api/exercises/${legacyId}`,a,renameA,200,true,'PATCH')).receipt.definition.version==='2','B+A metadata command failed');
  const create=command('create',{definition:{name:'Frozen custom bench',equipment:'barbell',mode:'weight_reps',convention:'barbell-total',primaryMuscle:'chest',secondaryMuscles:[]}});
  check((await request('/api/exercises',a,create,503,true)).error.code==='not_ready','B+A create was enabled');
  check(!(await a.client.from('train_exercise_command_outcomes').select('operation_id').eq('operation_id',create.operationId)).data.length,'A wrote a false creation rejection');
  passed('B+A cookie maintenance/read works; native capability and creation stay closed without false outcome');
  sql(`begin; revoke insert,update,delete,truncate,references,trigger on public.exercises from anon,authenticated;
    revoke truncate,trigger on public.exercises from service_role;
    update fitness_private.custom_exercise_rollout set ready=true; commit;`);contracted=true;
  receipt.candidateGate={ready:true,localOnly:true,uploadHash:sql("select md5(pg_get_functiondef('fitness_private.upload_completed_workout(uuid,jsonb)'::regprocedure))")};
  check((await request('/api/mobile/train/exercises/capabilities',a)).customExercises.ready===true,'C capability did not activate');
  const created=await request('/api/exercises',a,create,200,true);
  const retries=await Promise.all(Array.from({length:4},()=>request(endpoint,a,create)));
  check(retries.every(value=>isDeepStrictEqual(value,created)),'Native/cookie concurrent retry changed first receipt');
  check((await request(endpoint,a,{...create,command:{...create.command,definition:{...create.command.definition,name:'Changed retry'}}},409)).error.code==='operation_conflict','Changed retry was accepted');
  const frozen=customCompletion(a,created.receipt.definition);
  const renamed=await request(endpoint,a,command('update-metadata',{exerciseId:create.operationId,expectedVersion:'1',patch:{name:'Renamed after capture'}}));
  const stale=command('archive',{exerciseId:create.operationId,expectedVersion:'1'});
  const rejection=await request(endpoint,a,stale,409);
  check(rejection.rejection.current.version==='2' && rejection.rejection.code==='version_conflict','CAS conflict missing current authority');
  check(isDeepStrictEqual(await request(endpoint,a,stale,409),rejection),'Definitive rejection changed on retry');
  const archive=command('archive',{exerciseId:create.operationId,expectedVersion:renamed.receipt.definition.version});
  const archived=await request(`/api/exercises/${create.operationId}`,a,archive,200,true,'DELETE');
  check(archived.receipt.definition.version==='3' && archived.receipt.definition.archivedAt,'Archive was not accepted');
  check(isDeepStrictEqual(await request(endpoint,a,create),created),'Old accepted receipt was replaced by current state');
  check(isDeepStrictEqual(await request(endpoint,a,stale,409),rejection),'Newer state rewrote the original rejection');
  const current=await request(`/api/mobile/train/exercises/${create.operationId}`,a);
  check(current.definition.version==='3' && current.definition.name==='Renamed after capture','Current by-ID authority followed old receipt');
  await request(`/api/mobile/train/exercises/${create.operationId}`,b,undefined,404);
  const foreign=command('update-metadata',{exerciseId:create.operationId,expectedVersion:'3',patch:{name:'Foreign'}});
  check((await request(endpoint,b,foreign,404)).rejection.current===undefined,'Foreign rejection leaked metadata');
  const all=await request('/api/mobile/train/exercises',a);
  check(all.definitions.some(row=>row.id===create.operationId&&row.archivedAt) && all.definitions.some(row=>row.id===deferredId&&row.mode==='duration_weight'&&row.convention===null),'List omitted archived/deferred definitions');
  check((await a.client.from('exercises').update({name:'Bypass'}).eq('id',create.operationId)).error?.code==='42501','Ordinary DML bypass survived C');
  passed('B+C exact first receipts/rejections, CAS, archive, current reads and owner/direct-write isolation');

  const accepted=await request(uploadEndpoint,a,frozen);
  const raw=await a.client.from('workouts').select('native_completion,recorded_completion').eq('id',frozen.operationId).single();
  check(!raw.error && raw.data.native_completion===null && isDeepStrictEqual(raw.data.recorded_completion,frozen.completion),'V3 authority was rewritten');
  const web=(await request(`/api/workouts/${frozen.operationId}`,a,undefined,200,true)).workout;
  const assistant=parsedTool(await mcp(a,'getWorkoutDetails',{workoutId:frozen.operationId}));
  for(const value of [web,assistant])check(value.recordedStatus==='recorded'&&value.exercises[0].exercise.name==='Frozen custom bench'
    && value.exercises[0].live_exercise.name==='Renamed after capture' && value.exercises[0].sets[0].weight_kg===0.123,'Web/Assistant replaced captured custom meaning');
  const routine=(await request(`/api/workouts/${frozen.operationId}/save-as-routine`,a,{name:'Custom preserved target'},201,true)).routine;
  check(routine.exercises[0].exercise_id===create.operationId && routine.exercises[0].target_weight_kg===0.123 && routine.exercises[0].rest_timer_seconds===null,'Routine conversion changed identity/target/unknown rest');
  const started=parsedTool(await mcp(a,'startWorkout',{routineId:routine.id}));
  check(started.exercises[0].exercise_id===create.operationId && started.exercises[0].sets[0].weight_kg===0.123,'Archived referenced routine could not continue through MCP');
  const choices=parsedTool(await mcp(a,'getExercises',{}));
  check(!choices.some(row=>row.id===create.operationId),'Archived definition remained in new-selection list');
  await request(uploadEndpoint,b,frozen,403);
  check((await b.client.from('workouts').select('id').eq('id',frozen.operationId)).data.length===0,'Foreign raw history exposed V3');
  await deleteFixtureWorkout(a.client, a.id, frozen.operationId);
  check(isDeepStrictEqual(await request(uploadEndpoint,a,frozen),accepted) && !(await a.client.from('workouts').select('id').eq('id',frozen.operationId)).data.length,'V3 retry resurrected deleted history');
  passed('Archived captured v3 uploads/readbacks through bearer, cookie, MCP and routine conversion; foreign isolation; no resurrection');

  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  await context.addCookies(a.cookies.map(cookie=>({...cookie,url:origin})));
  const page=await context.newPage();await page.goto(origin+'/workouts/exercises');
  await page.getByRole('button',{name:'Create Custom Exercise',exact:true}).click();
  let dialog=page.getByRole('dialog');await expect(dialog.getByText('Recording convention: total barbell load')).toBeVisible();
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Browser custom definition');
  const response=page.waitForResponse(value=>new URL(value.url()).pathname==='/api/exercises/commands'&&value.request().method()==='POST');
  await dialog.getByRole('button',{name:'Create Exercise',exact:true}).click();
  check((await response).status()===200,'Browser creation did not reach authoritative command');
  const browserReceipt=await (await response).json();const browserId=browserReceipt.receipt.exerciseId;
  await expect(page.getByRole('heading',{name:'Browser custom definition',exact:true})).toBeVisible();
  await page.locator(`a[href="/workouts/exercises/${browserId}"]`).getByRole('button',{name:'Actions'}).click();
  await page.getByRole('menuitem',{name:'Edit Exercise',exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('combobox',{name:'Equipment',exact:true})).toBeDisabled();
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Browser renamed definition');
  await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Browser renamed definition',exact:true})).toBeVisible();
  for(const operation of ['Archive','Restore']){
    await page.locator(`a[href="/workouts/exercises/${browserId}"]`).getByRole('button',{name:'Actions'}).click();
    await page.getByRole('menuitem',{name:`${operation} Exercise`,exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:`${operation} Exercise`,exact:true}).click();
    await expect(page.getByRole('heading',{name:'Browser renamed definition',exact:true})).not.toBeVisible();
    await page.getByRole('tab',{name:operation==='Archive'?'Archived':'Available',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Browser renamed definition',exact:true})).toBeVisible();
  }
  const browserRead=await request(`/api/mobile/train/exercises/${browserId}`,a);
  check(browserRead.definition.version==='4' && browserRead.definition.archivedAt===null && browserRead.definition.name==='Browser renamed definition','Browser workflow did not persist the same definition');
  await page.screenshot({path:resolve(root,'.artifacts/train-418-browser-library.png'),fullPage:true});
  await context.close();await browser.close();browser=null;
  passed('Actual Chromium form creates, renames, archives and restores one authoritative definition');

  if(hold){
    writeFileSync(receiptFile,JSON.stringify({apiOrigin:origin,supabaseUrl:local.API_URL,anonKey:local.ANON_KEY,
      accounts:{a:{userId:rootA.id,accessToken:rootA.token},b:{userId:rootB.id,accessToken:rootB.token}},webActiveWorkoutId:rootActive.id,
      legacyCustomExerciseId:rootLegacy,deferredCustomExerciseId:rootDeferred,backendSource:receipt.source}),{mode:0o600});
    console.log(`READY origin=${origin} credentialFile=${receiptFile} releaseFile=${resolve(secretsDirectory,'release')}`);
    const end=Date.now()+45*60_000;
    while(!existsSync(resolve(secretsDirectory,'release'))&&Date.now()<end)await new Promise(done=>setTimeout(done,1000));
    check(existsSync(resolve(secretsDirectory,'release')),'Root fixture window expired');
  }
} finally { await cleanup(); }
