import { describe, it, expect } from "vitest";
import {
  computeSpendingAnomalies,
  computeSubscriptionAlerts,
  computeGoalInsights,
  computeInsights,
  generateInsightId,
} from "@/lib/money/insights";
import type { RecurringBill, GoalWithProjection, Insight } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Helper: create a mock RecurringBill
// ---------------------------------------------------------------------------

function makeBill(
  overrides: Partial<RecurringBill> = {}
): RecurringBill {
  return {
    id: "bill-1",
    household_id: "hh-1",
    plaid_stream_id: null,
    account_id: null,
    name: "Netflix",
    description: null,
    amount_cents: -1599,
    frequency: "MONTHLY",
    next_due_date: "2026-03-01",
    user_status: "confirmed",
    is_active: true,
    plaid_status: null,
    category_primary: null,
    previous_amount_cents: null,
    source: "plaid",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a mock GoalWithProjection
// ---------------------------------------------------------------------------

function makeGoal(
  overrides: Partial<GoalWithProjection> = {}
): GoalWithProjection {
  return {
    id: "goal-1",
    household_id: "hh-1",
    name: "Emergency Fund",
    target_cents: 1_000_000,
    current_cents: 500_000,
    deadline: "2026-12-31",
    funding_type: "manual",
    linked_account_id: null,
    icon: null,
    color: null,
    status: "active",
    owner_id: "user-1",
    is_shared: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    projected_date: null,
    monthly_rate_cents: 50_000,
    status_color: "green",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeSpendingAnomalies
// ---------------------------------------------------------------------------

describe("computeSpendingAnomalies", () => {
  it("detects 15%+ increase", () => {
    const current = [{ category_name: "Groceries", amount_cents: 46_000 }];
    const historical = [{ category_name: "Groceries", avg_cents: 40_000 }];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe("spending_anomaly");
    expect(insights[0].severity).toBe("attention");
    expect(insights[0].data.percent_change).toBe(15);
  });

  it("detects decrease (positive severity)", () => {
    const current = [{ category_name: "Dining", amount_cents: 20_000 }];
    const historical = [{ category_name: "Dining", avg_cents: 40_000 }];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");

    expect(insights.length).toBe(1);
    expect(insights[0].severity).toBe("positive");
    expect(insights[0].data.percent_change).toBe(-50);
  });

  it("ignores <15% changes", () => {
    const current = [{ category_name: "Gas", amount_cents: 10_500 }];
    const historical = [{ category_name: "Gas", avg_cents: 10_000 }];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");

    // 5% change — below threshold
    expect(insights.length).toBe(0);
  });

  it("ignores categories with no historical data", () => {
    const current = [{ category_name: "New Category", amount_cents: 10_000 }];
    const historical: { category_name: string; avg_cents: number }[] = [];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSubscriptionAlerts
// ---------------------------------------------------------------------------

describe("computeSubscriptionAlerts", () => {
  it("detects price change", () => {
    const bills = [
      makeBill({
        name: "Netflix",
        amount_cents: -1999,
        previous_amount_cents: -1599,
      }),
    ];

    const insights = computeSubscriptionAlerts(bills);

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe("subscription_increase");
    expect(insights[0].data.merchant).toBe("Netflix");
    expect(insights[0].data.old_amount_cents).toBe(-1599);
    expect(insights[0].data.new_amount_cents).toBe(-1999);
  });

  it("skips bills with no previous_amount_cents", () => {
    const bills = [
      makeBill({
        name: "Spotify",
        amount_cents: -999,
        previous_amount_cents: null,
      }),
    ];

    const insights = computeSubscriptionAlerts(bills);
    expect(insights.length).toBe(0);
  });

  it("skips bills with same amount", () => {
    const bills = [
      makeBill({
        name: "Spotify",
        amount_cents: -999,
        previous_amount_cents: -999,
      }),
    ];

    const insights = computeSubscriptionAlerts(bills);
    expect(insights.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeGoalInsights
// ---------------------------------------------------------------------------

describe("computeGoalInsights", () => {
  it("behind schedule detection", () => {
    const goals = [
      makeGoal({
        deadline: "2026-06-30",
        projected_date: "2026-09-15", // behind
      }),
    ];

    const insights = computeGoalInsights(goals);

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe("goal_progress");
    expect(insights[0].severity).toBe("attention");
    expect(insights[0].data.status).toBe("behind");
  });

  it("almost-there detection (>= 90% progress)", () => {
    const goals = [
      makeGoal({
        target_cents: 1_000_000,
        current_cents: 950_000,
        projected_date: null,
        deadline: null,
      }),
    ];

    const insights = computeGoalInsights(goals);

    expect(insights.length).toBe(1);
    expect(insights[0].severity).toBe("positive");
    expect(insights[0].data.status).toBe("almost_there");
    expect(insights[0].data.progress_percent).toBe(95);
  });

  it("no insight for goals below 90% and on track", () => {
    const goals = [
      makeGoal({
        target_cents: 1_000_000,
        current_cents: 500_000,
        projected_date: "2026-06-01",
        deadline: "2026-12-31",
      }),
    ];

    const insights = computeGoalInsights(goals);
    expect(insights.length).toBe(0);
  });

  it("ignores completed goals", () => {
    const goals = [
      makeGoal({
        status: "completed",
        target_cents: 1_000_000,
        current_cents: 1_000_000,
      }),
    ];

    const insights = computeGoalInsights(goals);
    expect(insights.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeInsights (merge + filter + sort)
// ---------------------------------------------------------------------------

describe("computeInsights", () => {
  it("filters dismissed IDs", () => {
    const anomaly: Insight = {
      id: "spending_anomaly:groceries:2026-02",
      type: "spending_anomaly",
      page: "budgets",
      severity: "attention",
      data: { category: "Groceries", percent_change: 20 },
    };

    const sub: Insight = {
      id: "subscription_increase:netflix:2026-02",
      type: "subscription_increase",
      page: "bills",
      severity: "attention",
      data: { merchant: "Netflix" },
    };

    const result = computeInsights({
      spendingAnomalies: [anomaly],
      subscriptionAlerts: [sub],
      goalInsights: [],
      dismissedIds: new Set(["spending_anomaly:groceries:2026-02"]),
    });

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("subscription_increase:netflix:2026-02");
  });

  it("sorts by severity: attention first, then positive", () => {
    const positive: Insight = {
      id: "pos-1",
      type: "spending_anomaly",
      page: "budgets",
      severity: "positive",
      data: {},
    };

    const attention: Insight = {
      id: "att-1",
      type: "subscription_increase",
      page: "budgets",
      severity: "attention",
      data: {},
    };

    const result = computeInsights({
      spendingAnomalies: [positive],
      subscriptionAlerts: [attention],
      goalInsights: [],
      dismissedIds: new Set(),
    });

    expect(result[0].severity).toBe("attention");
    expect(result[1].severity).toBe("positive");
  });

  it("limits to 5 per page", () => {
    const anomalies: Insight[] = Array.from({ length: 8 }, (_, i) => ({
      id: `a-${i}`,
      type: "spending_anomaly" as const,
      page: "budgets" as const,
      severity: "attention" as const,
      data: { category: `Cat ${i}` },
    }));

    const result = computeInsights({
      spendingAnomalies: anomalies,
      subscriptionAlerts: [],
      goalInsights: [],
      dismissedIds: new Set(),
    });

    // Only 5 should remain for the budgets page
    expect(result.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// generateInsightId
// ---------------------------------------------------------------------------

describe("generateInsightId", () => {
  it("deterministic output", () => {
    const id1 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    const id2 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    expect(id1).toBe(id2);
    expect(id1).toBe("spending_anomaly:groceries:2026-02");
  });

  it("normalizes entity name", () => {
    const id = generateInsightId("goal_progress", "Emergency Fund", "2026-02");
    expect(id).toBe("goal_progress:emergency_fund:2026-02");
  });

  it("different periods produce different IDs", () => {
    const id1 = generateInsightId("spending_anomaly", "Groceries", "2026-01");
    const id2 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    expect(id1).not.toBe(id2);
  });
});
