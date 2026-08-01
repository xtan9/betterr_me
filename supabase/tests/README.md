# SQL acceptance fixtures

`pnpm test:db` is the standard database-test command. It validates
`registry.json`, selects acceptance fixtures in registry order, and executes
them against the disposable local Supabase PostgreSQL database.
The command refuses any database URL outside the local Supabase endpoint on
port 54322.

Use `pnpm test:db -- --domain calendar` or
`pnpm test:db -- --fixture reminder_update` for targeted verification. Use
`pnpm test:db -- --list` to inspect the selected plan without connecting to a
database.

Use `pnpm test:db:calendar` for the bounded calendar lifecycle verification.
It runs the registry and constrained-fixture policy tests, then executes only
the registered `calendar` acceptance fixtures against disposable PostgreSQL.

The personal-record and finance authorization matrix can be run alone with
`pnpm test:db -- --domain personal-records-finance`.

After a local `supabase db reset --local`, apply the disposable authenticated
test grants before running the acceptance fixtures:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 -f supabase/tests/e2e_local_authenticated_grants.sql
```

The pull-request E2E workflow applies this support file before invoking the
fixture runner.

Every top-level `.sql` file in this directory must have one registry entry.
Acceptance entries declare their domain, cleanup contract, and whether they run
as the dedicated constrained role or require the disposable database
administrator. Administrative fixtures require a least-privilege explanation.
Non-acceptance setup files use `kind: "support"` with a reason and are never
silently treated as passing database tests.

New fixtures may register only for the `constrained` role. The runner
code hard-codes the reviewed legacy fixtures allowed to use `admin` or
`support`, so editing registry data cannot elevate a ticket-authored fixture or
exclude it from execution.

The runner clears the fixture process environment, records output and database
snapshots under `${RUNNER_TEMP}/sql-fixtures` in CI (or `.artifacts/sql-fixtures`
locally), and compares row counts and schema fingerprints after every fixture.
On fixture or cleanup failure it leaves the disposable database running and
prints the diagnostics directory.
