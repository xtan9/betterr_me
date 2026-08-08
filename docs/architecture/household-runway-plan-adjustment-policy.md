# Household Runway Plan Adjustment policy module

Status: proposed; design only

This document resolves Candidate 1 from the 2026-08-08 architecture review.
It proposes concentrating Household Runway Plan Adjustment policy in one
private finance module while preserving the supported Household Runway
Runtime, Assessment, calculation, persistence, and presentation contracts.

The change is an architecture-only refactor. It does not authorize product,
formula, persistence, screen-flow, wire-format, or copy changes.

## Decision

Introduce a private `household-runway-plan-adjustment` module behind the
Household Runway Runtime. The module is the single private policy source for:

- the seven Plan Adjustment fields and their zero value;
- active-state detection;
- global and Household Runway Plan-relative limits;
- tolerant Runtime intent normalization;
- relational validation facts for the Assessment boundary;
- the pure transformation that applies a Plan Adjustment to Draft inputs; and
- Plan Adjustment field and effect projection.

The Runtime remains the documented semantic owner. The module implements
policy on the Runtime's behalf; it is not a new supported boundary.

The following remain outside the module:

- Runtime lifecycle, queueing, intent applicability, and snapshot publication;
- Interview transitions, Draft revisions, dirty-operation state, events, and
  command metadata;
- Assessment orchestration and Scenario calculation;
- simulation formulas and defensive arithmetic;
- Zod and authenticated commit schemas;
- persistence, browser, React, localization, and presentation behavior.

## Why this candidate is worth doing

The seven-field rule set is currently distributed across the Runtime,
Interview, Assessment, simulation, and validation modules. The same limits are
rebuilt for Runtime normalization, Assessment validation, and result
projection. Zero construction, active-state checks, application semantics, and
projection behavior live separately in the Interview.

That distribution makes a bounded domain concept expensive to inspect and
easy to change incompletely. A private policy module gives the concept a small
interface without changing the supported five-method Runtime seam.

The architecture review's historical claim needs one correction: the recent
clamp fix changed the Runtime and one focused test, not all five modules. The
locality problem is verified by the current implementation, but "one rule
change touches five modules" is a risk demonstrated by duplication rather than
the literal history of that fix.

## Existing authority and compatibility constraints

[ADR-0011](../adr/0011-expose-household-runway-interview-through-runtime.md)
keeps the framework-neutral Runtime as the supported Household Runway Interview
boundary. Its public contract remains exactly:

- `getSnapshot()`;
- `subscribe(listener)`;
- idempotent `start()`;
- `send(intent): void`; and
- idempotent `dispose()`.

[ADR-0012](../adr/0012-keep-household-runway-runtime-capability-composition-private.md)
keeps capability composition, complete Draft and Plan requests, queueing,
retries, stale-result checks, restoration precedence, and durable identity
policy private. The proposed module must not absorb any of them.

The implemented
[result-projection contract](./household-runway-result-projection-contract.md)
assigns Scenario selection, Assessment interpretation, Plan Adjustment bounds
and effects, action applicability, and typed issues to the Runtime. Moving
implementation into a private module does not move that authority.

[ADR-0010](../adr/0010-keep-household-runway-persistence-shape-private.md)
keeps the legacy `/api/finance/cushion` path, persistence row shape, and
meaningful `revision` and `answers` wire keys adapter-private. This design does
not change them.

There is no new ADR for this proposal. The extraction is private, reversible,
unsurprising once named, and does not select a new technology or supported
boundary.

## Canonical language

Following the repository [domain glossary](../../CONTEXT.md), use **Household
Runway Plan Adjustment** for the provisional What-if overlay. It becomes part
of a Household Runway Plan only after the person applies it to Household Runway
Draft inputs and later commits those inputs.

Do not call it a saved adjustment, Plan change, Finance Cushion Adjustment, or
generic Adjustment when the shorter term would be ambiguous. Existing code and
wire identifiers such as `RunwayAdjustments`, `finance_cushion`, and
`adjustments` remain compatibility details; this refactor does not rename
supported contracts.

## Preserved boundary behaviors

Concentrating policy does not mean making every boundary behave identically.
Each boundary has a different trust model, and those differences are part of
the current contract.

