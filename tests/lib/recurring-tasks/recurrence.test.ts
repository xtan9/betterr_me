import { describe, it, expect } from "vitest";
import {
  calculateScheduledDates,
  getOccurrencesInRange,
  getNextOccurrence,
  describeRecurrence,
} from "@/lib/recurring-tasks/recurrence";
import type { RecurrenceRule } from "@/lib/db/types";

describe("calculateScheduledDates", () => {
  it("uses local calendar arithmetic across daylight-saving boundaries", () => {
    const result = calculateScheduledDates({
      rule: { frequency: "daily", interval: 1 },
      recurrenceAnchor: "2026-03-07",
      activationDate: "2026-03-08",
      range: { from: "2026-03-08", to: "2026-03-10" },
    });

    expect(result).toEqual(["2026-03-08", "2026-03-09", "2026-03-10"]);
  });
});

// =============================================================================
// getOccurrencesInRange — daily
// =============================================================================
//
// Notes on mutation-killing coverage:
// - The fast-forward arithmetic (`daysDiff / interval`, `Math.floor`) only
//   fires when `ruleStartDate < rangeStart`. We exercise that branch with
//   interval=1, interval=3, long spans, and boundary cases where the
//   fast-forwarded date lands exactly on / just before / just after
//   rangeStart — this kills Math.floor removal, `+ 1 / - 1` tweaks, and
//   flipped `<` / `<=` comparisons.
// - The inner `while (current <= rangeEnd)` loop is tested with:
//     • an exact terminal hit (current == rangeEnd)       — kills `<` vs `<=`
//     • a terminal one past the end                        — kills off-by-one
//     • the `>= rangeStart` gate                           — kills flipped `>=`
describe("getOccurrencesInRange — daily", () => {
  it("returns every day for interval=1 (inclusive range)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-01-05",
    );
    expect(result).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);
    expect(result).toHaveLength(5);
  });

  it("returns every other day for interval=2", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 2 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-01-07",
    );
    expect(result).toEqual([
      "2026-01-01",
      "2026-01-03",
      "2026-01-05",
      "2026-01-07",
    ]);
  });

  it("returns every third day for interval=3", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 3 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-01-10",
    );
    // 1, 4, 7, 10
    expect(result).toEqual([
      "2026-01-01",
      "2026-01-04",
      "2026-01-07",
      "2026-01-10",
    ]);
  });

  it("fast-forwards to rangeStart when rule starts before range (interval=1)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-03",
      "2026-01-05",
    );
    // Starts Jan 1, range Jan 3-5: should return Jan 3, 4, 5
    expect(result).toEqual(["2026-01-03", "2026-01-04", "2026-01-05"]);
  });

  it("fast-forwards correctly with interval=3 when rangeStart falls on grid", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 3 };
    // start Jan 1; interval 3; occurrences: 1, 4, 7, 10, 13, 16, 19, 22, 25
    // rangeStart Jan 10 → floor((10-1)/3)*3 = 9 days → fast-forward to Jan 10
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-10",
      "2026-01-20",
    );
    expect(result).toEqual(["2026-01-10", "2026-01-13", "2026-01-16", "2026-01-19"]);
  });

  it("fast-forwards correctly with interval=3 when rangeStart falls off-grid", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 3 };
    // occurrences: 1, 4, 7, 10, 13, 16, 19
    // rangeStart Jan 11 → floor((11-1)/3)*3 = 9 → Jan 10, then addDays(+3) = Jan 13
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-11",
      "2026-01-20",
    );
    expect(result).toEqual(["2026-01-13", "2026-01-16", "2026-01-19"]);
  });

  it("handles month boundary correctly (daily across Jan→Feb)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-30",
      "2026-01-30",
      "2026-02-02",
    );
    expect(result).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("handles year boundary correctly (daily across Dec→Jan)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2025-12-30",
      "2025-12-30",
      "2026-01-02",
    );
    expect(result).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("returns empty array when range is entirely before rule start", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-02-01",
      "2026-01-01",
      "2026-01-31",
    );
    expect(result).toEqual([]);
  });

  it("returns empty array when rangeStart > rangeEnd", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-10",
      "2026-01-05", // end before start
    );
    expect(result).toEqual([]);
  });

  it("returns a single occurrence when rangeStart == rangeEnd == rule start", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-01-01",
    );
    expect(result).toEqual(["2026-01-01"]);
  });

  it("skips occurrences that land after rangeEnd (loop terminal)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 2 };
    // occurrences: 1, 3, 5, 7. Range ends Jan 6 (not an occurrence) → loop
    // must stop after 5.
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-01-06",
    );
    expect(result).toEqual(["2026-01-01", "2026-01-03", "2026-01-05"]);
    expect(result).toHaveLength(3);
  });
});

