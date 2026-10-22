/** Handles location changes, navigation, and resuming Drafts or Plans. */

import { type RunwayCurrency, expenseTotals } from "@/lib/finance/cushion";

import {
  emptyHouseholdRunwayPlanAdjustment,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import {
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewLocation,
  type HouseholdRunwayInterviewAnswers,
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  type HouseholdRunwayValidationIssue,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewTransition,
  HouseholdRunwayInterviewEvent,
} from "./household-runway-interview-protocol";

import {
  proposedCurrencyFor,
  recomputeEstimatedIncome,
  normalizeAnswers,
  monetaryEntryCount,
  clearCurrencyEntries,
  isWorking,
  calculationAnswers,
} from "./household-runway-interview-answers";

import {
  event,
  updateDraftAnswers,
  transition,
  snapshotOf,
  ignored,
} from "./household-runway-interview-state";

import { normalizeDraft, draftForCommittedPlan } from "./household-runway-interview-draft";

import { reviewProjectionForDraft } from "./household-runway-interview-assessment";

import {
  stageIndex,
  isStageApplicable,
  statusForStage,
  firstApplicableStageBefore,
} from "./household-runway-interview-stages";

export function setLocation(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "select_country" | "select_region" }>,
): HouseholdRunwayInterviewTransition {
  const current = state.draft.location;
  const country =
    command.type === "select_country" ? command.country : current.country;
  const countryChanged = command.type === "select_country" && country !== current.country;
  const region =
    command.type === "select_region"
      ? command.region.trim() || null
      : countryChanged
        ? null
        : current.region;
  const location: HouseholdRunwayInterviewLocation = {
    country,
    region,
    currency: current.currency,
    proposedCurrency: proposedCurrencyFor(country),
    currencySelection: current.currency
      ? "explicit"
      : proposedCurrencyFor(country)
        ? "proposed"
        : "unset",
  };
  const nextAnswers: HouseholdRunwayInterviewAnswers = {
    ...state.draft.answers,
    country: location.country,
    region: location.region,
    currency: location.currency,
    updated_at: command.occurredAt,
  };
  const extraEvents: HouseholdRunwayInterviewEvent[] = [
    command.type === "select_country"
      ? event(command, "country_selected", {
          country,
          proposedCurrency: proposedCurrencyFor(country)!,
        })
      : event(command, "region_selected", { region }),
  ];
  if (command.type === "select_region" || countryChanged) {
    for (const person of ["mine", "partner"] as const) {
      const income = nextAnswers[person];
      if (!income) continue;
      const recomputed = recomputeEstimatedIncome(income, location);
      nextAnswers[person] = recomputed.income;
      if (recomputed.ruleVersion) {
        extraEvents.push(
          event(command, "income_estimate_recomputed", {
            person,
            ruleVersion: recomputed.ruleVersion,
          }),
        );
      }
    }
  }
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(nextAnswers, location),
    extraEvents,
  );
}

export function requestCurrencyChange(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "select_currency" | "request_currency_change" }
  >,
): HouseholdRunwayInterviewTransition {
  const currency = command.currency;
  if (currency === state.draft.location.currency) {
    return transition(
      state,
      snapshotOf(state),
      [event(command, "currency_selected", { currency })],
      [],
    );
  }
  const count = monetaryEntryCount(state.draft.answers);
  if (count > 0) {
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      pendingCurrencyChange: { currency, monetaryEntryCount: count },
      validationIssues: {
        ...state.draft.validationIssues,
        location: { code: "currency_change_confirmation_required" },
      },
    });
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "collecting",
        stage: state.stage === "location" ? "location" : state.stage,
        draft,
        validationIssue: {
          code: "currency_change_confirmation_required",
        },
      },
      [event(command, "currency_change_requested", { currency, monetaryEntryCount: count })],
      [],
    );
  }
  return applyCurrencyChange(state, command, currency, "retain");
}

