/** Tracks Plan persistence, report, and analytics operations and stale outcomes. */

import { createHouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

import {
  isHouseholdRunwayPlanAdjustmentActive,
  emptyHouseholdRunwayPlanAdjustment,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import {
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewCapabilities,
  type HouseholdRunwayValidationIssue,
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewTransition,
} from "./household-runway-interview-protocol";

import { ignored, transition, snapshotOf, event } from "./household-runway-interview-state";

import { normalizeDraft } from "./household-runway-interview-draft";

export function requestPlanPersistence(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "save_plan" | "request_plan_persistence" }
  >,
  capabilities: HouseholdRunwayInterviewCapabilities,
): HouseholdRunwayInterviewTransition {
  if (
    state.status !== "completed" ||
    !state.planInputs ||
    !state.assessment
  ) {
    return ignored(state, command, "invalid_stage");
  }
  if (isHouseholdRunwayPlanAdjustmentActive(state.draft.planAdjustment)) {
    const issue: HouseholdRunwayValidationIssue = {
      code: "plan_adjustment_pending",
      stage: "result",
    };
    return transition(
      state,
      {
        ...snapshotOf(state),
        validationIssue: issue,
      },
      [event(command, "validation_blocked", { stage: "result", issue })],
      [],
    );
  }

  const sourceRevision = state.draft.revision;
  const correlationId = command.commandId;
  const expectedPlanRevision = state.committedPlan?.revision ?? 0;
  if (capabilities.planPersistence !== "available") {
    return transition(
      state,
      {
        ...snapshotOf(state),
        operations: {
          ...state.operations,
          planPersistence: {
            status: "failed",
            sourceRevision,
            correlationId,
            idempotencyKey: command.idempotencyKey ?? command.commandId,
            snapshotTrigger:
              capabilities.snapshotTrigger ??
              (state.committedPlan ? "updated" : "completed"),
            error: "authentication_required",
          },
        },
      },
      [
        event(command, "plan_persistence_failed", {
          sourceRevision,
          correlationId,
          error: "authentication_required",
        }),
      ],
      [],
    );
  }

  const previousOperation = state.operations.planPersistence;
  const canRetryPreviousCommit =
    previousOperation.status !== "idle" &&
    previousOperation.status !== "dirty" &&
    previousOperation.sourceRevision === sourceRevision;
  const idempotencyKey =
    command.idempotencyKey ??
    (canRetryPreviousCommit ? previousOperation.idempotencyKey : undefined) ??
    command.commandId;
  const snapshotTrigger =
    canRetryPreviousCommit
      ? previousOperation.snapshotTrigger
      : capabilities.snapshotTrigger ??
        (state.committedPlan ? "updated" : "completed");
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        planPersistence: {
          status: "pending",
          sourceRevision,
          correlationId,
          expectedPlanRevision,
          idempotencyKey,
          snapshotTrigger,
        },
      },
    },
    [
      event(command, "plan_persistence_requested", {
        sourceRevision,
        correlationId,
      }),
    ],
    [
      {
        type: "plan_persistence_requested",
        inputs: state.planInputs,
        assessment: state.assessment,
        sourceRevision,
        correlationId,
        idempotencyKey,
        expectedPlanRevision,
        adjustments: state.draft.planAdjustment,
        snapshotTrigger,
      },
    ],
  );
}

