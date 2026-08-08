# Household Runway result projection contract

Status: implemented; supported Runtime and result UI cutover landed

This contract completes the presentation-neutral Runtime boundary established
by ADR-0011. It replaces raw Household Runway Plan inputs and raw Household
Runway Assessments in the supported snapshot with focused review and result
facts. Formulas, screen flow, authentication policy, and persistence semantics
remain unchanged.

Four accepted correctness changes accompany the ownership cutover:

- display the selected Assessment's actual model version instead of stale
  hard-coded model-version copy;
- describe a What-if transition from finite runway to sustainability
  qualitatively instead of hiding its comparison;
- compare history only across matching Scenarios and model versions and express
  transitions to or from sustainability qualitatively; and
- enforce all Plan Adjustment maxima at the Runtime intent boundary instead of
  relying on incomplete React clamps or allowing invalid Adjustments to make an
  Assessment unavailable.

All other visible behavior and copy remain unchanged.

The supported `getSnapshot()` result is now the single focused projection for
both review and result screens. The private composition no longer exposes a
second focused-snapshot getter or a compatibility projection; raw Plan inputs,
Assessments, and persistence summaries remain behind the private Runtime and
capability boundaries.

## Supported screen contract

Review and result are first-class screen variants. Callers do not extract a
generic stage and then interpret internal Interview state.

```ts
type HouseholdRunwayReviewScreen = {
  kind: "review";
  readiness: "ready" | "blocked";
  location:
    | {
        kind: "complete";
        country: RunwayCountry;
        region: string;
        currency: RunwayCurrency;
      }
    | {
        kind: "incomplete";
        country: RunwayCountry | null;
        region: string | null;
        currency: RunwayCurrency | null;
      };
  household: { adultCount: 1 | 2; confidence: "confirmed" };
  cash: { cents: number; confidence: InputConfidence };
  expenses: {
    currentMonthlyCents: number;
    interruptionMonthlyCents: number;
    confidence: InputConfidence;
  };
  earnedIncome: {
    monthlyCents: number;
    confidence: "confirmed" | "estimated";
  };
  otherIncome: {
    monthlyCents: number;
    confidence: "confirmed" | "skipped";
  };
  liquidInvestments: { cents: number; confidence: InputConfidence };
  lastResortAssets: {
    cents: number;
    confidence: "confirmed" | "skipped";
  };
};

type HouseholdRunwayResultScreen =
  | { kind: "result"; readiness: "unavailable" }
  | HouseholdRunwayReadyResultScreen;
```

An incomplete review location remains incomplete. The Runtime must not invent
US/USD defaults and expose them as user facts. To preserve current visible
behavior, React formats that variant with the existing US/USD fallback while
still treating the region as needing review. Review confidence codes preserve
current visible behavior; correcting their product semantics is separate work.

Review and result use separate public shapes. Small private Runtime helpers may
construct shared money, location, and confidence facts, but no oversized public
"financial facts" model couples the screens.

Review readiness is `ready` only when normalized Plan inputs and a successful
Assessment exist; otherwise it is `blocked` and top-level issues carry the
reason. The projected badges preserve these current rules exactly:

- Location needs review only when region is absent; Household is confirmed.
- Cash and liquid investments retain their input confidence.
- Quick expenses retain their aggregate confidence; guided expenses display as
  confirmed.
- Earned income is estimated only when either adult's confidence is exactly
  estimated; otherwise it displays as confirmed.
- Other income is confirmed when any source exists and skipped otherwise.
- Last-resort assets are confirmed when their total is nonzero and skipped
  otherwise.

## Ready result

