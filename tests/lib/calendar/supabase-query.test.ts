import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCapabilities } = vi.hoisted(() => ({
  createCapabilities: vi.fn(),
}));

vi.mock("@/lib/recurring-tasks/capabilities", () => ({
  createAuthenticatedRecurringTaskCapabilities: createCapabilities,
}));

import { createSupabaseCalendarQuery } from "@/lib/calendar/supabase-query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "gte", "lte", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

describe("Supabase calendar query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds Coverage to the authenticated principal and reads materialized tasks", async () => {
    const events: string[] = [];
    const tasks = queryBuilder({ data: [], error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        events.push(`read:${table}`);
        return { tasks }[table];
      }),
    } as unknown as SupabaseClient;
    const ensure = vi.fn(async ({ range }: { range: { from: string; to: string } }) => {
      events.push(`coverage:${range.from}:${range.to}`);
      return {
        type: "coverage" as const,
        status: "complete" as const,
        completeness: {
          status: "complete" as const,
          type: "complete" as const,
          requestedRange: range,
          failedSeriesIds: [] as [],
        },
      };
    });
    createCapabilities.mockReturnValue({ coverage: { ensure } });

    const result = await createSupabaseCalendarQuery(supabase, principal).read({
      range: { from: "2026-04-01", to: "2026-04-07" },
      layers: ["tasks"],
    });

    expect(createCapabilities).toHaveBeenCalledWith(supabase, principal);
    expect(ensure).toHaveBeenCalledWith({
      operationId: "calendar-read-coverage:user-1:2026-04-01:2026-04-07",
      range: { from: "2026-04-01", to: "2026-04-07" },
    });
    expect(events).toEqual([
      "coverage:2026-04-01:2026-04-07",
      "read:tasks",
    ]);
    expect(result.completeness).toMatchObject({
      status: "complete",
      requestedRange: { from: "2026-04-01", to: "2026-04-07" },
    });
  });

  it.each([
    [
      "partial",
      {
        status: "partial" as const,
        type: "partial" as const,
        requestedRange: { from: "2026-04-01", to: "2026-04-07" },
        failedSeriesIds: ["series-1"],
      },
    ],
    [
      "unavailable",
      {
        status: "unavailable" as const,
        type: "unavailable" as const,
        requestedRange: { from: "2026-04-01", to: "2026-04-07" },
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    ],
  ])(
    "preserves %s Coverage and skips the materialized task read",
    async (_label, completeness) => {
      const from = vi.fn();
      const supabase = { from } as unknown as SupabaseClient;
      const ensure = vi.fn().mockResolvedValue({
        type: "coverage",
        status: completeness.status,
        completeness,
      });
      createCapabilities.mockReturnValue({ coverage: { ensure } });

      const result = await createSupabaseCalendarQuery(supabase, principal).read({
        range: completeness.requestedRange,
        layers: ["tasks"],
      });

      expect(result.completeness).toEqual(completeness);
      expect(result.status).toBe("failed");
      expect(result.unavailable).toEqual([expect.objectContaining({
        layer: "tasks",
        code: "recurring_coverage_unavailable",
      })]);
      expect(from).not.toHaveBeenCalled();
    },
  );
});
