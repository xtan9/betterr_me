import { normalizeLegacyRegion } from "@/lib/finance/runway-regions";

export const RUNWAY_MODEL_VERSION = "3.0.0";
export const RUNWAY_DRAFT_VERSION = 3;
export const RUNWAY_DRAFT_STORAGE_KEY = "betterr.household-runway.v2";
export const RUNWAY_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const RUNWAY_STEP_IDS = [
  "location",
  "household",
  "employment",
  "myIncome",
  "partnerIncome",
  "otherIncome",
  "cash",
  "confirmedFunds",
  "assets",
  "expenses",
  "reductions",
  "temporaryIncome",
  "review",
  "result",
] as const;

const LEGACY_V2_STEP_IDS = [
  "welcome",
  ...RUNWAY_STEP_IDS.filter((step) => step !== "reductions"),
] as const;

export type RunwayStepId = (typeof RUNWAY_STEP_IDS)[number];
export type RunwayCountry = "US" | "CA" | "CN" | "TW";
export type RunwayCurrency = "USD" | "CAD" | "CNY" | "TWD";
export type EmploymentStatus =
  | "employed"
  | "self_employed"
  | "unemployed"
  | "not_working";
export type InputConfidence =
  | "confirmed"
  | "estimated"
  | "needs_review"
  | "skipped";
export type RunwayScenario =
  | "current"
  | "mine_stops"
  | "partner_stops"
  | "both_stop";
export type ExpenseFrequency = "monthly" | "quarterly" | "annual";
export type HousingTenure = "rent" | "own" | "other" | null;
export type ExpenseMode = "guided" | "quick";
export type RecurringIncomeType =
  | "rental_net"
  | "side_business"
  | "dividends_interest"
  | "support"
  | "pension_benefits"
  | "other";
export type ExpenseCategory =
  | "housing"
  | "utilities"
  | "transportation"
  | "food"
  | "healthcare"
  | "insurance"
  | "childcare"
  | "debt"
  | "support"
  | "other";

export const EXPENSE_CATEGORIES = [
  "housing",
  "utilities",
  "transportation",
  "food",
  "healthcare",
  "insurance",
  "childcare",
  "debt",
  "support",
  "other",
] as const satisfies readonly ExpenseCategory[];

export interface MoneyAnswer {
  cents: number;
  confidence: InputConfidence;
}

export interface TakeHomeEstimateBreakdown {
  annual_gross_cents: number;
  monthly_gross_cents: number;
  base_deduction_rate: number;
  regional_adjustment_rate: number;
  effective_deduction_rate: number;
  annual_estimated_deductions_cents: number;
  monthly_estimated_deductions_cents: number;
  monthly_take_home_cents: number;
  rule_version: string;
}

export interface IncomeAnswer {
  employment: EmploymentStatus;
  monthly_take_home_cents: number;
  estimated_monthly_take_home_cents: number;
  entered_amount_cents: number;
  entered_period: "monthly" | "annual";
  entered_as: "net" | "gross";
  take_home_source: "estimated" | "user_confirmed";
  confidence: InputConfidence;
  estimate_rule_version?: string;
  /** Retained in memory while migrating V2 drafts. */
  take_home_reviewed?: boolean;
}

export interface RecurringIncomeSource {
  id: string;
  type: RecurringIncomeType;
  label?: string;
  monthly_cents: number;
  confidence: InputConfidence;
}

export interface ConfirmedFund {
  id: string;
  amount_cents: number;
  arrives_month: number;
  confidence: "confirmed";
}

export interface RunwayAssets {
  liquid_investments: MoneyAnswer;
  illiquid_investments: MoneyAnswer;
  home_equity: MoneyAnswer;
  retirement_tax_deferred: MoneyAnswer;
  retirement_tax_free: MoneyAnswer;
}

export interface ExpenseLineItem {
  id: string;
  category: ExpenseCategory;
  type: string;
  label?: string;
  current_amount_cents: number;
  interruption_amount_cents: number;
  frequency: ExpenseFrequency;
  confidence: InputConfidence;
}

