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
- Full backend TypeScript check (`tsc --noEmit`) and ESLint for the changed
  TypeScript files.
- Delivery write inventory and `git diff --check`.
- Local Supabase security advisors: no Focus history findings; five unrelated
  existing warnings remain in the baseline database.

HTTP tests exercise both authenticated adapters with the database RPC mocked;
SQL fixtures exercise the actual persistence and authorization boundary. These
checks do not establish physical-device recovery or full signed-in HTTP UAT.
Mobile recovery, UI and real bearer-session acceptance belong to the mobile
integration delivery gate.

The pinned Supabase CLI generated migration
`20261024190712_focus_history.sql`. During development its schema was applied and
refined in place on the disposable database, without updating the Supabase
migration ledger. Do not blindly reapply the complete migration to that existing
development stack. A clean migration application remains an integration check;
hosted rollout must apply the additive migration before dependent clients.

The fixture runners also now support macOS system Bash and capture absolute
PostgreSQL executable paths before clearing their environments. The disposable
URL guards, sanitized child environment, constrained role and SQL policy checks
remain in force.