// =============================================================================
// getOccurrencesInRange — weekly
// =============================================================================
describe("getOccurrencesInRange — weekly", () => {
  it("returns weekly on specified days (Mon+Wed) for interval=1", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1, 3],
    };
    // Feb 2 2026 = Monday
    const result = getOccurrencesInRange(
      rule,
      "2026-02-02",
      "2026-02-02",
      "2026-02-15",
    );
    expect(result).toEqual([
      "2026-02-02", // Mon
      "2026-02-04", // Wed
      "2026-02-09", // Mon
      "2026-02-11", // Wed
    ]);
  });

  it("returns occurrences sorted in chronological order (multi-day weekly)", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [5, 1], // Friday, Monday (unsorted input)
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-02-02", // Mon
      "2026-02-02",
      "2026-02-15",
    );
    // Expect sorted: Mon Feb 2, Fri Feb 6, Mon Feb 9, Fri Feb 13
    expect(result).toEqual([
      "2026-02-02",
      "2026-02-06",
      "2026-02-09",
      "2026-02-13",
    ]);
  });

  it("handles biweekly (interval=2) — skips odd weeks", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 2,
      days_of_week: [1], // Mondays only
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-02-02", // Mon
      "2026-02-02",
      "2026-03-02",
    );
    // Every 2 weeks: Feb 2, Feb 16, Mar 2 (not Feb 9 or Feb 23)
    expect(result).toEqual(["2026-02-02", "2026-02-16", "2026-03-02"]);
  });

  it("handles all weekdays (Mon-Fri) for interval=1", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1, 2, 3, 4, 5],
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-02-02",
      "2026-02-02",
      "2026-02-08",
    );
    // Feb 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat, 8=Sun — only Mon-Fri
    expect(result).toEqual([
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
      "2026-02-05",
      "2026-02-06",
    ]);
  });

  it("includes Sunday (dow=0) when specified", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [0], // Sundays
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-02-01", // Sunday
      "2026-02-01",
      "2026-02-22",
    );
    expect(result).toEqual([
      "2026-02-01",
      "2026-02-08",
      "2026-02-15",
      "2026-02-22",
    ]);
  });

  it("skips days before the rule start date (even if in same week)", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1, 3, 5], // Mon, Wed, Fri
    };
    // Rule starts Wed Feb 4 — Mon Feb 2 must NOT be returned even though
    // the "week walker" starts at Sunday Feb 1.
    const result = getOccurrencesInRange(
      rule,
      "2026-02-04",
      "2026-02-01",
      "2026-02-07",
    );
    expect(result).toEqual(["2026-02-04", "2026-02-06"]);
  });

  it("fast-forwards across many weeks (interval=1) maintaining day selection", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [3], // Wednesdays
    };
    // Rule starts Jan 7 2026 (Wed). Range starts Feb 2 (Mon)..Feb 15 (Sun).
    const result = getOccurrencesInRange(
      rule,
      "2026-01-07",
      "2026-02-02",
      "2026-02-15",
    );
    expect(result).toEqual(["2026-02-04", "2026-02-11"]);
  });

  it("fast-forwards biweekly correctly from far-past rule start", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 2,
      days_of_week: [1], // Mondays only
    };
    // Rule starts Mon Jan 5 2026. Range: Feb 15..Mar 15.
    // Biweekly from Jan 5: Jan 5, 19, Feb 2, 16, Mar 2, 16 — range hits Feb 16, Mar 2
    const result = getOccurrencesInRange(
      rule,
      "2026-01-05",
      "2026-02-15",
      "2026-03-15",
    );
    expect(result).toEqual(["2026-02-16", "2026-03-02"]);
  });

  it("returns empty when rangeEnd is before rule start", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1],
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-03-01",
      "2026-01-01",
      "2026-01-31",
    );
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getOccurrencesInRange — monthly
// =============================================================================
describe("getOccurrencesInRange — monthly by date", () => {
  it("returns monthly by date with interval=1", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 15,
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-15",
      "2026-01-15",
      "2026-04-15",
    );
    expect(result).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("clamps to last day in Feb when day_of_month=31", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 31,
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-31",
      "2026-01-31",
      "2026-04-30",
    );
    // 2026 is not a leap year → Feb clamps to 28; Apr has 30 days.
    expect(result).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("handles leap-year Feb 29 when day_of_month=29", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 29,
    };
    const result = getOccurrencesInRange(
      rule,
      "2028-01-29",
      "2028-01-29",
      "2028-03-29",
    );
    // 2028 leap year → Feb 29 valid
    expect(result).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
  });

  it("skips months when interval=3", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 3,
      day_of_month: 1,
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-01",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ]);
  });

  it("fast-forwards correctly to rangeStart month (interval=1)", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 15,
    };
    // Rule starts Jan 2024, range May..July 2026 — must skip 28 months cleanly
    const result = getOccurrencesInRange(
      rule,
      "2024-01-15",
      "2026-05-01",
      "2026-07-31",
    );
    expect(result).toEqual(["2026-05-15", "2026-06-15", "2026-07-15"]);
  });

  it("fast-forwards correctly across years (interval=3)", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 3,
      day_of_month: 1,
    };
    // Rule starts Jan 2024. Interval 3 → Jan, Apr, Jul, Oct 2024; 2025 same; 2026 same.
    // Range: Mar 2026..Dec 2026 → Apr, Jul, Oct
    const result = getOccurrencesInRange(
      rule,
      "2024-01-01",
      "2026-03-01",
      "2026-12-31",
    );
    expect(result).toEqual(["2026-04-01", "2026-07-01", "2026-10-01"]);
  });
});

