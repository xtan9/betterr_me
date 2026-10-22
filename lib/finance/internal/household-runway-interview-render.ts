/** Projects Interview state onto the current screen without side effects. */

import { expenseTotals } from "@/lib/finance/cushion";

import type { HouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

import {
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayValidationIssue,
  type HouseholdRunwayInterviewStatus,
  type HouseholdRunwayInterviewState,
  HOUSEHOLD_RUNWAY_COUNTRIES,
  HOUSEHOLD_RUNWAY_CURRENCIES,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayReviewDerivation,
  HouseholdRunwayInterviewResumeChoice,
  HouseholdRunwayInterviewRenderModel,
} from "./household-runway-interview-projections";

import {
  NON_RESULT_STAGES,
  isStageApplicable,
  applicableHouseholdRunwayInterviewStages,
} from "./household-runway-interview-stages";

import {
  freshIncome,
  incomeEstimateForRender,
  calculationAnswers,
  expenseCategoryProgress,
} from "./household-runway-interview-answers";

import {
  focusedReviewProjectionForDraft,
  focusedResultProjectionForDraft,
} from "./household-runway-interview-assessment";

function blockingIssueFor(
  draft: HouseholdRunwayInterviewDraft,
  stage: HouseholdRunwayInterviewStage | null,
  current: HouseholdRunwayValidationIssue | null,
) {
  return stage ? current ?? draft.validationIssues[stage] ?? null : null;
}

export function renderFor(
  status: HouseholdRunwayInterviewStatus,
  stage: HouseholdRunwayInterviewStage | null,
  draft: HouseholdRunwayInterviewDraft,
  validationIssue: HouseholdRunwayValidationIssue | null,
  reviewProjection: HouseholdRunwayReviewDerivation | null,
  resumeChoice: HouseholdRunwayInterviewResumeChoice | null,
  committedPlan: HouseholdRunwayPlan | null,
): HouseholdRunwayInterviewRenderModel {
  if (status === "not_started" || stage === null) {
    if (resumeChoice && committedPlan) {
      return {
        kind: "resume_choice",
        stage: null,
        location: null,
        committedPlanRevision: committedPlan.revision,
        draftRevision: draft.revision,
        draftStatus: resumeChoice.draftStatus,
        draftStage: resumeChoice.draftStage,
        recommended: resumeChoice.recommended,
      };
    }
    return {
      kind: "landing",
      stage: null,
      location: null,
      hasDraft:
        draft.revision > 0 ||
        draft.interviewId !== null ||
        draft.startedAt !== null,
      draftCompleted: draft.stageStatus.result === "completed",
      resumeStage:
        draft.stageStatus.result === "completed"
          ? "result"
          : NON_RESULT_STAGES.find(
                (candidate) =>
                  isStageApplicable(candidate, draft.answers) &&
                  draft.stageStatus[candidate] !== "completed" &&
                  draft.stageStatus[candidate] !== "skipped",
              ) ?? null,
    };
  }

  const availableStages = applicableHouseholdRunwayInterviewStages({
    status,
    stage,
    draft,
  } as HouseholdRunwayInterviewState);
  const stageStatus = draft.stageStatus[stage];
  const blockingIssue = blockingIssueFor(draft, stage, validationIssue) ??
    (stage === "review" ? reviewProjection?.validationIssue ?? null : null);

  if (stage === "location") {
    return {
      kind: "location",
      stage,
      country: draft.location.country,
      region: draft.location.region,
      currency: draft.location.currency,
      currencyProposal: draft.location.proposedCurrency,
      currencySelection: draft.location.currencySelection,
      availableCountries: HOUSEHOLD_RUNWAY_COUNTRIES,
      availableCurrencies: HOUSEHOLD_RUNWAY_CURRENCIES,
      availableStages,
      stageStatus,
      canContinue: Boolean(
        draft.location.country &&
          draft.location.region &&
          draft.location.currency &&
          !draft.pendingCurrencyChange,
      ),
      blockingIssue,
      pendingCurrencyChange: draft.pendingCurrencyChange,
    };
  }

  if (stage === "household") {
    return {
      kind: "household",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      sharesFinances: draft.answers.shares_finances,
      hasChildren: draft.answers.has_children,
      hasSupportObligations: draft.answers.has_support_obligations,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "employment") {
    return {
      kind: "employment",
      stage,
      mine: draft.answers.mine.employment,
      partner: draft.answers.partner?.employment ?? null,
      sharesFinances: draft.answers.shares_finances,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "myIncome" || stage === "partnerIncome") {
    const income =
      stage === "myIncome"
        ? draft.answers.mine
        : draft.answers.partner ?? freshIncome("employed");
    return {
      kind: stage,
      stage,
      person: stage === "myIncome" ? "mine" : "partner",
      income,
      estimate: incomeEstimateForRender(income, draft.location),
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "otherIncome") {
    return {
      kind: "otherIncome",
      stage,
      sources: draft.answers.other_income_sources,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      optional: true,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "cash") {
    return {
      kind: "cash",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      availableCash: draft.answers.available_cash,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "assets") {
    return {
      kind: "assets",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      assets: draft.answers.assets,
      extremeAccess: draft.answers.extreme_access,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "expenses") {
    const calculation = calculationAnswers(draft.answers);
    return {
      kind: "expenses",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      mode: draft.answers.expense_mode,
      activeCategory: draft.activeExpenseCategory,
      housingTenure: draft.answers.housing_tenure,
      quickExpenses: draft.answers.quick_expenses,
      expenseItems: draft.answers.expense_items,
      categoryModes: draft.answers.expense_category_modes,
      categorySubtotals: draft.answers.expense_category_subtotals,
      completedCategories: draft.answers.completed_expense_categories,
      categories: expenseCategoryProgress(draft.answers),
      totals: expenseTotals(calculation),
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "reductions") {
    const calculation = calculationAnswers(draft.answers);
    return {
      kind: "reductions",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      mode: draft.answers.expense_mode,
      quickExpenses: draft.answers.quick_expenses,
      expenseItems: draft.answers.expense_items,
      categoryModes: draft.answers.expense_category_modes,
      categorySubtotals: draft.answers.expense_category_subtotals,
      totals: expenseTotals(calculation),
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "review") {
    const focusedReviewProjection =
      reviewProjection?.reviewProjection ??
      focusedReviewProjectionForDraft(draft, "blocked");
    return {
      kind: "review",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      answers: draft.answers,
      planInputs: reviewProjection?.planInputs ?? null,
      assessment: reviewProjection?.assessment ?? null,
      availableScenarios: draft.availableScenarios,
      selectedScenario: draft.selectedScenario,
      planAdjustment: draft.planAdjustment,
      assessmentModelVersion: reviewProjection?.assessment?.modelVersion ?? null,
      reviewProjection: focusedReviewProjection,
      totals: {
        current: focusedReviewProjection.expenses.currentMonthlyCents,
        interruption: focusedReviewProjection.expenses.interruptionMonthlyCents,
      },
      monthlyIncomeCents: focusedReviewProjection.earnedIncome.monthlyCents,
      otherIncomeCents: focusedReviewProjection.otherIncome.monthlyCents,
      excludedAssetCents: focusedReviewProjection.lastResortAssets.cents,
      ready: blockingIssue === null && reviewProjection?.assessment != null,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  return {
    kind: "stage",
    stage,
    availableStages,
    stageStatus,
    blockingIssue,
    planInputs: reviewProjection?.planInputs ?? null,
    assessment: reviewProjection?.assessment ?? null,
    availableScenarios: draft.availableScenarios,
    selectedScenario: draft.selectedScenario,
    planAdjustment: draft.planAdjustment,
    assessmentModelVersion: reviewProjection?.assessment?.modelVersion ?? null,
    resultProjection: focusedResultProjectionForDraft(draft, reviewProjection),
  };
}
