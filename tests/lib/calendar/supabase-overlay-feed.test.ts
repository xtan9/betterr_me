import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SupabaseTaskCoveragePort,
  SupabaseTaskReadPort,
} from "@/lib/calendar/supabase-overlay-feed";

const { ensureRecurringTaskCoverageThrough } = vi.hoisted(() => ({
  ensureRecurringTaskCoverageThrough: vi.fn(),
}));

vi.mock("@/lib/recurring-tasks/coverage", () => ({
  ensureRecurringTaskCoverageThrough,
}));

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "gte", "lte", "order"]) {
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
});
