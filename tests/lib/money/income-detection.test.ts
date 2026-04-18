import { describe, it, expect } from "vitest";
import {
  detectIncomePatterns,
  predictNextIncomeDate,
} from "@/lib/money/income-detection";

// ---------------------------------------------------------------------------
// Helpers to construct transactions at precise intervals
// ---------------------------------------------------------------------------

/** Generate a sequence of dates at an exact day-interval. */
function datesEvery(
  startISODate: string,
  intervalDays: number,
  count: number
): string[] {
  const start = new Date(startISODate + "T12:00:00Z");
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * intervalDays);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

function makeIncomeTxns(
  merchant: string,
  amountCents: number,
  dates: string[]
): { merchant_name: string; amount_cents: number; transaction_date: string }[] {
  return dates.map((d) => ({
    merchant_name: merchant,
    amount_cents: amountCents,
    transaction_date: d,
  }));
}

// ---------------------------------------------------------------------------
// detectIncomePatterns
// ---------------------------------------------------------------------------

describe("detectIncomePatterns", () => {
  // --- Weekly ----------------------------------------------------------
  describe("WEEKLY frequency (median interval 5-9 days)", () => {
    it("classifies exactly-7-day intervals as WEEKLY with high confidence", () => {
      const dates = datesEvery("2025-11-03", 7, 5); // 4 intervals of 7d
      const txns = makeIncomeTxns("Weekly Gig", 100_000, dates);
      const patterns = detectIncomePatterns(txns);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("WEEKLY");
      expect(patterns[0].amount_cents).toBe(100_000);
      expect(patterns[0].confidence).toBe(1); // zero stddev
    });

    it("classifies a 5-day interval boundary as WEEKLY", () => {
      // 5 intervals of 5 days (lowest WEEKLY bound)
      const dates = datesEvery("2025-11-01", 5, 6);
      const txns = makeIncomeTxns("Five Day", 50_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("WEEKLY");
    });

    it("classifies a 9-day interval boundary as WEEKLY", () => {
      const dates = datesEvery("2025-11-01", 9, 6);
      const txns = makeIncomeTxns("Nine Day", 50_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("WEEKLY");
    });

    it("does NOT classify 4-day intervals as any frequency", () => {
      const dates = datesEvery("2025-11-01", 4, 6);
      const txns = makeIncomeTxns("Four Day", 50_000, dates);
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("does NOT classify 10-day intervals as any frequency (between WEEKLY and BIWEEKLY)", () => {
      const dates = datesEvery("2025-11-01", 10, 6);
      const txns = makeIncomeTxns("Ten Day", 50_000, dates);
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });
  });

  // --- Biweekly --------------------------------------------------------
  describe("BIWEEKLY frequency (median 12-14 days)", () => {
    it("classifies 14-day intervals as BIWEEKLY", () => {
      const dates = datesEvery("2025-11-01", 14, 5);
      const txns = makeIncomeTxns("Employer Inc", 250_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("BIWEEKLY");
    });

    it("classifies 12-day intervals as BIWEEKLY (lower boundary)", () => {
      const dates = datesEvery("2025-11-01", 12, 5);
      const txns = makeIncomeTxns("TwelveDay", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("BIWEEKLY");
    });

    it("classifies 14-day intervals at upper biweekly boundary", () => {
      // median 14 -> BIWEEKLY (because < 15)
      const dates = datesEvery("2025-11-01", 14, 5);
      const txns = makeIncomeTxns("FourteenDay", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns[0].frequency).toBe("BIWEEKLY");
    });
  });

  // --- Semi-monthly ----------------------------------------------------
  describe("SEMI_MONTHLY frequency (median 15-16 days)", () => {
    it("classifies 15-day intervals as SEMI_MONTHLY (boundary)", () => {
      const dates = datesEvery("2025-11-01", 15, 5);
      const txns = makeIncomeTxns("Semi", 200_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("SEMI_MONTHLY");
    });

    it("classifies 16-day intervals as SEMI_MONTHLY (upper boundary)", () => {
      const dates = datesEvery("2025-11-01", 16, 5);
      const txns = makeIncomeTxns("SixteenDay", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns[0].frequency).toBe("SEMI_MONTHLY");
    });

    it("does NOT classify 17-day intervals (between SEMI_MONTHLY and MONTHLY)", () => {
      const dates = datesEvery("2025-11-01", 17, 5);
      const txns = makeIncomeTxns("Seventeen", 100_000, dates);
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("does NOT classify 25-day intervals (just below MONTHLY)", () => {
      const dates = datesEvery("2025-11-01", 25, 5);
      const txns = makeIncomeTxns("TwentyFive", 100_000, dates);
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });
  });

  // --- Monthly ---------------------------------------------------------
  describe("MONTHLY frequency (median 26-35 days)", () => {
    it("classifies 30-day intervals as MONTHLY", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = makeIncomeTxns("Acme Corp", 500_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe("MONTHLY");
      expect(patterns[0].amount_cents).toBe(500_000);
    });

    it("classifies 26-day intervals as MONTHLY (lower boundary)", () => {
      const dates = datesEvery("2025-11-01", 26, 4);
      const txns = makeIncomeTxns("TwentySix", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns[0].frequency).toBe("MONTHLY");
    });

    it("classifies 35-day intervals as MONTHLY (upper boundary)", () => {
      const dates = datesEvery("2025-11-01", 35, 4);
      const txns = makeIncomeTxns("ThirtyFive", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns[0].frequency).toBe("MONTHLY");
    });

    it("does NOT classify 36-day intervals", () => {
      const dates = datesEvery("2025-11-01", 36, 4);
      const txns = makeIncomeTxns("ThirtySix", 100_000, dates);
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });
  });

  // --- Confidence ------------------------------------------------------
  describe("confidence filtering", () => {
    it("perfect intervals produce confidence of 1", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = makeIncomeTxns("Perfect", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns[0].confidence).toBe(1);
    });

    it("rejects patterns below 0.7 confidence threshold", () => {
      // Irregular intervals yielding high stddev relative to median
      const txns = [
        { merchant_name: "Unstable", amount_cents: 100_000, transaction_date: "2025-11-01" },
        { merchant_name: "Unstable", amount_cents: 100_000, transaction_date: "2025-11-20" },
        { merchant_name: "Unstable", amount_cents: 100_000, transaction_date: "2025-12-25" },
        { merchant_name: "Unstable", amount_cents: 100_000, transaction_date: "2026-01-05" },
      ];
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("rounds confidence to 2 decimals", () => {
      // Build an interval pattern that produces a non-round confidence
      // 30, 30, 31 — median is 30, one outlier
      const txns = [
        { merchant_name: "MostlyRegular", amount_cents: 100_000, transaction_date: "2025-11-01" },
        { merchant_name: "MostlyRegular", amount_cents: 100_000, transaction_date: "2025-12-01" }, // 30
        { merchant_name: "MostlyRegular", amount_cents: 100_000, transaction_date: "2025-12-31" }, // 30
        { merchant_name: "MostlyRegular", amount_cents: 100_000, transaction_date: "2026-01-31" }, // 31
      ];
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      // confidence should be rounded to 2 decimal places — check < 1 and has at most 2 decimals
      expect(patterns[0].confidence).toBeLessThan(1);
      expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.7);
      // Round trip: Math.round(c * 100) / 100 === c
      expect(Math.round(patterns[0].confidence * 100) / 100).toBe(
        patterns[0].confidence
      );
    });
  });

  // --- Filtering & grouping -------------------------------------------
  describe("filtering", () => {
    it("filters out negative amount transactions (expenses)", () => {
      const incomeDates = datesEvery("2025-11-01", 30, 4);
      const txns = [
        ...makeIncomeTxns("Acme Corp", 500_000, incomeDates),
        { merchant_name: "Acme Corp", amount_cents: -5000, transaction_date: "2025-12-15" },
        { merchant_name: "Acme Corp", amount_cents: -3000, transaction_date: "2026-01-15" },
      ];

      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].amount_cents).toBe(500_000);
    });

    it("filters out zero-amount transactions", () => {
      // 4 zero + 0 real income → no patterns
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = dates.map((d) => ({
        merchant_name: "ZeroCo",
        amount_cents: 0,
        transaction_date: d,
      }));
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("skips transactions with null merchant_name", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = dates.map((d) => ({
        merchant_name: null,
        amount_cents: 500_000,
        transaction_date: d,
      }));
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("skips transactions with whitespace-only merchant_name", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = dates.map((d) => ({
        merchant_name: "  ",
        amount_cents: 500_000,
        transaction_date: d,
      }));
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("skips transactions with empty-string merchant_name", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = dates.map((d) => ({
        merchant_name: "",
        amount_cents: 500_000,
        transaction_date: d,
      }));
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("groups by normalized (trimmed lowercased) merchant name", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      // Mix casing + whitespace — should all group together
      const txns = [
        { merchant_name: "ACME", amount_cents: 100_000, transaction_date: dates[0] },
        { merchant_name: " acme ", amount_cents: 100_000, transaction_date: dates[1] },
        { merchant_name: "Acme", amount_cents: 100_000, transaction_date: dates[2] },
        { merchant_name: "  ACME  ", amount_cents: 100_000, transaction_date: dates[3] },
      ];
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].merchant_name).toBe("acme");
    });
  });

  describe("occurrence threshold", () => {
    it("requires exactly 3+ occurrences: rejects 2", () => {
      const txns = [
        { merchant_name: "OneTimeGig", amount_cents: 100_000, transaction_date: "2026-01-01" },
        { merchant_name: "OneTimeGig", amount_cents: 100_000, transaction_date: "2026-02-01" },
      ];
      expect(detectIncomePatterns(txns)).toHaveLength(0);
    });

    it("accepts 3 occurrences", () => {
      const txns = [
        { merchant_name: "ThreeGig", amount_cents: 100_000, transaction_date: "2025-12-01" },
        { merchant_name: "ThreeGig", amount_cents: 100_000, transaction_date: "2025-12-31" },
        { merchant_name: "ThreeGig", amount_cents: 100_000, transaction_date: "2026-01-30" },
      ];
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
    });
  });

  // --- Median amount ---------------------------------------------------
  describe("amount computation (median)", () => {
    it("uses the median amount, not the average", () => {
      // 3 amounts: 100_000, 200_000, 1_000_000 → median = 200_000 (not 433_333)
      const txns = [
        { merchant_name: "VarAmt", amount_cents: 100_000, transaction_date: "2025-11-01" },
        { merchant_name: "VarAmt", amount_cents: 200_000, transaction_date: "2025-12-01" },
        { merchant_name: "VarAmt", amount_cents: 1_000_000, transaction_date: "2025-12-31" },
        { merchant_name: "VarAmt", amount_cents: 200_000, transaction_date: "2026-01-30" },
      ];
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      // Amounts sorted: [100_000, 200_000, 200_000, 1_000_000]; median of 4 = (200k + 200k) / 2 = 200k
      expect(patterns[0].amount_cents).toBe(200_000);
    });

    it("even-count median averages the two middle values", () => {
      const txns = [
        { merchant_name: "EvenCt", amount_cents: 100_000, transaction_date: "2025-11-01" },
        { merchant_name: "EvenCt", amount_cents: 300_000, transaction_date: "2025-12-01" },
        { merchant_name: "EvenCt", amount_cents: 200_000, transaction_date: "2025-12-31" },
        { merchant_name: "EvenCt", amount_cents: 400_000, transaction_date: "2026-01-30" },
      ];
      const patterns = detectIncomePatterns(txns);
      // Sorted amounts: [100_000, 200_000, 300_000, 400_000]. Median = (200_000 + 300_000) / 2 = 250_000
      expect(patterns[0].amount_cents).toBe(250_000);
    });

    it("odd-count median uses the middle value", () => {
      const txns = [
        { merchant_name: "OddCt", amount_cents: 100_000, transaction_date: "2025-11-01" },
        { merchant_name: "OddCt", amount_cents: 500_000, transaction_date: "2025-12-01" },
        { merchant_name: "OddCt", amount_cents: 300_000, transaction_date: "2025-12-31" },
      ];
      const patterns = detectIncomePatterns(txns);
      // Sorted: [100_000, 300_000, 500_000], median = 300_000
      expect(patterns[0].amount_cents).toBe(300_000);
    });
  });

  // --- Sorting ---------------------------------------------------------
  describe("result ordering", () => {
    it("sorts patterns by amount descending (largest first)", () => {
      const smallDates = datesEvery("2025-11-01", 30, 4);
      const bigDates = datesEvery("2025-11-01", 30, 4);
      const txns = [
        ...makeIncomeTxns("Small Corp", 100_000, smallDates),
        ...makeIncomeTxns("Big Corp", 500_000, bigDates),
      ];

      const patterns = detectIncomePatterns(txns);
      expect(patterns.map((p) => p.merchant_name)).toEqual([
        "big corp",
        "small corp",
      ]);
      expect(patterns.map((p) => p.amount_cents)).toEqual([500_000, 100_000]);
    });

    it("handles three different-amount groups (sort is stable descending)", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = [
        ...makeIncomeTxns("A", 100_000, dates),
        ...makeIncomeTxns("B", 300_000, dates),
        ...makeIncomeTxns("C", 200_000, dates),
      ];
      const patterns = detectIncomePatterns(txns);
      expect(patterns.map((p) => p.amount_cents)).toEqual([
        300_000,
        200_000,
        100_000,
      ]);
    });
  });

  // --- Result schema ---------------------------------------------------
  describe("returned pattern shape", () => {
    it("returns the expected fields on a detected pattern", () => {
      const dates = datesEvery("2025-11-01", 30, 4);
      const txns = makeIncomeTxns("Acme", 100_000, dates);
      const patterns = detectIncomePatterns(txns);
      expect(patterns).toHaveLength(1);
      // last_occurrence is the LAST (most recent) transaction date
      expect(patterns[0].last_occurrence).toBe(dates[3]);
      // next_predicted is computed from predictNextIncomeDate
      expect(patterns[0].next_predicted).toBe(
        predictNextIncomeDate(dates[3], "MONTHLY")
      );
    });
  });

  // --- Empty input -----------------------------------------------------
  it("returns empty array for empty input", () => {
    expect(detectIncomePatterns([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// predictNextIncomeDate
// ---------------------------------------------------------------------------

describe("predictNextIncomeDate", () => {
  it("WEEKLY: adds exactly 7 days", () => {
    expect(predictNextIncomeDate("2026-02-01", "WEEKLY")).toBe("2026-02-08");
  });

  it("WEEKLY: crosses a month boundary correctly", () => {
    expect(predictNextIncomeDate("2026-02-25", "WEEKLY")).toBe("2026-03-04");
  });

  it("BIWEEKLY: adds exactly 14 days", () => {
    expect(predictNextIncomeDate("2026-02-01", "BIWEEKLY")).toBe("2026-02-15");
  });

  it("BIWEEKLY: crosses a month boundary correctly", () => {
    expect(predictNextIncomeDate("2026-02-20", "BIWEEKLY")).toBe("2026-03-06");
  });

  describe("SEMI_MONTHLY", () => {
    it("on the 1st advances to the 15th of same month", () => {
      expect(predictNextIncomeDate("2026-02-01", "SEMI_MONTHLY")).toBe(
        "2026-02-15"
      );
    });

    it("on day 10 (<=14) advances to the 15th of same month", () => {
      expect(predictNextIncomeDate("2026-02-10", "SEMI_MONTHLY")).toBe(
        "2026-02-15"
      );
    });

    it("on day 14 (boundary) advances to the 15th of same month", () => {
      expect(predictNextIncomeDate("2026-02-14", "SEMI_MONTHLY")).toBe(
        "2026-02-15"
      );
    });

    it("on day 15 (just over boundary) advances to the 1st of next month", () => {
      expect(predictNextIncomeDate("2026-02-15", "SEMI_MONTHLY")).toBe(
        "2026-03-01"
      );
    });

    it("on day 28 advances to the 1st of next month", () => {
      expect(predictNextIncomeDate("2026-02-28", "SEMI_MONTHLY")).toBe(
        "2026-03-01"
      );
    });

    it("December 20 wraps to January 1 of next year", () => {
      expect(predictNextIncomeDate("2026-12-20", "SEMI_MONTHLY")).toBe(
        "2027-01-01"
      );
    });
  });

  it("MONTHLY: adds exactly one month", () => {
    expect(predictNextIncomeDate("2026-01-15", "MONTHLY")).toBe("2026-02-15");
  });

  it("MONTHLY: January 31 advances to February 28 (end-of-month clamp)", () => {
    expect(predictNextIncomeDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
  });

  it("MONTHLY: crosses year boundary", () => {
    expect(predictNextIncomeDate("2026-12-15", "MONTHLY")).toBe("2027-01-15");
  });

  it("unknown frequency string falls back to monthly behaviour", () => {
    expect(predictNextIncomeDate("2026-02-01", "UNKNOWN")).toBe("2026-03-01");
  });

  it("empty-string frequency falls back to monthly behaviour", () => {
    expect(predictNextIncomeDate("2026-02-01", "")).toBe("2026-03-01");
  });
});
