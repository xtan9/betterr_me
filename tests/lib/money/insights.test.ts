import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeSpendingAnomalies,
  computeSubscriptionAlerts,
  computeGoalInsights,
  computeInsights,
  generateInsightId,
} from "@/lib/money/insights";
import type { RecurringBill, GoalWithProjection, Insight } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
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
// generateInsightId
// ---------------------------------------------------------------------------

describe("generateInsightId", () => {
  it("produces exact colon-separated format", () => {
    expect(generateInsightId("spending_anomaly", "Groceries", "2026-02")).toBe(
      "spending_anomaly:groceries:2026-02"
    );
  });

  it("lowercases the entity", () => {
    expect(generateInsightId("t", "ABC", "p")).toBe("t:abc:p");
  });

  it("replaces a single space with underscore", () => {
    expect(generateInsightId("t", "Foo Bar", "p")).toBe("t:foo_bar:p");
  });

  it("replaces multiple consecutive spaces with a single underscore (\\s+ regex)", () => {
    // This kills `\s+` -> `\s` mutation: with `\s` each space becomes its own underscore.
    // "Foo  Bar" (two spaces): "\s+" -> "foo_bar"; "\s" -> "foo__bar"
    expect(generateInsightId("t", "Foo  Bar", "p")).toBe("t:foo_bar:p");
  });

  it("replaces tab whitespace with underscore (still greedy)", () => {
    expect(generateInsightId("t", "Foo\tBar", "p")).toBe("t:foo_bar:p");
  });

  it("is deterministic across calls", () => {
    const id1 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    const id2 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    expect(id1).toBe(id2);
  });

  it("different periods produce different IDs", () => {
    const id1 = generateInsightId("spending_anomaly", "Groceries", "2026-01");
    const id2 = generateInsightId("spending_anomaly", "Groceries", "2026-02");
    expect(id1).not.toBe(id2);
  });

  it("normalizes multi-word entity with spaces", () => {
    expect(
      generateInsightId("goal_progress", "Emergency Fund", "2026-02")
    ).toBe("goal_progress:emergency_fund:2026-02");
  });
});

// ---------------------------------------------------------------------------
// computeSpendingAnomalies
// ---------------------------------------------------------------------------

describe("computeSpendingAnomalies", () => {
  it("emits a single insight with exact fields for 15%+ increase", () => {
    const current = [{ category_name: "Groceries", amount_cents: 46_000 }];
    const historical = [{ category_name: "Groceries", avg_cents: 40_000 }];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");

    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual({
      id: "spending_anomaly:groceries:2026-02",
      type: "spending_anomaly",
      page: "budgets",
      severity: "attention",
      data: {
        category: "Groceries",
        percent_change: 15,
        period: "3-month average",
      },
    });
  });

  it("emits positive severity for 50% decrease with exact negative percent", () => {
    const current = [{ category_name: "Dining", amount_cents: 20_000 }];
    const historical = [{ category_name: "Dining", avg_cents: 40_000 }];

    const insights = computeSpendingAnomalies(current, historical, "2026-02");

    expect(insights).toHaveLength(1);
    expect(insights[0].severity).toBe("positive");
    expect(insights[0].data.percent_change).toBe(-50);
  });

  it("kills percent_change > 0 boundary: exactly +15% -> attention", () => {
    const current = [{ category_name: "Groceries", amount_cents: 46_000 }];
    const historical = [{ category_name: "Groceries", avg_cents: 40_000 }];
    // percentChange = (46000 - 40000) / 40000 * 100 = 15 (> 0)
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights[0].severity).toBe("attention");
  });

  it("kills percent_change > 0 boundary: exactly -15% -> positive", () => {
    const current = [{ category_name: "Groceries", amount_cents: 34_000 }];
    const historical = [{ category_name: "Groceries", avg_cents: 40_000 }];
    // percentChange = (34000 - 40000) / 40000 * 100 = -15 (< 0)
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights[0].severity).toBe("positive");
  });

  it("ignores <15% change (14% rounds to 14, below threshold)", () => {
    const current = [{ category_name: "Gas", amount_cents: 11_400 }];
    const historical = [{ category_name: "Gas", avg_cents: 10_000 }];
    // 14% change
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toHaveLength(0);
  });

  it("exactly 15% (boundary) DOES emit insight (>= 15)", () => {
    const current = [{ category_name: "Exactly15", amount_cents: 11_500 }];
    const historical = [{ category_name: "Exactly15", avg_cents: 10_000 }];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toHaveLength(1);
  });

  it("exactly -15% (negative boundary) DOES emit positive insight", () => {
    const current = [{ category_name: "Drop15", amount_cents: 8_500 }];
    const historical = [{ category_name: "Drop15", avg_cents: 10_000 }];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toHaveLength(1);
    expect(insights[0].severity).toBe("positive");
  });

  it("skips categories missing from historical average", () => {
    const current = [{ category_name: "New Category", amount_cents: 10_000 }];
    const historical: { category_name: string; avg_cents: number }[] = [];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toEqual([]);
  });

  it("skips categories where historical avg is exactly 0 (division guard)", () => {
    // kills `avg === 0` mutant: must not divide by zero
    const current = [{ category_name: "ZeroAvg", amount_cents: 10_000 }];
    const historical = [{ category_name: "ZeroAvg", avg_cents: 0 }];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toEqual([]);
  });

  it("category comparison is case-insensitive in lookup", () => {
    // source normalises via toLowerCase() on both sides
    const current = [{ category_name: "GROCERIES", amount_cents: 46_000 }];
    const historical = [{ category_name: "groceries", avg_cents: 40_000 }];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toHaveLength(1);
    // Insight preserves the current-month casing
    expect(insights[0].data.category).toBe("GROCERIES");
  });

  it("insight ID scopes to the period string", () => {
    const current = [{ category_name: "Groceries", amount_cents: 46_000 }];
    const historical = [{ category_name: "Groceries", avg_cents: 40_000 }];
    expect(
      computeSpendingAnomalies(current, historical, "2026-01")[0].id
    ).toBe("spending_anomaly:groceries:2026-01");
    expect(
      computeSpendingAnomalies(current, historical, "2026-02")[0].id
    ).toBe("spending_anomaly:groceries:2026-02");
  });

  it("processes multiple categories independently", () => {
    const current = [
      { category_name: "A", amount_cents: 20_000 },
      { category_name: "B", amount_cents: 4_000 },
    ];
    const historical = [
      { category_name: "A", avg_cents: 10_000 }, // +100%
      { category_name: "B", avg_cents: 10_000 }, // -60%
    ];
    const insights = computeSpendingAnomalies(current, historical, "2026-02");
    expect(insights).toHaveLength(2);
    expect(insights[0].data.percent_change).toBe(100);
    expect(insights[0].severity).toBe("attention");
    expect(insights[1].data.percent_change).toBe(-60);
    expect(insights[1].severity).toBe("positive");
  });
});

