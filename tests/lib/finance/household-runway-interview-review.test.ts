import { describe, expect, it } from "vitest";
import {
  RUNWAY_MODEL_VERSION,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  normalizeHouseholdRunwayDraft,
  restoreHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/internal/household-runway-interview";

const occurredAt = "2026-08-02T15:00:00.000Z";

function dispatch(
  state: HouseholdRunwayInterviewState,
  input: HouseholdRunwayInterviewCommandInput,
  commandId: string,
) {
  return dispatchHouseholdRunwayInterview(state, {
    ...input,
    commandId,
    occurredAt,
  } as HouseholdRunwayInterviewCommand);
}

function atReview(shared = false) {
  let state = dispatch(
    createHouseholdRunwayInterview(),
    { type: "start", interviewId: "interview-1" },
    "start",
  ).state;
  state = dispatch(state, { type: "select_country", country: "US" }, "country").state;
  state = dispatch(state, { type: "select_region", region: "CA" }, "region").state;
  state = dispatch(state, { type: "select_currency", currency: "USD" }, "currency").state;
  state = dispatch(state, { type: "continue" }, "location-next").state;
  state = dispatch(
    state,
    { type: "set_household", sharesFinances: shared },
    "household",
  ).state;
  state = dispatch(state, { type: "continue" }, "household-next").state;

  if (shared) {
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "mine-employment",
    ).state;
    state = dispatch(
      state,
      { type: "set_employment", person: "partner", employment: "employed" },
      "partner-employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "mine",
        patch: {
          entered_as: "net",
          net_amount_cents: 500_000,
          net_period: "monthly",
        },
      },
      "mine-income",
    ).state;
    state = dispatch(state, { type: "continue" }, "mine-income-next").state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "partner",
        patch: {
          entered_as: "net",
          net_amount_cents: 400_000,
          net_period: "monthly",
        },
      },
      "partner-income",
    ).state;
    state = dispatch(state, { type: "continue" }, "partner-income-next").state;
  } else {
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "unemployed" },
      "mine-employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
  }

  state = dispatch(state, { type: "skip" }, "other-income-skip").state;
  state = dispatch(
    state,
    { type: "set_cash", value: { cents: 3_000_000, confidence: "confirmed" } },
    "cash-entry",
  ).state;
  state = dispatch(state, { type: "continue" }, "cash-next").state;
  state = dispatch(state, { type: "skip" }, "assets-skip").state;
  state = dispatch(state, { type: "set_expense_mode", mode: "quick" }, "quick-mode").state;
  state = dispatch(
    state,
    {
      type: "set_quick_expenses",
      patch: { current_monthly_cents: 600_000 },
    },
    "quick-expenses",
  ).state;
  state = dispatch(state, { type: "continue" }, "expenses-next").state;
  state = dispatch(
    state,
    {
      type: "set_reduction",
      target: { kind: "quick" },
      interruptionMonthlyCents: 400_000,
    },
    "reduction",
  ).state;
  return dispatch(state, { type: "continue" }, "review").state;
}

function reviewProjectionOf(state: HouseholdRunwayInterviewState) {
  if (state.renderModel.kind !== "review") {
    throw new Error(`expected review render model, received ${state.renderModel.kind}`);
  }
  return state.renderModel.reviewProjection;
}

function resultProjectionOf(state: HouseholdRunwayInterviewState) {
  if (state.renderModel.kind !== "stage") {
    throw new Error(`expected result render model, received ${state.renderModel.kind}`);
  }
  const projection = state.renderModel.resultProjection;
  if (projection.readiness !== "ready") {
    throw new Error("expected a ready result projection");
  }
  return projection;
}

function atResult(shared = false) {
  return dispatch(atReview(shared), { type: "continue" }, "result").state;
}

function atResultWithCash(cents: number) {
  const reviewed = dispatch(
    atReview(),
    {
      type: "update_answers",
      patch: {
        available_cash: { cents, confidence: "confirmed" },
      },
    },
    `cash-${cents}`,
  ).state;
  return dispatch(reviewed, { type: "continue" }, `result-${cents}`).state;
}