| Boundary | Input policy to preserve | Result |
| --- | --- | --- |
| Runtime user intent | Tolerantly coerce, round, floor at zero, ignore unknown fields, and clamp to current authoritative limits | A safe partial patch enters the Interview |
| Restored/internal Draft state | Complete missing fields with zero and normalize values to finite, rounded, non-negative cents without applying relative maxima | Existing recovery and internal-test behavior remains unchanged |
| Household Runway Assessment | Apply scalar schema validation, then reject values above current relative limits | Typed validation issues; no silent clamp |
| Simulation | Fill omitted fields with zero and preserve existing defensive expense/asset clamps | Calculation safety remains local to the calculator |
| Commit schema | Require the strict complete seven-field shape and the existing global cents cap | Wire and persistence behavior remains unchanged |

The module shares field knowledge, limit derivation, and relational violation
facts. It exposes distinct operations for tolerant normalization and strict
validation; it must not hide both behind one lossy `normalizeOrValidate`
operation.

## Authoritative fields and limits

The complete Plan Adjustment retains these fields:

1. `expense_reduction_cents`;
2. `added_cash_cents`;
3. `added_monthly_income_cents`;
4. `expected_unconfirmed_funds_cents`;
5. `usable_illiquid_investments_cents`;
6. `usable_retirement_tax_deferred_cents`; and
7. `usable_retirement_tax_free_cents`.

Every normalized value is an integer number of cents greater than or equal to
zero. The current maxima are:

| Field | Maximum |
| --- | --- |
| Expense reduction | Current interruption expenses |
| Added cash | `MAX_CUSHION_AMOUNT_CENTS` |
| Added monthly income | `MAX_CUSHION_AMOUNT_CENTS` |
| Expected unconfirmed funds | `MAX_CUSHION_AMOUNT_CENTS` |
| Usable illiquid investments | Entered illiquid-investment balance |
| Usable tax-deferred retirement funds | Entered tax-deferred retirement balance |
| Usable tax-free retirement funds | Entered tax-free retirement balance |

`MAX_CUSHION_AMOUNT_CENTS` remains `100_000_000_000` cents. Renaming that
legacy constant or changing whether the cap is per field is separate work.

Limit derivation always uses the current Household Runway Plan inputs supplied
to the operation. The module does not cache maxima. When Plan inputs are absent,
the four relative maxima are zero and the three global maxima remain available,
matching the current Runtime behavior.

Updating one field clamps only that field's incoming value. Existing unpatched
values are not opportunistically reclamped. Restored or internally constructed
Plan Adjustments are not automatically cleared or reclamped when their
underlying inputs change; the Assessment boundary continues to reject any
resulting relational violation. Changing that recovery policy would be a
behavior change.

## Proposed private interface

The implementation should live at a private path such as
`lib/finance/internal/household-runway-plan-adjustment.ts`. Exact function names
may vary, but the interface should express these operations rather than expose
its field tables:

```ts
type HouseholdRunwayPlanAdjustmentPolicy = {
  empty(): RunwayAdjustments;
  isActive(adjustment: RunwayAdjustments): boolean;
  normalizeStored(input: Partial<RunwayAdjustments> | null | undefined): RunwayAdjustments;
  normalizeIntentPatch(input: {
    patch: unknown;
    planInputs: HouseholdRunwayAnswers | null;
  }): Partial<RunwayAdjustments>;
  validate(input: {
    adjustment: RunwayAdjustments;
    planInputs: HouseholdRunwayAnswers;
  }): readonly HouseholdRunwayPlanAdjustmentViolation[];
  apply(input: HouseholdRunwayPlanAdjustmentApplication): HouseholdRunwayAnswers;
  project(input: HouseholdRunwayPlanAdjustmentProjectionInput): HouseholdRunwayAdjustmentProjection;
};
```

This is a conceptual interface, not a requirement to allocate a policy object.
Named pure functions are acceptable. Runtime, Interview, Assessment, and
projection consumers should not rebuild the field list or relative-limit
table. The supported type and explicit serialized schema remain boundary
representations rather than competing policy implementations.

The module may import calculation types and pure helpers from `cushion.ts`.
`cushion.ts` must not import the private module in return. That dependency
direction prevents a cycle and keeps the supported calculator independent of
the Interview implementation.