// ---------------------------------------------------------------------------
// computeSubscriptionAlerts
// ---------------------------------------------------------------------------

describe("computeSubscriptionAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits an insight with exact fields for a price increase", () => {
    const bills = [
      makeBill({
        name: "Netflix",
        amount_cents: -1999,
        previous_amount_cents: -1599,
      }),
    ];

    const insights = computeSubscriptionAlerts(bills);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual({
      id: "subscription_increase:netflix:2026-02",
      type: "subscription_increase",
      page: "bills",
      severity: "attention",
      data: {
        merchant: "Netflix",
        old_amount_cents: -1599,
        new_amount_cents: -1999,
        // (1999 - 1599) / 1599 * 100 ≈ 25.02 -> Math.round -> 25
        percent_change: 25,
      },
    });
  });

  it("computes percent change using absolute values (25% for $15.99 -> $19.99)", () => {
    const bills = [
      makeBill({ amount_cents: -1999, previous_amount_cents: -1599 }),
    ];
    const insights = computeSubscriptionAlerts(bills);
    expect(insights[0].data.percent_change).toBe(25);
  });

  it("computes exact percent on a clean ratio: $10 -> $15 = +50%", () => {
    const bills = [
      makeBill({ amount_cents: -1500, previous_amount_cents: -1000 }),
    ];
    const insights = computeSubscriptionAlerts(bills);
    expect(insights[0].data.percent_change).toBe(50);
  });

  it("detects a price decrease as a negative percent change", () => {
    const bills = [
      makeBill({ amount_cents: -800, previous_amount_cents: -1000 }),
    ];
    const insights = computeSubscriptionAlerts(bills);
    // (800 - 1000) / 1000 * 100 = -20
    expect(insights[0].data.percent_change).toBe(-20);
  });

  it("skips bills with null previous_amount_cents", () => {
    const bills = [
      makeBill({ amount_cents: -999, previous_amount_cents: null }),
    ];
    expect(computeSubscriptionAlerts(bills)).toEqual([]);
  });

  it("skips bills where previous_amount_cents === amount_cents (no change)", () => {
    const bills = [
      makeBill({ amount_cents: -999, previous_amount_cents: -999 }),
    ];
    expect(computeSubscriptionAlerts(bills)).toEqual([]);
  });

  it("skips bills where previous_amount_cents is exactly 0 (oldAbs === 0 guard)", () => {
    const bills = [
      makeBill({ amount_cents: -1999, previous_amount_cents: 0 }),
    ];
    expect(computeSubscriptionAlerts(bills)).toEqual([]);
  });

  it("insight ID uses current month from system time", () => {
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    const bills = [
      makeBill({
        name: "Hulu",
        amount_cents: -1200,
        previous_amount_cents: -1000,
      }),
    ];
    const insights = computeSubscriptionAlerts(bills);
    expect(insights[0].id).toBe("subscription_increase:hulu:2026-11");
  });

  it("handles multiple bills (only those with previous amount)", () => {
    const bills = [
      makeBill({
        id: "b1",
        name: "A",
        amount_cents: -2000,
        previous_amount_cents: -1000,
      }),
      makeBill({
        id: "b2",
        name: "B",
        amount_cents: -500,
        previous_amount_cents: null,
      }),
      makeBill({
        id: "b3",
        name: "C",
        amount_cents: -1200,
        previous_amount_cents: -1000,
      }),
    ];
    const insights = computeSubscriptionAlerts(bills);
    expect(insights).toHaveLength(2);
    expect(insights.map((i) => i.data.merchant)).toEqual(["A", "C"]);
  });
});

