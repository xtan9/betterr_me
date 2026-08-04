import type {
  HouseholdRunwayInterviewCommandInput,
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewEffect,
  HouseholdRunwayInterviewStage,
} from "@/lib/finance/internal/household-runway-interview";
import { HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS } from "@/lib/finance/internal/household-runway-interview";
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
import type { HouseholdRunwayDraftState } from "@/lib/finance/internal/household-runway-draft-codec";
import {
  dispatchHouseholdRunwayRuntimeEnvironment,
  type HouseholdRunwayInterviewRuntimeEnvironmentMessage,
} from "@/lib/finance/household-runway-runtime-environment";
import {
  createHouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimeDraftRequest,
  type HouseholdRunwayInterviewRuntimePlanOutcome,
  type HouseholdRunwayInterviewRuntimePlanRequest,
  type HouseholdRunwayInterviewRuntimeReportRequest,
  type HouseholdRunwayInterviewRuntimeOptions,
} from "@/lib/finance/household-runway-interview-runtime";
import type { RunwayLocale } from "@/lib/finance/runway-regions";

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
  cancelAnimationFrame?: (id: number) => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
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

export type HouseholdRunwayBrowserReportPresentation = (
  request: HouseholdRunwayInterviewRuntimeReportRequest,
) => HouseholdRunwayReportPresentation;

export type HouseholdRunwayBrowserAdapterOutcome =
  | { type: "history"; outcome: "applied" | "unavailable" }
  | {
      type: "focus";
      stage: HouseholdRunwayInterviewStage;
      outcome: "focused" | "scheduled" | "unavailable";
    }
  | { type: "subscription"; event: "history" | "locale"; outcome: "subscribed" | "unavailable" }
  | { type: "schedule"; outcome: "scheduled" | "unavailable" };