export interface QuickExpenses {
  current_monthly_cents: number;
  interruption_monthly_cents: number;
  confidence: InputConfidence;
}

export interface TemporaryIncome {
  monthly_cents: number;
  remaining_months: number;
  confidence: InputConfidence;
}

export interface ExtremeAccessAmounts {
  illiquid_investments_cents: number;
  retirement_tax_deferred_cents: number;
  retirement_tax_free_cents: number;
}

export interface HouseholdRunwayAnswers {
  schema_version: 3;
  country: RunwayCountry;
  region: string;
  currency: RunwayCurrency;
  shares_finances: boolean;
  has_children: boolean;
  has_support_obligations: boolean;
  mine: IncomeAnswer;
  partner: IncomeAnswer | null;
  other_income_sources: RecurringIncomeSource[];
  available_cash: MoneyAnswer;
  confirmed_funds: ConfirmedFund[];
  assets: RunwayAssets;
  housing_tenure: HousingTenure;
  expense_mode: ExpenseMode;
  expense_items: ExpenseLineItem[];
  completed_expense_categories: ExpenseCategory[];
  quick_expenses: QuickExpenses;
  temporary_income: TemporaryIncome | null;
  extreme_access: ExtremeAccessAmounts;
  updated_at: string;
}

export interface ScenarioOption {
  id: RunwayScenario;
  subject: "mine" | "partner" | "household";
}

export interface RunwayMonth {
  month: number;
  opening_balance_cents: number;
  continuing_income_cents: number;
  confirmed_funds_cents: number;
  temporary_income_cents: number;
  essential_outflow_cents: number;
  shortfall_cents: number;
  closing_balance_cents: number;
}

export interface RunwaySimulation {
  scenario: RunwayScenario;
  sustainable: boolean;
  months_covered: number | null;
  depletion_date: string | null;
  starting_resources_cents: number;
  continuing_monthly_income_cents: number;
  interruption_expenses_cents: number;
  current_expenses_cents: number;
  reducible_expenses_cents: number;
  excluded_assets_cents: number;
  months: RunwayMonth[];
  confidence: "complete" | "estimated" | "needs_review";
}

export interface RunwayAdjustments {
  expense_reduction_cents: number;
  added_cash_cents: number;
  added_monthly_income_cents: number;
  expected_unconfirmed_funds_cents: number;
  usable_illiquid_investments_cents: number;
  usable_retirement_tax_deferred_cents: number;
  usable_retirement_tax_free_cents: number;
}

const ZERO_MONEY: MoneyAnswer = { cents: 0, confidence: "skipped" };

function defaultIncome(): IncomeAnswer {
  return {
    employment: "employed",
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    entered_period: "annual",
    entered_as: "gross",
    take_home_source: "estimated",
    confidence: "estimated",
  };
}

export function createDefaultRunwayAnswers(
  now = new Date(),
): HouseholdRunwayAnswers {
  return {
    schema_version: 3,
    country: "US",
    region: "",
    currency: "USD",
    shares_finances: false,
    has_children: false,
    has_support_obligations: false,
    mine: defaultIncome(),
    partner: null,
    other_income_sources: [],
    available_cash: { ...ZERO_MONEY },
    confirmed_funds: [],
    assets: {
      liquid_investments: { ...ZERO_MONEY },
      illiquid_investments: { ...ZERO_MONEY },
      home_equity: { ...ZERO_MONEY },
      retirement_tax_deferred: { ...ZERO_MONEY },
      retirement_tax_free: { ...ZERO_MONEY },
    },
    housing_tenure: null,
    expense_mode: "guided",
    expense_items: [],
    completed_expense_categories: [],
    quick_expenses: {
      current_monthly_cents: 0,
      interruption_monthly_cents: 0,
      confidence: "skipped",
    },
    temporary_income: null,
    extreme_access: {
      illiquid_investments_cents: 0,
      retirement_tax_deferred_cents: 0,
      retirement_tax_free_cents: 0,
    },
    updated_at: now.toISOString(),
  };
}

