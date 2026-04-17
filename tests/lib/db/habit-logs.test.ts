import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HabitLog, HabitFrequency } from "@/lib/db/types";
import { getLocalDateString } from "@/lib/utils";

// Mock the HabitsDB class that HabitLogsDB instantiates internally.
// We need to intercept getHabit + updateHabitStreak so toggleLog tests
// can control the habit returned and verify the streak write arguments,
// without coupling to the real HabitsDB chain.
const { mockGetHabit, mockUpdateHabitStreak } = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockUpdateHabitStreak: vi.fn(),
}));

vi.mock("@/lib/db/habits", () => ({
  HabitsDB: class {
    getHabit = mockGetHabit;
    updateHabitStreak = mockUpdateHabitStreak;
  },
}));

// Logger mock — assert on log calls where source logs errors/warnings.
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { HabitLogsDB } from "@/lib/db/habit-logs";

const HABIT_ID = "habit-abc";
const USER_ID = "user-1";

function makeLog(over: Partial<HabitLog> = {}): HabitLog {
  return {
    id: "log-1",
    habit_id: HABIT_ID,
    user_id: USER_ID,
    logged_date: "2026-02-03",
    completed: true,
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-03T10:00:00Z",
    ...over,
  };
}

describe("HabitLogsDB", () => {
  let db: HabitLogsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new HabitLogsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getLogsByDateRange ───────────────────────────────────────────────────
  describe("getLogsByDateRange", () => {
    it("fetches logs within a date range with the full chain", async () => {
      const rows = [
        makeLog({ id: "l1", logged_date: "2026-02-03", completed: true }),
        makeLog({ id: "l2", logged_date: "2026-02-02", completed: false }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getLogsByDateRange(
        HABIT_ID,
        USER_ID,
        "2026-02-01",
        "2026-02-03",
      );

      expect(result).toEqual(rows);

      // Full ordered queryLog — catches any arg/method mutation.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "select", args: ["*"] },
        { table: "habit_logs", method: "eq", args: ["habit_id", HABIT_ID] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "gte", args: ["logged_date", "2026-02-01"] },
        { table: "habit_logs", method: "lte", args: ["logged_date", "2026-02-03"] },
        { table: "habit_logs", method: "order", args: ["logged_date", { ascending: false }] },
      ]);
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getLogsByDateRange(
        HABIT_ID,
        USER_ID,
        "2026-02-01",
        "2026-02-03",
      );

      expect(result).toEqual([]);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("range query failed"));

      await expect(
        db.getLogsByDateRange(HABIT_ID, USER_ID, "2026-02-01", "2026-02-03"),
      ).rejects.toThrow("range query failed");
    });
  });

  // ─── getLogForDate ────────────────────────────────────────────────────────
  describe("getLogForDate", () => {
    it("returns the log row when present and asserts the full chain", async () => {
      const row = makeLog();
      mockSupabaseClient.setMockResponse(row);

      const result = await db.getLogForDate(HABIT_ID, USER_ID, "2026-02-03");

      expect(result).toEqual(row);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "select", args: ["*"] },
        { table: "habit_logs", method: "eq", args: ["habit_id", HABIT_ID] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "eq", args: ["logged_date", "2026-02-03"] },
        { table: "habit_logs", method: "single", args: [] },
      ]);
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getLogForDate(HABIT_ID, USER_ID, "2026-02-03");

      expect(result).toBeNull();
    });

    it("throws when error.code is not PGRST116", async () => {
      const err = { code: "OTHER", message: "boom" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(
        db.getLogForDate(HABIT_ID, USER_ID, "2026-02-03"),
      ).rejects.toEqual(err);
    });
  });

  // ─── getUserLogsForDate ───────────────────────────────────────────────────
  describe("getUserLogsForDate", () => {
    it("fetches completed logs for a user/date", async () => {
      const rows = [makeLog({ id: "a" }), makeLog({ id: "b" })];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getUserLogsForDate(USER_ID, "2026-02-03");

      expect(result).toEqual(rows);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "select", args: ["*"] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "eq", args: ["logged_date", "2026-02-03"] },
        { table: "habit_logs", method: "eq", args: ["completed", true] },
      ]);
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserLogsForDate(USER_ID, "2026-02-03");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("ulf"));

      await expect(
        db.getUserLogsForDate(USER_ID, "2026-02-03"),
      ).rejects.toThrow("ulf");
    });
  });

  // ─── upsertLog ────────────────────────────────────────────────────────────
  describe("upsertLog", () => {
    const insertRow = {
      habit_id: HABIT_ID,
      user_id: USER_ID,
      logged_date: "2026-02-03",
      completed: true,
    };

    it("upserts with onConflict and returns the row", async () => {
      const row = makeLog();
      mockSupabaseClient.setMockResponse(row);

      const result = await db.upsertLog(insertRow);

      expect(result).toEqual(row);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        {
          table: "habit_logs",
          method: "upsert",
          args: [insertRow, { onConflict: "habit_id,logged_date" }],
        },
        { table: "habit_logs", method: "select", args: [] },
        { table: "habit_logs", method: "single", args: [] },
      ]);
    });

    it("throws when the upsert errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("conflict"));

      await expect(db.upsertLog(insertRow)).rejects.toThrow("conflict");
    });
  });

  // ─── deleteLog ────────────────────────────────────────────────────────────
  describe("deleteLog", () => {
    it("deletes with full chain assertion", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteLog(HABIT_ID, USER_ID, "2026-02-03");

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "delete", args: [] },
        { table: "habit_logs", method: "eq", args: ["habit_id", HABIT_ID] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "eq", args: ["logged_date", "2026-02-03"] },
      ]);
    });

    it("throws when the delete errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("del failed"));

      await expect(
        db.deleteLog(HABIT_ID, USER_ID, "2026-02-03"),
      ).rejects.toThrow("del failed");
    });
  });

  // ─── getAllUserLogs ───────────────────────────────────────────────────────
  describe("getAllUserLogs", () => {
    it("fetches user logs across habits with the full chain", async () => {
      const rows = [
        { habit_id: "h1", logged_date: "2026-02-05", completed: true },
        { habit_id: "h2", logged_date: "2026-02-06", completed: false },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getAllUserLogs(USER_ID, "2026-02-01", "2026-02-09");

      expect(result).toEqual(rows);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        {
          table: "habit_logs",
          method: "select",
          args: ["habit_id, logged_date, completed"],
        },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "gte", args: ["logged_date", "2026-02-01"] },
        { table: "habit_logs", method: "lte", args: ["logged_date", "2026-02-09"] },
      ]);
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getAllUserLogs(USER_ID, "2026-02-01", "2026-02-09");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("aul"));

      await expect(
        db.getAllUserLogs(USER_ID, "2026-02-01", "2026-02-09"),
      ).rejects.toThrow("aul");
    });
  });

  // ─── getLogsForHabitsOnDate ───────────────────────────────────────────────
  describe("getLogsForHabitsOnDate", () => {
    it("returns an empty Map when habitIds is empty (no DB call made)", async () => {
      // Reset query log so we can assert no calls happened.
      mockSupabaseClient.resetQueryLog();

      const result = await db.getLogsForHabitsOnDate([], USER_ID, "2026-02-03");

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      // No DB call should have fired for the empty-list fast path.
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });

    it("builds a Map keyed by habit_id and asserts the full chain", async () => {
      const rows: HabitLog[] = [
        makeLog({ id: "a", habit_id: "h1", logged_date: "2026-02-03" }),
        makeLog({ id: "b", habit_id: "h2", logged_date: "2026-02-03" }),
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getLogsForHabitsOnDate(
        ["h1", "h2"],
        USER_ID,
        "2026-02-03",
      );

      expect(result.size).toBe(2);
      expect(result.get("h1")).toEqual(rows[0]);
      expect(result.get("h2")).toEqual(rows[1]);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "select", args: ["*"] },
        { table: "habit_logs", method: "in", args: ["habit_id", ["h1", "h2"]] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "eq", args: ["logged_date", "2026-02-03"] },
      ]);
    });

    it("returns an empty Map when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getLogsForHabitsOnDate(
        ["h1"],
        USER_ID,
        "2026-02-03",
      );

      expect(result.size).toBe(0);
    });

    it("later rows overwrite earlier rows for the same habit_id", async () => {
      // If the DB returned two logs for the same habit (shouldn't happen in
      // production but worth testing the `.forEach(set)` semantics), the last
      // one wins. This pins the loop behavior so a mutation that swaps set→get
      // is detectable.
      const first = makeLog({ id: "a", habit_id: "h1" });
      const second = makeLog({ id: "b", habit_id: "h1", completed: false });
      mockSupabaseClient.setMockResponse([first, second]);

      const result = await db.getLogsForHabitsOnDate(
        ["h1"],
        USER_ID,
        "2026-02-03",
      );

      expect(result.size).toBe(1);
      expect(result.get("h1")).toEqual(second);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("lfhd"));

      await expect(
        db.getLogsForHabitsOnDate(["h1"], USER_ID, "2026-02-03"),
      ).rejects.toThrow("lfhd");
    });
  });

  // ─── getHabitStats ────────────────────────────────────────────────────────
  describe("getHabitStats", () => {
    beforeEach(() => {
      // Freeze time so startDate math is deterministic for the spy assertion.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns {totalDays, completedDays, completionRate} with rounded percent", async () => {
      // 2 completed, 1 incomplete => 2/30 * 100 = 6.67 → rounds to 7
      const rows = [
        makeLog({ id: "a", completed: true }),
        makeLog({ id: "b", completed: true }),
        makeLog({ id: "c", completed: false }),
      ];
      const spy = vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(rows);

      const stats = await db.getHabitStats(HABIT_ID, USER_ID, 30);

      expect(stats).toEqual({
        totalDays: 30,
        completedDays: 2,
        completionRate: 7,
      });

      // Source passes the 30-day span to getLogsByDateRange with
      // getLocalDateString(today) as the end date.
      expect(spy).toHaveBeenCalledTimes(1);
      const call = spy.mock.calls[0];
      expect(call[0]).toBe(HABIT_ID);
      expect(call[1]).toBe(USER_ID);
      // start and end strings should be 30 days apart
      const start = call[2];
      const end = call[3];
      const startDate = new Date(start + "T00:00:00");
      const endDate = new Date(end + "T00:00:00");
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(30);

      spy.mockRestore();
    });

    it("defaults days to 30 when omitted", async () => {
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValueOnce([]);

      const stats = await db.getHabitStats(HABIT_ID, USER_ID);

      expect(stats.totalDays).toBe(30);
      expect(stats.completedDays).toBe(0);
      expect(stats.completionRate).toBe(0);

      spy.mockRestore();
    });

    it("returns completionRate=0 when days=0 (avoids divide-by-zero)", async () => {
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValueOnce([]);

      const stats = await db.getHabitStats(HABIT_ID, USER_ID, 0);

      expect(stats).toEqual({
        totalDays: 0,
        completedDays: 0,
        completionRate: 0,
      });

      spy.mockRestore();
    });

    it("returns 100% when every day in the window is completed", async () => {
      // 30 completed logs out of 30 days → 100%
      const rows = Array.from({ length: 30 }, (_, i) =>
        makeLog({ id: `l-${i}`, completed: true }),
      );
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValueOnce(rows);

      const stats = await db.getHabitStats(HABIT_ID, USER_ID, 30);

      expect(stats.completedDays).toBe(30);
      expect(stats.completionRate).toBe(100);

      spy.mockRestore();
    });
  });

  // ─── toggleLog ────────────────────────────────────────────────────────────
  describe("toggleLog", () => {
    const dailyHabit = {
      id: HABIT_ID,
      user_id: USER_ID,
      name: "Water",
      frequency: { type: "daily" } as HabitFrequency,
      best_streak: 5,
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("toggles an existing completed log to incomplete and recomputes the streak", async () => {
      const existingLog = makeLog({ completed: true });
      const toggledLog = makeLog({ completed: false });
      const getLogSpy = vi
        .spyOn(db, "getLogForDate")
        .mockResolvedValueOnce(existingLog);
      const upsertSpy = vi
        .spyOn(db, "upsertLog")
        .mockResolvedValueOnce(toggledLog);
      const calcSpy = vi
        .spyOn(db, "calculateStreak")
        .mockResolvedValueOnce({ currentStreak: 2, bestStreak: 5 });

      mockGetHabit.mockResolvedValueOnce(dailyHabit);
      mockUpdateHabitStreak.mockResolvedValueOnce(undefined);

      const result = await db.toggleLog(HABIT_ID, USER_ID, "2026-02-15");

      expect(result).toEqual({
        log: toggledLog,
        currentStreak: 2,
        bestStreak: 5,
      });

      // getLogForDate called with the right args.
      expect(getLogSpy).toHaveBeenCalledWith(HABIT_ID, USER_ID, "2026-02-15");

      // upsertLog receives the TOGGLED completed flag (!true => false).
      expect(upsertSpy).toHaveBeenCalledWith({
        habit_id: HABIT_ID,
        user_id: USER_ID,
        logged_date: "2026-02-15",
        completed: false,
      });

      // getHabit called before streak calc.
      expect(mockGetHabit).toHaveBeenCalledWith(HABIT_ID, USER_ID);

      // calculateStreak receives the habit's frequency + previous best_streak.
      expect(calcSpy).toHaveBeenCalledWith(
        HABIT_ID,
        USER_ID,
        dailyHabit.frequency,
        dailyHabit.best_streak,
      );

      // updateHabitStreak receives the exact computed values.
      expect(mockUpdateHabitStreak).toHaveBeenCalledWith(
        HABIT_ID,
        USER_ID,
        2,
        5,
      );
    });

    it("creates a new completed log when no existing log (existing=null, new=true)", async () => {
      const newLog = makeLog({ completed: true });
      const getLogSpy = vi
        .spyOn(db, "getLogForDate")
        .mockResolvedValueOnce(null);
      const upsertSpy = vi
        .spyOn(db, "upsertLog")
        .mockResolvedValueOnce(newLog);
      const calcSpy = vi
        .spyOn(db, "calculateStreak")
        .mockResolvedValueOnce({ currentStreak: 1, bestStreak: 5 });
      mockGetHabit.mockResolvedValueOnce(dailyHabit);

      const result = await db.toggleLog(HABIT_ID, USER_ID, "2026-02-15");

      expect(result.log).toBe(newLog);
      expect(result.currentStreak).toBe(1);
      expect(result.bestStreak).toBe(5);

      // No existing → completed=true on the insert.
      expect(upsertSpy).toHaveBeenCalledWith({
        habit_id: HABIT_ID,
        user_id: USER_ID,
        logged_date: "2026-02-15",
        completed: true,
      });

      expect(getLogSpy).toHaveBeenCalledOnce();
      expect(calcSpy).toHaveBeenCalledOnce();
    });

    it("toggles existing incomplete log to completed (!false => true)", async () => {
      const existingLog = makeLog({ completed: false });
      const toggledLog = makeLog({ completed: true });
      vi.spyOn(db, "getLogForDate").mockResolvedValueOnce(existingLog);
      const upsertSpy = vi
        .spyOn(db, "upsertLog")
        .mockResolvedValueOnce(toggledLog);
      vi.spyOn(db, "calculateStreak").mockResolvedValueOnce({
        currentStreak: 3,
        bestStreak: 5,
      });
      mockGetHabit.mockResolvedValueOnce(dailyHabit);

      await db.toggleLog(HABIT_ID, USER_ID, "2026-02-15");

      expect(upsertSpy).toHaveBeenCalledWith({
        habit_id: HABIT_ID,
        user_id: USER_ID,
        logged_date: "2026-02-15",
        completed: true,
      });
    });

    it("throws 'Habit not found' when getHabit returns null", async () => {
      vi.spyOn(db, "getLogForDate").mockResolvedValueOnce(null);
      vi.spyOn(db, "upsertLog").mockResolvedValueOnce(makeLog());
      mockGetHabit.mockResolvedValueOnce(null);

      await expect(
        db.toggleLog(HABIT_ID, USER_ID, "2026-02-15"),
      ).rejects.toThrow("Habit not found");

      // updateHabitStreak must NOT be called when the habit is missing.
      expect(mockUpdateHabitStreak).not.toHaveBeenCalled();
    });
  });

  // ─── calculateStreak (daily) ──────────────────────────────────────────────
  describe("calculateStreak — daily", () => {
    it("counts consecutive days from today backwards", async () => {
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const logs: HabitLog[] = [];
        for (let i = 0; i < 5; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          logs.push(
            makeLog({
              id: `l-${i}`,
              logged_date: getLocalDateString(d),
              completed: true,
            }),
          );
        }
        const spy = vi
          .spyOn(db, "getLogsByDateRange")
          .mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          0,
        );

        expect(result.currentStreak).toBe(5);
        // bestStreak = max(5, previous=0) = 5
        expect(result.bestStreak).toBe(5);
        // One query was enough (30-day window > 5-day streak).
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("allows today to be incomplete without breaking the streak", async () => {
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        // Yesterday and day-before are complete; today is absent.
        const logs: HabitLog[] = [
          makeLog({
            id: "l-1",
            logged_date: getLocalDateString(
              new Date(today.getTime() - 1 * 86_400_000),
            ),
            completed: true,
          }),
          makeLog({
            id: "l-2",
            logged_date: getLocalDateString(
              new Date(today.getTime() - 2 * 86_400_000),
            ),
            completed: true,
          }),
        ];
        vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          0,
        );

        // Today incomplete → not counted but doesn't break; streak = 2.
        expect(result.currentStreak).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores uncompleted logs when building the completedDates set", async () => {
      // Mix: 2 completed + 1 explicitly incomplete (completed=false) log in
      // the same window. The `.filter(log => log.completed)` must drop the
      // incomplete one. If filter is mutated away, the incomplete day would
      // be counted as a completion → streak would be 3 instead of 2.
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const dateStr = (offset: number) =>
          getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
        const logs: HabitLog[] = [
          // Today: completed
          makeLog({ id: "a", logged_date: dateStr(0), completed: true }),
          // Yesterday: explicitly incomplete → must NOT count
          makeLog({ id: "b", logged_date: dateStr(-1), completed: false }),
          // 2 days ago: completed (but walk-back hits yesterday-incomplete first)
          makeLog({ id: "c", logged_date: dateStr(-2), completed: true }),
        ];
        vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          0,
        );

        // Walk: today (complete) → yesterday (NOT in completedDates, not today
        // → break). streak = 1. If filter removed, yesterday would be counted
        // (completed=false but still present) and streak would continue → 3.
        expect(result.currentStreak).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("breaks the streak on a past incomplete day (not today)", async () => {
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const dateStr = (offset: number) =>
          getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
        // Today completed, yesterday completed, day-before MISSING (break here).
        const logs: HabitLog[] = [
          makeLog({ id: "l-0", logged_date: dateStr(0), completed: true }),
          makeLog({ id: "l-1", logged_date: dateStr(-1), completed: true }),
          // day -2 is absent/uncompleted
          makeLog({ id: "l-3", logged_date: dateStr(-3), completed: true }),
        ];
        vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          10,
        );

        // Walks today → yesterday → day-2 (missing, breaks). streak = 2.
        expect(result.currentStreak).toBe(2);
        // bestStreak = max(2, 10) = 10 (keeps previous best).
        expect(result.bestStreak).toBe(10);
      } finally {
        vi.useRealTimers();
      }
    });

    it("expands the window when the streak fills it (boundary hit)", async () => {
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const makeCompleted = (count: number): HabitLog[] => {
          const out: HabitLog[] = [];
          for (let i = 0; i < count; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            out.push(
              makeLog({
                id: `l-${i}`,
                logged_date: getLocalDateString(d),
                completed: true,
              }),
            );
          }
          return out;
        };

        const spy = vi
          .spyOn(db, "getLogsByDateRange")
          // First call (30 days): 31 consecutive → streak reaches boundary.
          .mockResolvedValueOnce(makeCompleted(31))
          // Second call (60 days): 35 consecutive, then gap → streak=35 < 60.
          .mockResolvedValueOnce(makeCompleted(35));

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          0,
        );

        expect(result.currentStreak).toBe(35);
        expect(spy).toHaveBeenCalledTimes(2);

        // Assert exact window sizes: 30 then 60.
        const firstStart = new Date(spy.mock.calls[0][2]);
        const secondStart = new Date(spy.mock.calls[1][2]);
        const todayLocal = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        expect(
          Math.round(
            (todayLocal.getTime() - firstStart.getTime()) / 86_400_000,
          ),
        ).toBe(30);
        expect(
          Math.round(
            (todayLocal.getTime() - secondStart.getTime()) / 86_400_000,
          ),
        ).toBe(60);
      } finally {
        vi.useRealTimers();
      }
    });

    it("caps the expansion at 365 days and returns even when boundary hits", async () => {
      const today = new Date("2026-02-15T00:00:00");
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const makeAllCompleted = (windowSize: number): HabitLog[] => {
          const out: HabitLog[] = [];
          for (let i = 0; i <= windowSize + 5; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            out.push(
              makeLog({
                id: `l-${i}`,
                logged_date: getLocalDateString(d),
                completed: true,
              }),
            );
          }
          return out;
        };

        // Windows expand 30 → 60 → 120 → 240 → 365 (5 calls at MAX).
        const sizes = [30, 60, 120, 240, 365];
        const spy = vi.spyOn(db, "getLogsByDateRange");
        sizes.forEach((sz) =>
          spy.mockResolvedValueOnce(makeAllCompleted(sz)),
        );

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "daily" },
          0,
        );

        expect(spy).toHaveBeenCalledTimes(5);
        // At MAX_WINDOW (365), streak is returned even if boundary hit.
        expect(result.currentStreak).toBeGreaterThanOrEqual(365);

        // The last window should be exactly 365 days.
        const lastStart = new Date(spy.mock.calls[4][2]);
        const todayLocal = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        expect(
          Math.round(
            (todayLocal.getTime() - lastStart.getTime()) / 86_400_000,
          ),
        ).toBe(365);
      } finally {
        vi.useRealTimers();
      }
    });

    it("weekdays frequency skips weekends while counting the streak", async () => {
      // Choose a Friday as "today" so Sat/Sun are skipped.
      const today = new Date("2026-02-13T00:00:00"); // Friday
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const d = (offset: number) =>
          getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
        // Today (Fri) + Thu + Wed completed, then Tue completed.
        const logs: HabitLog[] = [
          makeLog({ id: "a", logged_date: d(0), completed: true }),
          makeLog({ id: "b", logged_date: d(-1), completed: true }),
          makeLog({ id: "c", logged_date: d(-2), completed: true }),
          makeLog({ id: "d", logged_date: d(-3), completed: true }),
        ];
        vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "weekdays" },
          0,
        );

        // Fri, Thu, Wed, Tue all counted → streak = 4.
        expect(result.currentStreak).toBe(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it("custom frequency only counts scheduled days", async () => {
      // Tuesday (2=Tue) is scheduled only on Mon & Wed (days=[1,3]).
      // Use a Wednesday as today.
      const today = new Date("2026-02-11T00:00:00"); // Wed
      vi.useFakeTimers();
      vi.setSystemTime(today);
      try {
        const d = (offset: number) =>
          getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
        // Today (Wed) completed. Mon (2 days ago) completed. Tue (1 day) absent
        // but not tracked → streak shouldn't break.
        const logs: HabitLog[] = [
          makeLog({ id: "a", logged_date: d(0), completed: true }),
          makeLog({ id: "b", logged_date: d(-2), completed: true }),
        ];
        vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

        const result = await db.calculateStreak(
          HABIT_ID,
          USER_ID,
          { type: "custom", days: [1, 3] },
          0,
        );

        expect(result.currentStreak).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── calculateStreak (weekly + times_per_week) ────────────────────────────
  describe("calculateStreak — weekly/times_per_week", () => {
    // Use a Saturday as today to ensure "current week not last day" logic
    // can be exercised with a Sun week-start (last day = Sat, day 6).
    const today = new Date("2026-02-14T00:00:00"); // Saturday

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(today);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("counts consecutive successful weeks for times_per_week (target=3)", async () => {
      // Today = Sat Feb 14 2026 (day 6, last day of Sun-start week).
      // So current week has ended. We need 3+ completions this week
      // AND 3+ each prior week to build a streak.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      // Current week (Sun Feb 8..Sat Feb 14): 3 completions
      // Prev week (Sun Feb 1..Sat Feb 7): 3 completions
      // Two weeks ago (Sun Jan 25..Sat Jan 31): 2 completions → breaks here
      const logs: HabitLog[] = [
        // current week (days -6..0 from Sat)
        makeLog({ id: "a", logged_date: d(0), completed: true }),
        makeLog({ id: "b", logged_date: d(-1), completed: true }),
        makeLog({ id: "c", logged_date: d(-2), completed: true }),
        // previous week (-7..-13 from Sat)
        makeLog({ id: "d", logged_date: d(-7), completed: true }),
        makeLog({ id: "e", logged_date: d(-8), completed: true }),
        makeLog({ id: "f", logged_date: d(-9), completed: true }),
        // two weeks ago (-14..-20 from Sat) → only 2 completions
        makeLog({ id: "g", logged_date: d(-14), completed: true }),
        makeLog({ id: "h", logged_date: d(-15), completed: true }),
      ];
      vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0, // Sunday start
      );

      // streak = 2 (current week + previous week met target)
      expect(result.currentStreak).toBe(2);
      expect(result.bestStreak).toBe(2);
    });

    it("returns streak=0 when current week ended without meeting target (early-return; does NOT walk prior weeks)", async () => {
      // Today = Saturday (last day of week with Sun-start). Week ended.
      // Only 1 completion this week → target=3 not met.
      // CRITICAL: previous weeks have SUCCESSFUL completions (3 each). If the
      // early-return path is mutated to fall through, the walk-back loop would
      // count those prior weeks and return currentStreak>0. We assert 0 to
      // pin the early-return behavior.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const logs: HabitLog[] = [
        // current week (Sat=today, Sun-start): only 1 completion (fail)
        makeLog({ id: "a", logged_date: d(-1), completed: true }),
        // previous week (-7..-13) — 3 successes (would extend streak if reached)
        makeLog({ id: "b", logged_date: d(-7), completed: true }),
        makeLog({ id: "c", logged_date: d(-8), completed: true }),
        makeLog({ id: "d", logged_date: d(-9), completed: true }),
      ];
      vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        5, // previous best
        0,
      );

      // Early return: currentStreak=0 regardless of prior weeks.
      expect(result.currentStreak).toBe(0);
      // Early return preserves previousBestStreak (5), NOT max(0, 5).
      // Both evaluate to 5, but this pins the early-return path.
      expect(result.bestStreak).toBe(5);
    });

    it("distinguishes in-progress-week path from ended-week-failed path by walking prior weeks", async () => {
      // Use THURSDAY (not last day of Sun-start week) → isCurrentWeekInProgress=true.
      // Current week has 0 completions → enters `currentStreak=0` path AND
      // proceeds to walk prior weeks. With 2 prior successful weeks,
      // currentStreak = 2. This kills mutations that force the early-return
      // branch when the week is actually in progress.
      const thu = new Date("2026-02-12T00:00:00"); // Thursday
      vi.setSystemTime(thu);

      const d = (offset: number) =>
        getLocalDateString(new Date(thu.getTime() + offset * 86_400_000));
      const logs: HabitLog[] = [
        // No current-week completions.
        // Previous week (Sun Feb 1..Sat Feb 7): from Thu, day -5..-11 roughly.
        makeLog({ id: "a", logged_date: d(-5), completed: true }), // Sat Feb 7
        makeLog({ id: "b", logged_date: d(-6), completed: true }), // Fri Feb 6
        makeLog({ id: "c", logged_date: d(-7), completed: true }), // Thu Feb 5
        // Two weeks ago (Sun Jan 25..Sat Jan 31): day -12..-18 roughly.
        makeLog({ id: "d", logged_date: d(-12), completed: true }), // Sat Jan 31
        makeLog({ id: "e", logged_date: d(-13), completed: true }), // Fri Jan 30
        makeLog({ id: "f", logged_date: d(-14), completed: true }), // Thu Jan 29
      ];
      vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0,
      );

      // In-progress path: 0 for current week, then 2 prior successful weeks = 2.
      expect(result.currentStreak).toBe(2);
    });

    it("current week in progress (not last day) doesn't break streak yet", async () => {
      // Use Thursday as today so current week is IN progress (not last day).
      const thu = new Date("2026-02-12T00:00:00"); // Thursday
      vi.setSystemTime(thu);

      const d = (offset: number) =>
        getLocalDateString(new Date(thu.getTime() + offset * 86_400_000));
      // Current week: 1 completion (< target=3), but week is in progress.
      // Previous week: 3 completions → met target.
      const logs: HabitLog[] = [
        makeLog({ id: "a", logged_date: d(-1), completed: true }), // current week
        // previous week (Sun Feb 1..Sat Feb 7). Thu is day 4. Thu - 5 = Sat Feb 7 etc.
        makeLog({ id: "b", logged_date: d(-5), completed: true }),
        makeLog({ id: "c", logged_date: d(-6), completed: true }),
        makeLog({ id: "d", logged_date: d(-7), completed: true }),
      ];
      vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0,
      );

      // Current week not counted (in progress, not yet failed). Previous week
      // counted → streak = 1.
      expect(result.currentStreak).toBe(1);
    });

    it("weekly frequency treats 1 completion per week as success", async () => {
      // Today = Saturday, Sun-start week ended.
      // Current week: 1 completion → success. Previous week: 1 completion → success.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const logs: HabitLog[] = [
        makeLog({ id: "a", logged_date: d(-1), completed: true }), // current week
        makeLog({ id: "b", logged_date: d(-8), completed: true }), // previous week
      ];
      vi.spyOn(db, "getLogsByDateRange").mockResolvedValueOnce(logs);

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "weekly" },
        0,
        0,
      );

      expect(result.currentStreak).toBe(2);
    });

    it("expands window for times_per_week when streak fills the window", async () => {
      // Saturday today, Sun-start. 30-day initial window → 4 complete weeks.
      // Fill ALL 4 weeks with successful completions → currentStreak=4 >= 4.
      // This forces window expansion (weekly path at line 163).
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const makeAllWeeksSuccessful = (weeks: number): HabitLog[] => {
        const out: HabitLog[] = [];
        // Use Sat (offset 0), Fri (-1), Thu (-2) of each week since those land
        // in that week's Sun-start range (for offset 0 week it's this week).
        for (let w = 0; w < weeks; w++) {
          for (let day = 0; day < 3; day++) {
            out.push(
              makeLog({
                id: `w-${w}-${day}`,
                logged_date: d(-day - w * 7),
                completed: true,
              }),
            );
          }
        }
        return out;
      };

      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        // First window (30 days): fill 5 weeks → streak fills the ~4-week window.
        .mockResolvedValueOnce(makeAllWeeksSuccessful(5))
        // Second window (60 days): fill only 5 weeks → streak (5) < 8 weeks in 60 days.
        .mockResolvedValueOnce(makeAllWeeksSuccessful(5));

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0,
      );

      expect(result.currentStreak).toBe(5);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("expands window when times_per_week streak equals weeksInWindow boundary (< vs <=)", async () => {
      // windowDays=30 → weeksInWindow=floor(30/7)=4. If calculateWeeklyStreak
      // returns exactly 4, the check `4 < 4` is FALSE → expansion is needed.
      // A `<` → `<=` mutation at line 166 would make `4 <= 4` TRUE → return
      // immediately on the first call, never expanding. Pinning the call
      // count to 2 distinguishes the two.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const makeFourSuccessfulWeeks = (): HabitLog[] => {
        const out: HabitLog[] = [];
        for (let w = 0; w < 4; w++) {
          for (let day = 0; day < 3; day++) {
            out.push(
              makeLog({
                id: `w${w}-${day}`,
                logged_date: d(-day - w * 7),
                completed: true,
              }),
            );
          }
        }
        return out;
      };
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        // First call (30d): 4 successful weeks → streak=4 EQUALS weeksInWindow=4.
        .mockResolvedValueOnce(makeFourSuccessfulWeeks())
        // Second call (60d): same 4 weeks → streak=4, weeksInWindow=8, 4<8 → return.
        .mockResolvedValueOnce(makeFourSuccessfulWeeks());

      await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0,
      );

      // Must expand when streak === weeksInWindow (boundary case).
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("expands window when weekly streak equals weeksInWindow boundary (< vs <=)", async () => {
      // Same boundary test but for the `weekly` frequency branch at line 175.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const makeFourSuccessfulWeeks = (): HabitLog[] => {
        const out: HabitLog[] = [];
        for (let w = 0; w < 4; w++) {
          out.push(
            makeLog({
              id: `w${w}`,
              logged_date: d(-1 - w * 7),
              completed: true,
            }),
          );
        }
        return out;
      };
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValueOnce(makeFourSuccessfulWeeks())
        .mockResolvedValueOnce(makeFourSuccessfulWeeks());

      await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "weekly" },
        0,
        0,
      );

      // Must expand when streak === weeksInWindow.
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("caps at 365 days for times_per_week (returns at MAX_WINDOW boundary)", async () => {
      // Build 55 fully-successful weeks (target=3 per week). The 30-day initial
      // window covers ~4 weeks; each successive expansion (60/120/240/365)
      // fills its entire weeks-in-window, forcing expansion up to the cap.
      // Once windowDays >= MAX_WINDOW (365), the method returns.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const allSuccessful: HabitLog[] = [];
      for (let w = 0; w < 55; w++) {
        for (let day = 0; day < 3; day++) {
          allSuccessful.push(
            makeLog({
              id: `w-${w}-${day}`,
              logged_date: d(-day - w * 7),
              completed: true,
            }),
          );
        }
      }
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValue(allSuccessful); // same response for every window size

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        0,
        0,
      );

      // At max window, should return with a large streak (52+ due to safety cap).
      expect(result.currentStreak).toBeGreaterThanOrEqual(52);
      // Expanded 30→60→120→240→365 = 5 calls.
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it("weekly streak caps at 52 weeks (safety limit)", async () => {
      // Build 60 consecutive weeks of 1 completion each. The loop breaks
      // when currentStreak > 52.
      const d = (offset: number) =>
        getLocalDateString(new Date(today.getTime() + offset * 86_400_000));
      const logs: HabitLog[] = [];
      for (let w = 0; w < 60; w++) {
        logs.push(
          makeLog({
            id: `w-${w}`,
            logged_date: d(-1 - w * 7),
            completed: true,
          }),
        );
      }
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValue(logs); // same response for every window expansion

      const result = await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "weekly" },
        0,
        0,
      );

      // 52-cap means currentStreak increments past 52 and then breaks. Exact
      // value is 53 (the check is `currentStreak > 52` AFTER increment).
      expect(result.currentStreak).toBe(53);

      // Expansion loop: 30 → 60 → 120 → 240 → 365. Five calls expected.
      // A `windowDays / 7` → `windowDays * 7` mutation would inflate
      // weeksInWindow (e.g. 30*7=210) → `currentStreak < 210` true → return
      // immediately after the first call. Pinning call count to 5 kills it.
      // Similarly, a `windowDays * 2` → `Math.max(... , MAX_WINDOW)`
      // mutation at line 178 would jump straight to 365 on the first
      // expansion → call count would be 2, not 5.
      expect(spy).toHaveBeenCalledTimes(5);

      spy.mockRestore();
    });
  });

  // ─── getDetailedHabitStats — daily branch (uses COUNT queries) ────────────
  describe("getDetailedHabitStats — daily", () => {
    const daily: HabitFrequency = { type: "daily" };

    beforeEach(() => {
      vi.useFakeTimers();
      // Pick Wed Feb 11 2026 — mid-week, mid-month, simpler math.
      vi.setSystemTime(new Date("2026-02-11T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("issues 3 parallel count queries and caps percent at 100", async () => {
      // COUNT queries use `.lte(...)` as the terminal — awaiting the thenable
      // reads mockCount. All 3 parallel calls return count=5.
      mockSupabaseClient.setMockResponse(null, null, 5);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        daily,
        "2026-01-01T00:00:00",
        0, // Sunday start
      );

      // Each period returns completed=5. Totals are determined by schedule.
      expect(stats.thisWeek.completed).toBe(5);
      expect(stats.thisMonth.completed).toBe(5);
      expect(stats.allTime.completed).toBe(5);
      // thisWeek starts Sun Feb 8, today Wed Feb 11 → 4 scheduled days.
      expect(stats.thisWeek.total).toBe(4);
      // Percent capped at 100 (5 > 4 → min(100, 125) = 100).
      expect(stats.thisWeek.percent).toBe(100);
      // thisMonth: Feb 1..Feb 11 → 11 days. 5/11 * 100 = 45.45 → rounds 45.
      expect(stats.thisMonth.total).toBe(11);
      expect(stats.thisMonth.percent).toBe(45);
      // allTime: Jan 1..Feb 11 → 42 days. 5/42 → 12%.
      expect(stats.allTime.total).toBe(42);
      expect(stats.allTime.percent).toBe(12);
    });

    it("returns percent=0 when total=0 (no scheduled days yet)", async () => {
      // habitCreatedAt = tomorrow → no days scheduled anywhere.
      mockSupabaseClient.setMockResponse(null, null, 0);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        daily,
        "2026-03-01T00:00:00", // created AFTER today → total=0
        0,
      );

      expect(stats.thisWeek.total).toBe(0);
      expect(stats.thisWeek.percent).toBe(0);
      expect(stats.thisMonth.total).toBe(0);
      expect(stats.thisMonth.percent).toBe(0);
      expect(stats.allTime.total).toBe(0);
      expect(stats.allTime.percent).toBe(0);
    });

    it("throws when one of the parallel COUNT queries errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("count failed"), null);

      await expect(
        db.getDetailedHabitStats(
          HABIT_ID,
          USER_ID,
          daily,
          "2026-01-01T00:00:00",
          0,
        ),
      ).rejects.toThrow("count failed");
    });

    it("builds COUNT query with {count:'exact', head:true} + correct eq/gte/lte", async () => {
      mockSupabaseClient.setMockResponse(null, null, 0);
      mockSupabaseClient.resetQueryLog();

      await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        daily,
        "2026-01-01T00:00:00",
        0,
      );

      // 3 parallel queries, each 7 chained calls = 21 log entries.
      // Filter by method to pin the expected shapes precisely: a StringLiteral
      // mutation (e.g. 'habit_logs' → "") would leave ALL `from` calls with
      // wrong args, so asserting the filtered arrays matches the expected
      // count kills those mutants.
      const fromCalls = mockSupabaseClient.queryLog.filter((e) => e.method === "from");
      expect(fromCalls).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
      ]);
      const selectCalls = mockSupabaseClient.queryLog.filter((e) => e.method === "select");
      expect(selectCalls).toEqual([
        { table: "habit_logs", method: "select", args: ["*", { count: "exact", head: true }] },
        { table: "habit_logs", method: "select", args: ["*", { count: "exact", head: true }] },
        { table: "habit_logs", method: "select", args: ["*", { count: "exact", head: true }] },
      ]);
      const eqCalls = mockSupabaseClient.queryLog.filter((e) => e.method === "eq");
      // Each of the 3 queries does eq(habit_id), eq(user_id), eq(completed=true).
      expect(eqCalls).toHaveLength(9);
      // Every query should have the habit_id, user_id, and completed=true filters.
      const habitIdEqs = eqCalls.filter((e) => e.args[0] === "habit_id");
      expect(habitIdEqs).toHaveLength(3);
      habitIdEqs.forEach((e) => expect(e.args[1]).toBe(HABIT_ID));
      const userIdEqs = eqCalls.filter((e) => e.args[0] === "user_id");
      expect(userIdEqs).toHaveLength(3);
      userIdEqs.forEach((e) => expect(e.args[1]).toBe(USER_ID));
      const completedEqs = eqCalls.filter((e) => e.args[0] === "completed");
      expect(completedEqs).toHaveLength(3);
      completedEqs.forEach((e) => expect(e.args[1]).toBe(true));

      // Each query uses gte/lte on logged_date.
      const gteCalls = mockSupabaseClient.queryLog.filter((e) => e.method === "gte");
      expect(gteCalls).toHaveLength(3);
      gteCalls.forEach((e) => expect(e.args[0]).toBe("logged_date"));
      const lteCalls = mockSupabaseClient.queryLog.filter((e) => e.method === "lte");
      expect(lteCalls).toHaveLength(3);
      lteCalls.forEach((e) => expect(e.args[0]).toBe("logged_date"));
    });
  });

  // ─── getDetailedHabitStats — weekdays (non-daily, non-weekly) ─────────────
  describe("getDetailedHabitStats — weekdays", () => {
    const weekdays: HabitFrequency = { type: "weekdays" };

    beforeEach(() => {
      vi.useFakeTimers();
      // Wed Feb 11 2026. Week starts Sun Feb 8. Mon Feb 9 + Tue Feb 10 + Wed Feb 11
      // are weekdays in this week → 3 scheduled days.
      vi.setSystemTime(new Date("2026-02-11T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fetches full logs + filters by shouldTrackOnDate (weekdays only)", async () => {
      // Return 3 completed logs: Mon, Tue, Wed (all weekdays).
      const rows = [
        { logged_date: "2026-02-09" }, // Mon
        { logged_date: "2026-02-10" }, // Tue
        { logged_date: "2026-02-11" }, // Wed
      ];
      mockSupabaseClient.setMockResponse(rows);
      mockSupabaseClient.resetQueryLog();

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-02-02T00:00:00", // created Mon Feb 2
        0,
      );

      // thisWeek (Sun Feb 8..Wed Feb 11): scheduled Mon/Tue/Wed = 3 total.
      // Completed Mon/Tue/Wed = 3. Percent = 100.
      expect(stats.thisWeek).toEqual({ completed: 3, total: 3, percent: 100 });

      // Full-chain assertion for the non-daily SELECT branch. This pins every
      // string literal (from/select/eq/gte/lte) against mutation, since a
      // mutation that swaps the table name or column name would change this
      // exact log array.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        { table: "habit_logs", method: "select", args: ["logged_date"] },
        { table: "habit_logs", method: "eq", args: ["habit_id", HABIT_ID] },
        { table: "habit_logs", method: "eq", args: ["user_id", USER_ID] },
        { table: "habit_logs", method: "eq", args: ["completed", true] },
        { table: "habit_logs", method: "gte", args: ["logged_date", "2026-02-02"] },
        { table: "habit_logs", method: "lte", args: ["logged_date", "2026-02-11"] },
      ]);
    });

    it("non-daily branch percent uses completed/total formula (not completed*total)", async () => {
      // 1 completed / 3 scheduled days → 33%. A `/` → `*` mutation would
      // produce Math.min(Math.round((1*3)*100), 100) = 100, while the
      // correct formula yields Math.min(33, 100) = 33. The cap doesn't hide
      // this because the correct result is well below 100.
      const rows = [
        { logged_date: "2026-02-09" }, // Mon (scheduled, completed)
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-02-09T00:00:00", // Mon
        0,
      );

      // thisWeek: Mon/Tue/Wed = 3 scheduled days, 1 completed → 33%.
      expect(stats.thisWeek.total).toBe(3);
      expect(stats.thisWeek.completed).toBe(1);
      expect(stats.thisWeek.percent).toBe(33);
    });

    it("non-daily branch counts only scheduled days (weekends excluded)", async () => {
      // Habit created Sun Feb 1; today Wed Feb 11 → 11 days in allTime range.
      // Weekdays in Feb 1..Feb 11: Mon 2, Tue 3, Wed 4, Thu 5, Fri 6,
      //                              Mon 9, Tue 10, Wed 11 = 8 scheduled days.
      // Return NO completed logs → expect total=8, completed=0, percent=0.
      mockSupabaseClient.setMockResponse([]);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-02-01T00:00:00", // created Sun Feb 1
        0,
      );

      // Weekdays filter: Mon-Fri only — Sat Feb 7 and Sun Feb 8 are excluded.
      expect(stats.allTime.total).toBe(8);
      expect(stats.allTime.completed).toBe(0);
      expect(stats.allTime.percent).toBe(0);
    });

    it("non-daily branch caps percent at 100 when completed matches exact scheduled count", async () => {
      // 3 scheduled days this week (Mon Feb 9, Tue Feb 10, Wed Feb 11).
      // Providing 3 matching completions → 3/3 → 100% exactly.
      // Providing a 4th completion on a WEEKEND (Sat Feb 7) should be ignored
      // because shouldTrackOnDate filters it, so total stays 3 not 4.
      const rows = [
        { logged_date: "2026-02-09" }, // Mon (scheduled)
        { logged_date: "2026-02-10" }, // Tue (scheduled)
        { logged_date: "2026-02-11" }, // Wed (scheduled)
        { logged_date: "2026-02-07" }, // Sat (NOT scheduled, ignored)
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-02-09T00:00:00", // created Mon
        0,
      );

      expect(stats.thisWeek.total).toBe(3);
      expect(stats.thisWeek.completed).toBe(3);
      expect(stats.thisWeek.percent).toBe(100);
    });

    it("throws when the logs fetch errors", async () => {
      mockSupabaseClient.setMockResponse(
        null,
        new Error("detailed fetch failed"),
      );

      await expect(
        db.getDetailedHabitStats(
          HABIT_ID,
          USER_ID,
          weekdays,
          "2026-02-01T00:00:00",
          0,
        ),
      ).rejects.toThrow("detailed fetch failed");
    });

    it("weekdays branch handles null completedLogs (fallback to [])", async () => {
      // A `|| []` → `|| ["Stryker was here"]` mutation would seed the set
      // with a bogus entry; subsequent `has("2026-02-11")` etc would still
      // return false, but the set size would be 1. We can't check size, but
      // we can verify completed===0 which requires an empty set.
      mockSupabaseClient.setMockResponse(null);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-02-09T00:00:00",
        0,
      );

      expect(stats.thisWeek.completed).toBe(0);
      expect(stats.thisWeek.total).toBe(3);
    });

    it("returns percent=0 when total=0 (no scheduled days in range)", async () => {
      // Habit created tomorrow → no scheduled days fall in [createdAt..today].
      mockSupabaseClient.setMockResponse([]);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        weekdays,
        "2026-03-01T00:00:00", // future
        0,
      );

      expect(stats.thisWeek).toEqual({ completed: 0, total: 0, percent: 0 });
    });
  });

  // ─── getDetailedHabitStats — times_per_week ───────────────────────────────
  describe("getDetailedHabitStats — times_per_week", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Sat Feb 14 2026 — last day of the Sun-start week; week has "ended".
      vi.setSystemTime(new Date("2026-02-14T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("thisWeek returns completed/target and caps percent at 100", async () => {
      // 4 completions this week, target=3 → capped at 100%.
      const rows = [
        { logged_date: "2026-02-08" }, // Sun
        { logged_date: "2026-02-09" }, // Mon
        { logged_date: "2026-02-10" }, // Tue
        { logged_date: "2026-02-11" }, // Wed
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-01T00:00:00",
        0,
      );

      expect(stats.thisWeek.completed).toBe(4);
      expect(stats.thisWeek.total).toBe(3);
      expect(stats.thisWeek.percent).toBe(100);
    });

    it("thisWeek with partial progress uses Math.round", async () => {
      // 2/3 = 0.667 → 67%
      const rows = [
        { logged_date: "2026-02-08" },
        { logged_date: "2026-02-09" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-01T00:00:00",
        0,
      );

      expect(stats.thisWeek).toEqual({ completed: 2, total: 3, percent: 67 });
    });

    it("counts successful ended weeks across allTime with correct percent", async () => {
      // Habit created Sun Jan 4 2026. Today Sat Feb 14.
      // Weeks of interest (Sun-start):
      //   Jan 4..Jan 10 — 3 completions → success
      //   Jan 11..Jan 17 — 2 completions → fail
      //   Jan 18..Jan 24 — 3 completions → success
      //   Jan 25..Jan 31 — 3 completions → success
      //   Feb 1..Feb 7 — 0 → fail
      //   Feb 8..Feb 14 — 3 completions (current, ENDED today since today=Sat) → success
      const rows = [
        { logged_date: "2026-01-04" },
        { logged_date: "2026-01-05" },
        { logged_date: "2026-01-06" },
        { logged_date: "2026-01-11" },
        { logged_date: "2026-01-12" },
        { logged_date: "2026-01-18" },
        { logged_date: "2026-01-19" },
        { logged_date: "2026-01-20" },
        { logged_date: "2026-01-25" },
        { logged_date: "2026-01-26" },
        { logged_date: "2026-01-27" },
        { logged_date: "2026-02-08" },
        { logged_date: "2026-02-09" },
        { logged_date: "2026-02-10" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-01-04T00:00:00",
        0,
      );

      // allTime: 6 weeks total (all either ended or isCurrent), 4 successful.
      // 4/6 ≈ 67%.
      expect(stats.allTime.total).toBe(6);
      expect(stats.allTime.completed).toBe(4);
      expect(stats.allTime.percent).toBe(67);

      // thisMonth range: Feb 1..Feb 14. effectiveStart = max(Feb 1, Jan 4) =
      // Feb 1. Only 2 weeks in this range: Feb 1..Feb 7 (ended, 0 completions
      // → fail) + Feb 8..Feb 14 (current/ended, 3 completions → success).
      // This pins `effectiveStart = rangeStart > habitCreatedAt ? rangeStart : habitCreatedAt`
      // — mutations that flip the comparison would pull effectiveStart back
      // to Jan 4, inflating the month total.
      expect(stats.thisMonth.total).toBe(2);
      expect(stats.thisMonth.completed).toBe(1);
      expect(stats.thisMonth.percent).toBe(50);
    });

    it("weekly frequency uses target=1 and treats any completion as full week", async () => {
      const rows = [{ logged_date: "2026-02-10" }];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "weekly" },
        "2026-02-01T00:00:00",
        0,
      );

      expect(stats.thisWeek).toEqual({ completed: 1, total: 1, percent: 100 });
    });

    it("throws when the times_per_week logs query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("tpw fetch failed"));

      await expect(
        db.getDetailedHabitStats(
          HABIT_ID,
          USER_ID,
          { type: "times_per_week", count: 2 },
          "2026-02-01T00:00:00",
          0,
        ),
      ).rejects.toThrow("tpw fetch failed");
    });

    it("uses the correct query chain for times_per_week/weekly branch", async () => {
      mockSupabaseClient.setMockResponse([]);
      mockSupabaseClient.resetQueryLog();

      await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 2 },
        "2026-01-01T00:00:00",
        0,
      );

      // Verify the SELECT is scoped to logged_date only (not "*").
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "select",
        args: ["logged_date"],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["habit_id", HABIT_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["completed", true],
      });
      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["logged_date", "2026-01-01"],
      });
      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["logged_date", "2026-02-14"],
      });
    });

    it("handles null completedLogs gracefully (fallback to [] → empty set)", async () => {
      // If the DB returns data=null, source falls back to `[]` before
      // building the completedDates set. A mutation of `|| []` to a
      // non-empty sentinel array (e.g. ["Stryker was here"]) would
      // leak into the set and unexpectedly match a date.
      mockSupabaseClient.setMockResponse(null);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-08T00:00:00",
        0,
      );

      // With an empty set, no completions match; this week = 0 completed.
      expect(stats.thisWeek.completed).toBe(0);
      expect(stats.thisWeek.total).toBe(3);
      expect(stats.thisWeek.percent).toBe(0);
    });

    it("returns 0/0/0 when habitCreatedAt is after today (no weeks in range)", async () => {
      mockSupabaseClient.setMockResponse([]);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-06-01T00:00:00", // future
        0,
      );

      // No weeks fall in range → totalWeeks=0 → percent=0.
      expect(stats.allTime).toEqual({ completed: 0, total: 0, percent: 0 });
    });

    it("includes the week when today is exactly the week-start day (loop boundary <=)", async () => {
      // Today = Sun Feb 15 2026 (week-start day for weekStartDay=0).
      // For the allTime call with habitCreatedAt=Sun Feb 15, checkWeekStart
      // iterates to Feb 15 itself. The loop guard `checkWeekStart <= rangeEnd`
      // must include this iteration (`<=`); a `<` mutation would skip it and
      // return totalWeeks=0 instead of 1.
      vi.setSystemTime(new Date("2026-02-15T12:00:00")); // Sun

      const rows = [
        { logged_date: "2026-02-15" }, // Sun Feb 15 → current week
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "weekly" }, // target = 1
        "2026-02-15T00:00:00", // habit created today
        0,
      );

      // allTime: single week (Feb 15..Feb 21), isCurrentWeek=true → counted.
      // 1 completion → success. total=1, completed=1.
      expect(stats.allTime.total).toBe(1);
      expect(stats.allTime.completed).toBe(1);
    });

    it("habitCreatedAt mid-week advances to next Sunday for weekly counting", async () => {
      // Today = Sat Feb 14 (Sun-start week ended).
      // habitCreatedAt = Wed Feb 4 (mid-week). effectiveStart > getWeekStart
      // (Sun Feb 1), so the loop advances to Sun Feb 8 as first week counted.
      // That means: Feb 1 week is NOT counted. Only Feb 8 week (current/ended).
      // Providing 3 completions in Feb 8 week → 1 success / 1 total = 100%.
      const rows = [
        { logged_date: "2026-02-08" },
        { logged_date: "2026-02-09" },
        { logged_date: "2026-02-10" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-04T00:00:00", // Wed — mid-week creation
        0,
      );

      // allTime: Feb 1 week SKIPPED (effectiveStart was Wed > Sun Feb 1).
      // Only Feb 8 week counted → 1 total, 1 successful → 100%.
      expect(stats.allTime.total).toBe(1);
      expect(stats.allTime.completed).toBe(1);
      expect(stats.allTime.percent).toBe(100);
    });

    it("thisMonth uses habitCreatedAt when habit created mid-month (not startOfMonth)", async () => {
      // today = Sat Feb 14, startOfMonth = Feb 1. habitCreatedAt = Tue Feb 10.
      // Since Feb 10 > Feb 1 is false (Feb 1 not > Feb 10), the original
      // `rangeStart > habitCreatedAt` is FALSE → effectiveStart = habitCreatedAt.
      // getWeekStart(Feb 10, 0) = Feb 8 (Sunday). Since Feb 10 > Feb 8, advance
      // to Feb 15. Feb 15 > rangeEnd (Feb 14) → loop exits → totalWeeks=0.
      //
      // A mutation `true ? rangeStart : habitCreatedAt` → always rangeStart
      // (Feb 1) → iterations at Feb 1 and Feb 8 → totalWeeks=2. This test
      // kills that mutation by asserting totalWeeks=0.
      mockSupabaseClient.setMockResponse([]);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-10T00:00:00", // Tue Feb 10
        0,
      );

      expect(stats.thisMonth.total).toBe(0);
    });

    it("does NOT count weeks that haven't ended yet (except the current week)", async () => {
      // Today = Sat Feb 14 (current week ends today).
      // habitCreatedAt = Sun Feb 8 (exactly week start — no advancement).
      // The month range (Feb 1..Feb 14) has two weeks: Feb 1..Feb 7 (ended)
      // and Feb 8..Feb 14 (current, also ended since today=Sat, last day).
      // But effectiveStart=Feb 8 advances past Feb 1 week → only Feb 8 week.
      //
      // Provide 3 completions Feb 8/9/10 → success.
      const rows = [
        { logged_date: "2026-02-08" },
        { logged_date: "2026-02-09" },
        { logged_date: "2026-02-10" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-08T00:00:00",
        0,
      );

      // Only current/ended-today week counted.
      expect(stats.allTime.total).toBe(1);
      expect(stats.allTime.completed).toBe(1);
    });

    it("current-week counting (Thursday, not ended): current week still counts but prior week does too", async () => {
      // Thursday = mid-week, week NOT ended. The `isCurrentWeek` branch of
      // `weekHasEnded || isCurrentWeek` still includes the current week.
      const thu = new Date("2026-02-12T00:00:00"); // Thu
      vi.setSystemTime(thu);

      // Habit created Sun Feb 1 → 2 weeks: Feb 1..Feb 7 (ended) + Feb 8..Feb 14 (current, not ended).
      // Feb 1-7: 3 completions (success). Feb 8-14: 2 completions (fail, but counts as total).
      const rows = [
        { logged_date: "2026-02-01" },
        { logged_date: "2026-02-02" },
        { logged_date: "2026-02-03" },
        { logged_date: "2026-02-08" },
        { logged_date: "2026-02-09" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "times_per_week", count: 3 },
        "2026-02-01T00:00:00",
        0,
      );

      // Both weeks included (1 ended + 1 current). 1 successful, 2 total → 50%.
      expect(stats.allTime.total).toBe(2);
      expect(stats.allTime.completed).toBe(1);
      expect(stats.allTime.percent).toBe(50);
    });
  });

  // ─── date-level truncation (setHours) ─────────────────────────────────────
  // The source uses `today.setHours(0,0,0,0)` and `habitCreatedAt.setHours(0,0,0,0)`
  // to normalize timestamps to midnight. These tests pin the truncation by
  // using a non-midnight system time and a non-midnight createdAt value.
  describe("date normalization via setHours", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // 23:59:59.999 local — if setHours(0,0,0,0) is mutated, the date
      // arithmetic would be off by a day via rollover semantics.
      vi.setSystemTime(new Date("2026-02-11T23:59:59.999"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("calculateStreak normalizes today to midnight regardless of wall-clock time", async () => {
      // If setHours(0,0,0,0) is skipped, the query window calculation using
      // setDate would still produce correct local-date strings (since
      // getLocalDateString uses getDate/getMonth/getYear). So pin the range
      // passed to getLogsByDateRange: it should anchor on today's local date.
      const spy = vi
        .spyOn(db, "getLogsByDateRange")
        .mockResolvedValueOnce([]);

      await db.calculateStreak(
        HABIT_ID,
        USER_ID,
        { type: "daily" },
        0,
      );

      const call = spy.mock.calls[0];
      // End date should be today's local date string.
      expect(call[3]).toBe(getLocalDateString(new Date("2026-02-11T23:59:59.999")));
      expect(call[3]).toBe("2026-02-11");

      spy.mockRestore();
    });

    it("getDetailedHabitStats uses today's midnight for the non-daily fetch end date", async () => {
      mockSupabaseClient.setMockResponse([]);
      mockSupabaseClient.resetQueryLog();

      await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "weekdays" },
        // habitCreatedAt at 22:00 local on Feb 10 — if setHours isn't applied,
        // comparisons inside countDaysInRange (currentDate >= habitCreatedAt)
        // would incorrectly skip Feb 10 since Feb 10 00:00 < Feb 10 22:00.
        "2026-02-10T22:00:00",
        0,
      );

      // lte end date should be today's local date ("2026-02-11"), not
      // shifted by the near-midnight time-of-day.
      mockSupabaseClient.expectQuery({
        method: "lte",
        args: ["logged_date", "2026-02-11"],
      });
      // gte start date should be habitCreatedAt's local date ("2026-02-10"),
      // normalized to midnight despite the 22:00 wall-clock time.
      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["logged_date", "2026-02-10"],
      });
    });

    it("getDetailedHabitStats countDaysInRange counts habitCreatedAt day when truncated", async () => {
      // habitCreatedAt = Wed Feb 11 at 22:00 local (later than today's
      // normalized midnight). setHours(0,0,0,0) lowers it to Feb 11 00:00,
      // so currentDate (Feb 11 00:00) >= habitCreatedAt (Feb 11 00:00) is
      // true and the day is counted. If the truncation is skipped,
      // currentDate < habitCreatedAt → Feb 11 not counted → total = 0.
      mockSupabaseClient.setMockResponse([]);

      const stats = await db.getDetailedHabitStats(
        HABIT_ID,
        USER_ID,
        { type: "weekdays" },
        "2026-02-11T22:00:00", // Wed, AFTER today's "virtual" midnight
        0,
      );

      // With truncation: allTime = Feb 11 (Wed, weekday) = 1 day.
      expect(stats.allTime.total).toBe(1);
    });
  });
});