export interface HouseholdRunwayBrowserAdapterOptions
  extends HouseholdRunwayInterviewRuntimeOptions {
  environment?: HouseholdRunwayBrowserEnvironment;
  onOutcome?: (outcome: HouseholdRunwayBrowserAdapterOutcome) => void;
  localeChangeEvent?: string;
  reportPresentation?: HouseholdRunwayBrowserReportPresentation;
  /** Anonymous experiences intentionally do not receive the Plan write port. */
  authenticated?: boolean;
  localeProvider?: () => RunwayLocale;
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

function stageParameterFromHref(href: string): string | null {
  try {
    return new URL(href).searchParams.get("stage");
  } catch {
    return null;
  }
}

function stageFromHref(href: string): HouseholdRunwayInterviewStage | undefined {
  try {
    const requested = stageParameterFromHref(href);
    return requested &&
      (HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS as readonly string[]).includes(requested)
      ? (requested as HouseholdRunwayInterviewStage)
      : undefined;
  } catch {
    return undefined;
  }
}

export function readHouseholdRunwayBrowserStorage(): HouseholdRunwayBrowserStorageSnapshot {
  return {
    session: readHouseholdRunwayDraft(),
    device: readHouseholdRunwayDeviceDraft(),
    deviceStorageConsent: hasHouseholdRunwayDeviceStorageConsent(),
  };
}

/**
 * Supplies the Runtime's opaque restoration capability without exposing the
 * storage keys, envelope, or codec result to presentation code.
 */
export function restoreHouseholdRunwayBrowserRuntime(): unknown {
  const storage = readHouseholdRunwayBrowserStorage();
  const source = (result: HouseholdRunwayDraftStorageReadResult) =>
    result.status === "empty"
      ? { status: "missing" as const }
      : result.status === "restored"
        ? {
            status: "restored" as const,
            state: result.state,
            expiresAt: result.expiresAt,
            source: result.source,
          }
        : { status: "rejected" as const, code: result.code };
  return {
    session: source(storage.session),
    device: source(storage.device),
    deviceStorageConsent: storage.deviceStorageConsent,
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
  let shouldStart = false;
  try {
    shouldStart = new URL(href).searchParams.get("start") === "1";
  } catch {
    return interviewStarted
      ? { type: "history_projection_changed", destination: "landing" }
      : null;
  }
  if (shouldStart === interviewStarted) return null;

  return shouldStart
    ? {
      type: "history_projection_changed",
      destination: "interview",
      interviewId,
      ...(stage ?? stageFromHref(href)
        ? { stage: stage ?? stageFromHref(href) }
        : {}),
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
    cancelAnimationFrame: window.cancelAnimationFrame
      ? (id) => window.cancelAnimationFrame(id)
      : undefined,
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener as EventListener),
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
    url.searchParams.delete("stage");
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

function emitAdapterOutcome(
  callback: HouseholdRunwayBrowserAdapterOptions["onOutcome"],
  outcome: HouseholdRunwayBrowserAdapterOutcome,
) {
  try {
    callback?.(outcome);
  } catch {
    // Observability must not become another Runtime capability failure.
  }
}

type HouseholdRunwayBrowserDraftCapabilityRequest =
  HouseholdRunwayInterviewRuntimeDraftRequest & {
    readonly draft: HouseholdRunwayDraftState;
  };

function draftStateFor(
  request: HouseholdRunwayInterviewRuntimeDraftRequest,
): HouseholdRunwayDraftState {
  return (request as HouseholdRunwayBrowserDraftCapabilityRequest).draft;
}

function synchronizeHouseholdRunwayDraft(
  draft: HouseholdRunwayDraftState,
) {
  return readHouseholdRunwayDeviceDraft().status === "restored"
    ? persistHouseholdRunwayDraft(draft)
    : persistHouseholdRunwaySessionDraft(draft);
}

/**
 * Composes the framework-neutral Runtime with the browser capabilities. Raw
 * browser events stay here; only validated private environment messages cross
 * into the Runtime.
 */
export function createHouseholdRunwayBrowserAdapter(
  options: HouseholdRunwayBrowserAdapterOptions = {},
): HouseholdRunwayInterviewRuntime {
  const environment = options.environment ?? browserEnvironment();
  const localeEvent = options.localeChangeEvent ?? "betterr:before-locale-change";
  const scheduledFocus = new Set<number>();
  const onOutcome = options.onOutcome;
  let disposed = false;
  let started = false;
  let removeProjectionSubscription: (() => void) | undefined;
  let initialHrefForProjection: string | undefined;
  let authenticatedStartPending = false;
  let historyEffectPending = false;
  const subscriptions: Array<{
    event: "history" | "locale";
    type: string;
    listener: () => void;
  }> = [];

  const navigate = (request: {
    action: "push" | "replace" | "back";
    destination: "landing" | "interview";
  }) => {
    const snapshot = runtime?.getSnapshot();
    if (
      snapshot?.lifecycle === "ready" &&
      ((request.destination === "interview" &&
        snapshot.interviewStatus === "not_started") ||
        (request.destination === "landing" &&
          snapshot.interviewStatus !== "not_started"))
    ) {
      return;
    }
    const outcome = applyHouseholdRunwayBrowserEffect(
      { type: "history", ...request },
      environment,
    );
    emitAdapterOutcome(onOutcome, outcome);
    if (request.destination === "interview") {
      initialHrefForProjection = environment?.location.href;
      historyEffectPending = false;
    } else if (request.action !== "back") {
      initialHrefForProjection = environment?.location.href;
      historyEffectPending = false;
    } else {
      historyEffectPending = false;
    }
  };

  const focus = (stage: HouseholdRunwayInterviewStage) => {
    if (!environment?.requestAnimationFrame) {
      const outcome = applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage },
        environment,
      );
      emitAdapterOutcome(onOutcome, outcome);
      return;
    }

    let callbackRan = false;
    let frameId: number | undefined;
    const callback = () => {
      callbackRan = true;
      if (frameId !== undefined) scheduledFocus.delete(frameId);
      if (disposed) return;
      const outcome = applyFocusEffect(
        { type: "focus", stage },
        { ...environment, requestAnimationFrame: undefined },
      );
      emitAdapterOutcome(onOutcome, outcome);
    };
    try {
      frameId = environment.requestAnimationFrame(callback);
      if (!callbackRan && frameId !== undefined) scheduledFocus.add(frameId);
      if (!callbackRan) {
        emitAdapterOutcome(onOutcome, {
          type: "focus",
          stage,
          outcome: "scheduled",
        });
      }
    } catch {
      emitAdapterOutcome(onOutcome, {
        type: "focus",
        stage,
        outcome: "unavailable",
      });
    }
  };

  const schedule = options.schedule
    ? (task: () => void) => {
        try {
          options.schedule?.(task);
          emitAdapterOutcome(onOutcome, {
            type: "schedule",
            outcome: "scheduled",
          });
        } catch {
          emitAdapterOutcome(onOutcome, {
            type: "schedule",
            outcome: "unavailable",
          });
        }
      }
    : undefined;

  const browserCapabilities = {
    restore: options.restore,
    synchronizeDraft:
      options.synchronizeDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        synchronizeHouseholdRunwayDraft(draftStateFor(request)).success),
    rememberDraft:
      options.rememberDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        rememberHouseholdRunwayDraft(draftStateFor(request)).success),
    importDraft:
      options.importDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        persistHouseholdRunwaySessionDraft(draftStateFor(request)).success &&
        clearHouseholdRunwayDeviceDraft({ revokeConsent: false }).success),
    clearDraft:
      options.clearDraft ??
      ((request: { scope: "device" | "all" }) =>
        (request.scope === "all"
          ? clearHouseholdRunwayDraft({ revokeConsent: true })
          : clearHouseholdRunwayDeviceDraft()
        ).success),
    persistPlan:
      options.persistPlan ??
      (options.authenticated === false
        ? undefined
        : (request: HouseholdRunwayInterviewRuntimePlanRequest) =>
        executeHouseholdRunwayBrowserEffect({
          type: "plan_persistence_requested",
          inputs: request.inputs,
          assessment: request.assessment,
          sourceRevision: 0,
          correlationId: request.idempotencyKey,
          idempotencyKey: request.idempotencyKey,
          expectedPlanRevision: request.expectedPlanRevision,
          adjustments: request.adjustments,
          snapshotTrigger: request.snapshotTrigger,
        }).then((result): HouseholdRunwayInterviewRuntimePlanOutcome => {
          if (
            result.command.type === "plan_persistence_succeeded" &&
            typeof result.command.planRevision === "number" &&
            result.command.planInputs &&
            result.command.assessment
          ) {
            return {
              planRevision: result.command.planRevision,
              planInputs: result.command.planInputs,
              assessment: result.command.assessment,
              ...(result.snapshots ? { snapshots: result.snapshots } : {}),
              ...(result.command.snapshot
                ? { snapshot: result.command.snapshot }
                : {}),
            };
          }
          const failure = result.command as Extract<
            HouseholdRunwayInterviewCommand,
            { type: "plan_persistence_failed" }
          >;
          return {
            success: false,
            error:
              failure.error === "authentication_required" ||
              failure.error === "conflict" ||
              failure.error === "invalid" ||
              failure.error === "network"
                ? failure.error
                : "exception",
            ...(failure.currentPlanRevision !== undefined
              ? { currentPlanRevision: failure.currentPlanRevision }
              : {}),
          };
        })),
    downloadReport:
      options.downloadReport ??
      ((request: HouseholdRunwayInterviewRuntimeReportRequest) => {
        const presentation = options.reportPresentation?.(request);
        return presentation
          ? downloadHouseholdRunwayAssessment(request.assessment, presentation).success
          : false;
      }),
    trackAnalytics:
      options.trackAnalytics ??
      ((request: { eventName: Parameters<typeof trackRunwayEvent>[0]; stage?: Parameters<typeof trackRunwayEvent>[1] }) =>
        trackRunwayEvent(request.eventName, request.stage)),
  };

  const runtime = createHouseholdRunwayInterviewRuntime({
    ...options,
    ...browserCapabilities,
    navigate,
    focus,
    ...(schedule ? { schedule } : {}),
  });

  const maybeImportRestoredDeviceDraft = () => {
    const snapshot = runtime.getSnapshot();
    if (
      snapshot.lifecycle !== "ready" ||
      snapshot.interviewStatus === "not_started" ||
      snapshot.screen.kind === "resume_choice" ||
      snapshot.draft.session ||
      !snapshot.draft.device ||
      snapshot.operations.deviceDraft.status === "pending"
    ) {
      return;
    }
    runtime.send({ type: "import_draft" });
  };

  const scheduleDeviceDraftImport = () => {
    try {
      queueMicrotask(() => {
        if (!disposed) maybeImportRestoredDeviceDraft();
      });
    } catch {
      // A host without microtask scheduling can still use explicit resume.
    }
  };

  const dispatchEnvironment = (
    message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  ) => {
    if (!disposed) {
      const shouldImportDeviceDraft =
        message.type === "history_projection_changed" &&
        message.destination === "interview" &&
        runtime.getSnapshot().screen.kind !== "resume_choice";
      dispatchHouseholdRunwayRuntimeEnvironment(runtime, message);
      if (shouldImportDeviceDraft) scheduleDeviceDraftImport();
    }
  };

  const reconcileUrl = () => {
    if (disposed || runtime.getSnapshot().lifecycle !== "ready") return;
    const snapshot = runtime.getSnapshot();
    if (
      authenticatedStartPending ||
      historyEffectPending ||
      snapshot.screen.kind === "resume_choice"
    ) {
      return;
    }
    const href = initialHrefForProjection ?? environment?.location.href;
    if (!href) return;
    initialHrefForProjection = undefined;

    let url: URL;
    try {
      url = new URL(href);
    } catch {
      const command = householdRunwayHistoryProjectionCommand({
        href,
        interviewStarted: snapshot.interviewStatus !== "not_started",
        interviewId: "browser-adapter",
        stage: stageFromHref(href),
      });
      if (command) {
        dispatchEnvironment({
          type: "history_projection_changed",
          destination: command.destination,
          ...(command.destination === "interview" && command.stage
            ? { stage: command.stage }
            : {}),
        });
      } else {
        emitAdapterOutcome(onOutcome, { type: "history", outcome: "unavailable" });
      }
      return;
    }

    const requestedStageParameter = stageParameterFromHref(href);
    const requestedStage = stageFromHref(href);
    const projectedStage =
      requestedStage ??
      (snapshot.screen.kind === "landing"
        ? snapshot.screen.resumeStage ?? undefined
        : undefined);
    const interviewStarted = snapshot.interviewStatus !== "not_started";
    if (options.authenticated === true) {
      if (!interviewStarted) {
        const stage =
          requestedStage ??
          (snapshot.screen.kind === "landing"
            ? snapshot.screen.resumeStage ?? undefined
            : undefined);
        authenticatedStartPending = true;
        historyEffectPending = true;
        try {
          runtime.send({ type: "start", ...(stage ? { stage } : {}) });
          scheduleDeviceDraftImport();
        } finally {
          authenticatedStartPending = false;
          if (runtime.getSnapshot().interviewStatus === "not_started") {
            historyEffectPending = false;
          }
        }
        return;
      }
      if (url.searchParams.get("start") !== "1") {
        navigate({ action: "push", destination: "interview" });
        return;
      }
    }

    const command = householdRunwayHistoryProjectionCommand({
      href,
      interviewStarted,
      interviewId: "browser-adapter",
      stage: projectedStage,
    });
    if (command) {
      dispatchEnvironment({
        type: "history_projection_changed",
        destination: command.destination,
        ...(command.destination === "interview" && command.stage
          ? { stage: command.stage }
          : {}),
      });
      return;
    }
    const shouldStart = interviewStarted;
    if (
      (shouldStart && url.searchParams.get("start") !== "1") ||
      (!shouldStart && url.searchParams.get("start") === "1") ||
      (!shouldStart && requestedStageParameter !== null) ||
      (shouldStart &&
        (requestedStageParameter !== null &&
          (requestedStage === undefined || requestedStage !== snapshot.stage)))
    ) {
      navigate({
        action: "replace",
        destination: shouldStart ? "interview" : "landing",
      });
    }
  };

  const onHistory = () => {
    if (runtime.getSnapshot().lifecycle !== "ready") {
      initialHrefForProjection = environment?.location.href;
      return;
    }
    reconcileUrl();
  };
  const onLocale = () => {
    let locale: RunwayLocale | undefined;
    try {
      locale = options.localeProvider?.();
    } catch {
      // A locale provider is optional presentation input; the Runtime must
      // still flush its latest eligible Draft when that input is unavailable.
    }
    dispatchEnvironment({
      type: "locale_changed",
      ...(locale ? { locale } : {}),
    });
  };

  const subscribeToBrowser = (
    event: "history" | "locale",
    type: string,
    listener: () => void,
  ) => {
    if (!environment?.addEventListener || !environment.removeEventListener) {
      emitAdapterOutcome(onOutcome, {
        type: "subscription",
        event,
        outcome: "unavailable",
      });
      return;
    }
    try {
      environment.addEventListener(type, listener);
      subscriptions.push({ event, type, listener });
      emitAdapterOutcome(onOutcome, {
        type: "subscription",
        event,
        outcome: "subscribed",
      });
    } catch {
      emitAdapterOutcome(onOutcome, {
        type: "subscription",
        event,
        outcome: "unavailable",
      });
    }
  };

  const adapter: HouseholdRunwayInterviewRuntime = {
    getSnapshot: () => runtime.getSnapshot(),
    subscribe: (listener) => runtime.subscribe(listener),
    start: () => {
      if (started || disposed) return;
      started = true;
      initialHrefForProjection = environment?.location.href;
      subscribeToBrowser("history", "popstate", onHistory);
      subscribeToBrowser("history", "hashchange", onHistory);
      subscribeToBrowser("locale", localeEvent, onLocale);
      removeProjectionSubscription = runtime.subscribe(reconcileUrl);
      runtime.start();
      maybeImportRestoredDeviceDraft();
    },
    send: (intent) => {
      const historyIntent =
        intent.type === "start" ||
        intent.type === "start_new" ||
        intent.type === "resume_draft" ||
        intent.type === "resume_committed_plan" ||
        intent.type === "exit" ||
        intent.type === "discard_draft";
      if (!historyIntent) {
        runtime.send(intent);
        return;
      }
      historyEffectPending = true;
      try {
        runtime.send(intent);
        if (intent.type === "start") maybeImportRestoredDeviceDraft();
      } finally {
        const snapshot = runtime.getSnapshot();
        if (
          (intent.type === "start" ||
            intent.type === "resume_draft" ||
            intent.type === "resume_committed_plan") &&
          snapshot.interviewStatus === "not_started"
        ) {
          historyEffectPending = false;
        }
        if (intent.type === "exit" && snapshot.interviewStatus !== "not_started") {
          historyEffectPending = false;
        }
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      removeProjectionSubscription?.();
      removeProjectionSubscription = undefined;
      for (const subscription of subscriptions.splice(0)) {
        try {
          environment?.removeEventListener?.(subscription.type, subscription.listener);
        } catch {
          // Cleanup is best-effort and must not leak an infrastructure error.
        }
      }
      if (environment?.cancelAnimationFrame) {
        for (const frameId of scheduledFocus) {
          try {
            environment.cancelAnimationFrame(frameId);
          } catch {
            // Ignore unsupported or already-completed browser work.
          }
        }
      }
      scheduledFocus.clear();
      runtime.dispose();
    },
  };

  return adapter;
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
    const persisted = synchronizeHouseholdRunwayDraft({
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
