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
import { issueAccessToken } from '../../lib/oauth/access-token.ts';

// Actual Auth, PostgREST, cookie Web and MCP requests. Never accepts a remote
// target or caller credentials, and never resets or repairs a database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function check(ok, message) { if (!ok) throw new Error(message); }
check(process.argv.slice(2).every(arg => ['--hold', '--browser', '--prior-results', '--plans'].includes(arg)), 'Unknown runner argument');
const hold = process.argv.includes('--hold');
const runBrowser = process.argv.includes('--browser');
const runPlans = process.argv.includes('--plans');
const runPriorResults = process.argv.includes('--prior-results');
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
const sourcePaths = ['lib/fitness/template-commands.ts','lib/fitness/template-read.ts','lib/fitness/recorded-definition.ts','lib/validations/workout-recording.ts','lib/validations/train-templates.ts','supabase/migrations/20261026001702_train_workout_templates_expand.sql'];
if (runBrowser) sourcePaths.push('components/fitness/routines/template-library.tsx','components/fitness/routines/template-form.tsx',
  'components/fitness/routines/template-entry-editor.tsx','components/fitness/routines/template-draft.ts',
  'components/fitness/routines/use-template-library.ts','components/fitness/workout-logger/workout-finish-dialog.tsx',
  'lib/fitness/template-command-client.ts');
if (runPriorResults) sourcePaths.push('lib/fitness/prior-results.ts','lib/fitness/prior-result-route.ts','lib/fitness/prior-result-target.ts',
  'lib/validations/train-prior-results.ts','app/api/mobile/train/prior-results/route.ts','app/api/workouts/prior-results/route.ts',
  'app/api/workouts/active/route.ts','components/fitness/workout-logger/prior-results-picker.tsx',
  'components/fitness/workout-logger/workout-set-row.tsx','components/fitness/use-weight-input.ts');
if (runPlans) sourcePaths.push('lib/fitness/train-plans.ts','lib/validations/train-plans.ts','lib/db/workouts.ts','supabase/migrations/20261026023958_train_plan_links_and_fulfillment.sql');
receipt.sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const privilegeQuery = `select json_agg(json_build_object('table',t,'role',r,'privilege',p,'granted',has_table_privilege(r,'public.'||t,p)) order by t,r,p)
 from unnest(array['exercises','routines','routine_exercises']) t cross join unnest(array['anon','authenticated','service_role']) r
 cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`;
