import type {
  HouseholdRunwayInterviewCommandInput,
  HouseholdRunwayInterviewEffect,
  HouseholdRunwayInterviewStage,
} from "@/lib/finance/household-runway-interview";
import type { HouseholdRunwayAnswers, RunwaySnapshotSummary } from "@/lib/finance/cushion";
import type { SuccessfulHouseholdRunwayAssessment } from "@/lib/finance/household-runway-assessment";
import {
  downloadHouseholdRunwayAssessment,
  type HouseholdRunwayReportPresentation,
} from "@/lib/finance/household-runway-download";
import {
  clearHouseholdRunwayDeviceDraft,
  clearHouseholdRunwayDraft,
  hasHouseholdRunwayDeviceStorageConsent,
  persistHouseholdRunwayDraft,
  persistHouseholdRunwaySessionDraft,
  readHouseholdRunwayDeviceDraft,
  readHouseholdRunwayDraft,
  rememberHouseholdRunwayDraft,
} from "@/lib/finance/runway-draft-client";
import {
  runwayAttribution,
  trackRunwayEvent,
} from "@/lib/finance/runway-analytics-client";
import type { HouseholdRunwayDraftStorageReadResult } from "@/lib/finance/runway-draft-client";

export interface HouseholdRunwayBrowserEnvironment {
  location: { href: string };
  history: {
    back: () => void;
    pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
    replaceState: (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => void;
  };
  document: {
    getElementById: (id: string) => { focus: () => void } | null;
  };
  requestAnimationFrame?: (callback: () => void) => number;
}

export type HouseholdRunwayBrowserEffectOutcome =
  | { type: "history"; outcome: "applied" | "unavailable" }
  | {
      type: "focus";
      stage: HouseholdRunwayInterviewStage;
      outcome: "focused" | "scheduled" | "unavailable";
    };

export type HouseholdRunwayExternalEffect = Exclude<
  HouseholdRunwayInterviewEffect,
  { type: "history" | "focus" }
>;

export interface HouseholdRunwayBrowserStorageSnapshot {
  session: HouseholdRunwayDraftStorageReadResult;
  device: HouseholdRunwayDraftStorageReadResult;
  deviceStorageConsent: boolean;
}

export interface HouseholdRunwayBrowserEffectContext {
  reportPresentation?: HouseholdRunwayReportPresentation;
}

export interface HouseholdRunwayBrowserEffectResult {
  command: HouseholdRunwayInterviewCommandInput;
  hasLocalDraft?: boolean;
  deviceStorageConsent?: boolean;
  planExists?: boolean;
  snapshots?: RunwaySnapshotSummary[];
}

export interface HouseholdRunwayHistoryProjectionInput {
  href: string;
  interviewStarted: boolean;
  interviewId: string;
  stage?: HouseholdRunwayInterviewStage;
}

export function readHouseholdRunwayBrowserStorage(): HouseholdRunwayBrowserStorageSnapshot {
  return {
    session: readHouseholdRunwayDraft(),
    device: readHouseholdRunwayDeviceDraft(),
    deviceStorageConsent: hasHouseholdRunwayDeviceStorageConsent(),
  };
}

/**
 * URL/history is a projection of Interview state. A browser event becomes a
 * semantic command; the browser adapter never decides how the Interview
 * state should change.
 */
export function householdRunwayHistoryProjectionCommand({
  href,
  interviewStarted,
  interviewId,
  stage,
}: HouseholdRunwayHistoryProjectionInput):
  | Extract<
      HouseholdRunwayInterviewCommandInput,
      { type: "history_projection_changed" }
    >
  | null {
  const shouldStart = new URL(href).searchParams.get("start") === "1";
  if (shouldStart === interviewStarted) return null;

  return shouldStart
    ? {
        type: "history_projection_changed",
        destination: "interview",
        interviewId,
        ...(stage ? { stage } : {}),
      }
    : { type: "history_projection_changed", destination: "landing" };
}

function browserEnvironment(): HouseholdRunwayBrowserEnvironment | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  return {
    location: window.location,
    history: {
      back: () => window.history.back(),
      pushState: (data, unused, url) => window.history.pushState(data, unused, url),
      replaceState: (data, unused, url) =>
        window.history.replaceState(data, unused, url),
    },
    document,
    requestAnimationFrame: window.requestAnimationFrame
      ? (callback) => window.requestAnimationFrame(callback)
      : undefined,
  };
}

