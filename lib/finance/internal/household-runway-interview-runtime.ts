import {
  expenseTotals,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
  type RunwaySnapshotSummary,
  type ExpenseCategory,
  type ExpenseCategoryMode,
  type ExpenseCategorySubtotal,
  type ExpenseLineItem,
  type ExpenseMode,
  type EmploymentStatus,
  type ExtremeAccessAmounts,
  type HousingTenure,
  type IncomeAnswer,
  type MoneyAnswer,
  type QuickExpenses,
  type RecurringIncomeSource,
  type RunwayAssets,
  type RunwayCountry,
  type RunwayCurrency,
  type RunwayScenario,
} from "@/lib/finance/cushion";
import {
  MAX_CUSHION_AMOUNT_CENTS,
} from "@/lib/validations/finance-cushion";
import type { RunwayLocale } from "@/lib/finance/runway-regions";
import type {
  HouseholdRunwayAnalyticsEventKind,
  HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";
import type { SuccessfulHouseholdRunwayAssessment } from "@/lib/finance/household-runway-assessment";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  householdRunwayDraftDiffersFromPlan,
  householdRunwayDraftMatchesPlanContent,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewEffect,
  type HouseholdRunwayInterviewRenderModel,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewStageStatus,
  type HouseholdRunwayCurrencySelection,
  type HouseholdRunwayPendingCurrencyChange,
  type HouseholdRunwayExpenseCategoryProgress,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewStatus,
  type HouseholdRunwayDraftDeviceAction,
  type HouseholdRunwayPlan,
  type HouseholdRunwayValidationIssue,
} from "@/lib/finance/internal/household-runway-interview";
import type { HouseholdRunwayDraftState } from "@/lib/finance/internal/household-runway-draft-codec";

/** User-facing retention policy; storage/version details remain internal. */
export const HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS = 30;

export interface HouseholdRunwayReportPresentation {
  location: string;
  formatMoney: (cents: number) => string;
  formatScenario: (scenario: RunwayScenario) => string;
  formatSimulation: (simulation: {
    sustainable: boolean;
    monthsCovered: number | null;
  }) => string;
  formatCashTarget: (months: number, cents: number) => string;
  formatLargestReduction: (category: ExpenseCategory, cents: number) => string;
  precisionAdvice: (
    notice:
      | "cashNotConfirmed"
      | "takeHomeEstimated"
      | "quickExpenses"
      | "coreInputsComplete",
  ) => string;
}

export type HouseholdRunwayInterviewRuntimeIssueCode =
  | "country_required"
  | "region_required"
  | "region_invalid"
  | "currency_required"
  | "currency_change_confirmation_required"
  | "income_required"
  | "expenses_current_required"
  | "expenses_interruption_required"
  | "draft_timestamp_required"
  | "plan_input_invalid"
  | "assessment_required"
  | "plan_adjustment_pending"
  | "draft_recovery"
  | "plan_recovery"
  | "assessment_history_invalid"
  | "confirmation_unavailable";

export interface HouseholdRunwayInterviewRuntimeIssue {
  readonly code: HouseholdRunwayInterviewRuntimeIssueCode;
}

export type HouseholdRunwayInterviewRuntimeOperationStatus =
  | "idle"
  | "pending"
  | "succeeded"
  | "failed";

export type HouseholdRunwayInterviewRuntimeOperationError =
  | "authentication_required"
  | "capability_unavailable"
  | "conflict"
  | "exception"
  | "invalid"
  | "network"
  | "storage_unavailable"
  | "download_failed"
  | "analytics_failed";

export interface HouseholdRunwayInterviewRuntimeOperation {
  readonly status: HouseholdRunwayInterviewRuntimeOperationStatus;
  readonly error?: HouseholdRunwayInterviewRuntimeOperationError;
}

export interface HouseholdRunwayInterviewRuntimeOperations {
  readonly draftSynchronization: HouseholdRunwayInterviewRuntimeOperation;
  readonly deviceDraft: HouseholdRunwayInterviewRuntimeOperation;
  readonly planPersistence: HouseholdRunwayInterviewRuntimeOperation;
  readonly reportDownload: HouseholdRunwayInterviewRuntimeOperation;
  readonly analytics: HouseholdRunwayInterviewRuntimeOperation;
}

/** User actions accepted by the Runtime. Protocol messages are deliberately absent. */
const RUNTIME_COMMAND_INTENT_TYPES = [
  "start",
  "start_new",
  "select_country",
  "select_region",
  "select_currency",
  "request_currency_change",
  "reset_currency_entries",
  "retain_currency_entries",
  "set_household",
  "set_employment",
  "set_income",
  "set_cash",
  "set_asset",
  "set_expense_mode",
  "set_quick_expenses",
  "set_expense_category_mode",
  "set_expense_category_subtotal",
  "set_expense_item",
  "set_housing_tenure",
  "update_answers",
  "select_scenario",
  "set_plan_adjustment",
  "reset_plan_adjustment",
  "apply_plan_adjustment",
  "edit_completed_plan",
  "set_active_expense_category",
  "set_reduction",
  "continue",
  "back",
  "skip",
  "discard_draft",
  "clear_device_draft",
  "remember_draft",
  "import_draft",
  "resume_draft",
  "resume_committed_plan",
  "save_plan",
  "request_report_download",
] as const satisfies readonly HouseholdRunwayInterviewCommandInput["type"][];

const RUNTIME_INTENT_TYPES = [
  ...RUNTIME_COMMAND_INTENT_TYPES,
  "set_other_income_source_enabled",
  "update_other_income_source",
  "add_other_income_source",
  "remove_other_income_source",
  "registration_clicked",
] as const;

type RuntimeCommandIntent = Extract<
  HouseholdRunwayInterviewCommandInput,
  { type: (typeof RUNTIME_COMMAND_INTENT_TYPES)[number] }
>;

type HouseholdRunwayOtherIncomeSourceType = Exclude<
  RecurringIncomeSource["type"],
  "other"
>;

type HouseholdRunwayRuntimeSemanticIntent =
  | {
      type: "set_other_income_source_enabled";
      sourceType: HouseholdRunwayOtherIncomeSourceType;
      enabled: boolean;
    }
  | {
      type: "update_other_income_source";
      id: string;
      patch: Partial<
        Pick<RecurringIncomeSource, "label" | "monthly_cents" | "confidence">
      >;
    }
  | { type: "add_other_income_source" }
  | { type: "remove_other_income_source"; id: string }
  | { type: "registration_clicked" };

/** The only user actions a Runtime caller may dispatch. */
export type HouseholdRunwayInterviewIntent =
  | Exclude<RuntimeCommandIntent, { type: "start" | "start_new" | "resume_draft" }>
  | { type: "start"; stage?: HouseholdRunwayInterviewStage }
  | { type: "start_new" }
  | { type: "resume_draft" }
  | { type: "save_plan" }
  | HouseholdRunwayRuntimeSemanticIntent;

export type HouseholdRunwayInterviewRuntimeLifecycle =
  | "idle"
  | "initializing"
  | "ready"
  | "disposed";

export type HouseholdRunwayInterviewRuntimeDeepReadonly<T> =
  T extends (...args: infer Args) => infer Result
    ? (...args: Args) => Result
    : T extends readonly (infer Item)[]
      ? readonly HouseholdRunwayInterviewRuntimeDeepReadonly<Item>[]
      : T extends object
        ? {
            readonly [Key in keyof T]: HouseholdRunwayInterviewRuntimeDeepReadonly<T[Key]>;
          }
        : T;

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

export type HouseholdRunwayHistoryComparison =
  | { kind: "noPrevious" }
  | {
      kind: "incomparable";
      reason:
        | "scenarioChanged"
        | "modelChanged"
        | "scenarioAndModelChanged";
    }
  | { kind: "unchanged" }
  | { kind: "monthsChanged"; deltaMonths: number }
  | { kind: "becameSustainable" }
  | { kind: "leftSustainable" };

export type HouseholdRunwayAssessmentSnapshotFact = {
  id: string;
  scenario: RunwayScenario;
  modelVersion: string;
  createdAt: string;
  outcome:
    | { kind: "sustainable" }
    | { kind: "depletes"; monthsCovered: number };
  comparisonToPrevious: HouseholdRunwayHistoryComparison;
};

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

export type HouseholdRunwayInterviewRuntimeConfirmationAction =
  | "start_over"
  | "discard_work"
  | "clear_draft";

export interface HouseholdRunwayInterviewRuntimeConfirmation {
  readonly status: "idle" | "pending";
  readonly action?: HouseholdRunwayInterviewRuntimeConfirmationAction;
}

