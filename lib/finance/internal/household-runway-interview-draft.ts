/** Restores and validates Drafts and compares their content with committed Plans. */

import { type HouseholdRunwayAnswers, expenseTotals } from "@/lib/finance/cushion";

import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/finance/runway-expenses";

import { householdRunwayAnswersSchema } from "@/lib/validations/finance-cushion";

import type { HouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

import {
  normalizeStoredHouseholdRunwayPlanAdjustment,
  isHouseholdRunwayPlanAdjustmentActive,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import type {
  HouseholdRunwayValidationIssue,
  HouseholdRunwayValidationIssueCode,
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewDraft,
  HouseholdRunwayDraftNormalizationOutcome,
  HouseholdRunwayInterviewAnswers,
  HouseholdRunwayInterviewStatus,
} from "./household-runway-interview-model";

import {
  normalizeAnswers,
  recomputeEstimatedIncome,
  isWorking,
  calculationAnswers,
  normalizeLocation,
  proposedCurrencyFor,
  isCountry,
  availableScenarios,
} from "./household-runway-interview-answers";

import { normalizeStageStatus } from "./household-runway-interview-stages";

function issueForPlanPath(
  path: readonly (string | number)[],
): HouseholdRunwayValidationIssue {
  const first = path[0];
  if (first === "country") {
    return { code: "country_required", stage: "location", path };
  }
  if (first === "region") {
    return { code: "region_invalid", stage: "location", path };
  }
  if (first === "currency") {
    return { code: "currency_required", stage: "location", path };
  }
  if (first === "mine") {
    return { code: "income_required", stage: "myIncome", path };
  }
  if (first === "partner") {
    return { code: "income_required", stage: "partnerIncome", path };
  }
  if (
    first === "expense_items" ||
    first === "expense_category_modes" ||
    first === "expense_category_subtotals" ||
    first === "quick_expenses"
  ) {
    return { code: "plan_input_invalid", stage: "expenses", path };
  }
  if (first === "updated_at") {
    return { code: "draft_timestamp_required", stage: "review", path };
  }
  if (first === "extreme_access") {
    // Preserve the established public review gate for relational asset
    // validation while keeping the detailed path available at the schema
    // boundary itself.
    return { code: "assessment_required" };
  }
  return { code: "plan_input_invalid", stage: "review", path };
}

function hasPlanIssue(
  issues: readonly HouseholdRunwayValidationIssue[],
  code: HouseholdRunwayValidationIssueCode,
  stage?: HouseholdRunwayInterviewStage,
) {
  return issues.some((issue) => issue.code === code && issue.stage === stage);
}

/**
 * Convert the partial Interview Draft into the complete shape accepted by the
 * public Household Runway calculation boundary.
 *
 * The returned Plan inputs are deliberately not stored on the Draft. They are
 * a derived, review-only projection so provisional answers cannot be mistaken
 * for a committable Plan.
 */
export function normalizeHouseholdRunwayDraft(
  draft: HouseholdRunwayInterviewDraft,
): HouseholdRunwayDraftNormalizationOutcome {
  const location = draft.location;
  const normalized = normalizeAnswers(draft.answers, location);
  const issues: HouseholdRunwayValidationIssue[] = [];

  if (!location.country) {
    issues.push({ code: "country_required", stage: "location" });
  }
  if (!location.region) {
    issues.push({ code: "region_required", stage: "location" });
  }
  if (!location.currency) {
    issues.push({ code: "currency_required", stage: "location" });
  }
  if (draft.pendingCurrencyChange) {
    issues.push({
      code: "currency_change_confirmation_required",
      stage: "location",
    });
  }
  if (
    !normalized.updated_at ||
    Number.isNaN(new Date(normalized.updated_at).getTime())
  ) {
    issues.push({ code: "draft_timestamp_required", stage: "review" });
  }

  const locationReady = Boolean(
    location.country && location.region && location.currency,
  );
  const planCandidate = {
    ...normalized,
    ...(locationReady
      ? {
          mine: recomputeEstimatedIncome(normalized.mine, location).income,
          partner: normalized.partner
            ? recomputeEstimatedIncome(normalized.partner, location).income
            : null,
        }
      : {}),
    country: location.country,
    region: location.region ?? "",
    currency: location.currency,
    updated_at: normalized.updated_at ?? "",
  };

  const planAnswers = planCandidate as HouseholdRunwayAnswers;
  if (isWorking(planAnswers.mine) && planAnswers.mine.monthly_take_home_cents <= 0) {
    issues.push({ code: "income_required", stage: "myIncome" });
  }
  if (
    planAnswers.partner &&
    isWorking(planAnswers.partner) &&
    planAnswers.partner.monthly_take_home_cents <= 0
  ) {
    issues.push({ code: "income_required", stage: "partnerIncome" });
  }
  const totals = expenseTotals(calculationAnswers(normalized));
  if (totals.current <= 0) {
    issues.push({ code: "expenses_current_required", stage: "expenses" });
  }
  if (totals.interruption <= 0) {
    issues.push({
      code: "expenses_interruption_required",
      stage: "reductions",
    });
  }

  const parsed = householdRunwayAnswersSchema.safeParse(planCandidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const mapped = issueForPlanPath(issue.path);
      if (!hasPlanIssue(issues, mapped.code, mapped.stage)) issues.push(mapped);
    }
  }

  return issues.length > 0
    ? { success: false, validationIssues: issues }
    : { success: true, planInputs: parsed.data as HouseholdRunwayAnswers };
}

export function normalizeDraft(
  input: Partial<HouseholdRunwayInterviewDraft> | null | undefined,
): HouseholdRunwayInterviewDraft {
  const rawLocation = input?.location;
  const rawAnswers = input?.answers as Partial<HouseholdRunwayInterviewAnswers> | undefined;
  const location = normalizeLocation(
    rawLocation ?? {
      country: rawAnswers?.country,
      region: rawAnswers?.region,
      currency: rawAnswers?.currency,
      proposedCurrency: proposedCurrencyFor(
        isCountry(rawAnswers?.country) ? rawAnswers.country : null,
      ),
      currencySelection: rawAnswers?.currency ? "explicit" : "unset",
    },
  );
  const answers = normalizeAnswers(rawAnswers, location);
  const scenarios = availableScenarios(answers);
  const selectedScenario = scenarios.some(
    (item) => item.id === input?.selectedScenario,
  )
    ? input?.selectedScenario ?? null
    : scenarios[0]?.id ?? null;

  return {
    revision:
      Number.isInteger(input?.revision) && input?.revision !== undefined
        ? input.revision
        : 0,
    interviewId: input?.interviewId ?? null,
    startedAt: input?.startedAt ?? null,
    location,
    answers,
    stageStatus: normalizeStageStatus(input?.stageStatus, answers),
    validationIssues: { ...(input?.validationIssues ?? {}) },
    selectedScenario,
    availableScenarios: scenarios,
    planAdjustment: normalizeStoredHouseholdRunwayPlanAdjustment(
      input?.planAdjustment,
    ),
    pendingCurrencyChange: input?.pendingCurrencyChange
      ? {
          currency: input.pendingCurrencyChange.currency,
          monetaryEntryCount: input.pendingCurrencyChange.monetaryEntryCount,
        }
      : null,
    activeExpenseCategory: EXPENSE_CATEGORIES.includes(
      input?.activeExpenseCategory as ExpenseCategory,
    )
      ? (input?.activeExpenseCategory as ExpenseCategory)
      : null,
  };
}

export function draftForCommittedPlan(
  committedPlan: HouseholdRunwayPlan,
  revision: number,
): HouseholdRunwayInterviewDraft {
  const draft = normalizeDraft({
    revision,
    answers: committedPlan.inputs,
    location: {
      country: committedPlan.inputs.country,
      region: committedPlan.inputs.region,
      currency: committedPlan.inputs.currency,
      proposedCurrency: proposedCurrencyFor(committedPlan.inputs.country),
      currencySelection: "explicit",
    },
  });
  draft.stageStatus.result = "completed";
  return draft;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * Compares a working Draft with its committed Plan at the public boundary.
 * Revision/stage progress is included so an unfinished Draft is never
 * silently collapsed into the committed result, even when its answers have
 * not changed yet.
 */
export function householdRunwayDraftMatchesPlanContent(
  draft: HouseholdRunwayInterviewDraft,
  plan: HouseholdRunwayPlan,
  status: HouseholdRunwayInterviewStatus = "collecting",
  stage: HouseholdRunwayInterviewStage | null = null,
): boolean {
  const normalized = normalizeHouseholdRunwayDraft(draft);
  if (!normalized.success) return false;
  if (stableSerialize(normalized.planInputs) !== stableSerialize(plan.inputs)) {
    return false;
  }
  if (isHouseholdRunwayPlanAdjustmentActive(draft.planAdjustment)) return false;
  return status === "completed" && stage === "result";
}

export function householdRunwayDraftDiffersFromPlan(
  draft: HouseholdRunwayInterviewDraft,
  plan: HouseholdRunwayPlan,
  status: HouseholdRunwayInterviewStatus = "collecting",
  stage: HouseholdRunwayInterviewStage | null = null,
): boolean {
  if (!householdRunwayDraftMatchesPlanContent(draft, plan, status, stage)) {
    return true;
  }
  return draft.revision > plan.revision;
}
