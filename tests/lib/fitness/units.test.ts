import { describe, it, expect } from "vitest";
import {
  displayWeight,
  toKg,
  formatWeight,
  parseLoadInput,
  weightInputText,
} from "@/lib/fitness/units";
import contract from "@/tests/fixtures/train-measurement-contract.json";

describe("faithful measurement entry", () => {
  it.each(contract.loadCases)("keeps canonical meaning for $text $unit", ({ text, unit, anchorKg }) => {
    expect(parseLoadInput(text, unit as "kg" | "lbs")).toBe(anchorKg);
  });
  it("keeps positive underflow invalid even when the decimal exponent is beyond the arithmetic range", () => {
    expect(parseLoadInput(`1e-${"9".repeat(100)}`, "kg")).toBeNull();
  });
  it("shows tiny and large recorded values in pounds without inventing zero or Infinity", () => {
    expect(weightInputText(5e-324, "lbs")).toBe("1.1023113109243879e-323");
    expect(formatWeight(Number.MAX_VALUE, "lbs")).toBe("3.9632349522597034e+308 lbs");
    expect(formatWeight(0.123, "lbs")).toBe("0.27116858248739942 lbs");
  });
});

describe("displayWeight", () => {
  it("returns value as-is for kg unit", () => {
    expect(displayWeight(100, "kg")).toBe(100);
    expect(displayWeight(75.5, "kg")).toBe(75.5);
  });

  it("converts kilograms using the exact pound ratio", () => {
    expect(displayWeight(100, "lbs")).toBe(220.46226218487757);
  });

  it("retains a fractional display instead of rounding measurements to two decimal places", () => {
    expect(displayWeight(1, "lbs")).toBe(2.2046226218487757);
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

  it("converts pounds with their exact canonical meaning", () => {
    expect(toKg(100, "lbs")).toBe(45.359237);
  });

  it("keeps pounds input canonical in kilograms for storage", () => {
    expect(toKg(50, "lbs")).toBe(22.6796185);
  });

  it("keeps the complete canonical fraction for one pound", () => {
    expect(toKg(1, "lbs")).toBe(0.45359237);
  });

  it("returns 0 for zero with kg unit", () => {
    expect(toKg(0, "kg")).toBe(0);
  });

  it("returns 0 for zero with lbs unit", () => {
    expect(toKg(0, "lbs")).toBe(0);
  });
});

describe("formatWeight", () => {
  it("marks an unrepresentable aggregate unavailable", () => {
    expect(formatWeight(Infinity, "kg")).toBe("—");
  });
  it("returns formatted string with kg suffix", () => {
    expect(formatWeight(100, "kg")).toBe("100 kg");
  });

  it("returns formatted string with lbs suffix", () => {
    expect(formatWeight(100, "lbs")).toBe("220.46226218487758 lbs");
  });

  it("includes the display value and unit for arbitrary weight", () => {
    expect(formatWeight(75, "kg")).toBe("75 kg");
    expect(formatWeight(0, "lbs")).toBe("0 lbs");
  });
});

describe("round-trip conversion", () => {
  it("numeric chart conversions stay within floating point precision", () => {
    const testValues = [100, 75, 50, 1, 0.5];
    for (const x of testValues) {
      const converted = toKg(displayWeight(x, "lbs"), "lbs");
      expect(Math.abs(converted - x)).toBeLessThanOrEqual(1e-12);
    }
  });

  it("round-trip for zero is exactly 0", () => {
    expect(toKg(displayWeight(0, "lbs"), "lbs")).toBe(0);
  });
});
