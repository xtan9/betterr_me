import type { SupabaseClient } from "@supabase/supabase-js";
import type { Habit } from "./types";
import { getLocalDateString } from "@/lib/utils";
import { shouldTrackOnDate } from "@/lib/habits/format";
import { MILESTONE_THRESHOLDS } from "@/lib/habits/milestones";

export interface WeeklyInsight {
  type:
    | "best_week"
    | "worst_day"
    | "best_habit"
    | "streak_proximity"
    | "improvement"
    | "decline";
  message: string; // i18n key
  params: Record<string, string | number>;
  priority: number; // Higher = more relevant
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getWeekStart(date: Date, weekStartDay: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const currentDayOfWeek = result.getDay();
  const daysToSubtract = (currentDayOfWeek - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysToSubtract);
  return result;
}

export class InsightsDB {
  constructor(private supabase: SupabaseClient) {}

  async getWeeklyInsights(
    userId: string,
    weekStartDay: number,
    dateStr?: string,
  ): Promise<WeeklyInsight[]> {
    // Get active habits
    const { data: habits, error: habitsError } = await this.supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (habitsError) throw habitsError;
    if (!habits || habits.length === 0) return [];

    // Calculate date ranges: previous week and the week before
    const today = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekStart = getWeekStart(today, weekStartDay);
    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const twoWeeksAgoStart = new Date(prevWeekStart);
    twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);