export function completePlanPersistence(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "plan_persistence_succeeded" | "plan_persistence_failed" }
  >,
): HouseholdRunwayInterviewTransition {
  const operation = state.operations.planPersistence;
  if (
    operation.status !== "pending" ||
    operation.sourceRevision !== command.sourceRevision ||
    operation.correlationId !== command.correlationId
  ) {
    return ignored(state, command, "operation_not_pending");
  }
  if (state.draft.revision !== command.sourceRevision) {
    return transition(
      state,
      {
        ...snapshotOf(state),
        operations: {
          ...state.operations,
          planPersistence: {
            status: "failed",
            sourceRevision: command.sourceRevision,
            correlationId: command.correlationId,
            idempotencyKey: operation.idempotencyKey,
            snapshotTrigger: operation.snapshotTrigger,
            error: "stale_result",
          },
        },
      },
      [
        event(command, "plan_persistence_failed", {
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          error: "stale_result",
        }),
      ],
      [],
    );
  }
  if (command.type === "plan_persistence_failed") {
    return transition(
      state,
      {
        ...snapshotOf(state),
        operations: {
          ...state.operations,
          planPersistence: {
            status: "failed",
            sourceRevision: command.sourceRevision,
            correlationId: command.correlationId,
            idempotencyKey: operation.idempotencyKey,
            snapshotTrigger: operation.snapshotTrigger,
            ...(command.currentPlanRevision !== undefined
              ? { currentPlanRevision: command.currentPlanRevision }
              : {}),
            error: command.error,
          },
        },
      },
      [
        event(command, "plan_persistence_failed", {
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          error: command.error,
        }),
      ],
      [],
    );
  }

  const planRevision =
    command.planRevision ?? (state.committedPlan?.revision ?? 0) + 1;
  const committedInputs = command.planInputs ?? state.planInputs;
  const committedAssessment = command.assessment ?? state.assessment;
  if (!committedInputs || !committedAssessment) {
    return ignored(state, command, "invalid_stage");
  }
  const committedPlan = createHouseholdRunwayPlan({
    revision: planRevision,
    inputs: committedInputs,
  });
  if (!committedPlan) return ignored(state, command, "invalid_stage");
  const draft = normalizeDraft({
    ...state.draft,
    answers: committedPlan.inputs,
    planAdjustment: emptyHouseholdRunwayPlanAdjustment(),
  });
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: "completed",
      stage: "result",
      draft,
      committedPlan,
      operations: {
        ...state.operations,
        // Explicit Plan persistence consumes the working Draft. Keep the
        // independent draft-sync operation from borrowing the Plan command's
        // correlation ID; there is no remaining local Draft to synchronize.
        draftSynchronization: { status: "idle" },
        deviceDraft: {
          status: "pending",
          action: "clear",
          sourceRevision: command.sourceRevision,
          correlationId: `${command.correlationId}:clear`,
          scope: "all",
        },
        planPersistence: {
          status: "succeeded",
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          planRevision,
          idempotencyKey: operation.idempotencyKey,
          snapshotTrigger: operation.snapshotTrigger,
          ...(command.snapshot ? { snapshot: command.snapshot } : {}),
        },
      },
      validationIssue: null,
    },
    [
      event(command, "plan_persisted", {
        sourceRevision: command.sourceRevision,
        correlationId: command.correlationId,
        planRevision,
      }),
    ],
    [
      { type: "focus", stage: "result" },
      {
        type: "draft_device_clear_requested",
        scope: "all",
        sourceRevision: command.sourceRevision,
        correlationId: `${command.correlationId}:clear`,
      },
    ],
  );
}

export function requestReportDownload(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "request_report_download" }
  >,
): HouseholdRunwayInterviewTransition {
  if (!state.assessment || state.stage !== "result") {
    return ignored(state, command, "invalid_stage");
  }
  const sourceRevision = state.draft.revision;
  const correlationId = command.commandId;
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        reportDownload: { status: "pending", sourceRevision, correlationId },
      },
    },
    [
      event(command, "report_download_requested", {
        sourceRevision,
        correlationId,
      }),
    ],
    [
      {
        type: "report_download_requested",
        assessment: state.assessment,
        sourceRevision,
        correlationId,
      },
    ],
  );
}

export function completeReportDownload(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "report_download_succeeded" | "report_download_failed" }
  >,
): HouseholdRunwayInterviewTransition {
  const operation = state.operations.reportDownload;
  if (
    operation.status !== "pending" ||
    operation.sourceRevision !== command.sourceRevision ||
    operation.correlationId !== command.correlationId
  ) {
    return ignored(state, command, "operation_not_pending");
  }
  const succeeded = command.type === "report_download_succeeded";
  const stale = state.draft.revision !== command.sourceRevision;
  const error = stale ? "stale_result" : succeeded ? null : command.error;
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        reportDownload:
          error === null
            ? {
                status: "succeeded",
                sourceRevision: command.sourceRevision,
                correlationId: command.correlationId,
              }
            : {
                status: "failed",
                sourceRevision: command.sourceRevision,
                correlationId: command.correlationId,
                error,
              },
      },
    },
    [
      event(
        command,
        error === null ? "report_downloaded" : "report_download_failed",
        {
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          ...(error ? { error } : {}),
        },
      ),
    ],
    [],
  );
}

export function requestAnalytics(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "request_analytics" }>,
): HouseholdRunwayInterviewTransition {
  const sourceRevision = state.draft.revision;
  const correlationId = command.commandId;
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        analytics: { status: "pending", sourceRevision, correlationId },
      },
    },
    [
      event(command, "analytics_requested", { sourceRevision, correlationId }),
    ],
    [
      {
        type: "analytics_requested",
        eventName: command.eventName,
        stage: command.stage,
        sourceRevision,
        correlationId,
      },
    ],
  );
}

export function completeAnalytics(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "analytics_succeeded" | "analytics_failed" }
  >,
): HouseholdRunwayInterviewTransition {
  const operation = state.operations.analytics;
  if (
    operation.status !== "pending" ||
    operation.sourceRevision !== command.sourceRevision ||
    operation.correlationId !== command.correlationId
  ) {
    return ignored(state, command, "operation_not_pending");
  }
  const succeeded = command.type === "analytics_succeeded";
  const stale = state.draft.revision !== command.sourceRevision;
  const error = stale ? "stale_result" : succeeded ? null : "analytics_failed";
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        analytics: error === null
          ? {
              status: "succeeded",
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
            }
          : {
              status: "failed",
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
              error,
            },
      },
    },
    [
      event(command, error === null ? "analytics_recorded" : "analytics_failed", {
        sourceRevision: command.sourceRevision,
        correlationId: command.correlationId,
        ...(error ? { error } : {}),
      }),
    ],
    [],
  );
}
