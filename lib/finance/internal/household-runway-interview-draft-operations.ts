/** Tracks device storage and Draft synchronization operations and stale outcomes. */

import type {
  HouseholdRunwayInterviewState,
  HouseholdRunwayDraftDeviceAction,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewTransition,
  HouseholdRunwayInterviewEffect,
} from "./household-runway-interview-protocol";

import { transition, snapshotOf, event, ignored } from "./household-runway-interview-state";

export function requestedDraftDeviceOperation(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "clear_device_draft" | "remember_draft" | "import_draft" }
  >,
  action: HouseholdRunwayDraftDeviceAction,
  scope?: "device" | "all",
): HouseholdRunwayInterviewTransition {
  const sourceRevision = state.draft.revision;
  const correlationId = command.commandId;
  const effects: HouseholdRunwayInterviewEffect[] = [];
  if (action === "clear") {
    effects.push({
      type: "draft_device_clear_requested",
      scope: scope ?? "device",
      sourceRevision,
      correlationId,
    });
  } else if (action === "remember") {
    effects.push({
      type: "draft_device_remember_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision,
      correlationId,
    });
  } else {
    effects.push({
      type: "draft_device_import_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision,
      correlationId,
    });
  }
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        deviceDraft: {
          status: "pending",
          action,
          sourceRevision,
          correlationId,
          ...(action === "clear" ? { scope: scope ?? "device" } : {}),
        },
        ...(action === "import"
          ? { draftSynchronization: { status: "idle" as const } }
          : {}),
      },
    },
    [
      event(command, "draft_device_operation_requested", {
        action,
        scope: action === "clear" ? scope ?? "device" : undefined,
        sourceRevision,
        correlationId,
      }),
    ],
    effects,
  );
}

export function completeDraftDeviceOperation(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    {
      type: "draft_device_operation_succeeded" | "draft_device_operation_failed";
    }
  >,
): HouseholdRunwayInterviewTransition {
  const operation = state.operations.deviceDraft;
  if (
    operation.status !== "pending" ||
    operation.action !== command.action ||
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
          deviceDraft: {
            status: "failed",
            action: command.action,
            sourceRevision: command.sourceRevision,
            correlationId: command.correlationId,
            error: "stale_result",
          },
        },
      },
      [
        event(command, "draft_device_operation_failed", {
          action: command.action,
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          error: "stale_result",
        }),
      ],
      [],
    );
  }
  const succeeded = command.type === "draft_device_operation_succeeded";
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        deviceDraft: succeeded
          ? {
              status: "succeeded",
              action: command.action,
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
            }
          : {
              status: "failed",
              action: command.action,
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
              error: command.error,
            },
      },
    },
    [
      event(
        command,
        succeeded
          ? "draft_device_operation_succeeded"
          : "draft_device_operation_failed",
        {
          action: command.action,
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          ...(!succeeded ? { error: command.error } : {}),
        },
      ),
    ],
    [],
  );
}

export function requestDraftSynchronization(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "synchronize_draft" }
  >,
): HouseholdRunwayInterviewTransition {
  const sourceRevision = state.draft.revision;
  const correlationId = command.commandId;
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        draftSynchronization: {
          status: "pending",
          sourceRevision,
          correlationId,
        },
      },
    },
    [
      event(command, "draft_synchronization_requested", {
        sourceRevision,
        correlationId,
      }),
    ],
    [
      {
        type: "draft_sync_requested",
        draft: state.draft,
        status: state.status,
        stage: state.stage,
        sourceRevision,
        correlationId,
      },
    ],
  );
}

export function completeDraftSynchronization(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    {
      type: "draft_synchronization_succeeded" | "draft_synchronization_failed";
    }
  >,
): HouseholdRunwayInterviewTransition {
  const operation = state.operations.draftSynchronization;
  if (
    operation.status !== "pending" ||
    operation.sourceRevision !== command.sourceRevision ||
    operation.correlationId !== command.correlationId
  ) {
    return ignored(state, command, "operation_not_pending");
  }
  const succeeded = command.type === "draft_synchronization_succeeded";
  return transition(
    state,
    {
      ...snapshotOf(state),
      operations: {
        ...state.operations,
        draftSynchronization: succeeded
          ? {
              status: "succeeded",
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
            }
          : {
              status: "failed",
              sourceRevision: command.sourceRevision,
              correlationId: command.correlationId,
              error: command.error,
            },
      },
    },
    [
      event(
        command,
        succeeded ? "draft_synchronized" : "draft_synchronization_failed",
        {
          sourceRevision: command.sourceRevision,
          correlationId: command.correlationId,
          ...(!succeeded ? { error: command.error } : {}),
        },
      ),
    ],
    [],
  );
}
