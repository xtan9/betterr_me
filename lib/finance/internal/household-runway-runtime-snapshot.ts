/** Projects private Interview state into immutable public Runtime facts. */

import type { RunwaySnapshotSummary } from "@/lib/finance/cushion";

import {
  type HouseholdRunwayValidationIssue,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewStage,
  householdRunwayDraftMatchesPlanContent,
} from "@/lib/finance/internal/household-runway-interview";

import {
  type HouseholdRunwayOperationProjectionInput,
  type HouseholdRunwayActionContext,
  projectHouseholdRunwayAssessmentSnapshotHistory,
  projectHouseholdRunwayActions,
  projectHouseholdRunwayPlanFacts,
  projectHouseholdRunwayDraftFacts,
  projectHouseholdRunwayOperations,
} from "@/lib/finance/internal/household-runway-focused-projection";

import type {
  HouseholdRunwayInterviewRuntimeIssue,
  RuntimeStorageFacts,
  HouseholdRunwayInterviewRuntimeOperations,
  HouseholdRunwayInterviewRuntimeLifecycle,
  HouseholdRunwayInterviewRuntimeConfirmation,
} from "./household-runway-runtime-contract";

import type {
  HouseholdRunwayInterviewRuntimeDraftFacts,
  HouseholdRunwayInterviewRuntimeScreenProjection,
  HouseholdRunwayInterviewRuntimeSnapshot,
} from "./household-runway-runtime-view";

import { EMPTY_STORAGE_FACTS } from "./household-runway-runtime-contract";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function clonePublicValue<T>(value: T): T {
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

function publicIssueFor(
  issue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayInterviewRuntimeIssue | null {
  return issue ? { code: issue.code } : null;
}

function draftFactsFor(
  state: HouseholdRunwayInterviewState,
  storage: RuntimeStorageFacts,
): Omit<HouseholdRunwayInterviewRuntimeDraftFacts, "synchronized"> {
  return {
    current:
      state.status !== "not_started" ||
      state.draft.revision > 0 ||
      state.draft.interviewId !== null,
    stored: storage.session || storage.device,
    session: storage.session,
    device: storage.device,
    deviceStorageConsent: storage.deviceStorageConsent,
  };
}

type RuntimeOperationState =
  HouseholdRunwayInterviewState["operations"][keyof HouseholdRunwayInterviewState["operations"]];

function focusedOperationInputFor(
  operation: RuntimeOperationState,
): HouseholdRunwayOperationProjectionInput {
  return operation.status === "failed"
    ? { status: "failed", error: operation.error }
    : { status: operation.status };
}

function focusedActionScreenFor(
  state: HouseholdRunwayInterviewState,
): HouseholdRunwayActionContext["screen"] {
  const screen = state.renderModel;
  if (screen.kind === "landing") {
    return { kind: "landing", hasDraft: screen.hasDraft };
  }
  if (screen.kind === "resume_choice") {
    return {
      kind: "resume_choice",
      draftAvailable: state.resumeChoice !== null,
      planAvailable: state.committedPlan !== null,
    };
  }
  if (screen.kind === "review") {
    return { kind: "review", readiness: screen.reviewProjection.readiness };
  }
  if (screen.kind === "stage") {
    return {
      kind: "result",
      readiness:
        screen.resultProjection.readiness === "ready"
          ? "ready"
          : "unavailable",
    };
  }
  return {
    kind: "collecting",
    stage: screen.stage as Exclude<HouseholdRunwayInterviewStage, "result">,
  };
}

function screenFor(
  state: HouseholdRunwayInterviewState,
  assessmentHistory: readonly RunwaySnapshotSummary[],
): HouseholdRunwayInterviewRuntimeScreenProjection {
  const screen = state.renderModel;
  if (screen.kind === "review") {
    return {
      kind: "review",
      stage: screen.stage,
      ...clonePublicValue(screen.reviewProjection),
      availableStages: screen.availableStages,
      stageStatus: screen.stageStatus,
    };
  }
  if (screen.kind === "stage") {
    if (screen.resultProjection.readiness === "unavailable") {
      return {
        kind: "result",
        stage: screen.stage,
        readiness: "unavailable",
        availableStages: screen.availableStages,
        stageStatus: screen.stageStatus,
      };
    }
    return {
      kind: "result",
      stage: screen.stage,
      ...clonePublicValue(screen.resultProjection),
      history: clonePublicValue(
        projectHouseholdRunwayAssessmentSnapshotHistory(assessmentHistory),
      ),
      availableStages: screen.availableStages,
      stageStatus: screen.stageStatus,
    };
  }
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
  }
}

function operationInputsFor(
  state: HouseholdRunwayInterviewState,
): Record<
  keyof HouseholdRunwayInterviewRuntimeOperations,
  HouseholdRunwayOperationProjectionInput
> {
  return {
    draftSynchronization: focusedOperationInputFor(
      state.operations.draftSynchronization,
    ),
    deviceDraft: focusedOperationInputFor(state.operations.deviceDraft),
    planPersistence: focusedOperationInputFor(state.operations.planPersistence),
    reportDownload: focusedOperationInputFor(state.operations.reportDownload),
    analytics: focusedOperationInputFor(state.operations.analytics),
  };
}

export function snapshotFor(
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
  const draft = draftFactsFor(state, storage);
  const operationInputs = operationInputsFor(state);
  const actions = projectHouseholdRunwayActions({
    lifecycle,
    status: state.status,
    screen: focusedActionScreenFor(state),
    planAvailable: state.committedPlan !== null,
    draft,
  });
  const plan = projectHouseholdRunwayPlanFacts({
    exists: state.committedPlan !== null,
    current:
      state.committedPlan !== null &&
      householdRunwayDraftMatchesPlanContent(
        state.draft,
        state.committedPlan,
        state.status,
        state.stage,
      ),
  });
  const publicDraft = projectHouseholdRunwayDraftFacts({
    ...draft,
    synchronization: operationInputs.draftSynchronization,
  });

  return deepFreeze({
    lifecycle,
    interviewStatus: state.status,
    stage: state.stage,
    screen: clonePublicValue(screenFor(state, assessmentHistory)),
    plan,
    draft: publicDraft,
    issues: [...runtimeIssues, ...(issue ? [publicIssueFor(issue)!] : [])],
    operations: projectHouseholdRunwayOperations(operationInputs),
    confirmation,
    actions,
  });
}
