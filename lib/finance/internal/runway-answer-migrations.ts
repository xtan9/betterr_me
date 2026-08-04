import { normalizeLegacyRegion } from "@/lib/finance/runway-regions";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ITEM_TYPES,
  isExpenseItemType,
  type ExpenseCategory,
} from "@/lib/finance/runway-expenses";
import { householdRunwayAnswersSchema } from "@/lib/validations/finance-cushion";
import type {
  ExpenseLineItem,
  HouseholdRunwayAnswers,
  HousingTenure,
  IncomeAnswer,
  InputConfidence,
  MoneyAnswer,
  RecurringIncomeSource,
  RunwayAssets,
  RunwayCountry,
  RunwayCurrency,
} from "@/lib/finance/cushion";

function defaultIncome(): IncomeAnswer {
  return {
    employment: "employed",
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    entered_period: "annual",
    entered_as: "gross",
    gross_amount_cents: 0,
    gross_period: "annual",
    net_amount_cents: 0,
    net_period: "monthly",
    tax_filing_status: "single",
    annual_other_deductions_cents: 0,
    take_home_source: "estimated",
    confidence: "estimated",
  };
}

function createDefaultAnswers(now: Date): HouseholdRunwayAnswers {
  const zero = (): MoneyAnswer => ({ cents: 0, confidence: "skipped" });
  return {
    schema_version: 4,
    country: "US",
    region: "",
    currency: "USD",
    shares_finances: false,
    has_children: false,
    has_support_obligations: false,
    mine: defaultIncome(),
    partner: null,
    other_income_sources: [],
    available_cash: zero(),
    assets: {
      liquid_investments: zero(),
      illiquid_investments: zero(),
      home_equity: zero(),
      retirement_tax_deferred: zero(),
      retirement_tax_free: zero(),
    },
    housing_tenure: null,
    expense_mode: "guided",
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
    updated_at: now.toISOString(),
  };
}

function currencyForCountry(country: RunwayCountry): RunwayCurrency {
  return { US: "USD", CA: "CAD", CN: "CNY", TW: "TWD" }[country] as RunwayCurrency;
}

export function legacyIncome(value: unknown): IncomeAnswer {
  const income = (value ?? {}) as Record<string, unknown>;
  const monthly = Number(income.monthly_take_home_cents) || 0;
  const enteredAs = income.entered_as === "net" ? "net" : "gross";
  const reviewed = Boolean(income.take_home_reviewed);
  return {
    employment: (["employed", "self_employed", "unemployed", "not_working"].includes(
      String(income.employment),
    )
      ? income.employment
      : "employed") as IncomeAnswer["employment"],
    monthly_take_home_cents: monthly,
    estimated_monthly_take_home_cents: enteredAs === "gross" ? monthly : 0,
    entered_amount_cents: Number(income.entered_amount_cents) || 0,
    entered_period: income.entered_period === "monthly" ? "monthly" : "annual",
    entered_as: enteredAs,
    gross_amount_cents: enteredAs === "gross" ? Number(income.entered_amount_cents) || 0 : 0,
    gross_period: income.entered_period === "monthly" ? "monthly" : "annual",
    net_amount_cents: enteredAs === "net" ? Number(income.entered_amount_cents) || 0 : monthly,
    net_period: income.entered_period === "annual" && enteredAs === "net" ? "annual" : "monthly",
    tax_filing_status: "single",
    annual_other_deductions_cents: 0,
    take_home_source:
      enteredAs === "net" || reviewed ? "user_confirmed" : "estimated",
    confidence: (income.confidence as InputConfidence) ?? "estimated",
    estimate_rule_version:
      typeof income.estimate_rule_version === "string"
        ? income.estimate_rule_version
        : undefined,
  };
}

export function legacyMoney(value: unknown): MoneyAnswer {
  const money = (value ?? {}) as Record<string, unknown>;
  return {
    cents: Number(money.cents) || 0,
    confidence: (money.confidence as InputConfidence) ?? "skipped",
  };
}

export function validateCurrentRunwayAnswers(
  value: unknown,
  allowIncompleteRegion: boolean,
): HouseholdRunwayAnswers | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const allowEmptyRegion = allowIncompleteRegion && raw.region === "";
  const country = (["US", "CA", "CN", "TW"].includes(String(raw.country))
    ? raw.country
    : "US") as RunwayCountry;
  const parsed = householdRunwayAnswersSchema.safeParse(
    allowEmptyRegion
      ? {
          ...raw,
          region:
            country === "US"
              ? "AL"
              : country === "CA"
                ? "AB"
                : country === "CN"
                  ? "BJ"
                  : "TPE",
        }
      : raw,
  );
  return parsed.success
    ? ({
        ...parsed.data,
        region: allowEmptyRegion ? "" : parsed.data.region,
      } as HouseholdRunwayAnswers)
    : null;
}

/**
 * Migrate answer records that predate the Household Runway Interview Draft
 * codec. This is shared with the server-side retained-plan projection, while
 * the codec owns the raw Draft envelope and its validation/expiry policy.
 */
