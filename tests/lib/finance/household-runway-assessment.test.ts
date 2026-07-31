import { afterEach, describe, expect, it, vi } from "vitest";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";

function validAnswers(
  overrides: Partial<HouseholdRunwayAnswers> = {},
): HouseholdRunwayAnswers {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "CA";
  answers.mine = {
    ...answers.mine,
    employment: "employed",
    monthly_take_home_cents: 500_000,
    entered_as: "net",
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.partner = {
    ...answers.mine,
    monthly_take_home_cents: 400_000,
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: 600_000,
    interruption_monthly_cents: 500_000,
    confidence: "confirmed",
  };
  return Object.assign(answers, overrides);
}

describe("Household Runway Assessment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return the complete supported scenario set in stable order", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      startDate: new Date("2026-07-26"),
    });

    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.scenarios.map(({ scenario }) => scenario)).toEqual([
      "mine_stops",
      "partner_stops",
      "both_stop",
    ]);
    expect(
      outcome.scenarios.map(({ baseline }) => baseline.scenario),
    ).toEqual(["mine_stops", "partner_stops", "both_stop"]);
    expect(outcome.firstScenario).toBe(outcome.scenarios[0]);
    expect(outcome.adjustments).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
  });

  it("should derive each comparison and adjustment from the same scenario inputs", () => {
    const answers = validAnswers();
    answers.assets.retirement_tax_free = {
      cents: 1_000_000,
      confidence: "confirmed",
    };
    answers.extreme_access.retirement_tax_free_cents = 600_000;

    const outcome = assessHouseholdRunway({
      answers,
      adjustments: {
        added_cash_cents: 1_000_000,
        expense_reduction_cents: 100_000,
      },
      startDate: new Date("2026-07-26"),
    });

    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    const mineStops = outcome.scenarios[0];
    expect(mineStops).toMatchObject({
      scenario: "mine_stops",
      baseline: {
        continuing_monthly_income_cents: 400_000,
        interruption_expenses_cents: 500_000,
        months_covered: 30,
      },
      comparisons: {
        currentLifestyle: {
          continuing_monthly_income_cents: 400_000,
          interruption_expenses_cents: 600_000,
          months_covered: 15,
        },
        interruptionPlan: {
          months_covered: 30,
        },
        extremeMode: {
          starting_resources_cents: 3_600_000,
          months_covered: 36,
        },
      },
      adjusted: {
        continuing_monthly_income_cents: 400_000,
        interruption_expenses_cents: 400_000,
        sustainable: true,
      },
    });
  });

  it("should use one normalized interpretation of inputs throughout the outcome", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers({ region: " CA " }),
    });

    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.answers.region).toBe("CA");
    expect(outcome.scenarios[0].baseline.confidence).toBe("complete");
    expect(
      outcome.scenarios[0].comparisons.interruptionPlan,
    ).toBe(outcome.scenarios[0].baseline);
  });

  it("should derive advice from the adjusted result", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      adjustments: { expense_reduction_cents: 100_000 },
    });

    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(outcome.scenarios[0]).toMatchObject({
      adjusted: { sustainable: true },
      advice: {
        targetMonths: 6,
        cashGapCents: 0,
        largestReducibleCategory: {
          category: "other",
          reducible: 100_000,
        },
      },
    });
  });

  it("should include expected funds when deriving advice from the adjusted result", () => {
    const answers = validAnswers();
    answers.available_cash.cents = 0;

    const outcome = assessHouseholdRunway({
      answers,
      adjustments: { expected_unconfirmed_funds_cents: 3_000_000 },
    });

    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    const bothStop = outcome.scenarios.find(
      ({ scenario }) => scenario === "both_stop",
    );
    expect(bothStop).toMatchObject({
      adjusted: {
        starting_resources_cents: 0,
        months_covered: 6,
      },
      advice: {
        targetMonths: 6,
        cashGapCents: 0,
      },
    });
  });

  it("should return validation failures for invalid answers or adjustments", () => {
    const invalidAnswers = {
      ...validAnswers(),
      available_cash: { cents: -1, confidence: "confirmed" },
    };

    const invalidInput = assessHouseholdRunway({
      answers: invalidAnswers,
      adjustments: { added_cash_cents: -1 },
    });

    expect(invalidInput).toEqual({
      success: false,
      validationIssues: [
        {
          path: ["answers", "available_cash", "cents"],
          message: "Number must be greater than or equal to 0",
        },
        {
          path: ["adjustments", "added_cash_cents"],
          message: "Number must be greater than or equal to 0",
        },
      ],
    });
  });

  it("should return a validation failure for an invalid start date", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      startDate: new Date(Number.NaN),
    });

    expect(outcome).toEqual({
      success: false,
      validationIssues: [
        {
          path: ["startDate"],
          message: "Invalid date",
        },
      ],
    });
  });

  it("should accept adjustments exactly at the normalized expense and asset balances", () => {
    const answers = validAnswers();
    answers.assets.illiquid_investments.cents = 700_000;
    answers.assets.retirement_tax_deferred.cents = 800_000;
    answers.assets.retirement_tax_free.cents = 900_000;

    const outcome = assessHouseholdRunway({
      answers,
      adjustments: {
        expense_reduction_cents: 500_000,
        usable_illiquid_investments_cents: 700_000,
        usable_retirement_tax_deferred_cents: 800_000,
        usable_retirement_tax_free_cents: 900_000,
      },
    });

    expect(outcome.success).toBe(true);
  });

  it.each([
    [
      "expense_reduction_cents",
      500_001,
      "Expense reduction cannot exceed interruption expenses",
    ],
    [
      "usable_illiquid_investments_cents",
      700_001,
      "Usable amount cannot exceed the entered balance",
    ],
    [
      "usable_retirement_tax_deferred_cents",
      800_001,
      "Usable amount cannot exceed the entered balance",
    ],
    [
      "usable_retirement_tax_free_cents",
      900_001,
      "Usable amount cannot exceed the entered balance",
    ],
  ] as const)(
    "should reject %s above its applied boundary",
    (field, value, message) => {
      const answers = validAnswers();
      answers.assets.illiquid_investments.cents = 700_000;
      answers.assets.retirement_tax_deferred.cents = 800_000;
      answers.assets.retirement_tax_free.cents = 900_000;

      const outcome = assessHouseholdRunway({
        answers,
        adjustments: { [field]: value },
      });

      expect(outcome).toEqual({
        success: false,
        validationIssues: [
          {
            path: ["adjustments", field],
            message,
          },
        ],
      });
    },
  );

  it("should validate expense reductions against normalized guided expenses", () => {
    const answers = validAnswers();
    answers.expense_mode = "guided";
    answers.expense_items = [
      {
        id: "annual-rent",
        category: "housing",
        type: "rent",
        current_amount_cents: 1_200_000,
        interruption_amount_cents: 1_200_000,
        frequency: "annual",
        confidence: "confirmed",
      },
    ];

    const atBoundary = assessHouseholdRunway({
      answers,
      adjustments: { expense_reduction_cents: 100_000 },
    });
    const aboveBoundary = assessHouseholdRunway({
      answers,
      adjustments: { expense_reduction_cents: 100_001 },
    });

    expect(atBoundary.success).toBe(true);
    expect(aboveBoundary).toEqual({
      success: false,
      validationIssues: [
        {
          path: ["adjustments", "expense_reduction_cents"],
          message: "Expense reduction cannot exceed interruption expenses",
        },
      ],
    });
  });

  it("should derive an omitted startDate from the versioned answers", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-26T00:00:00.000Z");
    const now = vi.spyOn(Date, "now");
    try {
      const outcome = assessHouseholdRunway({ answers: validAnswers() });
      const explicitDateOutcome = assessHouseholdRunway({
        answers: validAnswers(),
        startDate: new Date("2026-07-26T00:00:00.000Z"),
      });

      expect(now).not.toHaveBeenCalled();
      expect(outcome.success).toBe(true);
      expect(explicitDateOutcome.success).toBe(true);
      if (!outcome.success || !explicitDateOutcome.success) return;
      const datesFor = (scenario: (typeof outcome.scenarios)[number]) => [
        scenario.baseline.depletion_date,
        scenario.adjusted.depletion_date,
        scenario.comparisons.currentLifestyle.depletion_date,
        scenario.comparisons.extremeMode.depletion_date,
      ];
      expect(outcome.scenarios.map(datesFor)).toEqual(
        explicitDateOutcome.scenarios.map(datesFor),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
