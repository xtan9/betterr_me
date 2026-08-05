import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as supabaseOverlayFeed from "@/lib/calendar/supabase-overlay-feed";

const { ensureRecurringTaskCoverageThrough } = vi.hoisted(() => ({
  ensureRecurringTaskCoverageThrough: vi.fn(),
}));

vi.mock("@/lib/recurring-tasks/coverage", () => ({
  ensureRecurringTaskCoverageThrough,
}));

const request = {
  userId: "user-1",
  range: { from: "2026-04-01", to: "2026-04-07" },
};

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "gte", "lte", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function supabaseFor(builders: Record<string, ReturnType<typeof queryBuilder>>) {
  const client = {
    from: vi.fn((table: string) => builders[table]),
  };
  return { client, supabase: client as unknown as SupabaseClient };
}

describe("querySupabaseCalendarOverlayFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureRecurringTaskCoverageThrough.mockResolvedValue({
      status: "complete",
      failedSeriesIds: [],
    });
  });

  it("is the adapter's only runtime export", () => {
    expect(Object.keys(supabaseOverlayFeed)).toEqual([
      "querySupabaseCalendarOverlayFeed",
    ]);
  });

  it("ensures the Coverage Horizon and reads owner-scoped tasks in the inclusive range", async () => {
    const tasks = queryBuilder({ data: [], error: null });
    const { client, supabase } = supabaseFor({ tasks });

    await expect(supabaseOverlayFeed.querySupabaseCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      supabase,
    )).resolves.toEqual({ status: "complete", items: [], unavailable: [] });

    expect(ensureRecurringTaskCoverageThrough).toHaveBeenCalledWith(
      supabase,
      "user-1",
      "2026-04-01",
      "2026-04-07",
    );
    expect(client.from).toHaveBeenCalledWith("tasks");
    expect(tasks.select).toHaveBeenCalledWith("*");
    expect(tasks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(tasks.not).toHaveBeenCalledWith("due_date", "is", null);
    expect(tasks.gte).toHaveBeenCalledWith("due_date", "2026-04-01");
    expect(tasks.lte).toHaveBeenCalledWith("due_date", "2026-04-07");
    expect(tasks.order).toHaveBeenNthCalledWith(1, "due_date", { ascending: true });
    expect(tasks.order).toHaveBeenNthCalledWith(2, "due_time", { ascending: true });
  });

  it("reads active habits and completed logs as one owner-scoped layer", async () => {
    const habits = queryBuilder({ data: [], error: null });
    const habitLogs = queryBuilder({ data: [], error: null });
    const { client, supabase } = supabaseFor({ habits, habit_logs: habitLogs });

    await expect(supabaseOverlayFeed.querySupabaseCalendarOverlayFeed(
      { ...request, layers: ["habits"] },
      supabase,
    )).resolves.toEqual({ status: "complete", items: [], unavailable: [] });

    expect(client.from).toHaveBeenCalledWith("habits");
    expect(habits.select).toHaveBeenCalledWith("*");
    expect(habits.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(habits.eq).toHaveBeenCalledWith("status", "active");
    expect(client.from).toHaveBeenCalledWith("habit_logs");
    expect(habitLogs.select).toHaveBeenCalledWith("*");
    expect(habitLogs.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(habitLogs.eq).toHaveBeenCalledWith("completed", true);
    expect(habitLogs.gte).toHaveBeenCalledWith("logged_date", "2026-04-01");
    expect(habitLogs.lte).toHaveBeenCalledWith("logged_date", "2026-04-07");
  });

  it("reads owner-scoped non-active workouts using timezone-correct UTC boundaries", async () => {
    const workouts = queryBuilder({ data: [], error: null });
    const { client, supabase } = supabaseFor({ workouts });

    await expect(supabaseOverlayFeed.querySupabaseCalendarOverlayFeed(
      {
        ...request,
        layers: ["workouts"],
        timezone: "America/Los_Angeles",
      },
      supabase,
    )).resolves.toEqual({ status: "complete", items: [], unavailable: [] });

    expect(client.from).toHaveBeenCalledWith("workouts");
    expect(workouts.select).toHaveBeenCalledWith("*");
    expect(workouts.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(workouts.neq).toHaveBeenCalledWith("status", "in_progress");
    expect(workouts.gte).toHaveBeenCalledWith(
      "started_at",
      "2026-04-01T07:00:00.000Z",
    );
    expect(workouts.lte).toHaveBeenCalledWith(
      "started_at",
      "2026-04-08T06:59:59.000Z",
    );
    expect(workouts.order).toHaveBeenCalledWith("started_at", { ascending: true });
  });
});
