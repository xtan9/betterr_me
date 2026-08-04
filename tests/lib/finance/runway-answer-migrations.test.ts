import { describe, expect, it } from "vitest";
import { migrateRunwayAnswers } from "@/lib/finance/runway-answer-migrations";

const legacyIncome = {
  employment: "unemployed",
  monthly_take_home_cents: 0,
  entered_as: "net",
  confidence: "confirmed",
};

describe("Household Runway shared answer migration contract", () => {
  it("discards malformed nested version 3 data", () => {
    expect(
      migrateRunwayAnswers({
        schema_version: 3,
        country: "US",
        region: "CA",
        mine: legacyIncome,
        partner: null,
        other_income_sources: [{ id: "broken", type: "other" }],
      }),
    ).toBeNull();
  });

  it("migrates version 2 totals, investments, retirement, income, and region", () => {
    const migrated = migrateRunwayAnswers({
      schema_version: 2,
      country: "US",
      region: "California",
      shares_finances: false,
      mine: legacyIncome,
      partner: null,
      other_monthly_income: { cents: 40_000, confidence: "confirmed" },
      available_cash: { cents: 100_000, confidence: "confirmed" },
      confirmed_funds: [],
      taxable_investments: { cents: 200_000, confidence: "confirmed" },
      retirement_accounts: { cents: 300_000, confidence: "confirmed" },
      home_equity: { cents: 400_000, confidence: "confirmed" },
      expenses: {
        housing: {
          current_cents: 60_000,
          interruption_cents: 50_000,
          confidence: "confirmed",
        },
      },
      temporary_income: null,
    });

    expect(migrated).toMatchObject({
      schema_version: 4,
      region: "CA",
      expense_mode: "quick",
    });
    expect(migrated?.assets.liquid_investments.cents).toBe(200_000);
    expect(migrated?.assets.retirement_tax_deferred.confidence).toBe("needs_review");
    expect(migrated?.other_income_sources).toHaveLength(1);
  });
});
