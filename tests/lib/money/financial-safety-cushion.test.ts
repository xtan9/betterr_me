import { describe, expect, it } from "vitest";
import { continuingIncomeForScenario, safetyCushionConfidence, simulateSafetyCushion } from "@/lib/money/financial-safety-cushion";

const base = { startDate: "2026-07-01", liquidResourcesCents: 60_000, essentialMonthlyExpensesCents: 20_000, continuingMonthlyIncomeCents: 0, confirmedTransitionIncome: [] };

describe("simulateSafetyCushion", () => {
  it("stops at the depletion boundary and never exceeds 12 months", () => {
    const result = simulateSafetyCushion(base);
    expect(result.months).toHaveLength(3);
    expect(result.lastFullyFundedMonth).toBe(3);
    expect(result.projectedDepletionDate).toBe("2026-09-30");
    expect(result.months.at(-1)?.closingCashCents).toBe(0);
  });

  it("supports zero resources and no continuing income", () => {
    const result = simulateSafetyCushion({ ...base, liquidResourcesCents: 0 });
    expect(result).toMatchObject({ lastFullyFundedMonth: 0, projectedDepletionDate: "2026-07-31", exhausted: true });
  });

  it("includes only confirmed transition income for its stated timing and duration", () => {
    const result = simulateSafetyCushion({
      ...base,
      liquidResourcesCents: 25_000,
      confirmedTransitionIncome: [{ amountCents: 20_000, startsMonth: 1, durationMonths: 2 }],
    });
    expect(result.months.map((month) => month.transitionIncomeCents)).toEqual([0, 20_000, 20_000, 0]);
    expect(result.projectedDepletionDate).toBe("2026-10-31");
  });

  it("handles continuing income and caps a non-depleting plan at 12 months", () => {
    const result = simulateSafetyCushion({ ...base, continuingMonthlyIncomeCents: 20_000 });
    expect(result.months).toHaveLength(12);
    expect(result).toMatchObject({ lastFullyFundedMonth: 12, projectedDepletionDate: null, exhausted: false });
  });

  it("includes only liquid resources in the simulation", () => {
    const result = simulateSafetyCushion({ ...base, liquidResourcesCents: 20_000, excludedNonLiquidResourcesCents: 5_000_000 });
    expect(result.projectedDepletionDate).toBe("2026-07-31");
  });

  it("keeps only the non-stopped income for each scenario", () => {
    expect(continuingIncomeForScenario("my_income_stops", 70_000, 30_000)).toBe(30_000);
    expect(continuingIncomeForScenario("partner_income_stops", 70_000, 30_000)).toBe(70_000);
    expect(continuingIncomeForScenario("both_incomes_stop", 70_000, 30_000)).toBe(0);
  });

  it("labels missing required inputs, estimates, and complete inputs distinctly", () => {
    expect(safetyCushionConfidence({ hasAccessibleCash: false, hasEssentialMonthlyExpenses: true, hasScenarioIncomeChoice: true, hasEstimatedInputs: false })).toBe("needs_review");
    expect(safetyCushionConfidence({ hasAccessibleCash: true, hasEssentialMonthlyExpenses: true, hasScenarioIncomeChoice: true, hasEstimatedInputs: true })).toBe("estimated");
    expect(safetyCushionConfidence({ hasAccessibleCash: true, hasEssentialMonthlyExpenses: true, hasScenarioIncomeChoice: true, hasEstimatedInputs: false })).toBe("complete");
  });
});