function applyHistoryEffect(
  effect: Extract<HouseholdRunwayInterviewEffect, { type: "history" }>,
  environment: HouseholdRunwayBrowserEnvironment | undefined,
): HouseholdRunwayBrowserEffectOutcome {
  if (!environment) return { type: "history", outcome: "unavailable" };

  try {
    if (effect.action === "back") {
      environment.history.back();
      return { type: "history", outcome: "applied" };
    }

    const url = new URL(environment.location.href);
    if (effect.destination === "interview") {
      url.searchParams.set("start", "1");
    } else {
      url.searchParams.delete("start");
    }
    const projectedUrl = `${url.pathname}${url.search}${url.hash}`;
    const apply =
      effect.action === "push"
        ? environment.history.pushState
        : environment.history.replaceState;
    apply({}, "", projectedUrl);
    return { type: "history", outcome: "applied" };
  } catch {
    return { type: "history", outcome: "unavailable" };
  }
}

function applyFocusEffect(
  effect: Extract<HouseholdRunwayInterviewEffect, { type: "focus" }>,
  environment: HouseholdRunwayBrowserEnvironment | undefined,
): HouseholdRunwayBrowserEffectOutcome {
  if (!environment) {
    return { type: "focus", stage: effect.stage, outcome: "unavailable" };
  }

  try {
    let callbackRan = false;
    let outcome: "focused" | "unavailable" = "unavailable";
    const focus = () => {
      callbackRan = true;
      const heading = environment.document.getElementById(
        "runway-question-heading",
      );
      if (!heading) return;
      heading.focus();
      outcome = "focused";
    };
    if (environment.requestAnimationFrame) {
      environment.requestAnimationFrame(focus);
      if (!callbackRan) {
        return { type: "focus", stage: effect.stage, outcome: "scheduled" };
      }
    } else {
      focus();
    }
    return { type: "focus", stage: effect.stage, outcome };
  } catch {
    return { type: "focus", stage: effect.stage, outcome: "unavailable" };
  }
}

export function applyHouseholdRunwayBrowserEffect(
  effect: Extract<HouseholdRunwayInterviewEffect, { type: "history" | "focus" }>,
  environment = browserEnvironment(),
): HouseholdRunwayBrowserEffectOutcome {
  return effect.type === "history"
    ? applyHistoryEffect(effect, environment)
    : applyFocusEffect(effect, environment);
}

function operationCommand(
  effect: Extract<
    HouseholdRunwayExternalEffect,
    { type: "draft_sync_requested" }
  >,
  success: boolean,
): HouseholdRunwayInterviewCommandInput {
  return success
    ? {
        type: "draft_synchronization_succeeded",
        sourceRevision: effect.sourceRevision,
        correlationId: effect.correlationId,
      }
    : {
        type: "draft_synchronization_failed",
        sourceRevision: effect.sourceRevision,
        correlationId: effect.correlationId,
        error: "storage_unavailable",
      };
}

function deviceOperationCommand(
  effect: Extract<
    HouseholdRunwayExternalEffect,
    {
      type:
        | "draft_device_remember_requested"
        | "draft_device_import_requested"
        | "draft_device_clear_requested";
    }
  >,
  success: boolean,
): HouseholdRunwayInterviewCommandInput {
  const action =
    effect.type === "draft_device_clear_requested"
      ? "clear"
      : effect.type === "draft_device_import_requested"
        ? "import"
        : "remember";
  return success
    ? {
        type: "draft_device_operation_succeeded",
        action,
        sourceRevision: effect.sourceRevision,
        correlationId: effect.correlationId,
      }
    : {
        type: "draft_device_operation_failed",
        action,
        sourceRevision: effect.sourceRevision,
        correlationId: effect.correlationId,
        error: "storage_unavailable",
      };
}

function planPersistenceError(status: number) {
  return status === 401 || status === 403
    ? ("authentication_required" as const)
    : status === 409
      ? ("conflict" as const)
      : status >= 400 && status < 500
        ? ("invalid" as const)
        : ("network" as const);
}

/**
 * Execute effects that require a browser capability. The Interview core only
 * receives the typed completion command returned by this adapter.
 */
