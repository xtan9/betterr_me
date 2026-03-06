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

  it("handles numeric input", () => {
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

  it("handles large amounts", () => {
    expect(toCents("999999.99")).toBe(99999999);
  });

  it("handles whole dollar amounts (no decimals)", () => {
    expect(toCents("100")).toBe(10000);
  });

  it("handles string '0'", () => {
    expect(toCents("0")).toBe(0);
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

  it("formats negative amounts with minus prefix", () => {
    expect(formatMoney(-1033)).toBe("-$10.33");
  });

  it("formats large amounts with comma grouping", () => {
    expect(formatMoney(123456789)).toBe("$1,234,567.89");
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

  it("converts negative cents", () => {
    expect(centsToDecimal(-550)).toBe("-5.50");
  });
});

describe("addCents", () => {
  it("adds two positive amounts", () => {
    expect(addCents(100, 200)).toBe(300);
  });

  it("adds zero", () => {
    expect(addCents(500, 0)).toBe(500);
  });

  it("adds negative amount (subtraction via addition)", () => {
    expect(addCents(300, -100)).toBe(200);
  });
});

describe("subtractCents", () => {
  it("subtracts two amounts", () => {
    expect(subtractCents(300, 100)).toBe(200);
  });

  it("handles result going negative", () => {
    expect(subtractCents(100, 300)).toBe(-200);
  });

  it("subtracts zero", () => {
    expect(subtractCents(500, 0)).toBe(500);
  });
});