export function applyCurrencyChange(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
  currency: RunwayCurrency,
  decision: "reset" | "retain",
): HouseholdRunwayInterviewTransition {
  const nextAnswers =
    decision === "reset"
      ? clearCurrencyEntries(state.draft.answers)
      : state.draft.answers;
  const location = {
    ...state.draft.location,
    currency,
    currencySelection: "explicit" as const,
  };
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    location,
    answers: normalizeAnswers(
      { ...nextAnswers, currency, updated_at: command.occurredAt },
      location,
    ),
    pendingCurrencyChange: null,
    validationIssues: {
      ...state.draft.validationIssues,
      location: null,
    },
  });
  const events: HouseholdRunwayInterviewEvent[] = [
    event(command, decision === "reset" ? "currency_entries_reset" : "currency_entries_retained", {
      currency,
    }),
  ];
  if (decision === "reset") {
    events.push(
      event(command, "answers_cleared", {
        stages: HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
        reason: "currency_reset",
      }),
    );
  }
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: "collecting",
      stage: state.stage === "location" ? "location" : state.stage,
      draft,
      validationIssue: null,
    },
    events,
    [],
  );
}

function validateStage(
  state: HouseholdRunwayInterviewState,
): HouseholdRunwayValidationIssue | null {
  const stage = state.stage;
  if (!stage) return null;
  const answers = state.draft.answers;
  if (stage === "location") {
    if (!state.draft.location.country) return { code: "country_required" };
    if (!state.draft.location.region) return { code: "region_required" };
    if (!state.draft.location.currency) return { code: "currency_required" };
    if (state.draft.pendingCurrencyChange) {
      return { code: "currency_change_confirmation_required" };
    }
  }
  if (stage === "myIncome" && isWorking(answers.mine) && answers.mine.monthly_take_home_cents <= 0) {
    return { code: "income_required" };
  }
  if (stage === "partnerIncome" && isWorking(answers.partner) && answers.partner!.monthly_take_home_cents <= 0) {
    return { code: "income_required" };
  }
  const totals = expenseTotals(calculationAnswers(answers));
  if (stage === "expenses" && totals.current <= 0) {
    return { code: "expenses_current_required" };
  }
  if (stage === "reductions" && totals.interruption <= 0) {
    return { code: "expenses_interruption_required" };
  }
  if (stage === "review") {
    return reviewProjectionForDraft(state.draft).validationIssue;
  }
  return null;
}

export function continueInterview(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "continue" }>,
): HouseholdRunwayInterviewTransition {
  if (state.status !== "collecting" && state.status !== "reviewing") {
    return ignored(state, command, "invalid_stage");
  }
  const issue = validateStage(state);
  if (issue) {
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      validationIssues: { ...state.draft.validationIssues, [state.stage!]: issue },
    });
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: state.status,
        stage: state.stage,
        draft,
        validationIssue: issue,
      },
      [event(command, "validation_blocked", { stage: state.stage!, issue })],
      [],
    );
  }

  const currentStage = state.stage!;
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    stageStatus: { ...state.draft.stageStatus, [currentStage]: "completed" },
    validationIssues: { ...state.draft.validationIssues, [currentStage]: null },
  });
  const next =
    currentStage === "review"
      ? "result"
      : HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.slice(stageIndex(currentStage) + 1).find(
          (candidate) => isStageApplicable(candidate, draft.answers),
        ) ?? null;
  if (!next) return ignored(state, command, "invalid_stage");
  if (next === "review") {
    const reviewIssue = reviewProjectionForDraft(draft).validationIssue;
    if (reviewIssue) {
      const blockedDraft = normalizeDraft({
        ...state.draft,
        revision: state.draft.revision + 1,
        validationIssues: {
          ...state.draft.validationIssues,
          [currentStage]: reviewIssue,
        },
      });
      return transition(
        state,
        {
          version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
          status: state.status,
          stage: currentStage,
          draft: blockedDraft,
          validationIssue: reviewIssue,
        },
        [
          event(command, "validation_blocked", {
            stage: currentStage,
            issue: reviewIssue,
          }),
        ],
        [],
      );
    }
  }
  const nextStatus = statusForStage(next, state.status);
  if (next === "review") draft.stageStatus.review = "pending";
  if (next === "result") draft.stageStatus.result = "completed";
  const events: HouseholdRunwayInterviewEvent[] = [];
  if (currentStage === "location") {
    events.push(
      event(command, "location_completed", {
        country: draft.location.country!,
        region: draft.location.region!,
        currency: draft.location.currency!,
      }),
    );
  }
  events.push(event(command, "stage_completed", { stage: currentStage }));
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: nextStatus,
      stage: next,
      draft,
      validationIssue: null,
    },
    events,
    [{ type: "focus", stage: next }],
  );
}

