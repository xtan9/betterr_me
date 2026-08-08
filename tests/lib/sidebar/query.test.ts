import { describe, expect, it } from "vitest";

import {
  createSidebarCountsQuery,
  type SidebarCountsQueryDependencies,
} from "@/lib/sidebar/query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

const range = { from: "2026-08-07", to: "2026-08-07" };
const counts = { habits_incomplete: 2, tasks_due: 3 };

function completeCoverage() {
  return {
    status: "complete" as const,
    type: "complete" as const,
    requestedRange: range,
    failedSeriesIds: [] as [],
  };
}

function createDependencies(
  events: string[],
  coverage: SidebarCountsQueryDependencies["coverage"] = {
    ensure: async () => completeCoverage(),
  },
): SidebarCountsQueryDependencies {
  return {
    coverage,
    counts: {
      read: async ({ principal: owner, date }) => {
        events.push(`read:${owner.userId}:${date}`);
        return counts;
      },
    },
  };
}

describe("authenticated sidebar counts query", () => {
  it("ensures complete Coverage before reading materialized counts", async () => {
    const events: string[] = [];
    const query = createSidebarCountsQuery(principal, {
      ...createDependencies(events),
      coverage: {
        ensure: async ({ principal: owner, range: requestedRange }) => {
          events.push(
            `coverage:${owner.userId}:${requestedRange.from}:${requestedRange.to}`,
          );
          return completeCoverage();
        },
      },
    });

    const result = await query.read({ date: "2026-08-07" });

    expect(events).toEqual([
      "coverage:user-1:2026-08-07:2026-08-07",
      "read:user-1:2026-08-07",
    ]);
    expect(result).toEqual({
      status: "complete",
      counts,
      completeness: completeCoverage(),
    });
  });

  it.each([
    {
      label: "partial",
      completeness: {
        status: "partial" as const,
        type: "partial" as const,
        requestedRange: range,
        failedSeriesIds: ["series-2", "series-1", "series-2"],
      },
    },
    {
      label: "unavailable",
      completeness: {
        status: "unavailable" as const,
        type: "unavailable" as const,
        requestedRange: range,
        failedSeriesIds: [],
        reason: "Coverage service unavailable",
      },
    },
  ])(
    "fails closed for $label Coverage without reading counts",
    async ({ completeness }) => {
      const events: string[] = [];
      const query = createSidebarCountsQuery(
        principal,
        createDependencies(events, {
          ensure: async () => {
            events.push("coverage");
            return completeness;
          },
        }),
      );

      const result = await query.read({ date: "2026-08-07" });

      expect(events).toEqual(["coverage"]);
      expect(result).toEqual({
        status: "failed",
        completeness,
        warning: {
          code: "recurring_coverage_unavailable",
          type: "coverage-unavailable",
          message:
            "Recurring task coverage is unavailable for the requested date range.",
          requestedRange: range,
          failedSeriesIds:
            completeness.status === "partial"
              ? ["series-1", "series-2"]
              : [],
        },
        error: {
          code: "coverage_unavailable",
          message: "Recurring task coverage is temporarily unavailable.",
        },
      });
    },
  );

  it("normalizes a thrown Coverage failure to unavailable and fails closed", async () => {
    const events: string[] = [];
    const query = createSidebarCountsQuery(
      principal,
      createDependencies(events, {
        ensure: async () => {
          events.push("coverage");
          throw new Error("coverage failed");
        },
      }),
    );

    const result = await query.read({ date: "2026-08-07" });

    expect(events).toEqual(["coverage"]);
    expect(result).toEqual({
      status: "failed",
      completeness: {
        status: "unavailable",
        type: "unavailable",
        requestedRange: range,
        failedSeriesIds: [],
        reason: "Coverage could not be ensured",
      },
      warning: expect.objectContaining({
        code: "recurring_coverage_unavailable",
        requestedRange: range,
      }),
      error: {
        code: "coverage_unavailable",
        message: "Recurring task coverage is temporarily unavailable.",
      },
    });
  });

  it("rejects a non-user principal at the authenticated seam", () => {
    expect(() =>
      createSidebarCountsQuery(
        { type: "service", serviceId: "worker", credential: "adminSecret" } as never,
        createDependencies([]),
      ),
    ).toThrow("An authenticated user principal is required");
  });
});
