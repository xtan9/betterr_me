/** Presentation-neutral screen and assessment shapes for the private Interview. */

import {
  type RunwayCountry,
  type RunwayCurrency,
  type EmploymentStatus,
  type IncomeAnswer,
  estimateMonthlyTakeHome,
  type RecurringIncomeSource,
  type MoneyAnswer,
  type RunwayAssets,
  type ExtremeAccessAmounts,
  type ExpenseMode,
  type HousingTenure,
  type QuickExpenses,
  type ExpenseLineItem,
  type ExpenseCategoryMode,
  type ExpenseCategorySubtotal,
  type HouseholdRunwayAnswers,
  type ScenarioOption,
  type RunwayScenario,
  type RunwayAdjustments,
  RUNWAY_MODEL_VERSION,
  type InputConfidence,
} from "@/lib/finance/cushion";

import type { ExpenseCategory } from "@/lib/finance/runway-expenses";

import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

import type {
  HouseholdRunwayAdjustmentProjection,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import type {
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewStatus,
  HouseholdRunwayCurrencySelection,
  HouseholdRunwayInterviewStageStatus,
  HouseholdRunwayValidationIssue,
  HouseholdRunwayPendingCurrencyChange,
  HouseholdRunwayExpenseCategoryProgress,
  HouseholdRunwayInterviewAnswers,
} from "./household-runway-interview-model";

export interface HouseholdRunwayLandingRenderModel {
  kind: "landing";
  stage: null;
  location: null;
  hasDraft: boolean;
  draftCompleted: boolean;
  resumeStage: HouseholdRunwayInterviewStage | null;
}

export type HouseholdRunwayResumeOption = "draft" | "plan";

export interface HouseholdRunwayInterviewResumeChoice {
  draftStatus: HouseholdRunwayInterviewStatus;
  draftStage: HouseholdRunwayInterviewStage | null;
  recommended: HouseholdRunwayResumeOption;
}

export interface HouseholdRunwayResumeChoiceRenderModel {
  kind: "resume_choice";
  stage: null;
  location: null;
  committedPlanRevision: number;
  draftRevision: number;
  draftStatus: HouseholdRunwayInterviewStatus;
  draftStage: HouseholdRunwayInterviewStage | null;
  recommended: HouseholdRunwayResumeOption;
}

export interface HouseholdRunwayLocationRenderModel {
  kind: "location";
  stage: "location";
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
  currencyProposal: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
  availableCountries: readonly RunwayCountry[];
  availableCurrencies: readonly RunwayCurrency[];
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  canContinue: boolean;
  blockingIssue: HouseholdRunwayValidationIssue | null;
  pendingCurrencyChange: HouseholdRunwayPendingCurrencyChange | null;
}

export interface HouseholdRunwayHouseholdRenderModel {
  kind: "household";
  stage: "household";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  sharesFinances: boolean;
  hasChildren: boolean;
  hasSupportObligations: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayEmploymentRenderModel {
  kind: "employment";
  stage: "employment";
  mine: EmploymentStatus;
  partner: EmploymentStatus | null;
  sharesFinances: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayIncomeRenderModel {
  kind: "myIncome" | "partnerIncome";
  stage: "myIncome" | "partnerIncome";
  person: "mine" | "partner";
  income: IncomeAnswer;
  /** Presentation-ready estimate derived by the Runtime, when applicable. */
  estimate: ReturnType<typeof estimateMonthlyTakeHome> | null;
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayOtherIncomeRenderModel {
  kind: "otherIncome";
  stage: "otherIncome";
  sources: readonly RecurringIncomeSource[];
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  optional: true;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayCashRenderModel {
  kind: "cash";
  stage: "cash";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  availableCash: MoneyAnswer;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayAssetsRenderModel {
  kind: "assets";
  stage: "assets";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  assets: RunwayAssets;
  extremeAccess: ExtremeAccessAmounts;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayExpensesRenderModel {
  kind: "expenses";
  stage: "expenses";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  mode: ExpenseMode;
  activeCategory: ExpenseCategory | null;
  housingTenure: HousingTenure;
  quickExpenses: QuickExpenses;
  expenseItems: readonly ExpenseLineItem[];
  categoryModes: Partial<Record<ExpenseCategory, ExpenseCategoryMode>>;
  categorySubtotals: Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>;
  completedCategories: readonly ExpenseCategory[];
  categories: readonly HouseholdRunwayExpenseCategoryProgress[];
  totals: { current: number; interruption: number };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayReductionsRenderModel {
  kind: "reductions";
  stage: "reductions";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  mode: ExpenseMode;
  quickExpenses: QuickExpenses;
  expenseItems: readonly ExpenseLineItem[];
  categoryModes: Partial<Record<ExpenseCategory, ExpenseCategoryMode>>;
  categorySubtotals: Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>;
  totals: { current: number; interruption: number };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayReviewRenderModel {
  kind: "review";
  stage: "review";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  answers: HouseholdRunwayInterviewAnswers;
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  availableScenarios: readonly ScenarioOption[];
  selectedScenario: RunwayScenario | null;
  planAdjustment: RunwayAdjustments;
  assessmentModelVersion: typeof RUNWAY_MODEL_VERSION | null;
  /** Private focused facts for the later supported review projection cutover. */
  reviewProjection: HouseholdRunwayReviewProjection;
  totals: { current: number; interruption: number };
  monthlyIncomeCents: number;
  otherIncomeCents: number;
  excludedAssetCents: number;
  ready: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayGenericStageRenderModel {
  kind: "stage";
  stage: "result";
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  availableScenarios: readonly ScenarioOption[];
  selectedScenario: RunwayScenario | null;
  planAdjustment: RunwayAdjustments;
  assessmentModelVersion: typeof RUNWAY_MODEL_VERSION | null;
  /** Private focused facts for the later supported result projection cutover. */
  resultProjection: HouseholdRunwayResultProjection;
}

export type HouseholdRunwayInterviewRenderModel =
  | HouseholdRunwayLandingRenderModel
  | HouseholdRunwayResumeChoiceRenderModel
  | HouseholdRunwayLocationRenderModel
  | HouseholdRunwayHouseholdRenderModel
  | HouseholdRunwayEmploymentRenderModel
  | HouseholdRunwayIncomeRenderModel
  | HouseholdRunwayOtherIncomeRenderModel
  | HouseholdRunwayCashRenderModel
  | HouseholdRunwayAssetsRenderModel
  | HouseholdRunwayExpensesRenderModel
  | HouseholdRunwayReductionsRenderModel
  | HouseholdRunwayReviewRenderModel
  | HouseholdRunwayGenericStageRenderModel;

export interface HouseholdRunwayReviewProjection {
  readiness: "ready" | "blocked";
  location:
    | {
        kind: "complete";
        country: RunwayCountry;
        region: string;
        currency: RunwayCurrency;
      }
    | {
        kind: "incomplete";
        country: RunwayCountry | null;
        region: string | null;
        currency: RunwayCurrency | null;
      };
  household: { adultCount: 1 | 2; confidence: "confirmed" };
  cash: { cents: number; confidence: InputConfidence };
  expenses: {
    currentMonthlyCents: number;
    interruptionMonthlyCents: number;
    confidence: InputConfidence;
  };
  earnedIncome: {
    monthlyCents: number;
    confidence: "confirmed" | "estimated";
  };
  otherIncome: {
    monthlyCents: number;
    confidence: "confirmed" | "skipped";
  };
  liquidInvestments: { cents: number; confidence: InputConfidence };
  lastResortAssets: {
    cents: number;
    confidence: "confirmed" | "skipped";
  };
}

export type HouseholdRunwayResultOutcome =
  | { kind: "sustainable" }
  | {
      kind: "depletes";
      monthsCovered: number;
      depletion:
        | { kind: "dated"; date: string }
        | { kind: "outsideDateRange" };
    };

export type HouseholdRunwayResultGuidance =
  | "underThree"
  | "threeToUnderSix"
  | "sixPlus"
  | "sustainable";

export interface HouseholdRunwayResultPoint {
  month: number;
  openingBalanceCents: number;
  continuingIncomeCents: number;
  oneTimeFundsCents: number;
  essentialOutflowCents: number;
  closingBalanceCents: number;
}

type HouseholdRunwayResultSeries =
  | {
      kind: "monthly";
      throughMonth: number;
      points: readonly HouseholdRunwayResultPoint[];
    }
  | {
      kind: "checkpoints";
      throughMonth: number;
      completeMonthlyThrough: 12;
      points: readonly HouseholdRunwayResultPoint[];
    };

export interface HouseholdRunwayFocusedResultSimulation {
  outcome: HouseholdRunwayResultOutcome;
  confidence: "complete" | "estimated" | "needsReview";
  guidance: HouseholdRunwayResultGuidance;
  resources: {
    startingCents: number;
    continuingMonthlyIncomeCents: number;
    interruptionExpensesCents: number;
    reducibleExpensesCents: number;
    excludedAssetsCents: number;
  };
  series: HouseholdRunwayResultSeries;
}

export type HouseholdRunwayAdviceFact =
  | { kind: "cashTarget"; targetMonths: 3 | 6; gapCents: number }
  | {
      kind: "largestReducibleCategory";
      category: ExpenseCategory;
      reducibleCents: number;
    };

export type HouseholdRunwayPrecisionNotice =
  | { kind: "cashNotConfirmed" }
  | { kind: "takeHomeEstimated" }
  | { kind: "quickExpenses" }
  | { kind: "coreInputsComplete" };

export interface HouseholdRunwayResultComparison {
  outcome:
    | { kind: "sustainable" }
    | { kind: "depletes"; monthsCovered: number };
}

export type HouseholdRunwayResultProjection =
  | { readiness: "unavailable" }
  | {
      readiness: "ready";
      modelVersion: string;
      country: RunwayCountry;
      currency: RunwayCurrency;
      scenarios: {
        selected: RunwayScenario;
        available: readonly { id: RunwayScenario }[];
      };
      primary: HouseholdRunwayFocusedResultSimulation;
      comparisons: {
        currentLifestyle: HouseholdRunwayResultComparison;
        interruption: HouseholdRunwayResultComparison;
        extremeMode: HouseholdRunwayResultComparison;
      };
      explanation: {
        availableCashCents: number;
        liquidInvestmentsCents: number;
      };
      adjustment: HouseholdRunwayAdjustmentProjection;
      advice: readonly HouseholdRunwayAdviceFact[];
      precision: {
        notices: readonly HouseholdRunwayPrecisionNotice[];
      };
    };

export interface HouseholdRunwayReviewDerivation {
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  validationIssue: HouseholdRunwayValidationIssue | null;
  reviewProjection: HouseholdRunwayReviewProjection;
}