const originalPrivileges = JSON.parse(sql(privilegeQuery));
const originalColumn = sql("select coalesce(attacl::text,'') from pg_attribute where attrelid='public.routines'::regclass and attname='last_performed_at'");
check(originalColumn === '', 'Fixture requires an unmodified usage-column ACL');
const originalEntries = JSON.parse(sql("select coalesce(json_agg(entry_id::text),'[]') from fitness_private.template_entries"));
const originalFlags = JSON.parse(sql("select json_build_object('custom',(select ready from fitness_private.custom_exercise_rollout),'templates',(select ready from fitness_private.template_rollout))"));
check(originalFlags.templates === false, 'Expected template expansion A before proof');
let contracted = false;
const secretsDirectory = mkdtempSync(resolve(tmpdir(), 'train-419-'));
let child;
let origin;
const endpoint = '/api/mobile/train/templates/commands';
const uploadEndpoint = '/api/mobile/train/completions';
const artifact = resolve(root, runPlans ? '.artifacts/train-422-424-http-proof.json' : runPriorResults ? '.artifacts/train-420-http-proof.json' : '.artifacts/train-419-http-proof.json');
function passed(name) { receipt.cases.push(name); writeFileSync(artifact, JSON.stringify(receipt, null, 2)); console.log(`PASS ${name}`); }
const receiptFile = resolve(secretsDirectory, 'accounts.json');
async function account() {
  const credentials = { email: `train-419-${randomUUID()}@example.test`, password: randomUUID() };
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
      +(select count(*) from public.train_template_command_outcomes where owner_id in (${ids}))+(select count(*) from public.train_completion_receipts where owner_id in (${ids}));`) === '0', 'Disposable residue remained');
  }
  if (runPlans && users.length) {
    const ids=users.map(user=>`'${user.id}'::uuid`).join(',');
    check(sql(`select (select count(*) from public.train_workout_plan_links where owner_id in (${ids}))+(select count(*) from public.train_plan_command_outcomes where owner_id in (${ids}))+(select count(*) from public.profiles where id in (${ids}))+(select count(*) from public.recurring_task_series where user_id in (${ids}))`) === '0','Train link/plan cleanup residue');
  }
  if (contracted) {
    const grants = originalPrivileges.map(({table,role,privilege,granted}) => `${granted ? 'grant' : 'revoke'} ${privilege} on public.${table} ${granted ? 'to' : 'from'} ${role};`).join('\n');
    const retained = originalEntries.length ? `where entry_id not in (${originalEntries.map(id=>`'${id}'::uuid`).join(',')})` : '';
    sql(`begin; update fitness_private.template_rollout set ready=false;
      delete from fitness_private.template_entries ${retained};
      update fitness_private.custom_exercise_rollout set ready=${originalFlags.custom};
      revoke update(last_performed_at) on public.routines from authenticated,service_role;
      ${grants} commit;`);
  }
  check(sql('select ready from fitness_private.template_rollout') === 'f', 'Template readiness restoration failed');
  check(isDeepStrictEqual(JSON.parse(sql(privilegeQuery)), originalPrivileges), 'Original grants were not restored');
  check(sql("select coalesce(attacl::text,'') from pg_attribute where attrelid='public.routines'::regclass and attname='last_performed_at'") === originalColumn, 'Usage ACL not restored');
  for (const path of sourcePaths) check(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex') === receipt.sourceHashes[path], 'Runtime source changed during proof');
  receipt.cleaned = true; writeFileSync(artifact, JSON.stringify(receipt,null,2));
  console.log('CLEAN exact fixture accounts/rows/credentials/server; original gates, privileges and materialization restored');
}
function command(kind, fields) { return { protocolVersion: 1, operationId: randomUUID(), command: { kind, ...fields } }; }
try {
  const socket = createServer();
  await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port; await new Promise(done => socket.close(done));
  check(port !== 8082, 'Shared Metro port is forbidden'); origin = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_APP_URL = origin; process.env.API_KEY_HMAC_SECRET = randomBytes(32).toString('hex');
  mkdirSync(resolve(root, '.artifacts'), { recursive: true });
  const log = openSync(resolve(root, '.artifacts/train-419-http-server.log'), 'w');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      API_KEY_HMAC_SECRET: process.env.API_KEY_HMAC_SECRET, NEXT_PUBLIC_APP_URL: origin }, stdio: ['ignore',log,log] }); closeSync(log);
  sql("notify pgrst,'reload schema'");
  let ready=false;
  for(let i=0;i<90;i++) {
    check(child.exitCode===null,'Isolated Next exited');
    try { ready=(await fetch(`${origin}${endpoint}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000)})).status===401; } catch { /* compilation */ }
    if(ready)break; await new Promise(done=>setTimeout(done,500));
  }
  check(ready,'Isolated server did not become ready');
  const a=await account(),b=await account(),rootA=hold?await account():null,rootB=hold?await account():null;
  if (runPlans) {
    sql(`begin; revoke insert,update,delete,truncate,references,trigger on public.exercises from anon,authenticated;
      revoke truncate,trigger on public.exercises from service_role; update fitness_private.custom_exercise_rollout set ready=true;
      select fitness_private.activate_template_contract(); commit;`); contracted=true;
    const {verifyTrainPlans}=await import('./train-plan-links.mjs');
    const result=await verifyTrainPlans({a,b,rootA,request,mcp,parsedTool,artifactDirectory:resolve(root,'.artifacts')});
    for (const name of result.cases) passed(name);
    if(hold){
      writeFileSync(receiptFile,JSON.stringify({apiOrigin:origin,supabaseUrl:local.API_URL,anonKey:local.ANON_KEY,
        accounts:{a:{userId:rootA.id,accessToken:rootA.token},b:{userId:rootB.id,accessToken:rootB.token}},
        ...result.root,backendSource:receipt.source,backendSourceHashes:receipt.sourceHashes}),{mode:0o600});
      console.log(`READY origin=${origin} credentialFile=${receiptFile} releaseFile=${resolve(secretsDirectory,'release')}`);
      const end=Date.now()+45*60_000;
      while(!existsSync(resolve(secretsDirectory,'release'))&&Date.now()<end)await new Promise(done=>setTimeout(done,1000));
      check(existsSync(resolve(secretsDirectory,'release')),'Root fixture window expired');
    }
  } else {
  const preset=(await a.client.from('exercises').select('id').eq('catalog_key','strength.barbell-bench-press.v1').single()).data;
  check(preset?.id,'Verified preset missing');
  const legacy=(await request('/api/routines',a,{name:'A compatible routine'},201,true)).routine;
  await request(`/api/routines/${legacy.id}/exercises`,a,{exercise_id:preset.id,target_sets:2,target_reps:runBrowser?0:5,target_weight_kg:0.123},201,true);
  let rootTemplateId;
  if (rootA) {
    rootTemplateId=(await request('/api/routines',rootA,{name:'Root legacy targets'},201,true)).routine.id;
    await request(`/api/routines/${rootTemplateId}/exercises`,rootA,{exercise_id:preset.id,target_sets:3,target_reps:0,target_weight_kg:0.123,rest_timer_seconds:null},201,true);
  }
  const aStarted=(await request(`/api/routines/${legacy.id}/start`,a,{},201,true)).workout;
  check(aStarted.exercises[0].sets[0].weight_kg===0.123,'A legacy start changed');
  check(!(await a.client.from('workouts').delete().eq('id',aStarted.id)).error,'A source cleanup failed');
  const empty=command('create',{name:'Empty template',notes:null,entries:[]});
  check((await request('/api/routines/templates/capabilities',a,undefined,200,true)).templates.ready===false,'A falsely ready');
  check((await request(endpoint,a,empty,503)).error.code==='not_ready','A enabled commands');
  passed('Compatible B+A cookie routine create/start and false native readiness');
  sql(`begin; revoke insert,update,delete,truncate,references,trigger on public.exercises from anon,authenticated;
    revoke truncate,trigger on public.exercises from service_role; update fitness_private.custom_exercise_rollout set ready=true;
    select fitness_private.activate_template_contract(); commit;`); contracted=true;
  receipt.candidateGate={templates:true,custom:true,localOnly:true,uploadHash:sql("select md5(pg_get_functiondef('fitness_private.upload_completed_workout(uuid,jsonb)'::regprocedure))")};
  const saved=await request('/api/routines/templates/commands',a,empty,200,true);
  check(saved.receipt.template.entries.length===0,'Empty template invented content');
  check((await request('/api/routines',a,undefined,409,true)).code==='refresh_required','Stale aggregate reader remained current');
  check((await request(`/api/routines/${legacy.id}`,a,{name:'Old editor'},409,true,'PATCH')).code==='refresh_required','Stale aggregate editor was not fenced');
  const retries=await Promise.all(Array.from({length:3},()=>request(endpoint,a,empty)));
  check(retries.every(value=>isDeepStrictEqual(value,saved)),'Concurrent retry changed first receipt');
  check((await request(endpoint,a,{...empty,command:{...empty.command,name:'Changed retry'}},409)).error.code==='operation_conflict','Changed retry accepted');
  const current=await request(`/api/mobile/train/templates/${legacy.id}`,a);
  check(current.template.entries[0].targets.items.length===2&&current.template.entries[0].targets.items[0].measurements.weightKg==='0.123','Legacy target text changed');
  const target=current.template.entries[0].targets.items[0],entry=current.template.entries[0];
  const edit=command('edit',{templateId:legacy.id,expectedVersion:current.template.version,changes:[{kind:'patch-target',entryId:entry.id,targetId:target.id,patch:{kind:'warmup',measurements:{weightKg:0.45359237}}}]});
  const edited=await request(endpoint,a,edit);
  const rejected=await request(endpoint,a,command('archive',{templateId:legacy.id,expectedVersion:current.template.version}),409);
  check(rejected.rejection.current.version===edited.receipt.template.version,'CAS current authority missing');
  const started=(await request(`/api/routines/${legacy.id}/start`,a,{},201,true)).workout;
  check(started.exercises[0].sets[0].weight_kg===0.45359237&&started.exercises[0].sets[0].set_type==='warmup'
    &&started.exercises[0].sets[1].weight_kg===0.123&&!started.exercises[0].sets[0].is_completed,'Web target start flattened or performed plans');
  check(!(await a.client.from('workouts').delete().eq('id',started.id)).error,'Web source cleanup failed');
  const choices=parsedTool(await mcp(a,'getRoutines',{},['read']));
  check(choices.some(row=>row.template.id===legacy.id&&row.template.entries[0].targets.items[0].measurements.weightKg==='0.45359237'),'Assistant used stale aggregate targets');
  const mcpStarted=parsedTool(await mcp(a,'startWorkout',{routineId:legacy.id}));
  check(mcpStarted.exercises[0].sets[1].weight_kg===0.123,'MCP start lost second target');
  check(!(await a.client.from('workouts').delete().eq('id',mcpStarted.id)).error,'MCP source cleanup failed');
  await request(`/api/mobile/train/templates/${legacy.id}`,b,undefined,404);
  check((await a.client.from('routine_exercises').update({target_reps:99}).eq('id',entry.id)).error?.code==='42501','Direct aggregate bypass survived');
  passed('B+C first receipts, CAS, exact per-set Web/MCP reads and starts; foreign/direct-write isolation');
  const read=await request(`/api/mobile/train/templates/${legacy.id}`,a);
  const capture=read.definitions.find(definition=>definition.exerciseId===preset.id).definition;
  const completedId=randomUUID(),workoutEntryId=randomUUID();
  const bindings=read.template.entries.map(source=>({entryId:source.id,workoutEntryId,targets:source.targets.items.map(target=>({targetId:target.id,workoutSetId:randomUUID()}))}));
  const completion={version:4,id:completedId,ownerId:a.id,sourceId:randomUUID(),startedAt:'2026-10-25T10:00:00Z',completedAt:'2026-10-25T10:05:00Z',durationSeconds:300,timezone:'UTC',workoutDay:'2026-10-25',planId:null,
    templateOrigin:{content:read.template,definitions:read.template.entries.map(entry=>({entryId:entry.id,definition:capture})),bindings},
    exercises:[{id:workoutEntryId,definition:capture,sets:[{id:bindings[0].targets[0].workoutSetId,performed:{mode:'weight_reps',weightKg:0.123,reps:5,kind:'working'}}]}]};
  const envelope={protocolVersion:1,operationId:completedId,completion};
  const upload=await request(uploadEndpoint,a,envelope);
  const web=(await request(`/api/workouts/${completedId}`,a,undefined,200,true)).workout;
  check(web.recordedStatus==='recorded'&&isDeepStrictEqual(web.recorded_completion,completion)&&web.routine_id===legacy.id,'V4 Web read lost complete origin');
  check(parsedTool(await mcp(a,'getWorkoutDetails',{workoutId:completedId})).recordedStatus==='recorded','MCP rejected V4');
  if (runPriorResults) {
    const { verifyPriorResults } = await import('./train-prior-results.mjs');
    receipt.priorResults = await verifyPriorResults({ origin, a, b, request, sql, completion, presetId: preset.id, artifactDirectory: resolve(root,'.artifacts') });
    passed('Actual native/cookie prior-result paging, captured custom identity, duplicate groups and explicit Chromium reuse');
  }
  const converted=await request(endpoint,a,command('save-workout-as-template',{workoutId:completedId,name:'Converted result'}));
  check(converted.receipt.template.entries[0].targets.items[0].measurements.weightKg==='0.123','Conversion changed captured precision');
  check(!(await a.client.from('workouts').delete().eq('id',completedId)).error,'Owned history delete failed');
  check(isDeepStrictEqual(await request(uploadEndpoint,a,envelope),upload)&&!(await a.client.from('workouts').select('id').eq('id',completedId)).data.length,'Old create resurrected history');
  passed('V4 full-origin upload/read/conversion and no resurrection after owned history deletion');
  if (runBrowser) {
    const { verifyTemplateBrowser } = await import('./train-template-browser.mjs');
    receipt.browser = await verifyTemplateBrowser({ origin, user:a, request, legacyTemplateId:legacy.id, artifactDirectory:resolve(root,'.artifacts') });
    passed('Actual Chromium ordered targets, retained legacy facts, conflict review, archive/restore, unfinished Start and representative conversion');
  }
  if(hold){
    const original=await request(`/api/mobile/train/templates/${rootTemplateId}`,rootA);
    const source=original.template.entries[0];
    await request(endpoint,rootA,command('edit',{templateId:rootTemplateId,expectedVersion:original.template.version,changes:[
      {kind:'patch-target',entryId:source.id,targetId:source.targets.items[0].id,patch:{kind:'warmup'}},
      {kind:'patch-target',entryId:source.id,targetId:source.targets.items[1].id,patch:{measurements:{weightKg:null,reps:null}}},
      {kind:'patch-target',entryId:source.id,targetId:source.targets.items[2].id,patch:{measurements:{weightKg:0,reps:5}}},
    ]}));
    const templateRead=await request(`/api/mobile/train/templates/${rootTemplateId}`,rootA);
    check(templateRead.startability.ready&&templateRead.template.entries[0].restSeconds===null,'Root template is not startable with unknown rest');
    const rootActive=(await request('/api/workouts',rootA,{title:'Retained Web active'},201,true)).workout;
    writeFileSync(receiptFile,JSON.stringify({apiOrigin:origin,supabaseUrl:local.API_URL,anonKey:local.ANON_KEY,
      accounts:{a:{userId:rootA.id,accessToken:rootA.token},b:{userId:rootB.id,accessToken:rootB.token}},webActiveWorkoutId:rootActive.id,
      templateId:rootTemplateId,presetExerciseId:preset.id,backendSource:receipt.source,backendSourceHashes:receipt.sourceHashes}),{mode:0o600});
    console.log(`READY origin=${origin} credentialFile=${receiptFile} releaseFile=${resolve(secretsDirectory,'release')}`);
    const end=Date.now()+45*60_000;
    while(!existsSync(resolve(secretsDirectory,'release'))&&Date.now()<end)await new Promise(done=>setTimeout(done,1000));
    check(existsSync(resolve(secretsDirectory,'release')),'Root fixture window expired');
  }
  }
} finally { await cleanup(); }