```ts
type HouseholdRunwayReadyResultScreen = {
  kind: "result";
  readiness: "ready";
  modelVersion: string;
  country: RunwayCountry;
  currency: RunwayCurrency;
  scenarios: {
    selected: RunwayScenario;
    available: readonly { id: RunwayScenario }[];
  };
  primary: FocusedRunwaySimulation;
  comparisons: {
    currentLifestyle: RunwayComparisonFact;
    interruption: RunwayComparisonFact;
    extremeMode: RunwayComparisonFact;
  };
  explanation: {
    availableCashCents: number;
    liquidInvestmentsCents: number;
  };
  adjustment: HouseholdRunwayAdjustmentProjection;
  advice: readonly HouseholdRunwayAdviceFact[];
  precision: {
    notices: readonly HouseholdRunwayPrecisionNotice[];
  };
  history: readonly HouseholdRunwayAssessmentSnapshotFact[];
};
```

A ready result has at least one applicable Scenario, a selected Scenario that
belongs to that ordered set, and Assessment facts for that selection. The
Runtime retains a valid selection after unrelated edits and falls back to the
first applicable Scenario when the previous selection disappears. React never
synthesizes `current`, searches Assessment scenarios, or falls back to
`firstScenario`.

The projected model version is the version that produced the selected
Assessment, never a globally imported current-version constant.

An unavailable result exposes no partial Assessment facts. The snapshot's
typed issues explain the condition; the screen does not duplicate issue codes.

## Outcome and guidance

```ts
type RunwayOutcome =
  | { kind: "sustainable" }
  | {
      kind: "depletes";
      monthsCovered: number;
      depletion:
        | { kind: "dated"; date: string }
        | { kind: "outsideDateRange" };
    };

type RunwayConfidence = "complete" | "estimated" | "needsReview";

type RunwayGuidanceBand =
  | "underThree"
  | "threeToUnderSix"
  | "sixPlus"
  | "sustainable";
```

Sustainable outcomes do not carry numeric covered months or a depletion date.
A depleting outcome always carries finite non-negative covered months; an
unrepresentable calendar date is `outsideDateRange`, not a sustainable result
or an invented fallback value.

The primary outcome, confidence, guidance band, and advice describe the live
provisional What-if preview. The interruption comparison preserves the
unadjusted baseline. React maps semantic codes to localized copy and formatting.

## Focused simulation and series

```ts
type FocusedRunwaySimulation = {
  outcome: RunwayOutcome;
  confidence: RunwayConfidence;
  guidance: RunwayGuidanceBand;
  resources: {
    startingCents: number;
    continuingMonthlyIncomeCents: number;
    interruptionExpensesCents: number;
    reducibleExpensesCents: number;
    excludedAssetsCents: number;
  };
  series: RunwaySeries;
};

type RunwaySeries =
  | {
      kind: "monthly";
      throughMonth: number;
      points: readonly RunwayPoint[];
    }
  | {
      kind: "checkpoints";
      throughMonth: number;
      completeMonthlyThrough: 12;
      points: readonly RunwayPoint[];
    };

type RunwayPoint = {
  month: number;
  openingBalanceCents: number;
  continuingIncomeCents: number;
  oneTimeFundsCents: number;
  essentialOutflowCents: number;
  closingBalanceCents: number;
};

type RunwayComparisonFact = {
  outcome:
    | { kind: "sustainable" }
    | { kind: "depletes"; monthsCovered: number };
};
```

Checkpoint values describe the named modeled month, not an accumulation since
the previous checkpoint. A monthly series contains every month through its
final month when that horizon is at most 240 months. A longer checkpoint series
contains months 1 through 12, up to 47 rounded intermediate checkpoints, and
the final modeled month, deduplicated and sorted for no more than 60 points.
React owns SVG geometry, scale and tick calculation, table layout,
locale-sensitive money/date formatting, and markup.

## Plan Adjustment

```ts
type HouseholdRunwayAdjustmentField = {
  valueCents: number;
  minimumCents: 0;
  maximumCents: number;
};

type HouseholdRunwayAdjustmentEffect =
  | { kind: "none" }
  | { kind: "monthsChanged"; deltaMonths: number }
  | { kind: "becameSustainable" };

type HouseholdRunwayAdjustmentProjection = {
  active: boolean;
  fields: {
    expenseReduction: HouseholdRunwayAdjustmentField;
    addedCash: HouseholdRunwayAdjustmentField;
    addedMonthlyIncome: HouseholdRunwayAdjustmentField;
    expectedUnconfirmedFunds: HouseholdRunwayAdjustmentField;
    usableIlliquidInvestments: HouseholdRunwayAdjustmentField;
    usableRetirementTaxDeferred: HouseholdRunwayAdjustmentField;
    usableRetirementTaxFree: HouseholdRunwayAdjustmentField;
  };
  effect: HouseholdRunwayAdjustmentEffect;
};
```

