import { describe, it, expect } from "vitest";
import {
  getBucket,
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

  // --- Exact-bucket-value assertions: kill ObjectLiteral mutants (`BUCKET = {}`) ---

  it("reports concrete bucket values for daily (minAgeDays=21, windowDays=21, consistency=0.8)", () => {
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2026-03-22T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.bucket.minAgeDays).toBe(21);
    expect(p.bucket.windowDays).toBe(21);
    expect(p.bucket.consistency).toBe(0.8);
  });

  it("reports concrete bucket values for times_per_week (minAgeDays=30, windowDays=30, consistency=0.8)", () => {
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    const p = getGraduationProgress({
      createdAt: "2026-03-13T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.bucket.minAgeDays).toBe(30);
    expect(p.bucket.windowDays).toBe(30);
    expect(p.bucket.consistency).toBe(0.8);
  });

  it("reports concrete bucket values for weekly (minAgeDays=90, windowDays=90, consistency=0.8)", () => {
    const freq: HabitFrequency = { type: "weekly" };
    const p = getGraduationProgress({
      createdAt: "2026-01-12T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.bucket.minAgeDays).toBe(90);
    expect(p.bucket.windowDays).toBe(90);
    expect(p.bucket.consistency).toBe(0.8);
  });

  // --- windowStart exact-date assertions (kills padStart('0') mutation) ---

  it("windowStart is exactly 20 days before today for daily (YYYY-MM-DD formatted)", () => {
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2026-03-22T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    // 2026-04-12 − 20 days = 2026-03-23
    expect(p.windowStart).toBe("2026-03-23");
  });

  it("windowStart pads single-digit month/day correctly (YYYY-0M-0D)", () => {
    // Choose today=2026-01-05 and daily window 21 → windowStart = 2025-12-16.
    // Specifically verify the two-digit zero-padding on month/day.
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2025-10-01T00:00:00Z",
      today: "2026-01-05",
      frequency: freq,
      logs: [],
    });
    expect(p.windowStart).toBe("2025-12-16");
  });

  it("ageDays is exactly the integer day-difference between createdAt (YMD) and today", () => {
    // YMD-only avoids timezone offset issues: 2026-04-12 - 2026-03-22 = 21 days.
    const p = getGraduationProgress({
      createdAt: "2026-03-22",
      today,
      frequency: { type: "daily" },
      logs: [],
    });
    expect(p.ageDays).toBe(21);
  });

  it("ageDays correctly interpreted from single-digit-month YMD createdAt", () => {
    // 2026-04-12 - 2026-01-05 = 97 days
    const p = getGraduationProgress({
      createdAt: "2026-01-05",
      today,
      frequency: { type: "daily" },
      logs: [],
    });
    expect(p.ageDays).toBe(97);
  });

  // --- Boundary tests on age check (kills `<` vs `<=` mutant) ---

  it("age boundary: 20 days is NOT eligible, 21 days IS eligible for daily (YMD inputs)", () => {
    const freq: HabitFrequency = { type: "daily" };
    // 20 days old — below bucket.minAgeDays (21)
    const p20 = getGraduationProgress({
      createdAt: "2026-03-23",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p20.ageDays).toBe(20);
    expect(p20.blockedBy).toBe("age");

    // 21 days old — at threshold (not below)
    const p21 = getGraduationProgress({
      createdAt: "2026-03-22",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p21.ageDays).toBe(21);
    expect(p21.blockedBy).not.toBe("age");
  });

  // --- scheduled=0 path ---

  it("reports scheduled=0 and blockedBy=consistency for empty-days custom", () => {
    const freq: HabitFrequency = { type: "custom", days: [] };
    const p = getGraduationProgress({
      createdAt: "2025-01-01T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.scheduled).toBe(0);
    expect(p.completed).toBe(0);
    expect(p.blockedBy).toBe("consistency");
    expect(p.eligible).toBe(false);
  });

  // --- Kills `scheduled === 0` branch mutations (ConditionalExpression / BlockStatement) ---
  // If the short-circuit is removed, scheduled/completed come from the normal path.
  // With zero-days custom + logs within window, the ratio path would compute 0/0=NaN
  // and eligible would be NaN >= 0.8 === false — but scheduled/completed/blockedBy differ.
  it("short-circuits with zero scheduled: completed stays 0, blockedBy=consistency (kills block-removal)", () => {
    const freq: HabitFrequency = { type: "custom", days: [] };
    // Logs that would otherwise be counted
    const logs = [
      { logged_date: "2026-04-10", completed: true },
      { logged_date: "2026-04-11", completed: true },
    ];
    const p = getGraduationProgress({
      createdAt: "2025-01-01T00:00:00Z",
      today,
      frequency: freq,
      logs,
    });
    // The short-circuit forces completed=0 rather than flowing through to the
    // countCompleted path where these logs might have been added.
    expect(p.completed).toBe(0);
    expect(p.scheduled).toBe(0);
    expect(p.blockedBy).toBe("consistency");
  });

  // --- Kills `consistency` string literal by asserting exact string ---
  it("blockedBy is exactly the string 'consistency' for insufficient completions", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const logs = buildLogs(consecutiveDates(today, 10)); // 10/21 ≈ 48%
    const p = getGraduationProgress({ createdAt, today, frequency: freq, logs });
    expect(p.blockedBy).toBe("consistency");
  });

  it("blockedBy is exactly the string 'age' when too new", () => {
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2026-04-01T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.blockedBy).toBe("age");
  });

  it("blockedBy is exactly the string 'cooldown' for recently dismissed nudge", () => {
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2026-03-22T00:00:00Z",
      today,
      frequency: freq,
      logs: buildLogs(consecutiveDates(today, 21)),
      nudgeDismissedAt: "2026-04-01T00:00:00Z",
    });
    expect(p.blockedBy).toBe("cooldown");
  });

  it("blockedBy is exactly the string 'already_formed' for formed habits", () => {
    const freq: HabitFrequency = { type: "daily" };
    const p = getGraduationProgress({
      createdAt: "2026-03-22T00:00:00Z",
      today,
      frequency: freq,
      logs: [],
      status: "formed",
    });
    expect(p.blockedBy).toBe("already_formed");
  });

  // --- Exact numeric scheduled/completed values for count-based buckets ---
  // Kills: `Math.max → Math.min`, `days + 1 → days - 1`, `weeks * perWeek → weeks / perWeek`,
  // and the `frequency.type === "weekly" ? 1 : frequency.count` ternary mutants.

  it("times_per_week(3): scheduled = weeks * 3 = 12 for a 30-day window", () => {
    // 30-day window (minAgeDays=windowDays=30). weeks = floor(30/7) = 4. 4 * 3 = 12.
    const createdAt = "2026-03-13T00:00:00Z"; // 30 days old
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.scheduled).toBe(12);
  });

  it("times_per_week(2): scheduled = weeks * 2 = 8 (kills perWeek-ternary and multiply mutants)", () => {
    const createdAt = "2026-03-13T00:00:00Z";
    const freq: HabitFrequency = { type: "times_per_week", count: 2 };
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.scheduled).toBe(8);
  });

  it("weekly: scheduled = weeks * 1 = 12 for a 90-day window (kills perWeek-ternary mutant)", () => {
    const createdAt = "2026-01-12T00:00:00Z"; // 90 days old
    const freq: HabitFrequency = { type: "weekly" };
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
    });
    // weeks = floor(90/7) = 12. 12 * 1 = 12.
    expect(p.scheduled).toBe(12);
  });

  // --- Boundary case that kills Math.max vs Math.min ---

  it("times_per_week(3) with low consistency (6/12): NOT eligible — Math.min mutation would falsely flip to eligible", () => {
    const createdAt = "2026-03-13T00:00:00Z"; // 30 days old
    const freq: HabitFrequency = { type: "times_per_week", count: 3 };
    // 6 completed logs in a 30-day window: 6/12 = 50% < 80% → NOT eligible.
    const logs = buildLogs(consecutiveDates(today, 6));
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs,
    });
    expect(p.scheduled).toBe(12);
    expect(p.completed).toBe(6);
    expect(p.eligible).toBe(false);
    expect(p.blockedBy).toBe("consistency");
  });

  // --- Kills `m - 1` arithmetic mutation in countScheduled weekday-only branch ---

  it("custom Mon: scheduled counts only Mondays in the daily-walk branch", () => {
    // custom with 1 day = WEEKLY bucket (90-day window).
    // today=2026-04-12 (Sun), windowStart=2026-01-13 (Tue).
    // Mondays in window [2026-01-13..2026-04-12]: Jan 19, 26, Feb 2/9/16/23,
    // Mar 2/9/16/23/30, Apr 6 = 12 Mondays.
    const freq: HabitFrequency = { type: "custom", days: [1] };
    const createdAt = "2026-01-12";
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs: [],
    });
    expect(p.scheduled).toBe(12);
  });

  // --- Kills the consistency boundary mutation: >= vs > ---

  it("consistency boundary: exactly 80% is eligible (>=), kills `>` mutant", () => {
    // weekdays, 21-day window ending 2026-04-12 (Sun). windowStart = 2026-03-23 (Mon).
    // Weekdays in [Mar 23..Apr 12]: 3 full weeks of Mon-Fri = 15 weekdays.
    // 12/15 = 0.80 — exactly at threshold. `>=` keeps eligible=true; `>` flips it to false.
    const createdAt = "2026-03-22";
    const freq: HabitFrequency = { type: "weekdays" };
    // Pick the 12 most-recent weekdays within the window.
    const weekdayDates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(`${d}T00:00:00`).getDay();
      return day >= 1 && day <= 5;
    }).slice(0, 12);
    const logs = buildLogs(weekdayDates);
    const p = getGraduationProgress({ createdAt, today, frequency: freq, logs });
    expect(p.scheduled).toBe(15);
    expect(p.completed).toBe(12);
    expect(p.eligible).toBe(true);
  });

  it("consistency boundary: just below 80% (11/15 ≈ 73%) is NOT eligible", () => {
    const createdAt = "2026-03-22";
    const freq: HabitFrequency = { type: "weekdays" };
    const weekdayDates = consecutiveDates(today, 21).filter((d) => {
      const day = new Date(`${d}T00:00:00`).getDay();
      return day >= 1 && day <= 5;
    }).slice(0, 11);
    const logs = buildLogs(weekdayDates);
    const p = getGraduationProgress({ createdAt, today, frequency: freq, logs });
    expect(p.scheduled).toBe(15);
    expect(p.completed).toBe(11);
    expect(p.eligible).toBe(false);
  });

  // --- Kills `l.logged_date >= windowStart` and `l.logged_date <= today` filter mutants ---

  it("ignores completions outside the window (before windowStart)", () => {
    // 21-day window for daily: windowStart = 2026-03-23. Log on 2026-03-22 (one day too early).
    // + 17 valid logs inside window = 17/21 = 81% eligible.
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const withinWindow = consecutiveDates(today, 17); // last 17 days
    const logs = buildLogs([...withinWindow, "2026-03-22"]); // 2026-03-22 is outside window (< 2026-03-23)
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs,
    });
    // If filter is broken (always true), completed would be 18 (or clamp to 21).
    // With correct filter: completed = 17.
    expect(p.completed).toBe(17);
  });

  it("ignores completions dated in the future (after today)", () => {
    // Future-dated log shouldn't count.
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    const within = consecutiveDates(today, 17); // 17 real completions
    const logs = buildLogs([...within, "2026-04-13"]); // one future log
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs,
    });
    expect(p.completed).toBe(17);
  });

  it("ignores completions with completed=false (kills `l.completed` filter mutant)", () => {
    const createdAt = "2026-03-22T00:00:00Z";
    const freq: HabitFrequency = { type: "daily" };
    // 17 completed + 4 not-completed = 21 rows; only 17 should count.
    const completed = consecutiveDates(today, 17);
    const notCompleted = ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26"];
    const logs = [
      ...completed.map((d) => ({ logged_date: d, completed: true })),
      ...notCompleted.map((d) => ({ logged_date: d, completed: false })),
    ];
    const p = getGraduationProgress({
      createdAt,
      today,
      frequency: freq,
      logs,
    });
    expect(p.completed).toBe(17);
  });
});