export interface HouseholdRunwayInterviewRuntimeConfirmationRequest {
  readonly action: HouseholdRunwayInterviewRuntimeConfirmationAction;
}

export type HouseholdRunwayInterviewRuntimeDraftRequest = HouseholdRunwayDraftState;

export interface HouseholdRunwayInterviewRuntimePlanRequest {
  readonly inputs: HouseholdRunwayAnswers;
  readonly assessment: SuccessfulHouseholdRunwayAssessment;
  readonly expectedPlanRevision: number;
  readonly adjustments: RunwayAdjustments;
  readonly snapshotTrigger: RunwaySnapshotSummary["trigger"];
  readonly idempotencyKey: string;
  readonly snapshotActionId: string;
}

export interface HouseholdRunwayInterviewRuntimePlanResult {
  planRevision: number;
  planInputs: HouseholdRunwayAnswers;
  assessment: SuccessfulHouseholdRunwayAssessment;
  snapshot?: RunwaySnapshotSummary;
  snapshots?: readonly RunwaySnapshotSummary[];
}

export interface HouseholdRunwayInterviewRuntimePlanFailure {
  success: false;
  error:
    | "authentication_required"
    | "capability_unavailable"
    | "conflict"
    | "exception"
    | "invalid"
    | "network";
  currentPlanRevision?: number;
}

export type HouseholdRunwayInterviewRuntimePlanOutcome =
  | HouseholdRunwayInterviewRuntimePlanResult
  | HouseholdRunwayInterviewRuntimePlanFailure;

export interface HouseholdRunwayInterviewRuntimePlanRestore {
  readonly plan?: HouseholdRunwayPlan | null;
  readonly snapshots?: readonly RunwaySnapshotSummary[];
}

export interface HouseholdRunwayInterviewRuntimeReportRequest {
  readonly assessment: SuccessfulHouseholdRunwayAssessment;
  readonly locale: RunwayLocale;
}

export type HouseholdRunwayInterviewRuntimeReportOutcome =
  | { success: true }
  | {
      success: false;
      error: "capability_unavailable" | "download_failed" | "exception";
    };

export interface HouseholdRunwayInterviewRuntimeCapabilities {
  /** Restores decoded Draft/Plan state. Storage keys and codec envelopes stay private to the host. */
  restore?: () => unknown | PromiseLike<unknown>;
  /** Restores authenticated committed Plan facts and Assessment history. */
  restorePlan?: () =>
    | HouseholdRunwayInterviewRuntimePlanRestore
    | PromiseLike<HouseholdRunwayInterviewRuntimePlanRestore>;
  /** Provides semantic confirmation for destructive user intents. */
  confirm?: (
    request: HouseholdRunwayInterviewRuntimeConfirmationRequest,
  ) => boolean | Promise<boolean>;
  navigate?: (request: {
    action: "push" | "replace" | "back";
    destination: "landing" | "interview";
  }) => void;
  focus?: (stage: HouseholdRunwayInterviewStage) => void;
  synchronizeDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  rememberDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  importDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  clearDraft?: (request: {
    scope: "device" | "all";
  }) => boolean | void | Promise<boolean | void>;
  persistPlan?: (
    request: HouseholdRunwayInterviewRuntimePlanRequest,
  ) =>
    | HouseholdRunwayInterviewRuntimePlanOutcome
    | Promise<HouseholdRunwayInterviewRuntimePlanOutcome>;
  downloadReport?: (
    request: HouseholdRunwayInterviewRuntimeReportRequest,
  ) =>
    | boolean
    | void
    | HouseholdRunwayInterviewRuntimeReportOutcome
    | Promise<
        | boolean
        | void
        | HouseholdRunwayInterviewRuntimeReportOutcome
      >;
  trackAnalytics?: (request: {
    eventName: HouseholdRunwayAnalyticsEventKind;
    stage?: HouseholdRunwayAnalyticsStage;
  }) => boolean | void | Promise<boolean | void>;
}

export interface HouseholdRunwayInterviewRuntimeOptions {
  /** Injected so deterministic command identities can be controlled by a host. */
  createId?: () => string;
  /** Injected clock used only when an intent is dispatched. */
  now?: () => string;
  /** External work is scheduled after the synchronous snapshot transition. */
  schedule?: (task: () => void) => void;
  /** The host uses this only to classify lifecycle analytics for the landing screen. */
  authenticated?: boolean;
  /** Current presentation locale, kept outside the Interview state machine. */
  locale?: RunwayLocale;
  /** Starts a restored, conflict-free interview after initialization by default. */
  autoStart?: boolean;
  initialPlan?: HouseholdRunwayPlan | null;
  initialSnapshots?: readonly RunwaySnapshotSummary[];
}

export interface HouseholdRunwayInterviewRuntimeCompositionOptions
  extends HouseholdRunwayInterviewRuntimeOptions,
    HouseholdRunwayInterviewRuntimeCapabilities {}

export interface HouseholdRunwayInterviewRuntime {
  getSnapshot(): HouseholdRunwayInterviewRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  send(intent: HouseholdRunwayInterviewIntent): void;
  dispose(): void;
}

export type HouseholdRunwayInterviewRuntimeEnvironmentMessage =
  | {
      type: "history_projection_changed";
      destination: "landing" | "interview";
      stage?: HouseholdRunwayInterviewStage;
    }
  | { type: "locale_changed"; locale?: RunwayLocale };

export interface HouseholdRunwayInterviewRuntimeComposition {
  runtime: HouseholdRunwayInterviewRuntime;
  dispatchEnvironment(
    message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  ): void;
}

type RuntimeMessage =
  | { type: "start" }
  | { type: "restored"; payload?: unknown; failed?: boolean }
  | { type: "plan_restored"; payload?: unknown; failed?: boolean }
  | {
      type: "environment";
      message: HouseholdRunwayInterviewRuntimeEnvironmentMessage;
    }
  | { type: "intent"; intent: HouseholdRunwayInterviewIntent; confirmed?: boolean }
  | { type: "outcome"; command: HouseholdRunwayInterviewCommand }
  | { type: "synchronize_draft"; retryFailed: boolean }
  | {
      type: "confirmation";
      id: string;
      action: HouseholdRunwayInterviewRuntimeConfirmationAction;
      accepted: boolean;
      failed?: boolean;
    };

type MaybePromise<T> = T | PromiseLike<T>;

type RuntimeStoredDraft = {
  state: HouseholdRunwayDraftState;
  expiresAt?: string;
  source: "session" | "device";
};

type RuntimeRestorePayload = {
  session?:
    | { status: "missing" }
    | {
        status: "restored";
        state: HouseholdRunwayDraftState;
        expiresAt?: string;
        source?: "session" | "device";
      }
    | { status: "rejected"; code?: string };
  device?:
    | { status: "missing" }
    | {
        status: "restored";
        state: HouseholdRunwayDraftState;
        expiresAt?: string;
        source?: "session" | "device";
      }
    | { status: "rejected"; code?: string };
  deviceStorageConsent?: boolean;
  plan?:
    | { status: "missing" }
    | {
        status: "restored";
        plan: HouseholdRunwayPlan;
        snapshots?: readonly RunwaySnapshotSummary[];
      }
    | { status: "rejected"; code?: string };
  committedPlan?: HouseholdRunwayPlan | null;
  snapshots?: readonly RunwaySnapshotSummary[];
  assessmentHistory?: readonly RunwaySnapshotSummary[];
};

interface RuntimeStorageFacts {
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
}

const EMPTY_STORAGE_FACTS: RuntimeStorageFacts = {
  session: false,
  device: false,
  deviceStorageConsent: false,
};

const runtimeIntentTypeSet = new Set<string>(RUNTIME_INTENT_TYPES);

const PLAN_ADJUSTMENT_FIELDS = [
  "expense_reduction_cents",
  "added_cash_cents",
  "added_monthly_income_cents",
  "expected_unconfirmed_funds_cents",
  "usable_illiquid_investments_cents",
  "usable_retirement_tax_deferred_cents",
  "usable_retirement_tax_free_cents",
] as const satisfies readonly (keyof RunwayAdjustments)[];

function normalizedPlanAdjustmentCents(value: unknown, maximumCents: number) {
  let numeric: number;
  try {
    numeric = Number(value);
  } catch {
    return 0;
  }
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(maximumCents, Math.max(0, Math.round(numeric)));
}