describe("getOccurrencesInRange — monthly by weekday", () => {
  it("returns first Monday of each month", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "first",
      day_of_week_monthly: 1,
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-05",
      "2026-01-05",
      "2026-03-31",
    );
    // First Mondays: Jan 5, Feb 2, Mar 2
    expect(result).toEqual(["2026-01-05", "2026-02-02", "2026-03-02"]);
  });

  it("returns last Friday of each month", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "last",
      day_of_week_monthly: 5,
    };
    const result = getOccurrencesInRange(
      rule,
      "2026-01-30",
      "2026-01-30",
      "2026-03-31",
    );
    // Last Fridays: Jan 30, Feb 27, Mar 27
    expect(result).toEqual(["2026-01-30", "2026-02-27", "2026-03-27"]);
  });

  it("returns second Tuesday of each month", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "second",
      day_of_week_monthly: 2,
    };
    // Jan 2026: Tuesdays are 6, 13, 20, 27 → second = 13
    // Feb 2026: Tuesdays are 3, 10, 17, 24 → second = 10
    const result = getOccurrencesInRange(
      rule,
      "2026-01-13",
      "2026-01-13",
      "2026-02-28",
    );
    expect(result).toEqual(["2026-01-13", "2026-02-10"]);
  });

  it("returns third Wednesday", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "third",
      day_of_week_monthly: 3,
    };
    // Jan 2026: Wednesdays 7, 14, 21, 28 → third = 21
    const result = getOccurrencesInRange(
      rule,
      "2026-01-21",
      "2026-01-21",
      "2026-01-31",
    );
    expect(result).toEqual(["2026-01-21"]);
  });

  it("returns fourth Thursday", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "fourth",
      day_of_week_monthly: 4,
    };
    // Jan 2026: Thursdays 1, 8, 15, 22, 29 → fourth = 22
    const result = getOccurrencesInRange(
      rule,
      "2026-01-22",
      "2026-01-22",
      "2026-01-31",
    );
    expect(result).toEqual(["2026-01-22"]);
  });

  it("returns last Saturday (end-of-month variant)", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      week_position: "last",
      day_of_week_monthly: 6,
    };
    // Jan 2026: Saturdays 3, 10, 17, 24, 31 → last = 31
    const result = getOccurrencesInRange(
      rule,
      "2026-01-31",
      "2026-01-31",
      "2026-01-31",
    );
    expect(result).toEqual(["2026-01-31"]);
  });
});

