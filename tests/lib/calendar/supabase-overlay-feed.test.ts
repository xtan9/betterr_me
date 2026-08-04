import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SupabaseActiveHabitReadPort,
  SupabaseHabitCompletionLogReadPort,
  SupabaseTaskCoveragePort,
  SupabaseTaskReadPort,
  SupabaseWorkoutReadPort,
} from "@/lib/calendar/supabase-overlay-feed";

const { ensureRecurringTaskCoverageThrough } = vi.hoisted(() => ({
  ensureRecurringTaskCoverageThrough: vi.fn(),
}));

vi.mock("@/lib/recurring-tasks/coverage", () => ({
  ensureRecurringTaskCoverageThrough,
}));

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "gte", "lte", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

describe("Supabase task overlay capabilities", () => {
  it("maps coverage through the requested inclusive end", async () => {
    ensureRecurringTaskCoverageThrough.mockResolvedValue({
      status: "complete",
      failedSeriesIds: [],
    });
    const supabase = {} as never;

    await expect(new SupabaseTaskCoveragePort(supabase).ensureThrough({
      userId: "user-1",
      range: { from: "2026-04-01", to: "2026-04-07" },
    })).resolves.toEqual({ status: "complete" });
    expect(ensureRecurringTaskCoverageThrough).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "2026-04-01",
      "2026-04-07",
    );
  });

  it("reads only owner-scoped tasks whose due dates are in the inclusive range", async () => {
    const builder = queryBuilder({ data: [], error: null });
    const supabaseObject = { from: vi.fn(() => builder) };
    const supabase = supabaseObject as unknown as SupabaseClient;

    await expect(new SupabaseTaskReadPort(supabase).read({
      userId: "user-1",
      range: { from: "2026-04-01", to: "2026-04-07" },
    })).resolves.toEqual([]);

    expect(supabaseObject.from).toHaveBeenCalledWith("tasks");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.not).toHaveBeenCalledWith("due_date", "is", null);
    expect(builder.gte).toHaveBeenCalledWith("due_date", "2026-04-01");
    expect(builder.lte).toHaveBeenCalledWith("due_date", "2026-04-07");
  });

  it("reads owner-scoped active habits through a separate capability", async () => {
    const builder = queryBuilder({ data: [], error: null });
    const supabaseObject = { from: vi.fn(() => builder) };
    const supabase = supabaseObject as unknown as SupabaseClient;

    await expect(new SupabaseActiveHabitReadPort(supabase).read({
      userId: "user-1",
      range: { from: "2026-04-01", to: "2026-04-07" },
    })).resolves.toEqual([]);

    expect(supabaseObject.from).toHaveBeenCalledWith("habits");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
  });

  it("reads owner-scoped completed logs only in the requested date range", async () => {
    const builder = queryBuilder({ data: [], error: null });
    const supabaseObject = { from: vi.fn(() => builder) };
    const supabase = supabaseObject as unknown as SupabaseClient;

    await expect(new SupabaseHabitCompletionLogReadPort(supabase).read({
      userId: "user-1",
      range: { from: "2026-04-01", to: "2026-04-07" },
    })).resolves.toEqual([]);

    expect(supabaseObject.from).toHaveBeenCalledWith("habit_logs");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("completed", true);
    expect(builder.gte).toHaveBeenCalledWith("logged_date", "2026-04-01");
    expect(builder.lte).toHaveBeenCalledWith("logged_date", "2026-04-07");
  });

  it("reads owner-scoped non-active workouts within the requested date range", async () => {
    const builder = queryBuilder({ data: [], error: null });
    const supabaseObject = { from: vi.fn(() => builder) };
    const supabase = supabaseObject as unknown as SupabaseClient;

    await expect(new SupabaseWorkoutReadPort(supabase).read({
      userId: "user-1",
      range: { from: "2026-04-01", to: "2026-04-07" },
      timezone: "America/Los_Angeles",
    })).resolves.toEqual([]);

    expect(supabaseObject.from).toHaveBeenCalledWith("workouts");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.neq).toHaveBeenCalledWith("status", "in_progress");
    expect(builder.gte).toHaveBeenCalledWith("started_at", "2026-04-01T07:00:00.000Z");
    expect(builder.lte).toHaveBeenCalledWith("started_at", "2026-04-08T06:59:59.000Z");
  });
});
