import { describe, it, expect } from "vitest";
import {
  displayWeight,
  toKg,
  formatWeight,
} from "@/lib/fitness/units";

describe("displayWeight", () => {
  it("returns value as-is for kg unit", () => {
    expect(displayWeight(100, "kg")).toBe(100);
    expect(displayWeight(75.5, "kg")).toBe(75.5);
  });

  it("converts kg to lbs correctly (100 kg → 220.46 lbs)", () => {
    expect(displayWeight(100, "lbs")).toBe(220.46);
  });

  it("rounds to 2 decimal places", () => {
    const result = displayWeight(1, "lbs");
    const decimals = result.toString().split(".")[1];
    expect(decimals === undefined || decimals.length <= 2).toBe(true);
  });

  it("returns 0 for zero kg with kg unit", () => {
    expect(displayWeight(0, "kg")).toBe(0);
  });

  it("returns 0 for zero kg with lbs unit", () => {
    expect(displayWeight(0, "lbs")).toBe(0);
  });
});

describe("toKg", () => {
  it("returns value as-is for kg unit", () => {
    expect(toKg(100, "kg")).toBe(100);
    expect(toKg(75.5, "kg")).toBe(75.5);
  });

  it("converts lbs to kg correctly (100 lbs → 45.36 kg)", () => {
    expect(toKg(100, "lbs")).toBe(45.36);
  });

  it("rounds to 2 decimal places", () => {
    const result = toKg(1, "lbs");
    const decimals = result.toString().split(".")[1];
    expect(decimals === undefined || decimals.length <= 2).toBe(true);
  });

  it("returns 0 for zero with kg unit", () => {
    expect(toKg(0, "kg")).toBe(0);
  });

  it("returns 0 for zero with lbs unit", () => {
    expect(toKg(0, "lbs")).toBe(0);
  });
});

describe("formatWeight", () => {
  it("returns formatted string with kg suffix", () => {
    expect(formatWeight(100, "kg")).toBe("100 kg");
  });

  it("returns formatted string with lbs suffix", () => {
    expect(formatWeight(100, "lbs")).toBe("220.46 lbs");
  });

  it("includes the display value and unit for arbitrary weight", () => {
    expect(formatWeight(75, "kg")).toBe("75 kg");
    expect(formatWeight(0, "lbs")).toBe("0 lbs");
  });
});

describe("round-trip conversion", () => {
  it("toKg(displayWeight(x, lbs), lbs) ≈ x within rounding tolerance", () => {
    const testValues = [100, 75, 50, 1, 0.5];
    for (const x of testValues) {
      const converted = toKg(displayWeight(x, "lbs"), "lbs");
      expect(Math.abs(converted - x)).toBeLessThanOrEqual(0.01);
    }
  });

  it("round-trip for zero is exactly 0", () => {
    expect(toKg(displayWeight(0, "lbs"), "lbs")).toBe(0);
  });
});
