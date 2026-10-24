// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, chmodSync, writeFileSync, symlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const folders: string[] = [];
const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/backup/database-backup.mjs', ...args], { encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH, HOME: process.env.HOME } });
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); });
it('creates a private random backup key without printing it or replacing an existing key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const path = join(directory, 'key.bin');
  const result = run('keygen', '--key-file', path);
  expect(result.status).toBe(0);
  const key = readFileSync(path);
  expect(key.length).toBe(32); expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(result.stdout + result.stderr).not.toContain(key.toString('hex'));
  expect(result.stdout + result.stderr).not.toContain(key.toString('base64'));
  expect(run('keygen', '--key-file', path).status).not.toBe(0);
  expect(readFileSync(path)).toEqual(key);
});

it('refuses exposed or linked key files and ambiguous command options', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const key = join(directory, 'private.key'), input = join(directory, 'invalid.brmebak');
  expect(run('keygen', '--key-file', key).status).toBe(0); writeFileSync(input, 'not an encrypted archive');
  chmodSync(key, 0o644);
  expect(run('inspect', '--key-file', key, '--input', input).stderr).toContain('private 32-byte file');
  chmodSync(key, 0o600); const linked = join(directory, 'linked.key'); symlinkSync(key, linked);
  expect(run('inspect', '--key-file', linked, '--input', input).status).not.toBe(0);
  expect(run('inspect', '--key-file', key, '--input', input).status).not.toBe(0);
  expect(run('keygen', '--key-file', key, '--key-file', key).status).not.toBe(0);
  expect(run('restore-local', '--key-file', key, '--input', input, '--target', 'postgres').status).not.toBe(0);
});

it('keeps keys out of every Git checkout and out of the archive directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const checkout = join(directory, 'another-checkout'); mkdirSync(checkout, { mode: 0o700 }); mkdirSync(join(checkout, '.git'));
  expect(run('keygen', '--key-file', join(checkout, 'key.bin')).stderr).toContain('outside every Git checkout');
  const archive = join(directory, 'archives'), key = join(archive, 'key.bin');
  expect(run('keygen', '--key-file', key).status).toBe(0);
  expect(run('export', '--key-file', key, '--out-dir', archive).stderr).toContain('outside the backup directory');
});

it('cannot prune one Supabase project away when distinct pooler users share a host and database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const bin = join(directory, 'bin'), out = join(directory, 'archives'), key = join(directory, 'keys', 'backup.key');
  mkdirSync(bin, { mode: 0o700 });
  // Infrastructure seam only: the CLI sees two valid pg_dump streams from the
  // same pooler endpoint. The separate real-Postgres drill verifies restoration.
  writeFileSync(join(bin, 'psql'), `#!${process.execPath}\nconsole.log(JSON.stringify({serverVersion:'15.8',schemas:['public'],tables:[],extensions:[]}));`, { mode: 0o700 });
  writeFileSync(join(bin, 'pg_dump'), `#!${process.execPath}\nprocess.stdout.write(process.argv.includes('--version')?'pg_dump (PostgreSQL) 15.19':'PGDMP infrastructure fixture');`, { mode: 0o700 });
  expect(run('keygen', '--key-file', key).status).toBe(0);
  const pooled = (user: string) => spawnSync(process.execPath, ['scripts/backup/database-backup.mjs', 'export', '--key-file', key, '--out-dir', out], {
    encoding: 'utf8', env: { NODE_ENV: 'test', HOME: process.env.HOME, PATH: process.env.PATH, BETTERR_PG_BIN: bin,
      BETTERR_BACKUP_SOURCE_URL: `postgresql://${user}:fixture@shared.pooler.supabase.test:5432/postgres?sslmode=verify-full` },
  });
  expect(pooled('postgres.project-a').status).toBe(0); expect(pooled('postgres.project-b').status).toBe(0);
  const before = readdirSync(out);
  const pruned = run('prune', '--key-file', key, '--out-dir', out, '--keep', '1');
  expect(pruned.status).not.toBe(0); expect(pruned.stderr).toContain('different database sources');
  expect(readdirSync(out)).toEqual(before);
});

it('refuses a different checkout root as the encrypted output directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const checkout = join(directory, 'other-checkout'), key = join(directory, 'keys', 'private.key');
  mkdirSync(checkout, { mode: 0o700 }); mkdirSync(join(checkout, '.git'));
  expect(run('keygen', '--key-file', key).status).toBe(0);
  expect(run('export', '--key-file', key, '--out-dir', checkout).stderr).toContain('outside every Git checkout');
});

it('reports its exact owned database when a failed restore also fails cleanup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-backup-test-')); folders.push(directory);
  const bin = join(directory, 'bin'), out = join(directory, 'archives'), key = join(directory, 'keys', 'backup.key'), targetFile = join(directory, 'target.txt');
  mkdirSync(bin, { mode: 0o700 });
  writeFileSync(join(bin, 'psql'), `#!${process.execPath}\nimport{readFileSync,writeFileSync}from'node:fs';const q=readFileSync(0,'utf8');if(q.includes('create database')){writeFileSync(${JSON.stringify(targetFile)},q.match(/betterr_restore_[a-f0-9]{32}/)[0]);}else if(q.includes('drop database')){process.exitCode=1;}else if(q.includes('show server_version')){console.log('15.8');}else{console.log(JSON.stringify({serverVersion:'15.8',schemas:['public'],tables:[],extensions:[]}));}`, { mode: 0o700 });
  writeFileSync(join(bin, 'pg_dump'), `#!${process.execPath}\nprocess.stdout.write(process.argv.includes('--version')?'pg_dump (PostgreSQL) 15.19':'PGDMP infrastructure fixture');`, { mode: 0o700 });
  writeFileSync(join(bin, 'pg_restore'), `#!${process.execPath}\nif(process.argv.includes('--version'))console.log('pg_restore (PostgreSQL) 15.19');else process.exitCode=1;`, { mode: 0o700 });
  expect(run('keygen', '--key-file', key).status).toBe(0);
  const controlled = (...args: string[]) => spawnSync(process.execPath, ['scripts/backup/database-backup.mjs', ...args], { encoding: 'utf8', env: {
    NODE_ENV: 'test', HOME: process.env.HOME, PATH: process.env.PATH, BETTERR_PG_BIN: bin, BETTERR_BACKUP_SOURCE_URL: 'postgresql://postgres:fixture@127.0.0.1:54322/source',
    BETTERR_RESTORE_ADMIN_URL: 'postgresql://postgres:fixture@127.0.0.1:54322/postgres',
  } });
  const saved = controlled('export', '--key-file', key, '--out-dir', out); expect(saved.status).toBe(0);
  const failed = controlled('restore-local', '--key-file', key, '--input', JSON.parse(saved.stdout).file);
  expect(failed.status).not.toBe(0); expect(failed.stderr).toContain('Cleanup failed');
  expect(failed.stderr).toContain(readFileSync(targetFile, 'utf8'));
});
