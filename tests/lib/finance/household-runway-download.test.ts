import { describe, expect, it, vi } from "vitest";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  createHouseholdRunwayReport,
  downloadHouseholdRunwayAssessment,
  type HouseholdRunwayReportPresentation,
} from "@/lib/finance/household-runway-download";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwaySimulation,
} from "@/lib/finance/cushion";

function validAnswers(): HouseholdRunwayAnswers {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "CA";
  answers.mine = {
    ...answers.mine,
    monthly_take_home_cents: 800_000,
    entered_amount_cents: 800_000,
    entered_as: "net",
    net_amount_cents: 800_000,
    net_period: "monthly",
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.partner = {
    ...answers.mine,
    monthly_take_home_cents: 600_000,
    entered_amount_cents: 600_000,
    net_amount_cents: 600_000,
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: 900_000,
    interruption_monthly_cents: 600_000,
    confidence: "confirmed",
  };
  return answers;
}

const presentation: HouseholdRunwayReportPresentation = {
  location: "US · California",
  formatMoney: (cents) => `$${cents}`,
  formatScenario: (scenario) => `scenario:${scenario}`,
  formatSimulation: (simulation: RunwaySimulation) =>
    simulation.sustainable
      ? "sustainable"
      : `${simulation.months_covered?.toFixed(1)} months`,
  formatCashTarget: (months, cents) => `cash target ${months}: $${cents}`,
  formatLargestReduction: (category, cents) =>
    `largest ${category}: $${cents}`,
  precisionAdvice: "inputs confirmed",
};

describe("household runway downloads", () => {
  it("serializes every assessment result in stable scenario and detail order", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      adjustments: {
        added_cash_cents: 125_000,
        added_monthly_income_cents: 25_000,
      },
      startDate: new Date("2026-07-26T00:00:00.000Z"),
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;

    const report = createHouseholdRunwayReport(outcome, presentation);
    const firstScenario = outcome.firstScenario;
    const scenarioHeadings = [...report.matchAll(/^Scenario: (.+)$/gm)].map(
      ([, heading]) => heading,
    );

    expect(scenarioHeadings).toEqual([
      "scenario:mine_stops",
      "scenario:partner_stops",
      "scenario:both_stop",
    ]);
    expect(report).toContain(
      `Baseline: ${presentation.formatSimulation(firstScenario.baseline)}`,
    );
    expect(report).toContain(
      `Current lifestyle: ${presentation.formatSimulation(firstScenario.comparisons.currentLifestyle)}`,
    );
    expect(report).toContain(
      `Adjusted: ${presentation.formatSimulation(firstScenario.adjusted)}`,
    );
    const firstScenarioStart = report.indexOf(
      "Scenario: scenario:mine_stops",
    );
    const firstScenarioEnd = report.indexOf(
      "Scenario: scenario:partner_stops",
    );
    const firstScenarioReport = report.slice(
      firstScenarioStart,
      firstScenarioEnd,
    );
    const detailOffsets = [
      "Baseline:",
      "Current lifestyle:",
      "Interruption plan:",
      "Extreme mode:",
      "Adjusted:",
      "Advice:",
    ].map((label) => firstScenarioReport.indexOf(label));
    expect(detailOffsets.every((offset) => offset >= 0)).toBe(true);
    expect(detailOffsets).toEqual([...detailOffsets].sort((a, b) => a - b));

    const adjustmentOffsets = [
      "Expense reduction:",
      "Added cash:",
      "Added monthly income:",
      "Expected unconfirmed funds:",
      "Usable hard-to-withdraw investments:",
      "Usable tax-deferred retirement:",
      "Usable tax-free retirement:",
    ].map((label) => report.indexOf(label));
    expect(adjustmentOffsets.every((offset) => offset >= 0)).toBe(true);
    expect(adjustmentOffsets).toEqual(
      [...adjustmentOffsets].sort((a, b) => a - b),
    );
    expect(report).toContain("Added cash: $125000");
    expect(report).toContain("Added monthly income: $25000");
  });

  it("returns an explicit failure and leaves the assessment unchanged", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      startDate: new Date("2026-07-26T00:00:00.000Z"),
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    const before = structuredClone(outcome);
    const click = vi.fn();

    const result = downloadHouseholdRunwayAssessment(outcome, presentation, {
      createBlob: () => ({}) as Blob,
      createObjectUrl: () => {
        throw new Error("downloads disabled");
      },
      revokeObjectUrl: vi.fn(),
      createAnchor: () => ({ href: "", download: "", click }),
    });

    expect(result).toEqual({
      success: false,
      error: "download_failed",
      cause: expect.any(Error),
    });
    expect(click).not.toHaveBeenCalled();
    expect(outcome).toEqual(before);
  });

  it("uses canonical scenario order even when the assessment array is reordered", () => {
    const outcome = assessHouseholdRunway({
      answers: validAnswers(),
      startDate: new Date("2026-07-26T00:00:00.000Z"),
    });
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;

    const reordered = {
      ...outcome,
      scenarios: [...outcome.scenarios].reverse(),
    };
    const report = createHouseholdRunwayReport(reordered, presentation);
    const scenarioHeadings = [...report.matchAll(/^Scenario: (.+)$/gm)].map(
      ([, heading]) => heading,
    );

    expect(scenarioHeadings).toEqual([
      "scenario:mine_stops",
      "scenario:partner_stops",
      "scenario:both_stop",
    ]);
  });
});
