import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InsightCard } from "@/components/money/insight-card";
import type { Insight } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      const paramStr = Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
      return `${key}(${paramStr})`;
    }
    return key;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InsightCard", () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders spending anomaly insight with correct icon and text", () => {
    const insight: Insight = {
      id: "spending_anomaly:groceries:2026-02",
      type: "spending_anomaly",
      page: "budgets",
      severity: "attention",
      data: { category: "Groceries", percent_change: 20, period: "3-month average" },
    };

    render(<InsightCard insight={insight} onDismiss={mockOnDismiss} />);

    // Should render the translated message
    expect(
      screen.getByText(/spendingAnomaly/)
    ).toBeInTheDocument();
  });

  it("renders subscription increase insight", () => {
    const insight: Insight = {
      id: "subscription_increase:netflix:2026-02",
      type: "subscription_increase",
      page: "bills",
      severity: "attention",
      data: { name: "Netflix", old_amount: "$15.99", new_amount: "$19.99" },
    };

    render(<InsightCard insight={insight} onDismiss={mockOnDismiss} />);

    expect(screen.getByText(/subscriptionIncrease/)).toBeInTheDocument();
  });

  it("dismiss button calls onDismiss with insight ID", () => {
    const insight: Insight = {
      id: "spending_anomaly:gas:2026-02",
      type: "spending_anomaly",
      page: "budgets",
      severity: "attention",
      data: { category: "Gas", percent_change: 25 },
    };

    render(<InsightCard insight={insight} onDismiss={mockOnDismiss} />);

    const dismissButton = screen.getByRole("button", { name: "dismiss" });
    fireEvent.click(dismissButton);

    expect(mockOnDismiss).toHaveBeenCalledWith("spending_anomaly:gas:2026-02");
  });

  it("severity affects card styling — attention has amber border", () => {
    const insight: Insight = {
      id: "att-1",
      type: "spending_anomaly",
      page: "budgets",
      severity: "attention",
      data: { category: "Food", percent_change: 30 },
    };

    const { container } = render(
      <InsightCard insight={insight} onDismiss={mockOnDismiss} />
    );

    // Attention severity should have money-amber border class
    const card = container.firstElementChild;
    expect(card?.className).toContain("border-l-[hsl(var(--money-amber))]");
  });

  it("severity affects card styling — positive has sage border", () => {
    const insight: Insight = {
      id: "pos-1",
      type: "spending_anomaly",
      page: "budgets",
      severity: "positive",
      data: { category: "Dining", percent_change: -30 },
    };

    const { container } = render(
      <InsightCard insight={insight} onDismiss={mockOnDismiss} />
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain("border-l-[hsl(var(--money-sage))]");
  });

  it("severity info has no special border", () => {
    const insight: Insight = {
      id: "info-1",
      type: "spending_anomaly",
      page: "budgets",
      severity: "info",
      data: { category: "Misc", percent_change: 15 },
    };

    const { container } = render(
      <InsightCard insight={insight} onDismiss={mockOnDismiss} />
    );

    const card = container.firstElementChild;
    expect(card?.className).not.toContain("border-l-[hsl(var(--money-amber))]");
    expect(card?.className).not.toContain("border-l-[hsl(var(--money-sage))]");
  });
});
