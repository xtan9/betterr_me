/** Executes Runtime capabilities and returns correlated outcomes to the message queue. */

import type { RunwayLocale } from "@/lib/finance/runway-regions";

import type {
  HouseholdRunwayInterviewEffect,
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayDraftDeviceAction,
} from "@/lib/finance/internal/household-runway-interview";

import type {
  HouseholdRunwayInterviewRuntimeDraftRequest,
  HouseholdRunwayInterviewRuntimePlanFailure,
  HouseholdRunwayInterviewRuntimeCompositionOptions,
  RuntimeStorageFacts,
  MaybePromise,
  HouseholdRunwayInterviewRuntimePlanOutcome,
  HouseholdRunwayInterviewRuntimePlanRequest,
  HouseholdRunwayInterviewRuntimePlanResult,
  HouseholdRunwayInterviewRuntimeReportOutcome,
} from "./household-runway-runtime-contract";

import { clonePublicValue } from "./household-runway-runtime-snapshot";

import { outcomeCommand } from "./household-runway-runtime-commands";

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

interface RuntimeEffectContext {
  options: HouseholdRunwayInterviewRuntimeCompositionOptions;
  createId: () => string;
  now: () => string;
  isDisposed: () => boolean;
  getLocale: () => RunwayLocale;
  enqueueOutcome: (createCommand: () => HouseholdRunwayInterviewCommand) => void;
  updateStorageFacts: (next: Partial<RuntimeStorageFacts>) => void;
}

export function createRuntimeEffectExecutor({
  options,
  createId,
  now,
  isDisposed,
  getLocale,
  enqueueOutcome,
  updateStorageFacts,
}: RuntimeEffectContext) {
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
  const executeEffect = (
    effect: HouseholdRunwayInterviewEffect,
    synchronous = false,
  ) => {
    if (isDisposed()) return;
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
          locale: getLocale(),
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
  return executeEffect;
}
