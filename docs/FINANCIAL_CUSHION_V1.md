# Financial Safety Cushion V1

## Scope

Financial Safety Cushion V1 is a user-scoped Finance feature. It stores only
the signed-in user's entered planning inputs and exposes them through
/finance/cushion.

The slice does not include households, sharing, connected accounts, Plaid,
transactions, bills, budgets, investment recommendations, or a financial
health score.

## Calculation contract

Inputs are stored as integer cents in the user's entered currency:

- immediately available liquid resources;
- essential monthly expenses for an interruption scenario;
- monthly income the user explicitly expects to continue.

The calculation is:

    monthly_shortfall = max(essential_monthly_expenses - continuing_income, 0)
    months_covered = liquid_resources / monthly_shortfall

When the shortfall is zero, the UI displays 6+ months rather than an
unbounded number. Planning states use exact cent comparisons:

- less than 3 months: urgent;
- 3 to less than 6 months: building;
- 6 or more months: stronger.

The state is a communication threshold for planning, not a recommendation or
personal-finance judgment. The UI repeats that it is not financial advice.

## Preview database boundary

The Vercel Preview deployment is currently connected to the production
Supabase project. The feature migration is intentionally applied by the
main-only database-migration workflow, so the production-backed Preview cannot
serve authenticated Cushion requests before the pull request is merged.

Pull-request E2E therefore uses a separate verification path. The workflow
checks out the exact pull-request head SHA, resolves and records the successful
Vercel Preview deployment for that SHA, then runs authenticated browser traffic
against a disposable local Supabase database. It resets the feature migrations,
executes `supabase/tests/finance_cushion_rls.sql`, builds the application from
that exact checkout, and runs the full Chromium suite. It does not use
production Supabase credentials or `E2E_PREVIEW_URL` for authenticated PR
browser traffic. Main and scheduled runs retain the configured production
Preview path.

## Data boundary

Migration
supabase/migrations/20260726173634_finance_cushion_v1.sql creates one
finance_cushions row per authenticated user. The migration:

- references auth.users directly;
- enables RLS;
- grants only SELECT, INSERT, and UPDATE to authenticated;
- grants no table access to anon;
- uses user_id = auth.uid() for select, insert, and both update checks.

The API derives user_id from supabase.auth.getUser() and ignores any
body-supplied identity field.

## Verification

Deterministic calculation coverage is in
tests/lib/finance/cushion.test.ts. The database isolation fixture is
supabase/tests/finance_cushion_rls.sql; it runs two authenticated synthetic
users in one rollback-only transaction and checks same-user read/update,
cross-user read/update denial, cross-user insert denial, RLS, policies, and
table grants.

The authenticated browser proof is
e2e/financial-cushion.spec.ts. It covers create, save, reload, and persisted
result recovery against the real app.

## Rollout and rollback

1. Run the full CI suite, build, deterministic calculation tests, the
   rollback-only RLS fixture, and the isolated pull-request Chromium suite.
2. Merge only after independent engineering review and QA approval, then apply
   the additive migration through the existing main-only database-migration
   workflow.
3. Run the authenticated browser flow against the deployed app after the
   migration succeeds and retain the exact commit, deployment, and workflow
   run IDs.
4. Verify the production table, policies, and API responses without reading
   another user's data.

The migration is additive and has no destructive down migration. If the app
must be rolled back, revert the application commit and leave the unused table
in place; remove it only through a separately reviewed forward migration after
confirming no remaining callers. Deployment remains gated on independent
engineering review and post-deploy verification.

## Sources

- RESEARCH/FINANCIAL_SAFETY_CUSHION_ALGORITHM_RESEARCH_2026_07_25.md
- Supabase RLS guidance:
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Data API grants guidance:
  https://supabase.com/docs/guides/api/securing-your-api
