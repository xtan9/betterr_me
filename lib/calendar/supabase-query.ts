import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createCoverageRead,
  type AuthenticatedRecurringTaskPrincipal,
} from "@/lib/recurring-tasks/coverage-read";
import type { Habit, HabitLog, Task, Workout } from "@/lib/db/types";

import { createCalendarQuery, type CalendarQuery } from "./query";
import type {
  CalendarOverlayReadCapabilities,
  HabitOverlayRequest,
  TaskOverlayRequest,
  WorkoutOverlayRequest,
} from "./overlay-feed";

/** Compose the authenticated Calendar query over materialized Task Occurrences. */
export function createSupabaseCalendarQuery(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): CalendarQuery {
  const coverage = createCoverageRead({
    supabase,
    principal,
    source: "calendar",
  });

  const overlay: CalendarOverlayReadCapabilities = {
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

  return createCalendarQuery(principal, { coverage, overlay });
}

function readTasks(
  supabase: SupabaseClient,
  { userId, range }: TaskOverlayRequest,
): Promise<Task[]> {
  return readRows<Task>(
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .not("due_date", "is", null)
      .gte("due_date", range.from)
      .lte("due_date", range.to)
      .order("due_date", { ascending: true })
      .order("due_time", { ascending: true }),
  );
}

function readActiveHabits(
  supabase: SupabaseClient,
  { userId }: HabitOverlayRequest,
): Promise<Habit[]> {
  return readRows<Habit>(
    supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active"),
  );
}

function readHabitCompletionLogs(
  supabase: SupabaseClient,
  { userId, range }: HabitOverlayRequest,
): Promise<HabitLog[]> {
  return readRows<HabitLog>(
    supabase
      .from("habit_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("logged_date", range.from)
      .lte("logged_date", range.to),
  );
}

function readWorkouts(
  supabase: SupabaseClient,
  { userId, range, timezone }: WorkoutOverlayRequest,
): Promise<Workout[]> {
  return readRows<Workout>(
    supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "in_progress")
      .gte("started_at", localBoundaryToUtc(range.from, "00:00:00", timezone))
      .lte("started_at", localBoundaryToUtc(range.to, "23:59:59", timezone))
      .order("started_at", { ascending: true }),
  );
}

async function readRows<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data as T[] | null) ?? [];
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
