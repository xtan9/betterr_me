import { addMonths, endOfMonth, format } from "date-fns";

export type SafetyCushionScenario = "my_income_stops" | "partner_income_stops" | "both_incomes_stop";

export interface TransitionIncome {
  amountCents: number;
  /** Zero-based month in which this confirmed income begins. */
  startsMonth: number;
  durationMonths: number;
}

export interface SafetyCushionSimulationInput {
  startDate: string;
  liquidResourcesCents: number;
  /** Retirement, home equity, and unspecified investments are displayed, never simulated. */
  excludedNonLiquidResourcesCents?: number;
  essentialMonthlyExpensesCents: number;
  continuingMonthlyIncomeCents: number;
  confirmedTransitionIncome: TransitionIncome[];
}

export interface SafetyCushionMonth {
  month: number;
  closingCashCents: number;
  continuingIncomeCents: number;
  transitionIncomeCents: number;
  essentialExpensesCents: number;
  monthEnd: string;
}

export interface SafetyCushionSimulation {
  months: SafetyCushionMonth[];
  lastFullyFundedMonth: number;
  projectedDepletionDate: string | null;
  exhausted: boolean;
}

export function continuingIncomeForScenario(
  scenario: SafetyCushionScenario,
  myMonthlyIncomeCents: number,
  partnerMonthlyIncomeCents: number
): number {
  switch (scenario) {
    case "my_income_stops":
      return partnerMonthlyIncomeCents;
    case "partner_income_stops":
      return myMonthlyIncomeCents;
    case "both_incomes_stop":
      return 0;
  }
}

export type SafetyCushionConfidence = "complete" | "estimated" | "needs_review";

export function safetyCushionConfidence(input: {
  hasAccessibleCash: boolean;
  hasEssentialMonthlyExpenses: boolean;
  hasScenarioIncomeChoice: boolean;
  hasEstimatedInputs: boolean;
}): SafetyCushionConfidence {
  if (!input.hasAccessibleCash || !input.hasEssentialMonthlyExpenses || !input.hasScenarioIncomeChoice) {
    return "needs_review";
  }
  return input.hasEstimatedInputs ? "estimated" : "complete";
}

/**
 * V1's explainable monthly interruption simulation. It intentionally makes no
 * eligibility, benefit, investment, or financial-advice inference.
 */
export function simulateSafetyCushion(
  input: SafetyCushionSimulationInput
): SafetyCushionSimulation {
  let openingCashCents = input.liquidResourcesCents;
  const months: SafetyCushionMonth[] = [];
  let lastFullyFundedMonth = 0;

  for (let month = 0; month < 12; month += 1) {
    const transitionIncomeCents = input.confirmedTransitionIncome.reduce(
      (total, income) =>
        month >= income.startsMonth && month < income.startsMonth + income.durationMonths
          ? total + income.amountCents
          : total,
      0
    );
    const closingCashCents =
      openingCashCents +
      input.continuingMonthlyIncomeCents +
      transitionIncomeCents -
      input.essentialMonthlyExpensesCents;
    const monthEnd = format(endOfMonth(addMonths(new Date(`${input.startDate}T12:00:00`), month)), "yyyy-MM-dd");

    months.push({
      month: month + 1,
      closingCashCents,
      continuingIncomeCents: input.continuingMonthlyIncomeCents,
      transitionIncomeCents,
      essentialExpensesCents: input.essentialMonthlyExpensesCents,
      monthEnd,
    });

    if (closingCashCents <= 0) {
      return {
        months,
        lastFullyFundedMonth: closingCashCents === 0 ? month + 1 : month,
        projectedDepletionDate: monthEnd,
        exhausted: true,
      };
    }

    lastFullyFundedMonth = month + 1;
    openingCashCents = closingCashCents;
  }

  return { months, lastFullyFundedMonth, projectedDepletionDate: null, exhausted: false };
}
