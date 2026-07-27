import { describe, expect, it } from "vitest";
import {
  availableScenarios,
  calculateCushion,
  createDefaultRunwayAnswers,
  createDraftEnvelope,
  estimateMonthlyTakeHome,
  expenseTotals,
  migrateRunwayAnswers,
  normalizeExpenseToMonthly,
  parseDollarsToCents,
  parseDraftEnvelope,
  simulateHouseholdRunway,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";

const inputs = (resources: number, expenses: number, income = 0) => ({
  liquid_resources_cents: resources,
  monthly_essential_expenses_cents: expenses,
  monthly_continuing_income_cents: income,
});

describe("legacy cushion calculation", () => {
  it.each([
    [299, 100, 2.99, "urgent"],
    [300, 100, 3, "building"],
    [600, 100, 6, "stronger"],
  ])("classifies %s / %s", (resources, expenses, months, state) => {
    const result = calculateCushion(inputs(resources, expenses));
    expect(result.months_covered).toBe(months);
    expect(result.planning_state).toBe(state);
  });

  it("uses a sustainable result when continuing income covers costs", () => {
    expect(calculateCushion(inputs(0, 400, 400)).months_covered).toBeNull();
  });
});

describe("parseDollarsToCents", () => {
  it.each([["0", 0], ["12.3", 1230], ["1,000.00", 100000]])(
    "parses %s",
    (value, expected) => expect(parseDollarsToCents(value)).toBe(expected),
  );
  it.each(["", "-1", "1.234", "one"])("rejects %s", (value) => {
    expect(parseDollarsToCents(value)).toBeNull();
  });
});

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

describe("version 3 monthly simulation", () => {
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

  it("does not emit Infinity when income covers expenses", () => {
    const answers = runway();
    answers.other_income_sources = [{ id: "rent", type: "rental_net", monthly_cents: 600_000, confidence: "confirmed" }];
    const result = simulateHouseholdRunway(answers, "current");
    expect(result.sustainable).toBe(true);
    expect(result.months_covered).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("adds confirmed funds in the selected month and temporary income only for its duration", () => {
    const answers = runway();
    answers.available_cash.cents = 0;
    answers.confirmed_funds = [{ id: "severance", amount_cents: 600_000, arrives_month: 2, confidence: "confirmed" }];
    answers.temporary_income = { monthly_cents: 600_000, remaining_months: 2, confidence: "confirmed" };
    const result = simulateHouseholdRunway(answers, "current");
    expect(result.months[0].confirmed_funds_cents).toBe(0);
    expect(result.months[1].confirmed_funds_cents).toBe(600_000);
    expect(result.months[2].temporary_income_cents).toBe(0);
    expect(result.months_covered).toBe(3);
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
    answers.expense_items = [
      { id: "tax", category: "housing", type: "property_tax", current_amount_cents: 1_200_000, interruption_amount_cents: 1_200_000, frequency: "annual", confidence: "confirmed" },
      { id: "food", category: "food", type: "groceries", current_amount_cents: 100_000, interruption_amount_cents: 70_000, frequency: "monthly", confidence: "confirmed" },
    ];
    expect(expenseTotals(answers)).toEqual({ current: 200_000, interruption: 170_000 });
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
  it.each([["US", "CA"], ["CA", "QC"], ["CN", "BJ"], ["TW", "TPE"]] as const)(
    "returns a transparent %s estimate",
    (country, region) => {
      const estimate = estimateMonthlyTakeHome({ country, region, amountCents: 12_000_000, period: "annual" });
      expect(estimate.monthly_take_home_cents).toBeGreaterThan(0);
      expect(estimate.monthly_gross_cents - estimate.monthly_estimated_deductions_cents).toBe(estimate.monthly_take_home_cents);
      expect(estimate.rule_version).toContain(country.toLowerCase());
    },
  );

  it("restores stable step IDs and expires after 30 days", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const envelope = createDraftEnvelope(runway(), "assets", false, now);
    expect(parseDraftEnvelope(JSON.stringify(envelope), now)?.step_id).toBe("assets");
    expect(parseDraftEnvelope(JSON.stringify(envelope), new Date("2026-08-26T00:00:00.000Z"))).toBeNull();
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
    expect(migrated).toMatchObject({ schema_version: 3, region: "CA", expense_mode: "quick" });
    expect(migrated?.assets.liquid_investments.cents).toBe(200_000);
    expect(migrated?.assets.retirement_tax_deferred.confidence).toBe("needs_review");
    expect(migrated?.other_income_sources).toHaveLength(1);
  });
});