export function beginCompletedPlanEdit(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "edit_completed_plan" | "back" | "exit" }
  >,
): HouseholdRunwayInterviewTransition {
  if (state.status !== "completed") return ignored(state, command, "invalid_stage");
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    stageStatus: {
      ...state.draft.stageStatus,
      review: "pending",
      result: "pending",
    },
    validationIssues: {
      ...state.draft.validationIssues,
      review: null,
      result: null,
    },
    planAdjustment: emptyHouseholdRunwayPlanAdjustment(),
  });
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: "reviewing",
      stage: "review",
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
    [
      event(command, "completed_plan_edit_started", {
        planRevision: state.committedPlan?.revision ?? null,
      }),
    ],
    [{ type: "focus", stage: "review" }],
  );
}

export function backInterview(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "back" | "exit" }>,
): HouseholdRunwayInterviewTransition {
  if (state.stage === "location") {
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "not_started",
        stage: null,
        draft: normalizeDraft({
          ...state.draft,
          revision: state.draft.revision + 1,
          pendingCurrencyChange: null,
        }),
        validationIssue: null,
      },
      [event(command, "interview_exited", {})],
      [{ type: "history", action: "back", destination: "landing" }],
    );
  }
  if (state.status === "completed") {
    return beginCompletedPlanEdit(state, command);
  }
  const previous = state.stage
    ? firstApplicableStageBefore(state.stage, state.draft.answers)
    : null;
  if (!previous) return ignored(state, command, "invalid_stage");
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: statusForStage(previous, state.status),
      stage: previous,
      draft: normalizeDraft({
        ...state.draft,
        revision: state.draft.revision + 1,
        validationIssues: { ...state.draft.validationIssues, [state.stage!]: null },
      }),
      validationIssue: null,
    },
    [],
    [{ type: "focus", stage: previous }],
  );
}

export function resumeDraft(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "resume_draft" }>,
): HouseholdRunwayInterviewTransition {
  if (!state.resumeChoice || !state.committedPlan) {
    return ignored(state, command, "invalid_stage");
  }
  const choice = state.resumeChoice;
  const draft = normalizeDraft({
    ...state.draft,
    interviewId: command.interviewId,
  });
  const status =
    choice.draftStatus === "completed"
      ? "completed"
      : choice.draftStatus === "reviewing"
        ? "reviewing"
        : "collecting";
  const stage =
    status === "completed"
      ? "result"
      : status === "reviewing"
        ? "review"
        : status === "collecting" && choice.draftStage && choice.draftStage !== "result"
          ? choice.draftStage
          : "location";
  const sourceRevision = draft.revision;
  const correlationId = command.commandId;
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage,
      draft,
      committedPlan: state.committedPlan,
      resumeChoice: null,
      operations: {
        ...state.operations,
        deviceDraft: {
          status: "pending",
          action: "import",
          sourceRevision,
          correlationId,
        },
        draftSynchronization: { status: "idle" },
      },
      validationIssue: null,
    },
    [
      event(command, "resume_choice_made", {
        option: "draft",
        sourceRevision,
        correlationId,
      }),
    ],
    [
      { type: "history", action: "push", destination: "interview" },
      ...(stage ? [{ type: "focus", stage } as const] : []),
      {
        type: "draft_device_import_requested",
        draft,
        status,
        stage,
        sourceRevision,
        correlationId,
      },
    ],
  );
}

export function resumeCommittedPlan(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "resume_committed_plan" }
  >,
): HouseholdRunwayInterviewTransition {
  if (!state.resumeChoice || !state.committedPlan) {
    return ignored(state, command, "invalid_stage");
  }
  const draft = draftForCommittedPlan(
    state.committedPlan,
    state.draft.revision,
  );
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: "completed",
      stage: "result",
      draft,
      committedPlan: state.committedPlan,
      resumeChoice: null,
      operations: {
        ...state.operations,
        deviceDraft: { status: "idle" },
        draftSynchronization: { status: "idle" },
        planPersistence: { status: "idle" },
      },
      validationIssue: null,
    },
    [event(command, "resume_choice_made", { option: "plan" })],
    [
      { type: "history", action: "replace", destination: "interview" },
      { type: "focus", stage: "result" },
    ],
  );
}
