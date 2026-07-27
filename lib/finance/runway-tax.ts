export type TaxFilingStatus =
  | "single"
  | "married_joint"
  | "married_separate"
  | "head_household";

export interface TakeHomeEstimateBreakdown {
  annual_gross_cents: number;
  monthly_gross_cents: number;
  annual_federal_income_tax_cents: number;
  annual_state_income_tax_cents: number;
  annual_social_security_cents: number;
  annual_medicare_cents: number;
  annual_other_deductions_cents: number;
  annual_estimated_deductions_cents: number;
  monthly_estimated_deductions_cents: number;
  monthly_take_home_cents: number;
  federal_rule_version: string;
  state_rule_version: string;
  rule_version: string;
  state_is_rough_estimate: boolean;
}

const STANDARD_DEDUCTION_2026: Record<TaxFilingStatus, number> = {
  single: 16_100,
  married_joint: 32_200,
  married_separate: 16_100,
  head_household: 24_150,
};

const FEDERAL_BRACKETS_2026: Record<TaxFilingStatus, Array<[number, number]>> = {
  single: [[12_400, .10], [50_400, .12], [105_700, .22], [201_775, .24], [256_225, .32], [640_600, .35], [Infinity, .37]],
  married_joint: [[24_800, .10], [100_800, .12], [211_400, .22], [403_550, .24], [512_450, .32], [768_700, .35], [Infinity, .37]],
  married_separate: [[12_400, .10], [50_400, .12], [105_700, .22], [201_775, .24], [256_225, .32], [384_350, .35], [Infinity, .37]],
  head_household: [[17_700, .10], [67_450, .12], [105_700, .22], [201_750, .24], [256_200, .32], [640_600, .35], [Infinity, .37]],
};

const NO_STATE_INCOME_TAX = new Set(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);
const STATE_PLANNING_RATES: Record<string, number> = {
  CA: .06, NY: .055, NJ: .05, OR: .065, HI: .06, DC: .06,
  MA: .05, IL: .0495, PA: .0307, CO: .044, AZ: .025, NC: .0399,
  GA: .0519, MI: .0425, VA: .0475, MN: .055, WI: .05, MD: .05,
};

function progressiveTax(taxableIncome: number, brackets: Array<[number, number]>) {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upper) - lower) * rate;
    lower = upper;
  }
  return Math.max(0, tax);
}

function extraMedicareThreshold(status: TaxFilingStatus) {
  if (status === "married_joint") return 250_000;
  if (status === "married_separate") return 125_000;
  return 200_000;
}

export function estimateUsTakeHome(input: {
  annualGrossCents: number;
  region: string;
  filingStatus: TaxFilingStatus;
  selfEmployed?: boolean;
  annualOtherDeductionsCents?: number;
}): TakeHomeEstimateBreakdown {
  const annualGross = Math.max(0, input.annualGrossCents / 100);
  const otherDeductions = Math.max(0, (input.annualOtherDeductionsCents ?? 0) / 100);
  const payrollTaxable = input.selfEmployed ? annualGross * .9235 : annualGross;
  const socialSecurity = Math.min(payrollTaxable, 184_500) * (input.selfEmployed ? .124 : .062);
  const medicare = payrollTaxable * (input.selfEmployed ? .029 : .0145) +
    Math.max(0, payrollTaxable - extraMedicareThreshold(input.filingStatus)) * .009;
  const deductibleSelfEmploymentTax = input.selfEmployed ? (socialSecurity + medicare) / 2 : 0;
  const taxableIncome = Math.max(
    0,
    annualGross - STANDARD_DEDUCTION_2026[input.filingStatus] - otherDeductions - deductibleSelfEmploymentTax,
  );
  const federal = progressiveTax(taxableIncome, FEDERAL_BRACKETS_2026[input.filingStatus]);
  const stateRate = NO_STATE_INCOME_TAX.has(input.region)
    ? 0
    : (STATE_PLANNING_RATES[input.region] ?? .04);
  const state = Math.max(0, annualGross - STANDARD_DEDUCTION_2026[input.filingStatus]) * stateRate;
  const total = Math.min(annualGross, federal + state + socialSecurity + medicare + otherDeductions);
  return {
    annual_gross_cents: Math.round(annualGross * 100),
    monthly_gross_cents: Math.round((annualGross * 100) / 12),
    annual_federal_income_tax_cents: Math.round(federal * 100),
    annual_state_income_tax_cents: Math.round(state * 100),
    annual_social_security_cents: Math.round(socialSecurity * 100),
    annual_medicare_cents: Math.round(medicare * 100),
    annual_other_deductions_cents: Math.round(otherDeductions * 100),
    annual_estimated_deductions_cents: Math.round(total * 100),
    monthly_estimated_deductions_cents: Math.round((total * 100) / 12),
    monthly_take_home_cents: Math.max(0, Math.round(((annualGross - total) * 100) / 12)),
    federal_rule_version: "us-federal-2026.1",
    state_rule_version: `us-${input.region.toLowerCase()}-planning-2026.1`,
    rule_version: "take-home-us-2026.3",
    state_is_rough_estimate: !NO_STATE_INCOME_TAX.has(input.region),
  };
}

export function estimateRegionalTakeHome(input: {
  country: "CA" | "CN" | "TW";
  annualGrossCents: number;
  region: string;
}): TakeHomeEstimateBreakdown {
  const annualGross = Math.max(0, input.annualGrossCents / 100);
  const rate = input.country === "CA" ? (input.region === "QC" ? .32 : .285) : input.country === "CN" ? .20 : .14;
  const total = annualGross * rate;
  const empty = 0;
  return {
    annual_gross_cents: Math.round(annualGross * 100), monthly_gross_cents: Math.round(annualGross * 100 / 12),
    annual_federal_income_tax_cents: Math.round(total * 100), annual_state_income_tax_cents: empty,
    annual_social_security_cents: empty, annual_medicare_cents: empty, annual_other_deductions_cents: empty,
    annual_estimated_deductions_cents: Math.round(total * 100), monthly_estimated_deductions_cents: Math.round(total * 100 / 12),
    monthly_take_home_cents: Math.round((annualGross - total) * 100 / 12),
    federal_rule_version: `${input.country.toLowerCase()}-planning-2026.1`, state_rule_version: `${input.country.toLowerCase()}-${input.region.toLowerCase()}-planning-2026.1`,
    rule_version: `take-home-${input.country.toLowerCase()}-2026.3`, state_is_rough_estimate: true,
  };
}
