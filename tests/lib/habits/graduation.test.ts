import { describe, it, expect } from "vitest";
import { isGraduationEligible } from "@/lib/habits/graduation";
import type { HabitFrequency } from "@/lib/db/types";

function buildLogs(completedDates: string[]) {
  return completedDates.map((d) => ({ logged_date: d, completed: true }));
}

/** Generate n consecutive dates ending at endISO (YYYY-MM-DD), most-recent first */
function consecutiveDates(endISO: string, n: number): string[] {
  const out: string[] = [];
  const end = new Date(`${endISO}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe("isGraduationEligible", () => {
  const today = "2026-04-12";

  it("daily: not eligible before 21 days old", () => {
    const createdAt = "2026-04-01T00:00:00Z"; // 11 days old
    const logs = buildLogs(consecutiveDates(today, 11));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(false);
  });

  it("daily: eligible at 21 days with 100% consistency", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("daily: not eligible when consistency < 80%", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    // 16/21 = 76% — below threshold
    const logs = buildLogs(consecutiveDates(today, 16));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(false);
  });

  it("daily: eligible with one miss (20/21 ≈ 95%)", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const dates = consecutiveDates(today, 21);
    const logs = buildLogs(dates.filter((_, i) => i !== 5));
    const freq: HabitFrequency = { type: "daily" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("weekdays: eligible at 21 days with all scheduled weekdays completed", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const dates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const logs = buildLogs(dates);
    const freq: HabitFrequency = { type: "weekdays" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("times_per_week(3): not eligible before 30 days", () => {
    const createdAt = "2026-04-01T00:00:00Z";
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("times_per_week(3): eligible at 30 days old with ≥80% consistency", () => {
    const createdAt = "2026-03-13T00:00:00Z"; // 30 days old
    const logs = buildLogs(consecutiveDates(today, 13));
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("weekly: not eligible before 90 days", () => {
    const createdAt = "2026-02-01T00:00:00Z"; // ~70 days
    const freq: HabitFrequency = { type: "weekly" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("weekly: eligible at 90 days old with 80% consistency", () => {
    const createdAt = "2026-01-12T00:00:00Z"; // 90 days old
    const logs = buildLogs(consecutiveDates(today, 10));
    const freq: HabitFrequency = { type: "weekly" };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("custom with 5 days/week uses daily rule (21d)", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "custom", days: [1, 2, 3, 4, 5] };
    const dates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const logs = buildLogs(dates);
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs })).toBe(true);
  });

  it("custom with 1 day/week uses weekly rule (90d)", () => {
    const createdAt = "2026-02-01T00:00:00Z";
    const freq: HabitFrequency = { type: "custom", days: [1] };
    expect(isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })).toBe(false);
  });

  it("returns false when habit is already formed", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs, status: "formed" })
    ).toBe(false);
  });

  it("returns false when nudge recently dismissed (< 30 days ago)", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: "2026-04-01T00:00:00Z", // 11 days ago
      })
    ).toBe(false);
  });

  it("eligible again when nudge dismissed ≥ 30 days ago", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const logs = buildLogs(consecutiveDates(today, 21));
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: "2026-03-01T00:00:00Z", // 42 days ago
      })
    ).toBe(true);
  });

  it("returns false when createdAt is in the future", () => {
    const createdAt = "2026-05-01T00:00:00Z"; // 19 days after today
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })
    ).toBe(false);
  });

  it("returns false with empty logs at minimum age (daily)", () => {
    const createdAt = "2026-03-22T00:00:00Z"; // 21 days old
    const freq: HabitFrequency = { type: "daily" };
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs: [] })
    ).toBe(false);
  });

  it("custom with zero days returns false (treated as weekly, 0 scheduled)", () => {
    const createdAt = "2026-01-01T00:00:00Z"; // very old
    const freq: HabitFrequency = { type: "custom", days: [] };
    // Even with ample logs and age, zero-scheduled-days must short-circuit to false.
    const logs = [
      { logged_date: "2026-04-10", completed: true },
      { logged_date: "2026-04-11", completed: true },
    ];
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs })
    ).toBe(false);
  });
});
