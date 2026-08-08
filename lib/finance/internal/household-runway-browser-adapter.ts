import {
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  type HouseholdRunwayInterviewStage,
} from "@/lib/finance/internal/household-runway-interview";
import type {
  HouseholdRunwayAnswers,
  RunwayCountry,
  RunwayCurrency,
  RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import type { SuccessfulHouseholdRunwayAssessment } from "@/lib/finance/household-runway-assessment";
import { downloadHouseholdRunwayAssessment } from "@/lib/finance/internal/household-runway-download";
import {
  clearHouseholdRunwayDeviceDraft,
  clearHouseholdRunwayDraft,
  hasHouseholdRunwayDeviceStorageConsent,
  persistHouseholdRunwayDraft,
  persistHouseholdRunwaySessionDraft,
  readHouseholdRunwayDeviceDraft,
  readHouseholdRunwayDraft,
  rememberHouseholdRunwayDraft,
} from "@/lib/finance/internal/runway-draft-client";
import {
  runwayAttribution,
  trackRunwayEvent,
} from "@/lib/finance/runway-analytics-client";
import type { HouseholdRunwayDraftStorageReadResult } from "@/lib/finance/internal/runway-draft-client";
import type { HouseholdRunwayDraftState } from "@/lib/finance/internal/household-runway-draft-codec";
import {
  createHouseholdRunwayInterviewRuntimeComposition,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimeCapabilities,
  type HouseholdRunwayInterviewRuntimeConfirmationRequest,
  type HouseholdRunwayInterviewRuntimeDraftRequest,
  type HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  type HouseholdRunwayInterviewRuntimePlanOutcome,
  type HouseholdRunwayInterviewRuntimePlanRequest,
  type HouseholdRunwayInterviewRuntimeReportRequest,
  type HouseholdRunwayInterviewRuntimeOptions,
  type HouseholdRunwayReportPresentation,
} from "@/lib/finance/internal/household-runway-interview-runtime";
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

type HouseholdRunwayBrowserEffectOutcome =
  | { type: "history"; outcome: "applied" | "unavailable" }
  | {
      type: "focus";
      stage: HouseholdRunwayInterviewStage;
      outcome: "focused" | "scheduled" | "unavailable";
    };

type HouseholdRunwayHistoryRequest = {
  action: "push" | "replace" | "back";
  destination: "landing" | "interview";
};

type HouseholdRunwayFocusRequest = {
  stage: HouseholdRunwayInterviewStage;
};

interface HouseholdRunwayBrowserStorageSnapshot {
  session: HouseholdRunwayDraftStorageReadResult;
  device: HouseholdRunwayDraftStorageReadResult;
  deviceStorageConsent: boolean;
}

export interface HouseholdRunwayBrowserReportPresentationRequest {
  readonly locale: RunwayLocale;
  readonly country: RunwayCountry;
  readonly region: string;
  readonly currency: RunwayCurrency;
}

export type HouseholdRunwayBrowserReportPresentation = (
  request: HouseholdRunwayBrowserReportPresentationRequest,
) => HouseholdRunwayReportPresentation;

export interface HouseholdRunwayBrowserAdapterOptions
  extends HouseholdRunwayInterviewRuntimeOptions {
  environment?: HouseholdRunwayBrowserEnvironment;
  localeChangeEvent?: string;
  reportPresentation?: HouseholdRunwayBrowserReportPresentation;
  localeProvider?: () => RunwayLocale;
  confirm?: (
    request: HouseholdRunwayInterviewRuntimeConfirmationRequest,
  ) => boolean | Promise<boolean>;
}

export type HouseholdRunwayBrowserAdapterCompositionOptions =
  HouseholdRunwayBrowserAdapterOptions &
    Omit<HouseholdRunwayInterviewRuntimeCapabilities, "confirm">;

interface HouseholdRunwayHistoryProjectionInput {
  href: string;
  interviewStarted: boolean;
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

function readHouseholdRunwayBrowserStorage(): HouseholdRunwayBrowserStorageSnapshot {
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
function restoreHouseholdRunwayBrowserRuntime(): unknown {
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
 * private environment message; the browser adapter never decides how the
 * Interview state should change.
 */
function householdRunwayHistoryProjectionMessage({
  href,
  interviewStarted,
  stage,
}: HouseholdRunwayHistoryProjectionInput):
  | HouseholdRunwayInterviewRuntimeEnvironmentMessage
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
  effect: HouseholdRunwayHistoryRequest,
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
    const current = new URL(environment.location.href);
    const currentUrl = `${current.pathname}${current.search}${current.hash}`;
    if (currentUrl === projectedUrl) {
      return { type: "history", outcome: "applied" };
    }
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
  effect: HouseholdRunwayFocusRequest,
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

function applyHouseholdRunwayBrowserEffect(
  effect:
    | ({ type: "history" } & HouseholdRunwayHistoryRequest)
    | ({ type: "focus" } & HouseholdRunwayFocusRequest),
  environment = browserEnvironment(),
): HouseholdRunwayBrowserEffectOutcome {
  return effect.type === "history"
    ? applyHistoryEffect(effect, environment)
    : applyFocusEffect(effect, environment);
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
export function createHouseholdRunwayBrowserAdapterWithCapabilities(
  options: HouseholdRunwayBrowserAdapterCompositionOptions = {},
): HouseholdRunwayInterviewRuntime {
  const environment = options.environment ?? browserEnvironment();
  const localeEvent = options.localeChangeEvent ?? "betterr:before-locale-change";
  const scheduledFocus = new Set<number>();
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
    applyHouseholdRunwayBrowserEffect(
      { type: "history", ...request },
      environment,
    );
    if (request.destination === "interview") {
      initialHrefForProjection = environment?.location.href;
      historyEffectPending = false;
    } else if (request.action !== "back") {
      initialHrefForProjection = environment?.location.href;
      historyEffectPending = false;
    }
  };

  const focus = (stage: HouseholdRunwayInterviewStage) => {
    if (!environment?.requestAnimationFrame) {
      applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage },
        environment,
      );
      return;
    }

    let callbackRan = false;
    let frameId: number | undefined;
    const callback = () => {
      callbackRan = true;
      if (frameId !== undefined) scheduledFocus.delete(frameId);
      if (disposed) return;
      applyFocusEffect(
        { stage },
        { ...environment, requestAnimationFrame: undefined },
      );
    };
    try {
      frameId = environment.requestAnimationFrame(callback);
      if (!callbackRan && frameId !== undefined) scheduledFocus.add(frameId);
    } catch {
      // Focus is best-effort presentation work.
    }
  };

  const schedule = options.schedule
    ? (task: () => void) => {
        try {
          options.schedule?.(task);
        } catch {
          // Scheduling is best-effort; Runtime state remains authoritative.
        }
      }
    : undefined;

  const browserCapabilities = {
    restore: options.restore ?? restoreHouseholdRunwayBrowserRuntime,
    synchronizeDraft:
      options.synchronizeDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        synchronizeHouseholdRunwayDraft(request).success),
    rememberDraft:
      options.rememberDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        rememberHouseholdRunwayDraft(request).success),
    importDraft:
      options.importDraft ??
      ((request: HouseholdRunwayInterviewRuntimeDraftRequest) =>
        persistHouseholdRunwaySessionDraft(request).success &&
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
        : persistHouseholdRunwayPlan),
    downloadReport:
      options.downloadReport ??
      ((request: HouseholdRunwayInterviewRuntimeReportRequest) => {
        const { answers } = request.assessment;
        const presentation = options.reportPresentation?.({
          locale: request.locale,
          country: answers.country,
          region: answers.region,
          currency: answers.currency,
        });
        return presentation
          ? downloadHouseholdRunwayAssessment(request.assessment, presentation).success
          : false;
      }),
    trackAnalytics:
      options.trackAnalytics ??
      ((request: { eventName: Parameters<typeof trackRunwayEvent>[0]; stage?: Parameters<typeof trackRunwayEvent>[1] }) =>
        trackRunwayEvent(request.eventName, request.stage)),
  };

  const {
    runtime,
    dispatchEnvironment: dispatchRuntimeEnvironment,
  } = createHouseholdRunwayInterviewRuntimeComposition({
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
      dispatchRuntimeEnvironment(message);
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
      const message = householdRunwayHistoryProjectionMessage({
        href,
        interviewStarted: snapshot.interviewStatus !== "not_started",
        stage: stageFromHref(href),
      });
      if (message) {
        dispatchEnvironment(message);
      } else {
        // A malformed browser URL cannot be projected; keep Runtime state authoritative.
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

    const message = householdRunwayHistoryProjectionMessage({
      href,
      interviewStarted,
      stage: projectedStage,
    });
    if (message) {
      dispatchEnvironment(message);
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
    historyEffectPending = false;
    initialHrefForProjection = environment?.location.href;
    if (runtime.getSnapshot().lifecycle !== "ready") {
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
    _event: "history" | "locale",
    type: string,
    listener: () => void,
  ) => {
    if (!environment?.addEventListener || !environment.removeEventListener) {
      return;
    }
    try {
      environment.addEventListener(type, listener);
      subscriptions.push({ event: _event, type, listener });
    } catch {
      // Browser subscriptions are best-effort; Runtime state remains usable.
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
      const snapshotBeforeIntent = runtime.getSnapshot();
      const backChangesHistory =
        intent.type === "back" &&
        (snapshotBeforeIntent.interviewStatus === "collecting" ||
          snapshotBeforeIntent.interviewStatus === "reviewing") &&
        !(
          snapshotBeforeIntent.screen.kind === "expenses" &&
          snapshotBeforeIntent.screen.activeCategory
        );
      const historyIntent =
        intent.type === "start" ||
        intent.type === "start_new" ||
        intent.type === "resume_draft" ||
        intent.type === "resume_committed_plan" ||
        backChangesHistory ||
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

function planPersistenceError(status: number) {
  return status === 401 || status === 403
    ? ("authentication_required" as const)
    : status === 409
      ? ("conflict" as const)
      : status >= 400 && status < 500
        ? ("invalid" as const)
        : ("network" as const);
}

async function persistHouseholdRunwayPlan(
  request: HouseholdRunwayInterviewRuntimePlanRequest,
): Promise<HouseholdRunwayInterviewRuntimePlanOutcome> {
  try {
    const response = await fetch("/api/finance/cushion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: request.inputs,
        adjustments: request.adjustments,
        status: "completed",
        attribution: runwayAttribution(),
        idempotency_key: request.idempotencyKey,
        expected_revision: request.expectedPlanRevision,
        snapshot_action_id: request.snapshotActionId,
        snapshot_trigger: request.snapshotTrigger,
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
        success: false,
        error: planPersistenceError(response.status),
        ...(typeof payload.current_revision === "number"
          ? { currentPlanRevision: payload.current_revision }
          : {}),
      };
    }
    if (
      typeof payload.revision !== "number" ||
      !Number.isInteger(payload.revision) ||
      !payload.plan?.answers ||
      !payload.assessment
    ) {
      throw new Error("Invalid Household Runway commit response");
    }
    return {
      planRevision: payload.revision,
      planInputs: payload.plan.answers,
      assessment: payload.assessment,
      ...(payload.snapshot ? { snapshot: payload.snapshot } : {}),
      ...(payload.snapshots ? { snapshots: payload.snapshots } : {}),
    };
  } catch {
    return { success: false, error: "network" };
  }
}