The public `RunwayAdjustments` type remains available from its current module.
The extraction may use the canonical Household Runway Plan Adjustment name
privately, but it must not add a second supported type alias or compatibility
facade.

## Runtime normalization

Runtime intent normalization retains all current edge behavior:

- accept only the seven known fields from an object-like patch;
- ignore unknown keys;
- treat a non-object patch as empty;
- coerce with `Number` under `try/catch`, including hostile values such as a
  `Symbol`;
- map non-finite values to zero;
- round fractional cents with the current `Math.round` behavior;
- floor negative values at zero; and
- cap each present value at the current field maximum.

The operation returns a partial patch. It does not merge with current Draft
state, increment a Draft revision, publish an event, or recalculate an
Assessment. The Runtime and Interview retain those responsibilities.

## Strict Assessment validation

The validation schema continues to own input shape, strictness, scalar cents
constraints, defaults, and the global cap. After schema parsing, the Assessment
asks the policy module for relational violations.

The policy module returns stable field-oriented facts for:

- expense reduction above interruption expenses; and
- each usable asset amount above its entered balance.

The Assessment maps those facts to its public validation paths and messages.
It rejects the input rather than clamping it. This preserves the distinction
between a tolerant user-intent boundary and a strict calculation boundary.

The schema is not generated from private module metadata in this refactor.
Changing the authenticated commit schema's construction would expand the
trust-boundary change without removing the need for an explicit wire contract.

## Applying a Plan Adjustment

The module owns only the pure transformation from normalized Household Runway
Plan inputs plus application context to the next inputs. The Interview owns
whether application is available and everything that happens around the
transformation.

The pure transformation preserves these semantics:

- expense reduction is distributed through the existing expense-reduction
  calculation;
- added cash increments available cash and records it as confirmed;
- added monthly income creates the existing confirmed `other` income source;
- usable illiquid and retirement values become the Draft's `extreme_access`
  values;
- expected unconfirmed funds are discarded because they have no confirmed
  durable Plan input; and
- the returned inputs use the command occurrence time as `updated_at`.

The Interview supplies the occurrence time and command-derived income-source
identity. It then normalizes the returned answers and owns:

- status and stage checks;
- ignored-command reasons;
- Draft revision increments;
- Plan Adjustment reset;
- Draft and Plan dirty-operation state;
- lifecycle events; and
- subsequent Assessment and persistence work.

The existing source label, confidence, and identifier format remain unchanged.
Copy or identity redesign is outside this refactor.

## Projection

The module derives the Plan Adjustment projection from a complete Plan
Adjustment, the current inputs, and the already-calculated baseline and preview
simulations. It owns:

- active-state detection;
- the minimum of zero for every field;
- the current maximum for every field;
- current field values; and
- the effect classification.

Effect classification remains exactly:

- `none` when no Plan Adjustment is active;
- `none` when baseline and preview are both sustainable;
- `becameSustainable` when a depleting baseline becomes sustainable; and
- `monthsChanged`, including an exact zero delta, when both outcomes deplete.

A non-negative Plan Adjustment cannot turn a sustainable baseline into a
depleting preview. The module returns `none` defensively if incoherent internal
simulation facts violate that invariant.

The Runtime still owns when projection occurs, which Scenario is selected, how
an unavailable Assessment becomes a typed issue, and publication through
`getSnapshot()`.

## Simulator and schema remain separate defenses

`simulateHouseholdRunway` continues to accept an omitted or partial
`RunwayAdjustments` input, complete it with zeroes, floor the effective expense
outflow, and clamp usable assets to entered balances. It currently does not
apply equivalent defensive clamps to added cash, added income, or expected
funds. This proposal preserves that exact behavior.

Those calculator safeguards are arithmetic defenses, not a competing source of
Runtime validity policy. Importing the private Plan Adjustment module into
`cushion.ts` would reverse the intended dependency and risks a cycle, so it is
not part of this extraction.

The Zod schemas likewise remain explicit trust-boundary definitions. The policy
module replaces duplicated domain-relative rule construction, not the need to
state the serialized shape.

## Out-of-scope semantic recommendations

The design review exposed three behaviors that deserve an explicit disposition.
They do not remain open for this design: each keeps its current behavior during
the refactor. The recommendations below guide any separately authorized
semantic follow-up.

### Added-cash headroom

