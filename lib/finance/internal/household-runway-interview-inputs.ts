/** Applies money, expense, and Plan Adjustment commands. */

import type { ExpenseLineItem } from "@/lib/finance/cushion";

import { EXPENSE_ITEM_TYPES } from "@/lib/finance/runway-expenses";

import {
  householdRunwayPlanAdjustmentFields,
  normalizeStoredHouseholdRunwayPlanAdjustment,
  emptyHouseholdRunwayPlanAdjustment,
  applyHouseholdRunwayPlanAdjustment,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import {
  type HouseholdRunwayInterviewState,
  HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayInterviewCommand,
  HouseholdRunwayInterviewTransition,
} from "./household-runway-interview-protocol";

import { updateDraftAnswers, ignored, transition, event } from "./household-runway-interview-state";

import {
  normalizeAnswers,
  normalizeMoney,
  normalizeExpenseSubtotal,
  normalizeExpenseItem,
  normalizedCents,
} from "./household-runway-interview-answers";

import { normalizeDraft } from "./household-runway-interview-draft";

export function setCash(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_cash" }>,
) {
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        available_cash: normalizeMoney(command.value),
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
    [],
    { activeExpenseCategory: null },
  );
}

export function setAsset(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_asset" }>,
) {
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        assets: {
          ...state.draft.answers.assets,
          [command.asset]: normalizeMoney(command.value),
        },
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
  );
}

export function setExpenseMode(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_expense_mode" }>,
) {
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        expense_mode: command.mode,
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
    [],
    { activeExpenseCategory: null },
  );
}

export function setQuickExpenses(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_quick_expenses" }>,
) {
  const current = state.draft.answers.quick_expenses;
  const nextPatch = {
    ...current,
    ...command.patch,
    ...(command.patch.current_monthly_cents !== undefined &&
    command.patch.interruption_monthly_cents === undefined &&
    current.interruption_monthly_cents === 0
      ? { interruption_monthly_cents: command.patch.current_monthly_cents }
      : {}),
    confidence: command.patch.confidence ?? "confirmed",
  };
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        expense_mode: "quick",
        quick_expenses: nextPatch,
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
    [],
    { activeExpenseCategory: null },
  );
}

export function setExpenseCategoryMode(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "set_expense_category_mode" }
  >,
) {
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        expense_category_modes: {
          ...state.draft.answers.expense_category_modes,
          [command.category]: command.mode,
        },
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
  );
}

export function setExpenseCategorySubtotal(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "set_expense_category_subtotal" }
  >,
) {
  const current =
    state.draft.answers.expense_category_subtotals[command.category] ??
    normalizeExpenseSubtotal(null);
  const nextPatch = {
    ...current,
    ...command.patch,
    ...(command.patch.current_monthly_cents !== undefined &&
    command.patch.interruption_monthly_cents === undefined &&
    current.interruption_monthly_cents === 0
      ? { interruption_monthly_cents: command.patch.current_monthly_cents }
      : {}),
    confidence: command.patch.confidence ?? "confirmed",
  };
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        expense_category_modes: {
          ...state.draft.answers.expense_category_modes,
          [command.category]: "subtotal",
        },
        expense_category_subtotals: {
          ...state.draft.answers.expense_category_subtotals,
          [command.category]: nextPatch,
        },
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
  );
}

export function setExpenseItem(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_expense_item" }>,
) {
  if (
    !(EXPENSE_ITEM_TYPES[command.category] as readonly string[]).includes(
      command.itemType,
    )
  ) {
    return ignored(state, command, "expense_category_not_open");
  }
  const existing = state.draft.answers.expense_items.find(
    (item) =>
      item.category === command.category && item.type === command.itemType,
  );
  const base: ExpenseLineItem = existing ?? {
    id: command.itemId,
    category: command.category,
    type: command.itemType,
    current_amount_cents: 0,
    interruption_amount_cents: 0,
    frequency: "monthly",
    confidence: "confirmed",
  };
  const rawPatch = {
    ...base,
    ...command.patch,
    id: existing?.id ?? command.itemId,
    category: command.category,
    type: command.itemType,
    ...(existing === undefined &&
    command.patch.current_amount_cents !== undefined &&
    command.patch.interruption_amount_cents === undefined
      ? { interruption_amount_cents: command.patch.current_amount_cents }
      : {}),
  };
  const next = normalizeExpenseItem(rawPatch, base);
  const expenseItems = existing
    ? state.draft.answers.expense_items.map((item) =>
        item.id === existing.id ? next : item,
      )
    : [...state.draft.answers.expense_items, next];
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        expense_mode: "guided",
        expense_category_modes: {
          ...state.draft.answers.expense_category_modes,
          [command.category]: "itemized",
        },
        expense_items: expenseItems,
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
  );
}