// ---------------------------------------------------------------------------
// computeGoalInsights
// ---------------------------------------------------------------------------

describe("computeGoalInsights", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits exact 'behind schedule' insight when projected > deadline", () => {
    const goals = [
      makeGoal({
        id: "goal-1",
        name: "Car",
        deadline: "2026-06-30",
        projected_date: "2026-09-15",
      }),
    ];

    const insights = computeGoalInsights(goals);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual({
      id: "goal_progress:goal-1:2026-02",
      type: "goal_progress",
      page: "goals",
      severity: "attention",
      data: {
        goal_name: "Car",
        projected_date: "2026-09-15",
        deadline: "2026-06-30",
        status: "behind",
      },
    });
  });

  it("boundary: projected_date === deadline is NOT behind (must be strictly greater)", () => {
    const goals = [
      makeGoal({
        deadline: "2026-06-30",
        projected_date: "2026-06-30",
        target_cents: 1_000_000,
        current_cents: 500_000, // not almost_there either
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("skips behind-schedule check if projected_date is null", () => {
    const goals = [
      makeGoal({
        deadline: "2026-06-30",
        projected_date: null,
        target_cents: 1_000_000,
        current_cents: 500_000,
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("skips behind-schedule check if deadline is null", () => {
    const goals = [
      makeGoal({
        deadline: null,
        projected_date: "2026-09-15",
        target_cents: 1_000_000,
        current_cents: 500_000,
      }),
    ];
    // Not behind (no deadline); not almost_there (50%)
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("emits 'almost there' with exact fields when >= 90% progress", () => {
    const goals = [
      makeGoal({
        id: "goal-alm",
        name: "Almost",
        target_cents: 1_000_000,
        current_cents: 950_000,
        projected_date: null,
        deadline: null,
      }),
    ];

    const insights = computeGoalInsights(goals);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual({
      id: "goal_progress:goal-alm:2026-02",
      type: "goal_progress",
      page: "goals",
      severity: "positive",
      data: {
        goal_name: "Almost",
        progress_percent: 95,
        status: "almost_there",
      },
    });
  });

  it("boundary: progress exactly 90% DOES emit almost_there (>= 90)", () => {
    const goals = [
      makeGoal({
        target_cents: 1_000_000,
        current_cents: 900_000,
        projected_date: null,
        deadline: null,
      }),
    ];
    const insights = computeGoalInsights(goals);
    expect(insights).toHaveLength(1);
    expect(insights[0].data.progress_percent).toBe(90);
  });

  it("boundary: progress 89% does NOT emit almost_there", () => {
    const goals = [
      makeGoal({
        target_cents: 1_000_000,
        current_cents: 890_000,
        projected_date: null,
        deadline: null,
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("'behind schedule' takes precedence over 'almost there' (continue after first)", () => {
    const goals = [
      makeGoal({
        id: "g1",
        target_cents: 1_000_000,
        current_cents: 950_000, // 95% -> almost_there
        deadline: "2026-06-30",
        projected_date: "2026-09-15", // also behind
      }),
    ];
    const insights = computeGoalInsights(goals);
    expect(insights).toHaveLength(1);
    expect(insights[0].data.status).toBe("behind");
  });

  it("target_cents === 0 does NOT emit almost_there (guard against division)", () => {
    // kills `target_cents > 0` mutant
    const goals = [
      makeGoal({
        target_cents: 0,
        current_cents: 0,
        projected_date: null,
        deadline: null,
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("ignores goals where status !== 'active' (completed)", () => {
    const goals = [
      makeGoal({
        status: "completed",
        target_cents: 1_000_000,
        current_cents: 1_000_000,
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("ignores goals where status is 'archived'", () => {
    const goals = [
      makeGoal({
        status: "archived",
        target_cents: 1_000_000,
        current_cents: 950_000,
        projected_date: null,
        deadline: null,
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });

  it("no insight for goals below 90% progress and on track", () => {
    const goals = [
      makeGoal({
        target_cents: 1_000_000,
        current_cents: 500_000,
        projected_date: "2026-06-01",
        deadline: "2026-12-31",
      }),
    ];
    expect(computeGoalInsights(goals)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeInsights
// ---------------------------------------------------------------------------

describe("computeInsights", () => {
  function mkInsight(
    id: string,
    severity: "attention" | "info" | "positive",
    page: "budgets" | "bills" | "goals" = "budgets"
  ): Insight {
    return {
      id,
      type: "spending_anomaly",
      page,
      severity,
      data: {},
    };
  }

  it("filters dismissed IDs", () => {
    const a = mkInsight("a", "attention");
    const b = mkInsight("b", "attention");

    const result = computeInsights({
      spendingAnomalies: [a],
      subscriptionAlerts: [b],
      goalInsights: [],
      dismissedIds: new Set(["a"]),
    });

    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("sorts by severity: attention(0) < info(1) < positive(2)", () => {
    const positive = mkInsight("pos", "positive");
    const attention = mkInsight("att", "attention");
    const info = mkInsight("inf", "info");

    const result = computeInsights({
      spendingAnomalies: [positive, info, attention],
      subscriptionAlerts: [],
      goalInsights: [],
      dismissedIds: new Set(),
    });

    expect(result.map((r) => r.severity)).toEqual([
      "attention",
      "info",
      "positive",
    ]);
  });

  it("unknown severity gets default order 1 (?? 1 kills && mutant)", () => {
    // Build insight with an unknown severity value
    const unknown: Insight = {
      id: "unk",
      type: "spending_anomaly",
      page: "budgets",
      severity: "NOT_REAL" as Insight["severity"],
      data: {},
    };
    const attention = mkInsight("att", "attention");
    const positive = mkInsight("pos", "positive");

    const result = computeInsights({
      spendingAnomalies: [unknown, positive, attention],
      subscriptionAlerts: [],
      goalInsights: [],
      dismissedIds: new Set(),
    });

    // attention(0) -> unknown(?? 1) -> positive(2)
    expect(result.map((r) => r.id)).toEqual(["att", "unk", "pos"]);
  });

  it("limits each page to at most 5 insights", () => {
    const anomalies: Insight[] = Array.from({ length: 8 }, (_, i) =>
      mkInsight(`a-${i}`, "attention", "budgets")
    );

    const result = computeInsights({
      spendingAnomalies: anomalies,
      subscriptionAlerts: [],
      goalInsights: [],
      dismissedIds: new Set(),
    });

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual([
      "a-0",
      "a-1",
      "a-2",
      "a-3",
      "a-4",
    ]);
  });

  it("per-page limit applies independently (budgets + bills each up to 5)", () => {
    const budgets: Insight[] = Array.from({ length: 7 }, (_, i) =>
      mkInsight(`bgt-${i}`, "attention", "budgets")
    );
    const bills: Insight[] = Array.from({ length: 7 }, (_, i) =>
      mkInsight(`bill-${i}`, "attention", "bills")
    );

    const result = computeInsights({
      spendingAnomalies: budgets,
      subscriptionAlerts: bills,
      goalInsights: [],
      dismissedIds: new Set(),
    });

    // 5 budgets + 5 bills = 10 total
    expect(result).toHaveLength(10);
    expect(result.filter((r) => r.page === "budgets")).toHaveLength(5);
    expect(result.filter((r) => r.page === "bills")).toHaveLength(5);
  });

  it("merges all three sources", () => {
    const result = computeInsights({
      spendingAnomalies: [mkInsight("a", "attention", "budgets")],
      subscriptionAlerts: [mkInsight("b", "attention", "bills")],
      goalInsights: [mkInsight("c", "positive", "goals")],
      dismissedIds: new Set(),
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when all sources empty", () => {
    expect(
      computeInsights({
        spendingAnomalies: [],
        subscriptionAlerts: [],
        goalInsights: [],
        dismissedIds: new Set(),
      })
    ).toEqual([]);
  });
});