// =============================================================================
// getOccurrencesInRange — yearly
// =============================================================================
describe("getOccurrencesInRange — yearly", () => {
  it("returns yearly on same date with interval=1", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 3,
      day_of_month: 15,
    };
    const result = getOccurrencesInRange(
      rule,
      "2024-03-15",
      "2024-03-15",
      "2027-03-15",
    );
    expect(result).toEqual([
      "2024-03-15",
      "2025-03-15",
      "2026-03-15",
      "2027-03-15",
    ]);
  });

  it("handles every-2-years interval", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 2,
      month_of_year: 6,
      day_of_month: 1,
    };
    const result = getOccurrencesInRange(
      rule,
      "2024-06-01",
      "2024-06-01",
      "2030-12-31",
    );
    expect(result).toEqual([
      "2024-06-01",
      "2026-06-01",
      "2028-06-01",
      "2030-06-01",
    ]);
  });

  it("clamps Feb 29 to Feb 28 in non-leap years", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 2,
      day_of_month: 29,
    };
    // 2024 leap; 2025, 2026, 2027 not leap; 2028 leap
    const result = getOccurrencesInRange(
      rule,
      "2024-02-29",
      "2024-02-29",
      "2028-12-31",
    );
    expect(result).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("fast-forwards across many years (interval=1)", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 7,
      day_of_month: 4,
    };
    // Rule starts July 4 2020; range Jan..Dec 2026
    const result = getOccurrencesInRange(
      rule,
      "2020-07-04",
      "2026-01-01",
      "2026-12-31",
    );
    expect(result).toEqual(["2026-07-04"]);
  });

  it("returns empty when rangeStart > rangeEnd", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 1,
      day_of_month: 1,
    };
    const result = getOccurrencesInRange(
      rule,
      "2024-01-01",
      "2026-06-01",
      "2026-05-01",
    );
    expect(result).toEqual([]);
  });

  it("returns empty when yearly occurrence is before rangeStart in the same year", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 1,
      month_of_year: 3,
      day_of_month: 15,
    };
    // Range: Apr..Dec 2026, but the yearly date is Mar 15 → no hit for 2026
    const result = getOccurrencesInRange(
      rule,
      "2024-03-15",
      "2026-04-01",
      "2026-12-31",
    );
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getNextOccurrence
// =============================================================================
describe("getNextOccurrence", () => {
  it("returns the next daily occurrence (day+1)", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    expect(getNextOccurrence(rule, "2026-01-01", "2026-01-05")).toBe(
      "2026-01-06",
    );
  });

  it("returns the next daily occurrence skipping interval=2", () => {
    const rule: RecurrenceRule = { frequency: "daily", interval: 2 };
    // start Jan 1: 1, 3, 5, 7. After Jan 5 → Jan 7
    expect(getNextOccurrence(rule, "2026-01-01", "2026-01-05")).toBe(
      "2026-01-07",
    );
  });

  it("returns the next weekly occurrence (skips current week's earlier day)", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 1,
      days_of_week: [1], // Mondays
    };
    // After Wed Feb 4 → next Monday is Feb 9
    expect(getNextOccurrence(rule, "2026-02-02", "2026-02-04")).toBe(
      "2026-02-09",
    );
  });

  it("returns the next monthly occurrence (rolls over month)", () => {
    const rule: RecurrenceRule = {
      frequency: "monthly",
      interval: 1,
      day_of_month: 15,
    };
    expect(getNextOccurrence(rule, "2026-01-15", "2026-01-16")).toBe(
      "2026-02-15",
    );
  });

  it("returns null when no occurrence within 2-year search window", () => {
    const rule: RecurrenceRule = {
      frequency: "yearly",
      interval: 5,
      month_of_year: 1,
      day_of_month: 1,
    };
    // Rule starts 2024-01-01; next occurrences: 2024, 2029, 2034...
    // After 2026-01-02 → search window 2026-01-03 to 2028-01-03 → no hit → null
    expect(getNextOccurrence(rule, "2024-01-01", "2026-01-02")).toBeNull();
  });

  it("returns the exact next day boundary (afterDate + 1 is the next occurrence)", () => {
    // Proves that we search starting the day AFTER afterDate (not ON afterDate)
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    const afterDate = "2026-06-10";
    expect(getNextOccurrence(rule, "2026-01-01", afterDate)).toBe("2026-06-11");
  });

  it("does NOT return afterDate itself even when it is an occurrence", () => {
    // Fortifies the "nextDay = addDays(afterDate, 1)" contract
    const rule: RecurrenceRule = { frequency: "daily", interval: 1 };
    // Rule starts Jan 1, interval 1 → Jan 10 IS an occurrence, but we want
    // the NEXT one after Jan 10 → Jan 11.
    expect(getNextOccurrence(rule, "2026-01-01", "2026-01-10")).toBe(
      "2026-01-11",
    );
  });
});

