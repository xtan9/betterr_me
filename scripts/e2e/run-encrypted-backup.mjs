import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bin = process.env.BETTERR_PG_BIN || '/opt/homebrew/opt/libpq/bin';
const source = `betterr_backup_source_${randomUUID().replaceAll('-', '')}`;
const local = { PATH: '/usr/bin:/bin', PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGDATABASE: 'postgres', PGCONNECT_TIMEOUT: '10' };
const directory = await mkdtemp(join(tmpdir(), 'betterr-encrypted-backup-'));
let restored;
const check = (condition, message) => { if (!condition) throw new Error(message); };
function sql(query, database = 'postgres') {
  const result = spawnSync(join(bin, 'psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { env: { ...local, PGDATABASE: database }, input: query, encoding: 'utf8' });
  check(result.status === 0, 'Local fixture SQL failed (details suppressed to protect backup data)'); return result.stdout.trim();
}
function cli(args, extra = {}, expected = 0) {
  const result = spawnSync(process.execPath, ['scripts/backup/database-backup.mjs', ...args], { cwd: root, encoding: 'utf8', env: {
    PATH: process.env.PATH, HOME: process.env.HOME, BETTERR_PG_BIN: bin,
    BETTERR_BACKUP_SOURCE_URL: `postgresql://postgres:postgres@127.0.0.1:54322/${source}`,
    BETTERR_RESTORE_ADMIN_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', ...extra,
  } });
  check(result.status === expected, `Backup CLI ${args[0]} expected ${expected}, got ${result.status}: ${result.stderr}`);
  return expected === 0 ? JSON.parse(result.stdout) : result;
}
try {
  check(sql('select current_database()') === 'postgres', 'Local disposable database unavailable');
  sql(`create database "${source}" template template0;`);
  sql(`create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text not null);
    create table public.profiles(id uuid primary key references auth.users(id));
    create schema storage; create table storage.objects(id uuid primary key,name text); insert into storage.objects values(gen_random_uuid(),'fixture-file-metadata-only');
    create schema _realtime; create table _realtime.transient(value text); insert into _realtime.transient values('not-in-portable-export');
    create schema vault; create table vault.secrets(value text); insert into vault.secrets values('external-root-required');
    insert into auth.users values('f0800000-0000-4000-8000-000000000001','backup-owner@example.test'),('f0800000-0000-4000-8000-000000000002','other-owner@example.test');
    insert into public.profiles select id from auth.users;`, source);
  for (const file of ['20261024190712_focus_history.sql', '20261024194415_app_limit_history.sql', '20261024200918_app_limit_continuations.sql']) {
    sql(await readFile(join(root, 'supabase/migrations', file), 'utf8'), source);
  }
  sql(`select set_config('request.jwt.claims','{"sub":"f0800000-0000-4000-8000-000000000001","role":"authenticated"}',false); set role authenticated;
    select public.app_limit_history_ingest('{"schemaVersion":1,"source":{"id":"f0800000-0000-4000-8000-000000000010","label":"Backup fixture device","platform":"ios"},"events":[{"schemaVersion":1,"id":"f0800000-0000-4000-8000-000000000011","sequence":1,"kind":"app-limit-baseline","observedAt":1790000060000,"appVersion":"0.1.0","ruleId":"f0800000-0000-4000-8000-000000000012","reason":"baseline","before":null,"after":{"label":"Private backup canary","day":"2026-10-24","dailyUnlocks":3,"minutes":5,"current":2,"best":4,"status":"paused","usedToday":0,"overridesToday":0}}]}');`, source);
  sql(`select set_config('request.jwt.claims','{"sub":"f0800000-0000-4000-8000-000000000001","role":"authenticated"}',false); set role authenticated;
    select public.app_limit_continuation_confirm('{"schemaVersion":1,"operationId":"f0800000-0000-4000-8000-000000000030","source":{"sourceId":"f0800000-0000-4000-8000-000000000010","ruleId":"f0800000-0000-4000-8000-000000000012","expectedCheckpoint":1,"expectedEvent":{"eventId":"f0800000-0000-4000-8000-000000000011","sequence":1}},"destination":{"source":{"id":"f0800000-0000-4000-8000-000000000020","label":"Backup continuation","platform":"ios"},"ruleId":"f0800000-0000-4000-8000-000000000022","expectedCheckpoint":0,"expectedRuleEvent":null,"applyEventId":"f0800000-0000-4000-8000-000000000021","label":"Continued fixture","dailyUnlocks":2,"minutes":5}}');
    select public.app_limit_history_ingest('{"schemaVersion":1,"source":{"id":"f0800000-0000-4000-8000-000000000020","label":"Backup continuation","platform":"ios"},"events":[{"schemaVersion":1,"id":"f0800000-0000-4000-8000-000000000021","sequence":1,"kind":"app-limit-change","observedAt":1790000060001,"appVersion":"0.1.0","ruleId":"f0800000-0000-4000-8000-000000000022","reason":"limitCreated","before":null,"after":{"label":"Continued fixture","day":"2026-10-25","dailyUnlocks":2,"minutes":5,"current":2,"best":4,"status":"counting","usedToday":0,"overridesToday":0}}]}');
    select public.focus_history_ingest('{"schemaVersion":1,"source":{"id":"f0800000-0000-4000-8000-000000000040","label":"Focus fixture","platform":"ios"},"events":[{"id":"f0800000-0000-4000-8000-000000000041","sequence":1,"kind":"focus-session-completed","observedAt":61000,"appVersion":"0.1.0","session":{"id":"f0800000-0000-4000-8000-000000000042","startedAt":1000,"endedAt":61000,"completedRounds":1,"settings":{"preset":"quick","focusMinutes":10,"shortBreakMinutes":5,"longBreakMinutes":15,"longBreakEvery":4},"link":null,"segments":[{"start":1000,"end":61000}]}}]}');`, source);
  const key = join(directory, 'keys', 'backup.key'), out = join(directory, 'encrypted');
  cli(['keygen', '--key-file', key]);
  const saved = cli(['export', '--key-file', key, '--out-dir', out]);
  const bytes = await readFile(saved.file);
  check(!bytes.includes(Buffer.from('Private backup canary')) && !bytes.includes(Buffer.from('backup-owner@example.test')), 'Plaintext escaped encrypted envelope');
  check((await readdir(out)).every(name => name.endsWith('.brmebak')), 'Export left a plaintext or partial file');
  const info = cli(['inspect', '--key-file', key, '--input', saved.file]);
  check(info.manifest.schemas.includes('auth') && info.manifest.schemas.includes('app_limit_private') && !info.manifest.schemas.includes('vault'), 'Schema scope incorrect');
  const restoredResult = cli(['restore-local', '--key-file', key, '--input', saved.file]); restored = restoredResult.database;
  check(/^betterr_restore_[a-f0-9]{32}$/.test(restored), 'Unsafe restore target name');
  check(sql('select count(*) from auth.users', restored) === '2', 'Auth owners did not restore');
  const readOwner = owner => sql(`select set_config('request.jwt.claims','{"sub":"${owner}","role":"authenticated"}',false); set role authenticated; select public.app_limit_history_read(0,50)->'items';`, restored).split('\n').at(-1);
  const owned = JSON.parse(readOwner('f0800000-0000-4000-8000-000000000001'));
  check(owned.length === 2 && owned[0].event.after.current === 2 && owned[0].event.after.best === 4, 'Portable history was not restored');
  const lineage = JSON.parse(sql(`select set_config('request.jwt.claims','{"sub":"f0800000-0000-4000-8000-000000000001","role":"authenticated"}',false); set role authenticated; select public.app_limit_continuation_read(null,'f0800000-0000-4000-8000-000000000020','f0800000-0000-4000-8000-000000000021');`, restored).split('\n').at(-1));
  check(lineage.application.state === 'recorded' && lineage.receipt.restored.current === 2, 'Continuation receipt/lineage did not restore');
  check(sql('select count(*) from public.focus_history_events', restored) === '1', 'Completed Focus sessions did not restore');
  check(JSON.parse(readOwner('f0800000-0000-4000-8000-000000000002')).length === 0, 'Restored RLS exposed another owner');
  check(sql("select to_regclass('_realtime.transient') is null and to_regclass('vault.secrets') is null", restored) === 't', 'Excluded service state was restored');
  check(sql('select count(*) from storage.objects', restored) === '1', 'Storage metadata was not inventoried/restored');
  const wrongKey = join(directory, 'keys', 'wrong.key'); cli(['keygen', '--key-file', wrongKey]);
  cli(['inspect', '--key-file', wrongKey, '--input', saved.file], {}, 1);
  const corrupt = join(out, 'tampered.brmebak'); bytes[bytes.length - 20] ^= 1; await writeFile(corrupt, bytes);
  cli(['restore-local', '--key-file', key, '--input', corrupt], {}, 1);
  const beforePrune = await readdir(out);
  cli(['prune', '--key-file', key, '--out-dir', out, '--keep', '1'], {}, 1);
  check((await readdir(out)).length === beforePrune.length, 'Corrupt backup caused partial retention deletion');
  await rm(corrupt);
  cli(['export', '--key-file', key, '--out-dir', out]);
  const retention = cli(['prune', '--key-file', key, '--out-dir', out, '--keep', '1']);
  check(retention.retained === 1 && retention.removed === 1 && (await readdir(out)).length === 1, 'Explicit authenticated retention failed');
  const retainedFile = join(out, (await readdir(out))[0]);
  const badTarget = cli(['restore-local', '--key-file', key, '--input', retainedFile], { BETTERR_RESTORE_ADMIN_URL: 'postgresql://private:do-not-print@production.invalid/postgres' }, 1);
  check(!badTarget.stderr.includes('do-not-print'), 'Credential leaked on rejection');
  console.log('PASS encrypted export, exact portable history recovery, restored owner RLS, Auth/Storage inventory, excluded services, wrong-key/tamper rejection, safe local target, authenticated retention and no plaintext files');
} finally {
  if (restored && /^betterr_restore_[a-f0-9]{32}$/.test(restored)) sql(`drop database "${restored}" with(force);`);
  sql(`drop database if exists "${source}" with(force);`);
  await rm(directory, { recursive: true, force: true });
  console.log('PASS only owned source/restore fixtures and temporary keys/exports removed; shared database untouched');
}
