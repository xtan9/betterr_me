import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultExperience } from "@/components/finance/household-runway-result";
import type { HouseholdRunwayInterviewRuntimeScreen } from "@/lib/finance/household-runway-interview-runtime";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/finance/runway-money-field", () => ({
  MoneyField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
}));

vi.mock("@/components/finance/household-runway-result-parts", () => ({
  BalanceChart: ({
    simulation,
  }: {
    simulation: { resources: { startingCents: number } };
  }) => <div role="img" aria-label="semantic runway chart">{simulation.resources.startingCents}</div>,
  RunwayHistory: ({
    snapshots,
  }: {
    snapshots: readonly unknown[];
  }) => <div data-testid="runway-history">{snapshots.length}</div>,
}));

type ResultModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "result" }
>;

const t = ((key: string, values?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    "result.eyebrow": "Household runway",
    "result.scenarioLead": "Scenario: {scenario}",
    "result.primary": "Runway {months} months, depletion {date}",
    "result.model": "Model: {version}",
    "result.resources": "Starting resources",
    "result.income": "Continuing income",
    "result.expenses": "Interruption expenses",
    "comparison.sustainable": "Sustainable",
    "comparison.months": "{months} months",
    "comparison.current": "Current lifestyle",
    "comparison.interruption": "Interruption",
    "comparison.extreme": "Extreme mode",
    "result.scenarios": "Scenarios",
    "why.title": "Why",
    "why.cash": "Cash",
    "why.investments": "Investments",
    "why.reducible": "Reducible expenses",
    "why.excluded": "Excluded assets",
    "actions.review": "Review inputs",
    "whatIf.title": "What-if",
    "whatIf.description": "Preview changes",
    "whatIf.reduceExpenses": "Reduce expenses",
    "whatIf.addCash": "Add accessible cash",
    "whatIf.addIncome": "Add monthly income",
    "whatIf.expectedFunds": "Expected funds",
    "whatIf.expectedFundsHelp": "Not confirmed",
    "whatIf.useIlliquid": "Use illiquid investments",
    "whatIf.useDeferred": "Use tax-deferred retirement",
    "whatIf.useTaxFree": "Use tax-free retirement",
    "whatIf.retirementHelp": "Retirement help",
    "whatIf.months": "months",
    "whatIf.noChange": "No change",
    "actions.apply": "Apply",
    "actions.reset": "Reset",
    "actionsPlan.title": "Actions plan",
    "actionsPlan.cashTarget": "Cash target {months} months",
    "actionsPlan.largest": "Largest reducible",
    "save.title": "Save",
    "save.description": "Save description",
    "actions.download": "Download",
    "save.createAccount": "Create account to save",
    "landing.startNew": "Start a new check-up",
    "actions.discardDraft": "Clear",
    "regional.title": "Regional context",
    "regionalActions.US": "United States",
    "precision.title": "Precision",
    "precision.cash": "Cash needs review",
    "precision.takeHome": "Take-home is estimated",
    "precision.expenses": "Quick expenses",
    "precision.complete": "Core inputs complete",
    "method.title": "Method",
    "method.formula": "Formula",
    "method.excluded": "Excluded",
    "method.disclaimer": "Disclaimer",
    "history.title": "History",
    "history.description": "History description",
    "scenarios.current": "Current lifestyle",
    "scenarios.mine_stops": "My income stops",
    "scenarios.both_stop": "Both incomes stop",
    "expenseCategories.housing": "Housing",
    "guidance.urgent": "Urgent",
    "confidence.needs_review": "Needs review",
    "history.becameSustainable": "Became sustainable",
  };
  const template = labels[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values?.[name] ?? `{${name}}`),
  );
}) as Parameters<typeof ResultExperience>[0]["t"];