function normalizePlanAdjustmentIntent(
  state: HouseholdRunwayInterviewState,
  intent: Extract<HouseholdRunwayInterviewIntent, { type: "set_plan_adjustment" }>,
): Extract<HouseholdRunwayInterviewIntent, { type: "set_plan_adjustment" }> {
  const planInputs = state.planInputs;
  const domainMaximums = planInputs
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
  const maximums: Record<keyof RunwayAdjustments, number> = {
    ...domainMaximums,
    added_cash_cents: MAX_CUSHION_AMOUNT_CENTS,
    added_monthly_income_cents: MAX_CUSHION_AMOUNT_CENTS,
    expected_unconfirmed_funds_cents: MAX_CUSHION_AMOUNT_CENTS,
  };
  const inputPatch =
    intent.patch && typeof intent.patch === "object" && !Array.isArray(intent.patch)
      ? intent.patch
      : {};
  const patch: Partial<RunwayAdjustments> = {};
  for (const field of PLAN_ADJUSTMENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(inputPatch, field)) {
      patch[field] = normalizedPlanAdjustmentCents(
        inputPatch[field],
        maximums[field],
      );
    }
  }
  return { ...intent, patch };
}

function isRuntimeIntent(value: unknown): value is HouseholdRunwayInterviewIntent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    runtimeIntentTypeSet.has(value.type)
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function clonePublicValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clonePublicValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        clonePublicValue(item),
      ]),
    ) as T;
  }
  return value;
}

function snapshotSignature(snapshot: HouseholdRunwayInterviewRuntimeSnapshot) {
  return JSON.stringify(snapshot);
}

function defaultId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .replace(
        /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
        "$1-$2-$3-$4-$5",
      );
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function defaultSchedule(task: () => void) {
  task();
}

function commandMetadata(
  id: () => string,
  now: () => string,
  type: string,
): Pick<HouseholdRunwayInterviewCommand, "commandId" | "occurredAt"> {
  return {
    commandId: `${type}:${id()}`,
    occurredAt: now(),
  };
}

function draftCapabilityRequest(
  effect: Extract<
    HouseholdRunwayInterviewEffect,
    {
      type:
        | "draft_sync_requested"
        | "draft_device_remember_requested"
        | "draft_device_import_requested";
    }
  >,
): HouseholdRunwayInterviewRuntimeDraftRequest {
  return clonePublicValue({
    status: effect.status,
    stage: effect.stage,
    draft: effect.draft,
  });
}

function action(applicable: boolean): HouseholdRunwayActionApplicability {
  return applicable ? { applicable: true } : { applicable: false };
}

function actionsFor(
  state: HouseholdRunwayInterviewState,
  lifecycle: HouseholdRunwayInterviewRuntimeLifecycle,
  storage: RuntimeStorageFacts,
): HouseholdRunwayInterviewRuntimeActions {
  const screen = state.renderModel;
  const ready = lifecycle === "ready";
  const resultReady =
    ready &&
    state.status === "completed" &&
    state.assessment !== null &&
    screen.kind === "stage" &&
    screen.resultProjection.readiness === "ready";
  const completedResult =
    ready && state.status === "completed" && screen.kind === "stage";
  const collectingOrReviewing =
    state.status === "collecting" || state.status === "reviewing";
  const landingHasWork = screen.kind === "landing" && screen.hasDraft;
  const landingHasCommittedPlan =
    screen.kind === "landing" && state.committedPlan !== null;
  const resumeChoice = screen.kind === "resume_choice";
  const deviceOperationPending = state.operations.deviceDraft.status === "pending";
  return {
    start: action(
      ready &&
        screen.kind === "landing" &&
        !screen.hasDraft &&
        state.committedPlan === null,
    ),
    startNew: action(
      ready &&
        (landingHasWork || landingHasCommittedPlan || resumeChoice || completedResult),
    ),
    resumeDraft: action(ready && resumeChoice),
    resumePlan: action(ready && resumeChoice),
    importDraft: action(
      ready &&
        state.status !== "not_started" &&
        storage.device &&
        !storage.session &&
        !resumeChoice &&
        !deviceOperationPending,
    ),
    continue: action(ready && collectingOrReviewing),
    back: action(ready && collectingOrReviewing),
    skip: action(
      ready && (state.stage === "otherIncome" || state.stage === "assets"),
    ),
    discardDraft: action(
      ready &&
        (state.status !== "not_started" || storage.session || storage.device),
    ),
    rememberDraft: action(
      ready &&
        state.status !== "not_started" &&
        !storage.deviceStorageConsent &&
        !deviceOperationPending,
    ),
    clearDeviceDraft: action(
      ready && storage.device && storage.deviceStorageConsent && !deviceOperationPending,
    ),
    editCompletedPlan: action(resultReady),
    selectScenario: action(resultReady),
    setPlanAdjustment: action(resultReady),
    applyPlanAdjustment: action(resultReady),
    resetPlanAdjustment: action(resultReady),
    savePlan: action(resultReady),
    downloadReport: action(resultReady),
  };
}

function publicOperationFor(
  operation:
    | HouseholdRunwayInterviewState["operations"]["draftSynchronization"]
    | HouseholdRunwayInterviewState["operations"]["deviceDraft"]
    | HouseholdRunwayInterviewState["operations"]["planPersistence"]
    | HouseholdRunwayInterviewState["operations"]["reportDownload"]
    | HouseholdRunwayInterviewState["operations"]["analytics"],
): HouseholdRunwayInterviewRuntimeOperation {
  if (operation.status === "failed") {
    if (operation.error === "stale_result") {
      return { status: "idle" };
    }
    return {
      status: "failed",
      error: operation.error,
    };
  }
  return { status: operation.status === "dirty" ? "idle" : operation.status };
}

function publicOperationsFor(
  state: HouseholdRunwayInterviewState,
): HouseholdRunwayInterviewRuntimeOperations {
  return {
    draftSynchronization: publicOperationFor(
      state.operations.draftSynchronization,
    ),
    deviceDraft: publicOperationFor(state.operations.deviceDraft),
    planPersistence: publicOperationFor(state.operations.planPersistence),
    reportDownload: publicOperationFor(state.operations.reportDownload),
    analytics: publicOperationFor(state.operations.analytics),
  };
}