The current added-cash maximum is the global per-field cap, not the remaining
headroom after existing available cash. A valid preview can therefore apply to
Draft inputs whose resulting available cash exceeds the schema cap. Preserve
that behavior in this refactor. In separate correction work, cap added cash at
the remaining available-cash headroom so any applicable preview can produce
schema-valid Draft inputs.

### Partial usable-asset application

When any of the three usable-asset fields is positive, applying the complete
Plan Adjustment replaces all three `extreme_access` fields. Zeroes in the other
two Plan Adjustment fields therefore clear pre-existing values. Preserve and
document replacement semantics: the complete Plan Adjustment describes the
previewed last-resort-asset allocation, so applying it should reproduce that
allocation rather than merge it with a different baseline.

### Restored or internal over-limit values

Only Runtime user intents receive authoritative relative clamping. Restored or
internally constructed Plan Adjustments receive scalar normalization and may
later make an Assessment unavailable. Preserve that behavior in this refactor.
In separate recovery work, tolerantly clamp a restored user Draft against its
restored Plan inputs, while requiring internal command fixtures and callers to
provide already valid values rather than creating a second permissive path.

## Migration sequence

Implementation should be incremental while the supported behavior remains
green at every step:

1. Preserve the existing Runtime, Assessment, Interview, projection, simulator,
   schema, and persistence tests as characterization evidence.
2. Introduce the private module with the field set, zero value, active check,
   limits, tolerant patch normalization, and strict relational violations.
3. Route Runtime intent normalization and Assessment relational validation
   through the module without changing their different outcomes.
4. Move the pure application transformation while leaving the Interview
   transition shell intact.
5. Move field and effect projection while leaving Runtime projection timing and
   publication intact.
6. Remove replaced private helpers and duplicated relative-limit tables; do not
   retain compatibility wrappers for private functions.
7. Leave simulator arithmetic defenses and explicit Zod schemas in place.

No step changes the supported Runtime facade or creates a second projection.

## Acceptance evidence

The refactor is complete only when all of the following are true:

- the public Runtime still exposes exactly its five supported methods;
- the public Runtime factory and snapshot shapes remain unchanged;
- Runtime intent tables cover negative, fractional, non-finite, hostile,
  exact-limit, over-limit, unknown-field, and absent-Plan-input cases across all
  seven fields;
- Assessment tests prove exact relative limits succeed and every relative
  limit plus one cent is rejected with the existing public paths and messages;
- module tests cover zero construction, active detection, limit derivation,
  tolerant normalization, strict violations, every application mapping,
  expected-funds discard, and every projection-effect variant;
- Interview tests prove status checks, events, Draft revision, dirty state,
  Plan Adjustment clearing, source identity, and idempotent ignored commands
  remain lifecycle concerns;
- simulator tests preserve its existing partial-input and defensive-clamp
  behavior;
- schema, repository, service, route, and persistence tests preserve the exact
  complete commit shape and legacy wire keys;
- import-boundary tests prevent application and React code from importing the
  private module or raw Plan and Assessment facts;
- source inspection finds no independent relative-limit table in Runtime,
  Interview projection, or Assessment; and
- type checking, linting, the full unit suite, and the focused Household Runway
  Playwright flow pass.

Module tests complement rather than replace supported Runtime contract tests.
No whole-snapshot fixture is required.

## Resolved design tree

Every design question raised during review is resolved as follows:

1. Refactor only; defer semantic corrections.
2. Runtime remains authoritative; the module is a private implementer.
3. Share rules while preserving boundary-specific clamp, reject, and defensive
   behaviors.
4. Move pure Plan Adjustment semantics; retain lifecycle and orchestration in
   their current owners.
5. Use one private module with an acyclic dependency on calculation helpers.
6. Keep supported types, Runtime methods, schemas, wire keys, and persistence
   shapes compatible.
7. Derive limits from current inputs without caching or opportunistic
   reclamping.
8. Preserve application mappings, including provisional-funds discard and the
   current usable-asset replacement behavior.
9. Preserve projection fields and effect variants exactly.
10. Keep simulation and schema defenses explicit and separate.
11. Retain supported boundary tests and add focused module tests.
12. Do not create an ADR for this reversible private extraction.

There are no unresolved decisions in this design. The out-of-scope semantic
recommendations are documented but do not authorize behavior changes as part
of the private policy extraction.
