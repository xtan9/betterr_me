export const RUNWAY_MODEL_VERSION = "2.0.0";
export const RUNWAY_DRAFT_VERSION = 2;
export const RUNWAY_DRAFT_STORAGE_KEY = "betterr.household-runway.v2";
export const RUNWAY_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RunwayCountry = "US" | "CA" | "CN" | "TW";
export type RunwayCurrency = "USD" | "CAD" | "CNY" | "TWD";
export type EmploymentStatus =
  | "employed"
  | "self_employed"
  | "unemployed"
  | "not_working";
export type InputConfidence = "confirmed" | "estimated" | "skipped";
export type RunwayScenario =
  | "current"
  | "mine_stops"
  | "partner_stops"
  | "both_stop";
export type ExpenseCategory =
  | "housing"
  | "healthcare"
  | "debt"
  | "food"
  | "transportation"
  | "childcare"
  | "support"
  | "insurance"
  | "other";

export interface MoneyAnswer {
  cents: number;
  confidence: InputConfidence;
}

export interface IncomeAnswer {
  employment: EmploymentStatus;
  monthly_take_home_cents: number;
  entered_amount_cents: number;
  entered_period: "monthly" | "annual";
  entered_as: "net" | "gross";
  confidence: InputConfidence;
  take_home_reviewed: boolean;
  estimate_rule_version?: string;
}

export interface ExpenseAnswer {
  current_cents: number;
  interruption_cents: number;
  confidence: InputConfidence;
}

export interface ConfirmedFund {
  id: string;
  amount_cents: number;
  arrives_month: number;
  confidence: "confirmed";
}

export interface TemporaryIncome {
  monthly_cents: number;
  remaining_months: number;
  confidence: InputConfidence;
}

export interface HouseholdRunwayAnswers {
  schema_version: 2;
  country: RunwayCountry;
  region: string;
  currency: RunwayCurrency;
  shares_finances: boolean;
  has_children: boolean;
  has_support_obligations: boolean;
  mine: IncomeAnswer;
  partner: IncomeAnswer | null;
  other_monthly_income: MoneyAnswer;
  available_cash: MoneyAnswer;
  confirmed_funds: ConfirmedFund[];
  taxable_investments: MoneyAnswer;
  investment_access_percent: number;
  retirement_accounts: MoneyAnswer;
  home_equity: MoneyAnswer;
  expenses: Record<ExpenseCategory, ExpenseAnswer>;
  temporary_income: TemporaryIncome | null;
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
  investment_access_percent: number;
  expected_unconfirmed_funds_cents: number;
  include_retirement: boolean;
}

const ZERO_MONEY: MoneyAnswer = { cents: 0, confidence: "skipped" };
const EMPTY_EXPENSE: ExpenseAnswer = {
  current_cents: 0,
  interruption_cents: 0,
  confidence: "skipped",
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "housing",
  "healthcare",
  "debt",
  "food",
  "transportation",
  "childcare",
  "support",
  "insurance",
  "other",
];

export function createDefaultRunwayAnswers(
  now = new Date(),
): HouseholdRunwayAnswers {
  return {
    schema_version: 2,
    country: "US",
    region: "",
    currency: "USD",
    shares_finances: false,
    has_children: false,
    has_support_obligations: false,
    mine: {
      employment: "employed",
      monthly_take_home_cents: 0,
      entered_amount_cents: 0,
      entered_period: "annual",
      entered_as: "gross",
      confidence: "estimated",
      take_home_reviewed: false,
    },
    partner: null,
    other_monthly_income: { ...ZERO_MONEY },
    available_cash: { ...ZERO_MONEY },
    confirmed_funds: [],
    taxable_investments: { ...ZERO_MONEY },
    investment_access_percent: 70,
    retirement_accounts: { ...ZERO_MONEY },
    home_equity: { ...ZERO_MONEY },
    expenses: Object.fromEntries(
      EXPENSE_CATEGORIES.map((category) => [category, { ...EMPTY_EXPENSE }]),
    ) as Record<ExpenseCategory, ExpenseAnswer>,
    temporary_income: null,
    updated_at: now.toISOString(),
  };
}

export function currencyForCountry(country: RunwayCountry): RunwayCurrency {
  return { US: "USD", CA: "CAD", CN: "CNY", TW: "TWD" }[
    country
  ] as RunwayCurrency;
}

export function estimateMonthlyTakeHome(input: {
  country: RunwayCountry;
  region: string;
  amountCents: number;
  period: "monthly" | "annual";
}): {
  monthlyTakeHomeCents: number;
  ruleVersion: string;
  effectiveRate: number;
} {
  const annual =
    input.period === "annual" ? input.amountCents : input.amountCents * 12;
  const currencyAnnual = annual / 100;
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
    brackets[input.country].find(([limit]) => currencyAnnual <= limit)?.[1] ??
    0.25;
  const regionAdjustment =
    input.country === "US" || input.country === "CA"
      ? Math.min(0.06, Math.max(0, input.region.trim() ? 0.025 : 0))
      : 0;
  const effectiveRate = Math.min(0.5, baseRate + regionAdjustment);
  return {
    monthlyTakeHomeCents: Math.max(
      0,
      Math.round((annual * (1 - effectiveRate)) / 12),
    ),
    ruleVersion: `take-home-${input.country.toLowerCase()}-2026.1`,
    effectiveRate,
  };
}