export function currencyForCountry(country: RunwayCountry): RunwayCurrency {
  return { US: "USD", CA: "CAD", CN: "CNY", TW: "TWD" }[country] as RunwayCurrency;
}

const NO_STATE_INCOME_TAX = new Set([
  "AK",
  "FL",
  "NV",
  "NH",
  "SD",
  "TN",
  "TX",
  "WA",
  "WY",
]);
const HIGH_STATE_TAX = new Set(["CA", "DC", "HI", "NJ", "NY", "OR"]);

export function estimateMonthlyTakeHome(input: {
  country: RunwayCountry;
  region: string;
  amountCents: number;
  period: "monthly" | "annual";
}): TakeHomeEstimateBreakdown {
  const annualGrossCents =
    input.period === "annual" ? input.amountCents : input.amountCents * 12;
  const annualGross = annualGrossCents / 100;
  const brackets: Record<RunwayCountry, Array<[number, number]>> = {
    US: [
      [60_000, 0.2],
      [150_000, 0.28],
      [Number.POSITIVE_INFINITY, 0.34],
    ],
    CA: [
      [70_000, 0.22],
      [160_000, 0.3],
      [Number.POSITIVE_INFINITY, 0.36],
    ],
    CN: [
      [200_000, 0.15],
      [500_000, 0.22],
      [Number.POSITIVE_INFINITY, 0.28],
    ],
    TW: [
      [1_000_000, 0.1],
      [2_500_000, 0.16],
      [Number.POSITIVE_INFINITY, 0.22],
    ],
  };
  const baseRate =
    brackets[input.country].find(([limit]) => annualGross <= limit)?.[1] ?? 0.25;
  let regionAdjustment = 0;
  if (input.country === "US") {
    regionAdjustment = NO_STATE_INCOME_TAX.has(input.region)
      ? 0
      : HIGH_STATE_TAX.has(input.region)
        ? 0.05
        : 0.03;
  } else if (input.country === "CA") {
    regionAdjustment = input.region === "QC" ? 0.04 : 0.025;
  }
  const effectiveRate = Math.min(0.5, baseRate + regionAdjustment);
  const annualDeductions = Math.round(annualGrossCents * effectiveRate);
  const monthlyGross = Math.round(annualGrossCents / 12);
  const monthlyDeductions = Math.round(annualDeductions / 12);
  return {
    annual_gross_cents: annualGrossCents,
    monthly_gross_cents: monthlyGross,
    base_deduction_rate: baseRate,
    regional_adjustment_rate: regionAdjustment,
    effective_deduction_rate: effectiveRate,
    annual_estimated_deductions_cents: annualDeductions,
    monthly_estimated_deductions_cents: monthlyDeductions,
    monthly_take_home_cents: Math.max(0, monthlyGross - monthlyDeductions),
    rule_version: `take-home-${input.country.toLowerCase()}-2026.2`,
  };
}

function hasIncome(income: IncomeAnswer | null) {
  return Boolean(
    income &&
      (income.employment === "employed" || income.employment === "self_employed") &&
      income.monthly_take_home_cents > 0,
  );
}

export function availableScenarios(
  answers: HouseholdRunwayAnswers,
): ScenarioOption[] {
  const mineWorking = hasIncome(answers.mine);
  const partnerWorking = hasIncome(answers.partner);
  if (!answers.partner)
    return [{ id: mineWorking ? "mine_stops" : "current", subject: "mine" }];
  if (mineWorking && partnerWorking)
    return [
      { id: "mine_stops", subject: "mine" },
      { id: "partner_stops", subject: "partner" },
      { id: "both_stop", subject: "household" },
    ];
  if (mineWorking || partnerWorking)
    return [
      { id: "current", subject: mineWorking ? "partner" : "mine" },
      { id: "both_stop", subject: "household" },
    ];
  return [{ id: "current", subject: "household" }];
}

export function monthlyIncomeTotal(answers: HouseholdRunwayAnswers) {
  return answers.other_income_sources.reduce(
    (sum, source) => sum + source.monthly_cents,
    0,
  );
}

