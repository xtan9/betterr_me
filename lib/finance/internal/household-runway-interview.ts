/** Deterministic command dispatch for the private Household Runway Interview state machine. */

import {
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewCapabilities,
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewTransition,
} from "./household-runway-interview-protocol";

import {
  projectHistory,
  startState,
  ignored,
  transition,
  event,
  updateDraftAnswers,
  invalidateValidationIssues,
} from "./household-runway-interview-state";

import {
  resumeDraft,
  resumeCommittedPlan,
  backInterview,
  beginCompletedPlanEdit,
  continueInterview,
  setLocation,
  requestCurrencyChange,
  applyCurrencyChange,
} from "./household-runway-interview-navigation";

import { draftForCommittedPlan, normalizeDraft } from "./household-runway-interview-draft";

import {
  setPlanAdjustment,
  resetPlanAdjustment,
  applyPlanAdjustment,
  setCash,
  setAsset,
  setExpenseMode,
  setQuickExpenses,
  setExpenseCategoryMode,
  setExpenseCategorySubtotal,
  setExpenseItem,
  setHousingTenure,
  setReduction,
} from "./household-runway-interview-inputs";

import {
  requestDraftSynchronization,
  requestedDraftDeviceOperation,
  completeDraftSynchronization,
  completeDraftDeviceOperation,
} from "./household-runway-interview-draft-operations";

import {
  requestPlanPersistence,
  completePlanPersistence,
  requestReportDownload,
  completeReportDownload,
  requestAnalytics,
  completeAnalytics,
} from "./household-runway-interview-plan-operations";

import {
  clearStageAnswers,
  stageIndex,
  isStageApplicable,
  statusForStage,
} from "./household-runway-interview-stages";

import {
  freshIncome,
  normalizeAnswers,
  clearIncomeMoney,
  normalizeIncomePatch,
} from "./household-runway-interview-answers";

export {
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
  HOUSEHOLD_RUNWAY_COUNTRIES,
  HOUSEHOLD_RUNWAY_CURRENCIES,
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGES,
  HOUSEHOLD_RUNWAY_ASSET_KEYS,
  type HouseholdRunwayAssetKey,
  type HouseholdRunwayInterviewOperationError,
  type HouseholdRunwayDraftSynchronizationOperation,
  type HouseholdRunwayDraftDeviceAction,
  type HouseholdRunwayDraftDeviceOperation,
  type HouseholdRunwayPlanPersistenceOperation,
  type HouseholdRunwayReportDownloadOperation,
  type HouseholdRunwayAnalyticsOperation,
  type HouseholdRunwayInterviewOperations,
  type HouseholdRunwayInterviewCapabilities,
  type HouseholdRunwayExpenseCategoryProgress,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayCurrencySelection,
  type HouseholdRunwayInterviewStatus,
  type HouseholdRunwayInterviewStageStatus,
  type HouseholdRunwayInterviewLocation,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayValidationIssueCode,
  type HouseholdRunwayValidationIssue,
  type HouseholdRunwayPendingCurrencyChange,
  type HouseholdRunwayInterviewStageStatusMap,
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayDraftNormalizationOutcome,
  type HouseholdRunwayNotStartedState,
  type HouseholdRunwayCollectingState,
  type HouseholdRunwayReviewingState,
  type HouseholdRunwayCompletedState,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewSnapshot,
  type HouseholdRunwayInterviewInitialization,
} from "./household-runway-interview-model";

export {
  applicableHouseholdRunwayInterviewStages,
  getApplicableHouseholdRunwayInterviewStages,
} from "./household-runway-interview-stages";

export {
  createHouseholdRunwayInterview,
  restoreHouseholdRunwayInterview,
} from "./household-runway-interview-state";

export type {
  HouseholdRunwayLandingRenderModel,
  HouseholdRunwayResumeOption,
  HouseholdRunwayInterviewResumeChoice,
  HouseholdRunwayResumeChoiceRenderModel,
  HouseholdRunwayLocationRenderModel,
  HouseholdRunwayHouseholdRenderModel,
  HouseholdRunwayEmploymentRenderModel,
  HouseholdRunwayIncomeRenderModel,
  HouseholdRunwayOtherIncomeRenderModel,
  HouseholdRunwayCashRenderModel,
  HouseholdRunwayAssetsRenderModel,
  HouseholdRunwayExpensesRenderModel,
  HouseholdRunwayReductionsRenderModel,
  HouseholdRunwayReviewRenderModel,
  HouseholdRunwayGenericStageRenderModel,
  HouseholdRunwayInterviewRenderModel,
  HouseholdRunwayReviewProjection,
  HouseholdRunwayResultProjection,
} from "./household-runway-interview-projections";