function atGuidedReview() {
  return dispatch(
    atReview(true),
    {
      type: "update_answers",
      patch: {
        expense_mode: "guided",
        expense_category_modes: { housing: "subtotal" },
        expense_category_subtotals: {
          housing: {
            current_monthly_cents: 700_000,
            interruption_monthly_cents: 450_000,
            confidence: "needs_review",
          },
        },
      },
    },
    "guided-review",
  ).state;
}

describe("reviewable Household Runway Assessment boundary", () => {
  it.each([
    ["quick one-adult", atReview(), {
      readiness: "ready",
      location: { kind: "complete", country: "US", region: "CA", currency: "USD" },
      household: { adultCount: 1, confidence: "confirmed" },
      cash: { cents: 3_000_000, confidence: "confirmed" },
      expenses: { currentMonthlyCents: 600_000, interruptionMonthlyCents: 400_000, confidence: "confirmed" },
      earnedIncome: { monthlyCents: 0, confidence: "estimated" },
      otherIncome: { monthlyCents: 0, confidence: "skipped" },
      liquidInvestments: { cents: 0, confidence: "skipped" },
      lastResortAssets: { cents: 0, confidence: "skipped" },
    }],
    ["guided two-adult", atGuidedReview(), {
      readiness: "ready",
      location: { kind: "complete", country: "US", region: "CA", currency: "USD" },
      household: { adultCount: 2, confidence: "confirmed" },
      cash: { cents: 3_000_000, confidence: "confirmed" },
      expenses: { currentMonthlyCents: 700_000, interruptionMonthlyCents: 450_000, confidence: "confirmed" },
      earnedIncome: { monthlyCents: 900_000, confidence: "confirmed" },
      otherIncome: { monthlyCents: 0, confidence: "skipped" },
      liquidInvestments: { cents: 0, confidence: "skipped" },
      lastResortAssets: { cents: 0, confidence: "skipped" },
    }],
  ] as const)("projects exact focused facts for %s", (_name, state, expected) => {
    expect(reviewProjectionOf(state)).toEqual(expected);
  });

  it("preserves the current income confidence rule for either adult", () => {
    const confirmed = atReview(true);
    const estimated = dispatch(
      confirmed,
      {
        type: "update_answers",
        patch: {
          mine: { ...confirmed.draft.answers.mine, confidence: "estimated" },
        },
      },
      "estimated-income",
    ).state;

    expect(reviewProjectionOf(confirmed).earnedIncome).toEqual({
      monthlyCents: 900_000,
      confidence: "confirmed",
    });
    expect(reviewProjectionOf(estimated).earnedIncome).toEqual({
      monthlyCents: 900_000,
      confidence: "estimated",
    });
  });

  it("retains quick expense confidence while guided expenses stay confirmed", () => {
    const quick = atReview();
    const needsReview = dispatch(
      quick,
      {
        type: "update_answers",
        patch: {
          quick_expenses: {
            ...quick.draft.answers.quick_expenses,
            confidence: "needs_review",
          },
        },
      },
      "quick-confidence",
    ).state;

    expect(reviewProjectionOf(needsReview).expenses).toEqual({
      currentMonthlyCents: 600_000,
      interruptionMonthlyCents: 400_000,
      confidence: "needs_review",
    });
    expect(reviewProjectionOf(atGuidedReview()).expenses).toEqual({
      currentMonthlyCents: 700_000,
      interruptionMonthlyCents: 450_000,
      confidence: "confirmed",
    });
  });

  it("treats optional other income as confirmed only when a source exists", () => {
    const state = dispatch(
      atReview(),
      {
        type: "set_other_income_sources",
        sources: [
          {
            id: "rent",
            type: "rental_net",
            monthly_cents: 125_000,
            confidence: "skipped",
          },
        ],
      },
      "other-income",
    ).state;

    expect(reviewProjectionOf(state).otherIncome).toEqual({
      monthlyCents: 125_000,
      confidence: "confirmed",
    });
    expect(reviewProjectionOf(atReview()).otherIncome).toEqual({
      monthlyCents: 0,
      confidence: "skipped",
    });
  });

  it("preserves input confidence for cash and liquid investments and derives last-resort assets", () => {
    const state = dispatch(
      atReview(),
      {
        type: "update_answers",
        patch: {
          available_cash: { cents: 3_500_000, confidence: "needs_review" },
          assets: {
            liquid_investments: { cents: 500_000, confidence: "estimated" },
            illiquid_investments: { cents: 600_000, confidence: "confirmed" },
            home_equity: { cents: 700_000, confidence: "confirmed" },
            retirement_tax_deferred: { cents: 800_000, confidence: "confirmed" },
            retirement_tax_free: { cents: 900_000, confidence: "confirmed" },
          },
        },
      },
      "assets",
    ).state;

    expect(reviewProjectionOf(state).cash).toEqual({
      cents: 3_500_000,
      confidence: "needs_review",
    });
    expect(reviewProjectionOf(state).liquidInvestments).toEqual({
      cents: 500_000,
      confidence: "estimated",
    });
    expect(reviewProjectionOf(state).lastResortAssets).toEqual({
      cents: 3_000_000,
      confidence: "confirmed",
    });
    expect(reviewProjectionOf(atReview()).lastResortAssets).toEqual({
      cents: 0,
      confidence: "skipped",
    });
  });

  it("keeps incomplete location facts null and blocks an otherwise reviewable draft", () => {
    const ready = atReview();
    const incomplete = restoreHouseholdRunwayInterview({
      version: 2,
      status: "reviewing",
      stage: "review",
      draft: {
        ...ready.draft,
        location: { ...ready.draft.location, country: null, region: null, currency: null },
        answers: { ...ready.draft.answers, country: null, region: null, currency: null },
      },
      validationIssue: null,
    });

    expect(reviewProjectionOf(incomplete)).toMatchObject({
      readiness: "blocked",
      location: {
        kind: "incomplete",
        country: null,
        region: null,
        currency: null,
      },
    });
    expect(reviewProjectionOf(incomplete).location).not.toEqual(
      expect.objectContaining({ country: "US", currency: "USD" }),
    );
  });

  it("distinguishes an unavailable Assessment from a ready review projection", () => {
    const unavailable = dispatch(
      atReview(),
      { type: "set_plan_adjustment", patch: { expense_reduction_cents: 999_999_999 } },
      "invalid-adjustment",
    ).state;

    expect(reviewProjectionOf(unavailable)).toMatchObject({
      readiness: "blocked",
      location: { kind: "complete", country: "US", region: "CA", currency: "USD" },
      household: { adultCount: 1, confidence: "confirmed" },
      cash: { cents: 3_000_000, confidence: "confirmed" },
      expenses: {
        currentMonthlyCents: 600_000,
        interruptionMonthlyCents: 400_000,
        confidence: "confirmed",
      },
      earnedIncome: { monthlyCents: 0, confidence: "estimated" },
      otherIncome: { monthlyCents: 0, confidence: "skipped" },
      liquidInvestments: { cents: 0, confidence: "skipped" },
      lastResortAssets: { cents: 0, confidence: "skipped" },
    });
    expect(unavailable.assessment).toBeNull();
  });

  it("normalizes a Draft into complete Plan inputs and derives the current model", () => {
    const state = atReview();

    expect(state.status).toBe("reviewing");
    expect(state.draft.answers.region).toBe("CA");
    expect(state.planInputs).toMatchObject<Partial<HouseholdRunwayAnswers>>({
      country: "US",
      region: "CA",
      currency: "USD",
      updated_at: occurredAt,
    });
    expect(state.assessment).toMatchObject({
      modelVersion: RUNWAY_MODEL_VERSION,
      answers: state.planInputs,
    });
    expect(state.renderModel).toMatchObject({
      kind: "review",
      ready: true,
      planInputs: state.planInputs,
      assessment: state.assessment,
      availableScenarios: [{ id: "current", subject: "mine" }],
      selectedScenario: "current",
    });
  });

  it("returns a stable blocking code instead of treating an incomplete Draft as a Plan", () => {
    const state = atReview();
    const restored = restoreHouseholdRunwayInterview({
      version: 2,
      status: "reviewing",
      stage: "review",
      draft: {
        ...state.draft,
        location: { ...state.draft.location, region: null },
        answers: { ...state.draft.answers, region: null },
      },
      validationIssue: null,
    });

    const normalized = normalizeHouseholdRunwayDraft(restored.draft);
    expect(normalized.success).toBe(false);
    if (normalized.success) return;
    expect(normalized.validationIssues[0]).toMatchObject({
      code: "region_required",
      stage: "location",
    });
    expect(restored.planInputs).toBeNull();
    expect(restored.assessment).toBeNull();
    expect(restored.renderModel).toMatchObject({
      kind: "review",
      ready: false,
      blockingIssue: { code: "region_required" },
    });
  });

  it("maps normalized boundary schema failures to stable review-stage issues", () => {
    const base = atReview(true).draft;
    const cases = [
      {
        draft: { ...base, location: { ...base.location, country: null } },
        expected: { code: "country_required", stage: "location" },
      },
      {
        draft: { ...base, location: { ...base.location, region: null } },
        expected: { code: "region_invalid", stage: "location" },
      },
      {
        draft: { ...base, location: { ...base.location, currency: null } },
        expected: { code: "currency_required", stage: "location" },
      },
      {
        draft: {
          ...base,
          answers: {
            ...base.answers,
            mine: { ...base.answers.mine, take_home_source: "invalid" as never },
          },
        },
        expected: { code: "income_required", stage: "myIncome" },
      },
      {
        draft: {
          ...base,
          answers: {
            ...base.answers,
            partner: {
              ...base.answers.partner!,
              take_home_source: "invalid" as never,
            },
          },
        },
        expected: { code: "income_required", stage: "partnerIncome" },
      },
      {
        draft: {
          ...base,
          answers: {
            ...base.answers,
            expense_items: [{ id: "malformed-item" }] as never,
          },
        },
        expected: { code: "plan_input_invalid", stage: "expenses" },
      },
      {
        draft: {
          ...base,
          answers: { ...base.answers, updated_at: "not-a-date" },
        },
        expected: { code: "draft_timestamp_required", stage: "review" },
      },
      {
        draft: {
          ...base,
          answers: { ...base.answers, schema_version: 99 as never },
        },
        expected: { code: "plan_input_invalid", stage: "review" },
      },
    ] as const;

    for (const item of cases) {
      const normalized = normalizeHouseholdRunwayDraft(item.draft);
      expect(normalized.success).toBe(false);
      if (normalized.success) continue;
      expect(normalized.validationIssues).toContainEqual(
        expect.objectContaining(item.expected),
      );
    }
  });

  it("reports relational income and expense requirements before the schema boundary", () => {
    const base = atReview(true).draft;
    const zeroIncome = {
      ...base.answers.mine,
      monthly_take_home_cents: 0,
      estimated_monthly_take_home_cents: 0,
      entered_amount_cents: 0,
      gross_amount_cents: 0,
      net_amount_cents: 0,
      entered_as: "net" as const,
      entered_period: "monthly" as const,
      net_period: "monthly" as const,
      take_home_source: "user_confirmed" as const,
      confidence: "confirmed" as const,
    };
    const normalized = normalizeHouseholdRunwayDraft({
      ...base,
      answers: {
        ...base.answers,
        mine: zeroIncome,
        partner: zeroIncome,
        expense_mode: "quick",
        quick_expenses: {
          current_monthly_cents: 0,
          interruption_monthly_cents: 0,
          confidence: "confirmed",
        },
        expense_items: [],
        expense_category_subtotals: {},
      },
    });

    expect(normalized.success).toBe(false);
    if (normalized.success) return;
    expect(normalized.validationIssues).toEqual(
      expect.arrayContaining([
        { code: "income_required", stage: "myIncome" },
        { code: "income_required", stage: "partnerIncome" },
        { code: "expenses_current_required", stage: "expenses" },
        { code: "expenses_interruption_required", stage: "reductions" },
      ]),
    );
  });

  it("blocks an assessment when a provisional adjustment exceeds its relational limit", () => {
    const invalid = dispatch(
      atReview(),
      { type: "set_plan_adjustment", patch: { expense_reduction_cents: 999_999_999 } },
      "invalid-adjustment",
    );

    expect(invalid.state.planInputs).not.toBeNull();
    expect(invalid.state.assessment).toBeNull();
    expect(invalid.state.renderModel).toMatchObject({
      kind: "review",
      ready: false,
      blockingIssue: { code: "assessment_required" },
    });
  });

  it("keeps applicable scenarios ordered and falls back only when the selection disappears", () => {
    let state = atReview(true);
    expect(state.renderModel).toMatchObject({
      availableScenarios: [
        { id: "mine_stops" },
        { id: "partner_stops" },
        { id: "both_stop" },
      ],
      selectedScenario: "mine_stops",
    });

    state = dispatch(
      state,
      { type: "select_scenario", scenario: "partner_stops" },
      "select-partner-stop",
    ).state;
    const unrelatedEdit = dispatch(
      state,
      {
        type: "update_answers",
        patch: {
          available_cash: { cents: 3_500_000, confidence: "confirmed" },
        },
      },
      "unrelated-edit",
    );
    expect(unrelatedEdit.state.renderModel).toMatchObject({
      selectedScenario: "partner_stops",
    });

    const unavailable = dispatch(
      unrelatedEdit.state,
      { type: "set_household", sharesFinances: false },
      "remove-partner",
    );
    expect(unavailable.state.renderModel).toMatchObject({
      availableScenarios: [{ id: "mine_stops" }],
      selectedScenario: "mine_stops",
    });
    expect(unavailable.events).toContainEqual(
      expect.objectContaining({
        type: "scenario_fallback",
        previousScenario: "partner_stops",
        scenario: "mine_stops",
      }),
    );
  });

  it("derives a fresh review assessment while keeping collecting state provisional", () => {
    const original = atReview();
    const changed = dispatch(
      original,
      {
        type: "update_answers",
        patch: {
          available_cash: { cents: 1_000_000, confidence: "confirmed" },
        },
      },
      "review-edit",
    );

    expect(changed.state.status).toBe("reviewing");
    expect(changed.state.planInputs?.available_cash.cents).toBe(1_000_000);
    expect(changed.state.assessment).not.toBe(original.assessment);
    expect(changed.state.assessment?.firstScenario.baseline.starting_resources_cents).toBe(
      1_000_000,
    );

    const editing = dispatch(changed.state, { type: "back" }, "edit").state;
    expect(editing.status).toBe("collecting");
    expect(editing.stage).toBe("reductions");
    expect(editing.planInputs).toBeNull();
    expect(editing.assessment).toBeNull();
    expect(editing.draft.answers.available_cash.cents).toBe(1_000_000);

    const reviewedAgain = dispatch(editing, { type: "continue" }, "review-again").state;
    expect(reviewedAgain.status).toBe("reviewing");
    expect(reviewedAgain.planInputs).not.toBeNull();
    expect(reviewedAgain.assessment?.modelVersion).toBe(RUNWAY_MODEL_VERSION);
  });

  it("reveals the derived Assessment without emitting Plan or Snapshot effects", () => {
    const revealed = dispatch(atReview(), { type: "continue" }, "reveal");

    expect(revealed.state.status).toBe("completed");
    expect(revealed.state.assessment?.modelVersion).toBe(RUNWAY_MODEL_VERSION);
    expect(revealed.effects).toEqual([{ type: "focus", stage: "result" }]);
    expect(revealed.events.map((event) => event.type)).not.toContain(
      "plan_committed",
    );
    expect(revealed.events.map((event) => event.type)).not.toContain(
      "snapshot_created",
    );
  });
});