function incomeForScenario(
  answers: HouseholdRunwayAnswers,
  scenario: RunwayScenario,
) {
  const mine = hasIncome(answers.mine) ? answers.mine.monthly_take_home_cents : 0;
  const partner = hasIncome(answers.partner)
    ? answers.partner!.monthly_take_home_cents
    : 0;
  const other = monthlyIncomeTotal(answers);
  if (scenario === "mine_stops") return partner + other;
  if (scenario === "partner_stops") return mine + other;
  if (scenario === "both_stop") return other;
  return mine + partner + other;
}

export function normalizeExpenseToMonthly(
  amountCents: number,
  frequency: ExpenseFrequency,
) {
  if (frequency === "annual") return Math.round(amountCents / 12);
  if (frequency === "quarterly") return Math.round(amountCents / 3);
  return amountCents;
}

export function expenseTotals(answers: HouseholdRunwayAnswers) {
  if (answers.expense_mode === "quick") {
    return {
      current: answers.quick_expenses.current_monthly_cents,
      interruption: answers.quick_expenses.interruption_monthly_cents,
    };
  }
  return answers.expense_items.reduce(
    (totals, item) => ({
      current:
        totals.current +
        normalizeExpenseToMonthly(item.current_amount_cents, item.frequency),
      interruption:
        totals.interruption +
        normalizeExpenseToMonthly(
          item.interruption_amount_cents,
          item.frequency,
        ),
    }),
    { current: 0, interruption: 0 },
  );
}

export function expenseCategoryTotals(
  answers: HouseholdRunwayAnswers,
  category: ExpenseCategory,
) {
  if (answers.expense_mode === "quick")
    return category === "other" ? expenseTotals(answers) : { current: 0, interruption: 0 };
  return answers.expense_items
    .filter((item) => item.category === category)
    .reduce(
      (totals, item) => ({
        current:
          totals.current +
          normalizeExpenseToMonthly(item.current_amount_cents, item.frequency),
        interruption:
          totals.interruption +
          normalizeExpenseToMonthly(item.interruption_amount_cents, item.frequency),
      }),
      { current: 0, interruption: 0 },
    );
}

function addMonthsFraction(start: Date, months: number) {
  const whole = Math.floor(months);
  const fraction = months - whole;
  const result = new Date(start);
  result.setMonth(result.getMonth() + whole);
  result.setDate(result.getDate() + Math.round(fraction * 30.4375));
  return result.toISOString().slice(0, 10);
}

function confidenceForAnswers(
  answers: HouseholdRunwayAnswers,
  essential: number,
) {
  const expenseConfidence =
    answers.expense_mode === "quick"
      ? answers.quick_expenses.confidence
      : answers.expense_items.some((item) => item.confidence === "needs_review")
        ? "needs_review"
        : answers.expense_items.some((item) => item.confidence === "estimated")
          ? "estimated"
          : "confirmed";
  const values: InputConfidence[] = [
    answers.available_cash.confidence,
    answers.mine.confidence,
    answers.partner?.confidence ?? "confirmed",
    expenseConfidence,
    ...answers.other_income_sources.map((source) => source.confidence),
  ];
  if (
    essential <= 0 ||
    !answers.region ||
    values.includes("needs_review") ||
    answers.available_cash.confidence === "skipped"
  )
    return "needs_review" as const;
  return values.includes("estimated") || values.includes("skipped")
    ? ("estimated" as const)
    : ("complete" as const);
}

