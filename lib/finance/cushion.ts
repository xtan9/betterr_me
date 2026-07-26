export type CushionPlanningState = "urgent" | "building" | "stronger";

export interface CushionInputs {
  liquid_resources_cents: number;
  monthly_essential_expenses_cents: number;
  monthly_continuing_income_cents: number;
}

export interface CushionCalculation {
  monthly_shortfall_cents: number;
  months_covered: number | null;
  planning_state: CushionPlanningState;
}

export interface FinanceCushionRecord extends CushionInputs {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export type FinanceCushionView = FinanceCushionRecord & {
  calculation: CushionCalculation;
};

export const FINANCE_CUSHION_COLUMNS =
  "id, user_id, liquid_resources_cents, monthly_essential_expenses_cents, monthly_continuing_income_cents, created_at, updated_at";

/**
 * Calculate the user's interruption-mode runway from cents, without floating
 * point comparisons at the planning thresholds.
 *
 * The monthly shortfall is essential expenses minus income that the user says
 * will continue. When there is no shortfall, the plan is represented as 6+
 * months rather than an infinite score because the states are communication
 * thresholds, not a financial-health grade.
 */
export function calculateCushion(inputs: CushionInputs): CushionCalculation {
  const monthlyShortfall = Math.max(
    inputs.monthly_essential_expenses_cents -
      inputs.monthly_continuing_income_cents,
    0,
  );

  if (monthlyShortfall === 0) {
    return {
      monthly_shortfall_cents: 0,
      months_covered: null,
      planning_state: "stronger",
    };
  }

  const monthsCovered =
    Math.floor(
      (inputs.liquid_resources_cents / monthlyShortfall) * 100,
    ) / 100;

  const planningState: CushionPlanningState =
    inputs.liquid_resources_cents < monthlyShortfall * 3
      ? "urgent"
      : inputs.liquid_resources_cents < monthlyShortfall * 6
        ? "building"
        : "stronger";

  return {
    monthly_shortfall_cents: monthlyShortfall,
    months_covered: monthsCovered,
    planning_state: planningState,
  };
}

export function toFinanceCushionView(
  record: FinanceCushionRecord,
): FinanceCushionView {
  return {
    ...record,
    calculation: calculateCushion(record),
  };
}

/** Convert a user-entered amount with up to two decimals into integer cents. */
export function parseDollarsToCents(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(cents: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
