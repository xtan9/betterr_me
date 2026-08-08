import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import { createHouseholdRunwayInterviewRuntime } from "@/lib/finance/household-runway-interview-runtime";
import {
  createHouseholdRunwayInterviewRuntimeWithCapabilities as createSeededRuntime,
} from "@/lib/finance/internal/household-runway-interview-runtime";

const now = "2026-08-03T15:00:00.000Z";

function driveToReview(
  runtime: ReturnType<typeof createHouseholdRunwayInterviewRuntime>,
) {
  runtime.send({ type: "select_country", country: "US" });
  runtime.send({ type: "select_region", region: "CA" });
  runtime.send({ type: "select_currency", currency: "USD" });
  runtime.send({ type: "continue" });
  runtime.send({ type: "set_household", sharesFinances: false });
  runtime.send({ type: "continue" });
  runtime.send({
    type: "set_employment",
    person: "mine",
    employment: "unemployed",
  });
  runtime.send({ type: "continue" });
  runtime.send({ type: "skip" });
  runtime.send({
    type: "set_cash",
    value: { cents: 3_000_000, confidence: "confirmed" },
  });
  runtime.send({ type: "continue" });
  runtime.send({ type: "skip" });
  runtime.send({ type: "set_expense_mode", mode: "quick" });
  runtime.send({
    type: "set_quick_expenses",
    patch: { current_monthly_cents: 600_000 },
  });
  runtime.send({ type: "continue" });
  runtime.send({
    type: "set_reduction",
    target: { kind: "quick" },
    interruptionMonthlyCents: 400_000,
  });
  runtime.send({ type: "continue" });
}

function completedAnswers({
  cash = 3_000_000,
  current = 600_000,
  interruption = 400_000,
  cashConfidence = "confirmed" as const,
  takeHomeSource = "estimated" as const,
  incomeConfidence = "estimated" as const,
  assets,
}: {
  cash?: number;
  current?: number;
  interruption?: number;
  cashConfidence?: HouseholdRunwayAnswers["available_cash"]["confidence"];
  takeHomeSource?: HouseholdRunwayAnswers["mine"]["take_home_source"];
  incomeConfidence?: HouseholdRunwayAnswers["mine"]["confidence"];
  assets?: Partial<HouseholdRunwayAnswers["assets"]>;
} = {}): HouseholdRunwayAnswers {
  const defaults = createDefaultRunwayAnswers(new Date(now));
  return {
    ...defaults,
    region: "CA",
    mine: {
      ...defaults.mine,
      employment: "unemployed",
      take_home_source: takeHomeSource,
      confidence: incomeConfidence,
    },
    available_cash: { cents: cash, confidence: cashConfidence },
    assets: { ...defaults.assets, ...assets },
    expense_mode: "quick",
    quick_expenses: {
      current_monthly_cents: current,
      interruption_monthly_cents: interruption,
      confidence: "confirmed",
    },
    updated_at: now,
  };
}

function completedRuntime(
  answers = completedAnswers(),
  initialSnapshots: RunwaySnapshotSummary[] = [],
) {
  const runtime = createSeededRuntime({
    now: () => now,
    createId: () => "interview-1",
    initialPlan: { revision: 1, inputs: answers },
    initialSnapshots,
  });
  runtime.start();
  return runtime;
}

function readyResult(runtime: ReturnType<typeof completedRuntime>) {
  const screen = runtime.getSnapshot().screen;
  expect(screen.kind).toBe("result");
  if (screen.kind !== "result" || screen.readiness !== "ready") {
    throw new Error("expected a ready result");
  }
  return screen;
}

function historySnapshot(
  id: string,
  overrides: Partial<RunwaySnapshotSummary> = {},
): RunwaySnapshotSummary {
  return {
    id,
    trigger: "updated",
    scenario: "current",
    months_covered: 4,
    sustainable: false,
    model_version: "4.0.0",
    created_at: `${id === "newest" ? "2026-08-03" : "2026-08-02"}T15:00:00.000Z`,
    ...overrides,
  };
}

