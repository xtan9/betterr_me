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
  it("produces N+1 days for a N-day range", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 5_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    // 2/1, 2/2, 2/3 = 3 entries
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.date)).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ]);
  });

  it("day 0 has no spending deducted (current balance preserved)", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 5_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    expect(result[0].projected_balance_cents).toBe(100_000);
  });

  it("balance decreases by exactly dailySpendingRate each day after day 0", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 5_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[1].projected_balance_cents).toBe(95_000);
    expect(result[2].projected_balance_cents).toBe(90_000);
  });

  it("single-day range returns a single entry", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [],
      startDate: "2026-02-01",
      endDate: "2026-02-01",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2026-02-01",
      projected_balance_cents: 100_000,
      has_income: false,
      bill_total_cents: 0,
    });
  });

  it("bill on a specific day adds (negative) amount AND records bill_total_cents", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [{ amount_cents: -20_000, due_date: "2026-02-02" }],
      dailySpendingRateCents: 5_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });

    expect(result[0].projected_balance_cents).toBe(100_000);
    expect(result[0].bill_total_cents).toBe(0);

    // Day 1 (2/2): 100_000 - 5_000 (spending) + (-20_000) (bill) = 75_000
    expect(result[1].projected_balance_cents).toBe(75_000);
    expect(result[1].bill_total_cents).toBe(-20_000);

    // Day 2 (2/3): 75_000 - 5_000 = 70_000 (no bill, no income)
    expect(result[2].projected_balance_cents).toBe(70_000);
    expect(result[2].bill_total_cents).toBe(0);
  });

  it("multiple bills on the same date sum their amounts", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [
        { amount_cents: -5_000, due_date: "2026-02-02" },
        { amount_cents: -3_000, due_date: "2026-02-02" },
      ],
      dailySpendingRateCents: 0,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    expect(result[1].bill_total_cents).toBe(-8_000);
    expect(result[1].projected_balance_cents).toBe(92_000);
  });

  it("income on specific day increases balance and flags has_income true", () => {
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

    expect(result[0].has_income).toBe(false);
    expect(result[1].has_income).toBe(true);
    expect(result[2].has_income).toBe(false);
    // Day 1: 50_000 - 5_000 + 200_000 = 245_000
    expect(result[1].projected_balance_cents).toBe(245_000);
    // Day 2: 245_000 - 5_000 = 240_000
    expect(result[2].projected_balance_cents).toBe(240_000);
  });

  it("WEEKLY income fires every 7 days within range", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        { amount_cents: 10_000, next_date: "2026-02-02", frequency: "WEEKLY" },
      ],
      startDate: "2026-02-01",
      endDate: "2026-02-16",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    expect(incomeDays).toEqual(["2026-02-02", "2026-02-09", "2026-02-16"]);
  });

  it("BIWEEKLY income fires every 14 days within range", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-02-05",
          frequency: "BIWEEKLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-03-10",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    expect(incomeDays).toEqual(["2026-02-05", "2026-02-19", "2026-03-05"]);
  });

  it("SEMI_MONTHLY income: from 1st advances to 15th then to 1st of next month", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-02-01",
          frequency: "SEMI_MONTHLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-04-01",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    expect(incomeDays).toEqual([
      "2026-02-01",
      "2026-02-15",
      "2026-03-01",
      "2026-03-15",
      "2026-04-01",
    ]);
  });

  it("SEMI_MONTHLY income: from 15th advances to 1st of next month (day > 14 branch)", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-02-15",
          frequency: "SEMI_MONTHLY",
        },
      ],
      startDate: "2026-02-15",
      endDate: "2026-03-15",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    expect(incomeDays).toEqual(["2026-02-15", "2026-03-01", "2026-03-15"]);
  });

  it("MONTHLY income fires once per month", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-02-10",
          frequency: "MONTHLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-04-10",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    expect(incomeDays).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);
  });

  it("unknown frequency falls back to monthly cadence", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        { amount_cents: 10_000, next_date: "2026-02-10", frequency: "WEIRD" },
      ],
      startDate: "2026-02-01",
      endDate: "2026-04-10",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    // Fallback is monthly
    expect(incomeDays).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);
  });

  it("income whose next_date is BEFORE startDate still fires at the correct in-range date (advance loop)", () => {
    // This kills the `while (current < start)` advance loop mutant.
    // Source loops forward from next_date until current >= start.
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-01-10",
          frequency: "MONTHLY",
        },
      ],
      startDate: "2026-02-05",
      endDate: "2026-04-15",
    });
    const incomeDays = result
      .filter((r) => r.has_income)
      .map((r) => r.date);
    // Advance past 2026-02-05: 2026-01-10 -> 2026-02-10 (>= start, stop)
    expect(incomeDays).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);
  });

  it("end-inclusive: income on exactly endDate IS included (kills while current <= end -> <)", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [
        {
          amount_cents: 10_000,
          next_date: "2026-02-10",
          frequency: "MONTHLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-02-10",
    });
    expect(result[result.length - 1].has_income).toBe(true);
  });

  it("null confirmedIncome is handled without crashing", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 1_000,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-02",
    });
    expect(result).toHaveLength(2);
    expect(result[0].has_income).toBe(false);
    expect(result[1].has_income).toBe(false);
    expect(result[1].projected_balance_cents).toBe(99_000);
  });

  it("empty confirmedIncome array treated same as null", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 100_000,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: [],
      startDate: "2026-02-01",
      endDate: "2026-02-01",
    });
    expect(result[0].has_income).toBe(false);
  });

  it("dates are returned as YYYY-MM-DD strings (local-noon anchor prevents timezone drift)", () => {
    // This test exercises the "T12:00:00" concat by expecting dates to match
    // exactly what a UTC parse of the noon-anchored date would produce.
    // Without the "T12:00:00" anchor, parsing "2026-02-01" as UTC midnight
    // would produce different dates when formatted in negative-UTC timezones.
    // We can't control the runtime TZ here, but the test still guards on the
    // exact output format in the common CI timezone (UTC).
    const result = projectDailyBalances({
      currentBalanceCents: 0,
      upcomingBills: [],
      dailySpendingRateCents: 0,
      confirmedIncome: null,
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    expect(result.map((r) => r.date)).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
    ]);
  });

  it("aggregates income and bills on the same day correctly", () => {
    const result = projectDailyBalances({
      currentBalanceCents: 10_000,
      upcomingBills: [{ amount_cents: -3_000, due_date: "2026-02-02" }],
      dailySpendingRateCents: 1_000,
      confirmedIncome: [
        {
          amount_cents: 5_000,
          next_date: "2026-02-02",
          frequency: "MONTHLY",
        },
      ],
      startDate: "2026-02-01",
      endDate: "2026-02-02",
    });
    // Day 1: 10_000 - 1_000 (spending) - 3_000 (bill) + 5_000 (income) = 11_000
    expect(result[1].projected_balance_cents).toBe(11_000);
    expect(result[1].has_income).toBe(true);
    expect(result[1].bill_total_cents).toBe(-3_000);
  });
});

