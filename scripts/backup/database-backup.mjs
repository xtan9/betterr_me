#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants, createWriteStream, existsSync } from 'node:fs';
import { open, mkdir, lstat, link, unlink, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const magic = Buffer.from('BRMEBAK1\n'), limit = 512 * 1024 * 1024;
const excludedSchemas = ['_realtime', 'realtime', '_analytics', '_supabase', 'pgbouncer', 'vault', 'pgsodium', 'pgsodium_masks', 'graphql', 'graphql_public', 'net'];
const excludedTableData = ['storage.buckets_vectors', 'storage.vector_indexes'];
const defaultDirectory = join(homedir(), 'Library/Application Support/betterrme/backups');
class BackupError extends Error {}
function check(condition, message) { if (!condition) throw new BackupError(message); }
function externalPath(path) {
  check(typeof path === 'string' && isAbsolute(path), 'Use an absolute path outside the repository.');
  const full = resolve(path);
  check(full !== repository && !full.startsWith(`${repository}/`), 'Backup files and keys must stay outside the repository.');
  for (let parent = full; parent !== dirname(parent); parent = dirname(parent)) {
    check(!existsSync(join(parent, '.git')), 'Backup files and keys must stay outside every Git checkout.');
  }
  return full;
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    check(args[i]?.startsWith('--') && args[i + 1] && !Object.hasOwn(result, args[i]), 'Invalid or repeated option.');
    result[args[i]] = args[i + 1];
  }
  return result;
}
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  externalPath(await realpath(path));
  const info = await lstat(path);
  check(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'Use an owner-only directory (0700).');
}
async function keyFile(path) {
  externalPath(await realpath(externalPath(path)));
  const file = await open(externalPath(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    check(info.isFile() && info.size === 32 && (info.mode & 0o077) === 0, 'Key must be a private 32-byte file (0600).');
    return await file.readFile();
  } finally { await file.close(); }
}
async function keygen(path) {
  path = externalPath(path); await privateDirectory(dirname(path));
  const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  const key = randomBytes(32);
  try { await file.writeFile(key); await file.sync(); } finally { key.fill(0); await file.close(); }
  return { status: 'key-created', keyFile: path };
}
function databaseEnvironment(value, restore = false) {
  let url; try { url = new URL(value); } catch { throw new BackupError('Provide the database URL through the documented environment variable.'); }
  check(url.protocol === 'postgresql:' || url.protocol === 'postgres:', 'Unsupported database protocol.');
  check(url.username && url.hostname && url.pathname.length > 1 && !url.hash, 'Incomplete database connection.');
  check([...url.searchParams.keys()].every(key => key === 'sslmode'), 'Only sslmode is supported in the database URL.');
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (restore) check(local && url.port === '54322' && url.pathname === '/postgres', 'Restore is restricted to disposable local PostgreSQL on port 54322; existing databases are never restore targets.');
  if (!local) check(url.searchParams.get('sslmode') === 'verify-full', 'Remote export requires sslmode=verify-full and an appropriate libpq CA trust configuration.');
  return { PATH: '/usr/bin:/bin', LANG: 'C', PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'betterr-encrypted-backup',
    PGSSLMODE: url.searchParams.get('sslmode') || (local ? 'disable' : 'verify-full'),
    ...(process.env.PGSSLROOTCERT ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT } : {}),
  };
}
function processFor(tool, args, env) {
  const bin = process.env.BETTERR_PG_BIN || '/opt/homebrew/opt/libpq/bin';
  check(isAbsolute(bin), 'BETTERR_PG_BIN must be an absolute trusted PostgreSQL binary directory.');
  const child = spawn(join(bin, tool), args, { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const done = new Promise(resolve => { child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0)); });
  return { child, done };
}
async function execute(tool, args, env, input) {
  const { child, done } = processFor(tool, args, env); let output = '', oversized = false;
  child.stdout.on('data', value => { output += value.toString(); if (output.length > 2_000_000) { oversized = true; child.kill(); } });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  check(await done && !oversized, `${tool} failed; database diagnostics are suppressed to protect credentials and record contents.`);
  return output.trim();
}
const inventorySql = `select json_build_object('serverVersion',current_setting('server_version'),
  'schemas',(select coalesce(json_agg(nspname order by nspname),'[]'::json) from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema' and nspname not in (${excludedSchemas.map(s => `'${s}'`).join(',')})),
  'tables',(select coalesce(json_agg(json_build_object('schema',schemaname,'name',tablename) order by schemaname,tablename),'[]'::json) from pg_tables where schemaname not like 'pg_%' and schemaname<>'information_schema' and schemaname not in (${excludedSchemas.map(s => `'${s}'`).join(',')})),
  'extensions',(select coalesce(json_agg(json_build_object('name',extname,'version',extversion) order by extname),'[]'::json) from pg_extension));`;