export function setHousingTenure(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_housing_tenure" }>,
) {
  if (state.draft.answers.housing_tenure === command.tenure) {
    return updateDraftAnswers(
      state,
      command,
      normalizeAnswers(
        { ...state.draft.answers, updated_at: command.occurredAt },
        state.draft.location,
      ),
    );
  }
  const expenseItems = state.draft.answers.expense_items.filter(
    (item) => item.category !== "housing",
  );
  const categorySubtotals = { ...state.draft.answers.expense_category_subtotals };
  delete categorySubtotals.housing;
  const categoryModes = { ...state.draft.answers.expense_category_modes };
  delete categoryModes.housing;
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...state.draft.answers,
        housing_tenure: command.tenure,
        expense_items: expenseItems,
        expense_category_modes: categoryModes,
        expense_category_subtotals: categorySubtotals,
        completed_expense_categories:
          state.draft.answers.completed_expense_categories.filter(
            (category) => category !== "housing",
          ),
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
    [],
    {
      activeExpenseCategory: state.draft.activeExpenseCategory,
    },
  );
}

export function setReduction(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "set_reduction" }>,
) {
  const cents = normalizedCents(command.interruptionMonthlyCents);
  const answers = state.draft.answers;
  if (command.target.kind === "quick") {
    return updateDraftAnswers(
      state,
      command,
      normalizeAnswers(
        {
          ...answers,
          quick_expenses: {
            ...answers.quick_expenses,
            interruption_monthly_cents: Math.min(
              cents,
              answers.quick_expenses.current_monthly_cents,
            ),
            confidence: "confirmed",
          },
          updated_at: command.occurredAt,
        },
        state.draft.location,
      ),
    );
  }
  if (command.target.kind === "category") {
    const current = answers.expense_category_subtotals[command.target.category];
    if (!current) return ignored(state, command, "expense_category_not_open");
    return updateDraftAnswers(
      state,
      command,
      normalizeAnswers(
        {
          ...answers,
          expense_category_subtotals: {
            ...answers.expense_category_subtotals,
            [command.target.category]: {
              ...current,
              interruption_monthly_cents: Math.min(
                cents,
                current.current_monthly_cents,
              ),
              confidence: "confirmed",
            },
          },
          updated_at: command.occurredAt,
        },
        state.draft.location,
      ),
    );
  }
  const target = command.target;
  if (target.kind !== "item") {
    return ignored(state, command, "expense_category_not_open");
  }
  const item = answers.expense_items.find(
    (candidate) => candidate.id === target.itemId,
  );
  if (!item) return ignored(state, command, "expense_category_not_open");
  return updateDraftAnswers(
    state,
    command,
    normalizeAnswers(
      {
        ...answers,
        expense_items: answers.expense_items.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                interruption_amount_cents: Math.min(
                  cents,
                  candidate.current_amount_cents,
                ),
                confidence: "confirmed",
              }
            : candidate,
        ),
        updated_at: command.occurredAt,
      },
      state.draft.location,
    ),
  );
}

export function setPlanAdjustment(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "set_plan_adjustment" }
  >,
): HouseholdRunwayInterviewTransition {
  if (state.status !== "reviewing" && state.status !== "completed") {
    return ignored(state, command, "plan_adjustment_unavailable");
  }
  const fields = householdRunwayPlanAdjustmentFields(command.patch);
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    planAdjustment: normalizeStoredHouseholdRunwayPlanAdjustment({
      ...state.draft.planAdjustment,
      ...command.patch,
    }),
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
    [event(command, "plan_adjustment_updated", { fields })],
    [],
  );
}

export function resetPlanAdjustment(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "reset_plan_adjustment" }
  >,
): HouseholdRunwayInterviewTransition {
  if (state.status !== "reviewing" && state.status !== "completed") {
    return ignored(state, command, "plan_adjustment_unavailable");
  }
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    planAdjustment: emptyHouseholdRunwayPlanAdjustment(),
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
    [event(command, "plan_adjustment_reset", {})],
    [],
  );
}

export function applyPlanAdjustment(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "apply_plan_adjustment" }
  >,
): HouseholdRunwayInterviewTransition {
  if (state.status !== "reviewing" && state.status !== "completed") {
    return ignored(state, command, "plan_adjustment_unavailable");
  }
  const planInputs = state.planInputs;
  if (!planInputs) return ignored(state, command, "plan_adjustment_unavailable");
  const answers = normalizeAnswers(
    applyHouseholdRunwayPlanAdjustment({
      answers: planInputs,
      adjustment: state.draft.planAdjustment,
      occurredAt: command.occurredAt,
      incomeSourceId: `plan-adjustment-${command.commandId}`.slice(0, 100),
    }),
    state.draft.location,
  );
  const draft = normalizeDraft({
    ...state.draft,
    revision: state.draft.revision + 1,
    answers,
    planAdjustment: emptyHouseholdRunwayPlanAdjustment(),
  });
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: state.status,
      stage: state.stage,
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
    [event(command, "plan_adjustment_applied", {})],
    [],
  );
}
