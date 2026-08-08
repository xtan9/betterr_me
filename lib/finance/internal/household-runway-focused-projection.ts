import type {
  RunwayScenario,
  RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import type {
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewStatus,
  HouseholdRunwayInterviewOperationError,
} from "@/lib/finance/internal/household-runway-interview";

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

export type HouseholdRunwaySnapshotOutcome =
  | { kind: "sustainable" }
  | { kind: "depletes"; monthsCovered: number };

export interface HouseholdRunwayAssessmentSnapshotFact {
  id: string;
  scenario: RunwayScenario;
  modelVersion: string;
  createdAt: string;
  outcome: HouseholdRunwaySnapshotOutcome;
  comparisonToPrevious: HouseholdRunwayHistoryComparison;
}

function finiteMonthsCovered(snapshot: RunwaySnapshotSummary): number {
  if (
    snapshot.sustainable ||
    snapshot.months_covered === null ||
    !Number.isFinite(snapshot.months_covered) ||
    snapshot.months_covered < 0
  ) {
    throw new Error("Expected a coherent depleting Assessment Snapshot");
  }
  return snapshot.months_covered;
}

function outcomeFor(
  snapshot: RunwaySnapshotSummary,
): HouseholdRunwaySnapshotOutcome {
  return snapshot.sustainable
    ? { kind: "sustainable" }
    : { kind: "depletes", monthsCovered: finiteMonthsCovered(snapshot) };
}

function comparisonFor(
  newer: RunwaySnapshotSummary,
  older: RunwaySnapshotSummary | undefined,
): HouseholdRunwayHistoryComparison {
  if (!older) return { kind: "noPrevious" };

  const scenarioChanged = newer.scenario !== older.scenario;
  const modelChanged = newer.model_version !== older.model_version;
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

  if (newer.sustainable && older.sustainable) return { kind: "unchanged" };
  if (newer.sustainable) return { kind: "becameSustainable" };
  if (older.sustainable) return { kind: "leftSustainable" };

  const deltaMonths =
    finiteMonthsCovered(newer) - finiteMonthsCovered(older);
  return deltaMonths === 0
    ? { kind: "unchanged" }
    : { kind: "monthsChanged", deltaMonths };
}

/**
 * Projects the complete validated persistence list in its existing
 * newest-first order. The entry at index n compares with index n + 1, so a
 * caller may later display a subset without changing the comparison context.
 */
export function projectHouseholdRunwayAssessmentSnapshotHistory(
  snapshots: readonly RunwaySnapshotSummary[],
): readonly HouseholdRunwayAssessmentSnapshotFact[] {
  return snapshots.map((snapshot, index) => ({
    id: snapshot.id,
    scenario: snapshot.scenario,
    modelVersion: snapshot.model_version,
    createdAt: snapshot.created_at,
    outcome: outcomeFor(snapshot),
    comparisonToPrevious: comparisonFor(snapshot, snapshots[index + 1]),
  }));
}

export type HouseholdRunwayActionApplicability =
  | { applicable: true }
  | { applicable: false };

export interface HouseholdRunwayRuntimeActions {
  start: HouseholdRunwayActionApplicability;
  startNew: HouseholdRunwayActionApplicability;
  resumeDraft: HouseholdRunwayActionApplicability;
  resumePlan: HouseholdRunwayActionApplicability;
  importDraft: HouseholdRunwayActionApplicability;
  continue: HouseholdRunwayActionApplicability;
  back: HouseholdRunwayActionApplicability;
  skip: HouseholdRunwayActionApplicability;
  discardDraft: HouseholdRunwayActionApplicability;
  rememberDraft: HouseholdRunwayActionApplicability;
  clearDeviceDraft: HouseholdRunwayActionApplicability;
  editCompletedPlan: HouseholdRunwayActionApplicability;
  selectScenario: HouseholdRunwayActionApplicability;
  setPlanAdjustment: HouseholdRunwayActionApplicability;
  applyPlanAdjustment: HouseholdRunwayActionApplicability;
  resetPlanAdjustment: HouseholdRunwayActionApplicability;
  savePlan: HouseholdRunwayActionApplicability;
  downloadReport: HouseholdRunwayActionApplicability;
}

export type HouseholdRunwayActionScreen =
  | { kind: "landing"; hasDraft: boolean }
  | {
      kind: "resume_choice";
      draftAvailable: boolean;
      planAvailable: boolean;
    }
  | { kind: "collecting"; stage: Exclude<HouseholdRunwayInterviewStage, "result"> }
  | { kind: "review"; readiness: "ready" | "blocked" }
  | { kind: "result"; readiness: "ready" | "unavailable" };

export interface HouseholdRunwayActionContext {
  lifecycle: "idle" | "initializing" | "ready" | "disposed";
  status: HouseholdRunwayInterviewStatus;
  screen: HouseholdRunwayActionScreen;
  planAvailable: boolean;
  draft: {
    current: boolean;
    stored: boolean;
    session: boolean;
    device: boolean;
    deviceStorageConsent: boolean;
  };
}

const APPLICABLE: HouseholdRunwayActionApplicability = { applicable: true };
const INAPPLICABLE: HouseholdRunwayActionApplicability = { applicable: false };

function applicability(value: boolean): HouseholdRunwayActionApplicability {
  return value ? { ...APPLICABLE } : { ...INAPPLICABLE };
}

/**
 * Projects intent applicability independently from authentication,
 * capability availability, confirmation, operation status, and success.
 */
export function projectHouseholdRunwayActions(
  context: HouseholdRunwayActionContext,
): HouseholdRunwayRuntimeActions {
  const ready = context.lifecycle === "ready";
  const screen = context.screen;
  const hasWork = context.draft.current || context.draft.stored;
  const result = screen.kind === "result";
  const readyResult = result && screen.readiness === "ready";
  const collectingOrReviewing =
    context.status === "collecting" || context.status === "reviewing";

  return {
    start: applicability(
      ready &&
        screen.kind === "landing" &&
        !screen.hasDraft &&
        !hasWork &&
        !context.planAvailable,
    ),
    startNew: applicability(
      ready &&
        ((screen.kind === "landing" &&
          (screen.hasDraft || hasWork || context.planAvailable)) ||
          (screen.kind === "resume_choice" &&
            (screen.draftAvailable || screen.planAvailable)) ||
          context.status === "completed"),
    ),
    resumeDraft: applicability(
      ready &&
        screen.kind === "resume_choice" &&
        screen.draftAvailable,
    ),
    resumePlan: applicability(
      ready &&
        screen.kind === "resume_choice" &&
        screen.planAvailable,
    ),
    importDraft: applicability(
      ready &&
        context.draft.device &&
        !context.draft.session &&
        context.status !== "not_started" &&
        screen.kind !== "resume_choice",
    ),
    continue: applicability(ready && collectingOrReviewing),
    back: applicability(ready && collectingOrReviewing),
    skip: applicability(
      ready &&
        screen.kind === "collecting" &&
        (screen.stage === "otherIncome" || screen.stage === "assets"),
    ),
    discardDraft: applicability(ready && hasWork),
    rememberDraft: applicability(
      ready &&
        !context.draft.deviceStorageConsent &&
        hasWork,
    ),
    clearDeviceDraft: applicability(
      ready &&
        (context.draft.device || context.draft.deviceStorageConsent),
    ),
    editCompletedPlan: applicability(ready && readyResult),
    selectScenario: applicability(ready && readyResult),
    setPlanAdjustment: applicability(ready && readyResult),
    applyPlanAdjustment: applicability(ready && readyResult),
    resetPlanAdjustment: applicability(ready && readyResult),
    savePlan: applicability(ready && readyResult),
    downloadReport: applicability(ready && readyResult),
  };
}

export type HouseholdRunwayOperationProjectionInput =
  | {
      status: "idle" | "dirty" | "pending" | "succeeded";
    }
  | {
      status: "failed";
      error: HouseholdRunwayInterviewOperationError;
    };

export type HouseholdRunwayRuntimeOperationError = Exclude<
  HouseholdRunwayInterviewOperationError,
  "stale_result"
>;

export type HouseholdRunwayRuntimeOperation =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "succeeded" }
  | { status: "failed"; error: HouseholdRunwayRuntimeOperationError };

