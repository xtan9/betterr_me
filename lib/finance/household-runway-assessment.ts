import { z } from "zod";
import {
  availableScenarios,
  highestLeverageActions,
  simulateHouseholdRunway,
  withCurrentLifestyleExpenses,
  RUNWAY_MODEL_VERSION,
  type RunwayAdjustments,
  type RunwaySimulation,
} from "@/lib/finance/cushion";
import { validateHouseholdRunwayPlanAdjustment } from "@/lib/finance/internal/household-runway-plan-adjustment";
import {
  householdRunwayAssessmentInputSchema,
  householdRunwayAnswersSchema,
} from "@/lib/validations/finance-cushion";

export interface HouseholdRunwayAssessmentInput {
  answers: unknown;
  adjustments?: Partial<RunwayAdjustments>;
  startDate?: Date;
}

export interface HouseholdRunwayScenarioAssessment {
  scenario: RunwaySimulation["scenario"];
  baseline: RunwaySimulation;
  comparisons: {
    currentLifestyle: RunwaySimulation;
    interruptionPlan: RunwaySimulation;
    extremeMode: RunwaySimulation;
  };
  adjusted: RunwaySimulation;
  advice: ReturnType<typeof highestLeverageActions>;
}

export interface HouseholdRunwayAssessmentValidationIssue {
  path: (string | number)[];
  message: string;
}

export type HouseholdRunwayAssessmentOutcome =
  | {
      success: true;
      modelVersion: typeof RUNWAY_MODEL_VERSION;
      answers: z.output<typeof householdRunwayAnswersSchema>;
      adjustments: RunwayAdjustments;
      firstScenario: HouseholdRunwayScenarioAssessment;
      scenarios: HouseholdRunwayScenarioAssessment[];
    }
  | {
      success: false;
      validationIssues: HouseholdRunwayAssessmentValidationIssue[];
    };

export type SuccessfulHouseholdRunwayAssessment = Extract<
  HouseholdRunwayAssessmentOutcome,
  { success: true }
>;

/**
 * Assess every supported household runway scenario from one normalized input.
 *
 * @param input - Household answers, optional adjustments, and simulation date.
 * @returns A complete assessment outcome or public-boundary validation issues.
 */
export function assessHouseholdRunway(
  input: HouseholdRunwayAssessmentInput,
): HouseholdRunwayAssessmentOutcome {
  const parsedInput = householdRunwayAssessmentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      validationIssues: parsedInput.error.issues.map((issue) => ({
        path: issue.path.map((part) =>
          typeof part === "symbol" ? String(part) : part,
        ),
        message: issue.message,
      })),
    };
  }
  const { answers, adjustments } = parsedInput.data;
  const relationalIssues = validateHouseholdRunwayPlanAdjustment({
    adjustment: adjustments,
    planInputs: answers,
  }).map(({ field }) => ({
    path: ["adjustments", field],
    message:
      field === "expense_reduction_cents"
        ? "Expense reduction cannot exceed interruption expenses"
        : "Usable amount cannot exceed the entered balance",
  }));
  if (relationalIssues.length > 0) {
    return { success: false, validationIssues: relationalIssues };
  }
  const effectiveStartDate =
    parsedInput.data.startDate ?? new Date(answers.updated_at);
  const scenarios = availableScenarios(answers).map(({ id }) => {
    const baseline = simulateHouseholdRunway(
      answers,
      id,
      undefined,
      effectiveStartDate,
    );
    const adjusted = simulateHouseholdRunway(
      answers,
      id,
      adjustments,
      effectiveStartDate,
    );
    return {
      scenario: id,
      baseline,
      comparisons: {
        currentLifestyle: simulateHouseholdRunway(
          withCurrentLifestyleExpenses(answers),
          id,
          undefined,
          effectiveStartDate,
        ),
        interruptionPlan: baseline,
        extremeMode: simulateHouseholdRunway(
          answers,
          id,
          {
            usable_illiquid_investments_cents:
              answers.extreme_access.illiquid_investments_cents,
            usable_retirement_tax_deferred_cents:
              answers.extreme_access.retirement_tax_deferred_cents,
            usable_retirement_tax_free_cents:
              answers.extreme_access.retirement_tax_free_cents,
          },
          effectiveStartDate,
        ),
      },
      adjusted,
      advice: highestLeverageActions(answers, adjusted),
    };
  });
  return {
    success: true,
    modelVersion: RUNWAY_MODEL_VERSION,
    answers,
    adjustments,
    firstScenario: scenarios[0],
    scenarios,
  };
}
