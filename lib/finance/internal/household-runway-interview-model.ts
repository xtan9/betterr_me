/** Private Interview state, Draft facts, and operation states. */

import type {
  RunwaySnapshotSummary,
  ExpenseCategoryMode,
  RunwayCountry,
  RunwayCurrency,
  HouseholdRunwayAnswers,
  RunwayScenario,
  ScenarioOption,
  RunwayAdjustments,
} from "@/lib/finance/cushion";

import type { ExpenseCategory } from "@/lib/finance/runway-expenses";

import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

import type { HouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

import type {
  HouseholdRunwayInterviewResumeChoice,
  HouseholdRunwayInterviewRenderModel,
  HouseholdRunwayLandingRenderModel,
  HouseholdRunwayResumeChoiceRenderModel,
  HouseholdRunwayReviewRenderModel,
  HouseholdRunwayGenericStageRenderModel,
} from "./household-runway-interview-projections";

/**
 * Framework-independent Household Runway Interview behavior.
 *
 * Adapters supply command metadata and interpret the returned render model,
 * events, and effects. This module intentionally does not read clocks,
 * randomness, React, the DOM, browser storage, network state, or localization.
 */

export const HOUSEHOLD_RUNWAY_INTERVIEW_VERSION = 2 as const;

export const HOUSEHOLD_RUNWAY_COUNTRIES = ["US", "CA", "CN", "TW"] as const;

export const HOUSEHOLD_RUNWAY_CURRENCIES = [
  "USD",
  "CAD",
  "CNY",
  "TWD",
] as const;

export const HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS = [
  "location",
  "household",
  "employment",
  "myIncome",
  "partnerIncome",
  "otherIncome",
  "cash",
  "assets",
  "expenses",
  "reductions",
  "review",
  "result",
] as const;

/** Alias for callers that describe the ordered graph as stages. */
export const HOUSEHOLD_RUNWAY_INTERVIEW_STAGES =
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS;

export type Country = (typeof HOUSEHOLD_RUNWAY_COUNTRIES)[number];

export type Currency = (typeof HOUSEHOLD_RUNWAY_CURRENCIES)[number];

export const HOUSEHOLD_RUNWAY_ASSET_KEYS = [
  "liquid_investments",
  "illiquid_investments",
  "home_equity",
  "retirement_tax_deferred",
  "retirement_tax_free",
] as const;

export type HouseholdRunwayAssetKey =
  (typeof HOUSEHOLD_RUNWAY_ASSET_KEYS)[number];

export type HouseholdRunwayInterviewOperationError =
  | "authentication_required"
  | "capability_unavailable"
  | "conflict"
  | "exception"
  | "invalid"
  | "network"
  | "stale_result"
  | "storage_unavailable"
  | "download_failed"
  | "analytics_failed";

export type HouseholdRunwayDraftSynchronizationOperation =
  | { status: "idle" }
  | { status: "dirty"; sourceRevision: number }
  | {
      status: "pending";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      status: "succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      status: "failed";
      sourceRevision: number;
      correlationId: string;
      error: Extract<
        HouseholdRunwayInterviewOperationError,
        "stale_result" | "storage_unavailable"
      >;
    };

export type HouseholdRunwayDraftDeviceAction = "remember" | "import" | "clear";

export type HouseholdRunwayDraftDeviceOperation =
  | { status: "idle" }
  | {
      status: "pending";
      action: HouseholdRunwayDraftDeviceAction;
      sourceRevision: number;
      correlationId: string;
      scope?: "device" | "all";
    }
  | {
      status: "succeeded";
      action: HouseholdRunwayDraftDeviceAction;
      sourceRevision: number;
      correlationId: string;
    }
  | {
      status: "failed";
      action: HouseholdRunwayDraftDeviceAction;
      sourceRevision: number;
      correlationId: string;
      error: "storage_unavailable" | "stale_result";
    };

export type HouseholdRunwayPlanPersistenceOperation =
  | { status: "idle" }
  | { status: "dirty"; sourceRevision: number }
  | {
      status: "pending";
      sourceRevision: number;
      correlationId: string;
      expectedPlanRevision: number;
      idempotencyKey: string;
      snapshotTrigger: RunwaySnapshotSummary["trigger"];
    }
  | {
      status: "succeeded";
      sourceRevision: number;
      correlationId: string;
      planRevision: number;
      idempotencyKey: string;
      snapshotTrigger: RunwaySnapshotSummary["trigger"];
      snapshot?: RunwaySnapshotSummary;
    }
  | {
      status: "failed";
      sourceRevision: number;
      correlationId: string;
      idempotencyKey: string;
      snapshotTrigger: RunwaySnapshotSummary["trigger"];
      currentPlanRevision?: number;
      error: Extract<
        HouseholdRunwayInterviewOperationError,
        | "authentication_required"
        | "capability_unavailable"
        | "conflict"
        | "exception"
        | "invalid"
        | "network"
        | "stale_result"
      >;
    };

export type HouseholdRunwayReportDownloadOperation =
  | { status: "idle" }
  | { status: "pending"; sourceRevision: number; correlationId: string }
  | {
      status: "succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      status: "failed";
      sourceRevision: number;
      correlationId: string;
      error:
        | "capability_unavailable"
        | "download_failed"
        | "exception"
        | "stale_result";
    };

export type HouseholdRunwayAnalyticsOperation =
  | { status: "idle" }
  | { status: "pending"; sourceRevision: number; correlationId: string }
  | {
      status: "succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      status: "failed";
      sourceRevision: number;
      correlationId: string;
      error: "analytics_failed" | "stale_result";
    };

export interface HouseholdRunwayInterviewOperations {
  draftSynchronization: HouseholdRunwayDraftSynchronizationOperation;
  deviceDraft: HouseholdRunwayDraftDeviceOperation;
  planPersistence: HouseholdRunwayPlanPersistenceOperation;
  reportDownload: HouseholdRunwayReportDownloadOperation;
  analytics: HouseholdRunwayAnalyticsOperation;
}

export interface HouseholdRunwayInterviewCapabilities {
  /** Durable Plan persistence is an injected capability, never auth state. */
  planPersistence?: "available" | "unavailable";
  /** The authenticated adapter identifies the origin of the first commit. */
  snapshotTrigger?: RunwaySnapshotSummary["trigger"];
}

export interface HouseholdRunwayExpenseCategoryProgress {
  category: ExpenseCategory;
  mode: ExpenseCategoryMode | null;
  currentMonthlyCents: number;
  interruptionMonthlyCents: number;
  completed: boolean;
}

export type HouseholdRunwayInterviewStage =
  (typeof HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS)[number];

export type HouseholdRunwayCurrencySelection =
  | "unset"
  | "proposed"
  | "explicit";

export type HouseholdRunwayInterviewStatus =
  | "not_started"
  | "collecting"
  | "reviewing"
  | "completed";

export type HouseholdRunwayInterviewStageStatus =
  | "pending"
  | "completed"
  | "skipped"
  | "inapplicable";

export interface HouseholdRunwayInterviewLocation {
  country: RunwayCountry | null;
  region: string | null;
  /** A proposed currency remains null until a person explicitly confirms it. */
  currency: RunwayCurrency | null;
  proposedCurrency: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
}

/** The working answer shape before location has been completed. */
export type HouseholdRunwayInterviewAnswers = Omit<
  HouseholdRunwayAnswers,
  "country" | "region" | "currency" | "updated_at"
> & {
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
  updated_at: string | null;
};

export type HouseholdRunwayValidationIssueCode =
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
  | "plan_adjustment_pending";

export interface HouseholdRunwayValidationIssue {
  code: HouseholdRunwayValidationIssueCode;
  stage?: HouseholdRunwayInterviewStage;
  path?: readonly (string | number)[];
}

export interface HouseholdRunwayPendingCurrencyChange {
  currency: RunwayCurrency;
  monetaryEntryCount: number;
}

export type HouseholdRunwayInterviewStageStatusMap = Record<
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewStageStatus
>;

export interface HouseholdRunwayInterviewDraft {
  revision: number;
  interviewId: string | null;
  startedAt: string | null;
  location: HouseholdRunwayInterviewLocation;
  answers: HouseholdRunwayInterviewAnswers;
  stageStatus: HouseholdRunwayInterviewStageStatusMap;
  validationIssues: Partial<
    Record<HouseholdRunwayInterviewStage, HouseholdRunwayValidationIssue | null>
  >;
  selectedScenario: RunwayScenario | null;
  availableScenarios: ScenarioOption[];
  /** Provisional overlay; it is intentionally not part of Scenario selection. */
  planAdjustment: RunwayAdjustments;
  pendingCurrencyChange: HouseholdRunwayPendingCurrencyChange | null;
  activeExpenseCategory: ExpenseCategory | null;
}

export type HouseholdRunwayDraftNormalizationOutcome =
  | {
      success: true;
      planInputs: HouseholdRunwayAnswers;
    }
  | {
      success: false;
      validationIssues: readonly HouseholdRunwayValidationIssue[];
    };

interface HouseholdRunwayInterviewStateBase {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: HouseholdRunwayInterviewDraft;
  /** The last explicitly committed Plan, if one exists. */
  committedPlan: HouseholdRunwayPlan | null;
  /** A durable Draft and committed Plan are both available until a choice is made. */
  resumeChoice: HouseholdRunwayInterviewResumeChoice | null;
  /** Draft synchronization, Plan persistence, download, and analytics are independent. */
  operations: HouseholdRunwayInterviewOperations;
  validationIssue: HouseholdRunwayValidationIssue | null;
  /** Complete Plan inputs exist only after a successful review normalization. */
  planInputs: HouseholdRunwayAnswers | null;
  /** Assessment is derived from planInputs and never persisted as Interview state. */
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  renderModel: HouseholdRunwayInterviewRenderModel;
}

export interface HouseholdRunwayNotStartedState
  extends HouseholdRunwayInterviewStateBase {
  status: "not_started";
  stage: null;
  renderModel: HouseholdRunwayLandingRenderModel | HouseholdRunwayResumeChoiceRenderModel;
}

export interface HouseholdRunwayCollectingState
  extends HouseholdRunwayInterviewStateBase {
  status: "collecting";
  stage: Exclude<HouseholdRunwayInterviewStage, "result">;
  renderModel: Exclude<
    HouseholdRunwayInterviewRenderModel,
    HouseholdRunwayLandingRenderModel | HouseholdRunwayResumeChoiceRenderModel
  >;
}

export interface HouseholdRunwayReviewingState
  extends HouseholdRunwayInterviewStateBase {
  status: "reviewing";
  stage: "review";
  renderModel: HouseholdRunwayReviewRenderModel;
}

export interface HouseholdRunwayCompletedState
  extends HouseholdRunwayInterviewStateBase {
  status: "completed";
  stage: "result";
  renderModel: HouseholdRunwayGenericStageRenderModel;
}

export type HouseholdRunwayInterviewState =
  | HouseholdRunwayNotStartedState
  | HouseholdRunwayCollectingState
  | HouseholdRunwayReviewingState
  | HouseholdRunwayCompletedState;

export interface HouseholdRunwayInterviewSnapshot {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION | 1;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: Partial<HouseholdRunwayInterviewDraft>;
  committedPlan?: HouseholdRunwayPlan | null;
  resumeChoice?: HouseholdRunwayInterviewResumeChoice | null;
  operations?: Partial<HouseholdRunwayInterviewOperations>;
  validationIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayInterviewInitialization {
  committedPlan?: HouseholdRunwayPlan | null;
  draft?: Partial<HouseholdRunwayInterviewDraft> | null;
  status?: HouseholdRunwayInterviewStatus;
  stage?: HouseholdRunwayInterviewStage | null;
  resumeChoice?: HouseholdRunwayInterviewResumeChoice | null;
}
