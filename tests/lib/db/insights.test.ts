import { describe, it, expect, vi } from "vitest";
import { InsightsDB } from "@/lib/db/insights";
import { getLocalDateString } from "@/lib/utils";

// Helper to get the start of the week containing a date
function getWeekStart(date: Date, weekStartDay: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const currentDayOfWeek = result.getDay();
  const daysToSubtract = (currentDayOfWeek - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysToSubtract);
  return result;
}

// Helper to generate log entries for a range of dates
function generateLogs(
  habitId: string,
  startDate: Date,
  endDate: Date,
  completedDays?: number[], // day of week numbers to mark as completed
): Array<{ habit_id: string; logged_date: string; completed: boolean }> {
  const logs: Array<{
    habit_id: string;
    logged_date: string;
    completed: boolean;
  }> = [];
  const checkDate = new Date(startDate);
  while (checkDate <= endDate) {
    const dayOfWeek = checkDate.getDay();
    if (!completedDays || completedDays.includes(dayOfWeek)) {
      logs.push({
        habit_id: habitId,
        logged_date: getLocalDateString(checkDate),
        completed: true,
      });
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  return logs;
}

// Build a proper chain mock for Supabase queries
function createChainMock(resolveValue: { data: unknown; error: null }) {
  const chainProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "then") {
        // Make it thenable (Promise-like)
        return (resolve: (val: unknown) => void) => resolve(resolveValue);
      }
      // All other method calls return the proxy for chaining
      return () => chainProxy;
    },
  });
  return chainProxy;
}

function createErrorChainMock(errorValue: { message: string }) {
  const chainProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (val: unknown) => void) =>
          resolve({ data: null, error: errorValue });
      }
      return () => chainProxy;
    },
  });
  return chainProxy;
}

function createSupabaseClient(habits: unknown[], logs: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "habits") {
        return createChainMock({ data: habits, error: null });
      }
      if (table === "habit_logs") {
        return createChainMock({ data: logs, error: null });
      }
      return createChainMock({ data: null, error: null });
    }),
  } as any;
}

const WEEK_START_MONDAY = 1;