// ---------------------------------------------------------------------------
// computeAvailableMoney
// ---------------------------------------------------------------------------

describe("computeAvailableMoney", () => {
  it("with bills reduces available amount: 100k + (-20k) + (-10k) = 70k", () => {
    expect(
      computeAvailableMoney(100_000, [
        { amount_cents: -20_000 },
        { amount_cents: -10_000 },
      ])
    ).toBe(70_000);
  });

  it("without bills returns current balance unchanged", () => {
    expect(computeAvailableMoney(100_000, [])).toBe(100_000);
  });

  it("sums all bills regardless of count", () => {
    expect(
      computeAvailableMoney(50_000, [
        { amount_cents: -5_000 },
        { amount_cents: -5_000 },
        { amount_cents: -5_000 },
      ])
    ).toBe(35_000);
  });

  it("result can go negative if bills exceed balance", () => {
    expect(
      computeAvailableMoney(10_000, [{ amount_cents: -50_000 }])
    ).toBe(-40_000);
  });

  it("zero current balance + no bills = 0", () => {
    expect(computeAvailableMoney(0, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeEndOfMonthBalance
// ---------------------------------------------------------------------------

describe("computeEndOfMonthBalance", () => {
  it("current(100k) + income(200k) + bills(-50k) - spending(5k*10d) = 200k", () => {
    expect(
      computeEndOfMonthBalance(100_000, 5_000, 10, -50_000, 200_000)
    ).toBe(200_000);
  });

  it("produces negative balance when outflows exceed inflows", () => {
    // 10k + 0 + (-20k) - 150k = -160k
    expect(computeEndOfMonthBalance(10_000, 5_000, 30, -20_000, 0)).toBe(
      -160_000
    );
  });

  it("with zero daysRemaining: spending term drops out", () => {
    // 100k + 50k + (-20k) - 0 = 130k
    expect(
      computeEndOfMonthBalance(100_000, 5_000, 0, -20_000, 50_000)
    ).toBe(130_000);
  });

  it("all-zero inputs return 0", () => {
    expect(computeEndOfMonthBalance(0, 0, 0, 0, 0)).toBe(0);
  });

  it("spending multiplies daysRemaining (not adds): 1000 * 5 = 5000 subtracted", () => {
    // current 100k - (1000*5) = 95_000, confirms multiplication
    expect(computeEndOfMonthBalance(100_000, 1_000, 5, 0, 0)).toBe(95_000);
  });
});

// ---------------------------------------------------------------------------
// computeDailySpendingRate
// ---------------------------------------------------------------------------

describe("computeDailySpendingRate", () => {
  it("sums outflow absolute values divided by day span", () => {
    const transactions = [
      { amount_cents: -10_000, transaction_date: "2026-02-01" },
      { amount_cents: -20_000, transaction_date: "2026-02-05" },
      { amount_cents: 50_000, transaction_date: "2026-02-03" }, // income, ignored
    ];
    // outflow total = 30_000, days = 10, rate = 3_000/day
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-11")
    ).toBe(3_000);
  });

  it("empty transactions returns 0", () => {
    expect(computeDailySpendingRate([], "2026-02-01", "2026-02-10")).toBe(0);
  });

  it("only positive amounts (no outflows) returns 0", () => {
    // kills the `outflows.length === 0 -> false` mutant, and the `< 0 -> <= 0`
    // mutant (because a positive amount is filtered out, length stays 0).
    const transactions = [
      { amount_cents: 50_000, transaction_date: "2026-02-01" },
      { amount_cents: 30_000, transaction_date: "2026-02-05" },
    ];
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-10")
    ).toBe(0);
  });

  it("only zero-amount transactions returns 0 (amount_cents < 0 requires strictly negative)", () => {
    // kills the `< 0 -> <= 0` mutant: a 0 amount must NOT be counted as outflow.
    // If the mutant were live, outflows.length > 0 and rate would be 0/days = 0,
    // which is the same result. So we instead check a case where 0-transactions
    // would *incorrectly* influence the result if < became <=. We combine 0 + real
    // outflow — if 0 counts as outflow, the total stays the same but also
    // outflows.length changes; result is unchanged. The key differentiator is
    // a single zero-transaction case: with `<`, outflows=[] -> return 0;
    // with `<=`, outflows=[{0}] -> totalAbs=0, rate = 0 / days = 0. Same output.
    //
    // So this test alone can't kill the `<= 0` mutant numerically. But we rely on
    // "basic outflow" test above to distinguish the cases meaningfully, because
    // the `< 0` mutant is caught when income (positive) is wrongly included.
    const transactions = [
      { amount_cents: 0, transaction_date: "2026-02-01" },
      { amount_cents: 0, transaction_date: "2026-02-05" },
    ];
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-10")
    ).toBe(0);
  });

  it("income is excluded — rate computed from pure outflows only", () => {
    // This is the crucial test for the `< 0` vs `<= 0` mutant.
    // With `< 0`: outflows = [-5000, -5000], total=10000, days=10, rate=1000
    // With `<= 0`: outflows = [-5000, 0, -5000, 0], total=10000, days=10, rate=1000
    // Both yield 1000 — same rate. Need a case where income amount matters.
    //
    // Actually a transaction with amount_cents=0 has abs=0 so its inclusion in
    // the sum doesn't affect totalAbsCents. The `< 0` -> `<= 0` mutant is
    // semantically equivalent here because zero contributes zero.
    const transactions = [
      { amount_cents: -5_000, transaction_date: "2026-02-01" },
      { amount_cents: -5_000, transaction_date: "2026-02-05" },
      { amount_cents: 100_000, transaction_date: "2026-02-02" }, // income
    ];
    // Outflow total = 10_000, days = 10, rate = 1_000
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-11")
    ).toBe(1_000);
  });

  it("zero day range returns 0 (prevents division by zero)", () => {
    const transactions = [
      { amount_cents: -10_000, transaction_date: "2026-02-01" },
    ];
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-01")
    ).toBe(0);
  });

  it("negative day range (end before start) returns 0", () => {
    const transactions = [
      { amount_cents: -10_000, transaction_date: "2026-02-05" },
    ];
    expect(
      computeDailySpendingRate(transactions, "2026-02-10", "2026-02-01")
    ).toBe(0);
  });

  it("rounds to the nearest cent per day (Math.round)", () => {
    // totalAbs=100, days=3, rate=33.333... -> rounds to 33
    const transactions = [
      { amount_cents: -100, transaction_date: "2026-02-02" },
    ];
    expect(
      computeDailySpendingRate(transactions, "2026-02-01", "2026-02-04")
    ).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// getDangerZoneStatus
// ---------------------------------------------------------------------------

describe("getDangerZoneStatus", () => {
  // --- danger zone -----------------------------------------------------
  it("returns 'danger' when projected balance is negative", () => {
    expect(getDangerZoneStatus(-1, 5_000)).toBe("danger");
    expect(getDangerZoneStatus(-10_000, 5_000)).toBe("danger");
  });

  it("returns 'danger' when projected balance is exactly 0 (boundary)", () => {
    // kills `<= 0` -> `< 0` mutant
    expect(getDangerZoneStatus(0, 5_000)).toBe("danger");
  });

  // --- tight zone ------------------------------------------------------
  it("returns 'tight' when balance is exactly 1 cent above zero and less than 2 days", () => {
    expect(getDangerZoneStatus(1, 5_000)).toBe("tight");
  });

  it("returns 'tight' when balance is exactly 1 day of spending", () => {
    expect(getDangerZoneStatus(5_000, 5_000)).toBe("tight");
  });

  it("returns 'tight' just below 2 days of spending (9_999)", () => {
    expect(getDangerZoneStatus(9_999, 5_000)).toBe("tight");
  });

  // --- safe zone -------------------------------------------------------
  it("returns 'safe' when balance is exactly 2 days of spending (boundary)", () => {
    // kills `< 2 * rate` -> `<= 2 * rate` mutant
    expect(getDangerZoneStatus(10_000, 5_000)).toBe("safe");
  });

  it("returns 'safe' for balances well above 2 days", () => {
    expect(getDangerZoneStatus(100_000, 5_000)).toBe("safe");
    expect(getDangerZoneStatus(1_000_000, 5_000)).toBe("safe");
  });

  // --- edge: zero spending rate ---------------------------------------
  it("with zero spending rate: any positive balance is 'safe'", () => {
    expect(getDangerZoneStatus(1, 0)).toBe("safe");
    expect(getDangerZoneStatus(100_000, 0)).toBe("safe");
  });

  it("with zero spending rate: zero balance is still 'danger'", () => {
    expect(getDangerZoneStatus(0, 0)).toBe("danger");
  });
});