export interface HouseholdRunwayRuntimeOperations {
  draftSynchronization: HouseholdRunwayRuntimeOperation;
  deviceDraft: HouseholdRunwayRuntimeOperation;
  planPersistence: HouseholdRunwayRuntimeOperation;
  reportDownload: HouseholdRunwayRuntimeOperation;
  analytics: HouseholdRunwayRuntimeOperation;
}

/** Hides internal dirty/stale markers while preserving typed failures. */
export function projectHouseholdRunwayOperation(
  operation: HouseholdRunwayOperationProjectionInput,
): HouseholdRunwayRuntimeOperation {
  if (operation.status === "failed") {
    return operation.error === "stale_result"
      ? { status: "idle" }
      : { status: "failed", error: operation.error };
  }
  return operation.status === "dirty"
    ? { status: "idle" }
    : { status: operation.status };
}

export function projectHouseholdRunwayOperations(
  operations: Record<
    keyof HouseholdRunwayRuntimeOperations,
    HouseholdRunwayOperationProjectionInput
  >,
): HouseholdRunwayRuntimeOperations {
  return {
    draftSynchronization: projectHouseholdRunwayOperation(
      operations.draftSynchronization,
    ),
    deviceDraft: projectHouseholdRunwayOperation(operations.deviceDraft),
    planPersistence: projectHouseholdRunwayOperation(
      operations.planPersistence,
    ),
    reportDownload: projectHouseholdRunwayOperation(
      operations.reportDownload,
    ),
    analytics: projectHouseholdRunwayOperation(operations.analytics),
  };
}

export interface HouseholdRunwayDraftProjectionInput {
  current: boolean;
  stored: boolean;
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
  synchronization: HouseholdRunwayOperationProjectionInput;
}

export interface HouseholdRunwayRuntimeDraftFacts {
  current: boolean;
  stored: boolean;
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
  synchronized: boolean;
}

export function projectHouseholdRunwayDraftFacts(
  draft: HouseholdRunwayDraftProjectionInput,
): HouseholdRunwayRuntimeDraftFacts {
  return {
    current: draft.current,
    stored: draft.stored,
    session: draft.session,
    device: draft.device,
    deviceStorageConsent: draft.deviceStorageConsent,
    synchronized:
      draft.synchronization.status === "idle" ||
      draft.synchronization.status === "succeeded",
  };
}

export interface HouseholdRunwayRuntimePlanFacts {
  exists: boolean;
  current: boolean;
}

export function projectHouseholdRunwayPlanFacts(
  plan: HouseholdRunwayRuntimePlanFacts,
): HouseholdRunwayRuntimePlanFacts {
  return { exists: plan.exists, current: plan.current };
}
