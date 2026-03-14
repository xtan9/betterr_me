import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format } from "date-fns";
import {
  computeMonthlyRate,
  getStatusColor,
  computeProjection,
} from "@/lib/money/goal-projections";
import type { SavingsGoal, GoalContribution } from "@/lib/db/types";

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    household_id: "hh-1",
    name: "Test Goal",
    target_cents: 100_000,
    current_cents: 0,
    deadline: null,
    funding_type: "manual",
    linked_account_id: null,
    icon: null,
    color: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<GoalContribution> = {}
): GoalContribution {
  return {
    id: "contrib-1",
    goal_id: "goal-1",
    amount_cents: 10_000,
    note: null,
    contributed_at: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

describe("computeMonthlyRate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for empty contributions", () => {
    expect(computeMonthlyRate([])).toBe(0);
  });

  it("returns 0 when all contributions are older than 3 months", () => {
    const contribs = [
      makeContribution({ contributed_at: "2025-11-01T00:00:00Z" }),
    ];
    expect(computeMonthlyRate(contribs)).toBe(0);
  });

  it("computes rate from recent contributions", () => {
    const contribs = [
      makeContribution({
        contributed_at: "2026-02-01T00:00:00Z",
        amount_cents: 30_000,
      }),
      makeContribution({
        id: "contrib-2",
        contributed_at: "2026-01-15T00:00:00Z",
        amount_cents: 20_000,
      }),
    ];
    const rate = computeMonthlyRate(contribs);
    expect(rate).toBeGreaterThan(0);
  });

  it("returns the total for a single contribution (min 1 month window)", () => {
    const contribs = [
      makeContribution({
        contributed_at: "2026-02-28T00:00:00Z",
        amount_cents: 50_000,
      }),
    ];
    // Single contribution with less than 1 month of data → monthsWithData = 1
    expect(computeMonthlyRate(contribs)).toBe(50_000);
  });
});

describe("getStatusColor", () => {
  it("returns green when no deadline", () => {
    expect(getStatusColor(new Date(), null)).toBe("green");
  });

  it("returns yellow when no projected date but deadline exists", () => {
    expect(getStatusColor(null, "2026-12-31")).toBe("yellow");
  });

  it("returns green when projected before deadline", () => {
    expect(getStatusColor(new Date("2026-06-01"), "2026-12-31")).toBe("green");
  });

  it("returns yellow when projected slightly after deadline (<=30 days)", () => {
    expect(getStatusColor(new Date("2026-07-15"), "2026-07-01")).toBe(
      "yellow"
    );
  });

  it("returns red when projected significantly after deadline (>30 days)", () => {
    expect(getStatusColor(new Date("2027-03-01"), "2026-07-01")).toBe("red");
  });
});

describe("computeProjection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null projected_date with no contributions", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 0 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBeNull();
    expect(result.monthly_rate_cents).toBe(0);
  });

  it("projects a future date based on savings rate", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 50_000 });
    const contribs = [
      makeContribution({
        contributed_at: "2026-02-28T00:00:00Z",
        amount_cents: 25_000,
      }),
    ];
    const result = computeProjection(goal, contribs);
    expect(result.projected_date).not.toBeNull();
    expect(result.monthly_rate_cents).toBe(25_000);
  });

  it("returns today for already-completed goals", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 100_000 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBe(format(new Date(), "yyyy-MM-dd"));
    expect(result.status_color).toBe("green");
  });

  it("sets green status when no deadline", () => {
    const goal = makeGoal({ deadline: null });
    const result = computeProjection(goal, []);
    expect(result.status_color).toBe("green");
  });
});