export async function executeHouseholdRunwayBrowserEffect(
  effect: HouseholdRunwayExternalEffect,
  context: HouseholdRunwayBrowserEffectContext = {},
): Promise<HouseholdRunwayBrowserEffectResult> {
  if (effect.type === "draft_sync_requested") {
    const persisted = persistHouseholdRunwayDraft({
      status: effect.status,
      stage: effect.stage,
      draft: effect.draft,
    });
    return {
      command: operationCommand(effect, persisted.success),
      hasLocalDraft: persisted.success ? true : undefined,
      deviceStorageConsent: hasHouseholdRunwayDeviceStorageConsent(),
    };
  }

  if (
    effect.type === "draft_device_remember_requested" ||
    effect.type === "draft_device_import_requested" ||
    effect.type === "draft_device_clear_requested"
  ) {
    let success = false;
    try {
      if (effect.type === "draft_device_remember_requested") {
        success = rememberHouseholdRunwayDraft({
          status: effect.status,
          stage: effect.stage,
          draft: effect.draft,
        }).success;
      } else if (effect.type === "draft_device_import_requested") {
        success =
          persistHouseholdRunwaySessionDraft({
            status: effect.status,
            stage: effect.stage,
            draft: effect.draft,
          }).success &&
          clearHouseholdRunwayDeviceDraft({ revokeConsent: false }).success;
      } else if (effect.type === "draft_device_clear_requested") {
        success = (
          effect.scope === "all"
            ? clearHouseholdRunwayDraft({ revokeConsent: true })
            : clearHouseholdRunwayDeviceDraft()
        ).success;
      } else {
        throw new Error(`Unsupported device effect: ${effect.type}`);
      }
    } catch {
      success = false;
    }
    const clearedAll =
      effect.type === "draft_device_clear_requested" && effect.scope === "all";
    return {
      command: deviceOperationCommand(effect, success),
      hasLocalDraft:
        success && effect.type === "draft_device_clear_requested"
          ? clearedAll
            ? false
            : undefined
          : success
            ? true
            : undefined,
      deviceStorageConsent: hasHouseholdRunwayDeviceStorageConsent(),
    };
  }

  if (effect.type === "plan_persistence_requested") {
    try {
      const response = await fetch("/api/finance/cushion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: effect.inputs,
          adjustments: effect.adjustments,
          status: "completed",
          attribution: runwayAttribution(),
          idempotency_key: effect.idempotencyKey,
          expected_revision: effect.expectedPlanRevision,
          snapshot_action_id: effect.idempotencyKey,
          snapshot_trigger: effect.snapshotTrigger,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        current_revision?: number;
        revision?: number;
        plan?: { answers?: HouseholdRunwayAnswers };
        assessment?: SuccessfulHouseholdRunwayAssessment;
        snapshot?: RunwaySnapshotSummary;
        snapshots?: RunwaySnapshotSummary[];
      };
      if (!response.ok) {
        return {
          command: {
            type: "plan_persistence_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            ...(typeof payload.current_revision === "number"
              ? { currentPlanRevision: payload.current_revision }
              : {}),
            error: planPersistenceError(response.status),
          },
        };
      }
      if (
        !Number.isInteger(payload.revision) ||
        !payload.plan?.answers ||
        !payload.assessment
      ) {
        throw new Error("Invalid Household Runway commit response");
      }
      return {
        command: {
          type: "plan_persistence_succeeded",
          sourceRevision: effect.sourceRevision,
          correlationId: effect.correlationId,
          planRevision: payload.revision,
          planInputs: payload.plan.answers,
          assessment: payload.assessment,
          ...(payload.snapshot ? { snapshot: payload.snapshot } : {}),
        },
        planExists: true,
        snapshots: payload.snapshots,
      };
    } catch {
      return {
        command: {
          type: "plan_persistence_failed",
          sourceRevision: effect.sourceRevision,
          correlationId: effect.correlationId,
          error: "network",
        },
      };
    }
  }

  if (effect.type === "report_download_requested") {
    const result = context.reportPresentation
      ? downloadHouseholdRunwayAssessment(
          effect.assessment,
          context.reportPresentation,
        )
      : { success: false as const, error: "download_failed" as const, cause: new Error("report presentation unavailable") };
    return {
      command: result.success
        ? {
            type: "report_download_succeeded",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
          }
        : {
            type: "report_download_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "download_failed",
          },
    };
  }

  if (effect.type !== "analytics_requested") {
    throw new Error(`Unsupported Household Runway effect: ${effect.type}`);
  }
  const succeeded = await trackRunwayEvent(effect.eventName, effect.stage);
  return {
    command: succeeded
      ? {
          type: "analytics_succeeded",
          sourceRevision: effect.sourceRevision,
          correlationId: effect.correlationId,
        }
      : {
          type: "analytics_failed",
          sourceRevision: effect.sourceRevision,
          correlationId: effect.correlationId,
        },
  };
}
