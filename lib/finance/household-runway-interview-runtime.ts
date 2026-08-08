import {
  createHouseholdRunwayInterviewRuntimeWithCapabilities,
  type HouseholdRunwayInterviewRuntime,
} from "@/lib/finance/internal/household-runway-interview-runtime";
import type { RunwayLocale } from "@/lib/finance/runway-regions";

/** Supported deterministic and lifecycle configuration for the public Runtime. */
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
}

export {
  HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS,
  type HouseholdRunwayInterviewIntent,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayActionApplicability,
  type HouseholdRunwayAdjustmentEffect,
  type HouseholdRunwayAdjustmentField,
  type HouseholdRunwayAdjustmentProjection,
  type HouseholdRunwayAdviceFact,
  type HouseholdRunwayAssessmentSnapshotFact,
  type HouseholdRunwayInterviewRuntimeConfirmation,
  type HouseholdRunwayInterviewRuntimeConfirmationAction,
  type HouseholdRunwayInterviewRuntimeDeepReadonly,
  type HouseholdRunwayInterviewRuntimeActions,
  type HouseholdRunwayInterviewRuntimeDraftFacts,
  type HouseholdRunwayInterviewRuntimeIssue,
  type HouseholdRunwayInterviewRuntimeIssueCode,
  type HouseholdRunwayInterviewRuntimeLifecycle,
  type HouseholdRunwayInterviewRuntimeOperation,
  type HouseholdRunwayInterviewRuntimeOperationError,
  type HouseholdRunwayInterviewRuntimeOperations,
  type HouseholdRunwayInterviewRuntimeOperationStatus,
  type HouseholdRunwayInterviewRuntimePlanFacts,
  type HouseholdRunwayInterviewRuntimeScreen,
  type HouseholdRunwayInterviewRuntimeScreenProjection,
  type HouseholdRunwayInterviewRuntimeSnapshot,
  type HouseholdRunwayFocusedRuntimeSimulation,
  type HouseholdRunwayGuidanceBand,
  type HouseholdRunwayHistoryComparison,
  type HouseholdRunwayPoint,
  type HouseholdRunwayPrecisionNotice,
  type HouseholdRunwayResultOutcome,
  type HouseholdRunwayReviewCash,
  type HouseholdRunwayReviewEarnedIncome,
  type HouseholdRunwayReviewExpenses,
  type HouseholdRunwayReviewHousehold,
  type HouseholdRunwayReviewLastResortAssets,
  type HouseholdRunwayReviewLiquidInvestments,
  type HouseholdRunwayReviewLocation,
  type HouseholdRunwayReviewOtherIncome,
  type HouseholdRunwayReviewReadiness,
  type HouseholdRunwayRuntimeComparisonFact,
  type HouseholdRunwaySeries,
} from "@/lib/finance/internal/household-runway-interview-runtime";

/**
 * Creates the supported five-method Runtime without exposing its private
 * side-effect capability composition.
 */
export function createHouseholdRunwayInterviewRuntime(
  options: HouseholdRunwayInterviewRuntimeOptions = {},
): HouseholdRunwayInterviewRuntime {
  return createHouseholdRunwayInterviewRuntimeWithCapabilities(options);
}
