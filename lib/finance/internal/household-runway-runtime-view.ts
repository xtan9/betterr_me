/** Immutable, presentation-neutral Runtime snapshot types. */

import type {
  RunwayCountry,
  RunwayCurrency,
  EmploymentStatus,
  IncomeAnswer,
  RecurringIncomeSource,
  MoneyAnswer,
  RunwayAssets,
  ExtremeAccessAmounts,
  ExpenseMode,
  ExpenseCategory,
  HousingTenure,
  QuickExpenses,
  ExpenseLineItem,
  ExpenseCategoryMode,
  ExpenseCategorySubtotal,
  RunwayScenario,
} from "@/lib/finance/cushion";

import type {
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewStageStatus,
  HouseholdRunwayInterviewStatus,
  HouseholdRunwayCurrencySelection,
  HouseholdRunwayPendingCurrencyChange,
  HouseholdRunwayExpenseCategoryProgress,
} from "@/lib/finance/internal/household-runway-interview";

import type {
  HouseholdRunwayAdjustmentProjection,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import type {
  HouseholdRunwayAssessmentSnapshotFact,
} from "@/lib/finance/internal/household-runway-focused-projection";

import type {
  HouseholdRunwayInterviewRuntimeDeepReadonly,
  HouseholdRunwayInterviewRuntimeLifecycle,
  HouseholdRunwayInterviewRuntimeIssue,
  HouseholdRunwayInterviewRuntimeOperations,
  HouseholdRunwayInterviewRuntimeConfirmation,
} from "./household-runway-runtime-contract";

interface HouseholdRunwayInterviewRuntimeScreenLocation {
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
}

interface HouseholdRunwayInterviewRuntimeScreenStageFacts {
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
}

export type HouseholdRunwayInterviewRuntimeScreenProjection =
  | {
      kind: "landing";
      stage: null;
      location: null;
      hasDraft: boolean;
      draftCompleted: boolean;
      resumeStage: HouseholdRunwayInterviewStage | null;
    }
  | {
      kind: "resume_choice";
      stage: null;
      location: null;
      draftStatus: HouseholdRunwayInterviewStatus;
      draftStage: HouseholdRunwayInterviewStage | null;
      recommended: "draft" | "plan";
    }
  | ({
      kind: "location";
      stage: "location";
      country: RunwayCountry | null;
      region: string | null;
      currency: RunwayCurrency | null;
      currencyProposal: RunwayCurrency | null;
      currencySelection: HouseholdRunwayCurrencySelection;
      availableCountries: readonly RunwayCountry[];
      availableCurrencies: readonly RunwayCurrency[];
      canContinue: boolean;
      pendingCurrencyChange: HouseholdRunwayPendingCurrencyChange | null;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "household";
      stage: "household";
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
      sharesFinances: boolean;
      hasChildren: boolean;
      hasSupportObligations: boolean;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "employment";
      stage: "employment";
      mine: EmploymentStatus;
      partner: EmploymentStatus | null;
      sharesFinances: boolean;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "myIncome" | "partnerIncome";
      stage: "myIncome" | "partnerIncome";
      person: "mine" | "partner";
      income: IncomeAnswer;
      estimate: ReturnType<typeof import("@/lib/finance/cushion").estimateMonthlyTakeHome> | null;
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "otherIncome";
      stage: "otherIncome";
      sources: readonly RecurringIncomeSource[];
      totalMonthlyCents: number;
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
      optional: true;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "cash";
      stage: "cash";
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
      availableCash: MoneyAnswer;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "assets";
      stage: "assets";
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
      assets: RunwayAssets;
      extremeAccess: ExtremeAccessAmounts;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "expenses";
      stage: "expenses";
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
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
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "reductions";
      stage: "reductions";
      location: HouseholdRunwayInterviewRuntimeScreenLocation;
      mode: ExpenseMode;
      quickExpenses: QuickExpenses;
      expenseItems: readonly ExpenseLineItem[];
      categoryModes: Partial<Record<ExpenseCategory, ExpenseCategoryMode>>;
      categorySubtotals: Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>;
      totals: { current: number; interruption: number };
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "review";
      stage: "review";
      readiness: HouseholdRunwayReviewReadiness;
      location: HouseholdRunwayReviewLocation;
      household: HouseholdRunwayReviewHousehold;
      cash: HouseholdRunwayReviewCash;
      expenses: HouseholdRunwayReviewExpenses;
      earnedIncome: HouseholdRunwayReviewEarnedIncome;
      otherIncome: HouseholdRunwayReviewOtherIncome;
      liquidInvestments: HouseholdRunwayReviewLiquidInvestments;
      lastResortAssets: HouseholdRunwayReviewLastResortAssets;
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "result";
      stage: "result";
      readiness: "unavailable";
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts)
  | ({
      kind: "result";
      stage: "result";
      readiness: "ready";
      modelVersion: string;
      country: RunwayCountry;
      currency: RunwayCurrency;
      scenarios: {
        selected: RunwayScenario;
        available: readonly { id: RunwayScenario }[];
      };
      primary: HouseholdRunwayFocusedRuntimeSimulation;
      comparisons: {
        currentLifestyle: HouseholdRunwayRuntimeComparisonFact;
        interruption: HouseholdRunwayRuntimeComparisonFact;
        extremeMode: HouseholdRunwayRuntimeComparisonFact;
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
      history: readonly HouseholdRunwayAssessmentSnapshotFact[];
    } & HouseholdRunwayInterviewRuntimeScreenStageFacts);

export type HouseholdRunwayReviewReadiness = "ready" | "blocked";

export type HouseholdRunwayReviewLocation =
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

export type HouseholdRunwayReviewHousehold = {
  adultCount: 1 | 2;
  confidence: "confirmed";
};

export type HouseholdRunwayReviewCash = {
  cents: number;
  confidence: import("@/lib/finance/cushion").InputConfidence;
};

export type HouseholdRunwayReviewExpenses = {
  currentMonthlyCents: number;
  interruptionMonthlyCents: number;
  confidence: import("@/lib/finance/cushion").InputConfidence;
};

export type HouseholdRunwayReviewEarnedIncome = {
  monthlyCents: number;
  confidence: "confirmed" | "estimated";
};

export type HouseholdRunwayReviewOtherIncome = {
  monthlyCents: number;
  confidence: "confirmed" | "skipped";
};

export type HouseholdRunwayReviewLiquidInvestments = {
  cents: number;
  confidence: import("@/lib/finance/cushion").InputConfidence;
};

export type HouseholdRunwayReviewLastResortAssets = {
  cents: number;
  confidence: "confirmed" | "skipped";
};

export type HouseholdRunwayResultOutcome =
  | { kind: "sustainable" }
  | {
      kind: "depletes";
      monthsCovered: number;
      depletion:
        | { kind: "dated"; date: string }
        | { kind: "outsideDateRange" };
    };

export type HouseholdRunwayGuidanceBand =
  | "underThree"
  | "threeToUnderSix"
  | "sixPlus"
  | "sustainable";

export type HouseholdRunwayRuntimeComparisonFact = {
  outcome:
    | { kind: "sustainable" }
    | { kind: "depletes"; monthsCovered: number };
};

export type HouseholdRunwayPoint = {
  month: number;
  openingBalanceCents: number;
  continuingIncomeCents: number;
  oneTimeFundsCents: number;
  essentialOutflowCents: number;
  closingBalanceCents: number;
};

export type HouseholdRunwaySeries =
  | {
      kind: "monthly";
      throughMonth: number;
      points: readonly HouseholdRunwayPoint[];
    }
  | {
      kind: "checkpoints";
      throughMonth: number;
      completeMonthlyThrough: 12;
      points: readonly HouseholdRunwayPoint[];
    };

export type HouseholdRunwayFocusedRuntimeSimulation = {
  outcome: HouseholdRunwayResultOutcome;
  confidence: "complete" | "estimated" | "needsReview";
  guidance: HouseholdRunwayGuidanceBand;
  resources: {
    startingCents: number;
    continuingMonthlyIncomeCents: number;
    interruptionExpensesCents: number;
    reducibleExpensesCents: number;
    excludedAssetsCents: number;
  };
  series: HouseholdRunwaySeries;
};

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

export type HouseholdRunwayInterviewRuntimeScreen =
  HouseholdRunwayInterviewRuntimeDeepReadonly<HouseholdRunwayInterviewRuntimeScreenProjection>;

export type HouseholdRunwayActionApplicability =
  | { applicable: true }
  | { applicable: false };

export interface HouseholdRunwayInterviewRuntimeActions {
  readonly start: HouseholdRunwayActionApplicability;
  readonly startNew: HouseholdRunwayActionApplicability;
  readonly resumeDraft: HouseholdRunwayActionApplicability;
  readonly resumePlan: HouseholdRunwayActionApplicability;
  readonly importDraft: HouseholdRunwayActionApplicability;
  readonly continue: HouseholdRunwayActionApplicability;
  readonly back: HouseholdRunwayActionApplicability;
  readonly skip: HouseholdRunwayActionApplicability;
  readonly discardDraft: HouseholdRunwayActionApplicability;
  readonly rememberDraft: HouseholdRunwayActionApplicability;
  readonly clearDeviceDraft: HouseholdRunwayActionApplicability;
  readonly editCompletedPlan: HouseholdRunwayActionApplicability;
  readonly selectScenario: HouseholdRunwayActionApplicability;
  readonly setPlanAdjustment: HouseholdRunwayActionApplicability;
  readonly applyPlanAdjustment: HouseholdRunwayActionApplicability;
  readonly resetPlanAdjustment: HouseholdRunwayActionApplicability;
  readonly savePlan: HouseholdRunwayActionApplicability;
  readonly downloadReport: HouseholdRunwayActionApplicability;
}

export interface HouseholdRunwayInterviewRuntimeSnapshot {
  readonly lifecycle: HouseholdRunwayInterviewRuntimeLifecycle;
  readonly interviewStatus: HouseholdRunwayInterviewStatus;
  readonly stage: HouseholdRunwayInterviewStage | null;
  readonly screen: HouseholdRunwayInterviewRuntimeScreen;
  readonly plan: HouseholdRunwayInterviewRuntimePlanFacts;
  readonly draft: HouseholdRunwayInterviewRuntimeDraftFacts;
  readonly issues: readonly HouseholdRunwayInterviewRuntimeIssue[];
  readonly operations: HouseholdRunwayInterviewRuntimeOperations;
  readonly confirmation: HouseholdRunwayInterviewRuntimeConfirmation;
  readonly actions: Readonly<HouseholdRunwayInterviewRuntimeActions>;
}

export interface HouseholdRunwayInterviewRuntimeDraftFacts {
  readonly current: boolean;
  readonly stored: boolean;
  readonly session: boolean;
  readonly device: boolean;
  readonly deviceStorageConsent: boolean;
  readonly synchronized: boolean;
}

export interface HouseholdRunwayInterviewRuntimePlanFacts {
  readonly exists: boolean;
  /** Whether the active completed result still matches the committed Plan. */
  readonly current: boolean;
}
