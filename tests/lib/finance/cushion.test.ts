import { describe, expect, it } from "vitest";
import {
  availableScenarios,
  applyExpenseReduction,
  createDefaultRunwayAnswers,
  createDraftEnvelope,
  estimateMonthlyTakeHome,
  expenseTotals,
  migrateRunwayAnswers,
  normalizeExpenseToMonthly,
  parseDraftEnvelope,
  simulateHouseholdRunway,
  toFinanceCushionView,
  withCurrentLifestyleExpenses,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";

function runway(overrides?: Partial<HouseholdRunwayAnswers>) {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "CA";
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    entered_as: "net",
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: 600_000,
    interruption_monthly_cents: 600_000,
    confidence: "confirmed",
  };
  return Object.assign(answers, overrides);
}

describe("version 4 monthly simulation", () => {
  it("covers five months with $30,000 and a $6,000 burn", () => {
    const result = simulateHouseholdRunway(
      runway(),
      "current",
      undefined,
      new Date("2026-07-26"),
    );
    expect(result.months_covered).toBe(5);
    expect(result.depletion_date).toBe("2026-12-26");
  });

  it("covers fifteen months when $4,000 continues", () => {
    const answers = runway();
    answers.other_income_sources = [{ id: "rent", type: "rental_net", monthly_cents: 400_000, confidence: "confirmed" }];
    expect(simulateHouseholdRunway(answers, "current").months_covered).toBe(15);
  });

  it("calculates and projects a finite runway beyond 120 months", () => {
    const answers = runway();
    answers.available_cash.cents = 90_000_000;
    const result = simulateHouseholdRunway(
      answers,
      "current",
      undefined,
      new Date("2026-07-26"),
    );
    expect(result.months_covered).toBe(150);
    expect(result.depletion_date).toBe("2039-01-26");
    expect(result.months.at(-1)).toMatchObject({
      month: 150,
      closing_balance_cents: 0,
    });
  });

  it("keeps an ultra-long numeric runway without overflowing its date or projection", () => {
    const answers = runway();
    answers.available_cash.cents = 100_000_000_000;
    answers.quick_expenses = {
      current_monthly_cents: 1,
      interruption_monthly_cents: 1,
      confidence: "confirmed",
    };
    const result = simulateHouseholdRunway(answers, "current");
    expect(result.months_covered).toBe(100_000_000_000);
    expect(result.depletion_date).toBeNull();
    expect(result.months.at(-1)).toMatchObject({
      month: 100_000_000_000,
      closing_balance_cents: 0,
    });
    expect(result.months.length).toBeLessThanOrEqual(61);
  });

  it("does not emit Infinity when income covers expenses", () => {
    const answers = runway();
    answers.other_income_sources = [{ id: "rent", type: "rental_net", monthly_cents: 600_000, confidence: "confirmed" }];
    const result = simulateHouseholdRunway(answers, "current");
    expect(result.sustainable).toBe(true);
    expect(result.months_covered).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("projects a growing balance when continuing income exceeds expenses", () => {
    const answers = runway();
    answers.other_income_sources = [{ id: "rent", type: "rental_net", monthly_cents: 700_000, confidence: "confirmed" }];
    const result = simulateHouseholdRunway(answers, "current");
    expect(result.months[0].closing_balance_cents).toBe(3_100_000);
    expect(result.months.at(-1)?.closing_balance_cents).toBe(4_200_000);
  });

  it("keeps one-time funds in What-if instead of the baseline interview", () => {
    const answers = runway();
    answers.available_cash.cents = 0;
    const result = simulateHouseholdRunway(answers, "current", { expected_unconfirmed_funds_cents: 600_000 });
    expect(result.months[0].one_time_funds_cents).toBe(600_000);
    expect(result.months[1].one_time_funds_cents).toBe(0);
    expect(result.months_covered).toBe(1);
  });

  it("includes accessible investments at 100% and excludes other assets", () => {
    const answers = runway();
    answers.assets.liquid_investments = { cents: 600_000, confidence: "confirmed" };
    answers.assets.illiquid_investments = { cents: 1_200_000, confidence: "confirmed" };
    answers.assets.home_equity = { cents: 20_000_000, confidence: "confirmed" };
    answers.assets.retirement_tax_deferred = { cents: 3_000_000, confidence: "confirmed" };
    answers.assets.retirement_tax_free = { cents: 1_800_000, confidence: "confirmed" };
    const baseline = simulateHouseholdRunway(answers, "current");
    expect(baseline.months_covered).toBe(6);
    expect(baseline.excluded_assets_cents).toBe(26_000_000);
    const extreme = simulateHouseholdRunway(answers, "current", {
      usable_illiquid_investments_cents: 300_000,
      usable_retirement_tax_deferred_cents: 600_000,
      usable_retirement_tax_free_cents: 900_000,
    });
    expect(extreme.starting_resources_cents).toBe(5_400_000);
  });

  it("normalizes quarterly and annual expenses and keeps reductions separate", () => {
    expect(normalizeExpenseToMonthly(120_000, "annual")).toBe(10_000);
    expect(normalizeExpenseToMonthly(120_000, "quarterly")).toBe(40_000);
    const answers = runway();
    answers.expense_mode = "guided";
    answers.expense_category_modes = { housing: "itemized", food: "itemized" };
    answers.expense_items = [
      { id: "tax", category: "housing", type: "property_tax", current_amount_cents: 1_200_000, interruption_amount_cents: 1_200_000, frequency: "annual", confidence: "confirmed" },
      { id: "food", category: "food", type: "groceries", current_amount_cents: 100_000, interruption_amount_cents: 70_000, frequency: "monthly", confidence: "confirmed" },
    ];
    expect(expenseTotals(answers)).toEqual({ current: 200_000, interruption: 170_000 });
  });

  it("applies What-if reductions to category subtotals and itemized costs", () => {
    const answers = runway();
    answers.expense_mode = "guided";
    answers.expense_category_modes = { housing: "subtotal", food: "itemized" };
    answers.expense_category_subtotals = {
      housing: {
        current_monthly_cents: 400_000,
        interruption_monthly_cents: 350_000,
        confidence: "confirmed",
      },
    };
    answers.expense_items = [{
      id: "food",
      category: "food",
      type: "groceries",
      current_amount_cents: 100_000,
      interruption_amount_cents: 90_000,
      frequency: "monthly",
      confidence: "confirmed",
    }];
    const reduced = applyExpenseReduction(answers, 400_000);
    expect(expenseTotals(reduced).interruption).toBe(40_000);
    expect(reduced.expense_category_subtotals.housing?.interruption_monthly_cents).toBe(0);
    expect(reduced.expense_items[0].interruption_amount_cents).toBe(40_000);
    expect(expenseTotals(answers).interruption).toBe(440_000);
  });

  it("restores subtotal and itemized costs for the current-lifestyle comparison", () => {
    const answers = runway();
    answers.expense_mode = "guided";
    answers.expense_category_modes = { housing: "subtotal", food: "itemized" };
    answers.expense_category_subtotals = {
      housing: {
        current_monthly_cents: 400_000,
        interruption_monthly_cents: 250_000,
        confidence: "confirmed",
      },
    };
    answers.expense_items = [{
      id: "food",
      category: "food",
      type: "groceries",
      current_amount_cents: 100_000,
      interruption_amount_cents: 60_000,
      frequency: "monthly",
      confidence: "confirmed",
    }];
    expect(expenseTotals(withCurrentLifestyleExpenses(answers))).toEqual({
      current: 500_000,
      interruption: 500_000,
    });
  });

  it("caps explicit extreme-mode amounts and never mutates baseline answers", () => {
    const answers = runway();
    answers.assets.retirement_tax_free.cents = 100_000;
    const before = JSON.stringify(answers);
    const preview = simulateHouseholdRunway(answers, "current", {
      usable_retirement_tax_free_cents: 500_000,
      added_cash_cents: 600_000,
    });
    expect(preview.starting_resources_cents).toBe(3_700_000);
    expect(JSON.stringify(answers)).toBe(before);
  });
});

describe("adaptive scenarios", () => {
  it("shows three scenarios for two working adults", () => {
    const answers = runway();
    answers.mine = { ...answers.mine, employment: "employed", monthly_take_home_cents: 500_000 };
    answers.partner = { ...answers.mine, monthly_take_home_cents: 400_000 };
    expect(availableScenarios(answers).map((item) => item.id)).toEqual(["mine_stops", "partner_stops", "both_stop"]);
  });

  it("does not invent a partner scenario", () => {
    const answers = runway();
    answers.mine = { ...answers.mine, employment: "employed", monthly_take_home_cents: 500_000 };
    expect(availableScenarios(answers).map((item) => item.id)).toEqual(["mine_stops"]);
  });
});

describe("estimates, drafts, and migration", () => {
  it("preserves retained cushion inputs as reviewable versioned answers", () => {
    const view = toFinanceCushionView({
      id: "plan-1",
      user_id: "user-1",
      liquid_resources_cents: 900_000,
      monthly_essential_expenses_cents: 300_000,
      monthly_continuing_income_cents: 50_000,
      answers: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    });

    expect(view.answers).toMatchObject({
      schema_version: 4,
      region: "",
      available_cash: { cents: 900_000, confidence: "confirmed" },
      expense_mode: "quick",
      quick_expenses: {
        current_monthly_cents: 300_000,
        interruption_monthly_cents: 300_000,
      },
      other_income_sources: [{ monthly_cents: 50_000 }],
    });
  });

  it("separates 2026 US federal, state, Social Security, and Medicare estimates", () => {
    const estimate = estimateMonthlyTakeHome({ country: "US", region: "CA", amountCents: 12_000_000, period: "annual", filingStatus: "single" });
    expect(estimate.annual_federal_income_tax_cents).toBe(1_757_000);
    expect(estimate.annual_state_income_tax_cents).toBe(623_400);
    expect(estimate.annual_social_security_cents).toBe(744_000);
    expect(estimate.annual_medicare_cents).toBe(174_000);
    expect(estimate.state_is_rough_estimate).toBe(true);
  });

  it.each([["US", "CA"], ["CA", "QC"], ["CN", "BJ"], ["TW", "TPE"]] as const)(
    "returns a transparent %s estimate",
    (country, region) => {
      const estimate = estimateMonthlyTakeHome({ country, region, amountCents: 12_000_000, period: "annual" });
      expect(estimate.monthly_take_home_cents).toBeGreaterThan(0);
      expect(estimate.monthly_gross_cents - estimate.monthly_estimated_deductions_cents).toBe(estimate.monthly_take_home_cents);
      expect(estimate.rule_version).toContain(country.toLowerCase());
      expect(estimate.annual_federal_income_tax_cents).toBeGreaterThanOrEqual(0);
    },
  );

  it("restores stable step IDs and expires after 30 days", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const envelope = createDraftEnvelope(runway(), "assets", false, now);
    expect(parseDraftEnvelope(JSON.stringify(envelope), now)?.step_id).toBe("assets");
    expect(parseDraftEnvelope(JSON.stringify(envelope), new Date("2026-08-26T00:00:00.000Z"))).toBeNull();
  });

  it("restores an in-progress location draft before a region is selected", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const envelope = createDraftEnvelope(createDefaultRunwayAnswers(now), "location", false, now);
    expect(parseDraftEnvelope(JSON.stringify(envelope), now)?.answers.region).toBe("");
  });

  it("discards malformed current-version drafts instead of trusting their shape", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const malformed = {
      version: 4,
      expires_at: "2026-08-01T00:00:00.000Z",
      step_id: "result",
      completed: true,
      answers: { schema_version: 4, country: "US" },
    };
    expect(parseDraftEnvelope(JSON.stringify(malformed), now)).toBeNull();
  });

  it("maps removed version 3 steps forward and drops old baseline inflows", () => {
    const oldAnswers = { ...runway(), schema_version: 3, confirmed_funds: [{ id: "old", amount_cents: 100_000, arrives_month: 2, confidence: "confirmed" }], temporary_income: { monthly_cents: 50_000, remaining_months: 2, confidence: "confirmed" } };
    const parsed = parseDraftEnvelope(JSON.stringify({ version: 3, expires_at: "2026-08-01T00:00:00.000Z", step_id: "confirmedFunds", completed: false, answers: oldAnswers }), new Date("2026-07-26T00:00:00.000Z"));
    expect(parsed?.step_id).toBe("assets");
    expect(parsed?.answers).not.toHaveProperty("confirmed_funds");
    expect(parsed?.answers).not.toHaveProperty("temporary_income");
  });

  it("discards malformed nested version 3 data after migration", () => {
    const oldAnswers = {
      ...runway(),
      schema_version: 3,
      other_income_sources: [{ id: "broken", type: "other" }],
    };
    expect(migrateRunwayAnswers(oldAnswers)).toBeNull();
  });

  it("migrates version 2 totals, investments, retirement, income, and region", () => {
    const migrated = migrateRunwayAnswers({
      schema_version: 2, country: "US", region: "California", shares_finances: false,
      mine: runway().mine, partner: null,
      other_monthly_income: { cents: 40_000, confidence: "confirmed" },
      available_cash: { cents: 100_000, confidence: "confirmed" }, confirmed_funds: [],
      taxable_investments: { cents: 200_000, confidence: "confirmed" },
      retirement_accounts: { cents: 300_000, confidence: "confirmed" },
      home_equity: { cents: 400_000, confidence: "confirmed" },
      expenses: { housing: { current_cents: 60_000, interruption_cents: 50_000, confidence: "confirmed" } },
      temporary_income: null,
    });
    expect(migrated).toMatchObject({ schema_version: 4, region: "CA", expense_mode: "quick" });
    expect(migrated?.assets.liquid_investments.cents).toBe(200_000);
    expect(migrated?.assets.retirement_tax_deferred.confidence).toBe("needs_review");
    expect(migrated?.other_income_sources).toHaveLength(1);
  });
});
