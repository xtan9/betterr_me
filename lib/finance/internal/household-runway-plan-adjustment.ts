import {
  applyExpenseReduction,
  expenseTotals,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
  type RunwaySimulation,
} from "@/lib/finance/cushion";
import { MAX_CUSHION_AMOUNT_CENTS } from "@/lib/validations/finance-cushion";

export type HouseholdRunwayPlanAdjustmentField = keyof RunwayAdjustments;

const PLAN_ADJUSTMENT_FIELDS = [
  "expense_reduction_cents",
  "added_cash_cents",
  "added_monthly_income_cents",
  "expected_unconfirmed_funds_cents",
  "usable_illiquid_investments_cents",
  "usable_retirement_tax_deferred_cents",
  "usable_retirement_tax_free_cents",
] as const satisfies readonly HouseholdRunwayPlanAdjustmentField[];

const RELATIONAL_FIELDS = [
  "expense_reduction_cents",
  "usable_illiquid_investments_cents",
  "usable_retirement_tax_deferred_cents",
  "usable_retirement_tax_free_cents",
] as const;

export type HouseholdRunwayPlanAdjustmentRelationalField =
  (typeof RELATIONAL_FIELDS)[number];

export type HouseholdRunwayPlanAdjustmentLimits = Record<
  HouseholdRunwayPlanAdjustmentField,
  number
>;

export interface HouseholdRunwayPlanAdjustmentViolation {
  field: HouseholdRunwayPlanAdjustmentRelationalField;
  limitCents: number;
}

export interface HouseholdRunwayPlanAdjustmentApplication {
  answers: HouseholdRunwayAnswers;
  adjustment: RunwayAdjustments;
  occurredAt: string;
  incomeSourceId: string;
}

export interface HouseholdRunwayPlanAdjustmentProjectionInput {
  adjustment: RunwayAdjustments;
  planInputs: HouseholdRunwayAnswers;
  baseline: RunwaySimulation;
  preview: RunwaySimulation;
}

export type HouseholdRunwayAdjustmentField = {
  valueCents: number;
  minimumCents: 0;
  maximumCents: number;
};

export type HouseholdRunwayAdjustmentEffect =
  | { kind: "none" }
  | { kind: "monthsChanged"; deltaMonths: number }
  | { kind: "becameSustainable" };

export type HouseholdRunwayAdjustmentProjection = {
  active: boolean;
  fields: {
    expenseReduction: HouseholdRunwayAdjustmentField;
    addedCash: HouseholdRunwayAdjustmentField;
    addedMonthlyIncome: HouseholdRunwayAdjustmentField;
    expectedUnconfirmedFunds: HouseholdRunwayAdjustmentField;
    usableIlliquidInvestments: HouseholdRunwayAdjustmentField;
    usableRetirementTaxDeferred: HouseholdRunwayAdjustmentField;
    usableRetirementTaxFree: HouseholdRunwayAdjustmentField;
  };
  effect: HouseholdRunwayAdjustmentEffect;
};

export function emptyHouseholdRunwayPlanAdjustment(): RunwayAdjustments {
  return {
    expense_reduction_cents: 0,
    added_cash_cents: 0,
    added_monthly_income_cents: 0,
    expected_unconfirmed_funds_cents: 0,
    usable_illiquid_investments_cents: 0,
    usable_retirement_tax_deferred_cents: 0,
    usable_retirement_tax_free_cents: 0,
  };
}

export function householdRunwayPlanAdjustmentFields(
  patch: Partial<RunwayAdjustments>,
): HouseholdRunwayPlanAdjustmentField[] {
  return PLAN_ADJUSTMENT_FIELDS.filter((field) => patch[field] !== undefined);
}

export function isHouseholdRunwayPlanAdjustmentActive(
  adjustment: RunwayAdjustments,
): boolean {
  return PLAN_ADJUSTMENT_FIELDS.some((field) => adjustment[field] > 0);
}

function finiteNumber(value: unknown): number | null {
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}

function normalizeStoredCents(value: unknown): number {
  const numeric = finiteNumber(value);
  return numeric === null ? 0 : Math.max(0, Math.round(numeric));
}

