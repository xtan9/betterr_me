import { describe, it, expect } from "vitest";
import {
  projectDailyBalances,
  computeAvailableMoney,
  computeEndOfMonthBalance,
  computeDailySpendingRate,
  getDangerZoneStatus,
} from "@/lib/money/projections";

// ---------------------------------------------------------------------------
// projectDailyBalances
// ---------------------------------------------------------------------------

describe("projectDailyBalances", () => {
  it("basic case: balance decreases by spending rate each day", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000, // $1,000
      upcomingBills: [],
      dailySpendingRateCents: 5_000, // $50/day
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });

    // Day 0: 100_000 (no deduction on start day)
    // Day 1: 100_000 - 5_000 = 95_000
    // Day 2: 95_000 - 5_000 = 90_000
    expect(result).toHaveLength(3);
    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[1].projected_balance_cents).toBe(95_000);
    expect(result[2].projected_balance_cents).toBe(90_000);
  });

  it("bill on specific day reduces balance", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [{ amount_cents: -20_000, due_date: "2026-02-02" }],
      dailySpendingRateCents: 5_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });

    // Day 0: 100_000
    // Day 1: 100_000 - 5_000 + (-20_000) = 75_000
    // Day 2: 75_000 - 5_000 = 70_000
    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[1].projected_balance_cents).toBe(75_000);
    expect(result[1].bill_total_cents).toBe(-20_000);
    expect(result[2].projected_balance_cents).toBe(70_000);
  });

  it("income on specific day increases balance", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 50_000,
      upcomingBills: [],
      dailySpendingRateCents: 5_000,
      confirmedIncome: [
        {
          amount_cents: 200_000,
          next_date: "2026-02-02",
          frequency: "MONTHLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });

    // Day 0: 50_000
    // Day 1: 50_000 - 5_000 + 200_000 = 245_000
    // Day 2: 245_000 - 5_000 = 240_000
    expect(result[0].projected_balance_cents).toBe(50_000);
    expect(result[1].projected_balance_cents).toBe(245_000);
    expect(result[1].has_income).toBe(true);
    expect(result[2].projected_balance_cents).toBe(240_000);
  });

  it("empty bills/income arrays handled gracefully", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [],
      startDate: "2026-02-01",
      endDate: "2026-02-01",
    });

    expect(result).toHaveLength(1);
    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[0].has_income).toBe(false);
    expect(result[0].bill_total_cents).toBe(0);
  });

  it("null confirmedIncome handled gracefully", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 1_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-02",
    });

    expect(result).toHaveLength(2);
    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[1].projected_balance_cents).toBe(99_000);
  });
});

// ---------------------------------------------------------------------------
// computeAvailableMoney
// ---------------------------------------------------------------------------

describe("computeAvailableMoney", () => {
  it("with bills reduces available amount", () => {
    const result = computeAvailableMoney(100_000, [
      { amount_cents: -20_000 },
      { amount_cents: -10_000 },
    ]);

    // 100_000 + (-20_000) + (-10_000) = 70_000
    expect(result).toBe(70_000);
  });

  it("without bills returns current balance", () => {
    const result = computeAvailableMoney(100_000, []);
    expect(result).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// computeEndOfMonthBalance
// ---------------------------------------------------------------------------

describe("computeEndOfMonthBalance", () => {
  it("simple arithmetic check", () => {
    // current(100k) + income(200k) + bills(-50k) - spending(5k * 10 days)
    const result = computeEndOfMonthBalance(
      100_000, // currentBalanceCents
      5_000,   // dailySpendingRateCents
      10,      // daysRemaining
      -50_000, // upcomingBillsCents (negative)
      200_000  // expectedIncomeCents
    );

    // 100_000 + 200_000 + (-50_000) - (5_000 * 10) = 200_000
    expect(result).toBe(200_000);
  });

  it("can produce negative balance", () => {
    const result = computeEndOfMonthBalance(
      10_000,  // currentBalanceCents
      5_000,   // dailySpendingRateCents
      30,      // daysRemaining
      -20_000, // upcomingBillsCents
      0        // expectedIncomeCents
    );

    // 10_000 + 0 + (-20_000) - (5_000 * 30) = -160_000
    expect(result).toBe(-160_000);
  });
});

// ---------------------------------------------------------------------------
// computeDailySpendingRate
// ---------------------------------------------------------------------------

describe("computeDailySpendingRate", () => {
  it("filters outflows only, correct average", () => {
    const transactions = [
      { amount_cents: -10_000, transaction_date: "2026-02-01" },
      { amount_cents: -20_000, transaction_date: "2026-02-05" },
      { amount_cents: 50_000, transaction_date: "2026-02-03" }, // income (ignored)
    ];

    const result = computeDailySpendingRate(
      transactions,
      "2026-02-01",
      "2026-02-11"
    );

    // Total outflow: 10_000 + 20_000 = 30_000
    // Days: 10
    // Rate: 30_000 / 10 = 3_000
    expect(result).toBe(3_000);
  });

  it("empty transactions returns 0", () => {
    const result = computeDailySpendingRate([], "2026-02-01", "2026-02-10");
    expect(result).toBe(0);
  });

  it("all income (no outflows) returns 0", () => {
    const transactions = [
      { amount_cents: 50_000, transaction_date: "2026-02-01" },
      { amount_cents: 30_000, transaction_date: "2026-02-05" },
    ];

    const result = computeDailySpendingRate(
      transactions,
      "2026-02-01",
      "2026-02-10"
    );

    expect(result).toBe(0);
  });

  it("zero day range returns 0", () => {
    const transactions = [
      { amount_cents: -10_000, transaction_date: "2026-02-01" },
    ];

    const result = computeDailySpendingRate(
      transactions,
      "2026-02-01",
      "2026-02-01"
    );

    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDangerZoneStatus
// ---------------------------------------------------------------------------

describe("getDangerZoneStatus", () => {
  it("returns 'danger' when projected balance <= 0", () => {
    expect(getDangerZoneStatus(0, 5_000)).toBe("danger");
    expect(getDangerZoneStatus(-10_000, 5_000)).toBe("danger");
  });

  it("returns 'tight' when balance > 0 but less than 2 days of spending", () => {
    expect(getDangerZoneStatus(5_000, 5_000)).toBe("tight");
    expect(getDangerZoneStatus(9_999, 5_000)).toBe("tight");
  });

  it("returns 'safe' when balance >= 2 days of spending", () => {
    expect(getDangerZoneStatus(10_000, 5_000)).toBe("safe");
    expect(getDangerZoneStatus(100_000, 5_000)).toBe("safe");
  });
});
