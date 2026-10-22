/** Constructs immutable state transitions and invalidates dependent answers. */

import {
  type HouseholdRunwayPlan,
  createHouseholdRunwayPlan,
} from "@/lib/finance/household-runway-plan";

import {
  type HouseholdRunwayInterviewOperations,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewSnapshot,
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayInterviewDraft,
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  type HouseholdRunwayInterviewInitialization,
} from "./household-runway-interview-model";

import { normalizeDraft } from "./household-runway-interview-draft";

import { reviewProjectionForDraft } from "./household-runway-interview-assessment";

import { renderFor } from "./household-runway-interview-render";

import type {
  HouseholdRunwayLandingRenderModel,
  HouseholdRunwayResumeChoiceRenderModel,
  HouseholdRunwayReviewRenderModel,
  HouseholdRunwayGenericStageRenderModel,
  HouseholdRunwayInterviewRenderModel,
} from "./household-runway-interview-projections";

import type {
  HouseholdRunwayInterviewEvent,
  HouseholdRunwayInterviewEffect,
  HouseholdRunwayInterviewTransition,
  HouseholdRunwayInterviewCommand,
} from "./household-runway-interview-protocol";

import {
  isStageApplicable,
  clearStageAnswers,
  repairCurrentStage,
  statusForStage,
  stageIndex,
} from "./household-runway-interview-stages";

import {
  normalizeLocation,
  proposedCurrencyFor,
  availableScenarios,
} from "./household-runway-interview-answers";

function defaultInterviewOperations(): HouseholdRunwayInterviewOperations {
  return {
    draftSynchronization: { status: "idle" },
    deviceDraft: { status: "idle" },
    planPersistence: { status: "idle" },
    reportDownload: { status: "idle" },
    analytics: { status: "idle" },
  };
}

function normalizeOperations(
  input: Partial<HouseholdRunwayInterviewOperations> | null | undefined,
): HouseholdRunwayInterviewOperations {
  const defaults = defaultInterviewOperations();
  return {
    ...defaults,
    ...input,
    draftSynchronization:
      input?.draftSynchronization ?? defaults.draftSynchronization,
    deviceDraft: input?.deviceDraft ?? defaults.deviceDraft,
    planPersistence: input?.planPersistence ?? defaults.planPersistence,
    reportDownload: input?.reportDownload ?? defaults.reportDownload,
    analytics: input?.analytics ?? defaults.analytics,
  };
}

function normalizeCommittedPlan(
  input: HouseholdRunwayPlan | null | undefined,
): HouseholdRunwayPlan | null {
  return input ? createHouseholdRunwayPlan(input) : null;
}

export function snapshotOf(state: HouseholdRunwayInterviewState): HouseholdRunwayInterviewSnapshot {
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: state.status,
    stage: state.stage,
    draft: state.draft,
    committedPlan: state.committedPlan,
    resumeChoice: state.resumeChoice,
    operations: state.operations,
    validationIssue: state.validationIssue,
  };
}

function stateFrom(
  snapshot: HouseholdRunwayInterviewSnapshot,
): HouseholdRunwayInterviewState {
  const draft = normalizeDraft(snapshot.draft);
  const committedPlan = normalizeCommittedPlan(snapshot.committedPlan);
  const operations = normalizeOperations(snapshot.operations);
  const status = snapshot.status;
  const stage =
    status === "not_started"
      ? null
      : status === "completed"
        ? "result"
        : status === "reviewing"
          ? "review"
          : snapshot.stage && snapshot.stage !== "result"
            ? snapshot.stage
            : "location";
  const reviewProjection =
    status === "reviewing" || status === "completed"
      ? reviewProjectionForDraft(draft)
      : null;
  const validationIssue =
    snapshot.validationIssue ?? reviewProjection?.validationIssue ?? null;
  const renderModel = renderFor(
    status,
    stage,
    draft,
    validationIssue,
    reviewProjection,
    snapshot.resumeChoice ?? null,
    committedPlan,
  );
  const derived = {
    planInputs: reviewProjection?.planInputs ?? null,
    assessment: reviewProjection?.assessment ?? null,
  };
  if (status === "not_started") {
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: null,
      draft,
      committedPlan,
      operations,
      resumeChoice: snapshot.resumeChoice ?? null,
      validationIssue,
      ...derived,
      renderModel: renderModel as
        | HouseholdRunwayLandingRenderModel
        | HouseholdRunwayResumeChoiceRenderModel,
    };
  }
  if (status === "reviewing") {
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: "review",
      draft,
      committedPlan,
      operations,
      resumeChoice: snapshot.resumeChoice ?? null,
      validationIssue,
      ...derived,
      renderModel: renderModel as HouseholdRunwayReviewRenderModel,
    };
  }
  if (status === "completed") {
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: "result",
      draft,
      committedPlan,
      operations,
      resumeChoice: snapshot.resumeChoice ?? null,
      validationIssue,
      ...derived,
      renderModel: renderModel as HouseholdRunwayGenericStageRenderModel,
    };
  }
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: "collecting",
    stage: stage as Exclude<HouseholdRunwayInterviewStage, "result">,
    draft,
    committedPlan,
    operations,
    resumeChoice: snapshot.resumeChoice ?? null,
    validationIssue,
    ...derived,
    renderModel: renderModel as Exclude<
      HouseholdRunwayInterviewRenderModel,
      HouseholdRunwayLandingRenderModel | HouseholdRunwayResumeChoiceRenderModel
    >,
  };
}

