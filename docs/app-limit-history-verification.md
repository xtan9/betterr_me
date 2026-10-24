# App-limit history backend verification

Backend companion to mobile [#400](https://github.com/xtan9/betterr_me_mobile/issues/400),
verified locally on 2026-10-24 against the [agreed contract](app-limit-history-contract.md).
This records backend acceptance only; native atomic writes, extension execution,
account lifecycle, process death and history UI remain mobile delivery checks.

The new constrained SQL fixture first failed because `app_limit_history_ingest`
did not exist. The pinned Supabase CLI generated
`20261024194415_app_limit_history.sql`, which was applied once to the disposable
database at `127.0.0.1:54322` using `psql`. It contains only additive app-limit
tables/functions/policies/indexes and reuses existing strict scalar helpers.
After integration, the task-owned local stack was reset with the pinned CLI's
`db reset --local --no-seed`. All migrations replayed successfully and the ledger
contains both `20261024190712` and `20261024194415`. The canonical Focus and
app-limit SQL fixtures passed again with no database residue, followed by all
seven real HTTP acceptance groups and zero ephemeral-account residue. No hosted
migration or production data change has been performed. Local replay logs are
`/tmp/betterr-data-reliability-local-reset.log` and
`/tmp/betterr-data-reliability-sql.log`.

`bash scripts/ci/run-sql-fixtures.sh --domain app-limit-history` passes through the
registered constrained role with fixture and cleanup status zero. It verifies:

- Honest baseline snapshots, exact replay, event/sequence conflict rejection and
  all-or-nothing conflicting batches.
- Strict schema version, owner/native-field, civil-date and streak-bound checks.
- Out-of-order changes remain inspectable with the older contiguous checkpoint;
  filling the gap advances it, and delayed replay never decreases it.
- The latest reset remains visible with source sequence and checkpoint provenance.
  130 changes to one rule remain retrievable across bounded pages, independently
  from the recent-history UI cap.
- Source metadata is immutable; account isolation and anonymous/direct write
  denials hold. App-limit events never appear in session-only Focus v1 reads.

`node scripts/e2e/run-focus-history.mjs --app-limits` runs both the established
Focus session journey and the new native app-limit journey through actual local
Auth, a dedicated loopback Next server and Postgres. It covers lost-receipt
replay, gap acknowledgement, a confirmed reset, new-client paging, real web
cookies, owner isolation, forged-owner/native-field rejection and unchanged
session v1. The first run exposed the expected missing exact proxy route
registration (HTTP 307); after registering the new self-authenticating API routes,
all seven acceptance groups pass. The runner globally signs out and deletes only
its ephemeral users, checks that their Auth sessions/profiles/history rows are
gone through guarded read-only SQL, and stops only its own Next child. See the
[runner prerequisites and isolation rules](focus-history-verification.md#signed-in-http-acceptance).

The API contract tests pass for both adapters, baseline provenance, invalid or
nonportable snapshots, unavailable/conflict/authentication responses and paged
checkpoints. Existing Focus route tests remain green after sharing the bounded
JSON reader and cursor parser. TypeScript, scoped ESLint and diff checks pass.
Local Supabase security advisors report no app-limit findings; five unrelated
baseline warnings remain. The full Vitest suite passed 496 files and 6,170 tests;
six existing optional live/integration files (21 tests) remained skipped by their
environment gates. The delivery write-inventory check also passed.

The server stores device-reported observations. It does not independently attest
Screen Time state or calculate earned days from these snapshots. T3 must perform
an online latest-contiguous source/destination version check and create a durable
continuation receipt; this T2 contract does not authorize or apply continuation.
