# Train custom exercise definitions

Backend companion to [mobile #418](https://github.com/xtan9/betterr_me_mobile/issues/418).
The first release contains expansion A and compatible server/Web adapters B,
with `customExercises.ready` false. The separate contraction C follows verified
deployment of that exact B alias and its authenticated cookie workflow. A merged
backend PR alone does not deliver native custom exercises.

## Identity, meaning and maintenance

A custom definition is an account-owned UUID. Creation uses the durable command
ID as its definition ID. Rename, archive and restore retain that identity;
equipment or recording meaning requires a separate variation. Existing workouts,
templates, media and previous references are never retargeted or rematched.

All nine existing equipment categories remain available. The five native modes
have explicit conventions: total barbell load, per-dumbbell load, selected load,
bodyweight repetitions, added load, positive assistance, or seconds. Equipment
does not silently select a different mode. The three continuing Web modes remain
readable/maintainable with an unknown convention. Legacy NULL conventions,
secondary metadata, unusual names and NULL timestamps are preserved. Only
explicitly changed metadata is validated and written.

Archived definitions leave new-selection lists but remain in owner library
reads and valid captured references. A pending create is not selectable until
its matching first receipt has been validated and durably acknowledged.

## One command boundary

`POST /api/mobile/train/exercises/commands` verifies the current user bearer
token. Cookie routes use the same SQL command and a captured-owner precondition.
No client-supplied owner becomes authority. New functions have explicit grants;
private rollout state and command writes are unavailable to arbitrary clients.

Protocol 1 commands are `create`, `update-metadata`, `archive`, and `restore`.
Maintenance supplies a canonical positive bigint decimal-string `expectedVersion`.
One private trigger owns version 1 and each subsequent increment, including
accepted no-ops and the interim legacy writers. Values are cast to text in SQL
before reaching JavaScript. The fixture is
`tests/fixtures/train-custom-exercise-contract.json`.

An owner/operation lock serializes retries. The exact request gets its first
accepted receipt or definitive rejection; changed bytes under that identity get
`operation_conflict`. Current-row changes never rewrite either outcome. Conflict
responses contain current state only in `rejection.current`. Missing references
and invalid definitions have durable rejection outcomes; authentication, network,
gate, malformed-envelope and availability failures do not fabricate rejection.

The Web journal stores the frozen request before sending. A lost response keeps
the same operation pending across remounts. Definitive rejection requires an
explicit review/keep-current decision or a new command against the reviewed
version. Older acknowledgments cannot remove newer pending work. Failed session
recovery or unreadable journal data shows unavailable state without deleting the
saved intention.

## Captured completion v3

Completion protocol 1 and first create receipts stay unchanged. v1 remains in
`native_completion`; v2 and v3 occupy `recorded_completion`, exclusively. v3 adds
a custom definition branch with owner/definition UUID, one captured name, all
nine equipment categories, supported mode, and known or legacy-NULL convention.
Preset definitions and all existing v1/v2 bytes remain unchanged.

SQL resolves the actual owned reference and immutable meaning, while retaining
the captured name regardless of later rename, archive or version. Normalized
children retain that exact UUID and unchanged five-mode numeric projection. Web
and Assistant readers select the captured authority once. A new custom snapshot
with unknown convention stays readable, but does not supply invented volume,
personal-record or previous-set comparison authority. Existing legacy records
are not reclassified.

The frozen #415 remote reader can still inspect normalized v3 facts through its
legacy path; it cannot promise captured names or conventions. #416 treats v3 as
an unsupported record without poisoning its mixed history page. These are
remote-reader compatibility boundaries, not support for opening a new local
SQLite format with an old binary.

## Staged release and account erasure

1. **A:** additive schema/functions and version authority, ordinary legacy CRUD
   still usable for unknown-convention rows. Creation commands/native library
   reads and v3 writes remain gated. The old POST remains non-idempotent.
2. **B:** deploy these shared cookie/native adapters and readers. Verify the exact
   production alias, capability response, cookie maintenance and existing
   workout/routine/Assistant behavior before proceeding.
3. **C:** a separate reviewed migration atomically enables the private gate and
   revokes ordinary exercise INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
   Trusted service-role preset maintenance remains for existing admin media sync;
   custom identity/meaning stays protected by the database trigger. No caller
   header or mutable session flag bypasses the gate.

Independent command/completion outcomes survive ordinary record deletion.
Profile erasure removes them with the account. The two exercise-reference foreign
keys use `NO ACTION DEFERRABLE INITIALLY DEFERRED`: a standalone referenced delete
still fails at transaction validation, while nested account cascades can remove
owned workout/template references before the final check. This fixes the old
`RESTRICT` cascade-order failure without cascading deletion from a definition to
history. Ordinary custom physical DELETE is unavailable after C.

## Verification

- Principal Library/Form/hook tests use real translations and control only auth,
  HTTP and browser storage. They exercise exact retry, cold conflict review,
  archive/restore, immutable meaning and untouched legacy metadata.
- The authoritative rollback fixture rehearses C locally: all 45 equipment/mode
  combinations, three deferred modes, captured references after maintenance,
  direct-write denial, first outcomes, no resurrection and account erasure.
- The isolated migration rehearsal preserves eight legacy modes, 10,032 sets,
  media/mappings, NULL/deferred data, and accepted v1/v2 documents and receipts
  through historical fitness DDL → 415 → 416 → 418 A. Readiness stays false.
- `scripts/e2e/run-train-custom-exercises.mjs` uses only local disposable Auth,
  PostgREST, cookie HTTP, scoped MCP and Chromium. It restores the original gate
  and grants, removes generated accounts/rows/credentials, and checks source
  hashes. `--hold` exposes a short-lived credential file for coordinated mobile
  SQLite/network crash proofs; credentials are never printed.

The authenticated HTTP/Chromium run at `bf2a75db` passed the A/B/C, stable-outcome,
ownership, archive/capture, Web/Assistant/routine, and browser maintenance cases.
The coordinated real-mobile run passed seven case groups against that pinned
server: durable command crashes and discovery fences, two-installation conflict
review, archived v3 upload, unchanged #415/#416 writers/readers, fresh-install
ownership, legacy unknown-convention capture, and deferred-mode exclusion.
Generated users, rows, sessions and credentials were removed; the original
inactive gate and exact grants were restored. Subsequent scoped checks cover the
required-Request TypeScript signature, source inventories, unreadable Web journal
states, and SQL parity with JS name trimming/UTF-16 limits. They do not rewrite
the recorded HTTP source provenance.

The final A compatibility recheck ran the unchanged released `ca647a4a` server:
cookie create/read/edit/delete still passed, including distinct IDs from repeated
legacy POSTs. The final custom SQL fixtures passed with no database residue.
TypeScript and tracked-source lint passed (four pre-existing lint warnings).
The full unit run passed 6,324 tests and found two source-inventory expectations;
both were corrected and their 49 affected tests passed. The later journal change
passed its 10 journal/principal workflow tests. Hosted final gates remain required.

Production contraction and native acceptance remain delivery gates; the passed
coordinated mobile disk/old-reader proof and unit/build checks do not replace them.

## Verified B release and C activation

PR #1084 merged as `9e10e05c7e0c73fc743e14a7337eb57702d01395` after the full hosted
CI and Chromium gates passed. Production migration `20261025214904` completed,
and `www.betterr.me` resolved to READY deployment
`dpl_DaXP2eHXApEnpoxR5c63E8z2weYa` at that exact commit. Readiness remained false.

A generated disposable account then authenticated through Supabase and real
production cookie requests. Library reads retained version strings and NULL
legacy meaning. Rename, accepted retry, stale CAS, archive, restore and retained
first rejection passed. Both cookie and bearer creation returned `not_ready`
without an outcome; existing workout/routine reads succeeded. Account deletion
and a scoped SQL audit found zero remaining users, sessions, profiles, definitions
or command outcomes. Private runtime configuration was removed. Two earlier
probe setup attempts exceeded Auth's password-length limit and created no user;
they are retained as setup failures, not product regressions.

Migration `20261025234112_train_custom_exercises_enable.sql` performs C atomically:
it enables the private gate, revokes ordinary exercise write privileges and removes
service-role TRUNCATE/TRIGGER while preserving trusted preset maintenance. It
adds no new application writer. B must remain deployed when the gate is enabled.

The isolated historical replay now applies that exact C migration and verifies
all ten record/outcome tables remain unchanged, readiness becomes true and grants
match the contraction. Twelve affected SQL fixture groups pass after C, including
the original A compatibility assertions reconstructed inside an admin rollback,
current authenticated command ownership, account cascade and continuing workout
operations. Test bootstrap preserves the production exercise write restrictions;
legacy fixture setup no longer silently restores ordinary DML. The shared local
database's exact original flags and grants, including the parallel template gate,
were restored after the bounded proof window.

The local A→C HTTP runner above intentionally requires an isolated A database;
its recorded proof remains pinned to its original source. Native simulator
acceptance and the final deployed C capability/command proof are tracked with
the companion mobile delivery.