export function transition(
  state: HouseholdRunwayInterviewState,
  next: HouseholdRunwayInterviewSnapshot,
  events: readonly HouseholdRunwayInterviewEvent[],
  effects: readonly HouseholdRunwayInterviewEffect[],
): HouseholdRunwayInterviewTransition {
  const nextDraftRevision = next.draft.revision ?? state.draft.revision;
  const suppliedOperations = next.operations
    ? normalizeOperations(next.operations)
    : { ...state.operations };
  const operations =
    nextDraftRevision !== state.draft.revision &&
    next.operations?.draftSynchronization === undefined
      ? {
          ...suppliedOperations,
          draftSynchronization: {
            status: "dirty" as const,
            sourceRevision: nextDraftRevision,
          },
        }
      : suppliedOperations;
  const nextState = stateFrom({
    ...next,
    committedPlan:
      next.committedPlan === undefined
        ? state.committedPlan
        : next.committedPlan,
    resumeChoice:
      next.resumeChoice === undefined ? state.resumeChoice : next.resumeChoice,
    operations,
  });
  return {
    state: nextState,
    nextState,
    renderModel: nextState.renderModel,
    planInputs: nextState.planInputs,
    assessment: nextState.assessment,
    events,
    effects,
  };
}

export function event<T extends HouseholdRunwayInterviewEvent["type"]>(
  command: HouseholdRunwayInterviewCommand,
  type: T,
  payload: Record<string, unknown>,
): HouseholdRunwayInterviewEvent {
  return {
    type,
    commandId: command.commandId,
    occurredAt: command.occurredAt,
    ...payload,
  } as HouseholdRunwayInterviewEvent;
}

export function ignored(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
  reason: Extract<HouseholdRunwayInterviewEvent, { type: "command_ignored" }>[
    "reason"
  ],
): HouseholdRunwayInterviewTransition {
  return transition(
    state,
    snapshotOf(state),
    [event(command, "command_ignored", { command: command.type, reason })],
    [],
  );
}