describe("Household Runway public result Runtime contract", () => {
  it("projects a first-class semantic result without raw escape hatches", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });

    const snapshot = runtime.getSnapshot();
    expect(snapshot.screen.kind).toBe("result");
    if (snapshot.screen.kind !== "result") return;

    expect(snapshot.screen.readiness).toBe("ready");
    if (snapshot.screen.readiness !== "ready") return;
    expect(snapshot.screen.modelVersion).toBe("4.0.0");
    expect(snapshot.screen.scenarios).toEqual({
      selected: "current",
      available: [{ id: "current" }],
    });
    expect(snapshot.screen.primary.outcome.kind).toBe("depletes");
    expect(snapshot.screen.comparisons.interruption.outcome.kind).toBe(
      "depletes",
    );
    expect(snapshot.screen.adjustment.active).toBe(false);
    expect(snapshot.screen.advice).toEqual([
      {
        kind: "largestReducibleCategory",
        category: "other",
        reducibleCents: 200_000,
      },
    ]);
    expect(snapshot.screen.precision.notices).toEqual([
      { kind: "takeHomeEstimated" },
      { kind: "quickExpenses" },
    ]);
    expect(snapshot.screen.history).toEqual([]);
    expect(snapshot.plan).toEqual({ exists: false, current: false });
    expect(snapshot.draft.synchronized).toBe(false);
    expect(snapshot.actions).toMatchObject({
      editCompletedPlan: { applicable: true },
      selectScenario: { applicable: true },
      setPlanAdjustment: { applicable: true },
      savePlan: { applicable: true },
      downloadReport: { applicable: true },
    });
    expect(snapshot).not.toHaveProperty("derived");
    expect(snapshot).not.toHaveProperty("assessmentHistory");
    expect(snapshot).not.toHaveProperty("affordances");
    expect(snapshot.screen).not.toHaveProperty("assessment");
    expect(snapshot.screen).not.toHaveProperty("planInputs");
  });

  it("projects authoritative adjustment bounds and qualitative or exact effects", () => {
    const runtime = completedRuntime();
    let result = readyResult(runtime);

    expect(result.adjustment.fields).toMatchObject({
      expenseReduction: {
        valueCents: 0,
        minimumCents: 0,
        maximumCents: 400_000,
      },
      addedCash: {
        valueCents: 0,
        minimumCents: 0,
        maximumCents: 100_000_000_000,
      },
    });
    expect(result.adjustment.effect).toEqual({ kind: "none" });

    runtime.send({
      type: "set_plan_adjustment",
      patch: { added_cash_cents: 100_000 },
    });
    result = readyResult(runtime);
    expect(result.adjustment.active).toBe(true);
    expect(result.adjustment.effect).toEqual({
      kind: "monthsChanged",
      deltaMonths: 0.25,
    });
    expect(result.primary.outcome).toEqual({
      kind: "depletes",
      monthsCovered: 7.75,
      depletion: { kind: "dated", date: expect.any(String) },
    });

    runtime.send({ type: "reset_plan_adjustment" });
    runtime.send({
      type: "set_plan_adjustment",
      patch: { added_monthly_income_cents: 400_000 },
    });
    result = readyResult(runtime);
    expect(result.primary.outcome).toEqual({ kind: "sustainable" });
    expect(result.adjustment.effect).toEqual({ kind: "becameSustainable" });
  });

  it("projects every adjustment field and current limit through the Runtime", () => {
    const runtime = completedRuntime(
      completedAnswers({
        assets: {
          illiquid_investments: { cents: 600_000, confidence: "confirmed" },
          retirement_tax_deferred: { cents: 800_000, confidence: "confirmed" },
          retirement_tax_free: { cents: 900_000, confidence: "confirmed" },
        },
      }),
    );

    expect(readyResult(runtime).adjustment).toEqual({
      active: false,
      fields: {
        expenseReduction: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 400_000,
        },
        addedCash: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 100_000_000_000,
        },
        addedMonthlyIncome: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 100_000_000_000,
        },
        expectedUnconfirmedFunds: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 100_000_000_000,
        },
        usableIlliquidInvestments: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 600_000,
        },
        usableRetirementTaxDeferred: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 800_000,
        },
        usableRetirementTaxFree: {
          valueCents: 0,
          minimumCents: 0,
          maximumCents: 900_000,
        },
      },
      effect: { kind: "none" },
    });

    runtime.send({
      type: "set_plan_adjustment",
      patch: {
        expense_reduction_cents: 100_000,
        added_cash_cents: 200_000,
        added_monthly_income_cents: 30_000,
        expected_unconfirmed_funds_cents: 40_000,
        usable_illiquid_investments_cents: 100_000,
        usable_retirement_tax_deferred_cents: 200_000,
        usable_retirement_tax_free_cents: 300_000,
      },
    });

    const projected = readyResult(runtime).adjustment;
    expect(projected.active).toBe(true);
    expect(projected.fields).toEqual({
      expenseReduction: {
        valueCents: 100_000,
        minimumCents: 0,
        maximumCents: 400_000,
      },
      addedCash: {
        valueCents: 200_000,
        minimumCents: 0,
        maximumCents: 100_000_000_000,
      },
      addedMonthlyIncome: {
        valueCents: 30_000,
        minimumCents: 0,
        maximumCents: 100_000_000_000,
      },
      expectedUnconfirmedFunds: {
        valueCents: 40_000,
        minimumCents: 0,
        maximumCents: 100_000_000_000,
      },
      usableIlliquidInvestments: {
        valueCents: 100_000,
        minimumCents: 0,
        maximumCents: 600_000,
      },
      usableRetirementTaxDeferred: {
        valueCents: 200_000,
        minimumCents: 0,
        maximumCents: 800_000,
      },
      usableRetirementTaxFree: {
        valueCents: 300_000,
        minimumCents: 0,
        maximumCents: 900_000,
      },
    });
    expect(projected.effect.kind).toBe("monthsChanged");
  });

  it("does not invent a numeric effect when both Runtime outcomes are sustainable", () => {
    const answers = completedAnswers();
    answers.other_income_sources = [
      {
        id: "stable-other-income",
        type: "other",
        label: "Stable other income",
        monthly_cents: 500_000,
        confidence: "confirmed",
      },
    ];
    const runtime = completedRuntime(answers);
    expect(readyResult(runtime).primary.outcome).toEqual({ kind: "sustainable" });

    runtime.send({
      type: "set_plan_adjustment",
      patch: { added_cash_cents: 1 },
    });

    expect(readyResult(runtime).adjustment).toMatchObject({
      active: true,
      effect: { kind: "none" },
    });
  });

  it("keeps Plan freshness semantic across a no-op review and a changed review", () => {
    const runtime = completedRuntime();

    expect(runtime.getSnapshot().plan).toEqual({ exists: true, current: true });

    runtime.send({ type: "edit_completed_plan" });
    expect(runtime.getSnapshot().plan).toEqual({ exists: true, current: false });

    runtime.send({ type: "continue" });
    expect(runtime.getSnapshot().screen.kind).toBe("result");
    expect(runtime.getSnapshot().plan).toEqual({ exists: true, current: true });

    runtime.send({ type: "edit_completed_plan" });
    runtime.send({
      type: "update_answers",
      patch: { available_cash: { cents: 3_100_000, confidence: "confirmed" } },
    });
    runtime.send({ type: "continue" });
    expect(runtime.getSnapshot().screen.kind).toBe("result");
    expect(runtime.getSnapshot().plan).toEqual({ exists: true, current: false });
    expect(runtime.getSnapshot().actions.savePlan).toEqual({ applicable: true });
  });

  it("orders zero, one, and two advice facts from the adjusted preview", () => {
    expect(readyResult(completedRuntime(completedAnswers({ current: 400_000, interruption: 400_000 }))).advice).toEqual([]);
    expect(readyResult(completedRuntime()).advice).toEqual([
      {
        kind: "largestReducibleCategory",
        category: "other",
        reducibleCents: 200_000,
      },
    ]);
    expect(readyResult(completedRuntime(completedAnswers({ cash: 0 }))).advice).toEqual([
      { kind: "cashTarget", targetMonths: 3, gapCents: 1_200_000 },
      {
        kind: "largestReducibleCategory",
        category: "other",
        reducibleCents: 200_000,
      },
    ]);
    expect(readyResult(completedRuntime(completedAnswers({ cash: 2_000_000 }))).advice[0]).toEqual({
      kind: "cashTarget",
      targetMonths: 6,
      gapCents: 400_000,
    });
  });

  it("keeps precision notices ordered and allows completion to coexist with quick expenses", () => {
    expect(readyResult(completedRuntime()).precision.notices).toEqual([
      { kind: "takeHomeEstimated" },
      { kind: "quickExpenses" },
    ]);
    expect(readyResult(completedRuntime(completedAnswers({
      cashConfidence: "confirmed",
      takeHomeSource: "user_confirmed",
      incomeConfidence: "confirmed",
    }))).precision.notices).toEqual([
      { kind: "quickExpenses" },
      { kind: "coreInputsComplete" },
    ]);
    expect(readyResult(completedRuntime(completedAnswers({
      cashConfidence: "estimated",
    }))).precision.notices.slice(0, 3)).toEqual([
      { kind: "cashNotConfirmed" },
      { kind: "takeHomeEstimated" },
      { kind: "quickExpenses" },
    ]);
  });

  it("projects complete newest-first history comparisons without arithmetic in React", () => {
    const numeric = readyResult(completedRuntime(completedAnswers(), [
      historySnapshot("newest", { months_covered: 6 }),
      historySnapshot("older", { months_covered: 4 }),
    ]));
    expect(numeric.history[0]?.comparisonToPrevious).toEqual({
      kind: "monthsChanged",
      deltaMonths: 2,
    });

    const became = readyResult(completedRuntime(completedAnswers(), [
      historySnapshot("newest", { months_covered: null, sustainable: true }),
      historySnapshot("older", { months_covered: 4 }),
    ]));
    expect(became.history[0]?.comparisonToPrevious).toEqual({
      kind: "becameSustainable",
    });

    const left = readyResult(completedRuntime(completedAnswers(), [
      historySnapshot("newest", { months_covered: 4 }),
      historySnapshot("older", { months_covered: null, sustainable: true }),
    ]));
    expect(left.history[0]?.comparisonToPrevious).toEqual({
      kind: "leftSustainable",
    });

    const mismatch = readyResult(completedRuntime(completedAnswers(), [
      historySnapshot("newest", { scenario: "mine_stops" }),
      historySnapshot("older", { scenario: "current", model_version: "3.0.0" }),
    ]));
    expect(mismatch.history[0]?.comparisonToPrevious).toEqual({
      kind: "incomparable",
      reason: "scenarioAndModelChanged",
    });
  });

});
