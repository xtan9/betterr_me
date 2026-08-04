import type { SupabaseClient } from "@supabase/supabase-js";

import type { Habit, HabitLog, Task } from "@/lib/db/types";
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
  };
}

/** Explicit all-layer factory; the task-named factory remains for compatibility. */
export const createSupabaseOverlayCapabilities = createSupabaseTaskOverlayCapabilities;
