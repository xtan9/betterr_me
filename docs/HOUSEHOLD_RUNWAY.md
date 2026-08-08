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
estimated depletion date when that date is representable, and a monthly cash
flow series. The series contains every month through shorter horizons; beyond
240 months it contains every month through month 12 followed by bounded,
explicitly identified checkpoints through the final modeled month. When
continuing income covers essential expenses, the result says that the plan is
sustainable under the current inputs instead of displaying `Infinity`.

Cash and liquid investments are included at their entered amounts. Illiquid
investments, retirement accounts, and home equity are excluded from the primary
result. Illiquid investments and retirement funds enter the simulation only
when the visitor explicitly enables them in a What-if preview, with tax,
penalty, and liquidity warnings. Home equity remains excluded.

Gross income can be converted with a country/region-specific, versioned
take-home estimator for the United States, Canada, mainland China, and Taiwan.
The result remains marked as estimated until the visitor reviews it or replaces
it with an actual take-home amount. The estimator is not tax advice.

## Result contract

Applicable scenarios are derived from the current household state. For
example, two employed adults can compare either income stopping and both
stopping, while a single already-unemployed adult sees the current real state.
The result includes:

- the primary runway and an estimated depletion date when representable;
- an accessible cash-balance curve and monthly/checkpoint table;
- current-lifestyle, interruption-plan, and extreme-mode comparisons;
- included and excluded inputs plus confidence-improving questions;
- temporary What-if changes with exact numeric or qualitative comparisons and
  explicit Apply/Reset;
- up to two deterministic, highest-leverage actions;
- region-specific categories of next steps; and
- a downloadable text report containing inputs, assumptions, scenarios, and
  actions.

Planning bands (`<3`, `3–<6`, and `6+` months) describe the live What-if
preview and use neutral action language. Sustainability remains distinct from
the numeric bands. They are planning prompts, not a score or claim that a
household is healthy.

A Household Runway Assessment Snapshot records the baseline result for the
first applicable income-interruption scenario, not the currently selected
Scenario or a provisional What-if preview. Historical snapshots receive a
numeric change only when their Scenario and calculation-model version match.
A transition to or from sustainability is described qualitatively instead of
being converted to a numeric month delta.

The supported Household Runway Runtime emits review and result as first-class
semantic screen variants. The React result UI consumes that snapshot directly
for localized labels, formatting, accessible table markup, and host actions;
raw Plan inputs, Assessments, derived facts, and persistence summaries are not
part of the supported snapshot.

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
- Runtime/result cutover contracts:
  `tests/lib/finance/household-runway-result-runtime-contract.test.ts`,
  `tests/lib/finance/household-runway-focused-projection.test.ts`,
  `tests/lib/finance/household-runway-import-boundary.test.ts`,
  `tests/components/finance-household-runway-result.test.tsx`
- Public desktop and 390 px mobile journeys: `e2e/financial-cushion.spec.ts`

The public visual evidence is captured by that Playwright flow in
`docs/screenshots/household-runway-result-desktop.png` and
`docs/screenshots/household-runway-result-mobile-390.png`; the mobile project
uses a fixed 390 px viewport.

The RLS fixture requires a running local Supabase stack and executes inside a
rollback-only transaction with two synthetic authenticated users.
