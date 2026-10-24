# Focus history verification

Scope: backend portion of mobile issue [#399](https://github.com/xtan9/betterr_me_mobile/issues/399),
using [contract v1](focus-history-contract.md). Verified locally on 2026-10-24.
No hosted migration or deployment was performed.

The SQL acceptance fixture ran against the disposable Supabase database at
`127.0.0.1:54322`, through the registry's constrained role. Before the migration,
it failed because the history command did not exist. After implementation,
`/bin/bash scripts/ci/run-sql-fixtures.sh --domain focus-history` passed with both
fixture and cleanup status zero. The fixture covers immutable replay, sequence
conflicts and gaps, atomic batches, baseline import, receipt paging, owner
isolation, strict payload rejection and denied direct mutations/anonymous calls.
Receipt positions are transactional and scoped to an owner, so rolled-back
fixtures leave no sequence residue. Concurrent connections were not exercised.

The following checks passed:

- 54 Vitest checks across `tests/app/api/focus-history/route.test.ts`,
  `tests/scripts/sql-fixture-registry.test.ts` and
  `tests/scripts/constrained-sql-policy.test.ts`.
- Final full Vitest suite: 495 files and 6,151 tests passed; six optional live or
  integration files (21 tests) remained skipped by their existing environment gates.
- Full backend TypeScript check (`tsc --noEmit`) and ESLint for the changed
  TypeScript files.
- Delivery write inventory and `git diff --check`.
- Local Supabase security advisors: no Focus history findings; five unrelated
  existing warnings remain in the baseline database.

The scoped HTTP tests exercise both adapters with the database RPC mocked;
SQL fixtures exercise the actual persistence and authorization boundary.
The separate signed-in HTTP exercise below now covers actual Auth, Next and
Postgres. Physical-device recovery and mobile UI remain mobile integration gates.

The pinned Supabase CLI generated migration
`20261024190712_focus_history.sql`. After initial schema iteration, a clean
`supabase db reset --local --no-seed --yes` successfully applied all migrations,
including Focus history. Both `supabase migration list --local` and the database
migration ledger confirmed `20261024190712`. The constrained SQL fixture passed
again against this clean schema with zero cleanup residue. Hosted rollout must
apply the additive migration before dependent clients.

The fixture runners also now support macOS system Bash and capture absolute
PostgreSQL executable paths before clearing their environments. The disposable
URL guards, sanitized child environment, constrained role and SQL policy checks
remain in force.

## Signed-in HTTP acceptance

Run `node scripts/e2e/run-focus-history.mjs` from the backend checkout, with the
pinned Supabase CLI on PATH or supplied as `SUPABASE_CLI`, and `psql` on PATH or
its absolute path supplied as `PSQL_BIN`. The local stack must already be running
with current migrations. The runner never resets the stack or accepts a remote
target: it obtains only local CLI status and requires API `127.0.0.1:54321` and
PostgreSQL `127.0.0.1:54322/postgres` before creating data.

The exercise starts its own loopback Next server on an available port, never
8082, and creates two random ephemeral Auth users. Credentials stay in memory;
Next receives only the local public key. It verifies:

- A committed upload whose receipt is discarded can be replayed without a second
  completion; changed payload reuse returns 409.
- An out-of-order upload retains its source sequence and advances acknowledgement
  only after the gap arrives; a new signed-in client retrieves three unique
  records through one-item pages, preserving historical link snapshots.
- The actual web cookie and native bearer adapters return the same owner history.
- Another account cannot read or mutate the first account's records, including
  direct REST RLS queries and a forged owner; shared event/source UUIDs stay isolated.
- Selection tokens, active grants, permission flags and monitor registrations are
  rejected; returned completed sessions contain no live native state.
- Finally, global sign-out and Auth deletion remove the ephemeral accounts. A
  read-only query of the guarded local database verifies zero remaining test
  users, sessions, profiles, source rows and event rows. No new table grants are
  added for the cleanup check. Only the runner's Next child is stopped.

This uncovered an integration bug: the cookie proxy redirected the new native
history route to the browser login page before bearer authentication. Exact
Focus route exemptions now delegate to each route's own authentication. Four
new proxy cases failed before the fix; all 24 proxy cases pass after it, including
continued protection of lookalike paths. The full test run also identified the
new native route's missing documented-auth exception and missing Focus path
ownership entries; both were registered using the existing repository patterns.

All six HTTP acceptance groups, including cleanup, pass. This is a backend
recovery exercise; it does not claim phone process-death or Screen Time UAT.
