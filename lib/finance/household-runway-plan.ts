import type { HouseholdRunwayAnswers } from "@/lib/finance/cushion";
import { validateCurrentRunwayAnswers } from "@/lib/finance/internal/runway-answer-migrations";

/** The only committed Household Runway data exposed to domain callers. */
export interface HouseholdRunwayPlan {
  revision: number;
  inputs: HouseholdRunwayAnswers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Constructs a Plan only from a non-negative revision and current-schema
 * inputs. Legacy answer migration remains a separate repository/draft step.
 */
export function createHouseholdRunwayPlan(
  value: unknown,
  options: { allowIncompleteRegion?: boolean } = {},
): HouseholdRunwayPlan | null {
  if (!isRecord(value) || !isNonNegativeInteger(value.revision)) return null;
  const inputs = validateCurrentRunwayAnswers(
    value.inputs,
    Boolean(options.allowIncompleteRegion),
  );
  return inputs ? { revision: value.revision, inputs } : null;
}