export function simulateHouseholdRunway(
  answers: HouseholdRunwayAnswers,
  scenario: RunwayScenario,
  adjustments?: Partial<RunwayAdjustments>,
  startDate = new Date(),
): RunwaySimulation {
  const adjust: RunwayAdjustments = {
    expense_reduction_cents: 0,
    added_cash_cents: 0,
    added_monthly_income_cents: 0,
    expected_unconfirmed_funds_cents: 0,
    usable_illiquid_investments_cents: 0,
    usable_retirement_tax_deferred_cents: 0,
    usable_retirement_tax_free_cents: 0,
    ...adjustments,
  };
  const totals = expenseTotals(answers);
  const essential = Math.max(
    0,
    totals.interruption - adjust.expense_reduction_cents,
  );
  const usableIlliquid = Math.min(
    answers.assets.illiquid_investments.cents,
    Math.max(0, adjust.usable_illiquid_investments_cents),
  );
  const usableDeferred = Math.min(
    answers.assets.retirement_tax_deferred.cents,
    Math.max(0, adjust.usable_retirement_tax_deferred_cents),
  );
  const usableTaxFree = Math.min(
    answers.assets.retirement_tax_free.cents,
    Math.max(0, adjust.usable_retirement_tax_free_cents),
  );
  const startingResources =
    answers.available_cash.cents +
    answers.assets.liquid_investments.cents +
    adjust.added_cash_cents +
    usableIlliquid +
    usableDeferred +
    usableTaxFree;
  const continuingIncome =
    incomeForScenario(answers, scenario) + adjust.added_monthly_income_cents;
  const excludedAssets =
    answers.assets.home_equity.cents +
    Math.max(0, answers.assets.illiquid_investments.cents - usableIlliquid) +
    Math.max(
      0,
      answers.assets.retirement_tax_deferred.cents - usableDeferred,
    ) +
    Math.max(0, answers.assets.retirement_tax_free.cents - usableTaxFree);
  const months: RunwayMonth[] = [];
  let balance = startingResources;
  let monthsCovered: number | null = null;
  const sustainableWithoutTemporary =
    essential === 0 || continuingIncome >= essential;

  for (let month = 1; month <= 120; month += 1) {
    const opening = balance;
    const confirmedFunds =
      answers.confirmed_funds
        .filter((fund) => fund.arrives_month === month)
        .reduce((sum, fund) => sum + fund.amount_cents, 0) +
      (month === 1 ? adjust.expected_unconfirmed_funds_cents : 0);
    const temporaryIncome =
      answers.temporary_income &&
      month <= answers.temporary_income.remaining_months
        ? answers.temporary_income.monthly_cents
        : 0;
    const available =
      opening + continuingIncome + confirmedFunds + temporaryIncome;
    const closing = available - essential;
    months.push({
      month,
      opening_balance_cents: opening,
      continuing_income_cents: continuingIncome,
      confirmed_funds_cents: confirmedFunds,
      temporary_income_cents: temporaryIncome,
      essential_outflow_cents: essential,
      shortfall_cents: Math.max(
        0,
        essential - continuingIncome - temporaryIncome,
      ),
      closing_balance_cents: Math.max(0, closing),
    });
    if (essential > 0 && closing < 0) {
      const monthlyShortfall = Math.max(
        1,
        essential - continuingIncome - temporaryIncome,
      );
      monthsCovered =
        month -
        1 +
        Math.min(1, Math.max(0, (opening + confirmedFunds) / monthlyShortfall));
      break;
    }
    balance = Math.max(0, closing);
  }

  return {
    scenario,
    sustainable: sustainableWithoutTemporary,
    months_covered: sustainableWithoutTemporary ? null : (monthsCovered ?? 120),
    depletion_date:
      sustainableWithoutTemporary || monthsCovered === null
        ? null
        : addMonthsFraction(startDate, monthsCovered),
    starting_resources_cents: startingResources,
    continuing_monthly_income_cents: continuingIncome,
    interruption_expenses_cents: essential,
    current_expenses_cents: totals.current,
    reducible_expenses_cents: Math.max(0, totals.current - totals.interruption),
    excluded_assets_cents: excludedAssets,
    months,
    confidence: confidenceForAnswers(answers, essential),
  };
}

export function highestLeverageActions(
  answers: HouseholdRunwayAnswers,
  simulation: RunwaySimulation,
) {
  const largest = EXPENSE_CATEGORIES.map((category) => {
    const totals = expenseCategoryTotals(answers, category);
    return { category, reducible: totals.current - totals.interruption };
  }).sort((a, b) => b.reducible - a.reducible)[0];
  const monthlyBurn = Math.max(
    0,
    simulation.interruption_expenses_cents -
      simulation.continuing_monthly_income_cents,
  );
  const target =
    simulation.months_covered !== null && simulation.months_covered < 3 ? 3 : 6;
  return {
    largestReducibleCategory: largest?.reducible > 0 ? largest : null,
    targetMonths: target,
    cashGapCents: Math.max(
      0,
      monthlyBurn * target - simulation.starting_resources_cents,
    ),
  };
}

