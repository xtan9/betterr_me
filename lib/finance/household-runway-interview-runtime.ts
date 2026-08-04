import type {
  HouseholdRunwayAnswers,
  RunwayAdjustments,
  RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import type {
  HouseholdRunwayAnalyticsEventKind,
  HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";
import type { SuccessfulHouseholdRunwayAssessment } from "@/lib/finance/household-runway-assessment";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  householdRunwayDraftDiffersFromPlan,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewEffect,
  type HouseholdRunwayInterviewInitialization,
  type HouseholdRunwayInterviewRenderModel,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewStatus,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayDraftDeviceAction,
  type HouseholdRunwayPlan,
  type HouseholdRunwayValidationIssue,
} from "@/lib/finance/household-runway-interview";
import type { HouseholdRunwayDraftState } from "@/lib/finance/household-runway-draft-codec";

export type HouseholdRunwayInterviewRuntimeIssueCode =
  | "country_required"
  | "region_required"
  | "region_invalid"
  | "currency_required"
  | "currency_change_confirmation_required"
  | "income_required"
  | "expenses_current_required"
  | "expenses_interruption_required"
  | "draft_timestamp_required"
  | "plan_input_invalid"
  | "assessment_required"
  | "plan_adjustment_pending"
  | "draft_recovery"
  | "confirmation_unavailable";

export interface HouseholdRunwayInterviewRuntimeIssue {
  readonly code: HouseholdRunwayInterviewRuntimeIssueCode;
}

export type HouseholdRunwayInterviewRuntimeOperationStatus =
  | "idle"
  | "dirty"
  | "pending"
  | "succeeded"
  | "failed";

export type HouseholdRunwayInterviewRuntimeOperationError =
  | "authentication_required"
  | "conflict"
  | "invalid"
  | "network"
  | "storage_unavailable"
  | "download_failed"
  | "analytics_failed";

export interface HouseholdRunwayInterviewRuntimeOperation {
  readonly status: HouseholdRunwayInterviewRuntimeOperationStatus;
  readonly error?: HouseholdRunwayInterviewRuntimeOperationError;
}

export interface HouseholdRunwayInterviewRuntimeOperations {
  readonly draftSynchronization: HouseholdRunwayInterviewRuntimeOperation;
  readonly deviceDraft: HouseholdRunwayInterviewRuntimeOperation;
  readonly planPersistence: HouseholdRunwayInterviewRuntimeOperation;
  readonly reportDownload: HouseholdRunwayInterviewRuntimeOperation;
  readonly analytics: HouseholdRunwayInterviewRuntimeOperation;
}

/** User actions accepted by the Runtime. Protocol messages are deliberately absent. */
const RUNTIME_INTENT_TYPES = [
  "start_new",
  "select_country",
  "select_region",
  "select_currency",
  "request_currency_change",
  "reset_currency_entries",
  "retain_currency_entries",
  "set_household",
  "set_employment",
  "set_income",
  "set_other_income_sources",
  "set_cash",
  "set_asset",
  "set_expense_mode",
  "set_quick_expenses",
  "set_expense_category_mode",
  "set_expense_category_subtotal",
  "set_expense_item",
  "set_housing_tenure",
  "update_answers",
  "select_scenario",
  "set_plan_adjustment",
  "reset_plan_adjustment",
  "apply_plan_adjustment",
  "edit_completed_plan",
  "set_active_expense_category",
  "complete_expense_category",
  "set_reduction",
  "continue",
  "back",
  "skip",
  "exit",
  "discard_draft",
  "clear_device_draft",
  "remember_draft",
  "import_draft",
  "resume_draft",
  "resume_committed_plan",
  "save_plan",
  "request_report_download",
] as const satisfies readonly HouseholdRunwayInterviewCommandInput["type"][];

type RuntimeIntentType = (typeof RUNTIME_INTENT_TYPES)[number];

type RuntimeCommandIntent = Extract<
  HouseholdRunwayInterviewCommandInput,
  { type: RuntimeIntentType }
>;

/** The only user actions a Runtime caller may dispatch. */
export type HouseholdRunwayInterviewIntent =
  | Exclude<RuntimeCommandIntent, { type: "start_new" | "resume_draft" }>
  | { type: "start_new" }
  | { type: "resume_draft" }
  | { type: "save_plan" };

export type HouseholdRunwayInterviewRuntimeLifecycle =
  | "idle"
  | "initializing"
  | "ready"
  | "disposed";

export type HouseholdRunwayInterviewRuntimeDeepReadonly<T> =
  T extends (...args: infer Args) => infer Result
    ? (...args: Args) => Result
    : T extends readonly (infer Item)[]
      ? readonly HouseholdRunwayInterviewRuntimeDeepReadonly<Item>[]
      : T extends object
        ? {
            readonly [Key in keyof T]: HouseholdRunwayInterviewRuntimeDeepReadonly<T[Key]>;
          }
        : T;

export type HouseholdRunwayInterviewRuntimeScreen =
  HouseholdRunwayInterviewRuntimeDeepReadonly<HouseholdRunwayInterviewRenderModel>;

export interface HouseholdRunwayInterviewRuntimeAffordances {
  start: boolean;
  startNew: boolean;
  continue: boolean;
  back: boolean;
  skip: boolean;
  edit: boolean;
  savePlan: boolean;
  downloadReport: boolean;
  applyPlanAdjustment: boolean;
  resetPlanAdjustment: boolean;
}

export interface HouseholdRunwayInterviewRuntimeDerivedFacts {
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
}

export interface HouseholdRunwayInterviewRuntimeSnapshot {
  readonly lifecycle: HouseholdRunwayInterviewRuntimeLifecycle;
  readonly interviewStatus: HouseholdRunwayInterviewStatus;
  readonly stage: HouseholdRunwayInterviewStage | null;
  readonly screen: HouseholdRunwayInterviewRuntimeScreen;
  readonly derived: HouseholdRunwayInterviewRuntimeDeepReadonly<HouseholdRunwayInterviewRuntimeDerivedFacts>;
  readonly plan: HouseholdRunwayInterviewRuntimePlanFacts;
  readonly draft: HouseholdRunwayInterviewRuntimeDraftFacts;
  readonly issues: readonly HouseholdRunwayInterviewRuntimeIssue[];
  readonly operations: HouseholdRunwayInterviewRuntimeOperations;
  readonly confirmation: HouseholdRunwayInterviewRuntimeConfirmation;
  readonly affordances: Readonly<HouseholdRunwayInterviewRuntimeAffordances>;
}

export interface HouseholdRunwayInterviewRuntimeDraftFacts {
  readonly current: boolean;
  readonly stored: boolean;
  readonly session: boolean;
  readonly device: boolean;
  readonly deviceStorageConsent: boolean;
}

export interface HouseholdRunwayInterviewRuntimePlanFacts {
  readonly exists: boolean;
  readonly revision: number | null;
}

export type HouseholdRunwayInterviewRuntimeConfirmationAction =
  | "start_new"
  | "discard_draft"
  | "clear_device_draft";

export interface HouseholdRunwayInterviewRuntimeConfirmation {
  readonly status: "idle" | "pending";
  readonly action?: HouseholdRunwayInterviewRuntimeConfirmationAction;
}

export interface HouseholdRunwayInterviewRuntimeConfirmationRequest {
  readonly action: HouseholdRunwayInterviewRuntimeConfirmationAction;
}

export interface HouseholdRunwayInterviewRuntimeDraftRequest {
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  answers: HouseholdRunwayInterviewAnswers;
}

export interface HouseholdRunwayInterviewRuntimePlanRequest {
  inputs: HouseholdRunwayAnswers;
  assessment: SuccessfulHouseholdRunwayAssessment;
  expectedPlanRevision: number;
  adjustments: RunwayAdjustments;
  snapshotTrigger: RunwaySnapshotSummary["trigger"];
}

export interface HouseholdRunwayInterviewRuntimePlanResult {
  planRevision: number;
  planInputs: HouseholdRunwayAnswers;
  assessment: SuccessfulHouseholdRunwayAssessment;
  snapshot?: RunwaySnapshotSummary;
}

export interface HouseholdRunwayInterviewRuntimeCapabilities {
  /** Injected so contract tests and hosts can keep command creation deterministic. */
  createId?: () => string;
  /** Injected clock used only when an intent is dispatched. */
  now?: () => string;
  /** External work is scheduled after the synchronous snapshot transition. */
  schedule?: (task: () => void) => void;
  /** Restores decoded Draft/Plan state. Storage keys and codec envelopes stay private to the host. */
  restore?: () => unknown | PromiseLike<unknown>;
  /** Provides semantic confirmation for destructive user intents. */
  confirm?: (
    request: HouseholdRunwayInterviewRuntimeConfirmationRequest,
  ) => boolean | Promise<boolean>;
  navigate?: (request: {
    action: "push" | "replace" | "back";
    destination: "landing" | "interview";
  }) => void;
  focus?: (stage: HouseholdRunwayInterviewStage) => void;
  synchronizeDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  rememberDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  importDraft?: (
    request: HouseholdRunwayInterviewRuntimeDraftRequest,
  ) => boolean | void | Promise<boolean | void>;
  clearDraft?: (request: {
    scope: "device" | "all";
  }) => boolean | void | Promise<boolean | void>;
  persistPlan?: (
    request: HouseholdRunwayInterviewRuntimePlanRequest,
  ) => HouseholdRunwayInterviewRuntimePlanResult | Promise<HouseholdRunwayInterviewRuntimePlanResult>;
  downloadReport?: (
    assessment: SuccessfulHouseholdRunwayAssessment,
  ) => boolean | void | Promise<boolean | void>;
  trackAnalytics?: (request: {
    eventName: HouseholdRunwayAnalyticsEventKind;
    stage?: HouseholdRunwayAnalyticsStage;
  }) => boolean | void | Promise<boolean | void>;
}

export interface HouseholdRunwayInterviewRuntimeOptions
  extends HouseholdRunwayInterviewRuntimeCapabilities {
  initialPlan?: HouseholdRunwayPlan | null;
}

export interface HouseholdRunwayInterviewRuntime {
  getSnapshot(): HouseholdRunwayInterviewRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  send(intent: HouseholdRunwayInterviewIntent): void;
  dispose(): void;
}

type RuntimeMessage =
  | { type: "start" }
  | { type: "restored"; payload?: unknown; failed?: boolean }
  | { type: "intent"; intent: HouseholdRunwayInterviewIntent; confirmed?: boolean }
  | { type: "outcome"; command: HouseholdRunwayInterviewCommand }
  | { type: "synchronize_draft"; retryFailed: boolean }
  | {
      type: "confirmation";
      id: string;
      action: HouseholdRunwayInterviewRuntimeConfirmationAction;
      accepted: boolean;
      failed?: boolean;
    };

type MaybePromise<T> = T | PromiseLike<T>;

type RuntimeStoredDraft = {
  state: HouseholdRunwayDraftState;
  expiresAt?: string;
};

type RuntimeRestorePayload = {
  session?:
    | { status: "missing" }
    | { status: "restored"; state: HouseholdRunwayDraftState; expiresAt?: string }
    | { status: "rejected"; code?: string };
  device?:
    | { status: "missing" }
    | { status: "restored"; state: HouseholdRunwayDraftState; expiresAt?: string }
    | { status: "rejected"; code?: string };
  deviceStorageConsent?: boolean;
};

interface RuntimeStorageFacts {
  session: boolean;
  device: boolean;
  deviceStorageConsent: boolean;
}

const EMPTY_STORAGE_FACTS: RuntimeStorageFacts = {
  session: false,
  device: false,
  deviceStorageConsent: false,
};

const runtimeIntentTypeSet = new Set<string>(RUNTIME_INTENT_TYPES);

function isRuntimeIntent(value: unknown): value is HouseholdRunwayInterviewIntent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    runtimeIntentTypeSet.has(value.type)
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function clonePublicValue<T>(value: T): T {
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

function snapshotSignature(snapshot: HouseholdRunwayInterviewRuntimeSnapshot) {
  return JSON.stringify(snapshot);
}

function defaultId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `runway-interview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultSchedule(task: () => void) {
  task();
}

function commandMetadata(
  id: () => string,
  now: () => string,
  type: string,
): Pick<HouseholdRunwayInterviewCommand, "commandId" | "occurredAt"> {
  return {
    commandId: `${type}:${id()}`,
    occurredAt: now(),
  };
}

function publicDraftRequest(
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
  return {
    status: effect.status,
    stage: effect.stage,
    answers: clonePublicValue(effect.draft.answers),
  };
}

function affordancesFor(
  state: HouseholdRunwayInterviewState,
  lifecycle: HouseholdRunwayInterviewRuntimeLifecycle,
): HouseholdRunwayInterviewRuntimeAffordances {
  const screen = state.renderModel;
  const completed = state.status === "completed" && state.assessment !== null;
  const collectingOrReviewing =
    state.status === "collecting" || state.status === "reviewing";
  return {
    start: lifecycle === "ready" && state.status === "not_started",
    startNew:
      lifecycle === "ready" &&
      state.status === "not_started" &&
      screen.kind === "landing" &&
      screen.hasDraft,
    continue: lifecycle === "ready" && collectingOrReviewing,
    back: lifecycle === "ready" && collectingOrReviewing,
    skip:
      lifecycle === "ready" &&
      (state.stage === "otherIncome" || state.stage === "assets"),
    edit: lifecycle === "ready" && completed,
    savePlan: lifecycle === "ready" && completed,
    downloadReport: lifecycle === "ready" && completed,
    applyPlanAdjustment:
      lifecycle === "ready" && state.stage === "result" && completed,
    resetPlanAdjustment:
      lifecycle === "ready" && state.stage === "result" && completed,
  };
}

function publicOperationFor(
  operation:
    | HouseholdRunwayInterviewState["operations"]["draftSynchronization"]
    | HouseholdRunwayInterviewState["operations"]["deviceDraft"]
    | HouseholdRunwayInterviewState["operations"]["planPersistence"]
    | HouseholdRunwayInterviewState["operations"]["reportDownload"]
    | HouseholdRunwayInterviewState["operations"]["analytics"],
): HouseholdRunwayInterviewRuntimeOperation {
  if (operation.status === "failed") {
    if (operation.error === "stale_result") {
      return { status: "idle" };
    }
    return { status: "failed", error: operation.error };
  }
  return { status: operation.status };
}

function publicOperationsFor(
  state: HouseholdRunwayInterviewState,
): HouseholdRunwayInterviewRuntimeOperations {
  return {
    draftSynchronization: publicOperationFor(
      state.operations.draftSynchronization,
    ),
    deviceDraft: publicOperationFor(state.operations.deviceDraft),
    planPersistence: publicOperationFor(state.operations.planPersistence),
    reportDownload: publicOperationFor(state.operations.reportDownload),
    analytics: publicOperationFor(state.operations.analytics),
  };
}

function publicIssueFor(
  issue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayInterviewRuntimeIssue | null {
  return issue ? { code: issue.code } : null;
}

function isDraftState(value: unknown): value is HouseholdRunwayDraftState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HouseholdRunwayDraftState>;
  return Boolean(
    candidate.draft &&
      typeof candidate.draft === "object" &&
      (candidate.status === "not_started" ||
        candidate.status === "collecting" ||
        candidate.status === "reviewing" ||
        candidate.status === "completed") &&
      (candidate.stage === null || typeof candidate.stage === "string"),
  );
}

function storedDraftFrom(
  value: RuntimeRestorePayload["session"] | RuntimeRestorePayload["device"] | undefined,
): RuntimeStoredDraft | null {
  return value?.status === "restored" && isDraftState(value.state)
    ? { state: value.state, ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}) }
    : null;
}

function restorePayloadFrom(value: unknown): RuntimeRestorePayload {
  if (!value || typeof value !== "object") return {};
  return value as RuntimeRestorePayload;
}

function draftFactsFor(
  state: HouseholdRunwayInterviewState,
  storage: RuntimeStorageFacts,
): HouseholdRunwayInterviewRuntimeDraftFacts {
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

function snapshotFor(
  state: HouseholdRunwayInterviewState,
  lifecycle: HouseholdRunwayInterviewRuntimeLifecycle,
  storage: RuntimeStorageFacts = EMPTY_STORAGE_FACTS,
  runtimeIssues: readonly HouseholdRunwayInterviewRuntimeIssue[] = [],
  confirmation: HouseholdRunwayInterviewRuntimeConfirmation = { status: "idle" },
): HouseholdRunwayInterviewRuntimeSnapshot {
  const screen = state.renderModel;
  const issue =
    state.validationIssue ??
    ("blockingIssue" in screen ? screen.blockingIssue : null);
  return deepFreeze({
    lifecycle,
    interviewStatus: state.status,
    stage: state.stage,
    screen: clonePublicValue(screen),
    derived: {
      planInputs: clonePublicValue(state.planInputs),
      assessment: clonePublicValue(state.assessment),
    },
    plan: {
      exists: state.committedPlan !== null,
      revision: state.committedPlan?.revision ?? null,
    },
    draft: draftFactsFor(state, storage),
    issues: [...runtimeIssues, ...(issue ? [publicIssueFor(issue)!] : [])],
    operations: publicOperationsFor(state),
    confirmation,
    affordances: affordancesFor(state, lifecycle),
  });
}

function outcomeCommand(
  id: () => string,
  now: () => string,
  input: HouseholdRunwayInterviewCommandInput,
): HouseholdRunwayInterviewCommand {
  return { ...input, ...commandMetadata(id, now, "outcome") } as HouseholdRunwayInterviewCommand;
}

export function createHouseholdRunwayInterviewRuntime(
  options: HouseholdRunwayInterviewRuntimeOptions = {},
): HouseholdRunwayInterviewRuntime {
  const createId = options.createId ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());
  const schedule = options.schedule ?? defaultSchedule;
  let state = createHouseholdRunwayInterview(options.initialPlan ?? null);
  let lifecycle: HouseholdRunwayInterviewRuntimeLifecycle = "idle";
  let started = false;
  let disposed = false;
  let storageFacts: RuntimeStorageFacts = { ...EMPTY_STORAGE_FACTS };
  let runtimeIssues: HouseholdRunwayInterviewRuntimeIssue[] = [];
  let confirmation: HouseholdRunwayInterviewRuntimeConfirmation = { status: "idle" };
  let pendingConfirmationIntent: HouseholdRunwayInterviewIntent | null = null;
  let pendingConfirmationId: string | null = null;
  let restoredStartStage: HouseholdRunwayInterviewStage | undefined;
  let draftSyncScheduled = false;
  let draftSyncAttempt = 0;
  let snapshot = snapshotFor(state, lifecycle, storageFacts, runtimeIssues, confirmation);
  let draining = false;
  const messages: RuntimeMessage[] = [];
  const listeners = new Set<() => void>();

  const publish = () => {
    if (disposed) return;
    const next = snapshotFor(state, lifecycle, storageFacts, runtimeIssues, confirmation);
    if (snapshotSignature(next) === snapshotSignature(snapshot)) return;
    snapshot = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A subscriber cannot prevent the Runtime from serving other subscribers.
      }
    }
  };

  const enqueue = (message: RuntimeMessage) => {
    if (disposed) return;
    messages.push(message);
    if (draining) return;
    draining = true;
    try {
      while (messages.length > 0 && !disposed) {
        const next = messages.shift();
        if (next) process(next);
      }
    } finally {
      draining = false;
    }
  };

  const enqueueOutcome = (
    createCommand: () => HouseholdRunwayInterviewCommand,
  ) => {
    if (!disposed) enqueue({ type: "outcome", command: createCommand() });
  };

  const applyRestoration = (payload: unknown, failed: boolean) => {
    const restored = restorePayloadFrom(payload);
    const session = storedDraftFrom(restored.session);
    const device = storedDraftFrom(restored.device);
    storageFacts = {
      session: session !== null,
      device: device !== null,
      deviceStorageConsent: restored.deviceStorageConsent === true,
    };
    if (
      failed ||
      restored.session?.status === "rejected" ||
      restored.device?.status === "rejected"
    ) {
      runtimeIssues = [{ code: "draft_recovery" }];
    }

    const selected =
      session && device
        ? session.state.draft.revision > device.state.draft.revision
          ? session
          : device
        : session ?? device;
    if (!selected) return;

    const committedPlan = options.initialPlan ?? null;
    const differsFromPlan = Boolean(
      committedPlan &&
        householdRunwayDraftDiffersFromPlan(
          selected.state.draft,
          committedPlan,
          selected.state.status,
          selected.state.stage,
        ),
    );
    const initialization: HouseholdRunwayInterviewInitialization = {
      status: "not_started",
      stage: null,
      draft: selected.state.draft,
      committedPlan,
      resumeChoice:
        differsFromPlan && committedPlan
          ? {
              draftStatus: selected.state.status,
              draftStage: selected.state.stage,
              recommended:
                selected.state.draft.revision >= committedPlan.revision
                  ? "draft"
                  : "plan",
            }
          : null,
    };
    state = createHouseholdRunwayInterview(initialization);
    if (!differsFromPlan) {
      restoredStartStage =
        selected.state.status === "completed"
          ? "result"
          : selected.state.stage === "result"
            ? "result"
            : selected.state.stage ?? undefined;
    }
  };

  const completeStartup = () => {
    if (disposed) return;
    if (state.status === "not_started" && !state.resumeChoice) {
      const interviewId = createId();
      applyCommand(
        {
          type: "start",
          interviewId,
          ...(restoredStartStage ? { stage: restoredStartStage } : {}),
          commandId: `start:${interviewId}`,
          occurredAt: now(),
        },
        false,
      );
    }
    lifecycle = "ready";
    publish();
  };

  const beginRestoration = () => {
    if (!options.restore) {
      completeStartup();
      return;
    }
    try {
      queueMicrotask(() => {
        if (disposed) return;
        try {
          schedule(() => {
            if (disposed) return;
            let result: MaybePromise<unknown>;
            try {
              result = options.restore!();
            } catch {
              enqueue({ type: "restored", failed: true });
              return;
            }
            Promise.resolve(result).then(
              (value) => enqueue({ type: "restored", payload: value }),
              () => enqueue({ type: "restored", failed: true }),
            );
          });
        } catch {
          enqueue({ type: "restored", failed: true });
        }
      });
    } catch {
      enqueue({ type: "restored", failed: true });
    }
  };

  const invoke = <T>(
    task: (() => MaybePromise<T>) | undefined,
    onSuccess: (value: T) => HouseholdRunwayInterviewCommand,
    onFailure: () => HouseholdRunwayInterviewCommand,
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
    Promise.resolve(result).then(
      (value) => enqueueOutcome(() => onSuccess(value)),
      () => enqueueOutcome(onFailure),
    );
  };

  const updateStorageFacts = (next: Partial<RuntimeStorageFacts>) => {
    storageFacts = { ...storageFacts, ...next };
  };

  const executeEffect = (effect: HouseholdRunwayInterviewEffect) => {
    if (disposed) return;
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
          ? () => options.synchronizeDraft!(publicDraftRequest(effect))
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
                  device: storageFacts.deviceStorageConsent,
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
        task ? () => task(publicDraftRequest(effect)) : undefined,
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
      invoke(
        options.persistPlan
          ? () =>
              options.persistPlan!({
                inputs: clonePublicValue(effect.inputs),
                assessment: clonePublicValue(effect.assessment),
                expectedPlanRevision: effect.expectedPlanRevision,
                adjustments: clonePublicValue(effect.adjustments),
                snapshotTrigger: effect.snapshotTrigger,
              })
          : undefined,
        (value) =>
          outcomeCommand(createId, now, {
            type: "plan_persistence_succeeded",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            planRevision: value.planRevision,
            planInputs: value.planInputs,
            assessment: value.assessment,
            ...(value.snapshot ? { snapshot: value.snapshot } : {}),
          }),
        () =>
          outcomeCommand(createId, now, {
            type: "plan_persistence_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "network",
          }),
      );
      return;
    }
    if (effect.type === "report_download_requested") {
      invoke(
        options.downloadReport
          ? () => options.downloadReport!(clonePublicValue(effect.assessment))
          : undefined,
        (value) =>
          value === false
            ? outcomeCommand(createId, now, {
                type: "report_download_failed",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
                error: "download_failed",
              })
            : outcomeCommand(createId, now, {
                type: "report_download_succeeded",
                sourceRevision: effect.sourceRevision,
                correlationId: effect.correlationId,
              }),
        () =>
          outcomeCommand(createId, now, {
            type: "report_download_failed",
            sourceRevision: effect.sourceRevision,
            correlationId: effect.correlationId,
            error: "download_failed",
          }),
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

  const scheduleEffects = (effects: readonly HouseholdRunwayInterviewEffect[]) => {
    if (effects.length === 0 || disposed) return;
    try {
      queueMicrotask(() => {
        if (disposed) return;
        schedule(() => {
          if (disposed) return;
          // Start every independent capability in this turn without awaiting one.
          for (const effect of effects) executeEffect(effect);
        });
      });
    } catch {
      // Scheduling is an adapter concern; the synchronous Interview state remains valid.
    }
  };

  const draftSynchronizationEligible = () =>
    !state.resumeChoice &&
    (state.status !== "not_started" ||
      state.draft.interviewId !== null ||
      (storageFacts.session || storageFacts.device));

  const scheduleDraftSynchronization = (retryFailed: boolean) => {
    if (!options.synchronizeDraft || !draftSynchronizationEligible() || draftSyncScheduled) return;
    const status = state.operations.draftSynchronization.status;
    if (status !== "dirty" && !(retryFailed && status === "failed")) return;
    draftSyncScheduled = true;
    try {
      queueMicrotask(() => {
        draftSyncScheduled = false;
        if (disposed || !draftSynchronizationEligible()) return;
        const currentStatus = state.operations.draftSynchronization.status;
        if (
          currentStatus !== "dirty" &&
          !(retryFailed && currentStatus === "failed")
        ) {
          return;
        }
        enqueue({ type: "synchronize_draft", retryFailed });
      });
    } catch {
      draftSyncScheduled = false;
    }
  };

  const requiresConfirmation = (
    intent: HouseholdRunwayInterviewIntent,
  ): HouseholdRunwayInterviewRuntimeConfirmationAction | null => {
    if (intent.type === "start_new") {
      const hasDraftOnLanding =
        state.renderModel.kind === "landing" && state.renderModel.hasDraft;
      const hasCurrentProgress = state.draft.revision > 1;
      return state.resumeChoice || hasDraftOnLanding || hasCurrentProgress
        ? "start_new"
        : null;
    }
    if (intent.type === "discard_draft") {
      return state.status !== "not_started" ||
        storageFacts.session ||
        storageFacts.device
        ? "discard_draft"
        : null;
    }
    if (intent.type === "clear_device_draft") {
      return storageFacts.device || storageFacts.deviceStorageConsent
        ? "clear_device_draft"
        : null;
    }
    return null;
  };

  const beginConfirmation = (
    action: HouseholdRunwayInterviewRuntimeConfirmationAction,
    intent: HouseholdRunwayInterviewIntent,
  ) => {
    if (confirmation.status === "pending" || disposed) return;
    const id = `${action}:${createId()}`;
    pendingConfirmationIntent = intent;
    pendingConfirmationId = id;
    confirmation = { status: "pending", action };
    publish();
    try {
      queueMicrotask(() => {
        if (disposed) return;
        if (!options.confirm) {
          enqueue({ type: "confirmation", id, action, accepted: false, failed: true });
          return;
        }
        let result: MaybePromise<boolean> = false;
        try {
          result = options.confirm({ action });
        } catch {
          enqueue({ type: "confirmation", id, action, accepted: false, failed: true });
          return;
        }
        Promise.resolve(result).then(
          (accepted) => enqueue({ type: "confirmation", id, action, accepted }),
          () => enqueue({ type: "confirmation", id, action, accepted: false, failed: true }),
        );
      });
    } catch {
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      confirmation = { status: "idle" };
      publish();
    }
  };

  const duplicatePendingIntent = (intent: HouseholdRunwayInterviewIntent) => {
    if (
      intent.type === "save_plan" &&
      state.operations.planPersistence.status === "pending"
    ) {
      return true;
    }
    if (
      intent.type === "request_report_download" &&
      state.operations.reportDownload.status === "pending"
    ) {
      return true;
    }
    if (
      (intent.type === "remember_draft" || intent.type === "import_draft") &&
      state.operations.deviceDraft.status === "pending" &&
      state.operations.deviceDraft.action ===
        (intent.type === "remember_draft" ? "remember" : "import")
    ) {
      return true;
    }
    return (
      intent.type === "clear_device_draft" &&
      state.operations.deviceDraft.status === "pending" &&
      state.operations.deviceDraft.action === "clear"
    );
  };

  const introducedStaleResult = (
    previousState: HouseholdRunwayInterviewState,
    nextState: HouseholdRunwayInterviewState,
  ) => {
    const operationNames = [
      "draftSynchronization",
      "deviceDraft",
      "planPersistence",
      "reportDownload",
      "analytics",
    ] as const;
    return operationNames.some((name) => {
      const previous = previousState.operations[name];
      const next = nextState.operations[name];
      return (
        !(previous.status === "failed" && previous.error === "stale_result") &&
        next.status === "failed" &&
        next.error === "stale_result"
      );
    });
  };

  const applyCommand = (
    command: HouseholdRunwayInterviewCommand,
    publishSnapshot: boolean,
  ) => {
    if (disposed) return;
    try {
      const previousState = state;
      const result = dispatchHouseholdRunwayInterview(previousState, command, {
        planPersistence: options.persistPlan ? "available" : "unavailable",
        snapshotTrigger: state.committedPlan ? "updated" : "completed",
      });
      state = result.state;
      if (publishSnapshot && !introducedStaleResult(previousState, result.state)) {
        publish();
      }
      scheduleEffects(result.effects);
    } catch {
      // Malformed runtime values are safe no-ops at the facade boundary.
    }
  };

  function process(message: RuntimeMessage) {
    if (message.type === "start") {
      if (started || disposed) return;
      started = true;
      lifecycle = "initializing";
      publish();
      beginRestoration();
      return;
    }
    if (message.type === "restored") {
      if (!started || disposed || lifecycle !== "initializing") return;
      applyRestoration(message.payload, message.failed === true);
      completeStartup();
      return;
    }
    if (message.type === "confirmation") {
      if (
        disposed ||
        confirmation.status !== "pending" ||
        pendingConfirmationId !== message.id ||
        confirmation.action !== message.action
      ) {
        return;
      }
      const intent = pendingConfirmationIntent;
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      if (message.failed) runtimeIssues = [{ code: "confirmation_unavailable" }];
      confirmation = { status: "idle" };
      publish();
      if (message.accepted && intent) {
        enqueue({ type: "intent", intent, confirmed: true });
      }
      return;
    }
    if (message.type === "synchronize_draft") {
      if (
        !draftSynchronizationEligible() ||
        (state.operations.draftSynchronization.status !== "dirty" &&
          !(message.retryFailed &&
            state.operations.draftSynchronization.status === "failed"))
      ) {
        return;
      }
      const command = {
        type: "synchronize_draft" as const,
        commandId: `synchronize_draft:${state.draft.revision}:${++draftSyncAttempt}`,
        occurredAt: now(),
      };
      applyCommand(command, true);
      return;
    }
    if (message.type === "outcome") {
      applyCommand(message.command, true);
      scheduleDraftSynchronization(false);
      return;
    }
    if (confirmation.status === "pending") return;
    const commandType = message.intent.type;
    if (duplicatePendingIntent(message.intent)) return;
    const confirmationAction = message.confirmed
      ? null
      : requiresConfirmation(message.intent);
    if (confirmationAction) {
      beginConfirmation(confirmationAction, message.intent);
      return;
    }
    const commandInput =
      message.intent.type === "start_new" || message.intent.type === "resume_draft"
        ? { ...message.intent, interviewId: createId() }
        : message.intent;
    const command = {
      ...commandInput,
      ...commandMetadata(createId, now, commandType),
    } as HouseholdRunwayInterviewCommand;
    applyCommand(command, true);
    scheduleDraftSynchronization(true);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (!started && !disposed) enqueue({ type: "start" });
    },
    send(intent) {
      if (!started || disposed || lifecycle !== "ready" || !isRuntimeIntent(intent)) return;
      enqueue({ type: "intent", intent });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle = "disposed";
      listeners.clear();
      messages.length = 0;
      pendingConfirmationIntent = null;
      pendingConfirmationId = null;
      snapshot = snapshotFor(state, lifecycle, storageFacts, runtimeIssues, confirmation);
    },
  };
}
