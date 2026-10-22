/** Derives review and result facts from normalized Interview answers. */

import {
  expenseTotals,
  type RunwaySimulation,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";

import {
  type HouseholdRunwayScenarioAssessment,
  assessHouseholdRunway,
} from "@/lib/finance/household-runway-assessment";

import {
  projectHouseholdRunwayPlanAdjustment,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import type { HouseholdRunwayInterviewDraft } from "./household-runway-interview-model";

import type {
  HouseholdRunwayReviewProjection,
  HouseholdRunwayResultOutcome,
  HouseholdRunwayResultGuidance,
  HouseholdRunwayResultPoint,
  HouseholdRunwayFocusedResultSimulation,
  HouseholdRunwayResultComparison,
  HouseholdRunwayAdviceFact,
  HouseholdRunwayPrecisionNotice,
  HouseholdRunwayReviewDerivation,
  HouseholdRunwayResultProjection,
} from "./household-runway-interview-projections";

import { calculationAnswers } from "./household-runway-interview-answers";

import { normalizeHouseholdRunwayDraft } from "./household-runway-interview-draft";

export function focusedReviewProjectionForDraft(
  draft: HouseholdRunwayInterviewDraft,
  readiness: HouseholdRunwayReviewProjection["readiness"],
): HouseholdRunwayReviewProjection {
  const answers = draft.answers;
  const totals = expenseTotals(calculationAnswers(answers));
  const lastResortCents =
    answers.assets.illiquid_investments.cents +
    answers.assets.home_equity.cents +
    answers.assets.retirement_tax_deferred.cents +
    answers.assets.retirement_tax_free.cents;

  return {
    readiness,
    location:
      answers.country && answers.region && answers.currency
        ? {
            kind: "complete",
            country: answers.country,
            region: answers.region,
            currency: answers.currency,
          }
        : {
            kind: "incomplete",
            country: answers.country,
            region: answers.region,
            currency: answers.currency,
          },
    household: {
      adultCount: answers.partner ? 2 : 1,
      confidence: "confirmed",
    },
    cash: answers.available_cash,
    expenses: {
      currentMonthlyCents: totals.current,
      interruptionMonthlyCents: totals.interruption,
      confidence:
        answers.expense_mode === "quick"
          ? answers.quick_expenses.confidence
          : "confirmed",
    },
    earnedIncome: {
      monthlyCents:
        answers.mine.monthly_take_home_cents +
        (answers.partner?.monthly_take_home_cents ?? 0),
      confidence:
        answers.mine.confidence === "estimated" ||
        answers.partner?.confidence === "estimated"
          ? "estimated"
          : "confirmed",
    },
    otherIncome: {
      monthlyCents: answers.other_income_sources.reduce(
        (sum, source) => sum + source.monthly_cents,
        0,
      ),
      confidence: answers.other_income_sources.length ? "confirmed" : "skipped",
    },
    liquidInvestments: answers.assets.liquid_investments,
    lastResortAssets: {
      cents: lastResortCents,
      confidence: lastResortCents ? "confirmed" : "skipped",
    },
  };
}

function resultOutcomeFor(
  simulation: RunwaySimulation,
): HouseholdRunwayResultOutcome | null {
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

  const monthsCovered = simulation.months_covered;
  const depletionDateValue = simulation.depletion_date;
  const depletionDate =
    typeof depletionDateValue === "string" &&
    isValidDepletionDate(depletionDateValue)
      ? { kind: "dated" as const, date: depletionDateValue }
      : { kind: "outsideDateRange" as const };
  return {
    kind: "depletes",
    monthsCovered,
    depletion: depletionDate,
  };
}

function isValidDepletionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function resultGuidanceFor(
  outcome: HouseholdRunwayResultOutcome,
): HouseholdRunwayResultGuidance {
  if (outcome.kind === "sustainable") return "sustainable";
  if (outcome.monthsCovered < 3) return "underThree";
  if (outcome.monthsCovered < 6) return "threeToUnderSix";
  return "sixPlus";
}

function resultPointFor(
  point: RunwaySimulation["months"][number],
): HouseholdRunwayResultPoint {
  return {
    month: point.month,
    openingBalanceCents: point.opening_balance_cents,
    continuingIncomeCents: point.continuing_income_cents,
    oneTimeFundsCents: point.one_time_funds_cents,
    essentialOutflowCents: point.essential_outflow_cents,
    closingBalanceCents: point.closing_balance_cents,
  };
}

function focusedResultSimulationFor(
  simulation: RunwaySimulation,
): HouseholdRunwayFocusedResultSimulation | null {
  const outcome = resultOutcomeFor(simulation);
  if (!outcome) return null;
  const throughMonth =
    simulation.months[simulation.months.length - 1]?.month ?? 0;
  const points = simulation.months.map(resultPointFor);

  return {
    outcome,
    confidence:
      simulation.confidence === "needs_review"
        ? "needsReview"
        : simulation.confidence,
    guidance: resultGuidanceFor(outcome),
    resources: {
      startingCents: simulation.starting_resources_cents,
      continuingMonthlyIncomeCents: simulation.continuing_monthly_income_cents,
      interruptionExpensesCents: simulation.interruption_expenses_cents,
      reducibleExpensesCents: simulation.reducible_expenses_cents,
      excludedAssetsCents: simulation.excluded_assets_cents,
    },
    series:
      throughMonth <= 240
        ? { kind: "monthly", throughMonth, points }
        : { kind: "checkpoints", throughMonth, completeMonthlyThrough: 12, points },
  };
}

function resultComparisonFor(
  simulation: RunwaySimulation,
): HouseholdRunwayResultComparison | null {
  const outcome = resultOutcomeFor(simulation);
  if (!outcome) return null;
  return outcome.kind === "sustainable"
    ? { outcome }
    : { outcome: { kind: "depletes", monthsCovered: outcome.monthsCovered } };
}

function adviceFor(
  assessment: HouseholdRunwayScenarioAssessment,
): readonly HouseholdRunwayAdviceFact[] {
  const advice: HouseholdRunwayAdviceFact[] = [];
  if (assessment.advice.cashGapCents > 0) {
    advice.push({
      kind: "cashTarget",
      targetMonths: assessment.advice.targetMonths === 3 ? 3 : 6,
      gapCents: assessment.advice.cashGapCents,
    });
  }
  if (
    assessment.advice.largestReducibleCategory &&
    assessment.advice.largestReducibleCategory.reducible > 0
  ) {
    advice.push({
      kind: "largestReducibleCategory",
      category: assessment.advice.largestReducibleCategory.category,
      reducibleCents: assessment.advice.largestReducibleCategory.reducible,
    });
  }
  return advice;
}

function precisionNoticesFor(
  answers: HouseholdRunwayAnswers,
  preview: RunwaySimulation,
): readonly HouseholdRunwayPrecisionNotice[] {
  const notices: HouseholdRunwayPrecisionNotice[] = [];
  if (answers.available_cash.confidence !== "confirmed") {
    notices.push({ kind: "cashNotConfirmed" });
  }
  if (
    answers.mine.take_home_source === "estimated" ||
    answers.partner?.take_home_source === "estimated"
  ) {
    notices.push({ kind: "takeHomeEstimated" });
  }
  if (answers.expense_mode === "quick") {
    notices.push({ kind: "quickExpenses" });
  }
  if (preview.confidence === "complete") {
    notices.push({ kind: "coreInputsComplete" });
  }
  return notices;
}

export function focusedResultProjectionForDraft(
  draft: HouseholdRunwayInterviewDraft,
  reviewProjection: HouseholdRunwayReviewDerivation | null,
): HouseholdRunwayResultProjection {
  const assessment = reviewProjection?.assessment;
  const selectedScenario = draft.selectedScenario;
  const selectedAssessment = assessment?.scenarios.find(
    (item) => item.scenario === selectedScenario,
  );
  const selectedIsApplicable = draft.availableScenarios.some(
    ({ id }) => id === selectedScenario,
  );
  if (
    !assessment ||
    !selectedScenario ||
    !selectedIsApplicable ||
    !selectedAssessment
  ) {
    return { readiness: "unavailable" };
  }

  const answers = assessment.answers;
  const baseline = selectedAssessment.baseline;
  const preview = selectedAssessment.adjusted;
  const primary = focusedResultSimulationFor(preview);
  const currentLifestyle = resultComparisonFor(
    selectedAssessment.comparisons.currentLifestyle,
  );
  const interruption = resultComparisonFor(selectedAssessment.baseline);
  const extremeMode = resultComparisonFor(
    selectedAssessment.comparisons.extremeMode,
  );
  if (!primary || !currentLifestyle || !interruption || !extremeMode) {
    return { readiness: "unavailable" };
  }
  return {
    readiness: "ready",
    modelVersion: assessment.modelVersion,
    country: answers.country,
    currency: answers.currency,
    scenarios: {
      selected: selectedScenario,
      available: draft.availableScenarios.map(({ id }) => ({ id })),
    },
    primary,
    comparisons: {
      currentLifestyle,
      interruption,
      extremeMode,
    },
    explanation: {
      availableCashCents: answers.available_cash.cents,
      liquidInvestmentsCents: answers.assets.liquid_investments.cents,
    },
    adjustment: projectHouseholdRunwayPlanAdjustment({
      adjustment: draft.planAdjustment,
      planInputs: answers,
      baseline,
      preview,
    }),
    advice: adviceFor(selectedAssessment),
    precision: { notices: precisionNoticesFor(answers, preview) },
  };
}

export function reviewProjectionForDraft(
  draft: HouseholdRunwayInterviewDraft,
): HouseholdRunwayReviewDerivation {
  const normalized = normalizeHouseholdRunwayDraft(draft);
  if (!normalized.success) {
    return {
      planInputs: null,
      assessment: null,
      reviewProjection: focusedReviewProjectionForDraft(draft, "blocked"),
      validationIssue: normalized.validationIssues[0] ?? {
        code: "plan_input_invalid",
        stage: "review",
      },
    };
  }

  const assessment = assessHouseholdRunway({
    answers: normalized.planInputs,
    adjustments: draft.planAdjustment,
    startDate: new Date(normalized.planInputs.updated_at),
  });
  if (!assessment.success) {
    return {
      planInputs: normalized.planInputs,
      assessment: null,
      reviewProjection: focusedReviewProjectionForDraft(draft, "blocked"),
      validationIssue: {
        code: "assessment_required",
        stage: "review",
      },
    };
  }
  return {
    planInputs: normalized.planInputs,
    assessment,
    reviewProjection: focusedReviewProjectionForDraft(draft, "ready"),
    validationIssue: null,
  };
}
