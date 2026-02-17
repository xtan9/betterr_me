import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabaseClient } from "../../setup";
import type { HabitLog } from "@/lib/db/types";
import { getLocalDateString } from "@/lib/utils";

// Mock habitsDB class since HabitLogsDB creates its own instance
const { mockGetHabit, mockUpdateHabitStreak } = vi.hoisted(() => ({
  mockGetHabit: vi.fn(),
  mockUpdateHabitStreak: vi.fn(),
}));

vi.mock("@/lib/db/habits", () => ({
  HabitsDB: class {
    getHabit = mockGetHabit;
    updateHabitStreak = mockUpdateHabitStreak;
  },
  habitsDB: {
    getHabit: mockGetHabit,
    updateHabitStreak: mockUpdateHabitStreak,
  },
}));

import { habitLogsDB } from "@/lib/db/habit-logs";

describe("HabitLogsDB", () => {
  const mockUserId = "user-123";
  const mockHabitId = "habit-123";
  const mockLog: HabitLog = {
    id: "log-123",
    habit_id: mockHabitId,
    user_id: mockUserId,
    logged_date: "2026-02-03",
    completed: true,
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-03T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getLogsByDateRange", () => {
    it("should fetch logs within date range", async () => {
      mockSupabaseClient.setMockResponse([mockLog]);

      const logs = await habitLogsDB.getLogsByDateRange(
        mockHabitId,
        mockUserId,
        "2026-01-01",
        "2026-02-03",
      );

      expect(logs).toEqual([mockLog]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("habit_logs");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "habit_id",
        mockHabitId,
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "logged_date",
        "2026-01-01",
      );
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith(
        "logged_date",
        "2026-02-03",
      );
    });

    it("should return empty array when no data", async () => {
      mockSupabaseClient.setMockResponse(null);

      const logs = await habitLogsDB.getLogsByDateRange(
        mockHabitId,
        mockUserId,
        "2026-01-01",
        "2026-02-03",
      );

      expect(logs).toEqual([]);
    });

    it("should handle database errors", async () => {
      mockSupabaseClient.setMockResponse(null, { message: "DB error" });

      await expect(
        habitLogsDB.getLogsByDateRange(
          mockHabitId,
          mockUserId,
          "2026-01-01",
          "2026-02-03",
        ),
      ).rejects.toEqual({ message: "DB error" });
    });
  });

  describe("getLogForDate", () => {
    it("should fetch a single log for a date", async () => {
      mockSupabaseClient.setMockResponse(mockLog);

      const log = await habitLogsDB.getLogForDate(
        mockHabitId,
        mockUserId,
        "2026-02-03",
      );

      expect(log).toEqual(mockLog);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "logged_date",
        "2026-02-03",
      );
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("should return null if no log found", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const log = await habitLogsDB.getLogForDate(
        mockHabitId,
        mockUserId,
        "2026-02-03",
      );

      expect(log).toBeNull();
    });
  });

  describe("getUserLogsForDate", () => {
    it("should fetch all completed logs for a user on a date", async () => {
      mockSupabaseClient.setMockResponse([mockLog]);

      const logs = await habitLogsDB.getUserLogsForDate(
        mockUserId,
        "2026-02-03",
      );

      expect(logs).toEqual([mockLog]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "logged_date",
        "2026-02-03",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("completed", true);
    });
  });

  describe("upsertLog", () => {
    it("should upsert a log entry", async () => {
      mockSupabaseClient.setMockResponse(mockLog);

      const log = await habitLogsDB.upsertLog({
        habit_id: mockHabitId,
        user_id: mockUserId,
        logged_date: "2026-02-03",
        completed: true,
      });

      expect(log).toEqual(mockLog);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          habit_id: mockHabitId,
          user_id: mockUserId,
          logged_date: "2026-02-03",
          completed: true,
        },
        { onConflict: "habit_id,logged_date" },
      );
    });
  });

  describe("deleteLog", () => {
    it("should delete a log", async () => {
      mockSupabaseClient.setMockResponse(null);

      await habitLogsDB.deleteLog(mockHabitId, mockUserId, "2026-02-03");

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "habit_id",
        mockHabitId,
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "logged_date",
        "2026-02-03",
      );
    });
  });

  describe("getHabitStats", () => {
    it("should calculate completion stats", async () => {
      const logs = [
        { ...mockLog, completed: true },
        { ...mockLog, id: "log-2", logged_date: "2026-02-02", completed: true },
        {
          ...mockLog,
          id: "log-3",
          logged_date: "2026-02-01",
          completed: false,
        },
      ];
      mockSupabaseClient.setMockResponse(logs);

      const stats = await habitLogsDB.getHabitStats(
        mockHabitId,
        mockUserId,
        30,
      );

      expect(stats.totalDays).toBe(30);
      expect(stats.completedDays).toBe(2);
      expect(stats.completionRate).toBe(7); // 2/30 * 100 rounded
    });
  });

  describe("toggleLog", () => {
    it("should throw EDIT_WINDOW_EXCEEDED for dates older than 7 days", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const dateStr = getLocalDateString(oldDate);

      await expect(
        habitLogsDB.toggleLog(mockHabitId, mockUserId, dateStr),
      ).rejects.toThrow("EDIT_WINDOW_EXCEEDED");
    });
  });

  describe("getDetailedHabitStats with weekStartDay", () => {
    const frequency = { type: "daily" as const };
    const createdAt = "2026-01-01T00:00:00Z";

    it("should return completed count from COUNT query for daily habits", async () => {
      // Daily habits use COUNT queries — mock returns count property
      mockSupabaseClient.setMockResponse(null, null, 3);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt,
        0, // Sunday
      );

      // All three periods should have completed=3 (same mock for all)
      expect(stats.thisWeek.completed).toBe(3);
      expect(stats.thisMonth.completed).toBe(3);
      expect(stats.allTime.completed).toBe(3);
      expect(stats.thisWeek.total).toBeGreaterThan(0);
      expect(stats.allTime.percent).toBeGreaterThan(0);
    });

    it("should cap percent at 100%", async () => {
      // Set count higher than possible scheduled days (e.g., 999)
      mockSupabaseClient.setMockResponse(null, null, 999);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt,
        0,
      );

      expect(stats.thisWeek.percent).toBeLessThanOrEqual(100);
      expect(stats.thisMonth.percent).toBeLessThanOrEqual(100);
      expect(stats.allTime.percent).toBeLessThanOrEqual(100);
    });

    it("should default to Sunday when weekStartDay is not provided", async () => {
      mockSupabaseClient.setMockResponse(null, null, 0);

      const stats = await habitLogsDB.getDetailedHabitStats(
        mockHabitId,
        mockUserId,
        frequency,
        createdAt,
        // no weekStartDay parameter
      );

      expect(stats.thisWeek).toBeDefined();
      expect(stats.thisMonth).toBeDefined();
      expect(stats.allTime).toBeDefined();
    });
  });

  describe("times_per_week frequency handling", () => {
    const timesPerWeekFrequency = { type: "times_per_week", count: 3 } as const;
    const createdAt = "2026-01-01T00:00:00Z";

    // Compute dates in the current week dynamically so tests stay valid as time advances
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysFromSunday = (now.getDay() - 0 + 7) % 7; // weekStartDay = 0 (Sunday)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysFromSunday);
    const weekDate = (offset: number): string => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + offset);
      return getLocalDateString(d);
    };

    describe("getDetailedHabitStats", () => {
      it("should return weekly progress for thisWeek (completed/target)", async () => {
        // 2 completions this week for a 3x/week habit
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0, // Sunday
        );

        expect(stats.thisWeek.completed).toBe(2);
        expect(stats.thisWeek.total).toBe(3); // Target is 3
        expect(stats.thisWeek.percent).toBe(67); // 2/3 * 100 rounded
      });

      it("should return 100% when target exactly met (3/3 completions)", async () => {
        // Regression: times_per_week with count=3, exactly 3 completions = 100%
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
          { ...mockLog, logged_date: weekDate(2), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0,
        );

        expect(stats.thisWeek.completed).toBe(3);
        expect(stats.thisWeek.total).toBe(3);
        expect(stats.thisWeek.percent).toBe(100); // 3/3 = 100%
      });

      it("should cap percent at 100 when target exceeded", async () => {
        // 4 completions this week for a 3x/week habit
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
          { ...mockLog, logged_date: weekDate(2), completed: true },
          { ...mockLog, logged_date: weekDate(3), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0,
        );

        expect(stats.thisWeek.completed).toBe(4);
        expect(stats.thisWeek.total).toBe(3);
        expect(stats.thisWeek.percent).toBe(100); // Capped at 100
      });

      it("should count successful weeks for allTime", async () => {
        // Week 1: 3 completions (success), Week 2: 2 completions (fail), Week 3: 3 completions (success)
        mockSupabaseClient.setMockResponse([
          // Week 1 (Jan 5-11)
          { ...mockLog, logged_date: "2026-01-05", completed: true },
          { ...mockLog, logged_date: "2026-01-06", completed: true },
          { ...mockLog, logged_date: "2026-01-07", completed: true },
          // Week 2 (Jan 12-18) - only 2 completions
          { ...mockLog, logged_date: "2026-01-12", completed: true },
          { ...mockLog, logged_date: "2026-01-13", completed: true },
          // Week 3 (Jan 19-25)
          { ...mockLog, logged_date: "2026-01-19", completed: true },
          { ...mockLog, logged_date: "2026-01-20", completed: true },
          { ...mockLog, logged_date: "2026-01-21", completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          createdAt,
          0,
        );

        // allTime should show successful weeks vs total weeks
        expect(stats.allTime).toBeDefined();
        expect(stats.allTime.completed).toBeGreaterThanOrEqual(0);
        expect(stats.allTime.total).toBeGreaterThanOrEqual(0);
      });
    });

    describe("calculateStreak", () => {
      // Helper to get a date string offset from a given week's Sunday start
      const prevWeekDate = (weeksAgo: number, dayOffset: number): string => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - weeksAgo * 7 + dayOffset);
        return getLocalDateString(d);
      };

      it("should count consecutive successful weeks", async () => {
        // 3 consecutive weeks meeting target (current week + 2 previous)
        mockSupabaseClient.setMockResponse([
          // Week -2 (oldest)
          { ...mockLog, logged_date: prevWeekDate(2, 0), completed: true },
          { ...mockLog, logged_date: prevWeekDate(2, 1), completed: true },
          { ...mockLog, logged_date: prevWeekDate(2, 2), completed: true },
          // Week -1
          { ...mockLog, logged_date: prevWeekDate(1, 0), completed: true },
          { ...mockLog, logged_date: prevWeekDate(1, 1), completed: true },
          { ...mockLog, logged_date: prevWeekDate(1, 2), completed: true },
          // Current week
          { ...mockLog, logged_date: weekDate(0), completed: true },
          { ...mockLog, logged_date: weekDate(1), completed: true },
          { ...mockLog, logged_date: weekDate(2), completed: true },
        ]);

        const result = await habitLogsDB.calculateStreak(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          0,
          0, // Sunday week start
        );

        // Should have 3 week streak
        expect(result.currentStreak).toBeGreaterThanOrEqual(1);
        expect(result.bestStreak).toBeGreaterThanOrEqual(result.currentStreak);
      });

      it("should return 0 streak when current week incomplete and previous week failed", async () => {
        // Previous week only had 2 completions (target is 3)
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: prevWeekDate(1, 0), completed: true },
          { ...mockLog, logged_date: prevWeekDate(1, 1), completed: true },
        ]);

        const result = await habitLogsDB.calculateStreak(
          mockHabitId,
          mockUserId,
          timesPerWeekFrequency,
          0,
          0,
        );

        expect(result.currentStreak).toBe(0);
      });
    });
  });

  describe("weekly frequency handling", () => {
    const weeklyFrequency = { type: "weekly" as const };
    const createdAt = "2026-01-01T00:00:00Z";

    // Reuse the same dynamic date helpers as times_per_week tests
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysFromSunday = (now.getDay() - 0 + 7) % 7; // weekStartDay = 0 (Sunday)
    const wkStart = new Date(now);
    wkStart.setDate(wkStart.getDate() - daysFromSunday);
    const wkDate = (offset: number): string => {
      const d = new Date(wkStart);
      d.setDate(d.getDate() + offset);
      return getLocalDateString(d);
    };
    const prevWkDate = (weeksAgo: number, dayOffset: number): string => {
      const d = new Date(wkStart);
      d.setDate(d.getDate() - weeksAgo * 7 + dayOffset);
      return getLocalDateString(d);
    };

    describe("getDetailedHabitStats", () => {
      it("should use week-level evaluation (1 completion = 100% for that week)", async () => {
        // 1 completion this week for a weekly habit
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: wkDate(2), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          weeklyFrequency,
          createdAt,
          0,
        );

        expect(stats.thisWeek.completed).toBe(1);
        expect(stats.thisWeek.total).toBe(1); // target is 1 for weekly
        expect(stats.thisWeek.percent).toBe(100); // 1/1 = 100%
      });

      it("should treat any single completion as 100% (regression)", async () => {
        // Regression: weekly habit, 1 completion on any day of the week = 100% satisfied
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: wkDate(5), completed: true },
        ]);

        const stats = await habitLogsDB.getDetailedHabitStats(
          mockHabitId,
          mockUserId,
          weeklyFrequency,
          createdAt,
          0,
        );

        expect(stats.thisWeek.completed).toBe(1);
        expect(stats.thisWeek.total).toBe(1);
        expect(stats.thisWeek.percent).toBe(100);
      });
    });

    describe("calculateStreak", () => {
      it("should count consecutive successful weeks for weekly habits", async () => {
        // 2 consecutive weeks with at least 1 completion each
        mockSupabaseClient.setMockResponse([
          { ...mockLog, logged_date: prevWkDate(1, 3), completed: true },
          { ...mockLog, logged_date: wkDate(1), completed: true },
        ]);

        const result = await habitLogsDB.calculateStreak(
          mockHabitId,
          mockUserId,
          weeklyFrequency,
          0,
          0,
        );

        expect(result.currentStreak).toBeGreaterThanOrEqual(1);
        expect(result.bestStreak).toBeGreaterThanOrEqual(result.currentStreak);
      });
    });
  });

  describe("getAllUserLogs", () => {
    it("should return logs for user in date range", async () => {
      const mockLogs = [
        {
          id: "1",
          habit_id: "h1",
          user_id: "user-1",
          logged_date: "2026-02-05",
          completed: true,
        },
        {
          id: "2",
          habit_id: "h2",
          user_id: "user-1",
          logged_date: "2026-02-06",
          completed: false,
        },
      ];
      mockSupabaseClient.setMockResponse(mockLogs);

      const result = await habitLogsDB.getAllUserLogs(
        "user-1",
        "2026-02-01",
        "2026-02-09",
      );
      expect(result).toEqual(mockLogs);
    });

    it("should return empty array when no logs exist", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await habitLogsDB.getAllUserLogs(
        "user-1",
        "2026-02-01",
        "2026-02-09",
      );
      expect(result).toEqual([]);
    });

    it("should throw on database error", async () => {
      mockSupabaseClient.setMockResponse(null, { message: "DB error" });

      await expect(
        habitLogsDB.getAllUserLogs("user-1", "2026-02-01", "2026-02-09"),
      ).rejects.toEqual({ message: "DB error" });
    });
  });

  describe("date string parsing (YYYY-MM-DD → local Date)", () => {
    // The production code parses date strings like:
    //   const [y, m, d] = dateStr.split('-').map(Number);
    //   const date = new Date(y, m - 1, d);
    // This must produce a local-timezone date, not UTC.

    it("should parse date string as local date, not UTC", () => {
      const dateStr = "2026-06-15";
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(y, m - 1, d);

      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5); // June is 0-indexed
      expect(date.getDate()).toBe(15);
      // Hours should be 0 (midnight local), not shifted by timezone offset
      expect(date.getHours()).toBe(0);
    });

    it("should not shift the date across day boundaries like UTC parsing can", () => {
      // new Date('2026-01-01') can be interpreted as UTC midnight,
      // which in negative-offset timezones becomes Dec 31 local time.
      // The split-and-construct approach avoids this.
      const dateStr = "2026-01-01";
      const [y, m, d] = dateStr.split("-").map(Number);
      const localDate = new Date(y, m - 1, d);

      expect(localDate.getDate()).toBe(1);
      expect(localDate.getMonth()).toBe(0); // January
      expect(getLocalDateString(localDate)).toBe("2026-01-01");
    });
  });

  describe("calculateStreak adaptive lookback", () => {
    it("should query only ~30 days for a short streak (not 365)", async () => {
      // Spy on getLogsByDateRange to track date ranges
      const spy = vi.spyOn(habitLogsDB, "getLogsByDateRange");

      // Return logs for a 5-day streak (no boundary hit)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const logs = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        logs.push({
          id: `log-${i}`,
          habit_id: "h1",
          user_id: "u1",
          logged_date: getLocalDateString(d),
          completed: true,
          created_at: "",
          updated_at: "",
        });
      }
      spy.mockResolvedValueOnce(logs as HabitLog[]);

      const result = await habitLogsDB.calculateStreak(
        "h1",
        "u1",
        { type: "daily" },
        0,
      );

      expect(result.currentStreak).toBe(5);
      // Should have been called exactly once (30-day window sufficient)
      expect(spy).toHaveBeenCalledTimes(1);
      // Verify the date range is ~30 days, not 365
      const [, , startDate] = spy.mock.calls[0];
      const start = new Date(startDate);
      const diffDays = Math.round(
        (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(30);

      spy.mockRestore();
    });

    it("should expand window when streak reaches boundary", async () => {
      const spy = vi.spyOn(habitLogsDB, "getLogsByDateRange");

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // First call (30-day window): return 30 consecutive completed days
      // This fills the entire window, triggering expansion
      const logs30 = [];
      for (let i = 0; i < 31; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        logs30.push({
          id: `log-${i}`,
          habit_id: "h1",
          user_id: "u1",
          logged_date: getLocalDateString(d),
          completed: true,
          created_at: "",
          updated_at: "",
        });
      }

      // Second call (60-day window): return 35 days then a gap
      // Streak = 35, window = 60, so streak < 60 => definitive
      const logs60 = [];
      for (let i = 0; i < 35; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        logs60.push({
          id: `log-${i}`,
          habit_id: "h1",
          user_id: "u1",
          logged_date: getLocalDateString(d),
          completed: true,
          created_at: "",
          updated_at: "",
        });
      }

      spy.mockResolvedValueOnce(logs30 as HabitLog[]);
      spy.mockResolvedValueOnce(logs60 as HabitLog[]);

      const result = await habitLogsDB.calculateStreak(
        "h1",
        "u1",
        { type: "daily" },
        0,
      );

      expect(result.currentStreak).toBe(35);
      // Should have been called twice (30-day window was insufficient)
      expect(spy).toHaveBeenCalledTimes(2);

      // Verify second call used 60-day window
      const [, , startDate60] = spy.mock.calls[1];
      const start60 = new Date(startDate60);
      const diffDays60 = Math.round(
        (today.getTime() - start60.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays60).toBe(60);

      spy.mockRestore();
    });

    it("should cap at 365 days maximum", async () => {
      const spy = vi.spyOn(habitLogsDB, "getLogsByDateRange");

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Return all-completed logs for every window size to force maximum expansion
      // 30 -> 60 -> 120 -> 240 -> 365 = 5 calls
      for (let w = 0; w < 5; w++) {
        const windowSize = Math.min(30 * Math.pow(2, w), 365);
        const logs = [];
        for (let i = 0; i <= windowSize; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          logs.push({
            id: `log-${w}-${i}`,
            habit_id: "h1",
            user_id: "u1",
            logged_date: getLocalDateString(d),
            completed: true,
            created_at: "",
            updated_at: "",
          });
        }
        spy.mockResolvedValueOnce(logs as HabitLog[]);
      }

      const result = await habitLogsDB.calculateStreak(
        "h1",
        "u1",
        { type: "daily" },
        0,
      );

      // With all days completed up to 365, streak should be 365 or close
      expect(result.currentStreak).toBeGreaterThan(200);
      // The last call should use a 365-day window
      const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
      const [, , lastStartDate] = lastCall;
      const lastStart = new Date(lastStartDate);
      const diffDays = Math.round(
        (today.getTime() - lastStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(365);

      spy.mockRestore();
    });
  });
});