export function migrateRunwayAnswers(
  value: unknown,
  now = new Date(),
  options: { allowIncompleteRegion?: boolean } = {},
): HouseholdRunwayAnswers | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schema_version === 4) {
    return validateCurrentRunwayAnswers(raw, Boolean(options.allowIncompleteRegion));
  }
  if (raw.schema_version !== 2 && raw.schema_version !== 3) return null;
  const country = (["US", "CA", "CN", "TW"].includes(String(raw.country))
    ? raw.country
    : "US") as RunwayCountry;
  const legacyExpenses = (raw.expenses ?? {}) as Record<
    string,
    { current_cents?: number; interruption_cents?: number; confidence?: InputConfidence }
  >;
  const priorQuick = (raw.quick_expenses ?? {}) as Record<string, unknown>;
  const current =
    raw.schema_version === 3
      ? Number(priorQuick.current_monthly_cents) || 0
      : Object.values(legacyExpenses).reduce(
          (sum, item) => sum + (Number(item.current_cents) || 0),
          0,
        );
  const interruption =
    raw.schema_version === 3
      ? Number(priorQuick.interruption_monthly_cents) || current
      : Object.values(legacyExpenses).reduce(
          (sum, item) => sum + (Number(item.interruption_cents) || 0),
          0,
        );
  const other = legacyMoney(raw.other_monthly_income);
  const oldAssets = (raw.assets ?? {}) as Record<string, unknown>;
  const retirement =
    raw.schema_version === 3
      ? legacyMoney(oldAssets.retirement_tax_deferred)
      : legacyMoney(raw.retirement_accounts);
  const migrated: HouseholdRunwayAnswers = {
    ...createDefaultAnswers(now),
    country,
    region: normalizeLegacyRegion(country, String(raw.region ?? "")),
    currency: currencyForCountry(country),
    shares_finances: Boolean(raw.shares_finances),
    has_children: Boolean(raw.has_children),
    has_support_obligations: Boolean(raw.has_support_obligations),
    mine: legacyIncome(raw.mine),
    partner: raw.partner ? legacyIncome(raw.partner) : null,
    other_income_sources:
      raw.schema_version === 3 && Array.isArray(raw.other_income_sources)
        ? (raw.other_income_sources as RecurringIncomeSource[])
        : other.cents > 0
          ? [
              {
                id: "legacy-other-income",
                type: "other",
                label: "Migrated other income",
                monthly_cents: other.cents,
                confidence: "needs_review",
              },
            ]
          : [],
    available_cash: legacyMoney(raw.available_cash),
    assets: {
      liquid_investments: legacyMoney(
        raw.schema_version === 3
          ? oldAssets.liquid_investments
          : raw.taxable_investments,
      ),
      illiquid_investments: legacyMoney(oldAssets.illiquid_investments),
      home_equity: legacyMoney(
        raw.schema_version === 3 ? oldAssets.home_equity : raw.home_equity,
      ),
      retirement_tax_deferred: {
        ...retirement,
        confidence: retirement.cents > 0 ? "needs_review" : retirement.confidence,
      },
      retirement_tax_free: legacyMoney(oldAssets.retirement_tax_free),
    } as RunwayAssets,
    housing_tenure:
      raw.schema_version === 3 &&
      ["rent", "own", "other"].includes(String(raw.housing_tenure))
        ? (raw.housing_tenure as HousingTenure)
        : null,
    expense_mode:
      raw.schema_version === 3 && raw.expense_mode === "guided"
        ? "guided"
        : "quick",
    expense_items:
      raw.schema_version === 3 && Array.isArray(raw.expense_items)
        ? (raw.expense_items as Array<Record<string, unknown>>).map((item) => {
            const category = EXPENSE_CATEGORIES.includes(
              item.category as ExpenseCategory,
            )
              ? (item.category as ExpenseCategory)
              : "other";
            const fallback = EXPENSE_ITEM_TYPES[category][0] ?? "other_commitment";
            return {
              ...item,
              category,
              type: isExpenseItemType(item.type) ? item.type : fallback,
            } as ExpenseLineItem;
          })
        : [],
    completed_expense_categories:
      raw.schema_version === 3 && Array.isArray(raw.completed_expense_categories)
        ? (raw.completed_expense_categories as ExpenseCategory[])
        : [],
    expense_category_modes:
      raw.schema_version === 3 && Array.isArray(raw.expense_items)
        ? Object.fromEntries(
            (raw.expense_items as ExpenseLineItem[]).map((item) => [
              item.category,
              "itemized",
            ]),
          )
        : {},
    expense_category_subtotals: {},
    quick_expenses: {
      current_monthly_cents: current,
      interruption_monthly_cents: interruption,
      confidence: current > 0 ? "needs_review" : "skipped",
    },
    extreme_access: {
      illiquid_investments_cents: 0,
      retirement_tax_deferred_cents: 0,
      retirement_tax_free_cents: 0,
    },
    updated_at:
      typeof raw.updated_at === "string" ? raw.updated_at : now.toISOString(),
  };
  return validateCurrentRunwayAnswers(migrated, true);
}