function publicIssueFor(
  issue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayInterviewRuntimeIssue | null {
  return issue ? { code: issue.code } : null;
}

const RUNWAY_SCENARIOS = new Set([
  "current",
  "mine_stops",
  "partner_stops",
  "both_stop",
]);

const RUNWAY_SNAPSHOT_TRIGGERS = new Set([
  "completed",
  "updated",
  "imported",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRunwaySnapshotSummary(
  value: unknown,
): value is RunwaySnapshotSummary {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (typeof value.trigger !== "string" || !RUNWAY_SNAPSHOT_TRIGGERS.has(value.trigger)) {
    return false;
  }
  if (
    typeof value.scenario !== "string" ||
    !RUNWAY_SCENARIOS.has(value.scenario) ||
    !isNonEmptyString(value.model_version) ||
    !isNonEmptyString(value.created_at) ||
    Number.isNaN(Date.parse(value.created_at)) ||
    typeof value.sustainable !== "boolean"
  ) {
    return false;
  }

  return value.sustainable
    ? value.months_covered === null
    : typeof value.months_covered === "number" &&
        Number.isFinite(value.months_covered) &&
        value.months_covered >= 0;
}

function validatedRunwaySnapshotHistory(
  value: unknown,
): RunwaySnapshotSummary[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const history: RunwaySnapshotSummary[] = [];
  for (const entry of value) {
    if (!isValidRunwaySnapshotSummary(entry) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    history.push(entry);
  }
  return history;
}

function historyOutcomeFor(
  snapshot: RunwaySnapshotSummary,
): HouseholdRunwayAssessmentSnapshotFact["outcome"] | null {
  if (snapshot.sustainable) {
    return snapshot.months_covered === null ? { kind: "sustainable" } : null;
  }
  return typeof snapshot.months_covered === "number" &&
    Number.isFinite(snapshot.months_covered) &&
    snapshot.months_covered >= 0
    ? { kind: "depletes", monthsCovered: snapshot.months_covered }
    : null;
}

function historyComparisonFor(
  current: RunwaySnapshotSummary,
  previous: RunwaySnapshotSummary | undefined,
): HouseholdRunwayHistoryComparison | null {
  if (!previous) return { kind: "noPrevious" };

  const currentOutcome = historyOutcomeFor(current);
  const previousOutcome = historyOutcomeFor(previous);
  if (!currentOutcome || !previousOutcome) return null;

  const scenarioChanged = current.scenario !== previous.scenario;
  const modelChanged = current.model_version !== previous.model_version;
  if (scenarioChanged || modelChanged) {
    return {
      kind: "incomparable",
      reason:
        scenarioChanged && modelChanged
          ? "scenarioAndModelChanged"
          : scenarioChanged
            ? "scenarioChanged"
            : "modelChanged",
    };
  }

  if (currentOutcome.kind === "sustainable" && previousOutcome.kind === "sustainable") {
    return { kind: "unchanged" };
  }
  if (currentOutcome.kind === "sustainable") return { kind: "becameSustainable" };
  if (previousOutcome.kind === "sustainable") return { kind: "leftSustainable" };

  const currentMonths = currentOutcome.monthsCovered;
  const previousMonths = previousOutcome.monthsCovered;
  if (currentMonths === previousMonths) return { kind: "unchanged" };
  return { kind: "monthsChanged", deltaMonths: currentMonths - previousMonths };
}

function focusedHistoryFor(
  history: readonly RunwaySnapshotSummary[],
): HouseholdRunwayAssessmentSnapshotFact[] {
  return history.flatMap((snapshot, index) => {
    const outcome = historyOutcomeFor(snapshot);
    const comparisonToPrevious = historyComparisonFor(snapshot, history[index + 1]);
    return outcome
      && comparisonToPrevious
      ? [{
          id: snapshot.id,
          scenario: snapshot.scenario,
          modelVersion: snapshot.model_version,
          createdAt: snapshot.created_at,
          outcome,
          comparisonToPrevious,
        }]
      : [];
  });
}

function isDraftState(value: unknown): value is HouseholdRunwayDraftState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HouseholdRunwayDraftState>;
  return Boolean(
    candidate.draft &&
      typeof candidate.draft === "object" &&
      (candidate.status === "not_started" ||
        candidate.status === "collecting" ||
        candidate.status === "reviewing" ||
        candidate.status === "completed") &&
      (candidate.stage === null || typeof candidate.stage === "string"),
  );
}

function storedDraftFrom(
  value: RuntimeRestorePayload["session"] | RuntimeRestorePayload["device"] | undefined,
  fallbackSource: "session" | "device",
): RuntimeStoredDraft | null {
  return value?.status === "restored" && isDraftState(value.state)
    ? {
        state: value.state,
        source: value.source ?? fallbackSource,
        ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      }
    : null;
}

function restorePayloadFrom(value: unknown): RuntimeRestorePayload {
  if (!value || typeof value !== "object") return {};
  return value as RuntimeRestorePayload;
}

function restoredHistoryFrom(
  restored: RuntimeRestorePayload,
): { present: boolean; value: unknown } {
  if (restored.plan?.status === "restored" && "snapshots" in restored.plan) {
    return { present: true, value: restored.plan.snapshots };
  }
  if (Object.prototype.hasOwnProperty.call(restored, "assessmentHistory")) {
    return { present: true, value: restored.assessmentHistory };
  }
  if (Object.prototype.hasOwnProperty.call(restored, "snapshots")) {
    return { present: true, value: restored.snapshots };
  }
  return { present: false, value: undefined };
}

function directPlanFrom(value: unknown): HouseholdRunwayPlan | null | undefined {
  if (value === null) return null;
  if (
    value &&
    typeof value === "object" &&
    "revision" in value &&
    "inputs" in value
  ) {
    return value as HouseholdRunwayPlan;
  }
  return undefined;
}

function hasRestorationStatus(
  value: unknown,
): value is { status: "missing" | "restored" | "rejected" } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      (value.status === "missing" ||
        value.status === "restored" ||
        value.status === "rejected"),
  );
}

function restorationNeedsRecovery(value: unknown): boolean {
  if (value === undefined) return false;
  if (!hasRestorationStatus(value)) return true;
  if (value.status !== "restored") return value.status === "rejected";
  return !isDraftState((value as { state?: unknown }).state);
}

function isPlanPersistenceFailure(
  value: unknown,
): value is HouseholdRunwayInterviewRuntimePlanFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      "success" in value &&
      value.success === false,
  );
}

function draftFactsFor(
  state: HouseholdRunwayInterviewState,
  storage: RuntimeStorageFacts,
): HouseholdRunwayInterviewRuntimeDraftFacts {
  return {
    current:
      state.status !== "not_started" ||
      state.draft.revision > 0 ||
      state.draft.interviewId !== null,
    stored: storage.session || storage.device,
    session: storage.session,
    device: storage.device,
    deviceStorageConsent: storage.deviceStorageConsent,
    synchronized: state.operations.draftSynchronization.status === "succeeded",
  };
}