function hasIncome(income: IncomeAnswer | null) {
  return Boolean(
    income &&
      (income.employment === "employed" ||
        income.employment === "self_employed") &&
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
  if (mineWorking && partnerWorking) {
    return [
      { id: "mine_stops", subject: "mine" },
      { id: "partner_stops", subject: "partner" },
      { id: "both_stop", subject: "household" },
    ];
  }
  if (mineWorking || partnerWorking) {
    return [
      { id: "current", subject: mineWorking ? "partner" : "mine" },
      { id: "both_stop", subject: "household" },
    ];
  }
  return [{ id: "current", subject: "household" }];
}

function incomeForScenario(
  answers: HouseholdRunwayAnswers,
  scenario: RunwayScenario,
) {
  const mine = hasIncome(answers.mine)
    ? answers.mine.monthly_take_home_cents
    : 0;
  const partner = hasIncome(answers.partner)
    ? answers.partner!.monthly_take_home_cents
    : 0;
  const other = answers.other_monthly_income.cents;
  if (scenario === "mine_stops") return partner + other;
  if (scenario === "partner_stops") return mine + other;
  if (scenario === "both_stop") return other;
  return mine + partner + other;
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
  if (
    essential <= 0 ||
    answers.available_cash.confidence === "skipped" ||
    !answers.region.trim()
  )
    return "needs_review" as const;
  const values: InputConfidence[] = [
    answers.available_cash.confidence,
    answers.mine.confidence,
    answers.partner?.confidence ?? "confirmed",
    answers.other_monthly_income.confidence,
    ...EXPENSE_CATEGORIES.map(
      (category) => answers.expenses[category].confidence,
    ),
  ];
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
    investment_access_percent: answers.investment_access_percent,
    expected_unconfirmed_funds_cents: 0,
    include_retirement: false,
    ...adjustments,
  };
  const currentExpenses = EXPENSE_CATEGORIES.reduce(
    (sum, key) => sum + answers.expenses[key].current_cents,
    0,
  );
  const baseEssential = EXPENSE_CATEGORIES.reduce(
    (sum, key) => sum + answers.expenses[key].interruption_cents,
    0,
  );
  const essential = Math.max(0, baseEssential - adjust.expense_reduction_cents);
  const investmentResources = Math.round(
    (answers.taxable_investments.cents * adjust.investment_access_percent) /
      100,
  );
  const retirementResources = adjust.include_retirement
    ? Math.round(answers.retirement_accounts.cents * 0.7)
    : 0;
  const startingResources =
    answers.available_cash.cents +
    investmentResources +
    retirementResources +
    adjust.added_cash_cents;
  const continuingIncome =
    incomeForScenario(answers, scenario) + adjust.added_monthly_income_cents;
  const excludedAssets =
    answers.home_equity.cents +
    (adjust.include_retirement ? 0 : answers.retirement_accounts.cents) +
    Math.max(0, answers.taxable_investments.cents - investmentResources);
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
    current_expenses_cents: currentExpenses,
    reducible_expenses_cents: Math.max(0, currentExpenses - baseEssential),
    excluded_assets_cents: excludedAssets,
    months,
    confidence: confidenceForAnswers(answers, essential),
  };
}

export function highestLeverageActions(
  answers: HouseholdRunwayAnswers,
  simulation: RunwaySimulation,
) {
  const largest = EXPENSE_CATEGORIES.map((category) => ({
    category,
    reducible:
      answers.expenses[category].current_cents -
      answers.expenses[category].interruption_cents,
  })).sort((a, b) => b.reducible - a.reducible)[0];
  const monthlyBurn = Math.max(
    0,
    simulation.interruption_expenses_cents -
      simulation.continuing_monthly_income_cents,
  );
  const target =
    simulation.months_covered !== null && simulation.months_covered < 3 ? 3 : 6;
  const cashGap = Math.max(
    0,
    monthlyBurn * target - simulation.starting_resources_cents,
  );
  return {
    largestReducibleCategory: largest?.reducible > 0 ? largest : null,
    targetMonths: target,
    cashGapCents: cashGap,
  };
}

export interface RunwayDraftEnvelope {
  version: 2;
  expires_at: string;
  step: number;
  completed: boolean;
  answers: HouseholdRunwayAnswers;
}

export function createDraftEnvelope(
  answers: HouseholdRunwayAnswers,
  step: number,
  completed: boolean,
  now = new Date(),
): RunwayDraftEnvelope {
  return {
    version: RUNWAY_DRAFT_VERSION,
    expires_at: new Date(now.getTime() + RUNWAY_DRAFT_TTL_MS).toISOString(),
    step,
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
    const parsed = JSON.parse(raw) as RunwayDraftEnvelope;
    if (
      parsed.version !== RUNWAY_DRAFT_VERSION ||
      !parsed.answers ||
      new Date(parsed.expires_at) <= now
    )
      return null;
    return parsed;
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
  answers?: HouseholdRunwayAnswers | null;
  latest_result?: RunwaySimulation | null;
  model_version?: string;
  status?: string;
}
export type FinanceCushionView = FinanceCushionRecord & {
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
  return { ...record, calculation: calculateCushion(record) };
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