// --- getBucket exported tests: kill custom-day-count boundary mutants ---

describe("getBucket", () => {
  it("daily → DAILY_BUCKET (21/21/0.8)", () => {
    expect(getBucket({ type: "daily" })).toEqual({ minAgeDays: 21, windowDays: 21, consistency: 0.8 });
  });

  it("weekdays → DAILY_BUCKET (21/21/0.8)", () => {
    expect(getBucket({ type: "weekdays" })).toEqual({ minAgeDays: 21, windowDays: 21, consistency: 0.8 });
  });

  it("times_per_week → TIMES_PER_WEEK_BUCKET (30/30/0.8)", () => {
    expect(getBucket({ type: "times_per_week", count: 3 })).toEqual({ minAgeDays: 30, windowDays: 30, consistency: 0.8 });
  });

  it("weekly → WEEKLY_BUCKET (90/90/0.8)", () => {
    expect(getBucket({ type: "weekly" })).toEqual({ minAgeDays: 90, windowDays: 90, consistency: 0.8 });
  });

  // Custom-day-count boundaries — exactly at 4 and 2 kills `>=` → `>` and `>=` → `<`.

  it("custom with 4 days → DAILY_BUCKET (kills n>=4 → n>4 mutant)", () => {
    expect(getBucket({ type: "custom", days: [1, 2, 3, 4] })).toEqual({ minAgeDays: 21, windowDays: 21, consistency: 0.8 });
  });

  it("custom with 5 days → DAILY_BUCKET", () => {
    expect(getBucket({ type: "custom", days: [1, 2, 3, 4, 5] })).toEqual({ minAgeDays: 21, windowDays: 21, consistency: 0.8 });
  });

  it("custom with 3 days → TIMES_PER_WEEK_BUCKET (kills n>=4 boundary and n<2 mutants)", () => {
    expect(getBucket({ type: "custom", days: [1, 3, 5] })).toEqual({ minAgeDays: 30, windowDays: 30, consistency: 0.8 });
  });

  it("custom with 2 days → TIMES_PER_WEEK_BUCKET (kills n>=2 → n>2 mutant)", () => {
    expect(getBucket({ type: "custom", days: [1, 4] })).toEqual({ minAgeDays: 30, windowDays: 30, consistency: 0.8 });
  });

  it("custom with 1 day → WEEKLY_BUCKET (kills n>=2 → n<2 mutant and true short-circuit)", () => {
    expect(getBucket({ type: "custom", days: [1] })).toEqual({ minAgeDays: 90, windowDays: 90, consistency: 0.8 });
  });

  it("custom with 0 days → WEEKLY_BUCKET", () => {
    expect(getBucket({ type: "custom", days: [] })).toEqual({ minAgeDays: 90, windowDays: 90, consistency: 0.8 });
  });
});
