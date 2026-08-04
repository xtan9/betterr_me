import { describe, expect, it } from "vitest";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  restoreHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/household-runway-interview";

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

function atExpenses() {
  let state = dispatch(
    createHouseholdRunwayInterview(),
    { type: "start", interviewId: "interview-1" },
    "start",
  ).state;
  state = dispatch(state, { type: "select_country", country: "US" }, "country").state;
  state = dispatch(state, { type: "select_region", region: "CA" }, "region").state;
  state = dispatch(state, { type: "select_currency", currency: "USD" }, "currency").state;
  state = dispatch(state, { type: "continue" }, "location").state;
  state = dispatch(state, { type: "set_household", sharesFinances: false }, "household").state;
  state = dispatch(state, { type: "continue" }, "household-next").state;
  state = dispatch(
    state,
    { type: "set_employment", person: "mine", employment: "unemployed" },
    "employment",
  ).state;
  state = dispatch(state, { type: "continue" }, "employment-next").state;
  state = dispatch(state, { type: "skip" }, "other-income-skip").state;
  state = dispatch(state, { type: "continue" }, "cash-next").state;
  return dispatch(state, { type: "skip" }, "assets-skip").state;
}

describe("resource and Expenses Interview Stages", () => {
  it("renders cash and assets from the boundary and atomically clears skipped asset values", () => {
    let state = atExpenses();
    state = dispatch(state, { type: "back" }, "back-to-assets").state;
    expect(state.stage).toBe("assets");
    expect(state.renderModel).toMatchObject({
      kind: "assets",
      assets: {
        liquid_investments: { cents: 0, confidence: "skipped" },
      },
    });

    state = dispatch(
      state,
      {
        type: "set_asset",
        asset: "liquid_investments",
        value: { cents: 600_000, confidence: "confirmed" },
      },
      "asset-entry",
    ).state;
    state = dispatch(
      state,
      {
        type: "update_answers",
        patch: {
          extreme_access: {
            illiquid_investments_cents: 25_000,
            retirement_tax_deferred_cents: 40_000,
            retirement_tax_free_cents: 50_000,
          },
        },
      },
      "seed-extreme-access",
    ).state;

    const skipped = dispatch(state, { type: "skip" }, "assets-skip-again");
    expect(skipped.state.stage).toBe("expenses");
    expect(skipped.state.draft.stageStatus.assets).toBe("skipped");
    expect(skipped.state.draft.answers.assets).toEqual({
      liquid_investments: { cents: 0, confidence: "skipped" },
      illiquid_investments: { cents: 0, confidence: "skipped" },
      home_equity: { cents: 0, confidence: "skipped" },
      retirement_tax_deferred: { cents: 0, confidence: "skipped" },
      retirement_tax_free: { cents: 0, confidence: "skipped" },
    });
    expect(skipped.state.draft.answers.extreme_access).toEqual({
      illiquid_investments_cents: 0,
      retirement_tax_deferred_cents: 0,
      retirement_tax_free_cents: 0,
    });
    expect(skipped.events).toContainEqual(
      expect.objectContaining({
        type: "answers_cleared",
        stages: ["assets"],
        reason: "explicit_skip",
      }),
    );
  });

  it("keeps guided category position and completion inside the Expenses render model", () => {
    let state = atExpenses();
    expect(state.renderModel).toMatchObject({
      kind: "expenses",
      mode: "guided",
      activeCategory: null,
      completedCategories: [],
    });

    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "open-housing",
    ).state;
    expect(state.renderModel).toMatchObject({
      kind: "expenses",
      activeCategory: "housing",
    });
    state = dispatch(
      state,
      {
        type: "set_expense_category_subtotal",
        category: "housing",
        patch: {
          current_monthly_cents: 300_000,
          interruption_monthly_cents: 200_000,
        },
      },
      "housing-subtotal",
    ).state;
    state = dispatch(
      state,
      { type: "complete_expense_category", category: "housing" },
      "complete-housing",
    ).state;

    const expenses = state.renderModel;
    expect(expenses).toMatchObject({
      kind: "expenses",
      activeCategory: null,
      completedCategories: ["housing"],
      totals: { current: 300_000, interruption: 200_000 },
    });
    if (expenses.kind !== "expenses") throw new Error("expected Expenses render model");
    expect(expenses.categories.find((item) => item.category === "housing")).toEqual({
      category: "housing",
      mode: "subtotal",
      currentMonthlyCents: 300_000,
      interruptionMonthlyCents: 200_000,
      completed: true,
    });

    const restored = restoreHouseholdRunwayInterview(state);
    expect(restored.renderModel).toEqual(state.renderModel);
  });

  it("restores the current nested category when navigating backward through applicable stages", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "open-housing-for-back",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_category_subtotal",
        category: "housing",
        patch: { current_monthly_cents: 250_000 },
      },
      "housing-progress-for-back",
    ).state;

    const restored = restoreHouseholdRunwayInterview(state);
    expect(restored.stage).toBe("expenses");
    expect(restored.renderModel).toMatchObject({
      kind: "expenses",
      activeCategory: "housing",
      categorySubtotals: {
        housing: { current_monthly_cents: 250_000 },
      },
    });

    state = dispatch(state, { type: "back" }, "back-to-cash").state;
    state = dispatch(state, { type: "continue" }, "forward-to-assets").state;
    state = dispatch(state, { type: "skip" }, "skip-assets-again").state;
    expect(state.renderModel).toMatchObject({
      kind: "expenses",
      activeCategory: "housing",
      categorySubtotals: {
        housing: { current_monthly_cents: 250_000 },
      },
    });
  });

  it("supports itemized guided entry and quick entry through semantic commands", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "transportation" },
      "open-transportation",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_category_mode",
        category: "transportation",
        mode: "itemized",
      },
      "transportation-itemized",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_item",
        category: "transportation",
        itemType: "fuel_charging",
        itemId: "fuel-1",
        patch: { current_amount_cents: 50_000 },
      },
      "fuel-entry",
    ).state;
    state = dispatch(
      state,
      { type: "complete_expense_category", category: "transportation" },
      "complete-transportation",
    ).state;
    expect(state.draft.answers.expense_items[0]).toMatchObject({
      id: "fuel-1",
      current_amount_cents: 50_000,
      interruption_amount_cents: 50_000,
    });

    state = dispatch(state, { type: "set_expense_mode", mode: "quick" }, "quick-mode").state;
    state = dispatch(
      state,
      {
        type: "set_quick_expenses",
        patch: { current_monthly_cents: 700_000, interruption_monthly_cents: 500_000 },
      },
      "quick-entry",
    ).state;
    expect(state.renderModel).toMatchObject({
      kind: "expenses",
      mode: "quick",
      activeCategory: null,
      quickExpenses: {
        current_monthly_cents: 700_000,
        interruption_monthly_cents: 500_000,
      },
      totals: { current: 700_000, interruption: 500_000 },
    });
  });

  it("updates existing expense items, clears housing inputs on tenure changes, and bounds reductions", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "open-housing",
    ).state;
    state = dispatch(
      state,
      { type: "set_housing_tenure", tenure: "rent" },
      "rent-housing",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_item",
        category: "housing",
        itemType: "rent",
        itemId: "rent-1",
        patch: { current_amount_cents: 250_000 },
      },
      "rent-entry",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_item",
        category: "housing",
        itemType: "rent",
        itemId: "ignored-id",
        patch: { interruption_amount_cents: 100_000 },
      },
      "rent-update",
    ).state;
    expect(state.draft.answers.expense_items).toEqual([
      expect.objectContaining({
        id: "rent-1",
        current_amount_cents: 250_000,
        interruption_amount_cents: 100_000,
      }),
    ]);

    const sameTenure = dispatch(
      state,
      { type: "set_housing_tenure", tenure: "rent" },
      "rent-again",
    );
    expect(sameTenure.state.draft.answers.expense_items).toHaveLength(1);

    state = dispatch(
      sameTenure.state,
      { type: "set_housing_tenure", tenure: "own" },
      "own-housing",
    ).state;
    expect(state.draft.answers.expense_items).toEqual([]);
    expect(state.draft.answers.expense_category_modes.housing).toBeUndefined();

    state = dispatch(
      state,
      { type: "set_expense_mode", mode: "quick" },
      "quick-mode",
    ).state;
    state = dispatch(
      state,
      { type: "set_quick_expenses", patch: { current_monthly_cents: 500_000 } },
      "quick-current",
    ).state;
    state = dispatch(state, { type: "continue" }, "to-reductions").state;
    state = dispatch(
      state,
      { type: "set_reduction", target: { kind: "quick" }, interruptionMonthlyCents: 700_000 },
      "quick-reduction",
    ).state;
    expect(state.draft.answers.quick_expenses.interruption_monthly_cents).toBe(500_000);
  });

  it("bounds a reduction for an existing item and preserves non-housing items", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      {
        type: "set_expense_item",
        category: "transportation",
        itemType: "fuel_charging",
        itemId: "fuel-1",
        patch: { current_amount_cents: 75_000 },
      },
      "transportation-item",
    ).state;
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "open-housing-for-tenure",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_expense_category_subtotal",
        category: "housing",
        patch: { current_monthly_cents: 250_000 },
      },
      "housing-subtotal-for-tenure",
    ).state;
    state = dispatch(
      state,
      { type: "complete_expense_category", category: "housing" },
      "complete-housing-for-tenure",
    ).state;
    state = dispatch(
      state,
      { type: "set_housing_tenure", tenure: "rent" },
      "housing-tenure",
    ).state;
    expect(state.draft.answers.expense_items).toEqual([
      expect.objectContaining({ id: "fuel-1", category: "transportation" }),
    ]);

    state = dispatch(state, { type: "set_active_expense_category", category: "housing" }, "open-housing").state;
    state = dispatch(
      state,
      {
        type: "set_expense_item",
        category: "housing",
        itemType: "rent",
        itemId: "rent-1",
        patch: { current_amount_cents: 250_000 },
      },
      "housing-item",
    ).state;
    state = dispatch(state, { type: "continue" }, "to-reductions").state;
    expect(state.stage).toBe("reductions");

    const reduced = dispatch(
      state,
      {
        type: "set_reduction",
        target: { kind: "item", itemId: "rent-1" },
        interruptionMonthlyCents: 900_000,
      },
      "reduce-rent",
    );
    expect(reduced.state.draft.answers.expense_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rent-1",
          interruption_amount_cents: 250_000,
          confidence: "confirmed",
        }),
      ]),
    );
  });

  it("returns stable ignored outcomes for closed expense targets", () => {
    const state = atExpenses();
    expect(
      dispatch(
        state,
        {
          type: "set_expense_item",
          category: "housing",
          itemType: "not-an-item",
          itemId: "invalid",
          patch: { current_amount_cents: 1 },
        } as never,
        "invalid-item",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "expense_category_not_open" });

    expect(
      dispatch(
        state,
        { type: "complete_expense_category", category: "housing" },
        "closed-category",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "expense_category_not_open" });

    const reductions = dispatch(
      state,
      { type: "set_expense_mode", mode: "quick" },
      "quick-mode-for-ignore",
    ).state;
    const withExpenses = dispatch(
      reductions,
      { type: "set_quick_expenses", patch: { current_monthly_cents: 400_000 } },
      "quick-expenses-for-ignore",
    ).state;
    const atReductions = dispatch(withExpenses, { type: "continue" }, "reductions").state;
    expect(
      dispatch(
        atReductions,
        { type: "set_reduction", target: { kind: "category", category: "housing" }, interruptionMonthlyCents: 1 },
        "missing-category-reduction",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "expense_category_not_open" });
    expect(
      dispatch(
        atReductions,
        { type: "set_reduction", target: { kind: "item", itemId: "missing" }, interruptionMonthlyCents: 1 },
        "missing-item-reduction",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "expense_category_not_open" });
    expect(
      dispatch(
        atReductions,
        { type: "set_reduction", target: { kind: "unknown" }, interruptionMonthlyCents: 1 } as never,
        "unknown-reduction",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "expense_category_not_open" });
  });

  it("keeps forward navigation on stable validation codes and reaches Reviewing only after reductions are ready", () => {
    let state = atExpenses();
    let blocked = dispatch(state, { type: "continue" }, "expenses-required");
    expect(blocked.state.stage).toBe("expenses");
    expect(blocked.state.validationIssue).toEqual({ code: "expenses_current_required" });

    state = dispatch(
      blocked.state,
      { type: "set_expense_mode", mode: "quick" },
      "quick-mode",
    ).state;
    state = dispatch(
      state,
      { type: "set_quick_expenses", patch: { current_monthly_cents: 600_000 } },
      "quick-current",
    ).state;
    expect(state.draft.validationIssues.expenses).toBeNull();
    state = dispatch(state, { type: "continue" }, "to-reductions").state;

    state = dispatch(
      state,
      {
        type: "set_reduction",
        target: { kind: "quick" },
        interruptionMonthlyCents: 0,
      },
      "clear-reduction",
    ).state;
    blocked = dispatch(state, { type: "continue" }, "reductions-required");
    expect(blocked.state.stage).toBe("reductions");
    expect(blocked.state.validationIssue).toEqual({
      code: "expenses_interruption_required",
    });

    state = dispatch(
      blocked.state,
      {
        type: "set_reduction",
        target: { kind: "quick" },
        interruptionMonthlyCents: 450_000,
      },
      "reduction-ready",
    ).state;
    state = dispatch(state, { type: "continue" }, "to-review").state;
    expect(state.renderModel).toMatchObject({
      kind: "review",
      stage: "review",
      ready: true,
      blockingIssue: null,
    });
  });

  it("clears downstream validation and nested category position when expense inputs change", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "open-housing",
    ).state;
    state = dispatch(
      state,
      { type: "set_expense_category_subtotal", category: "housing", patch: { current_monthly_cents: 300_000 } },
      "housing-current",
    ).state;
    state = dispatch(
      state,
      { type: "complete_expense_category", category: "housing" },
      "complete-housing",
    ).state;
    state = dispatch(state, { type: "continue" }, "to-reductions").state;
    state = dispatch(
      state,
      {
        type: "set_reduction",
        target: { kind: "category", category: "housing" },
        interruptionMonthlyCents: 0,
      },
      "clear-housing-reduction",
    ).state;
    state = dispatch(state, { type: "continue" }, "blocked-reductions").state;
    expect(state.draft.validationIssues.reductions).toEqual({
      code: "expenses_interruption_required",
    });
    state = dispatch(state, { type: "back" }, "back-to-expenses").state;
    state = dispatch(
      state,
      { type: "set_active_expense_category", category: "housing" },
      "reopen-housing",
    ).state;
    state = dispatch(
      state,
      { type: "set_quick_expenses", patch: { current_monthly_cents: 500_000 } },
      "switch-quick",
    ).state;

    expect(state.draft.activeExpenseCategory).toBeNull();
    expect(state.draft.validationIssues.expenses).toBeNull();
    expect(state.draft.validationIssues.reductions).toBeNull();
    expect(state.draft.validationIssues.review).toBeNull();
  });

  it("blocks Reviewing until the normalized Draft can produce an Assessment", () => {
    let state = atExpenses();
    state = dispatch(
      state,
      { type: "set_expense_mode", mode: "quick" },
      "quick-mode-for-review",
    ).state;
    state = dispatch(
      state,
      { type: "set_quick_expenses", patch: { current_monthly_cents: 600_000 } },
      "quick-expenses-for-review",
    ).state;
    state = dispatch(state, { type: "continue" }, "to-reductions-for-review").state;
    state = dispatch(
      state,
      {
        type: "set_reduction",
        target: { kind: "quick" },
        interruptionMonthlyCents: 400_000,
      },
      "reduction-for-review",
    ).state;
    state = dispatch(
      state,
      {
        type: "update_answers",
        patch: {
          extreme_access: {
            illiquid_investments_cents: 1,
            retirement_tax_deferred_cents: 0,
            retirement_tax_free_cents: 0,
          },
        },
      },
      "stale-extreme-access",
    ).state;

    const blocked = dispatch(state, { type: "continue" }, "review-not-ready");
    expect(blocked.state.stage).toBe("reductions");
    expect(blocked.state.validationIssue).toEqual({
      code: "assessment_required",
    });
    expect(blocked.state.renderModel).toMatchObject({
      kind: "reductions",
      blockingIssue: { code: "assessment_required" },
    });
  });
});
