import { describe, expect, it } from "vitest";

import {
  createDashboardQuery,
  type DashboardQueryDependencies,
} from "@/lib/dashboard/query";
import type { DashboardData } from "@/lib/db/types";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

const snapshot = {
  habits: [],
  tasks_today: [],
  tasks_tomorrow: [],
  milestones_today: [],
  stats: {
    total_habits: 0,
    completed_today: 0,
    current_best_streak: 0,
    total_tasks: 0,
    tasks_due_today: 0,
    tasks_completed_today: 0,
    last_workout_at: null,
    week_workout_count: 0,
  },
} satisfies DashboardData;

const range = { from: "2026-08-07", to: "2026-08-08" };

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
  coverage: DashboardQueryDependencies["coverage"] = {
    ensure: async () => completeCoverage(),
  },
): DashboardQueryDependencies {
  return {
    coverage,
    snapshot: {
      load: async ({ userId, date }) => {
        events.push(`read:${userId}:${date}`);
        return { status: "complete", snapshot };
      },
    },
  };
}

describe("authenticated dashboard query", () => {
  it("ensures Coverage before reading the materialized dashboard snapshot", async () => {
    const events: string[] = [];
    const query = createDashboardQuery(principal, {
      ...createDependencies(events),
      coverage: {
        ensure: async ({ range: requestedRange }) => {
          events.push(`coverage:${requestedRange.from}:${requestedRange.to}`);
          return completeCoverage();
        },
      },
    });

    const result = await query.read(
      { date: "2026-08-07" },
      { onIncomplete: "return-available" },
    );

    expect(events).toEqual([
      "coverage:2026-08-07:2026-08-08",
      "read:user-1:2026-08-07",
    ]);
    expect(result).toEqual({
      status: "complete",
      snapshot,
      completeness: completeCoverage(),
    });
  });

  it("returns available materialized data with structured partial Coverage", async () => {
    const events: string[] = [];
    const completeness = {
      status: "partial" as const,
      type: "partial" as const,
      requestedRange: range,
      failedSeriesIds: ["series-2", "series-1", "series-2"],
    };
    const query = createDashboardQuery(principal, createDependencies(events, {
      ensure: async () => {
        events.push("coverage");
        return completeness;
      },
    }));

    const result = await query.read(
      { date: "2026-08-07" },
      { onIncomplete: "return-available" },
    );

    expect(events).toEqual(["coverage", "read:user-1:2026-08-07"]);
    expect(result).toEqual({
      status: "degraded",
      snapshot,
      completeness,
      warnings: [{
        code: "recurring_coverage_unavailable",
        message:
          "Some recurring tasks may not appear because Coverage Horizon is unavailable for the requested range.",
        type: "coverage-unavailable",
        requestedRange: range,
        failedSeriesIds: ["series-1", "series-2"],
      }],
    });
  });

  it("returns available materialized data with unavailable Coverage", async () => {
    const events: string[] = [];
    const completeness = {
      status: "unavailable" as const,
      type: "unavailable" as const,
      requestedRange: range,
      failedSeriesIds: [],
      reason: "Coverage service unavailable",
    };
    const query = createDashboardQuery(principal, createDependencies(events, {
      ensure: async () => {
        events.push("coverage");
        return completeness;
      },
    }));

    const result = await query.read({ date: "2026-08-07" }, {
      onIncomplete: "return-available",
    });

    expect(events).toEqual(["coverage", "read:user-1:2026-08-07"]);
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") return;
    expect(result.snapshot).toBe(snapshot);
    expect(result.completeness).toEqual(completeness);
    expect(result.warnings).toEqual([{
      code: "recurring_coverage_unavailable",
      message:
        "Some recurring tasks may not appear because Coverage Horizon is unavailable for the requested range.",
      type: "coverage-unavailable",
      requestedRange: range,
      failedSeriesIds: [],
    }]);
  });

  it("normalizes thrown Coverage into unavailable completeness before reading", async () => {
    const events: string[] = [];
    const query = createDashboardQuery(principal, createDependencies(events, {
      ensure: async () => {
        events.push("coverage");
        throw new Error("coverage failed");
      },
    }));

    const result = await query.read({ date: "2026-08-07" }, {
      onIncomplete: "return-available",
    });

    expect(events).toEqual(["coverage", "read:user-1:2026-08-07"]);
    expect(result).toEqual({
      status: "degraded",
      snapshot,
      completeness: {
        status: "unavailable",
        type: "unavailable",
        requestedRange: range,
        failedSeriesIds: [],
        reason: "Coverage could not be ensured",
      },
      warnings: [{
        code: "recurring_coverage_unavailable",
        message:
          "Some recurring tasks may not appear because Coverage Horizon is unavailable for the requested range.",
        type: "coverage-unavailable",
        requestedRange: range,
        failedSeriesIds: [],
      }],
    });
  });

  it("can fail closed before the materialized read when delivery requires complete Coverage", async () => {
    const events: string[] = [];
    const completeness = {
      status: "partial" as const,
      type: "partial" as const,
      requestedRange: range,
      failedSeriesIds: ["series-1"],
    };
    const query = createDashboardQuery(principal, createDependencies(events, {
      ensure: async () => {
        events.push("coverage");
        return completeness;
      },
    }));

    const result = await query.read({ date: "2026-08-07" }, {
      onIncomplete: "fail",
    });

    expect(events).toEqual(["coverage"]);
    expect(result).toEqual({
      status: "failed",
      completeness,
      error: {
        code: "coverage_unavailable",
        message: "Recurring task coverage is temporarily unavailable.",
      },
    });
  });
});
