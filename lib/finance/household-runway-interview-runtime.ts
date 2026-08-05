import {
  createHouseholdRunwayInterviewRuntimeWithCapabilities,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimeOptions,
} from "@/lib/finance/internal/household-runway-interview-runtime";

export {
  HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS,
  type HouseholdRunwayInterviewIntent,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimeAffordances,
  type HouseholdRunwayInterviewRuntimeConfirmation,
  type HouseholdRunwayInterviewRuntimeConfirmationAction,
  type HouseholdRunwayInterviewRuntimeDeepReadonly,
  type HouseholdRunwayInterviewRuntimeDerivedFacts,
  type HouseholdRunwayInterviewRuntimeDraftFacts,
  type HouseholdRunwayInterviewRuntimeIssue,
  type HouseholdRunwayInterviewRuntimeIssueCode,
  type HouseholdRunwayInterviewRuntimeLifecycle,
  type HouseholdRunwayInterviewRuntimeOperation,
  type HouseholdRunwayInterviewRuntimeOperationError,
  type HouseholdRunwayInterviewRuntimeOperations,
  type HouseholdRunwayInterviewRuntimeOperationStatus,
  type HouseholdRunwayInterviewRuntimeOptions,
  type HouseholdRunwayInterviewRuntimePlanFacts,
  type HouseholdRunwayInterviewRuntimeScreen,
  type HouseholdRunwayInterviewRuntimeScreenProjection,
  type HouseholdRunwayInterviewRuntimeSnapshot,
  type HouseholdRunwayReportPresentation,
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