const psqlArgs = ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'];
async function inventory(env) { return JSON.parse(await execute('psql', psqlArgs, env, inventorySql)); }
function framed(value) { const data = Buffer.from(JSON.stringify(value)), length = Buffer.alloc(4); length.writeUInt32BE(data.length); return Buffer.concat([length, data]); }
async function exportDatabase(key, directory) {
  directory = externalPath(directory); await privateDirectory(directory);
  const env = { ...databaseEnvironment(process.env.BETTERR_BACKUP_SOURCE_URL), PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=600000' };
  const sourceInventory = await inventory(env);
  const dumpVersion = await execute('pg_dump', ['--version'], env);
  const dumpMajor = Number(dumpVersion.match(/(\d+)\./)?.[1]);
  check(dumpMajor === Number(sourceInventory.serverVersion.split('.')[0]), 'Use pg_dump binaries matching the source PostgreSQL major version.');
  const manifest = { format: 'pg_dump-custom', ...sourceInventory, dumpVersion, dumpMajor,
    sourceIdentityVersion: 1,
    sourceId: createHash('sha256').update(JSON.stringify([env.PGHOST, env.PGPORT, env.PGDATABASE, env.PGUSER])).digest('hex'),
    inventoryObservedAt: new Date().toISOString(), excludedSchemas, excludedTableData,
    ownership: 'reassigned-to-restoring-role', grants: 'preserved-existing-roles-required',
    excludedResources: ['Storage object bytes', 'cluster roles/passwords', 'OAuth/provider and hosting settings', 'Vault/pgsodium encryption roots', 'application encryption keys', 'WAL/PITR'] };
  const metadata = framed(manifest); check(metadata.length < 100_000, 'Database inventory exceeds the supported envelope limit.');
  const id = randomUUID(), iv = randomBytes(12);
  const header = { version: 1, algorithm: 'aes-256-gcm', id, createdAt: new Date().toISOString(), keyId: createHash('sha256').update(key).digest('hex'), iv: iv.toString('base64') };
  const prefix = Buffer.concat([magic, framed(header)]), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(prefix);
  const file = join(directory, `${header.createdAt.replaceAll(':', '-')}-${id}.brmebak`), partial = `${file}.partial`;
  const { child, done } = processFor('pg_dump', ['--format=custom', '--no-owner', '--no-publications', '--no-subscriptions', '--no-password',
    ...excludedSchemas.map(schema => `--exclude-schema=${schema}`), ...excludedTableData.map(table => `--exclude-table-data=${table}`)], env);
  child.stdin.end();
  try {
    async function* encrypted() {
      yield prefix; yield cipher.update(metadata); let bytes = 0;
      for await (const chunk of child.stdout) { bytes += chunk.length; check(bytes <= limit - prefix.length - metadata.length - 16, 'Archive exceeds the supported 512 MiB recovery limit.'); yield cipher.update(chunk); }
      check(await done, 'pg_dump failed; no completed backup was published.');
      yield cipher.final(); yield cipher.getAuthTag();
    }
    await pipeline(encrypted(), createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
    const handle = await open(partial, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
    await link(partial, file); await unlink(partial);
    const parent = await open(directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
    return { status: 'exported', file, id, createdAt: header.createdAt, schemas: manifest.schemas, retention: 'manual; no files removed' };
  } catch (error) { child.kill(); await done; await unlink(partial).catch(() => {}); throw error; }
}
async function decrypt(key, path) {
  const handle = await open(externalPath(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try { const info = await handle.stat(); check(info.isFile() && info.size <= limit && info.size > magic.length + 4 + 16, 'Invalid or oversized backup file.'); bytes = await handle.readFile(); }
  finally { await handle.close(); }
  check(bytes.subarray(0, magic.length).equals(magic), 'Unsupported backup envelope.');
  const length = bytes.readUInt32BE(magic.length), end = magic.length + 4 + length;
  check(length < 4096 && end < bytes.length - 16, 'Invalid backup header.');
  let header; try { header = JSON.parse(bytes.subarray(magic.length + 4, end).toString()); } catch { throw new BackupError('Invalid backup header.'); }
  check(header.version === 1 && header.algorithm === 'aes-256-gcm' && header.keyId === createHash('sha256').update(key).digest('hex') && typeof header.iv === 'string', 'Wrong key or unsupported envelope.');
  const iv = Buffer.from(header.iv, 'base64'); check(iv.length === 12, 'Invalid backup nonce.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(bytes.subarray(0, end)); decipher.setAuthTag(bytes.subarray(-16));
  let first, plain;
  try { first = decipher.update(bytes.subarray(end, -16)); plain = Buffer.concat([first, decipher.final()]); }
  catch { first?.fill(0); throw new BackupError('Backup authentication failed; nothing was restored.'); }
  finally { bytes.fill(0); first?.fill(0); }
  try {
    check(plain.length > 4, 'Invalid backup payload.'); const metadataLength = plain.readUInt32BE(0);
    check(metadataLength < 100_000 && metadataLength < plain.length - 9, 'Invalid backup inventory.');
    const manifest = JSON.parse(plain.subarray(4, 4 + metadataLength).toString()), archive = plain.subarray(4 + metadataLength);
    check(manifest.format === 'pg_dump-custom' && Array.isArray(manifest.schemas) && Array.isArray(manifest.tables) && archive.subarray(0, 5).toString() === 'PGDMP', 'Invalid backup archive.');
    return { header, manifest, archive, clear: () => plain.fill(0) };
  } catch (error) { plain.fill(0); throw error; }
}
async function restoreLocal(backup) {
  // Authentication completes before any database is created or archive byte reaches pg_restore.
  const env = databaseEnvironment(process.env.BETTERR_RESTORE_ADMIN_URL, true), database = `betterr_restore_${randomUUID().replaceAll('-', '')}`;
  const targetVersion = await execute('psql', psqlArgs, env, 'show server_version;');
  const restoreVersion = await execute('pg_restore', ['--version'], env);
  check(Number(targetVersion.split('.')[0]) === backup.manifest.dumpMajor && Number(restoreVersion.match(/(\d+)\./)?.[1]) === backup.manifest.dumpMajor, 'Use a disposable database and restore binaries matching the archive PostgreSQL major version.');
  console.error(JSON.stringify({ status: 'planned-local-restore', database }));
  try {
    await execute('psql', psqlArgs, env, `create database "${database}" template template0;`);
    const target = { ...env, PGDATABASE: database };
    await execute('pg_restore', ['--dbname', database, '--no-owner', '--single-transaction', '--exit-on-error', '--no-password', '--no-publications', '--no-subscriptions'], target, backup.archive);
    const actual = await inventory(target);
    check(JSON.stringify(actual.tables) === JSON.stringify(backup.manifest.tables), 'Restored table inventory differs; owned restore database will be removed.');
    return { status: 'restored-local', database, tables: actual.tables.length, schemas: actual.schemas, sourceExportId: backup.header.id,
      remaining: 'Verify application reads and owner isolation, then remove this owned restore database. No hosted service was restored.' };
  } catch (error) {
    try { await execute('psql', psqlArgs, env, `drop database if exists "${database}" with(force);`); }
    catch { throw new BackupError(`${error instanceof BackupError ? error.message : 'Restore failed.'} Cleanup failed for owned database ${database}; inspect and remove only this database manually.`); }
    throw error;
  }
}
async function prune(key, directory, keep) {
  check(Number.isInteger(keep) && keep >= 1 && keep <= 1000, 'Retention must keep 1 to 1000 authenticated backups.');
  directory = externalPath(directory); await privateDirectory(directory);
  const files = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.brmebak')) continue;
    const file = join(directory, name), backup = await decrypt(key, file);
    try { check(backup.manifest.sourceIdentityVersion === 1 && typeof backup.manifest.sourceId === 'string', 'Retention requires verified database routing identity; older exports are preserved.');
      check(Number.isFinite(Date.parse(backup.header.createdAt)), 'Invalid backup timestamp.'); files.push({ file, createdAt: backup.header.createdAt, sourceId: backup.manifest.sourceId }); }
    finally { backup.clear(); }
  }
  check(new Set(files.map(file => file.sourceId)).size <= 1, 'Keep backups for different database sources in separate retention directories.');
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.file.localeCompare(a.file));
  // Authenticate the complete candidate set before deleting any file. Mixed keys,
  // corruption or unsupported versions abort the entire retention operation.
  for (const item of files.slice(keep)) await unlink(item.file);
  return { status: 'pruned', retained: Math.min(keep, files.length), removed: Math.max(0, files.length - keep) };
}
async function main() {
  const [command, ...args] = process.argv.slice(2), opts = options(args);
  const allowed = { keygen: ['--key-file'], export: ['--key-file', '--out-dir'], inspect: ['--key-file', '--input'], 'restore-local': ['--key-file', '--input'], prune: ['--key-file', '--out-dir', '--keep'] };
  check(Object.hasOwn(allowed, command) && Object.keys(opts).every(key => allowed[command].includes(key)), 'Unknown command or option.');
  if (command === 'keygen') return keygen(opts['--key-file']);
  const key = await keyFile(opts['--key-file']);
  try {
    if (command === 'export') {
      const directory = opts['--out-dir'] || defaultDirectory;
      await privateDirectory(externalPath(directory));
      check(!(await realpath(opts['--key-file'])).startsWith(`${await realpath(directory)}/`), 'Keep the encryption key outside the backup directory.');
      return await exportDatabase(key, directory);
    }
    if (command === 'prune') return await prune(key, opts['--out-dir'] || defaultDirectory, Number(opts['--keep']));
    const backup = await decrypt(key, opts['--input']);
    try { return command === 'inspect' ? { status: 'authenticated', id: backup.header.id, createdAt: backup.header.createdAt, manifest: backup.manifest } : await restoreLocal(backup); }
    finally { backup.clear(); }
  } finally { key.fill(0); }
}
main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error instanceof BackupError ? error.message : 'Backup operation failed; no credentials or key material were logged.'); process.exitCode = 1; });