export type {
  HouseholdRunwayInterviewCommandMetadata,
  HouseholdRunwayInterviewCommandInput,
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewEvent,
  HouseholdRunwayInterviewEffect,
  HouseholdRunwayInterviewTransition,
} from "./household-runway-interview-protocol";

export {
  normalizeHouseholdRunwayDraft,
  householdRunwayDraftMatchesPlanContent,
  householdRunwayDraftDiffersFromPlan,
} from "./household-runway-interview-draft";

export type { HouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

export function dispatchHouseholdRunwayInterview(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
  capabilities: HouseholdRunwayInterviewCapabilities = {},
): HouseholdRunwayInterviewTransition {
  if (command.type === "history_projection_changed") {
    return projectHistory(state, command);
  }
  if (command.type === "start") {
    return state.status === "not_started"
      ? startState(state, command, false)
      : ignored(state, command, "already_started");
  }
  if (command.type === "start_new") return startState(state, command, true);
  if (command.type === "resume_draft") return resumeDraft(state, command);
  if (command.type === "resume_committed_plan") {
    return resumeCommittedPlan(state, command);
  }
  if (command.type === "exit") {
    return state.status === "not_started"
      ? ignored(state, command, "already_not_started")
      : backInterview(state, command);
  }
  if (command.type === "discard_draft") {
    const committedPlan = state.committedPlan;
    const sourceRevision = state.draft.revision;
    const correlationId = command.commandId;
    if (committedPlan) {
      const draft = draftForCommittedPlan(committedPlan, sourceRevision);
      return transition(
        state,
        {
          version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
          status: "completed",
          stage: "result",
          draft,
          committedPlan,
          resumeChoice: null,
          operations: {
            ...state.operations,
            draftSynchronization: { status: "idle" },
            deviceDraft: {
              status: "pending",
              action: "clear",
              sourceRevision,
              correlationId,
              scope: "all",
            },
            planPersistence: { status: "idle" },
            reportDownload: { status: "idle" },
          },
          validationIssue: null,
        },
        [event(command, "draft_discarded", {})],
        [
          { type: "history", action: "replace", destination: "interview" },
          { type: "focus", stage: "result" },
          {
            type: "draft_device_clear_requested",
            scope: "all",
            sourceRevision,
            correlationId,
          },
        ],
      );
    }
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "not_started",
        stage: null,
        draft: normalizeDraft(null),
        committedPlan: null,
        resumeChoice: null,
        operations: {
          ...state.operations,
          draftSynchronization: { status: "idle" },
          deviceDraft: {
            status: "pending",
            action: "clear",
            sourceRevision,
            correlationId,
            scope: "all",
          },
          planPersistence: { status: "idle" },
          reportDownload: { status: "idle" },
        },
        validationIssue: null,
      },
      [event(command, "draft_discarded", {})],
      [
        { type: "history", action: "replace", destination: "landing" },
        {
          type: "draft_device_clear_requested",
          scope: "all",
          sourceRevision,
          correlationId,
        },
      ],
    );
  }
  if (command.type === "edit_completed_plan") {
    return beginCompletedPlanEdit(state, command);
  }
  if (command.type === "set_plan_adjustment") {
    return setPlanAdjustment(state, command);
  }
  if (command.type === "reset_plan_adjustment") {
    return resetPlanAdjustment(state, command);
  }
  if (command.type === "apply_plan_adjustment") {
    return applyPlanAdjustment(state, command);
  }
  if (command.type === "synchronize_draft") {
    return requestDraftSynchronization(state, command);
  }
  if (command.type === "clear_device_draft") {
    return requestedDraftDeviceOperation(state, command, "clear", "device");
  }
  if (command.type === "remember_draft") {
    return requestedDraftDeviceOperation(state, command, "remember");
  }
  if (command.type === "import_draft") {
    return requestedDraftDeviceOperation(state, command, "import");
  }
  if (
    command.type === "draft_synchronization_succeeded" ||
    command.type === "draft_synchronization_failed"
  ) {
    return completeDraftSynchronization(state, command);
  }
  if (
    command.type === "draft_device_operation_succeeded" ||
    command.type === "draft_device_operation_failed"
  ) {
    return completeDraftDeviceOperation(state, command);
  }
  if (command.type === "save_plan" || command.type === "request_plan_persistence") {
    return requestPlanPersistence(state, command, capabilities);
  }
  if (
    command.type === "plan_persistence_succeeded" ||
    command.type === "plan_persistence_failed"
  ) {
    return completePlanPersistence(state, command);
  }
  if (command.type === "request_report_download") {
    return requestReportDownload(state, command);
  }
  if (
    command.type === "report_download_succeeded" ||
    command.type === "report_download_failed"
  ) {
    return completeReportDownload(state, command);
  }
  if (command.type === "request_analytics") {
    return requestAnalytics(state, command);
  }
  if (command.type === "analytics_succeeded" || command.type === "analytics_failed") {
    return completeAnalytics(state, command);
  }
  if (command.type === "back") return backInterview(state, command);
  if (command.type === "continue") return continueInterview(state, command);
  if (command.type === "skip") {
    if (state.stage !== "otherIncome" && state.stage !== "assets") {
      return ignored(state, command, "stage_not_skippable");
    }
    const stage = state.stage;
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      answers: clearStageAnswers(stage, state.draft.answers),
      stageStatus: { ...state.draft.stageStatus, [stage]: "skipped" },
      validationIssues: { ...state.draft.validationIssues, [stage]: null },
    });
    for (const candidate of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
      if (stageIndex(candidate) >= stageIndex(stage)) {
        draft.validationIssues[candidate] = null;
      }
    }
    const next = HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.slice(stageIndex(stage) + 1).find(
      (candidate) => isStageApplicable(candidate, draft.answers),
    );
    if (!next) return ignored(state, command, "invalid_stage");
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: statusForStage(next, state.status),
        stage: next,
        draft,
        validationIssue: null,
      },
      [
        event(command, "answers_cleared", {
          stages: [stage],
          reason: "explicit_skip",
        }),
        event(command, "stage_skipped", { stage }),
      ],
      [{ type: "focus", stage: next }],
    );
  }
  if (state.status === "not_started" || state.stage === null) {
    return ignored(state, command, "invalid_stage");
  }
  if (command.type === "select_country" || command.type === "select_region") {
    return state.stage === "location"
      ? setLocation(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "select_currency" || command.type === "request_currency_change") {
    return requestCurrencyChange(state, command);
  }
  if (command.type === "reset_currency_entries" || command.type === "retain_currency_entries") {
    const pending = state.draft.pendingCurrencyChange;
    const currency = command.currency ?? pending?.currency;
    if (!pending || !currency) return ignored(state, command, "no_pending_currency_change");
    return applyCurrencyChange(
      state,
      command,
      currency,
      command.type === "reset_currency_entries" ? "reset" : "retain",
    );
  }
  if (command.type === "set_household") {
    const partner = command.sharesFinances
      ? state.draft.answers.partner ?? freshIncome("employed")
      : null;
    return updateDraftAnswers(
      state,
      command,
      normalizeAnswers(
        {
          ...state.draft.answers,
          shares_finances: command.sharesFinances,
          has_children: command.hasChildren ?? state.draft.answers.has_children,
          has_support_obligations:
            command.hasSupportObligations ??
            state.draft.answers.has_support_obligations,
          partner,
          updated_at: command.occurredAt,
        },
        state.draft.location,
      ),
    );
  }
  if (command.type === "set_employment") {
    if (command.person === "partner" && !state.draft.answers.shares_finances) {
      return ignored(state, command, "partner_not_applicable");
    }
    const current =
      command.person === "mine"
        ? state.draft.answers.mine
        : state.draft.answers.partner ?? freshIncome("employed");
    const income = {
      ...(command.employment === "unemployed" || command.employment === "not_working"
        ? clearIncomeMoney(current)
        : current),
      employment: command.employment,
    };
    const answers = normalizeAnswers(
      {
        ...state.draft.answers,
        [command.person]: income,
        updated_at: command.occurredAt,
      },
      state.draft.location,
    );
    return updateDraftAnswers(state, command, answers);
  }
  if (command.type === "set_income") {
    if (command.person === "partner" && !state.draft.answers.partner) {
      return ignored(state, command, "partner_not_applicable");
    }
    const current =
      command.person === "mine"
        ? state.draft.answers.mine
        : state.draft.answers.partner!;
    const normalized = normalizeIncomePatch(
      current,
      command.patch,
      state.draft.location,
    );
    const answers = normalizeAnswers(
      {
        ...state.draft.answers,
        [command.person]: normalized.income,
        updated_at: command.occurredAt,
      },
      state.draft.location,
    );
    const extraEvents = normalized.ruleVersion
      ? [
          event(command, "income_estimate_recomputed", {
            person: command.person,
            ruleVersion: normalized.ruleVersion,
          }),
        ]
      : [];
    return updateDraftAnswers(state, command, answers, extraEvents);
  }
  if (command.type === "set_other_income_sources") {
    const answers = normalizeAnswers(
      {
        ...state.draft.answers,
        other_income_sources: command.sources.map((source) => ({ ...source })),
        updated_at: command.occurredAt,
      },
      state.draft.location,
    );
    return updateDraftAnswers(state, command, answers);
  }
  if (command.type === "set_cash") {
    return state.stage === "cash"
      ? setCash(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_asset") {
    return state.stage === "assets"
      ? setAsset(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_expense_mode") {
    return state.stage === "expenses"
      ? setExpenseMode(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_quick_expenses") {
    return state.stage === "expenses"
      ? setQuickExpenses(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_expense_category_mode") {
    return state.stage === "expenses"
      ? setExpenseCategoryMode(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_expense_category_subtotal") {
    return state.stage === "expenses"
      ? setExpenseCategorySubtotal(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_expense_item") {
    return state.stage === "expenses"
      ? setExpenseItem(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_housing_tenure") {
    return state.stage === "expenses"
      ? setHousingTenure(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "set_reduction") {
    return state.stage === "reductions"
      ? setReduction(state, command)
      : ignored(state, command, "invalid_stage");
  }
  if (command.type === "update_answers") {
    const answers = normalizeAnswers(
      { ...state.draft.answers, ...command.patch, updated_at: command.occurredAt },
      state.draft.location,
    );
    return updateDraftAnswers(state, command, answers);
  }
  if (command.type === "select_scenario") {
    const available = state.draft.availableScenarios;
    if (!available.some((item) => item.id === command.scenario)) {
      return ignored(state, command, "scenario_unavailable");
    }
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      selectedScenario: command.scenario,
    });
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: state.status,
        stage: state.stage,
        draft,
        validationIssue: null,
      },
      [event(command, "scenario_selected", { scenario: command.scenario })],
      [],
    );
  }
  if (command.type === "set_active_expense_category") {
    if (state.stage !== "expenses") {
      return ignored(state, command, "invalid_stage");
    }
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      activeExpenseCategory: command.category,
    });
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: state.status,
        stage: state.stage,
        draft,
        validationIssue: null,
      },
      command.category
        ? [event(command, "expense_category_opened", { category: command.category })]
        : [],
      [],
    );
  }
  if (command.type === "complete_expense_category") {
    if (
      state.stage !== "expenses" ||
      state.draft.activeExpenseCategory !== command.category
    ) {
      return ignored(state, command, "expense_category_not_open");
    }
    const completedCategories = Array.from(
      new Set([
        ...state.draft.answers.completed_expense_categories,
        command.category,
      ]),
    );
    const draft = normalizeDraft({
      ...state.draft,
      revision: state.draft.revision + 1,
      answers: normalizeAnswers(
        {
          ...state.draft.answers,
          completed_expense_categories: completedCategories,
          updated_at: command.occurredAt,
        },
        state.draft.location,
      ),
      activeExpenseCategory: null,
    });
    invalidateValidationIssues(draft, command);
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: state.status,
        stage: state.stage,
        draft,
        validationIssue: null,
      },
      [
        event(command, "expense_category_completed", {
          category: command.category,
        }),
      ],
      [],
    );
  }
  return ignored(state, command, "invalid_stage");
}

/** A shorter alias for adapters that call the boundary a transition function. */
export const transitionHouseholdRunwayInterview =
  dispatchHouseholdRunwayInterview;
