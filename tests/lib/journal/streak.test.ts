import { describe, it, expect } from "vitest";
import {
  computeStreak,
  getLookbackDates,
  getLookbackLabel,
} from "@/lib/journal/streak";

describe("computeStreak", () => {
  it("returns 0 for empty entries", () => {
    expect(computeStreak([], "2026-02-23")).toBe(0);
  });

  it("returns 1 when only today has an entry", () => {
    expect(computeStreak(["2026-02-23"], "2026-02-23")).toBe(1);
  });

  it("returns streak of 5 for consecutive days including today", () => {
    const dates = [
      "2026-02-23",
      "2026-02-22",
      "2026-02-21",
      "2026-02-20",
      "2026-02-19",
    ];
    expect(computeStreak(dates, "2026-02-23")).toBe(5);
  });

  it("counts streak starting from yesterday when today has no entry", () => {
    const dates = [
      "2026-02-22",
      "2026-02-21",
      "2026-02-20",
    ];
    expect(computeStreak(dates, "2026-02-23")).toBe(3);
  });

  it("handles broken streak (gap in dates)", () => {
    const dates = [
      "2026-02-23",
      "2026-02-22",
      // gap: 2026-02-21 missing
      "2026-02-20",
      "2026-02-19",
    ];
    expect(computeStreak(dates, "2026-02-23")).toBe(2);
  });

  it("returns 0 when single entry is not today or yesterday", () => {
    expect(computeStreak(["2026-02-15"], "2026-02-23")).toBe(0);
  });

  it("returns 0 when yesterday also has no entry", () => {
    // Neither today (2026-02-23) nor yesterday (2026-02-22) present
    expect(computeStreak(["2026-02-20", "2026-02-19"], "2026-02-23")).toBe(0);
  });

  it("handles month boundary correctly", () => {
    // March 1-2, with streak going into February
    const dates = [
      "2026-03-02",
      "2026-03-01",
      "2026-02-28",
      "2026-02-27",
    ];
    expect(computeStreak(dates, "2026-03-02")).toBe(4);
  });

  it("handles year boundary correctly", () => {
    const dates = [
      "2026-01-02",
      "2026-01-01",
      "2025-12-31",
      "2025-12-30",
    ];
    expect(computeStreak(dates, "2026-01-02")).toBe(4);
  });
});

describe("getLookbackDates", () => {
  it("returns 3 dates at correct offsets", () => {
    const result = getLookbackDates("2026-02-23");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "30_days_ago", date: "2026-01-24" });
    expect(result[1]).toEqual({ label: "90_days_ago", date: "2025-11-25" });
    expect(result[2]).toEqual({ label: "1_year_ago", date: "2025-02-23" });
  });

  it("handles month/year boundaries", () => {
    const result = getLookbackDates("2026-01-15");

    // 30 days before Jan 15 = Dec 16
    expect(result[0].date).toBe("2025-12-16");
    // 90 days before Jan 15 = Oct 17
    expect(result[1].date).toBe("2025-10-17");
    // 1 year ago
    expect(result[2].date).toBe("2025-01-15");
  });

  it("handles leap year", () => {
    // 2024 is a leap year, 1 year ago from 2025-02-28
    const result = getLookbackDates("2025-02-28");
    expect(result[2].date).toBe("2024-02-28");
  });
});

describe("getLookbackLabel", () => {
  it("returns correct label for matching date", () => {
    expect(getLookbackLabel("2026-02-23", "2026-01-24")).toBe("30_days_ago");
    expect(getLookbackLabel("2026-02-23", "2025-11-25")).toBe("90_days_ago");
    expect(getLookbackLabel("2026-02-23", "2025-02-23")).toBe("1_year_ago");
  });

  it("returns empty string for non-matching date", () => {
    expect(getLookbackLabel("2026-02-23", "2026-02-10")).toBe("");
  });
});
