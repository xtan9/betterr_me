import {
  RUNWAY_MODEL_VERSION,
  expenseTotals,
  monthlyIncomeTotal,
  type RunwayScenario,
} from "@/lib/finance/cushion";
import type {
  HouseholdRunwayScenarioAssessment,
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";
import type { HouseholdRunwayReportPresentation } from "@/lib/finance/household-runway-interview-runtime";

export type { HouseholdRunwayReportPresentation } from "@/lib/finance/household-runway-interview-runtime";

interface HouseholdRunwayDownloadEnvironment {
  createBlob: (content: string) => Blob;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => {
    href: string;
    download: string;
    click: () => void;
  };
}

export type HouseholdRunwayDownloadResult =
  | { success: true }
  | { success: false; error: "download_failed"; cause: unknown };

const ADJUSTMENT_LINES = [
  ["Expense reduction", "expense_reduction_cents"],
  ["Added cash", "added_cash_cents"],
  ["Added monthly income", "added_monthly_income_cents"],
  ["Expected unconfirmed funds", "expected_unconfirmed_funds_cents"],
  [
    "Usable hard-to-withdraw investments",
    "usable_illiquid_investments_cents",
  ],
  [
    "Usable tax-deferred retirement",
    "usable_retirement_tax_deferred_cents",
  ],
  ["Usable tax-free retirement", "usable_retirement_tax_free_cents"],
] as const;

const REPORT_SCENARIO_ORDER: readonly RunwayScenario[] = [
  "mine_stops",
  "partner_stops",
  "both_stop",
];

function adviceLines(
  scenario: HouseholdRunwayScenarioAssessment,
  presentation: HouseholdRunwayReportPresentation,
): string[] {
  const advice = [
    scenario.advice.cashGapCents > 0
      ? presentation.formatCashTarget(
          scenario.advice.targetMonths,
          scenario.advice.cashGapCents,
        )
      : null,
    scenario.advice.largestReducibleCategory
      ? presentation.formatLargestReduction(
          scenario.advice.largestReducibleCategory.category,
          scenario.advice.largestReducibleCategory.reducible,
        )
      : null,
    presentation.precisionAdvice,
  ].filter((line): line is string => Boolean(line));

  return advice.slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
}

/**
 * Render one successful assessment without recalculating it. Scenario and
 * detail order are presentation contract, not an incidental array order.
 */
export function createHouseholdRunwayReport(
  assessment: SuccessfulHouseholdRunwayAssessment,
  presentation: HouseholdRunwayReportPresentation,
): string {
  const { answers } = assessment;
  const totals = expenseTotals(answers);
  const scenarioLines = [...assessment.scenarios]
    .sort(
      (left, right) =>
        REPORT_SCENARIO_ORDER.indexOf(left.scenario) -
        REPORT_SCENARIO_ORDER.indexOf(right.scenario),
    )
    .flatMap((scenario) => [
    `Scenario: ${presentation.formatScenario(scenario.scenario)}`,
    `Baseline: ${presentation.formatSimulation(scenario.baseline)}`,
    `Current lifestyle: ${presentation.formatSimulation(scenario.comparisons.currentLifestyle)}`,
    `Interruption plan: ${presentation.formatSimulation(scenario.comparisons.interruptionPlan)}`,
    `Extreme mode: ${presentation.formatSimulation(scenario.comparisons.extremeMode)}`,
    `Adjusted: ${presentation.formatSimulation(scenario.adjusted)}`,
    "Advice:",
    ...adviceLines(scenario, presentation),
    "",
  ]);

  return [
    "BetterR.me Household Runway",
    `Model: ${RUNWAY_MODEL_VERSION}`,
    `Location: ${presentation.location}`,
    `Cash: ${presentation.formatMoney(answers.available_cash.cents)}`,
    `Liquid investments: ${presentation.formatMoney(answers.assets.liquid_investments.cents)}`,
    `Continuing monthly income: ${presentation.formatMoney(monthlyIncomeTotal(answers))}`,
    `Current monthly expenses: ${presentation.formatMoney(totals.current)}`,
    `Interruption monthly expenses: ${presentation.formatMoney(totals.interruption)}`,
    "",
    "Scenarios",
    ...scenarioLines,
    "Adjustments",
    ...ADJUSTMENT_LINES.map(
      ([label, field]) =>
        `${label}: ${presentation.formatMoney(assessment.adjustments[field])}`,
    ),
    "",
    "Assumptions",
    "Easy-to-withdraw investments are included at 100%.",
    `Excluded assets: ${presentation.formatMoney(assessment.firstScenario.baseline.excluded_assets_cents)}`,
    "What-if changes stay out of the saved baseline until you explicitly apply them.",
    "",
    "Educational scenario estimate only; not tax, investment, legal, eligibility, or financial advice.",
  ].join("\n");
}

function browserDownloadEnvironment(): HouseholdRunwayDownloadEnvironment {
  return {
    createBlob: (content) =>
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
  };
}

/**
 * Download an already-computed assessment. Failures are returned to the caller
 * and never modify the assessment.
 */
export function downloadHouseholdRunwayAssessment(
  assessment: SuccessfulHouseholdRunwayAssessment,
  presentation: HouseholdRunwayReportPresentation,
  environment = browserDownloadEnvironment(),
): HouseholdRunwayDownloadResult {
  let objectUrl: string | null = null;
  try {
    const report = createHouseholdRunwayReport(assessment, presentation);
    const blob = environment.createBlob(report);
    objectUrl = environment.createObjectUrl(blob);
    const anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = "household-runway-plan.txt";
    anchor.click();
    return { success: true };
  } catch (cause) {
    return { success: false, error: "download_failed", cause };
  } finally {
    if (objectUrl) {
      try {
        environment.revokeObjectUrl(objectUrl);
      } catch {
        // The download has already been initiated; cleanup cannot change it.
      }
    }
  }
}