function projectScreen(
  screen: HouseholdRunwayInterviewRenderModel,
  assessmentHistory: readonly RunwaySnapshotSummary[],
): HouseholdRunwayInterviewRuntimeScreenProjection {
  switch (screen.kind) {
    case "landing":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        hasDraft: screen.hasDraft,
        draftCompleted: screen.draftCompleted,
        resumeStage: screen.resumeStage,
      };
    case "resume_choice":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        draftStatus: screen.draftStatus,
        draftStage: screen.draftStage,
        recommended: screen.recommended,
      };
    case "location":
      return {
        kind: screen.kind,
        stage: screen.stage,
        country: screen.country,
        region: screen.region,
        currency: screen.currency,
        currencyProposal: screen.currencyProposal,
        currencySelection: screen.currencySelection,
        availableCountries: screen.availableCountries,
        availableCurrencies: screen.availableCurrencies,
        canContinue: screen.canContinue,
        pendingCurrencyChange: screen.pendingCurrencyChange,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "household":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        sharesFinances: screen.sharesFinances,
        hasChildren: screen.hasChildren,
        hasSupportObligations: screen.hasSupportObligations,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "employment":
      return {
        kind: screen.kind,
        stage: screen.stage,
        mine: screen.mine,
        partner: screen.partner,
        sharesFinances: screen.sharesFinances,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "myIncome":
    case "partnerIncome":
      return {
        kind: screen.kind,
        stage: screen.stage,
        person: screen.person,
        income: screen.income,
        estimate: screen.estimate,
        location: screen.location,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "otherIncome":
      return {
        kind: screen.kind,
        stage: screen.stage,
        sources: screen.sources,
        totalMonthlyCents: screen.sources.reduce(
          (total, source) => total + source.monthly_cents,
          0,
        ),
        location: screen.location,
        optional: screen.optional,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "cash":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        availableCash: screen.availableCash,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "assets":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        assets: screen.assets,
        extremeAccess: screen.extremeAccess,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "expenses":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        mode: screen.mode,
        activeCategory: screen.activeCategory,
        housingTenure: screen.housingTenure,
        quickExpenses: screen.quickExpenses,
        expenseItems: screen.expenseItems,
        categoryModes: screen.categoryModes,
        categorySubtotals: screen.categorySubtotals,
        completedCategories: screen.completedCategories,
        categories: screen.categories,
        totals: screen.totals,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "reductions":
      return {
        kind: screen.kind,
        stage: screen.stage,
        location: screen.location,
        mode: screen.mode,
        quickExpenses: screen.quickExpenses,
        expenseItems: screen.expenseItems,
        categoryModes: screen.categoryModes,
        categorySubtotals: screen.categorySubtotals,
        totals: screen.totals,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "review":
      return {
        kind: screen.kind,
        stage: screen.stage,
        ...screen.reviewProjection,
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    case "stage":
      return screen.resultProjection.readiness === "ready"
        ? {
            kind: "result",
            stage: screen.stage,
            ...screen.resultProjection,
            history: focusedHistoryFor(assessmentHistory),
            availableStages: screen.availableStages,
            stageStatus: screen.stageStatus,
          }
        : {
            kind: "result",
            stage: screen.stage,
            readiness: "unavailable",
            availableStages: screen.availableStages,
            stageStatus: screen.stageStatus,
          };
  }
}

function snapshotFor(
  state: HouseholdRunwayInterviewState,
  lifecycle: HouseholdRunwayInterviewRuntimeLifecycle,
  storage: RuntimeStorageFacts = EMPTY_STORAGE_FACTS,
  runtimeIssues: readonly HouseholdRunwayInterviewRuntimeIssue[] = [],
  confirmation: HouseholdRunwayInterviewRuntimeConfirmation = { status: "idle" },
  assessmentHistory: readonly RunwaySnapshotSummary[] = [],
): HouseholdRunwayInterviewRuntimeSnapshot {
  const screen = state.renderModel;
  const issue =
    state.validationIssue ??
    ("blockingIssue" in screen ? screen.blockingIssue : null);
  return deepFreeze({
    lifecycle,
    interviewStatus: state.status,
    stage: state.stage,
    screen: clonePublicValue(projectScreen(screen, assessmentHistory)),
    plan: {
      exists: state.committedPlan !== null,
      current:
        state.committedPlan !== null &&
        householdRunwayDraftMatchesPlanContent(
          state.draft,
          state.committedPlan,
          state.status,
          state.stage,
        ),
    },
    draft: draftFactsFor(state, storage),
    issues: [...runtimeIssues, ...(issue ? [publicIssueFor(issue)!] : [])],
    operations: publicOperationsFor(state),
    confirmation,
    actions: actionsFor(state, lifecycle, storage),
  });
}

function outcomeCommand(
  id: () => string,
  now: () => string,
  input: HouseholdRunwayInterviewCommandInput,
): HouseholdRunwayInterviewCommand {
  return { ...input, ...commandMetadata(id, now, "outcome") } as HouseholdRunwayInterviewCommand;
}

export function createHouseholdRunwayInterviewRuntimeComposition(
  options: HouseholdRunwayInterviewRuntimeCompositionOptions = {},
): HouseholdRunwayInterviewRuntimeComposition {
  const createId = options.createId ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());
  const schedule = options.schedule ?? defaultSchedule;
  let locale = options.locale ?? "en";
  let state = createHouseholdRunwayInterview(options.initialPlan ?? null);
  let lifecycle: HouseholdRunwayInterviewRuntimeLifecycle = "idle";
  let started = false;
  let disposed = false;
  let storageFacts: RuntimeStorageFacts = { ...EMPTY_STORAGE_FACTS };
  const initialHistory =
    options.initialSnapshots === undefined
      ? []
      : validatedRunwaySnapshotHistory(options.initialSnapshots);
  let runtimeIssues: HouseholdRunwayInterviewRuntimeIssue[] =
    initialHistory === null ? [{ code: "assessment_history_invalid" }] : [];
  let committedPlan = options.initialPlan ?? null;
  let assessmentHistory: RunwaySnapshotSummary[] = clonePublicValue(
    initialHistory ?? [],
  );
  let confirmation: HouseholdRunwayInterviewRuntimeConfirmation = { status: "idle" };
  let pendingConfirmationIntent: HouseholdRunwayInterviewIntent | null = null;
  let pendingConfirmationId: string | null = null;
  let planBootstrapResolved = false;
  let restoredDraft: RuntimeStoredDraft | null = null;
  let restoredStartStage: HouseholdRunwayInterviewStage | undefined;
  let draftSyncScheduled = false;
  let draftSyncAttempt = 0;
  let startupPending = 0;
  let snapshot = snapshotFor(
    state,
    lifecycle,
    storageFacts,
    runtimeIssues,
    confirmation,
    assessmentHistory,
  );
  let draining = false;
  const messages: RuntimeMessage[] = [];
  const listeners = new Set<() => void>();

  const publish = () => {
    if (disposed) return;
    const next = snapshotFor(
      state,
      lifecycle,
      storageFacts,
      runtimeIssues,
      confirmation,
      assessmentHistory,
    );
    if (snapshotSignature(next) === snapshotSignature(snapshot)) return;
    snapshot = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A subscriber cannot prevent the Runtime from serving other subscribers.
      }
    }
  };

  const enqueue = (message: RuntimeMessage) => {
    if (disposed) return;
    messages.push(message);
    if (draining) return;
    draining = true;
    try {
      while (messages.length > 0 && !disposed) {
        const next = messages.shift();
        if (next) process(next);
      }
    } finally {
      draining = false;
    }
  };

  const enqueueOutcome = (
    createCommand: () => HouseholdRunwayInterviewCommand,
  ) => {
    if (!disposed) enqueue({ type: "outcome", command: createCommand() });
  };

  const applyAssessmentHistory = (value: unknown) => {
    const validated = validatedRunwaySnapshotHistory(value);
    if (validated === null) {
      assessmentHistory = [];
      if (!runtimeIssues.some((issue) => issue.code === "assessment_history_invalid")) {
        runtimeIssues = [
          ...runtimeIssues,
          { code: "assessment_history_invalid" },
        ];
      }
      return;
    }
    assessmentHistory = clonePublicValue(validated);
  };

  const applyRestoration = (payload: unknown, failed: boolean) => {
    const restored = restorePayloadFrom(payload);
    const session = storedDraftFrom(restored.session, "session");
    const device = storedDraftFrom(restored.device, "device");
    const eligibleDevice =
      restored.deviceStorageConsent === true ? device : null;
    storageFacts = {
      session: session?.source === "session",
      device: eligibleDevice?.source === "device",
      deviceStorageConsent: restored.deviceStorageConsent === true,
    };
    if (
      failed ||
      restorationNeedsRecovery(restored.session) ||
      restorationNeedsRecovery(restored.device) ||
      (device !== null && eligibleDevice === null)
    ) {
      runtimeIssues = [
        ...runtimeIssues.filter((issue) => issue.code !== "draft_recovery"),
        { code: "draft_recovery" },
      ];
    }

    const directRestoredPlan = directPlanFrom(restored.plan);
    if (restored.plan !== undefined || restored.committedPlan !== undefined) {
      planBootstrapResolved = true;
    }
    const restoredPlan =
      restored.plan?.status === "restored"
        ? restored.plan.plan
        : directRestoredPlan !== undefined
          ? directRestoredPlan
          : restored.committedPlan !== undefined
            ? restored.committedPlan
            : undefined;
    if (restored.plan?.status === "rejected") {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
    }
    if (restored.plan?.status === "missing") {
      committedPlan = null;
    } else if (restoredPlan !== undefined) {
      committedPlan = restoredPlan;
    }
    const restoredHistory = restoredHistoryFrom(restored);
    if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);

    const selected =
      session && eligibleDevice
        ? session.state.draft.revision > eligibleDevice.state.draft.revision
          ? session
          : eligibleDevice
        : session ?? eligibleDevice;
    restoredDraft = selected;
  };

  const applyPlanRestoration = (payload: unknown, failed: boolean) => {
    planBootstrapResolved = true;
    if (failed) {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
      return;
    }
    const restored = restorePayloadFrom(payload);
    const planValue = restored.plan;
    const directPlan = directPlanFrom(planValue);
    if (planValue?.status === "rejected") {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
      return;
    }
    if (planValue?.status === "missing" || directPlan === null) {
      committedPlan = null;
    } else if (planValue?.status === "restored") {
      committedPlan = planValue.plan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    } else if (directPlan !== undefined) {
      committedPlan = directPlan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    } else if (restored.committedPlan !== undefined) {
      committedPlan = restored.committedPlan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    }
  };

  const finishStartupPart = () => {
    startupPending -= 1;
    if (startupPending === 0) completeStartup();
  };

  const completeStartup = () => {
    if (disposed) return;
    if (restoredDraft) {
      const differsFromPlan = Boolean(
        committedPlan &&
          householdRunwayDraftDiffersFromPlan(
            restoredDraft.state.draft,
            committedPlan,
            restoredDraft.state.status,
            restoredDraft.state.stage,
          ),
      );
      state = createHouseholdRunwayInterview({
        status: "not_started",
        stage: null,
        draft: restoredDraft.state.draft,
        committedPlan,
        resumeChoice:
          differsFromPlan && committedPlan
            ? {
                draftStatus: restoredDraft.state.status,
                draftStage: restoredDraft.state.stage,
                recommended:
                  restoredDraft.state.draft.revision >= committedPlan.revision
                    ? "draft"
                    : "plan",
              }
            : null,
      });
      if (!differsFromPlan) {
        restoredStartStage =
          restoredDraft.state.status === "completed"
            ? "result"
            : restoredDraft.state.stage === "result"
              ? "result"
              : restoredDraft.state.stage ?? undefined;
      }
    } else if (planBootstrapResolved) {
      state = createHouseholdRunwayInterview(committedPlan);
    }
    if (
      (options.autoStart ?? true) &&
      state.status === "not_started" &&
      !state.resumeChoice
    ) {
      const interviewId = createId();
      applyCommand(
        {
          type: "start",
          interviewId,
          ...(restoredStartStage ? { stage: restoredStartStage } : {}),
          commandId: `start:${interviewId}`,
          occurredAt: now(),
        },
        false,
      );
    }
    lifecycle = "ready";
    publish();
    if (
      options.authenticated !== true &&
      state.renderModel.kind === "landing"
    ) {
      beginAnalytics("landing_view", "landing");
    }
  };

  const beginRestoration = () => {
    if (!options.restore) {
      finishStartupPart();
      return;
    }
    try {
      queueMicrotask(() => {
        if (disposed) return;
        try {
          schedule(() => {
            if (disposed) return;
            let result: MaybePromise<unknown>;
            try {
              result = options.restore!();
            } catch {
              enqueue({ type: "restored", failed: true });
              return;
            }
            Promise.resolve(result).then(
              (value) => enqueue({ type: "restored", payload: value }),
              () => enqueue({ type: "restored", failed: true }),
            );
          });
        } catch {
          enqueue({ type: "restored", failed: true });
        }
      });
    } catch {
      enqueue({ type: "restored", failed: true });
    }
  };

  const beginPlanRestoration = () => {
    if (!options.restorePlan) {
      finishStartupPart();
      return;
    }
    try {
      queueMicrotask(() => {
        if (disposed) return;
        try {
          schedule(() => {
            if (disposed) return;
            let result: MaybePromise<HouseholdRunwayInterviewRuntimePlanRestore>;
            try {
              result = options.restorePlan!();
            } catch {
              enqueue({ type: "plan_restored", failed: true });
              return;
            }
            Promise.resolve(result).then(
              (value) => enqueue({ type: "plan_restored", payload: value }),
              () => enqueue({ type: "plan_restored", failed: true }),
            );
          });
        } catch {
          enqueue({ type: "plan_restored", failed: true });
        }
      });
    } catch {
      enqueue({ type: "plan_restored", failed: true });
    }
  };

  const invoke = <T>(
    task: (() => MaybePromise<T>) | undefined,
    onSuccess: (value: T) => HouseholdRunwayInterviewCommand,
    onFailure: () => HouseholdRunwayInterviewCommand,
    synchronous = false,
  ) => {
    let result: MaybePromise<T>;
    try {
      if (!task) {
        enqueueOutcome(onFailure);
        return;
      }
      result = task();
    } catch {
      enqueueOutcome(onFailure);
      return;
    }
    const isPromiseLike =
      result &&
      typeof result === "object" &&
      "then" in result &&
      typeof result.then === "function";
    if (!synchronous || isPromiseLike) {
      Promise.resolve(result).then(
        (value) => enqueueOutcome(() => onSuccess(value)),
        () => enqueueOutcome(onFailure),
      );
      return;
    }
    enqueueOutcome(() => onSuccess(result as T));
  };

  const updateStorageFacts = (next: Partial<RuntimeStorageFacts>) => {
    storageFacts = { ...storageFacts, ...next };
  };

  const executeEffect = (
    effect: HouseholdRunwayInterviewEffect,
    synchronous = false,
  ) => {
    if (disposed) return;
    if (effect.type === "history") {
      try {
        options.navigate?.({
          action: effect.action,
          destination: effect.destination,
        });
      } catch {
        // Navigation is a projection; a host failure cannot corrupt the Interview.
      }
      return;
    }
    if (effect.type === "focus") {
      try {
        options.focus?.(effect.stage);
      } catch {
        // Focus is best-effort presentation work.
      }
      return;
    }
    if (effect.type === "draft_sync_requested") {
      invoke(
        options.synchronizeDraft
          ? () => options.synchronizeDraft!(draftCapabilityRequest(effect))
          : undefined,
        (value) =>
          value === false
            ? outcomeCommand(createId, now, {
                type: "draft_synchronization_failed",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                error: "storage_unavailable",
              })
            : (() => {
                updateStorageFacts({
                  session: true,
                });
                return outcomeCommand(createId, now, {
                  type: "draft_synchronization_succeeded",
                  sourceRevision: effect.sourceRevision,
                  correlationId: effect.correlationId,
                });
              })(),
        () =>
          outcomeCommand(createId, now, {
            type: "draft_synchronization_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "storage_unavailable",
          }),
        synchronous,
      );
      return;
    }
    if (
      effect.type === "draft_device_remember_requested" ||
      effect.type === "draft_device_import_requested"
    ) {
      const action: Extract<HouseholdRunwayDraftDeviceAction, "remember" | "import"> =
        effect.type === "draft_device_remember_requested" ? "remember" : "import";
      const task = action === "remember" ? options.rememberDraft : options.importDraft;
      invoke(
        task ? () => task(draftCapabilityRequest(effect)) : undefined,
        (value) =>
          value === false
            ? outcomeCommand(createId, now, {
                type: "draft_device_operation_failed",
                action,
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                error: "storage_unavailable",
              })
            : (() => {
                updateStorageFacts(
                  action === "remember"
                    ? { session: true, device: true, deviceStorageConsent: true }
                    : { session: true, device: false },
                );
                return outcomeCommand(createId, now, {
                  type: "draft_device_operation_succeeded",
                  action,
                  sourceRevision: effect.sourceRevision,
                  correlationId: effect.correlationId,
                });
              })(),
        () =>
          outcomeCommand(createId, now, {
            type: "draft_device_operation_failed",
            action,
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "storage_unavailable",
          }),
      );
      return;
    }
    if (effect.type === "draft_device_clear_requested") {
      invoke(
        options.clearDraft
          ? () => options.clearDraft!({ scope: effect.scope })
          : undefined,
        (value) =>
          value === false
            ? outcomeCommand(createId, now, {
                type: "draft_device_operation_failed",
                action: "clear",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                error: "storage_unavailable",
              })
            : (() => {
                updateStorageFacts(
                  effect.scope === "all"
                    ? { session: false, device: false, deviceStorageConsent: false }
                    : { device: false, deviceStorageConsent: false },
                );
                return outcomeCommand(createId, now, {
                  type: "draft_device_operation_succeeded",
                  action: "clear",
                  sourceRevision: effect.sourceRevision,
                  correlationId: effect.correlationId,
                });
              })(),
        () =>
          outcomeCommand(createId, now, {
            type: "draft_device_operation_failed",
            action: "clear",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "storage_unavailable",
          }),
      );
      return;
    }
    if (effect.type === "plan_persistence_requested") {
      if (!options.persistPlan) {
        enqueueOutcome(() =>
          outcomeCommand(createId, now, {
            type: "plan_persistence_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "capability_unavailable",
          }),
        );
        return;
      }
      let result: MaybePromise<HouseholdRunwayInterviewRuntimePlanOutcome>;
      try {
        const request: HouseholdRunwayInterviewRuntimePlanRequest = {
          inputs: clonePublicValue(effect.inputs),
          assessment: clonePublicValue(effect.assessment),
          expectedPlanRevision: effect.expectedPlanRevision,
          adjustments: clonePublicValue(effect.adjustments),
          snapshotTrigger: effect.snapshotTrigger,
          idempotencyKey: effect.idempotencyKey,
          snapshotActionId: effect.idempotencyKey,
        };
        result = options.persistPlan(request);
      } catch {
        enqueueOutcome(() =>
          outcomeCommand(createId, now, {
            type: "plan_persistence_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "exception",
          }),
        );
        return;
      }
      Promise.resolve(result).then(
        (value) => {
          if (isPlanPersistenceFailure(value)) {
            enqueueOutcome(() =>
              outcomeCommand(createId, now, {
                type: "plan_persistence_failed",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                ...(value.currentPlanRevision !== undefined
                  ? { currentPlanRevision: value.currentPlanRevision }
                  : {}),
                error: value.error,
              }),
            );
            return;
          }
          if (
            !value ||
            typeof value !== "object" ||
            typeof value.planRevision !== "number" ||
            !Number.isSafeInteger(value.planRevision) ||
            value.planRevision < 0 ||
            !value.planInputs ||
            typeof value.planInputs !== "object" ||
            !value.assessment ||
            typeof value.assessment !== "object"
          ) {
            enqueueOutcome(() =>
              outcomeCommand(createId, now, {
                type: "plan_persistence_failed",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                error: "exception",
              }),
            );
            return;
          }
          const successfulValue = value as HouseholdRunwayInterviewRuntimePlanResult;
          enqueueOutcome(() =>
            outcomeCommand(createId, now, {
              type: "plan_persistence_succeeded",
              sourceRevision: effect.sourceRevision,
              correlationId: effect.correlationId,
              planRevision: successfulValue.planRevision,
              planInputs: successfulValue.planInputs,
              assessment: successfulValue.assessment,
              ...(successfulValue.snapshot ? { snapshot: successfulValue.snapshot } : {}),
              ...(successfulValue.snapshots
                ? { snapshots: successfulValue.snapshots }
                : {}),
            }),
          );
        },
        () =>
          enqueueOutcome(() =>
            outcomeCommand(createId, now, {
              type: "plan_persistence_failed",
              sourceRevision: effect.sourceRevision,
              correlationId: effect.correlationId,
              error: "exception",
            }),
          ),
      );
      return;
    }
    if (effect.type === "report_download_requested") {
      const failure = (error: "capability_unavailable" | "download_failed" | "exception") =>
        outcomeCommand(createId, now, {
          type: "report_download_failed",
          sourceRevision: effect.sourceRevision,
          correlationId: effect.correlationId,
          error,
        });
      if (!options.downloadReport) {
        enqueueOutcome(() => failure("capability_unavailable"));
        return;
      }
      let result:
        | boolean
        | void
        | HouseholdRunwayInterviewRuntimeReportOutcome
        | PromiseLike<
            | boolean
            | void
            | HouseholdRunwayInterviewRuntimeReportOutcome
          >;
      try {
        result = options.downloadReport({
          assessment: clonePublicValue(effect.assessment),
          locale,
        });
      } catch {
        enqueueOutcome(() => failure("exception"));
        return;
      }
      Promise.resolve(result).then(
        (value) => {
          if (value === false) {
            enqueueOutcome(() => failure("download_failed"));
            return;
          }
          if (
            value &&
            typeof value === "object" &&
            "success" in value &&
            value.success === false
          ) {
            enqueueOutcome(() => failure(value.error));
            return;
          }
          enqueueOutcome(() =>
            outcomeCommand(createId, now, {
              type: "report_download_succeeded",
              sourceRevision: effect.sourceRevision,
              correlationId: effect.correlationId,
            }),
          );
        },
        () => enqueueOutcome(() => failure("exception")),
      );
      return;
    }
    if (effect.type === "analytics_requested") {
      invoke(
        options.trackAnalytics
          ? () => options.trackAnalytics!({ eventName: effect.eventName, stage: effect.stage })
          : undefined,
        (value) =>
          outcomeCommand(createId, now, {
            type: value === false ? "analytics_failed" : "analytics_succeeded",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
          }),
        () =>
          outcomeCommand(createId, now, {
            type: "analytics_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
          }),
      );
    }
  };

  const scheduleEffects = (
    effects: readonly HouseholdRunwayInterviewEffect[],
    immediately = false,
  ) => {
    if (effects.length === 0 || disposed) return;
    if (immediately) {
      for (const effect of effects) executeEffect(effect, true);
      return;
    }
    try {
      queueMicrotask(() => {
        if (disposed) return;
        schedule(() => {
          if (disposed) return;
          // Start every independent capability in this turn without awaiting one.
          for (const effect of effects) executeEffect(effect);
        });
      });
    } catch {
      // Scheduling is an adapter concern; the synchronous Interview state remains valid.
    }
  };

  const draftSynchronizationEligible = () =>
    !state.resumeChoice &&
    (state.status !== "not_started" ||
      state.draft.interviewId !== null ||
      (storageFacts.session || storageFacts.device));

  const scheduleDraftSynchronization = (retryFailed: boolean) => {
    if (!options.synchronizeDraft || !draftSynchronizationEligible() || draftSyncScheduled) return;
    const status = state.operations.draftSynchronization.status;
    if (status !== "dirty" && !(retryFailed && status === "failed")) return;
    draftSyncScheduled = true;
    try {
      queueMicrotask(() => {
        draftSyncScheduled = false;
        if (disposed || !draftSynchronizationEligible()) return;
        const currentStatus = state.operations.draftSynchronization.status;
        if (
          currentStatus !== "dirty" &&
          !(retryFailed && currentStatus === "failed")
        ) {
          return;
        }
        enqueue({ type: "synchronize_draft", retryFailed });
      });
    } catch {
      draftSyncScheduled = false;
    }
  };

  const requiresConfirmation = (
    intent: HouseholdRunwayInterviewIntent,
  ): HouseholdRunwayInterviewRuntimeConfirmationAction | null => {
    if (intent.type === "start_new") {
      const hasDraftOnLanding =
        state.renderModel.kind === "landing" && state.renderModel.hasDraft;
      const hasCurrentProgress = state.draft.revision > 1;
      return state.resumeChoice || hasDraftOnLanding || hasCurrentProgress
        ? "start_over"
        : null;
    }
    if (intent.type === "discard_draft") {
      return state.status !== "not_started" ||
        storageFacts.session ||
        storageFacts.device
        ? "discard_work"
        : null;
    }
    if (intent.type === "clear_device_draft") {
      return storageFacts.device ? "clear_draft" : null;
    }
    return null;
  };

  const commandInputsForIntent = (
    intent: HouseholdRunwayInterviewIntent,
  ): readonly HouseholdRunwayInterviewCommandInput[] => {
    const replaceOtherIncomeSources = (
      sources: readonly RecurringIncomeSource[],
    ): readonly HouseholdRunwayInterviewCommandInput[] => [
      { type: "set_other_income_sources", sources },
    ];

    if (intent.type === "registration_clicked") return [];

    if (intent.type === "set_plan_adjustment") {
      return [normalizePlanAdjustmentIntent(state, intent)];
    }

    if (intent.type === "continue") {
      const location = state.draft.location;
      if (
        state.stage === "location" &&
        location.currency === null &&
        location.proposedCurrency
      ) {
        return [
          { type: "select_currency", currency: location.proposedCurrency },
          intent,
        ];
      }
    }

    if (intent.type === "back") {
      if (
        state.renderModel.kind === "expenses" &&
        state.renderModel.activeCategory
      ) {
        return [
          {
            type: "complete_expense_category",
            category: state.renderModel.activeCategory,
          },
        ];
      }
      return [intent];
    }

    if (intent.type === "set_other_income_source_enabled") {
      if (state.renderModel.kind !== "otherIncome") return [];
      const existing = state.renderModel.sources.find(
        (source) => source.type === intent.sourceType,
      );
      if (intent.enabled) {
        return replaceOtherIncomeSources(
          existing
            ? state.renderModel.sources
            : [
                ...state.renderModel.sources,
                {
                  id: createId(),
                  type: intent.sourceType,
                  monthly_cents: 0,
                  confidence: "confirmed",
                },
              ],
        );
      }
      if (!existing) return [];
      return replaceOtherIncomeSources(
        state.renderModel.sources.filter((source) => source.id !== existing.id),
      );
    }

    if (intent.type === "update_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      if (!state.renderModel.sources.some((source) => source.id === intent.id)) {
        return [];
      }
      return replaceOtherIncomeSources(
        state.renderModel.sources.map((source) =>
          source.id === intent.id ? { ...source, ...intent.patch } : source,
        ),
      );
    }

    if (intent.type === "add_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      return replaceOtherIncomeSources([
        ...state.renderModel.sources,
        {
          id: createId(),
          type: "other",
          label: "",
          monthly_cents: 0,
          confidence: "confirmed",
        },
      ]);
    }

    if (intent.type === "remove_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      if (!state.renderModel.sources.some((source) => source.id === intent.id)) {
        return [];
      }
      return replaceOtherIncomeSources(
        state.renderModel.sources.filter((source) => source.id !== intent.id),
      );
    }

    return [intent as HouseholdRunwayInterviewCommandInput];
  };

  const beginAnalytics = (
    eventName: HouseholdRunwayAnalyticsEventKind,
    stage: HouseholdRunwayAnalyticsStage,
  ) => {
    if (
      disposed ||
      !options.trackAnalytics ||
      state.operations.analytics.status === "pending"
    ) {
      return;
    }
    applyCommand(
      {
        type: "request_analytics",
        eventName,
        stage,
        ...commandMetadata(createId, now, "analytics"),
      } as HouseholdRunwayInterviewCommand,
      true,
    );
  };

  const analyticsForIntent = (
    intent: HouseholdRunwayInterviewIntent,
    previousState: HouseholdRunwayInterviewState,
    nextState: HouseholdRunwayInterviewState,
  ): { eventName: HouseholdRunwayAnalyticsEventKind; stage: HouseholdRunwayAnalyticsStage } | null => {
    if (intent.type === "registration_clicked") {
      return { eventName: "registration_clicked", stage: "result" };
    }
    if (intent.type === "select_scenario") {
      return { eventName: "result_interaction", stage: "scenario_switch" };
    }
    if (
      intent.type === "continue" &&
      previousState.stage === "review" &&
      nextState.status === "completed"
    ) {
      return { eventName: "completed", stage: "result" };
    }
    return null;
  };

  const beginConfirmation = (
    action: HouseholdRunwayInterviewRuntimeConfirmationAction,
    intent: HouseholdRunwayInterviewIntent,
  ) => {
    if (confirmation.status === "pending" || disposed) return;
    const id = `${action}:${createId()}`;
    pendingConfirmationIntent = intent;
    pendingConfirmationId = id;
    confirmation = { status: "pending", action };
    publish();
    try {
      queueMicrotask(() => {
        if (disposed) return;
        if (!options.confirm) {
          enqueue({ type: "confirmation", id, action, accepted: false, failed: true });
          return;
        }
        let result: MaybePromise<boolean> = false;
        try {
          result = options.confirm({ action });
        } catch {
          enqueue({ type: "confirmation", id, action, accepted: false, failed: true });
          return;
        }
        Promise.resolve(result).then(
          (accepted) => enqueue({ type: "confirmation", id, action, accepted }),
          () => enqueue({ type: "confirmation", id, action, accepted: false, failed: true }),
        );
      });
    } catch {
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      confirmation = { status: "idle" };
      publish();
    }
  };

  const duplicatePendingIntent = (intent: HouseholdRunwayInterviewIntent) => {
    if (
      intent.type === "save_plan" &&
      state.operations.planPersistence.status === "pending"
    ) {
      return true;
    }
    if (
      intent.type === "request_report_download" &&
      state.operations.reportDownload.status === "pending"
    ) {
      return true;
    }
    if (
      (intent.type === "remember_draft" || intent.type === "import_draft") &&
      state.operations.deviceDraft.status === "pending" &&
      state.operations.deviceDraft.action ===
        (intent.type === "remember_draft" ? "remember" : "import")
    ) {
      return true;
    }
    return (
      (intent.type === "clear_device_draft" || intent.type === "discard_draft") &&
      state.operations.deviceDraft.status === "pending" &&
      state.operations.deviceDraft.action === "clear"
    );
  };

  const introducedStaleResult = (
    previousState: HouseholdRunwayInterviewState,
    nextState: HouseholdRunwayInterviewState,
  ) => {
    const operationNames = [
      "draftSynchronization",
      "deviceDraft",
      "planPersistence",
      "reportDownload",
      "analytics",
    ] as const;
    return operationNames.some((name) => {
      const previous = previousState.operations[name];
      const next = nextState.operations[name];
      return (
        !(previous.status === "failed" && previous.error === "stale_result") &&
        next.status === "failed" &&
        next.error === "stale_result"
      );
    });
  };

  const applyCommand = (
    command: HouseholdRunwayInterviewCommand,
    publishSnapshot: boolean,
    immediately = false,
  ) => {
    if (disposed) return;
    try {
      const previousState = state;
      const result = dispatchHouseholdRunwayInterview(previousState, command, {
        // Capability absence is surfaced by the Runtime effect boundary as a
        // typed unavailable outcome; authentication failures come back from
        // an injected persistence capability.
        planPersistence: "available",
        snapshotTrigger: state.committedPlan ? "updated" : "completed",
      });
      state = result.state;
      if (
        command.type === "plan_persistence_succeeded" &&
        result.state.operations.planPersistence.status === "succeeded" &&
        result.state.operations.planPersistence.correlationId === command.correlationId
      ) {
        if (command.snapshots !== undefined) {
          applyAssessmentHistory(command.snapshots);
        } else if (command.snapshot) {
          applyAssessmentHistory([
            command.snapshot,
            ...assessmentHistory.filter((item) => item.id !== command.snapshot?.id),
          ]);
        }
      }
      if (publishSnapshot && !introducedStaleResult(previousState, result.state)) {
        publish();
      }
      scheduleEffects(result.effects, immediately);
    } catch {
      // Malformed runtime values are safe no-ops at the facade boundary.
    }
  };

  function process(message: RuntimeMessage) {
    if (message.type === "start") {
      if (started || disposed) return;
      started = true;
      lifecycle = "initializing";
      startupPending =
        (options.restore ? 1 : 0) + (options.restorePlan ? 1 : 0);
      publish();
      if (options.restore) beginRestoration();
      if (options.restorePlan) beginPlanRestoration();
      if (startupPending === 0) completeStartup();
      return;
    }
    if (message.type === "restored") {
      if (!started || disposed || lifecycle !== "initializing") return;
      applyRestoration(message.payload, message.failed === true);
      finishStartupPart();
      return;
    }
    if (message.type === "plan_restored") {
      if (!started || disposed || lifecycle !== "initializing") return;
      applyPlanRestoration(message.payload, message.failed === true);
      finishStartupPart();
      return;
    }
    if (message.type === "environment") {
      if (!started || disposed || lifecycle !== "ready") return;
      if (message.message.type === "locale_changed") {
        if (message.message.locale) locale = message.message.locale;
        if (!draftSynchronizationEligible()) return;
        const status = state.operations.draftSynchronization.status;
        if (status !== "dirty" && status !== "failed") return;
        applyCommand(
          {
            type: "synchronize_draft",
            commandId: `synchronize_draft:${state.draft.revision}:${++draftSyncAttempt}`,
            occurredAt: now(),
          },
          true,
          true,
        );
        return;
      }
      const command = {
        ...message.message,
        ...(message.message.destination === "interview"
          ? { interviewId: createId() }
          : {}),
        ...commandMetadata(createId, now, "history_projection_changed"),
      } as HouseholdRunwayInterviewCommand;
      applyCommand(command, true);
      return;
    }
    if (message.type === "confirmation") {
      if (
        disposed ||
        confirmation.status !== "pending" ||
        pendingConfirmationId !== message.id ||
        confirmation.action !== message.action
      ) {
        return;
      }
      const intent = pendingConfirmationIntent;
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      if (message.failed) runtimeIssues = [{ code: "confirmation_unavailable" }];
      confirmation = { status: "idle" };
      publish();
      if (message.accepted === true && intent) {
        enqueue({ type: "intent", intent, confirmed: true });
      }
      return;
    }
    if (message.type === "synchronize_draft") {
      if (
        !draftSynchronizationEligible() ||
        (state.operations.draftSynchronization.status !== "dirty" &&
          !(message.retryFailed &&
            state.operations.draftSynchronization.status === "failed"))
      ) {
        return;
      }
      const command = {
        type: "synchronize_draft" as const,
        commandId: `synchronize_draft:${state.draft.revision}:${++draftSyncAttempt}`,
        occurredAt: now(),
      };
      applyCommand(command, true);
      return;
    }
    if (message.type === "outcome") {
      applyCommand(message.command, true);
      scheduleDraftSynchronization(false);
      return;
    }
    if (confirmation.status === "pending") return;
    const commandType = message.intent.type;
    if (duplicatePendingIntent(message.intent)) return;
    const confirmationAction = message.confirmed
      ? null
      : requiresConfirmation(message.intent);
    if (confirmationAction) {
      beginConfirmation(confirmationAction, message.intent);
      return;
    }
    const previousState = state;
    if (message.intent.type === "registration_clicked") {
      beginAnalytics("registration_clicked", "result");
      return;
    }
    const commandInputs = commandInputsForIntent(message.intent);
    for (const commandInput of commandInputs) {
      const input =
        commandInput.type === "start" ||
        commandInput.type === "start_new" ||
        commandInput.type === "resume_draft"
          ? { ...commandInput, interviewId: createId() }
          : commandInput;
      const command = {
        ...input,
        ...(commandInput.type === "save_plan"
          ? { commandId: createId(), occurredAt: now() }
          : commandMetadata(createId, now, commandType)),
      } as HouseholdRunwayInterviewCommand;
      applyCommand(command, true);
    }
    scheduleDraftSynchronization(true);
    const analytics = analyticsForIntent(message.intent, previousState, state);
    if (analytics) beginAnalytics(analytics.eventName, analytics.stage);
  }

  const runtime: HouseholdRunwayInterviewRuntime = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (!started && !disposed) enqueue({ type: "start" });
    },
    send(intent) {
      if (!started || disposed || lifecycle !== "ready" || !isRuntimeIntent(intent)) return;
      enqueue({ type: "intent", intent });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle = "disposed";
      listeners.clear();
      messages.length = 0;
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      snapshot = snapshotFor(
        state,
        lifecycle,
        storageFacts,
        runtimeIssues,
        confirmation,
        assessmentHistory,
      );
    },
  };

  const dispatchEnvironment = (
    message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  ) => {
    if (!disposed) enqueue({ type: "environment", message });
  };

  return { runtime, dispatchEnvironment };
}

export function createHouseholdRunwayInterviewRuntimeWithCapabilities(
  options: HouseholdRunwayInterviewRuntimeCompositionOptions = {},
): HouseholdRunwayInterviewRuntime {
  return createHouseholdRunwayInterviewRuntimeComposition(options).runtime;
}
