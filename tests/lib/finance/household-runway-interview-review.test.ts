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

describe("reviewable Household Runway Assessment boundary", () => {
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
