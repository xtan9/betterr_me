import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
  type RunwaySimulation,
} from "@/lib/finance/cushion";
import {
  applyHouseholdRunwayPlanAdjustment,
  emptyHouseholdRunwayPlanAdjustment,
  getHouseholdRunwayPlanAdjustmentLimits,
  isHouseholdRunwayPlanAdjustmentActive,
  normalizeHouseholdRunwayPlanAdjustmentIntent,
  normalizeStoredHouseholdRunwayPlanAdjustment,
  projectHouseholdRunwayPlanAdjustment,
  validateHouseholdRunwayPlanAdjustment,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

const occurredAt = "2026-08-08T15:00:00.000Z";
const GLOBAL_MAX_CENTS = 100_000_000_000;

function planInputs(): HouseholdRunwayAnswers {
  const defaults = createDefaultRunwayAnswers(new Date(occurredAt));
  return {
    ...defaults,
    region: "CA",
    mine: {
      ...defaults.mine,
      employment: "unemployed",
      confidence: "confirmed",
      take_home_source: "user_confirmed",
    },
    available_cash: { cents: 3_000_000, confidence: "confirmed" },
    assets: {
      ...defaults.assets,
      illiquid_investments: { cents: 600_000, confidence: "confirmed" },
      retirement_tax_deferred: { cents: 800_000, confidence: "confirmed" },
      retirement_tax_free: { cents: 900_000, confidence: "confirmed" },
    },
    expense_mode: "quick",
    quick_expenses: {
      current_monthly_cents: 600_000,
      interruption_monthly_cents: 400_000,
      confidence: "confirmed",
    },
    extreme_access: {
      illiquid_investments_cents: 100_000,
      retirement_tax_deferred_cents: 200_000,
      retirement_tax_free_cents: 300_000,
    },
    updated_at: occurredAt,
  };
}

function adjustment(
  overrides: Partial<RunwayAdjustments> = {},
): RunwayAdjustments {
  return { ...emptyHouseholdRunwayPlanAdjustment(), ...overrides };
}

function simulation(
  sustainable: boolean,
  monthsCovered: number | null,
): RunwaySimulation {
  return {
    scenario: "current",
    sustainable,
    months_covered: monthsCovered,
    depletion_date: sustainable ? null : "2028-01-01",
    starting_resources_cents: 3_000_000,
    continuing_monthly_income_cents: sustainable ? 400_000 : 0,
    interruption_expenses_cents: 400_000,
    current_expenses_cents: 600_000,
    reducible_expenses_cents: 200_000,
    excluded_assets_cents: 0,
    months: [],
    confidence: "complete",
  };
}

describe("Household Runway Plan Adjustment policy", () => {
  it("constructs zero and identifies active adjustments", () => {
    const empty = emptyHouseholdRunwayPlanAdjustment();

    expect(empty).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
    expect(isHouseholdRunwayPlanAdjustmentActive(empty)).toBe(false);
    expect(
      isHouseholdRunwayPlanAdjustmentActive(
        adjustment({ added_cash_cents: 1 }),
      ),
    ).toBe(true);
  });

  it("derives current relative and global limits without caching plan inputs", () => {
    expect(getHouseholdRunwayPlanAdjustmentLimits(planInputs())).toEqual({
      expense_reduction_cents: 400_000,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: GLOBAL_MAX_CENTS,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 600_000,
      usable_retirement_tax_deferred_cents: 800_000,
      usable_retirement_tax_free_cents: 900_000,
    });
    expect(getHouseholdRunwayPlanAdjustmentLimits(null)).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: GLOBAL_MAX_CENTS,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
  });

  it("normalizes stored values without applying relative limits", () => {
    expect(
      normalizeStoredHouseholdRunwayPlanAdjustment({
        expense_reduction_cents: 900_000.5,
        added_cash_cents: -1,
        added_monthly_income_cents: Number.POSITIVE_INFINITY,
      }),
    ).toEqual(
      adjustment({
        expense_reduction_cents: 900_001,
        added_cash_cents: 0,
        added_monthly_income_cents: 0,
      }),
    );
  });

  it("tolerantly normalizes only known intent fields against current limits", () => {
    const normalized = normalizeHouseholdRunwayPlanAdjustmentIntent({
      patch: {
        expense_reduction_cents: 400_000.5,
        added_cash_cents: GLOBAL_MAX_CENTS + 1,
        added_monthly_income_cents: 2.5,
        expected_unconfirmed_funds_cents: Symbol("hostile"),
        usable_illiquid_investments_cents: 600_001,
        usable_retirement_tax_deferred_cents: -1,
        usable_retirement_tax_free_cents: Number.NaN,
        unknown_field: 123,
      },
      planInputs: planInputs(),
    });

    expect(normalized).toEqual({
      expense_reduction_cents: 400_000,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: 3,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 600_000,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
    expect(
      normalizeHouseholdRunwayPlanAdjustmentIntent({
        patch: {
          expense_reduction_cents: 1,
          added_cash_cents: GLOBAL_MAX_CENTS,
          usable_illiquid_investments_cents: 1,
        },
        planInputs: null,
      }),
    ).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 0,
    });
  });

  it("returns relational violations rather than clamping strict inputs", () => {
    expect(
      validateHouseholdRunwayPlanAdjustment({
        adjustment: adjustment({
          expense_reduction_cents: 400_001,
          usable_illiquid_investments_cents: 600_001,
          usable_retirement_tax_deferred_cents: 800_001,
          usable_retirement_tax_free_cents: 900_001,
        }),
        planInputs: planInputs(),
      }),
    ).toEqual([
      { field: "expense_reduction_cents", limitCents: 400_000 },
      { field: "usable_illiquid_investments_cents", limitCents: 600_000 },
      { field: "usable_retirement_tax_deferred_cents", limitCents: 800_000 },
      { field: "usable_retirement_tax_free_cents", limitCents: 900_000 },
    ]);
  });

  it("applies confirmed mappings and replaces the complete asset allocation", () => {
    const applied = applyHouseholdRunwayPlanAdjustment({
      answers: planInputs(),
      adjustment: adjustment({
        expense_reduction_cents: 100_000,
        added_cash_cents: 200_000,
        added_monthly_income_cents: 50_000,
        expected_unconfirmed_funds_cents: 456_789,
        usable_illiquid_investments_cents: 50_000,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 150_000,
      }),
      occurredAt: "2026-08-09T15:00:00.000Z",
      incomeSourceId: "plan-adjustment-command-1",
    });

    expect(applied.quick_expenses.interruption_monthly_cents).toBe(300_000);
    expect(applied.available_cash).toEqual({
      cents: 3_200_000,
      confidence: "confirmed",
    });
    expect(applied.other_income_sources).toEqual([
      {
        id: "plan-adjustment-command-1",
        type: "other",
        label: "Applied Plan Adjustment",
        monthly_cents: 50_000,
        confidence: "confirmed",
      },
    ]);
    expect(applied.extreme_access).toEqual({
      illiquid_investments_cents: 50_000,
      retirement_tax_deferred_cents: 0,
      retirement_tax_free_cents: 150_000,
    });
    expect(applied.updated_at).toBe("2026-08-09T15:00:00.000Z");
  });

  it("discards expected unconfirmed funds instead of creating durable facts", () => {
    const applied = applyHouseholdRunwayPlanAdjustment({
      answers: planInputs(),
      adjustment: adjustment({ expected_unconfirmed_funds_cents: 456_789 }),
      occurredAt,
      incomeSourceId: "plan-adjustment-expected-only",
    });

    expect(applied).toEqual({ ...planInputs(), updated_at: occurredAt });
  });

  it.each([
    {
      name: "inactive",
      adjustment: emptyHouseholdRunwayPlanAdjustment(),
      baseline: simulation(false, 10),
      preview: simulation(false, 10),
      effect: { kind: "none" },
    },
    {
      name: "both sustainable",
      adjustment: adjustment({ added_cash_cents: 1 }),
      baseline: simulation(true, null),
      preview: simulation(true, null),
      effect: { kind: "none" },
    },
    {
      name: "became sustainable",
      adjustment: adjustment({ added_monthly_income_cents: 1 }),
      baseline: simulation(false, 10),
      preview: simulation(true, null),
      effect: { kind: "becameSustainable" },
    },
    {
      name: "finite zero delta",
      adjustment: adjustment({ added_cash_cents: 1 }),
      baseline: simulation(false, 10),
      preview: simulation(false, 10),
      effect: { kind: "monthsChanged", deltaMonths: 0 },
    },
    {
      name: "incoherent sustainable regression",
      adjustment: adjustment({ added_cash_cents: 1 }),
      baseline: simulation(true, null),
      preview: simulation(false, 10),
      effect: { kind: "none" },
    },
  ] satisfies readonly {
    name: string;
    adjustment: RunwayAdjustments;
    baseline: RunwaySimulation;
    preview: RunwaySimulation;
    effect:
      | { kind: "none" }
      | { kind: "monthsChanged"; deltaMonths: number }
      | { kind: "becameSustainable" };
  }[])("projects $name effect and current field limits", (example) => {
    const projected = projectHouseholdRunwayPlanAdjustment({
      adjustment: example.adjustment,
      planInputs: planInputs(),
      baseline: example.baseline,
      preview: example.preview,
    });

    expect(projected.effect).toEqual(example.effect);
    expect(projected.fields).toMatchObject({
      expenseReduction: {
        valueCents: example.adjustment.expense_reduction_cents,
        minimumCents: 0,
        maximumCents: 400_000,
      },
      addedCash: {
        valueCents: example.adjustment.added_cash_cents,
        minimumCents: 0,
        maximumCents: GLOBAL_MAX_CENTS,
      },
      addedMonthlyIncome: {
        valueCents: example.adjustment.added_monthly_income_cents,
        minimumCents: 0,
        maximumCents: GLOBAL_MAX_CENTS,
      },
      expectedUnconfirmedFunds: {
        valueCents: example.adjustment.expected_unconfirmed_funds_cents,
        minimumCents: 0,
        maximumCents: GLOBAL_MAX_CENTS,
      },
      usableIlliquidInvestments: {
        valueCents: example.adjustment.usable_illiquid_investments_cents,
        minimumCents: 0,
        maximumCents: 600_000,
      },
      usableRetirementTaxDeferred: {
        valueCents: example.adjustment.usable_retirement_tax_deferred_cents,
        minimumCents: 0,
        maximumCents: 800_000,
      },
      usableRetirementTaxFree: {
        valueCents: example.adjustment.usable_retirement_tax_free_cents,
        minimumCents: 0,
        maximumCents: 900_000,
      },
    });
    expect(projected.active).toBe(
      isHouseholdRunwayPlanAdjustmentActive(example.adjustment),
    );
  });
});