The Runtime normalizes finite, rounded, non-negative cents and clamps values to
the authoritative global and domain-relative bounds before recalculating the
Assessment:

- expense reduction is capped at baseline interruption expenses;
- each usable illiquid or retirement amount is capped at its entered balance;
  and
- added cash, added monthly income, and expected unconfirmed funds are capped
  at `MAX_CUSHION_AMOUNT_CENTS`, currently `100_000_000_000` cents.

React neither derives bounds from raw answers nor applies `Math.min`. Expected
unconfirmed funds remain provisional and are discarded rather than becoming a
hidden durable Plan fact when the Adjustment is applied. The atomic migration
therefore includes the Runtime intent-normalization path and its boundary tests,
not only the public projector.

`effect` is `none` when no Adjustment is active or both baseline and preview are
sustainable. An active finite-to-finite comparison is `monthsChanged`, including
an exact zero delta; React alone rounds that value for display. A finite baseline
whose preview is sustainable is `becameSustainable`. Because every Adjustment
is non-negative, an Adjustment cannot make a sustainable baseline become
depleting.

## Advice and precision

```ts
type HouseholdRunwayAdviceFact =
  | {
      kind: "cashTarget";
      targetMonths: 3 | 6;
      gapCents: number;
    }
  | {
      kind: "largestReducibleCategory";
      category: ExpenseCategory;
      reducibleCents: number;
    };

type HouseholdRunwayPrecisionNotice =
  | { kind: "cashNotConfirmed" }
  | { kind: "takeHomeEstimated" }
  | { kind: "quickExpenses" }
  | { kind: "coreInputsComplete" };
```

Advice contains zero to two items in canonical order: a positive cash target,
then a positive largest-reducible-category action. The rules describe the
adjusted preview. Producing no action is valid; inventing a maintenance action
would be a product change.

The primary simulation's `confidence` is the sole calculation-confidence fact.
Precision notices preserve current order: cash needing review, estimated
take-home pay, quick expenses, then the positive core-inputs-complete notice.
The completion notice may coexist with an improvement notice, preserving
current visible behavior without asking React to inspect inputs. Redesigning
that policy is separate product work.

## Assessment history

```ts
type HouseholdRunwayHistoryComparison =
  | { kind: "noPrevious" }
  | {
      kind: "incomparable";
      reason:
        | "scenarioChanged"
        | "modelChanged"
        | "scenarioAndModelChanged";
    }
  | { kind: "unchanged" }
  | { kind: "monthsChanged"; deltaMonths: number }
  | { kind: "becameSustainable" }
  | { kind: "leftSustainable" };

type HouseholdRunwayAssessmentSnapshotFact = {
  id: string;
  scenario: RunwayScenario;
  modelVersion: string;
  createdAt: string;
  outcome:
    | { kind: "sustainable" }
    | { kind: "depletes"; monthsCovered: number };
  comparisonToPrevious: HouseholdRunwayHistoryComparison;
};
```

History contains the complete available newest-first list, currently bounded
by persistence to 24 entries. Each Household Runway Assessment Snapshot is the
first applicable Scenario's unadjusted baseline, not the selected Scenario or
What-if preview. Numeric changes require matching Scenario and model version.
Transitions to or from sustainability are qualitative. React may display only
six entries as a layout decision, but it does not calculate comparisons; this
also lets the sixth visible row compare with the seventh available Snapshot.

Comparison precedence is exact: no older entry; Scenario/model mismatch; both
sustainable and therefore unchanged; transition to or from sustainability;
equal finite months and therefore unchanged; otherwise a numeric change. For a
numeric change, `deltaMonths` is the newer entry's covered months minus the
immediately older entry's covered months.