export function startState(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "start" | "start_new" }
  >,
  restarted: boolean,
): HouseholdRunwayInterviewTransition {
  const resumingExistingDraft =
    !restarted &&
    (state.draft.revision > 0 ||
      state.draft.interviewId !== null ||
      state.draft.startedAt !== null);
  const draft = restarted ? normalizeDraft(null) : normalizeDraft(state.draft);
  const requestedStage = command.stage;
  const canResumeResult =
    !restarted &&
    requestedStage === "result" &&
    draft.stageStatus.result === "completed";
  const stage =
    canResumeResult
      ? "result"
      : requestedStage &&
          requestedStage !== "result" &&
          isStageApplicable(requestedStage, draft.answers) &&
          (requestedStage === "location" ||
            Boolean(
              draft.location.country &&
                draft.location.region &&
                draft.location.currency,
            ))
        ? requestedStage
        : "location";
  draft.revision = resumingExistingDraft
    ? state.draft.revision
    : state.draft.revision + 1;
  draft.interviewId = resumingExistingDraft
    ? state.draft.interviewId ?? command.interviewId
    : command.interviewId;
  draft.startedAt = resumingExistingDraft
    ? state.draft.startedAt ?? command.occurredAt
    : command.occurredAt;
  const startEvent = event(
    command,
    restarted ? "interview_restarted" : "interview_started",
    { interviewId: command.interviewId },
  );
  const clearCorrelationId = `${command.commandId}:clear`;
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status:
        stage === "result"
          ? "completed"
          : stage === "review"
            ? "reviewing"
            : "collecting",
      stage,
      draft,
      resumeChoice: null,
      operations: {
        ...state.operations,
        draftSynchronization: {
          status: "dirty",
          sourceRevision: draft.revision,
        },
        planPersistence: restarted
          ? { status: "idle" }
          : state.operations.planPersistence,
        deviceDraft: restarted
          ? {
              status: "pending",
              action: "clear",
              sourceRevision: draft.revision,
              correlationId: clearCorrelationId,
              scope: "all",
            }
          : state.operations.deviceDraft,
      },
      validationIssue: null,
    },
    [startEvent],
    [
      { type: "history", action: "push", destination: "interview" },
      { type: "focus", stage },
      ...(restarted
        ? [
            {
              type: "draft_device_clear_requested" as const,
              scope: "all" as const,
              sourceRevision: draft.revision,
              correlationId: clearCorrelationId,
            },
          ]
        : []),
    ],
  );
}

export function projectHistory(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "history_projection_changed" }
  >,
): HouseholdRunwayInterviewTransition {
  if (command.destination === "landing") {
    if (state.status === "not_started") {
      return transition(state, snapshotOf(state), [], []);
    }

    return transition(
      state,
      {
        ...snapshotOf(state),
        status: "not_started",
        stage: null,
        resumeChoice: null,
        validationIssue: null,
      },
      [],
      [],
    );
  }

  if (state.status !== "not_started") {
    return transition(state, snapshotOf(state), [], []);
  }

  const started = startState(
    state,
    {
      type: "start",
      commandId: command.commandId,
      occurredAt: command.occurredAt,
      interviewId: command.interviewId,
      stage: command.stage,
    },
    false,
  );

  return {
    ...started,
    effects: started.effects.filter((effect) => effect.type !== "history"),
  };
}

export function updateDraftAnswers(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
  nextAnswers: HouseholdRunwayInterviewAnswers,
  extraEvents: HouseholdRunwayInterviewEvent[] = [],
  draftPatch: Partial<HouseholdRunwayInterviewDraft> = {},
): HouseholdRunwayInterviewTransition {
  const nextLocation = normalizeLocation({
    ...state.draft.location,
    country: nextAnswers.country,
    region: nextAnswers.region,
    currency: nextAnswers.currency,
    proposedCurrency: proposedCurrencyFor(nextAnswers.country),
    currencySelection: state.draft.location.currencySelection,
  });
  const draft = normalizeDraft({
    ...state.draft,
    ...draftPatch,
    revision: state.draft.revision + 1,
    location: nextLocation,
    answers: nextAnswers,
  });
  invalidateValidationIssues(draft, command);
  const previousAnswers = state.draft.answers;
  const previousScenario = state.draft.selectedScenario;
  const clearedStages: HouseholdRunwayInterviewStage[] = [];
  const cleanupEvents: HouseholdRunwayInterviewEvent[] = [];

  for (const stage of ["myIncome", "partnerIncome"] as const) {
    const wasApplicable = isStageApplicable(stage, previousAnswers);
    const isApplicable = isStageApplicable(stage, draft.answers);
    if (!isApplicable) {
      const cleared = clearStageAnswers(stage, draft.answers);
      draft.answers = cleared;
      draft.stageStatus[stage] = "inapplicable";
      draft.validationIssues[stage] = null;
      if (wasApplicable || stage === "partnerIncome" && previousAnswers.partner) {
        clearedStages.push(stage);
        cleanupEvents.push(
          event(command, "stage_inapplicable", { stage }),
        );
      }
    } else if (draft.stageStatus[stage] === "inapplicable") {
      draft.stageStatus[stage] = "pending";
    }
  }

  if (!draft.answers.shares_finances) {
    draft.answers = { ...draft.answers, partner: null };
    draft.stageStatus.partnerIncome = "inapplicable";
    draft.validationIssues.partnerIncome = null;
  }

  const scenarios = availableScenarios(draft.answers);
  draft.availableScenarios = scenarios;
  if (previousScenario && scenarios.some((item) => item.id === previousScenario)) {
    draft.selectedScenario = previousScenario;
    // Keep a still-applicable Scenario stable across unrelated edits.
  } else {
    draft.selectedScenario = scenarios[0]?.id ?? null;
    if (draft.selectedScenario && draft.selectedScenario !== previousScenario) {
      cleanupEvents.push(
        event(command, "scenario_fallback", {
          scenario: draft.selectedScenario,
          previousScenario,
        }),
      );
    }
  }

  const nextStage = repairCurrentStage(state.stage, draft.answers);
  const nextStatus = statusForStage(nextStage, state.status);
  const events = [
    ...extraEvents,
    ...cleanupEvents,
    ...(clearedStages.length
      ? [
          event(command, "answers_cleared", {
            stages: clearedStages,
            reason: "inapplicable" as const,
          }),
        ]
      : []),
  ];
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: nextStatus,
      stage: nextStage,
      draft,
      operations: {
        ...state.operations,
        draftSynchronization: {
          status: "dirty",
          sourceRevision: draft.revision,
        },
        planPersistence: {
          status: "dirty",
          sourceRevision: draft.revision,
        },
      },
      validationIssue: null,
    },
    events,
    nextStage && nextStage !== state.stage
      ? [{ type: "focus", stage: nextStage }]
      : [],
  );
}