    const prevWeekEnd = new Date(thisWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

    // Fetch logs for the 2-week window
    const { data: logs, error: logsError } = await this.supabase
      .from("habit_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("logged_date", getLocalDateString(twoWeeksAgoStart))
      .lte("logged_date", getLocalDateString(prevWeekEnd));

    if (logsError) throw logsError;

    const completedLogs = logs || [];

    // Build sets: per-habit and per-day completion
    const prevWeekLogs = completedLogs.filter(
      (log) =>
        log.logged_date >= getLocalDateString(prevWeekStart) &&
        log.logged_date <= getLocalDateString(prevWeekEnd),
    );
    const twoWeeksAgoLogs = completedLogs.filter(
      (log) =>
        log.logged_date >= getLocalDateString(twoWeeksAgoStart) &&
        log.logged_date < getLocalDateString(prevWeekStart),
    );

    // Compute per-habit completion rates for previous week
    const prevWeekHabitRates = this.computePerHabitRates(
      habits,
      prevWeekLogs,
      prevWeekStart,
      prevWeekEnd,
    );
    const twoWeeksAgoHabitRates = this.computePerHabitRates(
      habits,
      twoWeeksAgoLogs,
      twoWeeksAgoStart,
      new Date(prevWeekStart.getTime() - 86400000),
    );

    // Compute per-day-of-week completion rates for previous week
    const dayRates = this.computePerDayRates(
      habits,
      prevWeekLogs,
      prevWeekStart,
      prevWeekEnd,
    );

    // Compute overall rates
    const prevWeekOverall = this.computeOverallRate(prevWeekHabitRates);
    const twoWeeksAgoOverall = this.computeOverallRate(twoWeeksAgoHabitRates);

    // Generate insight candidates
    const candidates: WeeklyInsight[] = [];

    // streak_proximity (Priority 100)
    for (const habit of habits) {
      const streak = (habit as Habit).current_streak;
      for (const milestone of MILESTONE_THRESHOLDS) {
        const daysToMilestone = milestone - streak;
        if (daysToMilestone > 0 && daysToMilestone <= 3) {
          candidates.push({
            type: "streak_proximity",
            message: "streakProximity",
            params: {
              habit: (habit as Habit).name,
              days: daysToMilestone,
              milestone,
            },
            priority: 100,
          });
          break; // Only closest milestone per habit
        }
      }
    }

    // best_habit (Priority 80)
    let bestHabitRate = 0;
    let bestHabitName = "";
    for (const [habitId, rate] of prevWeekHabitRates) {
      if (rate >= 80 && rate > bestHabitRate) {
        bestHabitRate = rate;
        bestHabitName =
          (habits.find((h) => h.id === habitId) as Habit)?.name || "";
      }
    }
    if (bestHabitRate >= 80 && bestHabitName) {
      candidates.push({
        type: "best_habit",
        message: "bestHabit",
        params: { habit: bestHabitName, percent: bestHabitRate },
        priority: 80,
      });
    }

    // best_week (Priority 80)
    if (
      prevWeekOverall > twoWeeksAgoOverall &&
      twoWeeksAgoOverall > 0 &&
      prevWeekOverall >= 80
    ) {
      candidates.push({
        type: "best_week",
        message: "bestWeek",
        params: { percent: prevWeekOverall },
        priority: 80,
      });
    }

    // worst_day (Priority 60)
    let worstDayRate = 100;
    let worstDayName = "";
    for (const [day, rate] of dayRates) {
      if (rate <= 50 && rate < worstDayRate) {
        worstDayRate = rate;
        worstDayName = DAY_NAMES[day];
      }
    }
    if (worstDayRate <= 50 && worstDayName) {
      candidates.push({
        type: "worst_day",
        message: "worstDay",
        params: { day: worstDayName },
        priority: 60,
      });
    }

    // decline (Priority 60)
    if (twoWeeksAgoOverall > 0) {
      const change = twoWeeksAgoOverall - prevWeekOverall;
      if (change > 15) {
        candidates.push({
          type: "decline",
          message: "decline",
          params: { percent: prevWeekOverall, lastPercent: twoWeeksAgoOverall },
          priority: 60,
        });
      }
    }

    // improvement (Priority 40)
    if (twoWeeksAgoOverall > 0) {
      const change = prevWeekOverall - twoWeeksAgoOverall;
      if (change > 10) {
        candidates.push({
          type: "improvement",
          message: "improvement",
          params: { change },
          priority: 40,
        });
      }
    }

    // Sort by priority descending, return top 2
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates.slice(0, 2);
  }

  private computePerHabitRates(
    habits: Habit[],
    logs: Array<{ habit_id: string; logged_date: string }>,
    weekStart: Date,
    weekEnd: Date,
  ): Map<string, number> {
    const rates = new Map<string, number>();
    const logsByHabit = new Map<string, Set<string>>();

    for (const log of logs) {
      const set = logsByHabit.get(log.habit_id) || new Set<string>();
      set.add(log.logged_date);
      logsByHabit.set(log.habit_id, set);
    }

    for (const habit of habits) {
      const habitLogs = logsByHabit.get(habit.id) || new Set<string>();
      let scheduled = 0;
      let completed = 0;
      const checkDate = new Date(weekStart);

      while (checkDate <= weekEnd) {
        if (shouldTrackOnDate(habit.frequency, checkDate)) {
          scheduled++;
          if (habitLogs.has(getLocalDateString(checkDate))) {
            completed++;
          }
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }

      if (scheduled > 0) {
        rates.set(habit.id, Math.round((completed / scheduled) * 100));
      }
    }

    return rates;
  }

  private computePerDayRates(
    habits: Habit[],
    logs: Array<{ habit_id: string; logged_date: string }>,
    weekStart: Date,
    weekEnd: Date,
  ): Map<number, number> {
    const dayScheduled = new Map<number, number>();
    const dayCompleted = new Map<number, number>();
    const logSet = new Set(logs.map((l) => `${l.habit_id}:${l.logged_date}`));

    const checkDate = new Date(weekStart);
    while (checkDate <= weekEnd) {
      const dayOfWeek = checkDate.getDay();
      const dateStr = getLocalDateString(checkDate);

      for (const habit of habits) {
        if (shouldTrackOnDate(habit.frequency, checkDate)) {
          dayScheduled.set(dayOfWeek, (dayScheduled.get(dayOfWeek) || 0) + 1);
          if (logSet.has(`${habit.id}:${dateStr}`)) {
            dayCompleted.set(dayOfWeek, (dayCompleted.get(dayOfWeek) || 0) + 1);
          }
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    const rates = new Map<number, number>();
    for (const [day, scheduled] of dayScheduled) {
      const completed = dayCompleted.get(day) || 0;
      rates.set(
        day,
        scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
      );
    }

    return rates;
  }

  private computeOverallRate(habitRates: Map<string, number>): number {
    if (habitRates.size === 0) return 0;
    let sum = 0;
    for (const rate of habitRates.values()) {
      sum += rate;
    }
    return Math.round(sum / habitRates.size);
  }
}
