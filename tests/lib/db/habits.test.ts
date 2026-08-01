import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HabitsDB } from "@/lib/db/habits";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { Habit, HabitInsert } from "@/lib/db/types";

// Mock logger so we can assert on log.error / log.warn calls. Tests below
// verify both happy-path (no log) and failure-path (log called with exact
// args) so mutants that remove the log call get killed.
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

const USER_ID = "user-123";
const HABIT_ID = "habit-123";

function makeHabit(over: Partial<Habit> = {}): Habit {
  return {
    id: HABIT_ID,
    user_id: USER_ID,
    name: "Morning Run",
    description: "Run 5km every morning",
    category_id: null,
    frequency: { type: "daily" },
    status: "active",
    current_streak: 5,
    best_streak: 12,
    paused_at: null,
    graduated_at: null,
    graduated_streak: null,
    nudge_dismissed_at: null,
    created_at: "2026-01-30T10:00:00Z",
    updated_at: "2026-01-30T10:00:00Z",
    ...over,
  };
}

describe("HabitsDB", () => {
  let db: HabitsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new HabitsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getUserHabits ────────────────────────────────────────────────────────
  describe("getUserHabits", () => {
    it("returns all habits for a user with the full SELECT chain", async () => {
      const rows = [makeHabit()];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getUserHabits(USER_ID);

      expect(result).toEqual(rows);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "from",
        args: ["habits"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "order",
        args: ["created_at", { ascending: false }],
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserHabits(USER_ID);

      expect(result).toEqual([]);
    });

    it("filters by status when provided", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserHabits(USER_ID, { status: "paused" });

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["status", "paused"],
      });
    });

    it("filters by category_id when provided", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserHabits(USER_ID, { category_id: "cat-123" });

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["category_id", "cat-123"],
      });
    });

    it("does NOT apply status filter when filters object is empty", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserHabits(USER_ID, {});

      // Only the user_id eq should exist; no status / category_id eq calls.
      const eqCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq",
      );
      expect(eqCalls).toHaveLength(1);
      expect(eqCalls[0].args).toEqual(["user_id", USER_ID]);
    });

    it("applies both status and category_id filters together", async () => {
      mockSupabaseClient.setMockResponse([]);

      await db.getUserHabits(USER_ID, {
        status: "active",
        category_id: "cat-xyz",
      });

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["status", "active"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["category_id", "cat-xyz"],
      });
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("connection refused"));

      await expect(db.getUserHabits(USER_ID)).rejects.toThrow(
        "connection refused",
      );
    });
  });

  // ─── getActiveHabits ──────────────────────────────────────────────────────
  describe("getActiveHabits", () => {
    it("delegates to getUserHabits with status='active' filter", async () => {
      mockSupabaseClient.setMockResponse([makeHabit()]);

      await db.getActiveHabits(USER_ID);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["status", "active"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("returns the rows from getUserHabits", async () => {
      const rows = [makeHabit({ status: "active" })];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getActiveHabits(USER_ID);

      expect(result).toEqual(rows);
    });
  });

  // ─── getHabit ─────────────────────────────────────────────────────────────
  describe("getHabit", () => {
    it("fetches a single habit with the full chain", async () => {
      const habit = makeHabit();
      mockSupabaseClient.setMockResponse(habit);

      const result = await db.getHabit(HABIT_ID, USER_ID);

      expect(result).toEqual(habit);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "from",
        args: ["habits"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["id", HABIT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "single",
        args: [],
      });
    });

    it("returns null when error.code === 'PGRST116' (row not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getHabit(HABIT_ID, USER_ID);

      expect(result).toBeNull();
    });

    it("throws on other error codes", async () => {
      const err = { code: "22P02", message: "invalid uuid" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(db.getHabit(HABIT_ID, USER_ID)).rejects.toEqual(err);
    });

    it("throws when error has no code (generic Error)", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("boom"));

      await expect(db.getHabit(HABIT_ID, USER_ID)).rejects.toThrow("boom");
    });
  });

  // ─── createHabit ──────────────────────────────────────────────────────────
  describe("createHabit", () => {
    const insertRow: HabitInsert = {
      user_id: USER_ID,
      name: "Read Books",
      description: "Read for 30 minutes",
      category_id: null,
      frequency: { type: "daily" },
      status: "active",
    };

    it("inserts the row and returns the created habit via full chain", async () => {
      const created = makeHabit({ name: "Read Books" });
      mockSupabaseClient.setMockResponse(created);

      const result = await db.createHabit(insertRow);

      expect(result).toEqual(created);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "from",
        args: ["habits"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "insert",
        args: [insertRow],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "single",
        args: [],
      });
    });

    it("throws on insert error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("insert failed"));

      await expect(db.createHabit(insertRow)).rejects.toThrow("insert failed");
    });
  });

  // ─── updateHabit ──────────────────────────────────────────────────────────
  describe("updateHabit", () => {
    it("updates and returns the habit via the full chain", async () => {
      const updates = { name: "Evening Run" };
      const updated = makeHabit({ name: "Evening Run" });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateHabit(HABIT_ID, USER_ID, updates);

      expect(result).toEqual(updated);

      // Full ordered log — SELECT/UPDATE share table/eq args so we must pin
      // the exact chain rather than rely on positional expectQuery.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "habits", method: "from", args: ["habits"] },
        { table: "habits", method: "update", args: [updates] },
        { table: "habits", method: "eq", args: ["id", HABIT_ID] },
        { table: "habits", method: "eq", args: ["user_id", USER_ID] },
        { table: "habits", method: "select", args: [] },
        { table: "habits", method: "single", args: [] },
      ]);
    });

    it("throws when the update errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("update failed"));

      await expect(
        db.updateHabit(HABIT_ID, USER_ID, { name: "x" }),
      ).rejects.toThrow("update failed");
    });
  });

  // ─── updateHabitStreak ────────────────────────────────────────────────────
  describe("updateHabitStreak", () => {
    it("calls updateHabit with exact current_streak and best_streak payload", async () => {
      const updated = makeHabit({ current_streak: 10, best_streak: 15 });
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateHabitStreak(HABIT_ID, USER_ID, 10, 15);

      expect(result).toEqual(updated);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "update",
        args: [{ current_streak: 10, best_streak: 15 }],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["id", HABIT_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("preserves parameter ORDER — first number → current_streak, second → best_streak", async () => {
      // Kills mutants that swap argument order.
      mockSupabaseClient.setMockResponse(makeHabit());

      await db.updateHabitStreak(HABIT_ID, USER_ID, 7, 99);

      const updateCall = mockSupabaseClient.queryLog.find(
        (e) => e.method === "update",
      );
      expect(updateCall?.args[0]).toEqual({
        current_streak: 7,
        best_streak: 99,
      });
    });
  });

  // ─── deleteHabit ──────────────────────────────────────────────────────────
  // ─── dismissGraduationNudge ───────────────────────────────────────────────
  describe("dismissGraduationNudge", () => {
    it("stamps nudge_dismissed_at with exact frozen timestamp", async () => {
      const fixedNow = new Date("2026-04-15T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        const updated = makeHabit({
          nudge_dismissed_at: fixedNow.toISOString(),
        });
        mockSupabaseClient.setMockResponse(updated);

        const result = await db.dismissGraduationNudge(HABIT_ID, USER_ID);

        expect(result).toEqual(updated);

        mockSupabaseClient.expectQuery({
          table: "habits",
          method: "update",
          args: [{ nudge_dismissed_at: fixedNow.toISOString() }],
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── getHabitsWithTodayStatus ─────────────────────────────────────────────
  describe("getHabitsWithTodayStatus", () => {
    // Three awaited queries in order:
    //  1. getUserHabits → habits list
    //  2. today's completed logs
    //  3. 90-day window logs

    it("fetches ALL habits (no status filter) and returns per-habit today status", async () => {
      const active = makeHabit({ id: "h-active", status: "active" });
      const paused = makeHabit({ id: "h-paused", status: "paused" });
      const formed = makeHabit({ id: "h-formed", status: "formed" });

      queueThenResponses([
        { data: [active, paused, formed], error: null }, // getUserHabits
        { data: [{ habit_id: "h-active", completed: true }], error: null }, // today's logs
        { data: [], error: null }, // 90-day window
      ]);

      const result = await db.getHabitsWithTodayStatus(
        USER_ID,
        "2026-04-15",
      );

      expect(result).toHaveLength(3);

      // Only h-active is completed today
      const byId = Object.fromEntries(result.map((h) => [h.id, h]));
      expect(byId["h-active"].completed_today).toBe(true);
      expect(byId["h-paused"].completed_today).toBe(false);
      expect(byId["h-formed"].completed_today).toBe(false);

      // Confirm no status-filter on the habits SELECT (would leak paused/formed).
      const statusFilterCalls = mockSupabaseClient.queryLog.filter(
        (e) =>
          e.method === "eq" &&
          e.args[0] === "status" &&
          e.args[1] === "active",
      );
      expect(statusFilterCalls).toHaveLength(0);
    });

    it("issues habit_logs SELECT with exact filters for TODAY query", async () => {
      queueThenResponses([
        { data: [], error: null }, // getUserHabits
        { data: [], error: null }, // today's logs
        { data: [], error: null }, // 90-day window
      ]);

      await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");

      // Today-logs chain: from('habit_logs').select('habit_id, completed')
      //  .eq('user_id', userId).eq('logged_date', today).eq('completed', true)
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "select",
        args: ["habit_id, completed"],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "eq",
        args: ["logged_date", "2026-04-15"],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "eq",
        args: ["completed", true],
      });
    });

    it("issues habit_logs SELECT for 90-DAY window with gte+lte bounds (pad zero, single-digit day)", async () => {
      // Pick a today whose 90-day-earlier date has BOTH a single-digit month
      // AND a single-digit day, so that padStart(2, '0') mutations to
      // padStart(2, '') produce a different string and are killed.
      //
      // today = 2026-04-09 → 90 days earlier (local) = 2026-01-09.
      queueThenResponses([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      const today = new Date(2026, 3, 9); // Apr 9, 2026
      const windowStartDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 90,
      );
      const yy = windowStartDate.getFullYear();
      const mm = String(windowStartDate.getMonth() + 1).padStart(2, "0");
      const dd = String(windowStartDate.getDate()).padStart(2, "0");
      const expectedStart = `${yy}-${mm}-${dd}`;
      // Sanity check: both month and day parts are zero-padded.
      expect(expectedStart).toBe("2026-01-09");

      await db.getHabitsWithTodayStatus(USER_ID, "2026-04-09");

      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "select",
        args: ["habit_id, logged_date, completed"],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "gte",
        args: ["logged_date", expectedStart],
      });
      mockSupabaseClient.expectQuery({
        table: "habit_logs",
        method: "lte",
        args: ["logged_date", "2026-04-09"],
      });
    });

    it("issues the full ordered query log across getUserHabits + today-logs + 90-day phases", async () => {
      // Uses toEqual on the whole queryLog to lock down args for every
      // .eq/.from/.select/.order in ALL three phases. Catches mutations to
      // duplicated args like `.eq('user_id', userId)` that expectQuery
      // would otherwise find elsewhere in the log.
      queueThenResponses([
        { data: [], error: null }, // getUserHabits
        { data: [], error: null }, // today-logs
        { data: [], error: null }, // 90-day window
      ]);

      await db.getHabitsWithTodayStatus(USER_ID, "2026-04-09");

      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: getUserHabits → habits
        { table: "habits", method: "from", args: ["habits"] },
        { table: "habits", method: "select", args: ["*"] },
        { table: "habits", method: "eq", args: ["user_id", USER_ID] },
        {
          table: "habits",
          method: "order",
          args: ["created_at", { ascending: false }],
        },
        // Phase 2: today's completed logs
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        {
          table: "habit_logs",
          method: "select",
          args: ["habit_id, completed"],
        },
        {
          table: "habit_logs",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "habit_logs",
          method: "eq",
          args: ["logged_date", "2026-04-09"],
        },
        {
          table: "habit_logs",
          method: "eq",
          args: ["completed", true],
        },
        // Phase 3: 90-day window
        { table: "habit_logs", method: "from", args: ["habit_logs"] },
        {
          table: "habit_logs",
          method: "select",
          args: ["habit_id, logged_date, completed"],
        },
        {
          table: "habit_logs",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "habit_logs",
          method: "gte",
          args: ["logged_date", "2026-01-09"],
        },
        {
          table: "habit_logs",
          method: "lte",
          args: ["logged_date", "2026-04-09"],
        },
        {
          table: "habit_logs",
          method: "eq",
          args: ["completed", true],
        },
      ]);
    });

    it("defaults `date` arg to getLocalDateString() when none provided", async () => {
      // Freeze time so getLocalDateString is deterministic.
      const fixedNow = new Date(2026, 3, 10, 9, 0, 0); // local Apr 10, 2026 09:00
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      try {
        queueThenResponses([
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]);

        await db.getHabitsWithTodayStatus(USER_ID);

        mockSupabaseClient.expectQuery({
          table: "habit_logs",
          method: "eq",
          args: ["logged_date", "2026-04-10"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("computes monthly_completion_rate correctly for a daily habit", async () => {
      // Habit started Jan 1, today is Apr 15.
      // month-start = 2026-04-01, so daily scheduled days up to Apr 15 = 15.
      // We'll feed 12 completed days within the month → rate = round(12/15 * 100) = 80.
      const habit = makeHabit({
        id: "h1",
        status: "active",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });

      const daysThisMonth = Array.from({ length: 12 }, (_, i) => ({
        habit_id: "h1",
        logged_date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        completed: true,
      }));

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: daysThisMonth, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");

      expect(result).toHaveLength(1);
      expect(result[0].monthly_completion_rate).toBe(80);
    });

    it("caps monthly_completion_rate at 100 (never exceeds)", async () => {
      // Daily habit; today Apr 5 → scheduled = 5 days.
      // Feed 10 completed rows within the month (absurd but possible with dupes)
      // → ratio 2.0, capped at 100.
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });
      const windowLogs = Array.from({ length: 10 }, (_, i) => ({
        habit_id: "h1",
        logged_date: `2026-04-0${(i % 5) + 1}`, // dupes within month
        completed: true,
      }));

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-05");

      expect(result[0].monthly_completion_rate).toBe(100);
    });

    it("returns monthly_completion_rate = 0 when scheduled days is 0", async () => {
      // Custom habit scheduled only on Sunday (day 0). Today is Apr 1, 2026
      // which is a Wednesday — no Sundays in [Apr 1, Apr 1] so scheduled = 0.
      // Source: `scheduled > 0 ? Math.round(...) : 0`.
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "custom", days: [0] },
        created_at: "2026-01-01T00:00:00Z",
      });

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-01");
      expect(result[0].monthly_completion_rate).toBe(0);
    });

    it("weekly frequency: scheduled = weeks (count defaults to 1)", async () => {
      // Type 'weekly' — in source: targetPerWeek = 1 (not frequency.count).
      // today Apr 15, 2026; same Monday count as times_per_week test = 2.
      // With 1 completed → rate = round(1/2*100) = 50.
      //
      // Kills the ConditionalExpression mutant at line 318:
      //   `... || frequency.type === 'weekly'` → `... || false`
      // because with that mutant, weekly falls through to the shouldTrackOnDate
      // branch which counts every day (Apr 1..Apr 15 = 15 days),
      // yielding rate = round(1/15*100) = 7, not 50.
      //
      // Also kills line 319's ternary mutant `true ? count : 1` — with that
      // mutant, frequency.count is undefined → weeks * undefined = NaN →
      // rate becomes NaN, not 50.
      const habit = makeHabit({
        id: "h-weekly",
        frequency: { type: "weekly" },
        created_at: "2026-01-01T00:00:00Z",
      });
      const windowLogs = [
        { habit_id: "h-weekly", logged_date: "2026-04-10", completed: true },
      ];

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");
      expect(result[0].monthly_completion_rate).toBe(50);
    });

    it("weekdays frequency: scheduled counts only Mon–Fri (kills shouldTrackOnDate→true mutant)", async () => {
      // today 2026-04-05 (Sunday). Month-start Apr 1 (Wed). Weekdays in
      // Apr 1..Apr 5 = {Wed=1, Thu=2, Fri=3}. Sat(4) and Sun(5) excluded.
      // scheduled = 3. Feed 0 completions → rate = 0.
      // With mutant shouldTrackOnDate → true, scheduled = 5, still rate = 0.
      // So use a completion count that distinguishes: 3 completions (all
      // weekdays) → rate = round(3/3*100)=100 (real) vs round(3/5*100)=60 (mutant).
      const habit = makeHabit({
        id: "h-wd",
        frequency: { type: "weekdays" },
        created_at: "2026-01-01T00:00:00Z",
      });
      const windowLogs = [
        { habit_id: "h-wd", logged_date: "2026-04-01", completed: true },
        { habit_id: "h-wd", logged_date: "2026-04-02", completed: true },
        { habit_id: "h-wd", logged_date: "2026-04-03", completed: true },
      ];

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-05");
      expect(result[0].monthly_completion_rate).toBe(100);
    });

    it("times_per_week when today IS a Monday: last-day Monday counts toward weeks", async () => {
      // today = 2026-04-06 (Monday). Month-start Apr 1 (Wed).
      // With `while (cursor <= end)`: Mondays in [Apr 1..Apr 6] = {Apr 6} → 1 week.
      // With mutant `while (cursor < end)`: cursor stops BEFORE Apr 6,
      // missing the Monday → weeks = 0, Math.max(0, 1) = 1, same.
      //
      // To kill the `<= vs <` mutant we need TWO Mondays where the last is
      // the end day: use today = 2026-04-13 (Monday). Mondays in [Apr 1, Apr 13]
      // = {Apr 6, Apr 13} → 2 weeks (real). Mutant stops before Apr 13 →
      // {Apr 6} → 1 week. With count=3, scheduled = 6 (real) vs 3 (mutant).
      // Feed 3 completions → rate = round(3/6*100)=50 vs round(3/3*100)=100.
      const habit = makeHabit({
        id: "h-tpw",
        frequency: { type: "times_per_week", count: 3 },
        created_at: "2026-01-01T00:00:00Z",
      });
      const windowLogs = [
        { habit_id: "h-tpw", logged_date: "2026-04-02", completed: true },
        { habit_id: "h-tpw", logged_date: "2026-04-07", completed: true },
        { habit_id: "h-tpw", logged_date: "2026-04-10", completed: true },
      ];

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-13");
      expect(result[0].monthly_completion_rate).toBe(50);
    });

    it("times_per_week: scheduled = weeks * count", async () => {
      // times_per_week with count=3; today Apr 15, 2026 (Wednesday).
      // Month starts Apr 1 (Wednesday). In source: count Mondays from
      // Apr 1..Apr 15 → Apr 6, Apr 13 = 2 weeks. scheduled = 2 * 3 = 6.
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "times_per_week", count: 3 },
        created_at: "2026-01-01T00:00:00Z",
      });
      // Feed 3 completed days within month → rate = round(3/6 * 100) = 50
      const windowLogs = [
        { habit_id: "h1", logged_date: "2026-04-02", completed: true },
        { habit_id: "h1", logged_date: "2026-04-07", completed: true },
        { habit_id: "h1", logged_date: "2026-04-10", completed: true },
      ];

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");
      expect(result[0].monthly_completion_rate).toBe(50);
    });

    it("only counts logs >= monthStart toward monthly_completion_rate", async () => {
      // today 2026-04-15 → monthStart 2026-04-01. A log from March must be
      // ignored (catches mutants that flip the >= check).
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });
      const windowLogs = [
        { habit_id: "h1", logged_date: "2026-03-31", completed: true }, // ignore
        { habit_id: "h1", logged_date: "2026-04-01", completed: true }, // count
        { habit_id: "h1", logged_date: "2026-04-02", completed: true }, // count
        { habit_id: "h1", logged_date: "2026-04-15", completed: true }, // count
      ];

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");

      // scheduled = 15 days, completed = 3 (March excluded) → round(3/15*100)=20
      expect(result[0].monthly_completion_rate).toBe(20);
    });

    it("throws when today-logs query errors", async () => {
      queueThenResponses([
        { data: [], error: null }, // getUserHabits
        { data: null, error: new Error("logs select failed") }, // today's logs
      ]);

      await expect(
        db.getHabitsWithTodayStatus(USER_ID, "2026-04-15"),
      ).rejects.toThrow("logs select failed");
    });

    it("handles null data (no error) from today-logs query — completed_today defaults to false", async () => {
      // Exercises the `(logs || []).map(...)` branch when logs is null.
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });

      queueThenResponses([
        { data: [habit], error: null }, // getUserHabits
        { data: null, error: null }, // today-logs: success but null data
        { data: [], error: null }, // 90-day window
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");

      expect(result).toHaveLength(1);
      expect(result[0].completed_today).toBe(false);
    });

    it("handles null data (no error) from 90-day window — windowLogs defaults to []", async () => {
      // Exercises `windowLogs = data ?? []` branch when data is null.
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: null, error: null }, // 90-day window: success but null data
      ]);

      const acquisition = await db.getHabitsWithTodayStatusAcquisition(
        USER_ID,
        "2026-04-15",
      );

      expect(acquisition.status).toBe("complete");
      expect(acquisition.habits).toHaveLength(1);
      expect(acquisition.habits[0].monthly_completion_rate).toBe(0);
      expect(acquisition.habits[0].graduation_eligible).toBe(false);
      // No warn fired: data was null but no error.
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("falls back to empty logs + logs warning when 90-day window query errors", async () => {
      const habit = makeHabit({
        id: "h1",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });

      queueThenResponses([
        { data: [habit], error: null }, // getUserHabits
        { data: [], error: null }, // today's logs
        { data: null, error: new Error("window query failed") }, // 90-day (caught)
      ]);

      const acquisition = await db.getHabitsWithTodayStatusAcquisition(
        USER_ID,
        "2026-04-15",
      );

      // Habits still render; rate falls back to 0 because windowLogs = [].
      expect(acquisition.status).toBe("degraded");
      expect(acquisition.habits).toHaveLength(1);
      expect(acquisition.habits[0].monthly_completion_rate).toBe(0);
      // graduation_eligible is false because logs = [].
      expect(acquisition.habits[0].graduation_eligible).toBe(false);

      expect(log.warn).toHaveBeenCalledWith(
        "[habits] 90-day logs query failed; monthly rate + nudges will be empty",
        { userId: USER_ID, error: expect.stringContaining("window query failed") },
      );
    });

    it("sets graduation_eligible=true for an eligible active habit with 80%+ completion", async () => {
      // Daily habit, 21 days old, logs show completion every day.
      const habit = makeHabit({
        id: "h-grad",
        status: "active",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z", // well over 21 days
      });

      // Provide 21 consecutive completed logs in the 21-day window prior to today
      const today = "2026-04-15";
      const windowLogs: Array<{
        habit_id: string;
        logged_date: string;
        completed: boolean;
      }> = [];
      for (let i = 20; i >= 0; i--) {
        const d = new Date(2026, 3, 15 - i);
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        windowLogs.push({
          habit_id: "h-grad",
          logged_date: `${yy}-${mm}-${dd}`,
          completed: true,
        });
      }

      queueThenResponses([
        { data: [habit], error: null },
        { data: [], error: null },
        { data: windowLogs, error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, today);
      expect(result[0].graduation_eligible).toBe(true);
    });

    it("sets graduation_eligible=false for formed habits regardless of logs", async () => {
      const formed = makeHabit({
        id: "h-formed",
        status: "formed",
        frequency: { type: "daily" },
        created_at: "2026-01-01T00:00:00Z",
      });

      queueThenResponses([
        { data: [formed], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      const result = await db.getHabitsWithTodayStatus(USER_ID, "2026-04-15");
      expect(result[0].graduation_eligible).toBe(false);
    });
  });

  // ─── getActiveHabitCount ──────────────────────────────────────────────────
  describe("getActiveHabitCount", () => {
    it("returns count filtered by user_id + status IN (active, paused)", async () => {
      mockSupabaseClient.setMockResponse(null, null, 7);

      const result = await db.getActiveHabitCount(USER_ID);

      expect(result).toBe(7);

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "from",
        args: ["habits"],
      });
      // IMPORTANT: { count: 'exact', head: true } — catches mutants that
      // drop either option.
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "select",
        args: ["*", { count: "exact", head: true }],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "in",
        args: ["status", ["active", "paused"]],
      });
    });

    it("returns 0 when count is null", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const result = await db.getActiveHabitCount(USER_ID);

      expect(result).toBe(0);
    });

    it("throws when the query errors", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("count failed"));

      await expect(db.getActiveHabitCount(USER_ID)).rejects.toThrow(
        "count failed",
      );
    });
  });

  // ─── getHabitCountsByStatus ───────────────────────────────────────────────
  describe("getHabitCountsByStatus", () => {
    it("returns zeros for all three statuses when no habits exist", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await db.getHabitCountsByStatus(USER_ID);

      expect(result).toEqual({ active: 0, paused: 0, formed: 0 });

      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "select",
        args: ["status"],
      });
      mockSupabaseClient.expectQuery({
        table: "habits",
        method: "eq",
        args: ["user_id", USER_ID],
      });
    });

    it("aggregates exact counts per status", async () => {
      mockSupabaseClient.setMockResponse([
        { status: "active" },
        { status: "active" },
        { status: "active" },
        { status: "paused" },
        { status: "formed" },
        { status: "formed" },
      ]);

      const result = await db.getHabitCountsByStatus(USER_ID);

      expect(result).toEqual({ active: 3, paused: 1, formed: 2 });
    });

    it("initializes an unknown status bucket if seen in data", async () => {
      // The source does `counts[status] = (counts[status] || 0) + 1`, so
      // unknown statuses should be tallied from 0.
      mockSupabaseClient.setMockResponse([{ status: "archived" }]);

      const result = await db.getHabitCountsByStatus(USER_ID);

      expect(result).toEqual({
        active: 0,
        paused: 0,
        formed: 0,
        archived: 1,
      });
    });

    it("handles null data gracefully (no crash)", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getHabitCountsByStatus(USER_ID);

      expect(result).toEqual({ active: 0, paused: 0, formed: 0 });
    });

    it("throws on query error", async () => {
      mockSupabaseClient.setMockResponse(null, new Error("select failed"));

      await expect(db.getHabitCountsByStatus(USER_ID)).rejects.toThrow(
        "select failed",
      );
    });
  });
});
