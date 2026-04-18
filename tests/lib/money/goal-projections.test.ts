import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addMonths, format } from "date-fns";
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
    owner_id: null,
    is_shared: false,
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
  // Anchor system time so test behaviour is deterministic. We compute the
  // three-months-ago boundary using date-fns to match the source's cadence
  // exactly (and avoid TZ sensitivity).
  const NOW = new Date("2026-03-15T00:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 exactly for empty contributions array", () => {
    expect(computeMonthlyRate([])).toBe(0);
  });

  it("returns 0 when all contributions are older than 3 months", () => {
    // Far in the past — well before threeMonthsAgo
    const contribs = [
      makeContribution({ contributed_at: "2024-01-01T00:00:00Z" }),
    ];
    expect(computeMonthlyRate(contribs)).toBe(0);
  });

  it("includes a contribution exactly at the addMonths(-3) boundary (>= kills > mutant)", () => {
    // Boundary contribution: contributed_at = addMonths(now, -3) exactly.
    const threeMonthsAgo = addMonths(NOW, -3);
    const contribs = [
      makeContribution({
        contributed_at: threeMonthsAgo.toISOString(),
        amount_cents: 100_000,
      }),
    ];
    const rate = computeMonthlyRate(contribs);
    // With `>=`: contribution IS included → monthsWithData ≈ 3 → rate ≈ 33_333
    // With `>`:  contribution excluded → rate = 0
    expect(rate).toBeGreaterThan(0);
  });

  it("excludes a contribution 1 ms before the addMonths(-3) boundary", () => {
    const threeMonthsAgo = addMonths(NOW, -3);
    const justBefore = new Date(threeMonthsAgo.getTime() - 1);
    const contribs = [
      makeContribution({
        contributed_at: justBefore.toISOString(),
        amount_cents: 100_000,
      }),
    ];
    expect(computeMonthlyRate(contribs)).toBe(0);
  });

  it("rate = totalCents / monthsWithData (division — kills * mutant)", () => {
    // Two months ago relative to NOW (2026-03-15Z) -> 2026-01-15
    const contribs = [
      makeContribution({
        contributed_at: "2026-01-15T00:00:00Z",
        amount_cents: 60_000,
      }),
    ];
    const rate = computeMonthlyRate(contribs);
    // monthsWithData ≈ 2 → rate ≈ 30_000
    // If `*` were used instead of `/`: rate ≈ 60_000 * 2 = 120_000
    expect(rate).toBeGreaterThan(25_000);
    expect(rate).toBeLessThan(40_000);
  });

  it("uses Math.min of earliest contribution date (not Math.max)", () => {
    // Two contributions far apart: earliest 2 months ago, latest recent.
    const contribs = [
      makeContribution({
        id: "c1",
        contributed_at: "2026-01-15T00:00:00Z", // ~2 months ago
        amount_cents: 10_000,
      }),
      makeContribution({
        id: "c2",
        contributed_at: "2026-03-10T00:00:00Z", // ~5 days ago
        amount_cents: 10_000,
      }),
    ];
    const rate = computeMonthlyRate(contribs);
    // Using Math.min: monthsWithData ≈ 2 → rate ≈ 10_000
    // Using Math.max: monthsWithData ≈ 0.16 → floor = 1 → rate ≈ 20_000
    // The key distinguisher: with min the rate is clamped by the 2-month window.
    expect(rate).toBeLessThan(15_000);
    expect(rate).toBeGreaterThan(5_000);
  });

  it("enforces minimum 1-month window (Math.max(1, ...)) for a single recent contribution", () => {
    // A contribution from ~5 days ago should not produce a rate of
    // 50_000 / 0.16 ≈ 312_500. Floor clamps it.
    const contribs = [
      makeContribution({
        contributed_at: "2026-03-10T00:00:00Z",
        amount_cents: 50_000,
      }),
    ];
    expect(computeMonthlyRate(contribs)).toBe(50_000);
  });

  it("returns 0 when all recent contributions fall outside 3-month window", () => {
    const contribs = [
      makeContribution({ contributed_at: "2024-01-01T00:00:00Z" }),
      makeContribution({ contributed_at: "2024-06-01T00:00:00Z" }),
    ];
    expect(computeMonthlyRate(contribs)).toBe(0);
  });

  it("rounds the rate to the nearest integer cent (Math.round)", () => {
    // 100_000 / 3 = 33_333.33... → rounds to 33_333
    // Just verify rate is a rounded integer (no decimals)
    const threeMonthsAgo = addMonths(NOW, -3);
    const contribs = [
      makeContribution({
        contributed_at: threeMonthsAgo.toISOString(),
        amount_cents: 100_000,
      }),
    ];
    const rate = computeMonthlyRate(contribs);
    expect(Number.isInteger(rate)).toBe(true);
  });
});