export function invalidateValidationIssues(
  draft: HouseholdRunwayInterviewDraft,
  command: HouseholdRunwayInterviewCommand,
) {
  const start = validationStartForCommand(command);
  if (!start) return;
  for (const stage of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
    if (stageIndex(stage) >= stageIndex(start)) {
      draft.validationIssues[stage] = null;
    }
  }
}

function validationStartForCommand(
  command: HouseholdRunwayInterviewCommand,
): HouseholdRunwayInterviewStage | null {
  switch (command.type) {
    case "select_country":
    case "select_region":
    case "select_currency":
    case "request_currency_change":
    case "reset_currency_entries":
    case "retain_currency_entries":
      return "location";
    case "set_household":
      return "household";
    case "set_employment":
      return "employment";
    case "set_income":
      return command.person === "mine" ? "myIncome" : "partnerIncome";
    case "set_other_income_sources":
      return "otherIncome";
    case "set_cash":
      return "cash";
    case "set_asset":
      return "assets";
    case "set_expense_mode":
    case "set_quick_expenses":
    case "set_expense_category_mode":
    case "set_expense_category_subtotal":
    case "set_expense_item":
    case "set_housing_tenure":
    case "set_active_expense_category":
    case "complete_expense_category":
      return "expenses";
    case "set_reduction":
      return "reductions";
    case "update_answers":
      return "location";
    default:
      return null;
  }
}

export function createHouseholdRunwayInterview(
  initial: HouseholdRunwayPlan | HouseholdRunwayInterviewInitialization | null = null,
): HouseholdRunwayInterviewState {
  const options: HouseholdRunwayInterviewInitialization =
    initial && "inputs" in initial
      ? { committedPlan: initial }
      : initial ?? {};
  const committedPlan = normalizeCommittedPlan(options.committedPlan);
  const draft = normalizeDraft(
    options.draft ??
      (committedPlan
        ? {
            answers: committedPlan.inputs,
            location: {
              country: committedPlan.inputs.country,
              region: committedPlan.inputs.region,
              currency: committedPlan.inputs.currency,
              proposedCurrency: proposedCurrencyFor(committedPlan.inputs.country),
              currencySelection: "explicit",
            },
          }
        : null),
  );
  const status = options.status ?? (committedPlan ? "completed" : "not_started");
  const stage =
    options.stage ??
    (status === "completed" ? "result" : status === "not_started" ? null : "location");
  return stateFrom({
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status,
    stage,
    draft,
    committedPlan,
    resumeChoice: options.resumeChoice ?? null,
    operations: defaultInterviewOperations(),
    validationIssue: null,
  });
}

export function restoreHouseholdRunwayInterview(
  supplied: HouseholdRunwayInterviewState | HouseholdRunwayInterviewSnapshot,
): HouseholdRunwayInterviewState {
  return stateFrom(
    "renderModel" in supplied
      ? snapshotOf(supplied)
      : {
          ...supplied,
          version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        },
  );
}
