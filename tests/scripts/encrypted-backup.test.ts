// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, chmodSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
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
