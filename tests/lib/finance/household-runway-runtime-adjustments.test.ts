import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
} from "@/lib/finance/cushion";
import { createHouseholdRunwayInterviewRuntime } from "@/lib/finance/household-runway-interview-runtime";

const now = "2026-08-03T15:00:00.000Z";
const GLOBAL_MAX_CENTS = 100_000_000_000;

function richPlanInputs(): HouseholdRunwayAnswers {
  const defaults = createDefaultRunwayAnswers(new Date(now));
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
    updated_at: now,
  };
}

function completedRuntime() {
  const runtime = createHouseholdRunwayInterviewRuntime({
    now: () => now,
    createId: () => "interview-1",
    initialPlan: { revision: 1, inputs: richPlanInputs() },
  });
  runtime.start();
  return runtime;
}

function adjustmentFrom(
  runtime: ReturnType<typeof createHouseholdRunwayInterviewRuntime>,
) {
  const screen = runtime.getSnapshot().screen;
  if (screen.kind !== "stage") throw new Error("expected the completed result");
  return screen.planAdjustment;
}

const adjustmentCases = [
  {
    name: "negative values",
    patch: {
      expense_reduction_cents: -1,
      added_cash_cents: -2,
      added_monthly_income_cents: -3,
      expected_unconfirmed_funds_cents: -4,
      usable_illiquid_investments_cents: -5,
      usable_retirement_tax_deferred_cents: -6,
      usable_retirement_tax_free_cents: -7,
    },
    expected: {
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    },
  },
  {
    name: "fractional values",
    patch: {
      expense_reduction_cents: 1.5,
      added_cash_cents: 2.5,
      added_monthly_income_cents: 3.5,
      expected_unconfirmed_funds_cents: 4.5,
      usable_illiquid_investments_cents: 5.5,
      usable_retirement_tax_deferred_cents: 6.5,
      usable_retirement_tax_free_cents: 7.5,
    },
    expected: {
      expense_reduction_cents: 2,
      added_cash_cents: 3,
      added_monthly_income_cents: 4,
      expected_unconfirmed_funds_cents: 5,
      usable_illiquid_investments_cents: 6,
      usable_retirement_tax_deferred_cents: 7,
      usable_retirement_tax_free_cents: 8,
    },
  },
  {
    name: "non-finite values",
    patch: {
      expense_reduction_cents: Number.NaN,
      added_cash_cents: Number.POSITIVE_INFINITY,
      added_monthly_income_cents: Number.NEGATIVE_INFINITY,
      expected_unconfirmed_funds_cents: Number.NaN,
      usable_illiquid_investments_cents: Number.POSITIVE_INFINITY,
      usable_retirement_tax_deferred_cents: Number.NEGATIVE_INFINITY,
      usable_retirement_tax_free_cents: Number.NaN,
    },
    expected: {
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    },
  },
  {
    name: "exact global and domain limits",
    patch: {
      expense_reduction_cents: 400_000,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: GLOBAL_MAX_CENTS,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 600_000,
      usable_retirement_tax_deferred_cents: 800_000,
      usable_retirement_tax_free_cents: 900_000,
    },
    expected: {
      expense_reduction_cents: 400_000,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: GLOBAL_MAX_CENTS,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 600_000,
      usable_retirement_tax_deferred_cents: 800_000,
      usable_retirement_tax_free_cents: 900_000,
    },
  },
  {
    name: "over-limit values",
    patch: {
      expense_reduction_cents: 400_001,
      added_cash_cents: GLOBAL_MAX_CENTS + 1,
      added_monthly_income_cents: GLOBAL_MAX_CENTS + 1,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS + 1,
      usable_illiquid_investments_cents: 600_001,
      usable_retirement_tax_deferred_cents: 800_001,
      usable_retirement_tax_free_cents: 900_001,
    },
    expected: {
      expense_reduction_cents: 400_000,
      added_cash_cents: GLOBAL_MAX_CENTS,
      added_monthly_income_cents: GLOBAL_MAX_CENTS,
      expected_unconfirmed_funds_cents: GLOBAL_MAX_CENTS,
      usable_illiquid_investments_cents: 600_000,
      usable_retirement_tax_deferred_cents: 800_000,
      usable_retirement_tax_free_cents: 900_000,
    },
  },
] satisfies readonly {
  name: string;
  patch: Partial<RunwayAdjustments>;
  expected: RunwayAdjustments;
}[];

describe("Household Runway Runtime Plan Adjustment boundary", () => {
  it.each(adjustmentCases)(
    "normalizes $name to exact authoritative cents",
    ({ patch, expected }) => {
      const runtime = completedRuntime();

      runtime.send({ type: "set_plan_adjustment", patch });

      const snapshot = runtime.getSnapshot();
      expect(adjustmentFrom(runtime)).toEqual(expected);
      expect(snapshot.derived.assessment).toMatchObject({
        adjustments: expected,
      });
      expect(snapshot.derived.assessment).not.toBeNull();
      expect(snapshot.issues).toEqual([]);
    },
  );

  it("keeps expected unconfirmed funds provisional and discards them on Apply", () => {
    const runtime = completedRuntime();
    const baseline = runtime.getSnapshot().derived.assessment;

    runtime.send({
      type: "set_plan_adjustment",
      patch: { expected_unconfirmed_funds_cents: 456_789 },
    });
    expect(adjustmentFrom(runtime).expected_unconfirmed_funds_cents).toBe(456_789);

    runtime.send({ type: "apply_plan_adjustment" });

    const afterApply = runtime.getSnapshot();
    expect(adjustmentFrom(runtime).expected_unconfirmed_funds_cents).toBe(0);
    expect(afterApply.derived.assessment?.adjustments.expected_unconfirmed_funds_cents).toBe(0);
    expect(afterApply.derived.planInputs).toEqual(baseline?.answers);
  });
});
