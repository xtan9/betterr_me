import type { SupabaseClient } from "@supabase/supabase-js";

import type { Habit, HabitLog, Task, Workout } from "@/lib/db/types";
import { ensureRecurringTaskCoverageThrough } from "@/lib/recurring-tasks/coverage";
import type {
  TaskCoveragePort,
  ActiveHabitReadPort,
  CalendarOverlayCapabilities,
  HabitCompletionLogReadPort,
  HabitOverlayRequest,
  HabitOverlayCapabilities,
  TaskOverlayRequest,
  TaskReadPort,
  WorkoutOverlayRequest,
  WorkoutReadPort,
} from "./overlay-feed";

export class SupabaseTaskCoveragePort implements TaskCoveragePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async ensureThrough({ userId, range }: TaskOverlayRequest) {
    const result = await ensureRecurringTaskCoverageThrough(
      this.supabase,
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
}

export class SupabaseTaskReadPort implements TaskReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async read({ userId, range }: TaskOverlayRequest): Promise<Task[]> {
    const { data, error } = await this.supabase
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
}

export class SupabaseActiveHabitReadPort implements ActiveHabitReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async read({ userId }: HabitOverlayRequest): Promise<Habit[]> {
    const { data, error } = await this.supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) throw error;
    return (data as Habit[] | null) ?? [];
  }
}

export class SupabaseHabitCompletionLogReadPort implements HabitCompletionLogReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async read({ userId, range }: HabitOverlayRequest): Promise<HabitLog[]> {
    const { data, error } = await this.supabase
      .from("habit_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("logged_date", range.from)
      .lte("logged_date", range.to);

    if (error) throw error;
    return (data as HabitLog[] | null) ?? [];
  }
}

export class SupabaseWorkoutReadPort implements WorkoutReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async read({ userId, range, timezone }: WorkoutOverlayRequest): Promise<Workout[]> {
    const { data, error } = await this.supabase
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

export function createSupabaseTaskOverlayCapabilities(
  supabase: SupabaseClient,
): CalendarOverlayCapabilities {
  const habits: HabitOverlayCapabilities = {
    activeHabits: new SupabaseActiveHabitReadPort(supabase),
    completionLogs: new SupabaseHabitCompletionLogReadPort(supabase),
  };
  return {
    coverage: new SupabaseTaskCoveragePort(supabase),
    read: new SupabaseTaskReadPort(supabase),
    habits,
    workouts: new SupabaseWorkoutReadPort(supabase),
  };
}

/** Explicit all-layer factory; the task-named factory remains for compatibility. */
export const createSupabaseOverlayCapabilities = createSupabaseTaskOverlayCapabilities;
