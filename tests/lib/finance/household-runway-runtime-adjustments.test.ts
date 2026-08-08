import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
} from "@/lib/finance/cushion";
import {
  createHouseholdRunwayInterviewRuntimeWithCapabilities as createHouseholdRunwayInterviewRuntime,
} from "@/lib/finance/internal/household-runway-interview-runtime";

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
  if (screen.kind !== "result" || screen.readiness !== "ready") {
    throw new Error("expected the completed result");
  }
  return {
    expense_reduction_cents: screen.adjustment.fields.expenseReduction.valueCents,
    added_cash_cents: screen.adjustment.fields.addedCash.valueCents,
    added_monthly_income_cents: screen.adjustment.fields.addedMonthlyIncome.valueCents,
    expected_unconfirmed_funds_cents: screen.adjustment.fields.expectedUnconfirmedFunds.valueCents,
    usable_illiquid_investments_cents: screen.adjustment.fields.usableIlliquidInvestments.valueCents,
    usable_retirement_tax_deferred_cents: screen.adjustment.fields.usableRetirementTaxDeferred.valueCents,
    usable_retirement_tax_free_cents: screen.adjustment.fields.usableRetirementTaxFree.valueCents,
  } satisfies RunwayAdjustments;
}

function resultFrom(
  runtime: ReturnType<typeof createHouseholdRunwayInterviewRuntime>,
) {
  const screen = runtime.getSnapshot().screen;
  if (screen.kind !== "result" || screen.readiness !== "ready") {
    throw new Error("expected the completed result");
  }
  return screen;
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
      expect(snapshot.screen).toMatchObject({
        kind: "result",
        readiness: "ready",
        adjustment: { active: Object.values(expected).some((value) => value > 0) },
      });
      expect(snapshot.issues).toEqual([]);
    },
  );

  it("keeps expected unconfirmed funds provisional and discards them on Apply", () => {
    const runtime = completedRuntime();
    runtime.send({
      type: "set_plan_adjustment",
      patch: { expected_unconfirmed_funds_cents: 456_789 },
    });
    expect(adjustmentFrom(runtime).expected_unconfirmed_funds_cents).toBe(456_789);

    runtime.send({ type: "apply_plan_adjustment" });

    const afterApply = runtime.getSnapshot();
    expect(adjustmentFrom(runtime).expected_unconfirmed_funds_cents).toBe(0);
    expect(afterApply.screen).toMatchObject({
      kind: "result",
      readiness: "ready",
      adjustment: {
        active: false,
        fields: { expectedUnconfirmedFunds: { valueCents: 0 } },
      },
    });
  });

  it("applies all seven preview fields through the observable Runtime result", () => {
    const runtime = completedRuntime();
    const baseline = resultFrom(runtime);

    runtime.send({
      type: "set_plan_adjustment",
      patch: {
        expense_reduction_cents: 100_000,
        added_cash_cents: 200_000,
        added_monthly_income_cents: 50_000,
        expected_unconfirmed_funds_cents: 456_789,
        usable_illiquid_investments_cents: 75_000,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 150_000,
      },
    });

    const preview = resultFrom(runtime);
    expect(preview.adjustment.active).toBe(true);
    expect(preview.adjustment.fields).toMatchObject({
      expenseReduction: { valueCents: 100_000 },
      addedCash: { valueCents: 200_000 },
      addedMonthlyIncome: { valueCents: 50_000 },
      expectedUnconfirmedFunds: { valueCents: 456_789 },
      usableIlliquidInvestments: { valueCents: 75_000 },
      usableRetirementTaxDeferred: { valueCents: 0 },
      usableRetirementTaxFree: { valueCents: 150_000 },
    });

    runtime.send({ type: "apply_plan_adjustment" });

    const applied = resultFrom(runtime);
    expect(applied.adjustment).toMatchObject({
      active: false,
      fields: {
        expenseReduction: { valueCents: 0 },
        addedCash: { valueCents: 0 },
        addedMonthlyIncome: { valueCents: 0 },
        expectedUnconfirmedFunds: { valueCents: 0 },
        usableIlliquidInvestments: { valueCents: 0 },
        usableRetirementTaxDeferred: { valueCents: 0 },
        usableRetirementTaxFree: { valueCents: 0 },
      },
    });
    expect(applied.explanation.availableCashCents).toBe(
      baseline.explanation.availableCashCents + 200_000,
    );
    expect(applied.primary.resources.interruptionExpensesCents).toBe(
      baseline.primary.resources.interruptionExpensesCents - 100_000,
    );
    expect(applied.primary.resources.continuingMonthlyIncomeCents).toBe(
      baseline.primary.resources.continuingMonthlyIncomeCents + 50_000,
    );
    runtime.send({ type: "edit_completed_plan" });
    runtime.send({ type: "back" });
    runtime.send({ type: "back" });
    runtime.send({ type: "back" });

    expect(runtime.getSnapshot().screen).toMatchObject({
      kind: "assets",
      extremeAccess: {
        illiquid_investments_cents: 75_000,
        retirement_tax_deferred_cents: 0,
        retirement_tax_free_cents: 150_000,
      },
    });
  });

  it("normalizes hostile values safely across all seven fields", () => {
    const runtime = completedRuntime();
    runtime.send({
      type: "set_plan_adjustment",
      patch: {
        expense_reduction_cents: Symbol("expense"),
        added_cash_cents: Symbol("cash"),
        added_monthly_income_cents: Symbol("income"),
        expected_unconfirmed_funds_cents: Symbol("expected"),
        usable_illiquid_investments_cents: Symbol("illiquid"),
        usable_retirement_tax_deferred_cents: Symbol("deferred"),
        usable_retirement_tax_free_cents: Symbol("free"),
        unknown_field: 999,
      } as unknown as Partial<RunwayAdjustments>,
    });

    expect(adjustmentFrom(runtime)).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
  });

  it("treats a throwing field getter as an unusable present value", () => {
    const runtime = completedRuntime();
    const patch = { added_monthly_income_cents: 234_567 } as Record<
      string,
      unknown
    >;
    Object.defineProperty(patch, "added_cash_cents", {
      enumerable: true,
      get() {
        throw new Error("unusable patch value");
      },
    });

    expect(() =>
      runtime.send({
        type: "set_plan_adjustment",
        patch: patch as Partial<RunwayAdjustments>,
      }),
    ).not.toThrow();

    expect(adjustmentFrom(runtime)).toMatchObject({
      added_cash_cents: 0,
      added_monthly_income_cents: 234_567,
    });
  });

  it("treats an unusable object-like patch as an empty partial patch", () => {
    const runtime = completedRuntime();
    runtime.send({
      type: "set_plan_adjustment",
      patch: { added_cash_cents: 123_456 },
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() =>
      runtime.send({
        type: "set_plan_adjustment",
        patch: proxy as Partial<RunwayAdjustments>,
      }),
    ).not.toThrow();

    expect(adjustmentFrom(runtime).added_cash_cents).toBe(123_456);
  });

  it("preserves unpatched fields while ignoring unknown fields", () => {
    const runtime = completedRuntime();
    runtime.send({
      type: "set_plan_adjustment",
      patch: {
        added_cash_cents: 123_456,
        added_monthly_income_cents: 234_567,
      },
    });
    runtime.send({
      type: "set_plan_adjustment",
      patch: { unknown_field: 999 } as unknown as Partial<RunwayAdjustments>,
    });

    expect(adjustmentFrom(runtime)).toMatchObject({
      added_cash_cents: 123_456,
      added_monthly_income_cents: 234_567,
    });
  });

  it("treats a non-object intent patch as an empty partial patch", () => {
    const runtime = completedRuntime();
    runtime.send({
      type: "set_plan_adjustment",
      patch: { added_cash_cents: 123_456 },
    });
    runtime.send({
      type: "set_plan_adjustment",
      patch: null as unknown as Partial<RunwayAdjustments>,
    });

    expect(adjustmentFrom(runtime).added_cash_cents).toBe(123_456);
    expect(adjustmentFrom(runtime).added_monthly_income_cents).toBe(0);
  });
});
