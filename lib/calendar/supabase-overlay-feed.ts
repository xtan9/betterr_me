import type { SupabaseClient } from "@supabase/supabase-js";

import {
  queryCalendarOverlayFeed,
  type CalendarOverlayCapabilities,
  type CalendarOverlayQueryInput,
  type CalendarOverlayQueryOptions,
  type HabitOverlayRequest,
  type TaskOverlayRequest,
  type WorkoutOverlayRequest,
} from "./overlay-feed";
import type { Habit, HabitLog, Task, Workout } from "@/lib/db/types";
import { ensureRecurringTaskCoverageThrough } from "@/lib/recurring-tasks/coverage";

async function ensureCoverageHorizon(
  supabase: SupabaseClient,
  { userId, range }: TaskOverlayRequest,
) {
  const result = await ensureRecurringTaskCoverageThrough(
    supabase,
    userId,
    range.from,
    range.to,
  );
  return result.status === "complete"
    ? { status: "complete" as const }
    : {
        status: "partial" as const,
        failedSeriesIds: result.failedSeriesIds,
      };
}

async function readTasks(
  supabase: SupabaseClient,
  { userId, range }: TaskOverlayRequest,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .not("due_date", "is", null)
    .gte("due_date", range.from)
    .lte("due_date", range.to)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true });

  if (error) throw error;
  return (data as Task[] | null) ?? [];
}

async function readActiveHabits(
  supabase: SupabaseClient,
  { userId }: HabitOverlayRequest,
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from("habits")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw error;
  return (data as Habit[] | null) ?? [];
}

async function readHabitCompletionLogs(
  supabase: SupabaseClient,
  { userId, range }: HabitOverlayRequest,
): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from("habit_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", true)
    .gte("logged_date", range.from)
    .lte("logged_date", range.to);

  if (error) throw error;
  return (data as HabitLog[] | null) ?? [];
}

async function readWorkouts(
  supabase: SupabaseClient,
  { userId, range, timezone }: WorkoutOverlayRequest,
): Promise<Workout[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "in_progress")
    .gte("started_at", localBoundaryToUtc(range.from, "00:00:00", timezone))
    .lte("started_at", localBoundaryToUtc(range.to, "23:59:59", timezone))
    .order("started_at", { ascending: true });

  if (error) throw error;
  return (data as Workout[] | null) ?? [];
}

function timeZoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const displayedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return displayedAsUtc - instant.getTime();
}

function localBoundaryToUtc(date: string, time: string, timezone: string): string {
  const localWallTime = Date.parse(`${date}T${time}Z`);
  const firstGuess = localWallTime - timeZoneOffsetMs(new Date(localWallTime), timezone);
  const exactGuess = localWallTime - timeZoneOffsetMs(new Date(firstGuess), timezone);
  return new Date(exactGuess).toISOString();
}

export function querySupabaseCalendarOverlayFeed(
  input: CalendarOverlayQueryInput,
  supabase: SupabaseClient,
  options: CalendarOverlayQueryOptions = {},
) {
  const capabilities: CalendarOverlayCapabilities = {
    coverage: {
      ensureThrough: (request) => ensureCoverageHorizon(supabase, request),
    },
    read: {
      read: (request) => readTasks(supabase, request),
    },
    habits: {
      activeHabits: {
        read: (request) => readActiveHabits(supabase, request),
      },
      completionLogs: {
        read: (request) => readHabitCompletionLogs(supabase, request),
      },
    },
    workouts: {
      read: (request) => readWorkouts(supabase, request),
    },
  };

  return queryCalendarOverlayFeed(input, capabilities, options);
}
