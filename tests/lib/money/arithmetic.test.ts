import { describe, it, expect } from "vitest";
import {
  toCents,
  formatMoney,
  centsToDecimal,
  addCents,
  subtractCents,
} from "@/lib/money/arithmetic";

describe("toCents", () => {
  it("converts $10.33 to 1033", () => {
    expect(toCents("10.33")).toBe(1033);
  });

  it("converts $0.07 to 7", () => {
    expect(toCents("0.07")).toBe(7);
  });

  it("converts $19.99 to 1999", () => {
    expect(toCents("19.99")).toBe(1999);
  });

  it("converts 0 to 0", () => {
    expect(toCents(0)).toBe(0);
  });

  it("handles numeric input (10.33 -> 1033)", () => {
    expect(toCents(10.33)).toBe(1033);
  });

  it("avoids floating-point errors: $0.1 + $0.2 = 30 cents", () => {
    // This is the classic floating-point trap: 0.1 + 0.2 = 0.30000000000000004
    // Converting each independently via decimal.js should yield exact cents
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
  });

  it("handles pre-computed float 0.1 + 0.2 directly", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("handles negative amounts", () => {
    expect(toCents("-5.50")).toBe(-550);
  });

  it("handles large amounts: $999,999.99 -> 99_999_999", () => {
    expect(toCents("999999.99")).toBe(99_999_999);
  });

  it("handles whole dollar amounts (no decimals)", () => {
    expect(toCents("100")).toBe(10000);
  });

  it("handles string '0'", () => {
    expect(toCents("0")).toBe(0);
  });

  it("rounds half-up: 0.125 -> 13 cents", () => {
    // 12.5 cents rounds up to 13 with ROUND_HALF_UP
    expect(toCents("0.125")).toBe(13);
  });

  it("rounds half-up on negative: -0.125 -> -13 cents (half rounds away from zero)", () => {
    // In decimal.js, ROUND_HALF_UP rounds halves AWAY from zero, so -12.5 -> -13.
    expect(toCents("-0.125")).toBe(-13);
  });

  it("truncates precision beyond cents when rounding down: 0.004 -> 0", () => {
    expect(toCents("0.004")).toBe(0);
  });

  it("rounds up beyond cents when half-or-more: 0.005 -> 1", () => {
    expect(toCents("0.005")).toBe(1);
  });
});

describe("formatMoney", () => {
  it("formats 1033 cents as $10.33", () => {
    expect(formatMoney(1033)).toBe("$10.33");
  });

  it("formats 7 cents as $0.07", () => {
    expect(formatMoney(7)).toBe("$0.07");
  });

  it("formats 0 cents as $0.00", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats negative amounts with minus prefix: -1033 -> '-$10.33'", () => {
    expect(formatMoney(-1033)).toBe("-$10.33");
  });

  it("formats large amounts with en-US comma grouping: 123456789 -> $1,234,567.89", () => {
    // Both the locale "en-US" (comma grouping) AND the 2-decimal options
    // are verified by this exact string match.
    expect(formatMoney(123_456_789)).toBe("$1,234,567.89");
  });

  it("formats thousands with comma grouping: 100_000 -> '$1,000.00'", () => {
    expect(formatMoney(100_000)).toBe("$1,000.00");
  });

  it("always shows two decimal places for whole dollar amounts", () => {
    expect(formatMoney(1000)).toBe("$10.00");
  });

  it("formats single cent correctly", () => {
    expect(formatMoney(1)).toBe("$0.01");
  });

  it("formats negative single cent", () => {
    expect(formatMoney(-1)).toBe("-$0.01");
  });

  it("negative large number uses minus prefix + $ (not parenthesised)", () => {
    expect(formatMoney(-123_456_789)).toBe("-$1,234,567.89");
  });

  it("does NOT use parentheses for negatives", () => {
    expect(formatMoney(-500)).not.toContain("(");
    expect(formatMoney(-500)).not.toContain(")");
  });

  it("starts with $ for positive amounts (no locale-specific currency code)", () => {
    expect(formatMoney(500).startsWith("$")).toBe(true);
  });
});

describe("centsToDecimal", () => {
  it("converts 1033 to '10.33'", () => {
    expect(centsToDecimal(1033)).toBe("10.33");
  });

  it("converts 7 to '0.07'", () => {
    expect(centsToDecimal(7)).toBe("0.07");
  });

  it("converts 0 to '0.00'", () => {
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("converts 10000 to '100.00'", () => {
    expect(centsToDecimal(10000)).toBe("100.00");
  });

  it("converts negative cents: -550 -> '-5.50'", () => {
    expect(centsToDecimal(-550)).toBe("-5.50");
  });

  it("preserves trailing zero (e.g. 10 -> '0.10', not '0.1')", () => {
    expect(centsToDecimal(10)).toBe("0.10");
  });
});

describe("addCents", () => {
  it("adds two positive amounts: 100 + 200 = 300", () => {
    expect(addCents(100, 200)).toBe(300);
  });

  it("adds zero: 500 + 0 = 500", () => {
    expect(addCents(500, 0)).toBe(500);
  });

  it("adds negative amount (subtraction via addition): 300 + (-100) = 200", () => {
    expect(addCents(300, -100)).toBe(200);
  });

  it("adds two negatives: -100 + -200 = -300", () => {
    expect(addCents(-100, -200)).toBe(-300);
  });
});

describe("subtractCents", () => {
  it("subtracts two amounts: 300 - 100 = 200", () => {
    expect(subtractCents(300, 100)).toBe(200);
  });

  it("handles result going negative: 100 - 300 = -200", () => {
    expect(subtractCents(100, 300)).toBe(-200);
  });

  it("subtracts zero: 500 - 0 = 500", () => {
    expect(subtractCents(500, 0)).toBe(500);
  });

  it("subtracts a negative (adds): 100 - (-50) = 150", () => {
    expect(subtractCents(100, -50)).toBe(150);
  });
});