function normalizeIntentCents(value: unknown, maximumCents: number): number {
  const numeric = finiteNumber(value);
  if (numeric === null) return 0;
  return Math.min(maximumCents, Math.max(0, Math.round(numeric)));
}

export function normalizeStoredHouseholdRunwayPlanAdjustment(
  input: Partial<RunwayAdjustments> | null | undefined,
): RunwayAdjustments {
  const result = emptyHouseholdRunwayPlanAdjustment();
  for (const field of PLAN_ADJUSTMENT_FIELDS) {
    let value: unknown;
    try {
      value = input?.[field];
    } catch {
      value = undefined;
    }
    result[field] = normalizeStoredCents(value);
  }
  return result;
}

export function getHouseholdRunwayPlanAdjustmentLimits(
  planInputs: HouseholdRunwayAnswers | null,
): HouseholdRunwayPlanAdjustmentLimits {
  const relativeLimits = planInputs
    ? {
        expense_reduction_cents: expenseTotals(planInputs).interruption,
        usable_illiquid_investments_cents:
          planInputs.assets.illiquid_investments.cents,
        usable_retirement_tax_deferred_cents:
          planInputs.assets.retirement_tax_deferred.cents,
        usable_retirement_tax_free_cents:
          planInputs.assets.retirement_tax_free.cents,
      }
    : {
        expense_reduction_cents: 0,
        usable_illiquid_investments_cents: 0,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 0,
      };

  return {
    ...relativeLimits,
    added_cash_cents: MAX_CUSHION_AMOUNT_CENTS,
    added_monthly_income_cents: MAX_CUSHION_AMOUNT_CENTS,
    expected_unconfirmed_funds_cents: MAX_CUSHION_AMOUNT_CENTS,
  };
}