describe("InsightsDB", () => {
  describe("getWeeklyInsights", () => {
    it("returns empty array when user has no habits", async () => {
      const supabase = createSupabaseClient([], []);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);
      expect(insights).toEqual([]);
    });

    it("returns streak_proximity insight when habit is close to milestone", async () => {
      const habits = [
        {
          id: "h1",
          name: "Meditate",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 28, // 2 days from 30-day milestone
        },
      ];

      const supabase = createSupabaseClient(habits, []);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      expect(insights.length).toBeGreaterThanOrEqual(1);
      const streakInsight = insights.find((i) => i.type === "streak_proximity");
      expect(streakInsight).toBeDefined();
      expect(streakInsight!.priority).toBe(100);
      expect(streakInsight!.params.habit).toBe("Meditate");
      expect(streakInsight!.params.days).toBe(2);
      expect(streakInsight!.params.milestone).toBe(30);
    });

    it("does not return streak_proximity when streak is not near milestone", async () => {
      const habits = [
        {
          id: "h1",
          name: "Meditate",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 20, // Not near any milestone
        },
      ];

      const supabase = createSupabaseClient(habits, []);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const streakInsight = insights.find((i) => i.type === "streak_proximity");
      expect(streakInsight).toBeUndefined();
    });

    it("returns best_habit insight for high-performing habit", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const prevWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);

      const habits = [
        {
          id: "h1",
          name: "Exercise",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 3,
        },
      ];

      // Generate logs for all 7 days of previous week (100% completion)
      const logs = generateLogs("h1", prevWeekStart, prevWeekEnd);

      const supabase = createSupabaseClient(habits, logs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const bestHabit = insights.find((i) => i.type === "best_habit");
      expect(bestHabit).toBeDefined();
      expect(bestHabit!.priority).toBe(80);
      expect(bestHabit!.params.habit).toBe("Exercise");
      expect(bestHabit!.params.percent).toBe(100);
    });

    it("does not return best_habit when rate is below 80%", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const prevWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const habits = [
        {
          id: "h1",
          name: "Exercise",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 1,
        },
      ];

      // Only 3 of 7 days completed (~43%)
      const logs = [
        {
          habit_id: "h1",
          logged_date: getLocalDateString(prevWeekStart),
          completed: true,
        },
        {
          habit_id: "h1",
          logged_date: getLocalDateString(
            new Date(prevWeekStart.getTime() + 86400000),
          ),
          completed: true,
        },
        {
          habit_id: "h1",
          logged_date: getLocalDateString(
            new Date(prevWeekStart.getTime() + 2 * 86400000),
          ),
          completed: true,
        },
      ];

      const supabase = createSupabaseClient(habits, logs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const bestHabit = insights.find((i) => i.type === "best_habit");
      expect(bestHabit).toBeUndefined();
    });

    it("returns improvement insight when rate improves >10%", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const twoWeeksAgoStart = new Date(prevWeekStart);
      twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);
      const twoWeeksAgoEnd = new Date(prevWeekStart);
      twoWeeksAgoEnd.setDate(twoWeeksAgoEnd.getDate() - 1);

      const habits = [
        {
          id: "h1",
          name: "Read",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 3, // Not near any milestone
        },
      ];

      // Previous week: 5/7 days (~71%) — below 80%, so best_habit/best_week won't fire
      const prevWeekLogs = generateLogs("h1", prevWeekStart, prevWeekEnd).slice(
        0,
        5,
      );
      // Two weeks ago: 3/7 days (~43%)
      const twoWeeksAgoLogs = generateLogs(
        "h1",
        twoWeeksAgoStart,
        twoWeeksAgoEnd,
      ).slice(0, 3);

      const allLogs = [...prevWeekLogs, ...twoWeeksAgoLogs];

      const supabase = createSupabaseClient(habits, allLogs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const improvement = insights.find((i) => i.type === "improvement");
      expect(improvement).toBeDefined();
      expect(improvement!.priority).toBe(40);
      expect(improvement!.params.change).toBeGreaterThan(10);
    });

    it("returns decline insight when rate drops >15%", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const twoWeeksAgoStart = new Date(prevWeekStart);
      twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);
      const twoWeeksAgoEnd = new Date(prevWeekStart);
      twoWeeksAgoEnd.setDate(twoWeeksAgoEnd.getDate() - 1);

      const habits = [
        {
          id: "h1",
          name: "Run",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 0,
        },
      ];

      // Previous week: 2/7 days (~29%)
      const prevWeekLogs = generateLogs("h1", prevWeekStart, prevWeekEnd).slice(
        0,
        2,
      );
      // Two weeks ago: 6/7 days (~86%)
      const twoWeeksAgoLogs = generateLogs(
        "h1",
        twoWeeksAgoStart,
        twoWeeksAgoEnd,
      ).slice(0, 6);

      const allLogs = [...prevWeekLogs, ...twoWeeksAgoLogs];

      const supabase = createSupabaseClient(habits, allLogs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const decline = insights.find((i) => i.type === "decline");
      expect(decline).toBeDefined();
      expect(decline!.priority).toBe(60);
      expect(decline!.params.percent).toBeLessThan(
        decline!.params.lastPercent as number,
      );
    });

    it("returns at most 2 insights", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

      const habits = [
        {
          id: "h1",
          name: "Habit A",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 12, // 2 days from 14-day milestone
        },
        {
          id: "h2",
          name: "Habit B",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 5, // 2 days from 7-day milestone
        },
        {
          id: "h3",
          name: "Habit C",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 48, // 2 days from 50-day milestone
        },
      ];

      // All complete previous week
      const logs = [
        ...generateLogs("h1", prevWeekStart, prevWeekEnd),
        ...generateLogs("h2", prevWeekStart, prevWeekEnd),
        ...generateLogs("h3", prevWeekStart, prevWeekEnd),
      ];

      const supabase = createSupabaseClient(habits, logs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      expect(insights.length).toBeLessThanOrEqual(2);
    });

    it("sorts insights by priority descending", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const twoWeeksAgoStart = new Date(prevWeekStart);
      twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);
      const twoWeeksAgoEnd = new Date(prevWeekStart);
      twoWeeksAgoEnd.setDate(twoWeeksAgoEnd.getDate() - 1);

      const habits = [
        {
          id: "h1",
          name: "Meditate",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 28, // streak_proximity: priority 100
        },
      ];

      // Previous week: 6/7 days (86%) — best_habit qualifies (priority 80)
      const prevWeekLogs = generateLogs("h1", prevWeekStart, prevWeekEnd).slice(
        0,
        6,
      );
      // Two weeks ago: 3/7 days (43%) — improvement qualifies (priority 40)
      const twoWeeksAgoLogs = generateLogs(
        "h1",
        twoWeeksAgoStart,
        twoWeeksAgoEnd,
      ).slice(0, 3);

      const allLogs = [...prevWeekLogs, ...twoWeeksAgoLogs];
      const supabase = createSupabaseClient(habits, allLogs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      expect(insights.length).toBe(2);
      // First insight should have higher or equal priority
      expect(insights[0].priority).toBeGreaterThanOrEqual(insights[1].priority);
    });

    it("handles habits with custom frequency", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thisWeekStart = getWeekStart(today, WEEK_START_MONDAY);
      const prevWeekStart = new Date(thisWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(thisWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

      // Custom frequency: Mon, Wed, Fri only (days 1, 3, 5)
      const habits = [
        {
          id: "h1",
          name: "Yoga",
          frequency: { type: "custom", days: [1, 3, 5] },
          status: "active",
          current_streak: 5, // Near 7-day milestone
        },
      ];

      // Complete all MWF days in previous week
      const logs = generateLogs("h1", prevWeekStart, prevWeekEnd, [1, 3, 5]);

      const supabase = createSupabaseClient(habits, logs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      // Should be able to compute without errors
      expect(Array.isArray(insights)).toBe(true);
      // streak_proximity should fire (5 is 2 days from 7)
      const streakInsight = insights.find((i) => i.type === "streak_proximity");
      expect(streakInsight).toBeDefined();
    });

    it("returns worst_day insight when a day has <=50% completion", async () => {
      vi.useFakeTimers({ now: new Date("2026-02-11T12:00:00") });

      const habits = [
        {
          id: "h1",
          name: "Exercise",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 3,
        },
      ];

      // Complete all days EXCEPT Wednesday Feb 4 — 6/7 = 86% overall, Wednesday = 0%
      const logs = [
        { habit_id: "h1", logged_date: "2026-02-02", completed: true }, // Mon
        { habit_id: "h1", logged_date: "2026-02-03", completed: true }, // Tue
        // Wed Feb 4 missing
        { habit_id: "h1", logged_date: "2026-02-05", completed: true }, // Thu
        { habit_id: "h1", logged_date: "2026-02-06", completed: true }, // Fri
        { habit_id: "h1", logged_date: "2026-02-07", completed: true }, // Sat
        { habit_id: "h1", logged_date: "2026-02-08", completed: true }, // Sun
      ];

      const supabase = createSupabaseClient(habits, logs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const worstDay = insights.find((i) => i.type === "worst_day");
      expect(worstDay).toBeDefined();
      expect(worstDay!.priority).toBe(60);
      expect(worstDay!.params.day).toBe("wednesday");

      vi.useRealTimers();
    });

    it("returns best_week insight when overall rate is >=80% and improved", async () => {
      vi.useFakeTimers({ now: new Date("2026-02-11T12:00:00") });

      const habits = [
        {
          id: "h1",
          name: "Meditate",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 3,
        },
      ];

      // Previous week (Feb 2-8): 6/7 days = 86% (above 80%)
      const prevWeekLogs = [
        { habit_id: "h1", logged_date: "2026-02-02", completed: true },
        { habit_id: "h1", logged_date: "2026-02-03", completed: true },
        { habit_id: "h1", logged_date: "2026-02-04", completed: true },
        { habit_id: "h1", logged_date: "2026-02-05", completed: true },
        { habit_id: "h1", logged_date: "2026-02-06", completed: true },
        { habit_id: "h1", logged_date: "2026-02-07", completed: true },
      ];

      // Two weeks ago (Jan 26 - Feb 1): 3/7 days = 43% (below prev week, and > 0)
      const twoWeeksAgoLogs = [
        { habit_id: "h1", logged_date: "2026-01-26", completed: true },
        { habit_id: "h1", logged_date: "2026-01-27", completed: true },
        { habit_id: "h1", logged_date: "2026-01-28", completed: true },
      ];

      const allLogs = [...prevWeekLogs, ...twoWeeksAgoLogs];
      const supabase = createSupabaseClient(habits, allLogs);
      const db = new InsightsDB(supabase);
      const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

      const bestWeek = insights.find((i) => i.type === "best_week");
      expect(bestWeek).toBeDefined();
      expect(bestWeek!.priority).toBe(80);
      expect(bestWeek!.params.percent).toBeGreaterThanOrEqual(80);

      vi.useRealTimers();
    });

    it("throws when habits query returns an error", async () => {
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === "habits") {
            return createErrorChainMock({ message: "permission denied" });
          }
          return createChainMock({ data: [], error: null });
        }),
      } as any;

      const db = new InsightsDB(supabase);
      await expect(
        db.getWeeklyInsights("user-1", WEEK_START_MONDAY),
      ).rejects.toEqual({ message: "permission denied" });
    });

    it("throws when habit_logs query returns an error", async () => {
      const habits = [
        {
          id: "h1",
          name: "Test",
          frequency: { type: "daily" },
          status: "active",
          current_streak: 0,
        },
      ];

      const supabase = {
        from: vi.fn((table: string) => {
          if (table === "habits") {
            return createChainMock({ data: habits, error: null });
          }
          if (table === "habit_logs") {
            return createErrorChainMock({ message: "timeout" });
          }
          return createChainMock({ data: null, error: null });
        }),
      } as any;

      const db = new InsightsDB(supabase);
      await expect(
        db.getWeeklyInsights("user-1", WEEK_START_MONDAY),
      ).rejects.toEqual({ message: "timeout" });
    });
  });
});