describe("getStatusColor", () => {
  it("green when deadline is null regardless of projected date", () => {
    expect(getStatusColor(new Date("2027-01-01"), null)).toBe("green");
    expect(getStatusColor(null, null)).toBe("green");
  });

  it("yellow when projected is null but deadline is set", () => {
    expect(getStatusColor(null, "2026-12-31")).toBe("yellow");
  });

  it("green when projected strictly before deadline", () => {
    expect(getStatusColor(new Date("2026-06-01"), "2026-12-31")).toBe("green");
  });

  it("green at exact boundary: projected === deadline (kills daysLate < 0 mutant)", () => {
    // date-fns differenceInDays between same dates = 0, so daysLate === 0 → green.
    expect(getStatusColor(new Date("2026-06-30"), "2026-06-30")).toBe("green");
  });

  it("yellow when 1 day late (just past green)", () => {
    expect(getStatusColor(new Date("2026-07-01"), "2026-06-30")).toBe("yellow");
  });

  it("yellow at exact 30-day boundary (kills daysLate < 30 mutant)", () => {
    expect(getStatusColor(new Date("2026-07-30"), "2026-06-30")).toBe("yellow");
  });

  it("red when 31 days late (just past yellow)", () => {
    expect(getStatusColor(new Date("2026-07-31"), "2026-06-30")).toBe("red");
  });

  it("red when significantly after deadline", () => {
    expect(getStatusColor(new Date("2027-03-01"), "2026-07-01")).toBe("red");
  });
});

describe("computeProjection", () => {
  const NOW = new Date("2026-03-15T00:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no contributions: null projected_date, zero rate, green (no deadline)", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 0 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBeNull();
    expect(result.monthly_rate_cents).toBe(0);
    expect(result.status_color).toBe("green");
  });

  it("current < target with positive rate: projected_date is non-null and in the future", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 50_000 });
    const contribs = [
      makeContribution({
        contributed_at: "2026-03-10T00:00:00Z",
        amount_cents: 25_000,
      }),
    ];
    const result = computeProjection(goal, contribs);
    expect(result.projected_date).not.toBeNull();
    expect(result.monthly_rate_cents).toBe(25_000);
    // remaining=50_000, rate=25_000 → monthsToGo=2 → projected_date = now+2mo (formatted)
    expect(result.projected_date).toBe(
      format(addMonths(NOW, 2), "yyyy-MM-dd")
    );
  });

  it("goal already met (current === target): projected_date = today", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 100_000 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBe(format(NOW, "yyyy-MM-dd"));
    expect(result.status_color).toBe("green");
  });

  it("current exactly equals target: completed (kills >= boundary -> > mutant)", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 100_000 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBe(format(NOW, "yyyy-MM-dd"));
  });

  it("current exceeds target: projected_date = today", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 150_000 });
    const result = computeProjection(goal, []);
    expect(result.projected_date).toBe(format(NOW, "yyyy-MM-dd"));
  });

  it("current < target but rate is 0: projected_date is null", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 50_000 });
    const result = computeProjection(goal, []); // no contributions -> rate=0
    expect(result.projected_date).toBeNull();
  });

  it("status_color green when no deadline", () => {
    const goal = makeGoal({ deadline: null });
    const result = computeProjection(goal, []);
    expect(result.status_color).toBe("green");
  });

  it("preserves all goal fields on the returned object (spread check)", () => {
    const goal = makeGoal({
      id: "g-1",
      name: "Vacation",
      target_cents: 200_000,
      current_cents: 50_000,
      deadline: "2026-12-31",
      icon: "plane",
      color: "blue",
    });
    const result = computeProjection(goal, []);
    expect(result.id).toBe("g-1");
    expect(result.name).toBe("Vacation");
    expect(result.target_cents).toBe(200_000);
    expect(result.current_cents).toBe(50_000);
    expect(result.deadline).toBe("2026-12-31");
    expect(result.icon).toBe("plane");
    expect(result.color).toBe("blue");
  });

  it("rounds up months-to-go via Math.ceil (1.1 months -> 2)", () => {
    // remaining=11_000. Use a recent contrib such that rate ≈ 10_000
    const goal = makeGoal({ target_cents: 11_000, current_cents: 0 });
    const contribs = [
      makeContribution({
        contributed_at: "2026-03-10T00:00:00Z",
        amount_cents: 10_000,
      }),
    ];
    const result = computeProjection(goal, contribs);
    // rate = 10_000 (min-1-month floor), remaining = 11_000
    // monthsToGo = 1.1 → ceil = 2
    expect(result.projected_date).toBe(
      format(addMonths(NOW, 2), "yyyy-MM-dd")
    );
  });

  it("rate exactly divides remaining: monthsToGo = integer, ceil is identity", () => {
    const goal = makeGoal({ target_cents: 30_000, current_cents: 0 });
    const contribs = [
      makeContribution({
        contributed_at: "2026-03-10T00:00:00Z",
        amount_cents: 10_000,
      }),
    ];
    const result = computeProjection(goal, contribs);
    // rate = 10_000, remaining = 30_000 → monthsToGo = 3 (exact)
    expect(result.projected_date).toBe(
      format(addMonths(NOW, 3), "yyyy-MM-dd")
    );
  });

  it("sets monthly_rate_cents on the returned object", () => {
    const goal = makeGoal({ target_cents: 100_000, current_cents: 0 });
    const contribs = [
      makeContribution({
        contributed_at: "2026-03-10T00:00:00Z",
        amount_cents: 15_000,
      }),
    ];
    const result = computeProjection(goal, contribs);
    expect(result.monthly_rate_cents).toBe(15_000);
  });
});