function legacyIncome(value: unknown): IncomeAnswer {
  const income = (value ?? {}) as Record<string, unknown>;
  const monthly = Number(income.monthly_take_home_cents) || 0;
  const enteredAs = income.entered_as === "net" ? "net" : "gross";
  const reviewed = Boolean(income.take_home_reviewed);
  return {
    employment: (["employed", "self_employed", "unemployed", "not_working"].includes(
      String(income.employment),
    )
      ? income.employment
      : "employed") as EmploymentStatus,
    monthly_take_home_cents: monthly,
    estimated_monthly_take_home_cents: enteredAs === "gross" ? monthly : 0,
    entered_amount_cents: Number(income.entered_amount_cents) || 0,
    entered_period: income.entered_period === "monthly" ? "monthly" : "annual",
    entered_as: enteredAs,
    take_home_source:
      enteredAs === "net" || reviewed ? "user_confirmed" : "estimated",
    confidence: (income.confidence as InputConfidence) ?? "estimated",
    estimate_rule_version:
      typeof income.estimate_rule_version === "string"
        ? income.estimate_rule_version
        : undefined,
  };
}

function legacyMoney(value: unknown): MoneyAnswer {
  const money = (value ?? {}) as Record<string, unknown>;
  return {
    cents: Number(money.cents) || 0,
    confidence: (money.confidence as InputConfidence) ?? "skipped",
  };
}

export function migrateRunwayAnswers(
  value: unknown,
  now = new Date(),
): HouseholdRunwayAnswers | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schema_version === 3) return raw as unknown as HouseholdRunwayAnswers;
  if (raw.schema_version !== 2) return null;
  const country = (["US", "CA", "CN", "TW"].includes(String(raw.country))
    ? raw.country
    : "US") as RunwayCountry;
  const legacyExpenses = (raw.expenses ?? {}) as Record<
    string,
    { current_cents?: number; interruption_cents?: number; confidence?: InputConfidence }
  >;
  const current = Object.values(legacyExpenses).reduce(
    (sum, item) => sum + (Number(item.current_cents) || 0),
    0,
  );
  const interruption = Object.values(legacyExpenses).reduce(
    (sum, item) => sum + (Number(item.interruption_cents) || 0),
    0,
  );
  const other = legacyMoney(raw.other_monthly_income);
  const retirement = legacyMoney(raw.retirement_accounts);
  return {
    ...createDefaultRunwayAnswers(now),
    country,
    region: normalizeLegacyRegion(country, String(raw.region ?? "")),
    currency: currencyForCountry(country),
    shares_finances: Boolean(raw.shares_finances),
    has_children: Boolean(raw.has_children),
    has_support_obligations: Boolean(raw.has_support_obligations),
    mine: legacyIncome(raw.mine),
    partner: raw.partner ? legacyIncome(raw.partner) : null,
    other_income_sources:
      other.cents > 0
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
    confirmed_funds: Array.isArray(raw.confirmed_funds)
      ? (raw.confirmed_funds as ConfirmedFund[])
      : [],
    assets: {
      liquid_investments: legacyMoney(raw.taxable_investments),
      illiquid_investments: { ...ZERO_MONEY },
      home_equity: legacyMoney(raw.home_equity),
      retirement_tax_deferred: {
        ...retirement,
        confidence: retirement.cents > 0 ? "needs_review" : retirement.confidence,
      },
      retirement_tax_free: { ...ZERO_MONEY },
    },
    expense_mode: "quick",
    quick_expenses: {
      current_monthly_cents: current,
      interruption_monthly_cents: interruption,
      confidence: current > 0 ? "needs_review" : "skipped",
    },
    temporary_income: raw.temporary_income as TemporaryIncome | null,
    updated_at:
      typeof raw.updated_at === "string" ? raw.updated_at : now.toISOString(),
  };
}

