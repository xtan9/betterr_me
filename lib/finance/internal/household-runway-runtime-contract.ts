/** Private Runtime configuration, capabilities, and lifecycle contracts. */

import type {
  RunwayScenario,
  ExpenseCategory,
  HouseholdRunwayAnswers,
  RunwayAdjustments,
  RunwaySnapshotSummary,
} from "@/lib/finance/cushion";

import type { RunwayLocale } from "@/lib/finance/runway-regions";

import type {
  HouseholdRunwayAnalyticsEventKind,
  HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";

import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

import type {
  HouseholdRunwayPlan,
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewCommand,
} from "@/lib/finance/internal/household-runway-interview";

import type {
  HouseholdRunwayDraftState,
} from "@/lib/finance/internal/household-runway-draft-codec";

import type { HouseholdRunwayInterviewRuntimeSnapshot } from "./household-runway-runtime-view";

import type { HouseholdRunwayInterviewIntent } from "./household-runway-runtime-commands";

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

export type RuntimeMessage =
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

export type MaybePromise<T> = T | PromiseLike<T>;

export interface RuntimeStorageFacts {
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
}

export const EMPTY_STORAGE_FACTS: RuntimeStorageFacts = {
  session: false,
  device: false,
  deviceStorageConsent: false,
};
