# Encrypted database backup and isolated restore

This is the backup portion of [mobile T8 #406](https://github.com/xtan9/betterr_me_mobile/issues/406). The accepted decision keeps the existing free Supabase plan. Supabase recommends regular exports and off-site copies for free projects; database backups contain Storage metadata, not uploaded object bytes. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups).

## Current operational status

- Implemented and tested: explicit encrypted export, authenticated inspection, isolated local restore, owner-data/lineage verification and explicit retention.
- Default destination: `~/Library/Application Support/betterrme/backups`, owner-only directory. No production export has been performed. There is no configured backup schedule, managed paid backup service, off-site destination or off-site credential.
- Default retention: exports retain all completed files. After a restore check, explicitly run `prune --keep 7` to retain the seven newest authenticated exports for one database source and encryption key. Nothing is deleted automatically. Source identity includes the PostgreSQL routing username as well as host, port and database, so projects sharing a Supabase pooler endpoint remain separate. Mixed keys/sources, tampering or unsupported/legacy source identities abort pruning before deletion.
- Encryption key: a separate owner-only 32-byte file, outside every Git checkout and outside the backup directory. No production key was created by this verification. Keep a recoverable copy in an authorized password/secret manager; a key only on the same machine does not protect against machine loss. Off-site file/key recovery and recurring execution remain pending.
- Hosted deployment, integrated mobile/Web UAT and physical Screen Time checks belong to the parent delivery matrix. This document does not close those gates.

## What is exported

The tool uses a PostgreSQL custom logical archive. It includes `auth`, `public`, `supabase_migrations` when present, custom application/private schemas (including Focus/app-limit events and continuation receipts), their table data, functions, triggers, indexes, policies and grants, and Storage metadata. The encrypted manifest records the observed schema/table inventory, PostgreSQL and dump versions, extension versions and exclusions. `pg_dump` obtains a consistent data snapshot; the separately observed inventory is not advertised as an atomic checkpoint. Avoid schema migrations during export; restore refuses an unexpected table inventory.

Explicitly excluded schemas: `_realtime`, `realtime`, `_analytics`, `_supabase`, `pgbouncer`, `vault`, `pgsodium`, `pgsodium_masks`, `graphql`, `graphql_public`, `net`. Their service/runtime state is not application recovery evidence. Data in `storage.buckets_vectors` and `storage.vector_indexes` is also excluded, following the current Supabase logical-restore guidance. Publications and subscriptions are excluded. PostgreSQL system catalogs are not logical application exports.

Not covered:

- Storage object bytes, deleted uploaded files and vector object contents. Metadata alone does not recreate a file.
- Cluster roles, role passwords, hosting configuration, Edge Function source/deployment, secrets, OAuth provider/dashboard settings, SMTP, DNS, API/JWT configuration or subscription/replication state.
- Vault/pgsodium root keys and their excluded secrets. Supabase's manual-restore guidance treats encryption-root recovery separately. [Supabase manual backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- Application encryption roots. An encrypted Google/OAuth credential stored in an included application table is backed up as ciphertext; it is unusable without the separately managed application key. A successful database restore does not prove a Google reconnection or restored provider authorization.
- iOS selection tokens, Screen Time authorization, active grants and timers: these are local enforcement state and are intentionally absent from portable cloud history.
- WAL, point-in-time recovery, filesystem state or a complete Supabase service reconstruction.

The restore keeps grants and policies, requiring referenced roles to exist. Object ownership is reassigned to the restoring role. Production recovery therefore needs a compatible Supabase environment, matching required roles/extensions and an ownership/security review; this tool deliberately cannot restore over a hosted or existing database.

## Encryption and credentials

`database-backup.mjs` uses Node's standard AES-256-GCM implementation with a fresh random 96-bit nonce per archive and a random 256-bit key. The versioned header is authenticated as associated data; the inventory and PostgreSQL archive are encrypted. Exports stream straight from `pg_dump` to an exclusive encrypted `.partial` file, flush it, and publish a completed `.brmebak` without overwriting another file. Failed exports never publish a completed backup. Interrupted processes can leave encrypted `.partial` files; inspect/remove those separately.

Before restoration, the complete envelope authenticates in memory. Unauthenticated plaintext never reaches `pg_restore`. There are no plaintext temporary files; plaintext exists transiently in process memory and pipes. The bounded restore supports archives up to 512 MiB and needs memory for the encrypted/decrypted buffers. Larger archives require a separately reviewed streaming authenticated format.

Connection URLs are read only from `BETTERR_BACKUP_SOURCE_URL` and `BETTERR_RESTORE_ADMIN_URL`. Supply them from an authorized secret manager/environment without putting values in shell history, tickets, logs or repository files. PostgreSQL children receive parsed libpq environment variables, never a credential-bearing command argument. Child database diagnostics are suppressed because they can contain record values. Remote **export** requires `sslmode=verify-full`; set `PGSSLROOTCERT` to an appropriate CA trust file. The tool does not configure or rotate credentials.

## Manual commands

Use a supported Node runtime and PostgreSQL command-line binaries matching the source and restore-server major version. The verification database is PostgreSQL 15.8 and used `postgresql@15` tools 15.19. The existing libpq 18 tools generated a `transaction_timeout` setting unavailable on PostgreSQL 15; the tool now rejects a major mismatch before export/restore. Installing CLI tools did not start a PostgreSQL service. Homebrew created its normal unused local data directory; this workflow continues to use the existing disposable Supabase server on 54322.

Set `BETTERR_PG_BIN` to the absolute directory containing `psql`, `pg_dump` and `pg_restore`; default is `/opt/homebrew/opt/libpq/bin`, so override it when that major does not match. For the verified local environment:

```sh
export BETTERR_PG_BIN=/opt/homebrew/opt/postgresql@15/bin
backup_key_file="$HOME/Library/Application Support/betterrme/backup-keys/database-v1.key"
backup_out_dir="$HOME/Library/Application Support/betterrme/backups"
node scripts/backup/database-backup.mjs keygen --key-file "$backup_key_file"
```

`keygen` refuses to replace an existing key. Keep the key separate when copying encrypted exports off-site.

Once the authorized **source** URL is present in `BETTERR_BACKUP_SOURCE_URL`:

```sh
node scripts/backup/database-backup.mjs export --key-file "$backup_key_file" --out-dir "$backup_out_dir"
```

The JSON response identifies the completed encrypted file. It means an export completed, not that recurring backups or recovery were verified. Set `backup_file` to that exact path, then authenticate it:

```sh
node scripts/backup/database-backup.mjs inspect --key-file "$backup_key_file" --input "$backup_file"
```

For restore verification, set `BETTERR_RESTORE_ADMIN_URL` to the owned local Supabase **postgres** database on `127.0.0.1:54322` (or `localhost:54322`). The tool creates a fresh `betterr_restore_<random-id>` database from `template0`; it accepts no target database option and never overwrites `postgres` or a supplied database. Wrong keys/corruption are rejected before a database is created. Restore prints the planned random database name to stderr before creation. Failed restore/verification removes only that database; a cleanup failure reports the exact name and requires manual inspection. A killed process can also leave this database; use the recorded name for cleanup.

```sh
node scripts/backup/database-backup.mjs restore-local --key-file "$backup_key_file" --input "$backup_file"
```

A successful restore intentionally leaves that new database for application/owner checks. After inspection, remove **only the exact returned database** using the local administrator connection. Do not promote it to production. For a repeatable verification with automatic fixture cleanup:

```sh
node scripts/e2e/run-encrypted-backup.mjs
```

After a successful restore drill and authorized off-site copying, explicit retention is:

```sh
node scripts/backup/database-backup.mjs prune --key-file "$backup_key_file" --out-dir "$backup_out_dir" --keep 7
```

Key rotation requires separate directories or retaining the old key for its older exports. Do not delete the only working key or the last verified recovery copy. The tool never creates a scheduler; an identified destination, credentials, operational owner and real successful scheduled run are prerequisites for claiming automation.

## Recorded evidence

The public CLI key-generation test first failed because the command was absent, then passed for private random key creation, no printed key and refusal to overwrite. The actual PostgreSQL round trip initially failed because `export` was absent, then found the PostgreSQL 18→15 restore incompatibility; matched tools and explicit version fences resolved it.

The integration runner creates two separately named databases in the owned disposable local cluster. The source has a minimal Auth/Storage fixture and the **actual T1/T2/T3 migrations**, populated with two owners, one completed Focus session, an app-limit baseline, a confirmed continuation and its applied event. The shared `postgres` database and its application rows are not reset or overwritten.

Passed:

- Export contains encrypted Auth/application/private schema inventory; ciphertext contains neither the known private label nor owner email, and no plaintext/partial file remains after success.
- Restored completed Focus session and app-limit current/best, applied continuation lineage, two Auth owners, Storage metadata, policies and grants.
- The second owner's authenticated public history read remains empty after restoration.
- Excluded Vault/runtime schema data remains absent. This is not a restoration of full Supabase Auth/provider or Storage services.
- Wrong key, modified ciphertext and remote restore target fail; diagnostics do not reveal the supplied secret marker.
- Pruning a directory containing corruption deletes nothing. Pruning two authenticated exports for one source/key with `--keep 1` retains exactly one.
- Cleanup leaves zero owned source/restore databases and removes temporary fixture keys/exports. No hosted credentials or real user records were exported.

A recurring backup, off-site copy, production export, full-provider disaster recovery and the complete T8 client matrix remain unverified until their separate prerequisites and acceptance evidence exist.

Final backend regression checks passed 498 Vitest files / 6,202 tests (21 existing environment-gated skips), including all six public CLI security tests. TypeScript, scoped ESLint and diff checks passed. The successful fixture drill used PostgreSQL 15.8 with 15.19 clients; it is evidence for these application tables and compatible local prerequisites, not a claim that an arbitrary hosted Supabase project can be recreated unchanged.

Independent Standards and Spec reviews reproduced a pooler-source collision; the fixed source fingerprint includes the routing username and retention refuses legacy identities. Standards review also found a checkout-root output guard and hidden cleanup-failure gap; public CLI red/green tests now cover both. Envelope sizing accounts for the full authenticated header, encrypted manifest and tag before publishing an archive.

Review closure: the independent Standards reviewer reported all three operational findings resolved and no residual blocker; the independent Spec reviewer confirmed the mixed-project retention fix and no residual scope blocker. Reviews used separate agents, sequentially because only one agent slot was available. The broader production/off-site/scheduled/native/Web gates above remain separate.
