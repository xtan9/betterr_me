import { describe, expect, it } from "vitest";
import {
  calculateCushion,
  parseDollarsToCents,
} from "@/lib/finance/cushion";

const inputs = (
  liquidResources: number,
  essentialExpenses: number,
  continuingIncome = 0,
) => ({
  liquid_resources_cents: liquidResources,
  monthly_essential_expenses_cents: essentialExpenses,
  monthly_continuing_income_cents: continuingIncome,
});

describe("calculateCushion", () => {
  it.each([
    {
      name: "less than three months",
      input: inputs(299, 100),
      months: 2.99,
      state: "urgent",
    },
    {
      name: "exactly three months",
      input: inputs(300, 100),
      months: 3,
      state: "building",
    },
    {
      name: "just under six months",
      input: inputs(599, 100),
      months: 5.99,
      state: "building",
    },
    {
      name: "exactly six months",
      input: inputs(600, 100),
      months: 6,
      state: "stronger",
    },
  ])("$name uses the expected planning state", ({ input, months, state }) => {
    const result = calculateCushion(input);

    expect(result.months_covered).toBe(months);
    expect(result.planning_state).toBe(state);
    expect(result.monthly_shortfall_cents).toBe(100);
  });

  it("subtracts only the income the user says will continue", () => {
    const result = calculateCushion(inputs(600, 400, 100));

    expect(result.monthly_shortfall_cents).toBe(300);
    expect(result.months_covered).toBe(2);
    expect(result.planning_state).toBe("urgent");
  });

  it("uses the stronger planning state when there is no monthly shortfall", () => {
    const result = calculateCushion(inputs(0, 400, 400));

    expect(result.monthly_shortfall_cents).toBe(0);
    expect(result.months_covered).toBeNull();
    expect(result.planning_state).toBe("stronger");
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["0", 0],
    ["12.3", 1230],
    ["12.34", 1234],
    ["1,000.00", 100000],
  ])("parses %s into integer cents", (value, expected) => {
    expect(parseDollarsToCents(value)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "12.3.4", "one"])(
    "rejects invalid amount %s",
    (value) => {
      expect(parseDollarsToCents(value)).toBeNull();
    },
  );
});
