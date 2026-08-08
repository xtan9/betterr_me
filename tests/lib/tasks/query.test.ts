import { describe, expect, it } from "vitest";

import {
  createTaskQuery,
  taskCoverageWarning,
  type TaskQueryDependencies,
} from "@/lib/tasks/query";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

const task = { id: "task-1", title: "Review Coverage" } as never;

function createDependencies(events: string[]): TaskQueryDependencies {
  return {
    coverage: {
      ensure: async ({ range }) => {
        events.push(`coverage:${range.from}:${range.to}`);
        return {
          status: "complete",
          type: "complete",
          requestedRange: range,
          failedSeriesIds: [],
        };
      },
    },
    taskRead: {
      read: async ({ principal: owner, request }) => {
        events.push(`read:${owner.userId}:${request.type}`);
        return [task];
      },
    },
  };
}

describe("authenticated task query", () => {
  it("ensures the requested Coverage before reading materialized Tasks without scheduled prewarming", async () => {
    const events: string[] = [];
    // The focused query has no prewarming dependency; it owns the on-demand ensure.
    const query = createTaskQuery(principal, createDependencies(events));

    const result = await query.read({
      type: "upcoming",
      date: "2026-08-07",
      days: 2,
    });

    expect(events).toEqual([
      "coverage:2026-08-07:2026-08-09",
      "read:user-1:upcoming",
    ]);
    expect(result).toEqual({
      tasks: [task],
      completeness: {
        status: "complete",
        type: "complete",
        requestedRange: { from: "2026-08-07", to: "2026-08-09" },
        failedSeriesIds: [],
      },
    });
  });

  it("returns materialized Tasks with the shared partial Coverage fact", async () => {
    const events: string[] = [];
    const completeness = {
      status: "partial" as const,
      type: "partial" as const,
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: ["series-2", "series-1", "series-2"],
    };
    const dependencies: TaskQueryDependencies = {
      coverage: {
        ensure: async () => {
          events.push("coverage");
          return completeness;
        },
      },
      taskRead: {
        read: async () => {
          events.push("read");
          return [task];
        },
      },
    };

    const result = await createTaskQuery(principal, dependencies).read(
      { type: "today", date: "2026-08-07" },
      { onIncomplete: "return-available" },
    );

    expect(events).toEqual(["coverage", "read"]);
    expect(result).toEqual({ tasks: [task], completeness });
    expect(taskCoverageWarning(completeness)).toEqual({
      code: "recurring_coverage_unavailable",
      type: "coverage-unavailable",
      message: "Recurring task coverage is unavailable for the requested date range.",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: ["series-1", "series-2"],
    });
  });

  it("fails before reading materialized Tasks when AI requires complete Coverage", async () => {
    const events: string[] = [];
    const completeness = {
      status: "unavailable" as const,
      type: "unavailable" as const,
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: [],
      reason: "Coverage service unavailable",
    };
    const dependencies: TaskQueryDependencies = {
      coverage: {
        ensure: async () => {
          events.push("coverage");
          return completeness;
        },
      },
      taskRead: {
        read: async () => {
          events.push("read");
          return [task];
        },
      },
    };

    const result = await createTaskQuery(principal, dependencies).read(
      { type: "today", date: "2026-08-07" },
      { onIncomplete: "fail" },
    );

    expect(events).toEqual(["coverage"]);
    expect(result).toEqual({ tasks: [], completeness });
  });

  it("normalizes Coverage failures and leaves unbounded list reads materialized-only", async () => {
    const events: string[] = [];
    const dependencies: TaskQueryDependencies = {
      coverage: {
        ensure: async () => {
          events.push("coverage");
          throw new Error("coverage failed");
        },
      },
      taskRead: {
        read: async () => {
          events.push("read");
          return [task];
        },
      },
    };
    const query = createTaskQuery(principal, dependencies);

    const unavailable = await query.read({
      type: "overdue",
      date: "2026-08-07",
    });
    const list = await query.read({ type: "list" });

    expect(unavailable.completeness).toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: { from: "2026-08-07", to: "2026-08-07" },
      failedSeriesIds: [],
      reason: "Coverage could not be ensured",
    });
    expect(list).toEqual({ tasks: [task], completeness: null });
    expect(events).toEqual(["coverage", "read", "read"]);
  });
});
