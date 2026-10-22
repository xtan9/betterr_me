/** Normalizes provisional answers and their dependent income and currency values. */

import {
  createDefaultRunwayAnswers,
  type EmploymentStatus,
  type IncomeAnswer,
  type MoneyAnswer,
  type QuickExpenses,
  type ExpenseCategorySubtotal,
  type ExpenseLineItem,
  type RunwayCountry,
  type RunwayCurrency,
  type RunwayAssets,
  type ExpenseCategoryMode,
  type HouseholdRunwayAnswers,
  type ScenarioOption,
  availableScenarios as calculateAvailableScenarios,
  expenseCategoryTotals,
  estimateMonthlyTakeHome,
} from "@/lib/finance/cushion";

import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  isExpenseItemType,
} from "@/lib/finance/runway-expenses";

import {
  type Country,
  type Currency,
  type HouseholdRunwayInterviewAnswers,
  HOUSEHOLD_RUNWAY_COUNTRIES,
  HOUSEHOLD_RUNWAY_CURRENCIES,
  type HouseholdRunwayInterviewLocation,
  HOUSEHOLD_RUNWAY_ASSET_KEYS,
  type HouseholdRunwayExpenseCategoryProgress,
} from "./household-runway-interview-model";

const CURRENCY_FOR_COUNTRY: Record<Country, Currency> = {
  US: "USD",
  CA: "CAD",
  CN: "CNY",
  TW: "TWD",
};

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

export function freshIncome(employment: EmploymentStatus = "employed"): IncomeAnswer {
  const income = freshAnswers().mine;
  return { ...income, employment };
}

export function emptyMoney() {
  return { cents: 0, confidence: "skipped" as const };
}

export function normalizedCents(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function isInputConfidence(value: unknown): value is MoneyAnswer["confidence"] {
  return ["confirmed", "estimated", "needs_review", "skipped"].includes(
    String(value),
  );
}

export function normalizeMoney(
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

export function normalizeExpenseSubtotal(
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

export function normalizeExpenseItem(
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

export function isCountry(value: unknown): value is RunwayCountry {
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

export function isWorking(income: IncomeAnswer | null): boolean {
  return Boolean(
    income &&
      (income.employment === "employed" || income.employment === "self_employed"),
  );
}

export function proposedCurrencyFor(country: RunwayCountry | null) {
  return country ? CURRENCY_FOR_COUNTRY[country] : null;
}

export function normalizeLocation(
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

export function normalizeAnswers(
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

export function calculationAnswers(
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

export function availableScenarios(
  answers: HouseholdRunwayInterviewAnswers,
): ScenarioOption[] {
  return calculateAvailableScenarios(calculationAnswers(answers));
}

export function expenseCategoryProgress(
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

export function monetaryEntryCount(answers: HouseholdRunwayInterviewAnswers): number {
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

export function clearIncomeMoney(income: IncomeAnswer): IncomeAnswer {
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

export function clearCurrencyEntries(
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

export function recomputeEstimatedIncome(
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

export function incomeEstimateForRender(
  income: IncomeAnswer,
  location: HouseholdRunwayInterviewLocation,
): ReturnType<typeof estimateMonthlyTakeHome> | null {
  if (
    !location.country ||
    income.entered_as !== "gross" ||
    income.gross_amount_cents <= 0
  ) {
    return null;
  }
  return estimateMonthlyTakeHome({
    country: location.country,
    region: location.region ?? "",
    amountCents: income.gross_amount_cents,
    period: income.gross_period,
    filingStatus: income.tax_filing_status,
    selfEmployed: income.employment === "self_employed",
    annualOtherDeductionsCents: income.annual_other_deductions_cents,
  });
}

export function normalizeIncomePatch(
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