export interface RunwayDraftEnvelope {
  version: 3;
  expires_at: string;
  step_id: RunwayStepId;
  completed: boolean;
  answers: HouseholdRunwayAnswers;
}

export function createDraftEnvelope(
  answers: HouseholdRunwayAnswers,
  stepId: RunwayStepId,
  completed: boolean,
  now = new Date(),
): RunwayDraftEnvelope {
  return {
    version: RUNWAY_DRAFT_VERSION,
    expires_at: new Date(now.getTime() + RUNWAY_DRAFT_TTL_MS).toISOString(),
    step_id: stepId,
    completed,
    answers,
  };
}

export function parseDraftEnvelope(
  raw: string | null,
  now = new Date(),
): RunwayDraftEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (new Date(String(parsed.expires_at)) <= now) return null;
    if (parsed.version === 3) {
      const answers = migrateRunwayAnswers(parsed.answers, now);
      const stepId = parsed.step_id as RunwayStepId;
      if (!answers || !RUNWAY_STEP_IDS.includes(stepId)) return null;
      return {
        version: 3,
        expires_at: String(parsed.expires_at),
        step_id: stepId,
        completed: Boolean(parsed.completed),
        answers,
      };
    }
    if (parsed.version === 2) {
      const answers = migrateRunwayAnswers(parsed.answers, now);
      if (!answers) return null;
      const legacyStep = Number(parsed.step) || 0;
      const legacyId = LEGACY_V2_STEP_IDS[
        Math.min(legacyStep, LEGACY_V2_STEP_IDS.length - 1)
      ];
      const stepId: RunwayStepId =
        legacyId === "welcome" ? "location" : legacyId;
      return {
        version: 3,
        expires_at: String(parsed.expires_at),
        step_id: stepId,
        completed: Boolean(parsed.completed),
        answers,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Legacy V1 compatibility retained for deployed API records and migrations. */
export type CushionPlanningState = "urgent" | "building" | "stronger";
export interface CushionInputs {
  liquid_resources_cents: number;
  monthly_essential_expenses_cents: number;
  monthly_continuing_income_cents: number;
}
export interface CushionCalculation {
  monthly_shortfall_cents: number;
  months_covered: number | null;
  planning_state: CushionPlanningState;
}
export interface FinanceCushionRecord extends CushionInputs {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  answers?: unknown;
  latest_result?: RunwaySimulation | null;
  model_version?: string;
  status?: string;
}
export type FinanceCushionView = Omit<FinanceCushionRecord, "answers"> & {
  answers: HouseholdRunwayAnswers | null;
  calculation: CushionCalculation;
};
export const FINANCE_CUSHION_COLUMNS =
  "id, user_id, liquid_resources_cents, monthly_essential_expenses_cents, monthly_continuing_income_cents, answers, latest_result, model_version, status, created_at, updated_at";
export function calculateCushion(inputs: CushionInputs): CushionCalculation {
  const shortfall = Math.max(
    inputs.monthly_essential_expenses_cents -
      inputs.monthly_continuing_income_cents,
    0,
  );
  if (shortfall === 0)
    return {
      monthly_shortfall_cents: 0,
      months_covered: null,
      planning_state: "stronger",
    };
  const months =
    Math.floor((inputs.liquid_resources_cents / shortfall) * 100) / 100;
  return {
    monthly_shortfall_cents: shortfall,
    months_covered: months,
    planning_state:
      months < 3 ? "urgent" : months < 6 ? "building" : "stronger",
  };
}
export function toFinanceCushionView(
  record: FinanceCushionRecord,
): FinanceCushionView {
  return {
    ...record,
    answers: migrateRunwayAnswers(record.answers),
    calculation: calculateCushion(record),
  };
}
export function parseDollarsToCents(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export function formatCents(
  cents: number,
  locale = "en-US",
  currency?: RunwayCurrency,
): string {
  return new Intl.NumberFormat(
    locale,
    currency
      ? { style: "currency", currency, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(cents / 100);
}
