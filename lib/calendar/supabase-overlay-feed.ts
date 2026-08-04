import type { SupabaseClient } from "@supabase/supabase-js";

import type { Task } from "@/lib/db/types";
import { ensureRecurringTaskCoverageThrough } from "@/lib/recurring-tasks/coverage";
import type {
  TaskCoveragePort,
  TaskOverlayCapabilities,
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

export function createSupabaseTaskOverlayCapabilities(
  supabase: SupabaseClient,
): TaskOverlayCapabilities {
  return {
    coverage: new SupabaseTaskCoveragePort(supabase),
    read: new SupabaseTaskReadPort(supabase),
  };
}