describe("focused Household Runway result projection", () => {
  it("projects the selected Assessment with canonical Scenario order and its model version", () => {
    const selected = dispatch(
      atReview(true),
      { type: "select_scenario", scenario: "partner_stops" },
      "select-partner-stops",
    ).state;
    const result = dispatch(selected, { type: "continue" }, "result").state;

    expect(resultProjectionOf(result)).toMatchObject({
      readiness: "ready",
      modelVersion: RUNWAY_MODEL_VERSION,
      country: "US",
      currency: "USD",
      scenarios: {
        selected: "partner_stops",
        available: [
          { id: "mine_stops" },
          { id: "partner_stops" },
          { id: "both_stop" },
        ],
      },
    });
  });

  it("retains an applicable selection after an unrelated edit and falls back when it disappears", () => {
    let state = atReview(true);
    state = dispatch(
      state,
      { type: "select_scenario", scenario: "partner_stops" },
      "select-partner-stops",
    ).state;
    state = dispatch(
      state,
      {
        type: "update_answers",
        patch: {
          available_cash: { cents: 3_500_000, confidence: "confirmed" },
        },
      },
      "unrelated-edit",
    ).state;
    expect(
      resultProjectionOf(dispatch(state, { type: "continue" }, "retained-result").state)
        .scenarios.selected,
    ).toBe("partner_stops");

    state = dispatch(
      state,
      { type: "set_household", sharesFinances: false },
      "remove-partner",
    ).state;
    const fallback = resultProjectionOf(
      dispatch(state, { type: "continue" }, "fallback-result").state,
    );
    expect(fallback.scenarios).toEqual({
      selected: "mine_stops",
      available: [{ id: "mine_stops" }],
    });
  });

  it("does not expose partial result facts when a restored Assessment is unavailable", () => {
    const reviewed = atReview();
    const restored = restoreHouseholdRunwayInterview({
      version: 2,
      status: "completed",
      stage: "result",
      draft: {
        ...reviewed.draft,
        planAdjustment: {
          ...reviewed.draft.planAdjustment,
          expense_reduction_cents: 999_999_999,
        },
      },
      validationIssue: null,
    });

    expect(restored.renderModel).toMatchObject({
      kind: "stage",
      resultProjection: { readiness: "unavailable" },
    });
    expect(restored.renderModel).not.toHaveProperty(
      "resultProjection.primary",
    );
  });

  it.each([
    [
      "sustainable",
      atResult(true),
      { kind: "sustainable" },
      "sustainable",
    ],
    [
      "under three months",
      atResultWithCash(800_000),
      {
        kind: "depletes",
        monthsCovered: 2,
        depletion: { kind: "dated", date: "2026-10-02" },
      },
      "underThree",
    ],
    [
      "exactly three months",
      atResultWithCash(1_200_000),
      {
        kind: "depletes",
        monthsCovered: 3,
        depletion: { kind: "dated", date: "2026-11-02" },
      },
      "threeToUnderSix",
    ],
    [
      "exactly six months",
      atResultWithCash(2_400_000),
      {
        kind: "depletes",
        monthsCovered: 6,
        depletion: { kind: "dated", date: "2027-02-02" },
      },
      "sixPlus",
    ],
    [
      "outside the representable date range",
      atResultWithCash(100_000_000_000),
      {
        kind: "depletes",
        monthsCovered: 250_000,
        depletion: { kind: "outsideDateRange" },
      },
      "sixPlus",
    ],
  ] as const)("projects the %s outcome and guidance", (_name, state, outcome, guidance) => {
    const primary = resultProjectionOf(state).primary;

    expect(primary.outcome).toEqual(outcome);
    expect(primary.guidance).toBe(guidance);
    if (primary.outcome.kind === "sustainable") {
      expect(primary.outcome).not.toHaveProperty("monthsCovered");
      expect(primary.outcome).not.toHaveProperty("depletion");
    } else {
      expect(Number.isFinite(primary.outcome.monthsCovered)).toBe(true);
      expect(primary.outcome.monthsCovered).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the live What-if preview for the primary result and the unadjusted baseline for interruption", () => {
    const adjusted = dispatch(
      atReview(),
      {
        type: "set_plan_adjustment",
        patch: { added_monthly_income_cents: 400_000 },
      },
      "add-income",
    ).state;
    const projection = resultProjectionOf(
      dispatch(adjusted, { type: "continue" }, "result").state,
    );

    expect(projection.primary.outcome).toEqual({ kind: "sustainable" });
    expect(projection.comparisons.interruption.outcome).toEqual({
      kind: "depletes",
      monthsCovered: 7.5,
    });
  });

  it("projects simulation resources, separate explanation amounts, and semantic comparison outcomes", () => {
    const base = atReview();
    const withAssets = dispatch(
      base,
      {
        type: "update_answers",
        patch: {
          assets: {
            ...base.draft.answers.assets,
            liquid_investments: { cents: 700_000, confidence: "confirmed" },
            illiquid_investments: { cents: 600_000, confidence: "confirmed" },
            home_equity: { cents: 2_000_000, confidence: "confirmed" },
            retirement_tax_deferred: { cents: 800_000, confidence: "confirmed" },
            retirement_tax_free: { cents: 900_000, confidence: "confirmed" },
          },
        },
      },
      "assets",
    ).state;
    const adjusted = dispatch(
      withAssets,
      {
        type: "set_plan_adjustment",
        patch: {
          expense_reduction_cents: 100_000,
          added_cash_cents: 100_000,
          added_monthly_income_cents: 50_000,
          usable_illiquid_investments_cents: 200_000,
          usable_retirement_tax_deferred_cents: 300_000,
          usable_retirement_tax_free_cents: 400_000,
        },
      },
      "adjustment",
    ).state;
    const projection = resultProjectionOf(
      dispatch(adjusted, { type: "continue" }, "result").state,
    );

    expect(projection.primary.resources).toEqual({
      startingCents: 4_700_000,
      continuingMonthlyIncomeCents: 50_000,
      interruptionExpensesCents: 300_000,
      reducibleExpensesCents: 200_000,
      excludedAssetsCents: 3_400_000,
    });
    expect(projection.explanation).toEqual({
      availableCashCents: 3_000_000,
      liquidInvestmentsCents: 700_000,
    });
    expect(projection.comparisons.currentLifestyle.outcome).toEqual({
      kind: "depletes",
      monthsCovered: 6.166666666666667,
    });
    expect(projection.comparisons.interruption.outcome).toEqual({
      kind: "depletes",
      monthsCovered: 9.25,
    });
    expect(projection.comparisons.extremeMode.outcome).toEqual({
      kind: "depletes",
      monthsCovered: 9.25,
    });
  });

  it("projects every modeled month through a 240-month horizon", () => {
    const series = resultProjectionOf(atResultWithCash(96_000_000)).primary.series;

    expect(series.kind).toBe("monthly");
    expect(series.throughMonth).toBe(240);
    expect(series.points).toHaveLength(240);
    expect(series.points.map((point) => point.month)).toEqual(
      Array.from({ length: 240 }, (_, index) => index + 1),
    );
  });

  it("projects long horizons as bounded sorted checkpoints with values for their named month", () => {
    const series = resultProjectionOf(
      atResultWithCash(100_000_000_000),
    ).primary.series;

    expect(series.kind).toBe("checkpoints");
    if (series.kind !== "checkpoints") throw new Error("expected checkpoint series");
    expect(series.throughMonth).toBe(250_000);
    expect(series.completeMonthlyThrough).toBe(12);
    expect(series.points.length).toBeLessThanOrEqual(60);

    const months = series.points.map((point) => point.month);
    expect(months.slice(0, 12)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(months.at(-1)).toBe(250_000);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(new Set(months).size).toBe(months.length);
    expect(months.filter((month) => month > 12 && month < 250_000).length).toBeLessThanOrEqual(47);

    const checkpoint = series.points.find((point) => point.month === 5_208);
    expect(checkpoint).toEqual({
      month: 5_208,
      openingBalanceCents: 97_917_200_000,
      continuingIncomeCents: 0,
      oneTimeFundsCents: 0,
      essentialOutflowCents: 400_000,
      closingBalanceCents: 97_916_800_000,
    });
  });
});
