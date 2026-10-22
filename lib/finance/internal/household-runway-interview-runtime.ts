/** Owns Runtime startup, message ordering, transitions, and disposal. */

import type { RunwaySnapshotSummary, RecurringIncomeSource } from "@/lib/finance/cushion";

import type {
  HouseholdRunwayAnalyticsEventKind,
  HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";

import {
  createHouseholdRunwayInterview,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewCommand,
  householdRunwayDraftDiffersFromPlan,
  type HouseholdRunwayInterviewEffect,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewState,
  dispatchHouseholdRunwayInterview,
} from "@/lib/finance/internal/household-runway-interview";

import {
  normalizeHouseholdRunwayPlanAdjustmentIntent,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import { EMPTY_STORAGE_FACTS } from "./household-runway-runtime-contract";

import type {
  RuntimeStorageFacts,
  HouseholdRunwayInterviewRuntimeCompositionOptions,
  HouseholdRunwayInterviewRuntimeComposition,
  HouseholdRunwayInterviewRuntimeLifecycle,
  HouseholdRunwayInterviewRuntimeIssue,
  HouseholdRunwayInterviewRuntimeConfirmation,
  RuntimeMessage,
  MaybePromise,
  HouseholdRunwayInterviewRuntimePlanRestore,
  HouseholdRunwayInterviewRuntimeConfirmationAction,
  HouseholdRunwayInterviewRuntime,
  HouseholdRunwayInterviewRuntimeEnvironmentMessage,
} from "./household-runway-runtime-contract";

import {
  validatedRunwaySnapshotHistory,
  type RuntimeStoredDraft,
  restorePayloadFrom,
  storedDraftFrom,
  restorationNeedsRecovery,
  directPlanFrom,
  restoredHistoryFrom,
} from "./household-runway-runtime-restoration";

import { clonePublicValue, snapshotFor } from "./household-runway-runtime-snapshot";

import {
  type HouseholdRunwayInterviewIntent,
  commandMetadata,
  isRuntimeIntent,
} from "./household-runway-runtime-commands";

import { createRuntimeEffectExecutor } from "./household-runway-runtime-effects";

export {
  HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS,
  type HouseholdRunwayReportPresentation,
  type HouseholdRunwayInterviewRuntimeIssueCode,
  type HouseholdRunwayInterviewRuntimeIssue,
  type HouseholdRunwayInterviewRuntimeOperationStatus,
  type HouseholdRunwayInterviewRuntimeOperationError,
  type HouseholdRunwayInterviewRuntimeOperation,
  type HouseholdRunwayInterviewRuntimeOperations,
  type HouseholdRunwayInterviewRuntimeLifecycle,
  type HouseholdRunwayInterviewRuntimeDeepReadonly,
  type HouseholdRunwayInterviewRuntimeConfirmationAction,
  type HouseholdRunwayInterviewRuntimeConfirmation,
  type HouseholdRunwayInterviewRuntimeConfirmationRequest,
  type HouseholdRunwayInterviewRuntimeDraftRequest,
  type HouseholdRunwayInterviewRuntimePlanRequest,
  type HouseholdRunwayInterviewRuntimePlanResult,
  type HouseholdRunwayInterviewRuntimePlanFailure,
  type HouseholdRunwayInterviewRuntimePlanOutcome,
  type HouseholdRunwayInterviewRuntimePlanRestore,
  type HouseholdRunwayInterviewRuntimeReportRequest,
  type HouseholdRunwayInterviewRuntimeReportOutcome,
  type HouseholdRunwayInterviewRuntimeCapabilities,
  type HouseholdRunwayInterviewRuntimeOptions,
  type HouseholdRunwayInterviewRuntimeCompositionOptions,
  type HouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  type HouseholdRunwayInterviewRuntimeComposition,
} from "./household-runway-runtime-contract";

export type { HouseholdRunwayInterviewIntent } from "./household-runway-runtime-commands";

export type {
  HouseholdRunwayInterviewRuntimeScreenProjection,
  HouseholdRunwayReviewReadiness,
  HouseholdRunwayReviewLocation,
  HouseholdRunwayReviewHousehold,
  HouseholdRunwayReviewCash,
  HouseholdRunwayReviewExpenses,
  HouseholdRunwayReviewEarnedIncome,
  HouseholdRunwayReviewOtherIncome,
  HouseholdRunwayReviewLiquidInvestments,
  HouseholdRunwayReviewLastResortAssets,
  HouseholdRunwayResultOutcome,
  HouseholdRunwayGuidanceBand,
  HouseholdRunwayRuntimeComparisonFact,
  HouseholdRunwayPoint,
  HouseholdRunwaySeries,
  HouseholdRunwayFocusedRuntimeSimulation,
  HouseholdRunwayAdviceFact,
  HouseholdRunwayPrecisionNotice,
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayActionApplicability,
  HouseholdRunwayInterviewRuntimeActions,
  HouseholdRunwayInterviewRuntimeSnapshot,
  HouseholdRunwayInterviewRuntimeDraftFacts,
  HouseholdRunwayInterviewRuntimePlanFacts,
} from "./household-runway-runtime-view";

export type {
  HouseholdRunwayAssessmentSnapshotFact,
  HouseholdRunwayHistoryComparison,
} from "@/lib/finance/internal/household-runway-focused-projection";

export type {
  HouseholdRunwayAdjustmentEffect,
  HouseholdRunwayAdjustmentField,
  HouseholdRunwayAdjustmentProjection,
} from "@/lib/finance/internal/household-runway-plan-adjustment";


function snapshotSignature<T>(snapshot: T) {
  return JSON.stringify(snapshot);
}

function defaultId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .replace(
        /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
        "$1-$2-$3-$4-$5",
      );
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function defaultSchedule(task: () => void) {
  task();
}

export function createHouseholdRunwayInterviewRuntimeComposition(
  options: HouseholdRunwayInterviewRuntimeCompositionOptions = {},
): HouseholdRunwayInterviewRuntimeComposition {
  const createId = options.createId ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());
  const schedule = options.schedule ?? defaultSchedule;
  let locale = options.locale ?? "en";
  let state = createHouseholdRunwayInterview(options.initialPlan ?? null);
  let lifecycle: HouseholdRunwayInterviewRuntimeLifecycle = "idle";
  let started = false;
  let disposed = false;
  let storageFacts: RuntimeStorageFacts = { ...EMPTY_STORAGE_FACTS };
  const initialHistory =
    options.initialSnapshots === undefined
      ? []
      : validatedRunwaySnapshotHistory(options.initialSnapshots);
  let runtimeIssues: HouseholdRunwayInterviewRuntimeIssue[] =
    initialHistory === null ? [{ code: "assessment_history_invalid" }] : [];
  let committedPlan = options.initialPlan ?? null;
  let assessmentHistory: RunwaySnapshotSummary[] = clonePublicValue(
    initialHistory ?? [],
  );
  let confirmation: HouseholdRunwayInterviewRuntimeConfirmation = { status: "idle" };
  let pendingConfirmationIntent: HouseholdRunwayInterviewIntent | null = null;
  let pendingConfirmationId: string | null = null;
  let planBootstrapResolved = false;
  let restoredDraft: RuntimeStoredDraft | null = null;
  let restoredStartStage: HouseholdRunwayInterviewStage | undefined;
  let draftSyncScheduled = false;
  let draftSyncAttempt = 0;
  let startupPending = 0;
  let snapshot = snapshotFor(
    state,
    lifecycle,
    storageFacts,
    runtimeIssues,
    confirmation,
    assessmentHistory,
  );
  let draining = false;
  const messages: RuntimeMessage[] = [];
  const listeners = new Set<() => void>();

  const publish = () => {
    if (disposed) return;
    const next = snapshotFor(
      state,
      lifecycle,
      storageFacts,
      runtimeIssues,
      confirmation,
      assessmentHistory,
    );
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

  const applyAssessmentHistory = (value: unknown) => {
    const validated = validatedRunwaySnapshotHistory(value);
    if (validated === null) {
      assessmentHistory = [];
      if (!runtimeIssues.some((issue) => issue.code === "assessment_history_invalid")) {
        runtimeIssues = [
          ...runtimeIssues,
          { code: "assessment_history_invalid" },
        ];
      }
      return;
    }
    assessmentHistory = clonePublicValue(validated);
  };

  const applyRestoration = (payload: unknown, failed: boolean) => {
    const restored = restorePayloadFrom(payload);
    const session = storedDraftFrom(restored.session, "session");
    const device = storedDraftFrom(restored.device, "device");
    const eligibleDevice =
      restored.deviceStorageConsent === true ? device : null;
    storageFacts = {
      session: session?.source === "session",
      device: eligibleDevice?.source === "device",
      deviceStorageConsent: restored.deviceStorageConsent === true,
    };
    if (
      failed ||
      restorationNeedsRecovery(restored.session) ||
      restorationNeedsRecovery(restored.device) ||
      (device !== null && eligibleDevice === null)
    ) {
      runtimeIssues = [
        ...runtimeIssues.filter((issue) => issue.code !== "draft_recovery"),
        { code: "draft_recovery" },
      ];
    }

    const directRestoredPlan = directPlanFrom(restored.plan);
    if (restored.plan !== undefined || restored.committedPlan !== undefined) {
      planBootstrapResolved = true;
    }
    const restoredPlan =
      restored.plan?.status === "restored"
        ? restored.plan.plan
        : directRestoredPlan !== undefined
          ? directRestoredPlan
          : restored.committedPlan !== undefined
            ? restored.committedPlan
            : undefined;
    if (restored.plan?.status === "rejected") {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
    }
    if (restored.plan?.status === "missing") {
      committedPlan = null;
    } else if (restoredPlan !== undefined) {
      committedPlan = restoredPlan;
    }
    const restoredHistory = restoredHistoryFrom(restored);
    if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);

    const selected =
      session && eligibleDevice
        ? session.state.draft.revision > eligibleDevice.state.draft.revision
          ? session
          : eligibleDevice
        : session ?? eligibleDevice;
    restoredDraft = selected;
  };

  const applyPlanRestoration = (payload: unknown, failed: boolean) => {
    planBootstrapResolved = true;
    if (failed) {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
      return;
    }
    const restored = restorePayloadFrom(payload);
    const planValue = restored.plan;
    const directPlan = directPlanFrom(planValue);
    if (planValue?.status === "rejected") {
      runtimeIssues = [...runtimeIssues, { code: "plan_recovery" }];
      return;
    }
    if (planValue?.status === "missing" || directPlan === null) {
      committedPlan = null;
    } else if (planValue?.status === "restored") {
      committedPlan = planValue.plan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    } else if (directPlan !== undefined) {
      committedPlan = directPlan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    } else if (restored.committedPlan !== undefined) {
      committedPlan = restored.committedPlan;
      const restoredHistory = restoredHistoryFrom(restored);
      if (restoredHistory.present) applyAssessmentHistory(restoredHistory.value);
    }
  };

  const finishStartupPart = () => {
    startupPending -= 1;
    if (startupPending === 0) completeStartup();
  };

  const completeStartup = () => {
    if (disposed) return;
    if (restoredDraft) {
      const differsFromPlan = Boolean(
        committedPlan &&
          householdRunwayDraftDiffersFromPlan(
            restoredDraft.state.draft,
            committedPlan,
            restoredDraft.state.status,
            restoredDraft.state.stage,
          ),
      );
      state = createHouseholdRunwayInterview({
        status: "not_started",
        stage: null,
        draft: restoredDraft.state.draft,
        committedPlan,
        resumeChoice:
          differsFromPlan && committedPlan
            ? {
                draftStatus: restoredDraft.state.status,
                draftStage: restoredDraft.state.stage,
                recommended:
                  restoredDraft.state.draft.revision >= committedPlan.revision
                    ? "draft"
                    : "plan",
              }
            : null,
      });
      if (!differsFromPlan) {
        restoredStartStage =
          restoredDraft.state.status === "completed"
            ? "result"
            : restoredDraft.state.stage === "result"
              ? "result"
              : restoredDraft.state.stage ?? undefined;
      }
    } else if (planBootstrapResolved) {
      state = createHouseholdRunwayInterview(committedPlan);
    }
    if (
      (options.autoStart ?? true) &&
      state.status === "not_started" &&
      !state.resumeChoice
    ) {
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
    if (
      options.authenticated !== true &&
      state.renderModel.kind === "landing"
    ) {
      beginAnalytics("landing_view", "landing");
    }
  };

  const beginRestoration = () => {
    if (!options.restore) {
      finishStartupPart();
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

  const beginPlanRestoration = () => {
    if (!options.restorePlan) {
      finishStartupPart();
      return;
    }
    try {
      queueMicrotask(() => {
        if (disposed) return;
        try {
          schedule(() => {
            if (disposed) return;
            let result: MaybePromise<HouseholdRunwayInterviewRuntimePlanRestore>;
            try {
              result = options.restorePlan!();
            } catch {
              enqueue({ type: "plan_restored", failed: true });
              return;
            }
            Promise.resolve(result).then(
              (value) => enqueue({ type: "plan_restored", payload: value }),
              () => enqueue({ type: "plan_restored", failed: true }),
            );
          });
        } catch {
          enqueue({ type: "plan_restored", failed: true });
        }
      });
    } catch {
      enqueue({ type: "plan_restored", failed: true });
    }
  };

  const updateStorageFacts = (next: Partial<RuntimeStorageFacts>) => {
    storageFacts = { ...storageFacts, ...next };
  };

  const executeEffect = createRuntimeEffectExecutor({
    options,
    createId,
    now,
    isDisposed: () => disposed,
    getLocale: () => locale,
    enqueueOutcome,
    updateStorageFacts,
  });

  const scheduleEffects = (
    effects: readonly HouseholdRunwayInterviewEffect[],
    immediately = false,
  ) => {
    if (effects.length === 0 || disposed) return;
    if (immediately) {
      for (const effect of effects) executeEffect(effect, true);
      return;
    }
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
        ? "start_over"
        : null;
    }
    if (intent.type === "discard_draft") {
      return state.status !== "not_started" ||
        storageFacts.session ||
        storageFacts.device
        ? "discard_work"
        : null;
    }
    if (intent.type === "clear_device_draft") {
      return storageFacts.device ? "clear_draft" : null;
    }
    return null;
  };

  const commandInputsForIntent = (
    intent: HouseholdRunwayInterviewIntent,
  ): readonly HouseholdRunwayInterviewCommandInput[] => {
    const replaceOtherIncomeSources = (
      sources: readonly RecurringIncomeSource[],
    ): readonly HouseholdRunwayInterviewCommandInput[] => [
      { type: "set_other_income_sources", sources },
    ];

    if (intent.type === "registration_clicked") return [];

    if (intent.type === "set_plan_adjustment") {
      return [
        {
          ...intent,
          patch: normalizeHouseholdRunwayPlanAdjustmentIntent({
            patch: intent.patch,
            planInputs: state.planInputs,
          }),
        },
      ];
    }

    if (intent.type === "continue") {
      const location = state.draft.location;
      if (
        state.stage === "location" &&
        location.currency === null &&
        location.proposedCurrency
      ) {
        return [
          { type: "select_currency", currency: location.proposedCurrency },
          intent,
        ];
      }
    }

    if (intent.type === "back") {
      if (
        state.renderModel.kind === "expenses" &&
        state.renderModel.activeCategory
      ) {
        return [
          {
            type: "complete_expense_category",
            category: state.renderModel.activeCategory,
          },
        ];
      }
      return [intent];
    }

    if (intent.type === "set_other_income_source_enabled") {
      if (state.renderModel.kind !== "otherIncome") return [];
      const existing = state.renderModel.sources.find(
        (source) => source.type === intent.sourceType,
      );
      if (intent.enabled) {
        return replaceOtherIncomeSources(
          existing
            ? state.renderModel.sources
            : [
                ...state.renderModel.sources,
                {
                  id: createId(),
                  type: intent.sourceType,
                  monthly_cents: 0,
                  confidence: "confirmed",
                },
              ],
        );
      }
      if (!existing) return [];
      return replaceOtherIncomeSources(
        state.renderModel.sources.filter((source) => source.id !== existing.id),
      );
    }

    if (intent.type === "update_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      if (!state.renderModel.sources.some((source) => source.id === intent.id)) {
        return [];
      }
      return replaceOtherIncomeSources(
        state.renderModel.sources.map((source) =>
          source.id === intent.id ? { ...source, ...intent.patch } : source,
        ),
      );
    }

    if (intent.type === "add_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      return replaceOtherIncomeSources([
        ...state.renderModel.sources,
        {
          id: createId(),
          type: "other",
          label: "",
          monthly_cents: 0,
          confidence: "confirmed",
        },
      ]);
    }

    if (intent.type === "remove_other_income_source") {
      if (state.renderModel.kind !== "otherIncome") return [];
      if (!state.renderModel.sources.some((source) => source.id === intent.id)) {
        return [];
      }
      return replaceOtherIncomeSources(
        state.renderModel.sources.filter((source) => source.id !== intent.id),
      );
    }

    return [intent as HouseholdRunwayInterviewCommandInput];
  };

  const beginAnalytics = (
    eventName: HouseholdRunwayAnalyticsEventKind,
    stage: HouseholdRunwayAnalyticsStage,
  ) => {
    if (
      disposed ||
      !options.trackAnalytics ||
      state.operations.analytics.status === "pending"
    ) {
      return;
    }
    applyCommand(
      {
        type: "request_analytics",
        eventName,
        stage,
        ...commandMetadata(createId, now, "analytics"),
      } as HouseholdRunwayInterviewCommand,
      true,
    );
  };

  const analyticsForIntent = (
    intent: HouseholdRunwayInterviewIntent,
    previousState: HouseholdRunwayInterviewState,
    nextState: HouseholdRunwayInterviewState,
  ): { eventName: HouseholdRunwayAnalyticsEventKind; stage: HouseholdRunwayAnalyticsStage } | null => {
    if (intent.type === "registration_clicked") {
      return { eventName: "registration_clicked", stage: "result" };
    }
    if (intent.type === "select_scenario") {
      return { eventName: "result_interaction", stage: "scenario_switch" };
    }
    if (
      intent.type === "continue" &&
      previousState.stage === "review" &&
      nextState.status === "completed"
    ) {
      return { eventName: "completed", stage: "result" };
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
      (intent.type === "clear_device_draft" || intent.type === "discard_draft") &&
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
    immediately = false,
  ) => {
    if (disposed) return;
    try {
      const previousState = state;
      const result = dispatchHouseholdRunwayInterview(previousState, command, {
        // Capability absence is surfaced by the Runtime effect boundary as a
        // typed unavailable outcome; authentication failures come back from
        // an injected persistence capability.
        planPersistence: "available",
        snapshotTrigger: state.committedPlan ? "updated" : "completed",
      });
      state = result.state;
      if (
        command.type === "plan_persistence_succeeded" &&
        result.state.operations.planPersistence.status === "succeeded" &&
        result.state.operations.planPersistence.correlationId === command.correlationId
      ) {
        if (command.snapshots !== undefined) {
          applyAssessmentHistory(command.snapshots);
        } else if (command.snapshot) {
          applyAssessmentHistory([
            command.snapshot,
            ...assessmentHistory.filter((item) => item.id !== command.snapshot?.id),
          ]);
        }
      }
      if (publishSnapshot && !introducedStaleResult(previousState, result.state)) {
        publish();
      }
      scheduleEffects(result.effects, immediately);
    } catch {
      // Malformed runtime values are safe no-ops at the facade boundary.
    }
  };

  function process(message: RuntimeMessage) {
    if (message.type === "start") {
      if (started || disposed) return;
      started = true;
      lifecycle = "initializing";
      startupPending =
        (options.restore ? 1 : 0) + (options.restorePlan ? 1 : 0);
      publish();
      if (options.restore) beginRestoration();
      if (options.restorePlan) beginPlanRestoration();
      if (startupPending === 0) completeStartup();
      return;
    }
    if (message.type === "restored") {
      if (!started || disposed || lifecycle !== "initializing") return;
      applyRestoration(message.payload, message.failed === true);
      finishStartupPart();
      return;
    }
    if (message.type === "plan_restored") {
      if (!started || disposed || lifecycle !== "initializing") return;
      applyPlanRestoration(message.payload, message.failed === true);
      finishStartupPart();
      return;
    }
    if (message.type === "environment") {
      if (!started || disposed || lifecycle !== "ready") return;
      if (message.message.type === "locale_changed") {
        if (message.message.locale) locale = message.message.locale;
        if (!draftSynchronizationEligible()) return;
        const status = state.operations.draftSynchronization.status;
        if (status !== "dirty" && status !== "failed") return;
        applyCommand(
          {
            type: "synchronize_draft",
            commandId: `synchronize_draft:${state.draft.revision}:${++draftSyncAttempt}`,
            occurredAt: now(),
          },
          true,
          true,
        );
        return;
      }
      const command = {
        ...message.message,
        ...(message.message.destination === "interview"
          ? { interviewId: createId() }
          : {}),
        ...commandMetadata(createId, now, "history_projection_changed"),
      } as HouseholdRunwayInterviewCommand;
      applyCommand(command, true);
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
      if (message.accepted === true && intent) {
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
    const previousState = state;
    if (message.intent.type === "registration_clicked") {
      beginAnalytics("registration_clicked", "result");
      return;
    }
    const commandInputs = commandInputsForIntent(message.intent);
    for (const commandInput of commandInputs) {
      const input =
        commandInput.type === "start" ||
        commandInput.type === "start_new" ||
        commandInput.type === "resume_draft"
          ? { ...commandInput, interviewId: createId() }
          : commandInput;
      const command = {
        ...input,
        ...(commandInput.type === "save_plan"
          ? { commandId: createId(), occurredAt: now() }
          : commandMetadata(createId, now, commandType)),
      } as HouseholdRunwayInterviewCommand;
      applyCommand(command, true);
    }
    scheduleDraftSynchronization(true);
    const analytics = analyticsForIntent(message.intent, previousState, state);
    if (analytics) beginAnalytics(analytics.eventName, analytics.stage);
  }

  const runtime: HouseholdRunwayInterviewRuntime = {
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
      snapshot = snapshotFor(
        state,
        lifecycle,
        storageFacts,
        runtimeIssues,
        confirmation,
        assessmentHistory,
      );
    },
  };

  const dispatchEnvironment = (
    message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
  ) => {
    if (!disposed) enqueue({ type: "environment", message });
  };

  return { runtime, dispatchEnvironment };
}

export function createHouseholdRunwayInterviewRuntimeWithCapabilities(
  options: HouseholdRunwayInterviewRuntimeCompositionOptions = {},
): HouseholdRunwayInterviewRuntime {
  return createHouseholdRunwayInterviewRuntimeComposition(options).runtime;
}
