import { describe, it, expect } from "vitest";
import {
  detectIncomePatterns,
  predictNextIncomeDate,
} from "@/lib/money/income-detection";

// ---------------------------------------------------------------------------
// Helper: generate transactions for a merchant at regular intervals
// ---------------------------------------------------------------------------

function generateMonthlySalary(
  merchant: string,
  amountCents: number,
  count: number,
  startDate = "2025-11-01"
): { merchant_name: string; amount_cents: number; transaction_date: string }[] {
  const txns = [];
  const start = new Date(startDate + "T12:00:00");
  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setMonth(date.getMonth() + i);
    txns.push({
      merchant_name: merchant,
      amount_cents: amountCents,
      transaction_date: date.toISOString().split("T")[0],
    });
  }
  return txns;
}

function generateBiweeklyPaycheck(
  merchant: string,
  amountCents: number,
  count: number,
  startDate = "2025-11-01"
): { merchant_name: string; amount_cents: number; transaction_date: string }[] {
  const txns = [];
  const start = new Date(startDate + "T12:00:00");
  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i * 14);
    txns.push({
      merchant_name: merchant,
      amount_cents: amountCents,
      transaction_date: date.toISOString().split("T")[0],
    });
  }
  return txns;
}

// ---------------------------------------------------------------------------
// detectIncomePatterns
// ---------------------------------------------------------------------------

describe("detectIncomePatterns", () => {
  it("detects monthly salary (same merchant, ~30d intervals)", () => {
    const txns = generateMonthlySalary("Acme Corp", 500_000, 4);
    const patterns = detectIncomePatterns(txns);

    expect(patterns.length).toBe(1);
    expect(patterns[0].merchant_name).toBe("acme corp");
    expect(patterns[0].amount_cents).toBe(500_000);
    expect(patterns[0].frequency).toBe("MONTHLY");
    expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("detects biweekly paycheck (~14d intervals)", () => {
    const txns = generateBiweeklyPaycheck("Employer Inc", 250_000, 4);
    const patterns = detectIncomePatterns(txns);

    expect(patterns.length).toBe(1);
    expect(patterns[0].merchant_name).toBe("employer inc");
    expect(patterns[0].frequency).toBe("BIWEEKLY");
    expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("filters out expenses (amount_cents < 0)", () => {
    const txns = [
      ...generateMonthlySalary("Acme Corp", 500_000, 4),
      { merchant_name: "Acme Corp", amount_cents: -5000, transaction_date: "2025-12-15" },
      { merchant_name: "Acme Corp", amount_cents: -3000, transaction_date: "2026-01-15" },
    ];

    const patterns = detectIncomePatterns(txns);
    // Should still detect the 4 positive occurrences only
    expect(patterns.length).toBe(1);
    expect(patterns[0].amount_cents).toBe(500_000);
  });

  it("requires 3+ occurrences", () => {
    const txns = [
      { merchant_name: "OneTimeGig", amount_cents: 100_000, transaction_date: "2026-01-01" },
      { merchant_name: "OneTimeGig", amount_cents: 100_000, transaction_date: "2026-02-01" },
    ];

    const patterns = detectIncomePatterns(txns);
    expect(patterns.length).toBe(0);
  });

  it("low confidence patterns filtered out", () => {
    // Irregular intervals (not matching any pattern)
    const txns = [
      { merchant_name: "Random Co", amount_cents: 50_000, transaction_date: "2025-11-01" },
      { merchant_name: "Random Co", amount_cents: 50_000, transaction_date: "2025-11-20" },
      { merchant_name: "Random Co", amount_cents: 50_000, transaction_date: "2025-12-25" },
      { merchant_name: "Random Co", amount_cents: 50_000, transaction_date: "2026-01-05" },
    ];

    const patterns = detectIncomePatterns(txns);
    // Intervals: 19, 35, 11 — median ~19 doesn't classify, should return empty
    expect(patterns.length).toBe(0);
  });

  it("null merchant_name transactions skipped", () => {
    const txns = [
      { merchant_name: null, amount_cents: 500_000, transaction_date: "2025-11-01" },
      { merchant_name: null, amount_cents: 500_000, transaction_date: "2025-12-01" },
      { merchant_name: null, amount_cents: 500_000, transaction_date: "2026-01-01" },
      { merchant_name: null, amount_cents: 500_000, transaction_date: "2026-02-01" },
    ];

    const patterns = detectIncomePatterns(txns);
    expect(patterns.length).toBe(0);
  });

  it("empty merchant_name transactions skipped", () => {
    const txns = [
      { merchant_name: "  ", amount_cents: 500_000, transaction_date: "2025-11-01" },
      { merchant_name: "  ", amount_cents: 500_000, transaction_date: "2025-12-01" },
      { merchant_name: "  ", amount_cents: 500_000, transaction_date: "2026-01-01" },
    ];

    const patterns = detectIncomePatterns(txns);
    expect(patterns.length).toBe(0);
  });

  it("sorts patterns by amount descending", () => {
    const txns = [
      ...generateMonthlySalary("Small Corp", 100_000, 4),
      ...generateMonthlySalary("Big Corp", 500_000, 4),
    ];

    const patterns = detectIncomePatterns(txns);
    expect(patterns.length).toBe(2);
    expect(patterns[0].merchant_name).toBe("big corp");
    expect(patterns[1].merchant_name).toBe("small corp");
  });
});

// ---------------------------------------------------------------------------
// predictNextIncomeDate
// ---------------------------------------------------------------------------

describe("predictNextIncomeDate", () => {
  it("WEEKLY: adds 7 days", () => {
    expect(predictNextIncomeDate("2026-02-01", "WEEKLY")).toBe("2026-02-08");
  });

  it("BIWEEKLY: adds 14 days", () => {
    expect(predictNextIncomeDate("2026-02-01", "BIWEEKLY")).toBe("2026-02-15");
  });

  it("SEMI_MONTHLY: from before 15th goes to 15th", () => {
    expect(predictNextIncomeDate("2026-02-01", "SEMI_MONTHLY")).toBe(
      "2026-02-15"
    );
  });

  it("SEMI_MONTHLY: from after 15th goes to 1st of next month", () => {
    expect(predictNextIncomeDate("2026-02-15", "SEMI_MONTHLY")).toBe(
      "2026-03-01"
    );
  });

  it("MONTHLY: adds one month", () => {
    expect(predictNextIncomeDate("2026-01-15", "MONTHLY")).toBe("2026-02-15");
  });

  it("unknown frequency defaults to monthly", () => {
    expect(predictNextIncomeDate("2026-02-01", "UNKNOWN")).toBe("2026-03-01");
  });
});
