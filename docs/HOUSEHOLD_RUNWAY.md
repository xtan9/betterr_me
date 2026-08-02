# Household Runway

## Product boundary

Household Runway is a public income-interruption stress test at
`/finance/cushion`. Visitors can complete the interview and see the full result
without signing in. Registration is offered only to save a plan, compare
snapshots, and update it later.

The feature deliberately does not connect bank accounts, recommend financial
products, judge benefit eligibility, or produce a financial-health score. It
is an educational planning estimate based on the visitor's inputs.

## Interview and local privacy

The deterministic interview presents one topic at a time and adapts income
questions and result scenarios to the household's employment state. Optional
detail can be skipped, and essential expenses can be entered as totals or by
category.

The provisional Draft is owned by the framework-independent
`household-runway-draft-codec`. Its versioned envelope includes the current
answers, interview stage/status, nested expense progress, Plan Adjustment, and
selected applicable Scenario. It deliberately excludes localized messages,
request/operation state, focus/modal state, analytics, and other presentation
state. The codec receives the clock explicitly, expires envelopes after 30
days, and returns recoverable rejection codes for malformed, unsupported,
expired, invalid-stage, invalid-scenario, and incomplete-completion data.

Anonymous Drafts remain in memory and `sessionStorage` by default. The adapter
does not write durable device storage without an explicit “Remember on this
device” action and a visible 30-day disclosure. Clearing, importing, or saving
a Plan removes the session Draft and the remembered device copy; the consent
marker is revoked by clear/discard. Invalid or expired stored envelopes are
removed without blocking the in-memory interview. No localized or presentation
state is serialized, and there are no hidden durable writes.

Registration does not upload the Draft automatically: the result page asks for
explicit consent, uses an idempotency key for the import, and deletes the local
Draft only after the server confirms the save.

## Calculation contract

The versioned pure calculation engine runs a monthly cash-flow simulation:

    closing liquid balance
      = opening liquid balance
      + income that continues in the selected scenario
      + confirmed funds arriving that month
      - interruption-plan expenses

The engine reports covered months (including a partial final month), the
estimated depletion date, and a month-by-month ledger. When continuing income
covers essential expenses, the result says that the plan is sustainable under
the current inputs instead of displaying `Infinity`.

Cash is included at 100%. Ordinary investments default to 70%. Retirement
accounts and home equity are excluded from the primary result. Retirement
funds enter the simulation only when the visitor explicitly enables the
extreme-mode preview, with tax, penalty, and liquidity warnings. Home equity
remains excluded.

Gross income can be converted with a country/region-specific, versioned
take-home estimator for the United States, Canada, mainland China, and Taiwan.
The result remains marked as estimated until the visitor reviews it or replaces
it with an actual take-home amount. The estimator is not tax advice.

## Result contract

Applicable scenarios are derived from the current household state. For
example, two employed adults can compare either income stopping and both
stopping, while a single already-unemployed adult sees the current real state.
The result includes:

- the primary runway and estimated depletion date;
- an accessible cash-balance curve and monthly table;
- current-lifestyle, interruption-plan, and extreme-mode comparisons;
- included and excluded inputs plus confidence-improving questions;
- temporary What-if changes with exact deltas and explicit Apply/Reset;
- one or two deterministic, highest-leverage actions;
- region-specific categories of next steps; and
- a downloadable text report containing inputs, assumptions, scenarios, and
  actions.

Planning bands (`<3`, `3–6`, and `6+` months) use neutral action language. They
are planning prompts, not a score or claim that a household is healthy.

## Persistence and security

The V2 migration extends the user-owned `finance_cushions` plan and adds:

- append-only `finance_cushion_snapshots` for completed and explicitly updated
  results;
- write-only `finance_cushion_events` containing only event metadata, locale,
  step identifiers, and allowlisted campaign attribution.

All user data tables use row-level security. Authenticated API requests derive
the user identity from Supabase Auth. The server validates normalized answers
and recalculates every saved result; client-computed result values are never
authoritative. Analytics validation rejects financial amount fields.

The V2 migration is additive. It does not restore the former Money/household
schema. A rollback should revert the application first and leave unused data
structures in place until a separately reviewed forward migration can remove
them safely.

## Verification

- Pure calculation and state branching: `tests/lib/finance/cushion.test.ts`
- Draft codec and storage boundary: `tests/lib/finance/household-runway-draft-codec.test.ts`,
  `tests/lib/finance/runway-draft-client.test.ts`
- API validation and server recomputation:
  `tests/app/api/finance/cushion/route.test.ts`
- Amount-free analytics boundary:
  `tests/app/api/finance/cushion/events-route.test.ts`
- RLS and grants: `supabase/tests/finance_cushion_rls.sql`
- Public desktop and 390 px mobile journeys: `e2e/financial-cushion.spec.ts`

The RLS fixture requires a running local Supabase stack and executes inside a
rollback-only transaction with two synthetic authenticated users.