The private persistence/browser boundary validates every restored history
summary before it reaches the projector. If any summary is malformed, the
Runtime rejects that restored history list, keeps the current result available,
and publishes a typed non-blocking `assessment_history_invalid` issue. It does
not cast incoherent boolean/null combinations into the public outcome union or
silently retain a partial history.

## Actions and operations

The snapshot exposes one top-level `actions` object. Result and review screens
do not recompute or duplicate it.

```ts
type ActionApplicability = { applicable: true } | { applicable: false };

type AsyncOperation =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "succeeded" }
  | {
      status: "failed";
      error: HouseholdRunwayInterviewRuntimeOperationError;
    };

type HouseholdRunwayRuntimeActions = {
  start: ActionApplicability;
  startNew: ActionApplicability;
  resumeDraft: ActionApplicability;
  resumePlan: ActionApplicability;
  importDraft: ActionApplicability;
  continue: ActionApplicability;
  back: ActionApplicability;
  skip: ActionApplicability;
  discardDraft: ActionApplicability;
  rememberDraft: ActionApplicability;
  clearDeviceDraft: ActionApplicability;
  editCompletedPlan: ActionApplicability;
  selectScenario: ActionApplicability;
  setPlanAdjustment: ActionApplicability;
  applyPlanAdjustment: ActionApplicability;
  resetPlanAdjustment: ActionApplicability;
  savePlan: ActionApplicability;
  downloadReport: ActionApplicability;
};

type HouseholdRunwayRuntimeOperations = {
  draftSynchronization: AsyncOperation;
  deviceDraft: AsyncOperation;
  planPersistence: AsyncOperation;
  reportDownload: AsyncOperation;
  analytics: AsyncOperation;
};

type HouseholdRunwayRuntimePlanFacts = {
  exists: boolean;
  current: boolean;
};

type HouseholdRunwayRuntimeDraftFacts = {
  current: boolean;
  stored: boolean;
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
  synchronized: boolean;
};

```

The public snapshot uses the existing `HouseholdRunwayInterviewRuntimeSnapshot`
name. There is no exported focused-snapshot alias or private composition getter.

Applicability means that an intent belongs to the current lifecycle and screen
and may be attempted. It does not guarantee validation success, authentication,
capability availability, or that no operation is pending. Every action is
inapplicable unless the Runtime lifecycle is ready. Within a ready Runtime:

- Start is applicable on a pristine landing screen.
- Start New is applicable on a landing/resume choice with existing work or a
  committed Plan and on a completed result. Collecting and review screens use
  Discard Draft rather than exposing a second restart action.
- Resume Draft and Resume Plan are independently applicable on the resume-choice
  screen when the corresponding source exists. Import Draft is applicable only
  when an importable anonymous Draft exists and the host has initiated the
  explicit registration/import flow.
- Continue and Back are applicable while collecting or reviewing. Continue
  remains applicable when validation may publish a typed issue.
- Skip is applicable only on the optional other-income and assets stages.
- Discard Draft is applicable when active or stored Draft work exists, including
  the completed result backed by that Draft.
- Remember Draft and Clear Device Draft are applicable from the corresponding
  consent/storage states.
- Edit Completed Plan, Select Scenario, Set/Apply/Reset Plan Adjustment, Save
  Plan, and Download Report are applicable only on a ready result.

- Save Plan remains applicable with a pending Plan Adjustment so the existing
  typed issue can be surfaced.
- Download remains applicable after failure and can be retried.
- Apply and Reset remain applicable on a ready result even when the Adjustment
  is empty, preserving current behavior.
- Pending duplicate operations may be ignored or coalesced without changing
  applicability.

Input-edit intents on collecting screens are governed by the focused screen
variant and the public intent type rather than duplicated as individual entries
in `actions`. The host-only `registration_clicked` analytics intent likewise
does not create a domain applicability fact.

