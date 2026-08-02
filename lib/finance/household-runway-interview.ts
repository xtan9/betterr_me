import {
  availableScenarios as calculateAvailableScenarios,
  createDefaultRunwayAnswers,
  estimateMonthlyTakeHome,
  expenseCategoryTotals,
  expenseTotals,
  RUNWAY_MODEL_VERSION,
  type EmploymentStatus,
  type ExpenseCategoryMode,
  type ExpenseLineItem,
  type ExpenseMode,
  type ExpenseCategorySubtotal,
  type ExtremeAccessAmounts,
  type HouseholdRunwayAnswers,
  type HousingTenure,
  type IncomeAnswer,
  type MoneyAnswer,
  type QuickExpenses,
  type RecurringIncomeSource,
  type RunwayAssets,
  type RunwayCountry,
  type RunwayCurrency,
  type RunwayScenario,
  type ScenarioOption,
} from "@/lib/finance/cushion";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ITEM_TYPES,
  isExpenseItemType,
  type ExpenseItemType,
  type ExpenseCategory,
} from "@/lib/finance/runway-expenses";
import {
  assessHouseholdRunway,
  type SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";
import { householdRunwayAnswersSchema } from "@/lib/validations/finance-cushion";

/**
 * Framework-independent Household Runway Interview behavior.
 *
 * Adapters supply command metadata and interpret the returned render model,
 * events, and effects. This module intentionally does not read clocks,
 * randomness, React, the DOM, browser storage, network state, or localization.
 */

export const HOUSEHOLD_RUNWAY_INTERVIEW_VERSION = 2 as const;

export const HOUSEHOLD_RUNWAY_COUNTRIES = ["US", "CA", "CN", "TW"] as const;
export const HOUSEHOLD_RUNWAY_CURRENCIES = [
  "USD",
  "CAD",
  "CNY",
  "TWD",
] as const;

export const HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS = [
  "location",
  "household",
  "employment",
  "myIncome",
  "partnerIncome",
  "otherIncome",
  "cash",
  "assets",
  "expenses",
  "reductions",
  "review",
  "result",
] as const;

/** Alias for callers that describe the ordered graph as stages. */
export const HOUSEHOLD_RUNWAY_INTERVIEW_STAGES =
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS;

type Country = (typeof HOUSEHOLD_RUNWAY_COUNTRIES)[number];
type Currency = (typeof HOUSEHOLD_RUNWAY_CURRENCIES)[number];

const CURRENCY_FOR_COUNTRY: Record<Country, Currency> = {
  US: "USD",
  CA: "CAD",
  CN: "CNY",
  TW: "TWD",
};

const NON_RESULT_STAGES = HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.filter(
  (stage) => stage !== "result",
);

export const HOUSEHOLD_RUNWAY_ASSET_KEYS = [
  "liquid_investments",
  "illiquid_investments",
  "home_equity",
  "retirement_tax_deferred",
  "retirement_tax_free",
] as const;

export type HouseholdRunwayAssetKey =
  (typeof HOUSEHOLD_RUNWAY_ASSET_KEYS)[number];

export interface HouseholdRunwayExpenseCategoryProgress {
  category: ExpenseCategory;
  mode: ExpenseCategoryMode | null;
  currentMonthlyCents: number;
  interruptionMonthlyCents: number;
  completed: boolean;
}

export type HouseholdRunwayInterviewStage =
  (typeof HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS)[number];
export type HouseholdRunwayCurrencySelection =
  | "unset"
  | "proposed"
  | "explicit";
export type HouseholdRunwayInterviewStatus =
  | "not_started"
  | "collecting"
  | "reviewing"
  | "completed";
export type HouseholdRunwayInterviewStageStatus =
  | "pending"
  | "completed"
  | "skipped"
  | "inapplicable";

export interface HouseholdRunwayInterviewLocation {
  country: RunwayCountry | null;
  region: string | null;
  /** A proposed currency remains null until a person explicitly confirms it. */
  currency: RunwayCurrency | null;
  proposedCurrency: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
}

/** The working answer shape before location has been completed. */
export type HouseholdRunwayInterviewAnswers = Omit<
  HouseholdRunwayAnswers,
  "country" | "region" | "currency" | "updated_at"
> & {
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
  updated_at: string | null;
};

export type HouseholdRunwayValidationIssueCode =
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
  | "assessment_required";

export interface HouseholdRunwayValidationIssue {
  code: HouseholdRunwayValidationIssueCode;
  stage?: HouseholdRunwayInterviewStage;
  path?: readonly (string | number)[];
}

export interface HouseholdRunwayPendingCurrencyChange {
  currency: RunwayCurrency;
  monetaryEntryCount: number;
}

export type HouseholdRunwayInterviewStageStatusMap = Record<
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewStageStatus
>;

export interface HouseholdRunwayInterviewDraft {
  revision: number;
  interviewId: string | null;
  startedAt: string | null;
  location: HouseholdRunwayInterviewLocation;
  answers: HouseholdRunwayInterviewAnswers;
  stageStatus: HouseholdRunwayInterviewStageStatusMap;
  validationIssues: Partial<
    Record<HouseholdRunwayInterviewStage, HouseholdRunwayValidationIssue | null>
  >;
  selectedScenario: RunwayScenario | null;
  availableScenarios: ScenarioOption[];
  pendingCurrencyChange: HouseholdRunwayPendingCurrencyChange | null;
  activeExpenseCategory: ExpenseCategory | null;
}

export type HouseholdRunwayDraftNormalizationOutcome =
  | {
      success: true;
      planInputs: HouseholdRunwayAnswers;
    }
  | {
      success: false;
      validationIssues: readonly HouseholdRunwayValidationIssue[];
    };

export interface HouseholdRunwayLandingRenderModel {
  kind: "landing";
  stage: null;
  location: null;
}

export interface HouseholdRunwayLocationRenderModel {
  kind: "location";
  stage: "location";
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
  currencyProposal: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
  availableCountries: readonly RunwayCountry[];
  availableCurrencies: readonly RunwayCurrency[];
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  canContinue: boolean;
  blockingIssue: HouseholdRunwayValidationIssue | null;
  pendingCurrencyChange: HouseholdRunwayPendingCurrencyChange | null;
}

export interface HouseholdRunwayHouseholdRenderModel {
  kind: "household";
  stage: "household";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  sharesFinances: boolean;
  hasChildren: boolean;
  hasSupportObligations: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayEmploymentRenderModel {
  kind: "employment";
  stage: "employment";
  mine: EmploymentStatus;
  partner: EmploymentStatus | null;
  sharesFinances: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayIncomeRenderModel {
  kind: "myIncome" | "partnerIncome";
  stage: "myIncome" | "partnerIncome";
  person: "mine" | "partner";
  income: IncomeAnswer;
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayOtherIncomeRenderModel {
  kind: "otherIncome";
  stage: "otherIncome";
  sources: readonly RecurringIncomeSource[];
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  optional: true;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayCashRenderModel {
  kind: "cash";
  stage: "cash";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  availableCash: MoneyAnswer;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayAssetsRenderModel {
  kind: "assets";
  stage: "assets";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  assets: RunwayAssets;
  extremeAccess: ExtremeAccessAmounts;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayExpensesRenderModel {
  kind: "expenses";
  stage: "expenses";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  mode: ExpenseMode;
  activeCategory: ExpenseCategory | null;
  housingTenure: HousingTenure;
  quickExpenses: QuickExpenses;
  expenseItems: readonly ExpenseLineItem[];
  categoryModes: Partial<Record<ExpenseCategory, ExpenseCategoryMode>>;
  categorySubtotals: Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>;
  completedCategories: readonly ExpenseCategory[];
  categories: readonly HouseholdRunwayExpenseCategoryProgress[];
  totals: { current: number; interruption: number };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayReductionsRenderModel {
  kind: "reductions";
  stage: "reductions";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  mode: ExpenseMode;
  quickExpenses: QuickExpenses;
  expenseItems: readonly ExpenseLineItem[];
  categoryModes: Partial<Record<ExpenseCategory, ExpenseCategoryMode>>;
  categorySubtotals: Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>;
  totals: { current: number; interruption: number };
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayReviewRenderModel {
  kind: "review";
  stage: "review";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
  answers: HouseholdRunwayInterviewAnswers;
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  availableScenarios: readonly ScenarioOption[];
  selectedScenario: RunwayScenario | null;
  assessmentModelVersion: typeof RUNWAY_MODEL_VERSION | null;
  ready: boolean;
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayGenericStageRenderModel {
  kind: "stage";
  stage: "result";
  availableStages: readonly HouseholdRunwayInterviewStage[];
  stageStatus: HouseholdRunwayInterviewStageStatus;
  blockingIssue: HouseholdRunwayValidationIssue | null;
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  availableScenarios: readonly ScenarioOption[];
  selectedScenario: RunwayScenario | null;
  assessmentModelVersion: typeof RUNWAY_MODEL_VERSION | null;
}

export type HouseholdRunwayInterviewRenderModel =
  | HouseholdRunwayLandingRenderModel
  | HouseholdRunwayLocationRenderModel
  | HouseholdRunwayHouseholdRenderModel
  | HouseholdRunwayEmploymentRenderModel
  | HouseholdRunwayIncomeRenderModel
  | HouseholdRunwayOtherIncomeRenderModel
  | HouseholdRunwayCashRenderModel
  | HouseholdRunwayAssetsRenderModel
  | HouseholdRunwayExpensesRenderModel
  | HouseholdRunwayReductionsRenderModel
  | HouseholdRunwayReviewRenderModel
  | HouseholdRunwayGenericStageRenderModel;

interface HouseholdRunwayInterviewStateBase {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: HouseholdRunwayInterviewDraft;
  validationIssue: HouseholdRunwayValidationIssue | null;
  /** Complete Plan inputs exist only after a successful review normalization. */
  planInputs: HouseholdRunwayAnswers | null;
  /** Assessment is derived from planInputs and never persisted as Interview state. */
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  renderModel: HouseholdRunwayInterviewRenderModel;
  /** Alias retained for adapters that call the projection simply `render`. */
  render: HouseholdRunwayInterviewRenderModel;
}

export interface HouseholdRunwayNotStartedState
  extends HouseholdRunwayInterviewStateBase {
  status: "not_started";
  stage: null;
  renderModel: HouseholdRunwayLandingRenderModel;
  render: HouseholdRunwayLandingRenderModel;
}

export interface HouseholdRunwayCollectingState
  extends HouseholdRunwayInterviewStateBase {
  status: "collecting";
  stage: Exclude<HouseholdRunwayInterviewStage, "result">;
  renderModel: Exclude<HouseholdRunwayInterviewRenderModel, HouseholdRunwayLandingRenderModel>;
  render: Exclude<HouseholdRunwayInterviewRenderModel, HouseholdRunwayLandingRenderModel>;
}

export interface HouseholdRunwayReviewingState
  extends HouseholdRunwayInterviewStateBase {
  status: "reviewing";
  stage: "review";
  renderModel: HouseholdRunwayReviewRenderModel;
  render: HouseholdRunwayReviewRenderModel;
}

export interface HouseholdRunwayCompletedState
  extends HouseholdRunwayInterviewStateBase {
  status: "completed";
  stage: "result";
  renderModel: HouseholdRunwayGenericStageRenderModel;
  render: HouseholdRunwayGenericStageRenderModel;
}

export type HouseholdRunwayInterviewState =
  | HouseholdRunwayNotStartedState
  | HouseholdRunwayCollectingState
  | HouseholdRunwayReviewingState
  | HouseholdRunwayCompletedState;

export interface HouseholdRunwayInterviewSnapshot {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION | 1;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: Partial<HouseholdRunwayInterviewDraft>;
  validationIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayInterviewCommandMetadata {
  commandId: string;
  occurredAt: string;
}

export type HouseholdRunwayInterviewCommandInput =
  | {
      type: "start";
      interviewId: string;
      stage?: HouseholdRunwayInterviewStage;
    }
  | {
      type: "start_new";
      interviewId: string;
      stage?: HouseholdRunwayInterviewStage;
    }
  | { type: "select_country"; country: RunwayCountry }
  | { type: "select_region"; region: string }
  | { type: "select_currency"; currency: RunwayCurrency }
  | { type: "request_currency_change"; currency: RunwayCurrency }
  | { type: "reset_currency_entries"; currency?: RunwayCurrency }
  | { type: "retain_currency_entries"; currency?: RunwayCurrency }
  | {
      type: "set_household";
      sharesFinances: boolean;
      hasChildren?: boolean;
      hasSupportObligations?: boolean;
    }
  | {
      type: "set_employment";
      person: "mine" | "partner";
      employment: EmploymentStatus;
    }
  | {
      type: "set_income";
      person: "mine" | "partner";
      patch: Partial<IncomeAnswer>;
    }
  | {
      type: "set_other_income_sources";
      sources: readonly RecurringIncomeSource[];
    }
  | { type: "set_cash"; value: MoneyAnswer }
  | {
      type: "set_asset";
      asset: HouseholdRunwayAssetKey;
      value: MoneyAnswer;
    }
  | { type: "set_expense_mode"; mode: ExpenseMode }
  | { type: "set_quick_expenses"; patch: Partial<QuickExpenses> }
  | {
      type: "set_expense_category_mode";
      category: ExpenseCategory;
      mode: ExpenseCategoryMode;
    }
  | {
      type: "set_expense_category_subtotal";
      category: ExpenseCategory;
      patch: Partial<ExpenseCategorySubtotal>;
    }
  | {
      type: "set_expense_item";
      category: ExpenseCategory;
      itemType: ExpenseItemType;
      itemId: string;
      patch: Partial<ExpenseLineItem>;
    }
  | { type: "set_housing_tenure"; tenure: HousingTenure }
  | { type: "update_answers"; patch: Partial<HouseholdRunwayAnswers> }
  | { type: "select_scenario"; scenario: RunwayScenario }
  | { type: "set_active_expense_category"; category: ExpenseCategory | null }
  | { type: "complete_expense_category"; category: ExpenseCategory }
  | {
      type: "set_reduction";
      target:
        | { kind: "quick" }
        | { kind: "category"; category: ExpenseCategory }
        | { kind: "item"; itemId: string };
      interruptionMonthlyCents: number;
    }
  | { type: "continue" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "exit" }
  | { type: "discard_draft" };

export type HouseholdRunwayInterviewCommand =
  HouseholdRunwayInterviewCommandMetadata & HouseholdRunwayInterviewCommandInput;

export type HouseholdRunwayInterviewEvent =
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_started";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_restarted";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "country_selected";
      country: RunwayCountry;
      proposedCurrency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "region_selected";
      region: string | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_selected";
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_change_requested";
      currency: RunwayCurrency;
      monetaryEntryCount: number;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_entries_reset" | "currency_entries_retained";
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "validation_blocked";
      stage: HouseholdRunwayInterviewStage;
      issue: HouseholdRunwayValidationIssue;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "location_completed";
      country: RunwayCountry;
      region: string;
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "stage_completed" | "stage_skipped" | "stage_inapplicable";
      stage: HouseholdRunwayInterviewStage;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "answers_cleared";
      stages: readonly HouseholdRunwayInterviewStage[];
      reason: "inapplicable" | "explicit_skip" | "currency_reset";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "income_estimate_recomputed";
      person: "mine" | "partner";
      ruleVersion: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "scenario_selected" | "scenario_fallback";
      scenario: RunwayScenario;
      previousScenario?: RunwayScenario | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "expense_category_opened" | "expense_category_completed";
      category: ExpenseCategory;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_exited" | "draft_discarded";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "command_ignored";
      command: HouseholdRunwayInterviewCommand["type"];
      reason:
        | "invalid_stage"
        | "already_started"
        | "already_not_started"
        | "stage_not_skippable"
        | "no_pending_currency_change"
        | "partner_not_applicable"
        | "scenario_unavailable"
        | "expense_category_not_open";
    });

export type HouseholdRunwayInterviewEffect =
  | {
      type: "history";
      action: "push" | "replace" | "back";
      destination: "landing" | "interview";
    }
  | { type: "focus"; stage: HouseholdRunwayInterviewStage };

export interface HouseholdRunwayInterviewTransition {
  state: HouseholdRunwayInterviewState;
  nextState: HouseholdRunwayInterviewState;
  renderModel: HouseholdRunwayInterviewRenderModel;
  /** Derived complete inputs exposed at the public transition boundary. */
  planInputs: HouseholdRunwayAnswers | null;
  /** Current assessment derived from planInputs, when the state is reviewable. */
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  events: readonly HouseholdRunwayInterviewEvent[];
  effects: readonly HouseholdRunwayInterviewEffect[];
}

function freshAnswers(): HouseholdRunwayInterviewAnswers {
  // The epoch is deliberate: the deterministic core never asks the ambient
  // clock for a default timestamp.
  const defaults = createDefaultRunwayAnswers(new Date(0));
  return {
    ...defaults,
    country: null,
    region: null,
    currency: null,
    updated_at: null,
  };
}

function freshIncome(employment: EmploymentStatus = "employed"): IncomeAnswer {
  const income = freshAnswers().mine;
  return { ...income, employment };
}

function emptyMoney() {
  return { cents: 0, confidence: "skipped" as const };
}

function normalizedCents(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function isInputConfidence(value: unknown): value is MoneyAnswer["confidence"] {
  return ["confirmed", "estimated", "needs_review", "skipped"].includes(
    String(value),
  );
}

function normalizeMoney(
  input: Partial<MoneyAnswer> | null | undefined,
  fallback: MoneyAnswer = emptyMoney(),
): MoneyAnswer {
  return {
    cents:
      input?.cents === undefined
        ? normalizedCents(fallback.cents)
        : normalizedCents(input.cents),
    confidence: isInputConfidence(input?.confidence)
      ? input.confidence
      : fallback.confidence,
  };
}

function normalizeQuickExpenses(
  input: Partial<QuickExpenses> | null | undefined,
): QuickExpenses {
  const current = normalizedCents(input?.current_monthly_cents);
  const interruption = Math.min(
    current,
    normalizedCents(input?.interruption_monthly_cents),
  );
  return {
    current_monthly_cents: current,
    interruption_monthly_cents: interruption,
    confidence: isInputConfidence(input?.confidence)
      ? input.confidence
      : "skipped",
  };
}

function normalizeExpenseSubtotal(
  input: Partial<ExpenseCategorySubtotal> | null | undefined,
): ExpenseCategorySubtotal {
  const current = normalizedCents(input?.current_monthly_cents);
  return {
    current_monthly_cents: current,
    interruption_monthly_cents: Math.min(
      current,
      normalizedCents(input?.interruption_monthly_cents),
    ),
    confidence: isInputConfidence(input?.confidence)
      ? input.confidence
      : "skipped",
  };
}

function normalizeExpenseItem(
  input: Partial<ExpenseLineItem> | null | undefined,
  fallback: ExpenseLineItem,
): ExpenseLineItem {
  const category = EXPENSE_CATEGORIES.includes(
    input?.category as ExpenseCategory,
  )
    ? (input?.category as ExpenseCategory)
    : fallback.category;
  const itemType = isExpenseItemType(input?.type)
    ? input.type
    : fallback.type;
  const current = normalizedCents(input?.current_amount_cents);
  return {
    ...fallback,
    ...input,
    category,
    type: itemType,
    current_amount_cents: current,
    interruption_amount_cents: Math.min(
      current,
      normalizedCents(input?.interruption_amount_cents),
    ),
    frequency:
      input?.frequency === "annual" || input?.frequency === "quarterly"
        ? input.frequency
        : "monthly",
    confidence: isInputConfidence(input?.confidence)
      ? input.confidence
      : fallback.confidence,
  };
}

function freshStageStatus(
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStageStatusMap {
  return Object.fromEntries(
    HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.map((stage) => [
      stage,
      isStageApplicable(stage, answers) ? "pending" : "inapplicable",
    ]),
  ) as HouseholdRunwayInterviewStageStatusMap;
}

function isCountry(value: unknown): value is RunwayCountry {
  return (
    typeof value === "string" &&
    (HOUSEHOLD_RUNWAY_COUNTRIES as readonly string[]).includes(value)
  );
}

function isCurrency(value: unknown): value is RunwayCurrency {
  return (
    typeof value === "string" &&
    (HOUSEHOLD_RUNWAY_CURRENCIES as readonly string[]).includes(value)
  );
}

function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return ["employed", "self_employed", "unemployed", "not_working"].includes(
    String(value),
  );
}

function isWorking(income: IncomeAnswer | null): boolean {
  return Boolean(
    income &&
      (income.employment === "employed" || income.employment === "self_employed"),
  );
}

function proposedCurrencyFor(country: RunwayCountry | null) {
  return country ? CURRENCY_FOR_COUNTRY[country] : null;
}

function normalizeLocation(
  input: Partial<HouseholdRunwayInterviewLocation> | null | undefined,
): HouseholdRunwayInterviewLocation {
  const country = isCountry(input?.country) ? input.country : null;
  const proposal = proposedCurrencyFor(country);
  const proposedCurrency = isCurrency(input?.proposedCurrency)
    ? input.proposedCurrency
    : proposal;
  const region =
    typeof input?.region === "string" && input.region.trim()
      ? input.region.trim()
      : null;
  const currency = isCurrency(input?.currency) ? input.currency : null;
  const currencySelection =
    currency && input?.currencySelection !== "proposed"
      ? "explicit"
      : proposedCurrency
        ? "proposed"
        : "unset";

  return {
    country,
    region,
    currency: currencySelection === "explicit" ? currency : null,
    proposedCurrency,
    currencySelection,
  };
}

function normalizeIncome(
  input: Partial<IncomeAnswer> | null | undefined,
  fallback: IncomeAnswer,
): IncomeAnswer {
  const value = { ...fallback, ...(input ?? {}) };
  return {
    ...value,
    employment: isEmploymentStatus(value.employment)
      ? value.employment
      : fallback.employment,
    monthly_take_home_cents: normalizedCents(value.monthly_take_home_cents),
    estimated_monthly_take_home_cents:
      normalizedCents(value.estimated_monthly_take_home_cents),
    entered_amount_cents: normalizedCents(value.entered_amount_cents),
    gross_amount_cents: normalizedCents(value.gross_amount_cents),
    net_amount_cents: normalizedCents(value.net_amount_cents),
    annual_other_deductions_cents:
      normalizedCents(value.annual_other_deductions_cents),
  };
}

function normalizeAnswers(
  input: Partial<HouseholdRunwayInterviewAnswers> | null | undefined,
  location: HouseholdRunwayInterviewLocation,
): HouseholdRunwayInterviewAnswers {
  const defaults = freshAnswers();
  const raw = input ?? {};
  return {
    ...defaults,
    ...raw,
    country: location.country,
    region: location.region,
    currency: location.currency,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
    mine: normalizeIncome(raw.mine, defaults.mine),
    partner: raw.partner ? normalizeIncome(raw.partner, defaults.mine) : null,
    other_income_sources: Array.isArray(raw.other_income_sources)
      ? raw.other_income_sources.map((source) => ({
          ...source,
          monthly_cents: normalizedCents(source.monthly_cents),
          confidence: isInputConfidence(source.confidence)
            ? source.confidence
            : "skipped",
        }))
      : [],
    available_cash: normalizeMoney(raw.available_cash),
    assets: Object.fromEntries(
      HOUSEHOLD_RUNWAY_ASSET_KEYS.map((key) => [
        key,
        normalizeMoney(raw.assets?.[key], defaults.assets[key]),
      ]),
    ) as unknown as RunwayAssets,
    expense_items: Array.isArray(raw.expense_items)
      ? raw.expense_items.map((item) =>
          normalizeExpenseItem(item, {
            id: item.id,
            category: item.category,
            type: item.type,
            label: item.label,
            current_amount_cents: 0,
            interruption_amount_cents: 0,
            frequency: "monthly",
            confidence: "skipped",
          }),
        )
      : [],
    completed_expense_categories: Array.isArray(
      raw.completed_expense_categories,
    )
      ? Array.from(
          new Set(
            raw.completed_expense_categories.filter(
              (category): category is ExpenseCategory =>
                EXPENSE_CATEGORIES.includes(category as ExpenseCategory),
            ),
          ),
        )
      : [],
    expense_category_modes: Object.fromEntries(
      Object.entries(raw.expense_category_modes ?? {}).filter(
        ([category, mode]) =>
          EXPENSE_CATEGORIES.includes(category as ExpenseCategory) &&
          (mode === "subtotal" || mode === "itemized"),
      ),
    ) as Partial<Record<ExpenseCategory, ExpenseCategoryMode>>,
    expense_category_subtotals: Object.fromEntries(
      Object.entries(raw.expense_category_subtotals ?? {})
        .filter(([category]) =>
          EXPENSE_CATEGORIES.includes(category as ExpenseCategory),
        )
        .map(([category, subtotal]) => [
          category,
          normalizeExpenseSubtotal(subtotal),
        ]),
    ) as Partial<Record<ExpenseCategory, ExpenseCategorySubtotal>>,
    quick_expenses: normalizeQuickExpenses(raw.quick_expenses),
    extreme_access: {
      ...defaults.extreme_access,
      illiquid_investments_cents: normalizedCents(
        raw.extreme_access?.illiquid_investments_cents,
      ),
      retirement_tax_deferred_cents: normalizedCents(
        raw.extreme_access?.retirement_tax_deferred_cents,
      ),
      retirement_tax_free_cents: normalizedCents(
        raw.extreme_access?.retirement_tax_free_cents,
      ),
    },
  };
}

function isStageApplicable(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): boolean {
  switch (stage) {
    case "myIncome":
      return isWorking(answers.mine);
    case "partnerIncome":
      return Boolean(answers.shares_finances && isWorking(answers.partner));
    case "result":
      return false;
    default:
      return true;
  }
}

export function applicableHouseholdRunwayInterviewStages(
  stateOrDraft: HouseholdRunwayInterviewState | HouseholdRunwayInterviewDraft,
): HouseholdRunwayInterviewStage[] {
  const draft = "draft" in stateOrDraft ? stateOrDraft.draft : stateOrDraft;
  const stages = NON_RESULT_STAGES.filter((stage) =>
    isStageApplicable(stage, draft.answers),
  );
  if ("status" in stateOrDraft && stateOrDraft.status === "completed") {
    return [...stages, "result"];
  }
  return stages;
}

/** Alias used by adapters that describe the graph as an ordered stage list. */
export const getApplicableHouseholdRunwayInterviewStages =
  applicableHouseholdRunwayInterviewStages;

function calculationAnswers(
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayAnswers {
  return {
    ...answers,
    country: answers.country ?? "US",
    region: answers.region ?? "",
    currency: answers.currency ?? "USD",
    updated_at: answers.updated_at ?? "1970-01-01T00:00:00.000Z",
  } as HouseholdRunwayAnswers;
}

function issueForPlanPath(
  path: readonly (string | number)[],
): HouseholdRunwayValidationIssue {
  const first = path[0];
  if (first === "country") {
    return { code: "country_required", stage: "location", path };
  }
  if (first === "region") {
    return { code: "region_invalid", stage: "location", path };
  }
  if (first === "currency") {
    return { code: "currency_required", stage: "location", path };
  }
  if (first === "mine") {
    return { code: "income_required", stage: "myIncome", path };
  }
  if (first === "partner") {
    return { code: "income_required", stage: "partnerIncome", path };
  }
  if (
    first === "expense_items" ||
    first === "expense_category_modes" ||
    first === "expense_category_subtotals" ||
    first === "quick_expenses"
  ) {
    return { code: "plan_input_invalid", stage: "expenses", path };
  }
  if (first === "updated_at") {
    return { code: "draft_timestamp_required", stage: "review", path };
  }
  if (first === "extreme_access") {
    // Preserve the established public review gate for relational asset
    // validation while keeping the detailed path available at the schema
    // boundary itself.
    return { code: "assessment_required" };
  }
  return { code: "plan_input_invalid", stage: "review", path };
}

function hasPlanIssue(
  issues: readonly HouseholdRunwayValidationIssue[],
  code: HouseholdRunwayValidationIssueCode,
  stage?: HouseholdRunwayInterviewStage,
) {
  return issues.some((issue) => issue.code === code && issue.stage === stage);
}

/**
 * Convert the partial Interview Draft into the complete shape accepted by the
 * public Household Runway calculation boundary.
 *
 * The returned Plan inputs are deliberately not stored on the Draft. They are
 * a derived, review-only projection so provisional answers cannot be mistaken
 * for a committable Plan.
 */
export function normalizeHouseholdRunwayDraft(
  draft: HouseholdRunwayInterviewDraft,
): HouseholdRunwayDraftNormalizationOutcome {
  const location = draft.location;
  const normalized = normalizeAnswers(draft.answers, location);
  const issues: HouseholdRunwayValidationIssue[] = [];

  if (!location.country) {
    issues.push({ code: "country_required", stage: "location" });
  }
  if (!location.region) {
    issues.push({ code: "region_required", stage: "location" });
  }
  if (!location.currency) {
    issues.push({ code: "currency_required", stage: "location" });
  }
  if (draft.pendingCurrencyChange) {
    issues.push({
      code: "currency_change_confirmation_required",
      stage: "location",
    });
  }
  if (
    !normalized.updated_at ||
    Number.isNaN(new Date(normalized.updated_at).getTime())
  ) {
    issues.push({ code: "draft_timestamp_required", stage: "review" });
  }

  const locationReady = Boolean(
    location.country && location.region && location.currency,
  );
  const planCandidate = {
    ...normalized,
    ...(locationReady
      ? {
          mine: recomputeEstimatedIncome(normalized.mine, location).income,
          partner: normalized.partner
            ? recomputeEstimatedIncome(normalized.partner, location).income
            : null,
        }
      : {}),
    country: location.country,
    region: location.region ?? "",
    currency: location.currency,
    updated_at: normalized.updated_at ?? "",
  };

  const planAnswers = planCandidate as HouseholdRunwayAnswers;
  if (isWorking(planAnswers.mine) && planAnswers.mine.monthly_take_home_cents <= 0) {
    issues.push({ code: "income_required", stage: "myIncome" });
  }
  if (
    planAnswers.partner &&
    isWorking(planAnswers.partner) &&
    planAnswers.partner.monthly_take_home_cents <= 0
  ) {
    issues.push({ code: "income_required", stage: "partnerIncome" });
  }
  const totals = expenseTotals(calculationAnswers(normalized));
  if (totals.current <= 0) {
    issues.push({ code: "expenses_current_required", stage: "expenses" });
  }
  if (totals.interruption <= 0) {
    issues.push({
      code: "expenses_interruption_required",
      stage: "reductions",
    });
  }

  const parsed = householdRunwayAnswersSchema.safeParse(planCandidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const mapped = issueForPlanPath(issue.path);
      if (!hasPlanIssue(issues, mapped.code, mapped.stage)) issues.push(mapped);
    }
  }

  return issues.length > 0
    ? { success: false, validationIssues: issues }
    : { success: true, planInputs: parsed.data as HouseholdRunwayAnswers };
}

function availableScenarios(
  answers: HouseholdRunwayInterviewAnswers,
): ScenarioOption[] {
  return calculateAvailableScenarios(calculationAnswers(answers));
}

function expenseCategoryProgress(
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayExpenseCategoryProgress[] {
  const calculation = calculationAnswers(answers);
  return EXPENSE_CATEGORIES.map((category) => {
    const totals = expenseCategoryTotals(calculation, category);
    return {
      category,
      mode: answers.expense_category_modes[category] ?? null,
      currentMonthlyCents: totals.current,
      interruptionMonthlyCents: totals.interruption,
      completed: answers.completed_expense_categories.includes(category),
    };
  });
}

function hasMonetaryValue(value: number, confidence?: string) {
  return value !== 0 || confidence === "confirmed" || confidence === "needs_review";
}

function monetaryEntryCount(answers: HouseholdRunwayInterviewAnswers): number {
  let count = 0;
  if (hasMonetaryValue(answers.mine.monthly_take_home_cents) || hasMonetaryValue(answers.mine.entered_amount_cents)) count++;
  if (answers.partner && (hasMonetaryValue(answers.partner.monthly_take_home_cents) || hasMonetaryValue(answers.partner.entered_amount_cents))) count++;
  if (answers.other_income_sources.some((source) => hasMonetaryValue(source.monthly_cents, source.confidence))) count++;
  if (hasMonetaryValue(answers.available_cash.cents, answers.available_cash.confidence)) count++;
  if (Object.values(answers.assets).some((asset) => hasMonetaryValue(asset.cents, asset.confidence))) count++;
  if (answers.expense_items.some((item) => hasMonetaryValue(item.current_amount_cents, item.confidence) || hasMonetaryValue(item.interruption_amount_cents, item.confidence))) count++;
  if (Object.values(answers.expense_category_subtotals).some((subtotal) => subtotal && (hasMonetaryValue(subtotal.current_monthly_cents, subtotal.confidence) || hasMonetaryValue(subtotal.interruption_monthly_cents, subtotal.confidence)))) count++;
  if (hasMonetaryValue(answers.quick_expenses.current_monthly_cents, answers.quick_expenses.confidence) || hasMonetaryValue(answers.quick_expenses.interruption_monthly_cents, answers.quick_expenses.confidence)) count++;
  if (Object.values(answers.extreme_access).some((value) => hasMonetaryValue(value))) count++;
  return count;
}

function clearIncomeMoney(income: IncomeAnswer): IncomeAnswer {
  const cleared: IncomeAnswer = {
    ...income,
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    gross_amount_cents: 0,
    net_amount_cents: 0,
    annual_other_deductions_cents: 0,
    take_home_source: "estimated",
    confidence: "estimated",
  };
  delete cleared.estimate_rule_version;
  return cleared;
}

function clearCurrencyEntries(
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewAnswers {
  return {
    ...answers,
    mine: clearIncomeMoney(answers.mine),
    partner: answers.partner ? clearIncomeMoney(answers.partner) : null,
    other_income_sources: [],
    available_cash: emptyMoney(),
    assets: {
      liquid_investments: emptyMoney(),
      illiquid_investments: emptyMoney(),
      home_equity: emptyMoney(),
      retirement_tax_deferred: emptyMoney(),
      retirement_tax_free: emptyMoney(),
    },
    expense_items: [],
    completed_expense_categories: [],
    expense_category_modes: {},
    expense_category_subtotals: {},
    quick_expenses: {
      current_monthly_cents: 0,
      interruption_monthly_cents: 0,
      confidence: "skipped",
    },
    extreme_access: {
      illiquid_investments_cents: 0,
      retirement_tax_deferred_cents: 0,
      retirement_tax_free_cents: 0,
    },
  };
}

function recomputeEstimatedIncome(
  income: IncomeAnswer,
  location: HouseholdRunwayInterviewLocation,
): { income: IncomeAnswer; ruleVersion: string | null } {
  if (
    !location.country ||
    income.entered_as !== "gross" ||
    income.gross_amount_cents <= 0
  ) {
    return { income, ruleVersion: null };
  }
  const estimate = estimateMonthlyTakeHome({
    country: location.country,
    region: location.region ?? "",
    amountCents: income.gross_amount_cents,
    period: income.gross_period,
    filingStatus: income.tax_filing_status,
    selfEmployed: income.employment === "self_employed",
    annualOtherDeductionsCents: income.annual_other_deductions_cents,
  });
  return {
    income: {
      ...income,
      estimated_monthly_take_home_cents: estimate.monthly_take_home_cents,
      estimate_rule_version: estimate.rule_version,
      ...(income.take_home_source === "estimated"
        ? {
            monthly_take_home_cents: estimate.monthly_take_home_cents,
            confidence: "estimated" as const,
          }
        : {}),
    },
    ruleVersion: estimate.rule_version,
  };
}

function normalizeIncomePatch(
  current: IncomeAnswer,
  patch: Partial<IncomeAnswer>,
  location: HouseholdRunwayInterviewLocation,
): { income: IncomeAnswer; ruleVersion: string | null } {
  let income = normalizeIncome({ ...current, ...patch }, current);
  if (income.entered_as === "gross") {
    income.entered_amount_cents = income.gross_amount_cents;
    income.entered_period = income.gross_period;
    const shouldEstimate =
      patch.take_home_source !== "user_confirmed" &&
      patch.monthly_take_home_cents === undefined;
    const recomputed = recomputeEstimatedIncome(income, location);
    income = shouldEstimate ? recomputed.income : { ...income, ...recomputed.income };
    if (!shouldEstimate && patch.monthly_take_home_cents !== undefined) {
      income.monthly_take_home_cents = patch.monthly_take_home_cents;
    }
    return recomputed;
  }
  income.entered_amount_cents = income.net_amount_cents;
  income.entered_period = income.net_period;
  income.monthly_take_home_cents =
    income.net_period === "annual"
      ? Math.round(income.net_amount_cents / 12)
      : income.net_amount_cents;
  income.estimated_monthly_take_home_cents = 0;
  income.take_home_source = "user_confirmed";
  income.confidence = "confirmed";
  delete income.estimate_rule_version;
  return { income, ruleVersion: null };
}

function clearStageAnswers(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewAnswers {
  if (stage === "myIncome") {
    return { ...answers, mine: clearIncomeMoney(answers.mine) };
  }
  if (stage === "partnerIncome") {
    return { ...answers, partner: null };
  }
  if (stage === "otherIncome") {
    return { ...answers, other_income_sources: [] };
  }
  if (stage === "assets") {
    return {
      ...answers,
      assets: {
        liquid_investments: emptyMoney(),
        illiquid_investments: emptyMoney(),
        home_equity: emptyMoney(),
        retirement_tax_deferred: emptyMoney(),
        retirement_tax_free: emptyMoney(),
      },
      extreme_access: {
        illiquid_investments_cents: 0,
        retirement_tax_deferred_cents: 0,
        retirement_tax_free_cents: 0,
      },
    };
  }
  return answers;
}

function stageIndex(stage: HouseholdRunwayInterviewStage) {
  return HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.indexOf(stage);
}

function firstApplicableStageAtOrAfter(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage | null {
  const start = stageIndex(stage);
  return (
    HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.slice(start).find((candidate) =>
      isStageApplicable(candidate, answers),
    ) ?? null
  );
}

function firstApplicableStageBefore(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage | null {
  const start = stageIndex(stage);
  for (let index = start - 1; index >= 0; index--) {
    const candidate = HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS[index];
    if (isStageApplicable(candidate, answers)) return candidate;
  }
  return null;
}

function normalizeStageStatus(
  input: Partial<HouseholdRunwayInterviewStageStatusMap> | null | undefined,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStageStatusMap {
  const result = freshStageStatus(answers);
  for (const stage of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
    const value = input?.[stage];
    if (stage === "result" && value === "completed") {
      result[stage] = "completed";
      continue;
    }
    if (["pending", "completed", "skipped"].includes(String(value)) && isStageApplicable(stage, answers)) {
      result[stage] = value as HouseholdRunwayInterviewStageStatus;
    }
  }
  return result;
}

function normalizeDraft(
  input: Partial<HouseholdRunwayInterviewDraft> | null | undefined,
): HouseholdRunwayInterviewDraft {
  const rawLocation = input?.location;
  const rawAnswers = input?.answers as Partial<HouseholdRunwayInterviewAnswers> | undefined;
  const location = normalizeLocation(
    rawLocation ?? {
      country: rawAnswers?.country,
      region: rawAnswers?.region,
      currency: rawAnswers?.currency,
      proposedCurrency: proposedCurrencyFor(
        isCountry(rawAnswers?.country) ? rawAnswers.country : null,
      ),
      currencySelection: rawAnswers?.currency ? "explicit" : "unset",
    },
  );
  const answers = normalizeAnswers(rawAnswers, location);
  const scenarios = availableScenarios(answers);
  const selectedScenario = scenarios.some(
    (item) => item.id === input?.selectedScenario,
  )
    ? input?.selectedScenario ?? null
    : scenarios[0]?.id ?? null;

  return {
    revision:
      Number.isInteger(input?.revision) && input?.revision !== undefined
        ? input.revision
        : 0,
    interviewId: input?.interviewId ?? null,
    startedAt: input?.startedAt ?? null,
    location,
    answers,
    stageStatus: normalizeStageStatus(input?.stageStatus, answers),
    validationIssues: { ...(input?.validationIssues ?? {}) },
    selectedScenario,
    availableScenarios: scenarios,
    pendingCurrencyChange: input?.pendingCurrencyChange
      ? {
          currency: input.pendingCurrencyChange.currency,
          monetaryEntryCount: input.pendingCurrencyChange.monetaryEntryCount,
        }
      : null,
    activeExpenseCategory: EXPENSE_CATEGORIES.includes(
      input?.activeExpenseCategory as ExpenseCategory,
    )
      ? (input?.activeExpenseCategory as ExpenseCategory)
      : null,
  };
}

function snapshotOf(state: HouseholdRunwayInterviewState): HouseholdRunwayInterviewSnapshot {
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: state.status,
    stage: state.stage,
    draft: state.draft,
    validationIssue: state.validationIssue,
  };
}

function blockingIssueFor(
  draft: HouseholdRunwayInterviewDraft,
  stage: HouseholdRunwayInterviewStage | null,
  current: HouseholdRunwayValidationIssue | null,
) {
  return stage ? current ?? draft.validationIssues[stage] ?? null : null;
}

interface HouseholdRunwayReviewProjection {
  planInputs: HouseholdRunwayAnswers | null;
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  validationIssue: HouseholdRunwayValidationIssue | null;
}

function reviewProjectionForDraft(
  draft: HouseholdRunwayInterviewDraft,
): HouseholdRunwayReviewProjection {
  const normalized = normalizeHouseholdRunwayDraft(draft);
  if (!normalized.success) {
    return {
      planInputs: null,
      assessment: null,
      validationIssue: normalized.validationIssues[0] ?? {
        code: "plan_input_invalid",
        stage: "review",
      },
    };
  }

  const assessment = assessHouseholdRunway({
    answers: normalized.planInputs,
    startDate: new Date(normalized.planInputs.updated_at),
  });
  if (!assessment.success) {
    return {
      planInputs: normalized.planInputs,
      assessment: null,
      validationIssue: {
        code: "assessment_required",
        stage: "review",
      },
    };
  }
  return {
    planInputs: normalized.planInputs,
    assessment,
    validationIssue: null,
  };
}

function renderFor(
  status: HouseholdRunwayInterviewStatus,
  stage: HouseholdRunwayInterviewStage | null,
  draft: HouseholdRunwayInterviewDraft,
  validationIssue: HouseholdRunwayValidationIssue | null,
  reviewProjection: HouseholdRunwayReviewProjection | null,
): HouseholdRunwayInterviewRenderModel {
  if (status === "not_started" || stage === null) {
    return { kind: "landing", stage: null, location: null };
  }

  const availableStages = applicableHouseholdRunwayInterviewStages({
    status,
    stage,
    draft,
  } as HouseholdRunwayInterviewState);
  const stageStatus = draft.stageStatus[stage];
  const blockingIssue = blockingIssueFor(draft, stage, validationIssue) ??
    (stage === "review" ? reviewProjection?.validationIssue ?? null : null);

  if (stage === "location") {
    return {
      kind: "location",
      stage,
      country: draft.location.country,
      region: draft.location.region,
      currency: draft.location.currency,
      currencyProposal: draft.location.proposedCurrency,
      currencySelection: draft.location.currencySelection,
      availableCountries: HOUSEHOLD_RUNWAY_COUNTRIES,
      availableCurrencies: HOUSEHOLD_RUNWAY_CURRENCIES,
      availableStages,
      stageStatus,
      canContinue: Boolean(
        draft.location.country &&
          draft.location.region &&
          draft.location.currency &&
          !draft.pendingCurrencyChange,
      ),
      blockingIssue,
      pendingCurrencyChange: draft.pendingCurrencyChange,
    };
  }

  if (stage === "household") {
    return {
      kind: "household",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      sharesFinances: draft.answers.shares_finances,
      hasChildren: draft.answers.has_children,
      hasSupportObligations: draft.answers.has_support_obligations,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "employment") {
    return {
      kind: "employment",
      stage,
      mine: draft.answers.mine.employment,
      partner: draft.answers.partner?.employment ?? null,
      sharesFinances: draft.answers.shares_finances,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "myIncome" || stage === "partnerIncome") {
    return {
      kind: stage,
      stage,
      person: stage === "myIncome" ? "mine" : "partner",
      income:
        stage === "myIncome"
          ? draft.answers.mine
          : draft.answers.partner ?? freshIncome("employed"),
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "otherIncome") {
    return {
      kind: "otherIncome",
      stage,
      sources: draft.answers.other_income_sources,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      optional: true,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "cash") {
    return {
      kind: "cash",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      availableCash: draft.answers.available_cash,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "assets") {
    return {
      kind: "assets",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      assets: draft.answers.assets,
      extremeAccess: draft.answers.extreme_access,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "expenses") {
    const calculation = calculationAnswers(draft.answers);
    return {
      kind: "expenses",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      mode: draft.answers.expense_mode,
      activeCategory: draft.activeExpenseCategory,
      housingTenure: draft.answers.housing_tenure,
      quickExpenses: draft.answers.quick_expenses,
      expenseItems: draft.answers.expense_items,
      categoryModes: draft.answers.expense_category_modes,
      categorySubtotals: draft.answers.expense_category_subtotals,
      completedCategories: draft.answers.completed_expense_categories,
      categories: expenseCategoryProgress(draft.answers),
      totals: expenseTotals(calculation),
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "reductions") {
    const calculation = calculationAnswers(draft.answers);
    return {
      kind: "reductions",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      mode: draft.answers.expense_mode,
      quickExpenses: draft.answers.quick_expenses,
      expenseItems: draft.answers.expense_items,
      categoryModes: draft.answers.expense_category_modes,
      categorySubtotals: draft.answers.expense_category_subtotals,
      totals: expenseTotals(calculation),
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  if (stage === "review") {
    return {
      kind: "review",
      stage,
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
      answers: draft.answers,
      planInputs: reviewProjection?.planInputs ?? null,
      assessment: reviewProjection?.assessment ?? null,
      availableScenarios: draft.availableScenarios,
      selectedScenario: draft.selectedScenario,
      assessmentModelVersion: reviewProjection?.assessment?.modelVersion ?? null,
      ready: blockingIssue === null && reviewProjection?.assessment != null,
      availableStages,
      stageStatus,
      blockingIssue,
    };
  }

  return {
    kind: "stage",
    stage,
    availableStages,
    stageStatus,
    blockingIssue,
    planInputs: reviewProjection?.planInputs ?? null,
    assessment: reviewProjection?.assessment ?? null,
    availableScenarios: draft.availableScenarios,
    selectedScenario: draft.selectedScenario,
    assessmentModelVersion: reviewProjection?.assessment?.modelVersion ?? null,
  };
}

function stateFrom(
  snapshot: HouseholdRunwayInterviewSnapshot,
): HouseholdRunwayInterviewState {
  const draft = normalizeDraft(snapshot.draft);
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
      validationIssue,
      ...derived,
      renderModel: renderModel as HouseholdRunwayLandingRenderModel,
      render: renderModel as HouseholdRunwayLandingRenderModel,
    };
  }
  if (status === "reviewing") {
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: "review",
      draft,
      validationIssue,
      ...derived,
      renderModel: renderModel as HouseholdRunwayReviewRenderModel,
      render: renderModel as HouseholdRunwayReviewRenderModel,
    };
  }
  if (status === "completed") {
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: "result",
      draft,
      validationIssue,
      ...derived,
      renderModel: renderModel as HouseholdRunwayGenericStageRenderModel,
      render: renderModel as HouseholdRunwayGenericStageRenderModel,
    };
  }
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: "collecting",
    stage: stage as Exclude<HouseholdRunwayInterviewStage, "result">,
    draft,
    validationIssue,
    ...derived,
    renderModel: renderModel as Exclude<
      HouseholdRunwayInterviewRenderModel,
      HouseholdRunwayLandingRenderModel
    >,
    render: renderModel as Exclude<
      HouseholdRunwayInterviewRenderModel,
      HouseholdRunwayLandingRenderModel
    >,
  };
}

function transition(
  state: HouseholdRunwayInterviewState,
  next: HouseholdRunwayInterviewSnapshot,
  events: readonly HouseholdRunwayInterviewEvent[],
  effects: readonly HouseholdRunwayInterviewEffect[],
): HouseholdRunwayInterviewTransition {
  const nextState = stateFrom(next);
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

function event<T extends HouseholdRunwayInterviewEvent["type"]>(
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

function ignored(
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

function startState(
  state: HouseholdRunwayInterviewState,
  command: Extract<
    HouseholdRunwayInterviewCommand,
    { type: "start" | "start_new" }
  >,
  restarted: boolean,
): HouseholdRunwayInterviewTransition {
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
  draft.revision = state.draft.revision + 1;
  draft.interviewId = command.interviewId;
  draft.startedAt = command.occurredAt;
  const startEvent = event(
    command,
    restarted ? "interview_restarted" : "interview_started",
    { interviewId: command.interviewId },
  );
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
      validationIssue: null,
    },
    [startEvent],
    [
      { type: "history", action: "push", destination: "interview" },
      { type: "focus", stage },
    ],
  );
}

function updateDraftAnswers(
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
      validationIssue: null,
    },
    events,
    nextStage && nextStage !== state.stage
      ? [{ type: "focus", stage: nextStage }]
      : [],
  );
}

function invalidateValidationIssues(
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

function setCash(
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

function setAsset(
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

function setExpenseMode(
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

function setQuickExpenses(
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

function setExpenseCategoryMode(
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

function setExpenseCategorySubtotal(
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

function setExpenseItem(
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

function setHousingTenure(
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

function setReduction(
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

function repairCurrentStage(
  stage: HouseholdRunwayInterviewStage | null,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage {
  if (!stage || isStageApplicable(stage, answers)) return stage ?? "location";
  if (stage === "result") return stage;
  return (
    firstApplicableStageAtOrAfter(stage, answers) ??
    firstApplicableStageBefore(stage, answers) ??
    "location"
  );
}

function statusForStage(
  stage: HouseholdRunwayInterviewStage,
  priorStatus: HouseholdRunwayInterviewStatus,
): HouseholdRunwayInterviewStatus {
  if (stage === "result") return "completed";
  if (stage === "review") return "reviewing";
  return priorStatus === "not_started" ? "collecting" : "collecting";
}

function setLocation(
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

function requestCurrencyChange(
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

function applyCurrencyChange(
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

function continueInterview(
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

function backInterview(
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
        draft: normalizeDraft({ ...state.draft, pendingCurrencyChange: null }),
        validationIssue: null,
      },
      [event(command, "interview_exited", {})],
      [{ type: "history", action: "back", destination: "landing" }],
    );
  }
  if (state.status === "completed") {
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "reviewing",
        stage: "review",
        draft: state.draft,
        validationIssue: null,
      },
      [],
      [{ type: "focus", stage: "review" }],
    );
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
        validationIssues: { ...state.draft.validationIssues, [state.stage!]: null },
      }),
      validationIssue: null,
    },
    [],
    [{ type: "focus", stage: previous }],
  );
}

export function createHouseholdRunwayInterview(): HouseholdRunwayInterviewState {
  const draft = normalizeDraft(null);
  return stateFrom({
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: "not_started",
    stage: null,
    draft,
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

export function dispatchHouseholdRunwayInterview(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
): HouseholdRunwayInterviewTransition {
  if (command.type === "start") {
    return state.status === "not_started"
      ? startState(state, command, false)
      : ignored(state, command, "already_started");
  }
  if (command.type === "start_new") return startState(state, command, true);
  if (command.type === "exit") {
    return state.status === "not_started"
      ? ignored(state, command, "already_not_started")
      : backInterview(state, command);
  }
  if (command.type === "discard_draft") {
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "not_started",
        stage: null,
        draft: normalizeDraft(null),
        validationIssue: null,
      },
      [event(command, "draft_discarded", {})],
      [{ type: "history", action: "replace", destination: "landing" }],
    );
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