function objectPatch(value: unknown): Record<string, unknown> {
  try {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function normalizeHouseholdRunwayPlanAdjustmentIntent(input: {
  patch: unknown;
  planInputs: HouseholdRunwayAnswers | null;
}): Partial<RunwayAdjustments> {
  const patch = objectPatch(input.patch);
  const limits = getHouseholdRunwayPlanAdjustmentLimits(input.planInputs);
  const normalized: Partial<RunwayAdjustments> = {};
  for (const field of PLAN_ADJUSTMENT_FIELDS) {
    let present = false;
    try {
      present = Object.prototype.hasOwnProperty.call(patch, field);
    } catch {
      continue;
    }
    if (!present) continue;

    let value: unknown;
    try {
      value = patch[field];
    } catch {
      value = undefined;
    }
    normalized[field] = normalizeIntentCents(value, limits[field]);
  }
  return normalized;
}

export function validateHouseholdRunwayPlanAdjustment(input: {
  adjustment: RunwayAdjustments;
  planInputs: HouseholdRunwayAnswers;
}): readonly HouseholdRunwayPlanAdjustmentViolation[] {
  const limits = getHouseholdRunwayPlanAdjustmentLimits(input.planInputs);
  return RELATIONAL_FIELDS.flatMap((field) =>
    input.adjustment[field] > limits[field]
      ? [{ field, limitCents: limits[field] }]
      : [],
  );
}

export function applyHouseholdRunwayPlanAdjustment({
  answers,
  adjustment,
  occurredAt,
  incomeSourceId,
}: HouseholdRunwayPlanAdjustmentApplication): HouseholdRunwayAnswers {
  let next = answers;
  if (adjustment.expense_reduction_cents > 0) {
    next = applyExpenseReduction(next, adjustment.expense_reduction_cents);
  }
  if (adjustment.added_cash_cents > 0) {
    next = {
      ...next,
      available_cash: {
        cents: next.available_cash.cents + adjustment.added_cash_cents,
        confidence: "confirmed",
      },
    };
  }
  if (adjustment.added_monthly_income_cents > 0) {
    next = {
      ...next,
      other_income_sources: [
        ...next.other_income_sources,
        {
          id: incomeSourceId,
          type: "other",
          label: "Applied Plan Adjustment",
          monthly_cents: adjustment.added_monthly_income_cents,
          confidence: "confirmed",
        },
      ],
    };
  }
  if (
    adjustment.usable_illiquid_investments_cents > 0 ||
    adjustment.usable_retirement_tax_deferred_cents > 0 ||
    adjustment.usable_retirement_tax_free_cents > 0
  ) {
    next = {
      ...next,
      extreme_access: {
        illiquid_investments_cents: Math.min(
          next.assets.illiquid_investments.cents,
          adjustment.usable_illiquid_investments_cents,
        ),
        retirement_tax_deferred_cents: Math.min(
          next.assets.retirement_tax_deferred.cents,
          adjustment.usable_retirement_tax_deferred_cents,
        ),
        retirement_tax_free_cents: Math.min(
          next.assets.retirement_tax_free.cents,
          adjustment.usable_retirement_tax_free_cents,
        ),
      },
    };
  }
  return { ...next, updated_at: occurredAt };
}

function adjustmentField(
  valueCents: number,
  maximumCents: number,
): HouseholdRunwayAdjustmentField {
  return { valueCents, minimumCents: 0, maximumCents };
}

type AdjustmentOutcome =
  | { kind: "sustainable" }
  | { kind: "depletes"; monthsCovered: number };

function outcomeForEffect(
  simulation: RunwaySimulation,
): AdjustmentOutcome | null {
  if (simulation.sustainable) {
    return simulation.months_covered === null ? { kind: "sustainable" } : null;
  }
  if (
    typeof simulation.months_covered !== "number" ||
    !Number.isFinite(simulation.months_covered) ||
    simulation.months_covered < 0
  ) {
    return null;
  }
  return { kind: "depletes", monthsCovered: simulation.months_covered };
}

function adjustmentEffect(
  active: boolean,
  baseline: RunwaySimulation,
  preview: RunwaySimulation,
): HouseholdRunwayAdjustmentEffect {
  if (!active) return { kind: "none" };

  const baselineOutcome = outcomeForEffect(baseline);
  const previewOutcome = outcomeForEffect(preview);
  if (!baselineOutcome || !previewOutcome) return { kind: "none" };

  if (
    baselineOutcome.kind === "sustainable" &&
    previewOutcome.kind === "sustainable"
  ) {
    return { kind: "none" };
  }
  if (
    baselineOutcome.kind === "depletes" &&
    previewOutcome.kind === "sustainable"
  ) {
    return { kind: "becameSustainable" };
  }
  if (
    baselineOutcome.kind === "depletes" &&
    previewOutcome.kind === "depletes"
  ) {
    return {
      kind: "monthsChanged",
      deltaMonths:
        previewOutcome.monthsCovered - baselineOutcome.monthsCovered,
    };
  }

  return { kind: "none" };
}

export function projectHouseholdRunwayPlanAdjustment({
  adjustment,
  planInputs,
  baseline,
  preview,
}: HouseholdRunwayPlanAdjustmentProjectionInput): HouseholdRunwayAdjustmentProjection {
  const limits = getHouseholdRunwayPlanAdjustmentLimits(planInputs);
  const active = isHouseholdRunwayPlanAdjustmentActive(adjustment);
  return {
    active,
    fields: {
      expenseReduction: adjustmentField(
        adjustment.expense_reduction_cents,
        limits.expense_reduction_cents,
      ),
      addedCash: adjustmentField(
        adjustment.added_cash_cents,
        limits.added_cash_cents,
      ),
      addedMonthlyIncome: adjustmentField(
        adjustment.added_monthly_income_cents,
        limits.added_monthly_income_cents,
      ),
      expectedUnconfirmedFunds: adjustmentField(
        adjustment.expected_unconfirmed_funds_cents,
        limits.expected_unconfirmed_funds_cents,
      ),
      usableIlliquidInvestments: adjustmentField(
        adjustment.usable_illiquid_investments_cents,
        limits.usable_illiquid_investments_cents,
      ),
      usableRetirementTaxDeferred: adjustmentField(
        adjustment.usable_retirement_tax_deferred_cents,
        limits.usable_retirement_tax_deferred_cents,
      ),
      usableRetirementTaxFree: adjustmentField(
        adjustment.usable_retirement_tax_free_cents,
        limits.usable_retirement_tax_free_cents,
      ),
    },
    effect: adjustmentEffect(active, baseline, preview),
  };
}