Authentication-driven visibility remains a React/host concern. An
unauthenticated result substitutes registration for Save Plan. Operation status
records the latest external attempt; `plan.current`, not `succeeded`, is the
authority for whether the displayed Plan is saved and current.

The cutover renames `affordances` to `actions`. Generic operation `dirty` is
removed. For Plan persistence, freshness remains `plan.current`. For Draft
synchronization, internal dirty state projects as
`draft.synchronized: false` with an idle operation; pending keeps
`synchronized: false`; successful synchronization makes it true; and failure
leaves it false with a failed operation. Raw `plan.inputs` is removed with the
other public Plan-input escape hatches.

## Presentation boundary

Runtime owns Scenario selection and fallback, Assessment interpretation,
outcome coherence, guidance bands, comparison selection, Adjustment bounds and
effects, ordered advice and precision codes, history comparability, action
applicability, and typed issues.

React owns localization, labels, money/date/decimal formatting, markup, visual
hierarchy, colors, chart geometry, table layout, host authentication CTAs, and
the number of history rows displayed. React does not import Assessment types or
the global model-version constant and performs no Scenario lookup, domain
fallback, planning-band threshold, Adjustment-cap, or history-delta arithmetic.

## Atomic compatibility boundary

This is one atomic supported-contract cutover. It preserves the Runtime's five
methods and its internal Assessment ownership while changing the public
snapshot projection.

- Remove `snapshot.derived` and the exported
  `HouseholdRunwayInterviewRuntimeDerivedFacts` type.
- Remove raw Plan inputs and Assessment from review and result screens, and
  remove raw `snapshot.plan.inputs` from the public Plan facts.
- Replace the raw top-level `snapshot.assessmentHistory` summaries with the
  focused history facts on a ready result.
- Replace generic result-stage extraction with the first-class result variant.
- Update the Runtime facade, Household Runway shell, result components, chart
  parts, browser adapter tests, and Runtime contract tests together.
- Update Runtime intent normalization to enforce every Adjustment maximum and
  update the private history adapter/projector path to reject malformed history
  lists with the typed non-blocking issue.
- Retain raw Assessment only inside the Interview/Runtime and the private
  persistence and report boundaries that legitimately require it.
- Do not retain deprecated fields, aliases, or a compatibility projection.

## Acceptance evidence

Implementation is complete only when all of the following are true:

- Runtime contract tables cover coherent outcome variants, Scenario ordering
  and fallback, actual model version, all guidance boundaries, Adjustment
  bounds/effects, precision/advice order, history comparability and sustainable
  transitions, action applicability, operation outcomes, and unavailable result.
- Review contract tests cover complete/incomplete location and every named
  summary fact while preserving existing confidence codes.
- Result component tests prove semantic facts become the existing localized
  labels, money, markup, and intents without recalculation.
- Import-boundary tests prevent application and component code from importing
  Household Runway Assessment types or internal Runtime modules and prove the
  public facade exposes no raw Assessment, Plan inputs (including
  `plan.inputs`), or derived escape hatch.
- Boundary tests preserve ADR-0012: the public factory continues to accept only
  deterministic/lifecycle configuration, while Assessment-bearing persistence
  and report capability types and projector helpers remain private.
- Source-boundary checks exclude `RUNWAY_MODEL_VERSION`, Assessment scenario
  searches/casts, guidance thresholds, Adjustment `Math.min`, and history-delta
  arithmetic from React.
- Existing Assessment, review selection/fallback, Plan Adjustment lifecycle,
  browser adapter, and React adapter suites remain green.
- Type checking, linting, the full unit suite, and the focused financial-cushion
  Playwright flow pass.

No acceptance item asserts a serialized whole-snapshot fixture. Tests drive the
supported Runtime and use focused property or table assertions.

## Deliberately separate work

- changing formulas, screen flow, persistence, authentication policy, or copy
  beyond the accepted correctness changes above;
- changing review confidence badge semantics;
- redesigning precision-notice policy;
- guaranteeing at least one advice item;
- changing Assessment Snapshots to store the selected Scenario or What-if
  preview; and
- redesigning chart geometry or correcting visual scale behavior.
