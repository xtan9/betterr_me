import { describe, expect, it } from "vitest";
import {
  availableScenarios,
  calculateCushion,
  createDefaultRunwayAnswers,
  createDraftEnvelope,
  estimateMonthlyTakeHome,
  parseDollarsToCents,
  parseDraftEnvelope,
  simulateHouseholdRunway,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";

const inputs = (
  liquidResources: number,
  essentialExpenses: number,
  continuingIncome = 0,
) => ({
  liquid_resources_cents: liquidResources,
  monthly_essential_expenses_cents: essentialExpenses,
  monthly_continuing_income_cents: continuingIncome,
});

describe("calculateCushion", () => {
  it.each([
    {
      name: "less than three months",
      input: inputs(299, 100),
      months: 2.99,
      state: "urgent",
    },
    {
      name: "exactly three months",
      input: inputs(300, 100),
      months: 3,
      state: "building",
    },
    {
      name: "just under six months",
      input: inputs(599, 100),
      months: 5.99,
      state: "building",
    },
    {
      name: "exactly six months",
      input: inputs(600, 100),
      months: 6,
      state: "stronger",
    },
  ])("$name uses the expected planning state", ({ input, months, state }) => {
    const result = calculateCushion(input);

    expect(result.months_covered).toBe(months);
    expect(result.planning_state).toBe(state);
    expect(result.monthly_shortfall_cents).toBe(100);
  });

  it("subtracts only the income the user says will continue", () => {
    const result = calculateCushion(inputs(600, 400, 100));

    expect(result.monthly_shortfall_cents).toBe(300);
    expect(result.months_covered).toBe(2);
    expect(result.planning_state).toBe("urgent");
  });

  it("uses the stronger planning state when there is no monthly shortfall", () => {
    const result = calculateCushion(inputs(0, 400, 400));

    expect(result.monthly_shortfall_cents).toBe(0);
    expect(result.months_covered).toBeNull();
    expect(result.planning_state).toBe("stronger");
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["0", 0],
    ["12.3", 1230],
    ["12.34", 1234],
    ["1,000.00", 100000],
  ])("parses %s into integer cents", (value, expected) => {
    expect(parseDollarsToCents(value)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "12.3.4", "one"])(
    "rejects invalid amount %s",
    (value) => {
      expect(parseDollarsToCents(value)).toBeNull();
    },
  );
});

function runway(overrides?: Partial<HouseholdRunwayAnswers>) {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "California";
  answers.mine = {
    employment: "unemployed",
    monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    entered_period: "monthly",
    entered_as: "net",
    confidence: "confirmed",
    take_home_reviewed: true,
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expenses.other = {
    current_cents: 600_000,
    interruption_cents: 600_000,
    confidence: "confirmed",
  };
  return Object.assign(answers, overrides);
}

describe("simulateHouseholdRunway", () => {
  it("covers five months with $30,000 and a $6,000 monthly burn", () => {
    const result = simulateHouseholdRunway(
      runway(),
      "current",
      undefined,
      new Date("2026-07-26"),
    );

    expect(result.months_covered).toBe(5);
    expect(result.depletion_date).toBe("2026-12-26");
  });

  it("covers fifteen months when $4,000 continues against $6,000 expenses", () => {
    const answers = runway();
    answers.other_monthly_income = { cents: 400_000, confidence: "confirmed" };

    expect(simulateHouseholdRunway(answers, "current").months_covered).toBe(15);
  });

  it("uses a sustainable state instead of Infinity when continuing income covers expenses", () => {
    const answers = runway();
    answers.other_monthly_income = { cents: 600_000, confidence: "confirmed" };
    const result = simulateHouseholdRunway(answers, "current");

    expect(result.sustainable).toBe(true);
    expect(result.months_covered).toBeNull();
    expect(result.depletion_date).toBeNull();
  });

  it("adds confirmed funds only in their stated arrival month", () => {
    const answers = runway();
    answers.available_cash.cents = 1_200_000;
    answers.confirmed_funds = [
      {
        id: "severance",
        amount_cents: 1_200_000,
        arrives_month: 2,
        confidence: "confirmed",
      },
    ];
    const result = simulateHouseholdRunway(answers, "current");

    expect(result.months[0].confirmed_funds_cents).toBe(0);
    expect(result.months[1].confirmed_funds_cents).toBe(1_200_000);
    expect(result.months_covered).toBe(4);
  });

  it("stops temporary income after the stated remaining months", () => {
    const answers = runway();
    answers.available_cash.cents = 0;
    answers.temporary_income = {
      monthly_cents: 600_000,
      remaining_months: 2,
      confidence: "confirmed",
    };
    const result = simulateHouseholdRunway(answers, "current");

    expect(
      result.months.slice(0, 2).map((month) => month.temporary_income_cents),
    ).toEqual([600_000, 600_000]);
    expect(result.months[2].temporary_income_cents).toBe(0);
    expect(result.months_covered).toBe(2);
  });

  it("excludes retirement accounts and home equity unless extreme mode is enabled", () => {
    const answers = runway();
    answers.retirement_accounts = { cents: 5_000_000, confidence: "confirmed" };
    answers.home_equity = { cents: 20_000_000, confidence: "confirmed" };
    const baseline = simulateHouseholdRunway(answers, "current");
    const extreme = simulateHouseholdRunway(answers, "current", {
      include_retirement: true,
    });

    expect(baseline.months_covered).toBe(5);
    expect(baseline.excluded_assets_cents).toBe(25_000_000);
    expect(extreme.starting_resources_cents).toBe(6_500_000);
    expect(extreme.excluded_assets_cents).toBe(20_000_000);
  });

  it("previews What-if inputs without mutating the saved baseline", () => {
    const answers = runway();
    const before = JSON.stringify(answers);
    const baseline = simulateHouseholdRunway(answers, "current");
    const preview = simulateHouseholdRunway(answers, "current", {
      expense_reduction_cents: 100_000,
      added_cash_cents: 500_000,
    });

    expect(preview.months_covered).toBeGreaterThan(baseline.months_covered!);
    expect(JSON.stringify(answers)).toBe(before);
  });

  it("handles zero cash, zero expenses, and a first-month depletion without NaN or Infinity", () => {
    const firstMonth = runway();
    firstMonth.available_cash.cents = 300_000;
    expect(simulateHouseholdRunway(firstMonth, "current").months_covered).toBe(
      0.5,
    );

    const zeroExpenses = runway();
    zeroExpenses.expenses.other = {
      current_cents: 0,
      interruption_cents: 0,
      confidence: "confirmed",
    };
    const sustainable = simulateHouseholdRunway(zeroExpenses, "current");
    expect(sustainable.sustainable).toBe(true);
    expect(JSON.stringify(sustainable)).not.toMatch(/NaN|Infinity/);
  });
});

describe("adaptive runway scenarios", () => {
  it("shows all three interruption scenarios for a dual-income household", () => {
    const answers = runway();
    answers.mine = {
      ...answers.mine,
      employment: "employed",
      monthly_take_home_cents: 500_000,
    };
    answers.partner = { ...answers.mine, monthly_take_home_cents: 400_000 };

    expect(availableScenarios(answers).map((scenario) => scenario.id)).toEqual([
      "mine_stops",
      "partner_stops",
      "both_stop",
    ]);
  });

  it("does not invent a partner scenario for a single adult", () => {
    const answers = runway();
    answers.mine = {
      ...answers.mine,
      employment: "employed",
      monthly_take_home_cents: 500_000,
    };

    expect(availableScenarios(answers).map((scenario) => scenario.id)).toEqual([
      "mine_stops",
    ]);
  });
});

describe("versioned estimates and anonymous drafts", () => {
  it.each(["US", "CA", "CN", "TW"] as const)(
    "returns a versioned %s take-home estimate",
    (country) => {
      const estimate = estimateMonthlyTakeHome({
        country,
        region: "test",
        amountCents: 12_000_000,
        period: "annual",
      });
      expect(estimate.monthlyTakeHomeCents).toBeGreaterThan(0);
      expect(estimate.ruleVersion).toContain(country.toLowerCase());
    },
  );

  it("restores a current draft and expires it after 30 days", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const envelope = createDraftEnvelope(runway(), 7, false, now);

    expect(parseDraftEnvelope(JSON.stringify(envelope), now)?.step).toBe(7);
    expect(
      parseDraftEnvelope(
        JSON.stringify(envelope),
        new Date("2026-08-26T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      parseDraftEnvelope(JSON.stringify({ ...envelope, version: 1 }), now),
    ).toBeNull();
  });
});