// =============================================================================
// describeRecurrence — deterministic translation fixture
// =============================================================================
//
// The translation fixture is tight: it returns a literal string that embeds
// all params that the implementation is expected to pass. If the source
// passes the wrong param name (e.g. `interval` → `n`), the string produced
// becomes `Every undefined days`, which differs from the assertion and kills
// the mutant.
const makeT = () => {
  return (key: string, params?: Record<string, unknown>): string => {
    switch (key) {
      case "recurrence.describe.everyDay":
        return "Every day";
      case "recurrence.describe.everyNDays":
        return `Every ${params?.interval} days`;
      case "recurrence.describe.everyWeek":
        return "Every week";
      case "recurrence.describe.everyNWeeks":
        return `Every ${params?.interval} weeks`;
      case "recurrence.describe.weeklyOnDays":
        return `${params?.prefix} on ${params?.days}`;
      case "recurrence.describe.everyMonth":
        return "Every month";
      case "recurrence.describe.everyNMonths":
        return `Every ${params?.interval} months`;
      case "recurrence.describe.monthlyOnOrdinal":
        return `${params?.prefix} on the ${params?.ordinal}`;
      case "recurrence.describe.monthlyOnWeekday":
        return `${params?.prefix} on the ${params?.position} ${params?.day}`;
      case "recurrence.describe.everyYear":
        return "Every year";
      case "recurrence.describe.everyNYears":
        return `Every ${params?.interval} years`;
      case "recurrence.describe.yearlyOnDate":
        return `${params?.prefix} on ${params?.month} ${params?.day}`;
      case "recurrence.describe.ordinal_one":
        return `${params?.n}st`;
      case "recurrence.describe.ordinal_two":
        return `${params?.n}nd`;
      case "recurrence.describe.ordinal_few":
        return `${params?.n}rd`;
      case "recurrence.describe.ordinal_other":
        return `${params?.n}th`;
      case "recurrence.describe.position.first":
        return "first";
      case "recurrence.describe.position.second":
        return "second";
      case "recurrence.describe.position.third":
        return "third";
      case "recurrence.describe.position.fourth":
        return "fourth";
      case "recurrence.describe.position.last":
        return "last";
      default:
        // Day names 0..6
        if (key.startsWith("recurrence.describe.dayName.")) {
          const n = parseInt(key.slice("recurrence.describe.dayName.".length), 10);
          return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] ?? key;
        }
        // Month names 1..12
        if (key.startsWith("recurrence.describe.monthName.")) {
          const n = parseInt(
            key.slice("recurrence.describe.monthName.".length),
            10,
          );
          return [
            "",
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ][n] ?? key;
        }
        return key;
    }
  };
};

describe("describeRecurrence — daily", () => {
  it("returns 'Every day' for interval=1", () => {
    const t = makeT();
    expect(describeRecurrence({ frequency: "daily", interval: 1 }, t)).toBe(
      "Every day",
    );
  });

  it("returns 'Every N days' for interval=3", () => {
    const t = makeT();
    expect(describeRecurrence({ frequency: "daily", interval: 3 }, t)).toBe(
      "Every 3 days",
    );
  });

  it("returns 'Every N days' for interval=2 (boundary vs interval=1)", () => {
    const t = makeT();
    expect(describeRecurrence({ frequency: "daily", interval: 2 }, t)).toBe(
      "Every 2 days",
    );
  });
});

describe("describeRecurrence — weekly", () => {
  it("returns 'Every week on …' for interval=1 with multiple days", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "weekly", interval: 1, days_of_week: [1, 3, 5] },
        t,
      ),
    ).toBe("Every week on Mon, Wed, Fri");
  });

  it("returns 'Every N weeks on …' for interval=2 with one day", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "weekly", interval: 2, days_of_week: [1] },
        t,
      ),
    ).toBe("Every 2 weeks on Mon");
  });

  it("falls back to prefix only when days_of_week is empty", () => {
    // An empty days_of_week array produces empty-string join, which falsy-checks
    // and returns the prefix alone.
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "weekly", interval: 1, days_of_week: [] },
        t,
      ),
    ).toBe("Every week");
  });

  it("preserves day order from the input (no re-sort)", () => {
    const t = makeT();
    // 5 then 1 → 'Fri, Mon' (not sorted)
    expect(
      describeRecurrence(
        { frequency: "weekly", interval: 1, days_of_week: [5, 1] },
        t,
      ),
    ).toBe("Every week on Fri, Mon");
  });

  it("uses plural 'weeks' for interval=2 even with empty days", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "weekly", interval: 2, days_of_week: [] },
        t,
      ),
    ).toBe("Every 2 weeks");
  });
});

