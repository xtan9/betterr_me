import type { HabitFrequency, HabitStatus } from "@/lib/db/types";
import { shouldTrackOnDate } from "@/lib/habits/format";

type LogRow = { logged_date: string; completed: boolean };

type Args = {
  createdAt: string; // ISO timestamp
  today: string; // YYYY-MM-DD
  frequency: HabitFrequency;
  logs: LogRow[];
  status?: HabitStatus;
  nudgeDismissedAt?: string | null;
};

type Bucket = { minAgeDays: number; windowDays: number; consistency: number };

const DAILY_BUCKET: Bucket = { minAgeDays: 21, windowDays: 21, consistency: 0.8 };
const TIMES_PER_WEEK_BUCKET: Bucket = { minAgeDays: 30, windowDays: 30, consistency: 0.8 };
const WEEKLY_BUCKET: Bucket = { minAgeDays: 90, windowDays: 90, consistency: 0.8 };

const NUDGE_COOLDOWN_DAYS = 30;

export function getBucket(frequency: HabitFrequency): Bucket {
  switch (frequency.type) {
    case "daily":
    case "weekdays":
      return DAILY_BUCKET;
    case "times_per_week":
      return TIMES_PER_WEEK_BUCKET;
    case "weekly":
      return WEEKLY_BUCKET;
    case "custom": {
      const n = frequency.days.length;
      if (n >= 4) return DAILY_BUCKET;
      if (n >= 2) return TIMES_PER_WEEK_BUCKET;
      return WEEKLY_BUCKET;
    }
  }
}

function daysBetween(fromISO: string, toYMD: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(`${toYMD}T00:00:00Z`).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Count scheduled occurrences in [startYMD, endYMD] inclusive for a frequency. */
function countScheduled(
  frequency: HabitFrequency,
  startYMD: string,
  endYMD: string
): number {
  if (frequency.type === "times_per_week" || frequency.type === "weekly") {
    const days = daysBetween(`${startYMD}T00:00:00Z`, endYMD) + 1;
    const weeks = Math.max(Math.floor(days / 7), 1);
    const perWeek = frequency.type === "weekly" ? 1 : frequency.count;
    return weeks * perWeek;
  }

  let count = 0;
  let cursor = startYMD;
  while (cursor <= endYMD) {
    const d = new Date(`${cursor}T00:00:00Z`);
    if (shouldTrackOnDate(frequency, d)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

export function isGraduationEligible(args: Args): boolean {
  const { createdAt, today, frequency, logs, status, nudgeDismissedAt } = args;

  if (status === "formed") return false;

  const bucket = getBucket(frequency);
  const ageDays = daysBetween(createdAt, today);
  if (ageDays < bucket.minAgeDays) return false;

  if (nudgeDismissedAt) {
    const since = daysBetween(nudgeDismissedAt, today);
    if (since < NUDGE_COOLDOWN_DAYS) return false;
  }

  const windowStart = addDays(today, -(bucket.windowDays - 1));
  const scheduled = countScheduled(frequency, windowStart, today);
  if (scheduled === 0) return false;

  const isScheduledYMD = (ymd: string): boolean => {
    if (frequency.type === "times_per_week" || frequency.type === "weekly") {
      // For count-based frequencies there's no fixed scheduled weekday — any
      // completed day within the week counts toward the per-week target.
      return true;
    }
    return shouldTrackOnDate(frequency, new Date(`${ymd}T00:00:00Z`));
  };

  const completedInWindow = logs.filter(
    (l) =>
      l.completed &&
      l.logged_date >= windowStart &&
      l.logged_date <= today &&
      isScheduledYMD(l.logged_date)
  ).length;

  // Clamp to scheduled ceiling so ratio never exceeds 1.0 (defensive).
  const effectiveCompleted = Math.min(completedInWindow, scheduled);

  return effectiveCompleted / scheduled >= bucket.consistency;
}
