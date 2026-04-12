import { describe, it, expect } from "vitest";
import {
  getGraduationProgress,
  isGraduationEligible,
} from "@/lib/habits/graduation";
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

  it("weekdays: does NOT credit Saturday/Sunday completions toward consistency", () => {
    // Window: 21 days ending 2026-04-12 (Sunday).
    // Weekdays scheduled in that window: 15 Mon-Fri dates.
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "weekdays" };
    // Log only 8 weekdays (8/15 ≈ 53%) + every Sat/Sun (6 extras).
    // With the scheduled-day filter intact: 8/15 → NOT eligible.
    // If the filter is removed, (8+6)/15 → eligible (wrong, would be clamped to 1.0).
    const weekdayDates = consecutiveDates(today, 21)
      .filter((d) => {
        const day = new Date(`${d}T00:00:00`).getDay();
        return day >= 1 && day <= 5;
      })
      .slice(0, 8);
    const weekendDates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(`${d}T00:00:00`).getDay();
      return day === 0 || day === 6;
    });
    const logs = buildLogs([...weekdayDates, ...weekendDates]);
    expect(
      isGraduationEligible({ createdAt, today, frequency: freq, logs })
    ).toBe(false);
  });

  it("custom Mon/Wed/Fri: does NOT credit Tue/Thu completions", () => {
    // Use a 30-day age so TIMES_PER_WEEK bucket (30d window) applies.
    const createdAt30 = "2026-03-13T00:00:00Z";
    const freq: HabitFrequency = { type: "custom", days: [1, 3, 5] };
    // 30-day window. Scheduled MWF: 12. Log only 6 MWF (50%) + every Tue/Thu (8).
    // With filter: 6/12 = 50% → NOT eligible.
    // Without filter: (6+8)/12 clamps to 1.0 → eligible (wrong).
    const dates = consecutiveDates(today, 30);
    const mwfLogs = dates
      .filter((d) => {
        const day = new Date(`${d}T00:00:00`).getDay();
        return day === 1 || day === 3 || day === 5;
      })
      .slice(0, 6);
    const tueThuLogs = dates.filter((d) => {
      const day = new Date(`${d}T00:00:00`).getDay();
      return day === 2 || day === 4;
    });
    expect(
      isGraduationEligible({
        createdAt: createdAt30,
        today,
        frequency: freq,
        logs: buildLogs([...mwfLogs, ...tueThuLogs]),
      })
    ).toBe(false);
  });

  it("nudge cooldown: blocks at 29 days dismissed, allows at 30", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const logs = buildLogs(consecutiveDates(today, 21));

    // 29 days ago — still in cooldown
    const [y, m, d] = today.split("-").map(Number);
    const dismissed29 = new Date(y, m - 1, d - 29).toISOString();
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: dismissed29,
      })
    ).toBe(false);

    // 30 days ago — cooldown cleared
    const dismissed30 = new Date(y, m - 1, d - 30).toISOString();
    expect(
      isGraduationEligible({
        createdAt,
        today,
        frequency: freq,
        logs,
        nudgeDismissedAt: dismissed30,
      })
    ).toBe(true);
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

describe("getGraduationProgress", () => {
  const today = "2026-04-12";

  it("reports bucket and progress numbers when eligible", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const logs = buildLogs(consecutiveDates(today, 21));
    const p = getGraduationProgress({ createdAt, today, frequency: freq, logs });
    expect(p.eligible).toBe(true);
    expect(p.bucket.minAgeDays).toBe(21);
    expect(p.scheduled).toBe(21);
    expect(p.completed).toBe(21);
    expect(p.blockedBy).toBeNull();
  });

  it("reports blockedBy=age when too new", () => {
    const createdAt = "2026-04-01T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.eligible).toBe(false);
    expect(p.blockedBy).toBe("age");
  });

  it("reports blockedBy=consistency when enough age but low ratio", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const logs = buildLogs(consecutiveDates(today, 10)); // ~48%
    const p = getGraduationProgress({ createdAt, today, frequency: freq, logs });
    expect(p.eligible).toBe(false);
    expect(p.blockedBy).toBe("consistency");
  });

  it("reports blockedBy=cooldown when recently dismissed", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const logs = buildLogs(consecutiveDates(today, 21));
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs,
      nudgeDismissedAt: "2026-04-01T00:00:00Z",
    });
    expect(p.blockedBy).toBe("cooldown");
  });

  it("reports blockedBy=already_formed for formed habits", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
      status: "formed",
    });
    expect(p.blockedBy).toBe("already_formed");
  });
});