describe("describeRecurrence — monthly", () => {
  it("describes monthly by date (1st)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 1 },
        t,
      ),
    ).toBe("Every month on the 1st");
  });

  it("describes monthly by date (2nd)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 2 },
        t,
      ),
    ).toBe("Every month on the 2nd");
  });

  it("describes monthly by date (3rd)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 3 },
        t,
      ),
    ).toBe("Every month on the 3rd");
  });

  it("describes monthly by date (4th)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 4 },
        t,
      ),
    ).toBe("Every month on the 4th");
  });

  it("describes monthly by date (11th — teens exception)", () => {
    const t = makeT();
    // 11, 12, 13 use 'other' → 'th'
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 11 },
        t,
      ),
    ).toBe("Every month on the 11th");
  });

  it("describes monthly by date (12th — teens exception)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 12 },
        t,
      ),
    ).toBe("Every month on the 12th");
  });

  it("describes monthly by date (13th — teens exception)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 13 },
        t,
      ),
    ).toBe("Every month on the 13th");
  });

  it("describes monthly by date (14th — above teens, mod10=4 → 'other')", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 14 },
        t,
      ),
    ).toBe("Every month on the 14th");
  });

  it("describes monthly by date (21st — mod10=1 outside teens)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 21 },
        t,
      ),
    ).toBe("Every month on the 21st");
  });

  it("describes monthly by date (22nd — mod10=2 outside teens)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 22 },
        t,
      ),
    ).toBe("Every month on the 22nd");
  });

  it("describes monthly by date (23rd — mod10=3 outside teens)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 23 },
        t,
      ),
    ).toBe("Every month on the 23rd");
  });

  it("describes monthly by date (31st — mod10=1 outside teens)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 31 },
        t,
      ),
    ).toBe("Every month on the 31st");
  });

  it("describes monthly by date (15th — baseline)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 1, day_of_month: 15 },
        t,
      ),
    ).toBe("Every month on the 15th");
  });

  it("describes monthly by date with interval=3 (plural 'months')", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        { frequency: "monthly", interval: 3, day_of_month: 15 },
        t,
      ),
    ).toBe("Every 3 months on the 15th");
  });

  it("describes monthly by weekday (first Monday)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "monthly",
          interval: 1,
          week_position: "first",
          day_of_week_monthly: 1,
        },
        t,
      ),
    ).toBe("Every month on the first Mon");
  });

  it("describes monthly by weekday (last Friday)", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "monthly",
          interval: 1,
          week_position: "last",
          day_of_week_monthly: 5,
        },
        t,
      ),
    ).toBe("Every month on the last Fri");
  });

  it("describes monthly by weekday with interval=2 (plural 'months')", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "monthly",
          interval: 2,
          week_position: "second",
          day_of_week_monthly: 3,
        },
        t,
      ),
    ).toBe("Every 2 months on the second Wed");
  });
});

describe("describeRecurrence — yearly", () => {
  it("describes yearly with interval=1", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "yearly",
          interval: 1,
          month_of_year: 12,
          day_of_month: 25,
        },
        t,
      ),
    ).toBe("Every year on December 25");
  });

  it("describes yearly with interval=2 (plural 'years')", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "yearly",
          interval: 2,
          month_of_year: 1,
          day_of_month: 1,
        },
        t,
      ),
    ).toBe("Every 2 years on January 1");
  });

  it("describes yearly with interval=3 (plural 'years')", () => {
    const t = makeT();
    expect(
      describeRecurrence(
        {
          frequency: "yearly",
          interval: 3,
          month_of_year: 7,
          day_of_month: 4,
        },
        t,
      ),
    ).toBe("Every 3 years on July 4");
  });

  it("passes the correct day number to the translation (not an ordinal)", () => {
    const t = makeT();
    // Verifies source passes rule.day_of_month as-is (no ordinal conversion)
    expect(
      describeRecurrence(
        {
          frequency: "yearly",
          interval: 1,
          month_of_year: 3,
          day_of_month: 15,
        },
        t,
      ),
    ).toBe("Every year on March 15");
  });
});