function resultModel(): ResultModel {
  return {
    kind: "result",
    stage: "result",
    readiness: "ready",
    availableStages: [],
    stageStatus: {} as ResultModel["stageStatus"],
    modelVersion: "semantic-9",
    country: "US",
    currency: "USD",
    scenarios: {
      selected: "mine_stops",
      available: [{ id: "mine_stops" }, { id: "both_stop" }],
    },
    primary: {
      outcome: {
        kind: "depletes",
        monthsCovered: 2.5,
        depletion: { kind: "dated", date: "2026-10-01" },
      },
      confidence: "needsReview",
      guidance: "underThree",
      resources: {
        startingCents: 1234,
        continuingMonthlyIncomeCents: 5000,
        interruptionExpensesCents: 6000,
        reducibleExpensesCents: 1000,
        excludedAssetsCents: 250,
      },
      series: {
        kind: "monthly",
        throughMonth: 2,
        points: [],
      },
    },
    comparisons: {
      currentLifestyle: { outcome: { kind: "sustainable" } },
      interruption: { outcome: { kind: "depletes", monthsCovered: 4 } },
      extremeMode: { outcome: { kind: "sustainable" } },
    },
    explanation: {
      availableCashCents: 1234,
      liquidInvestmentsCents: 5678,
    },
    adjustment: {
      active: true,
      fields: {
        expenseReduction: { valueCents: 0, minimumCents: 0, maximumCents: 6000 },
        addedCash: { valueCents: 0, minimumCents: 0, maximumCents: 100000 },
        addedMonthlyIncome: { valueCents: 0, minimumCents: 0, maximumCents: 100000 },
        expectedUnconfirmedFunds: { valueCents: 0, minimumCents: 0, maximumCents: 100000 },
        usableIlliquidInvestments: { valueCents: 0, minimumCents: 0, maximumCents: 2000 },
        usableRetirementTaxDeferred: { valueCents: 0, minimumCents: 0, maximumCents: 3000 },
        usableRetirementTaxFree: { valueCents: 0, minimumCents: 0, maximumCents: 4000 },
      },
      effect: { kind: "monthsChanged", deltaMonths: 1.5 },
    },
    advice: [
      { kind: "cashTarget", targetMonths: 3, gapCents: 2345 },
      { kind: "largestReducibleCategory", category: "housing", reducibleCents: 999 },
    ],
    precision: {
      notices: [{ kind: "cashNotConfirmed" }, { kind: "takeHomeEstimated" }],
    },
    history: [
      {
        id: "history-1",
        scenario: "mine_stops",
        modelVersion: "semantic-8",
        createdAt: "2026-08-01T00:00:00.000Z",
        outcome: { kind: "sustainable" },
        comparisonToPrevious: { kind: "becameSustainable" },
      },
    ],
  };
}

describe("Household Runway result presentation", () => {
  it("localizes semantic facts and sends semantic intents without recalculating them", () => {
    const dispatch = vi.fn();
    const onDownload = vi.fn();
    render(
      <ResultExperience
        t={t}
        locale="en"
        model={resultModel()}
        dispatch={dispatch}
        onStartNew={vi.fn()}
        onDiscardDraft={vi.fn()}
        onRegistrationClick={vi.fn()}
        onDownload={onDownload}
        isAuthenticated={true}
        saved={false}
        saving={false}
        onSave={vi.fn()}
        error=""
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Runway 2.5 months, depletion 2026-10-01",
    );
    expect(screen.getByText(/Model: semantic-9/)).toBeInTheDocument();
    expect(screen.getByText("$12")).toBeInTheDocument();
    expect(screen.getByText("+1.5 months")).toBeInTheDocument();
    expect(screen.getByText("Cash target 3 months")).toBeInTheDocument();
    expect(screen.getByText(/Housing/)).toBeInTheDocument();
    expect(screen.getByText("Cash needs review")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "semantic runway chart" })).toBeInTheDocument();
    expect(screen.getByTestId("runway-history")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("tab", { name: "Both incomes stop" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "select_scenario",
      scenario: "both_stop",
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Add accessible cash" }), {
      target: { value: "2500" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "set_plan_adjustment",
      patch: { added_cash_cents: 2500 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "apply_plan_adjustment" });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onDownload).toHaveBeenCalledOnce();
  });
});
