import { describe, expect, it, vi } from "vitest";

import {
  createCalendarQuery,
  type CalendarQueryDependencies,
} from "@/lib/calendar/query";
import type { CalendarOverlayReadCapabilities } from "@/lib/calendar/overlay-feed";
import type { Task } from "@/lib/db/types";

const principal = {
  type: "user" as const,
  userId: "user-1",
  credential: "cookie" as const,
};

const task = {
  id: "task-1",
  title: "Review calendar",
  due_date: "2026-04-02",
  due_time: null,
  is_completed: false,
} as Task;

function overlayCapabilities(
  overrides: Partial<CalendarOverlayReadCapabilities> = {},
): CalendarOverlayReadCapabilities {
  return {
    read: { read: vi.fn().mockResolvedValue([]) },
    habits: {
      activeHabits: { read: vi.fn().mockResolvedValue([]) },
      completionLogs: { read: vi.fn().mockResolvedValue([]) },
    },
    workouts: { read: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("authenticated calendar query", () => {
  it("ensures the requested Coverage before reading materialized Task Occurrences", async () => {
    const events: string[] = [];
    const coverage = vi.fn(async ({ range }: { range: { from: string; to: string } }) => {
      events.push(`coverage:${range.from}:${range.to}`);
      return {
        status: "complete" as const,
        type: "complete" as const,
        requestedRange: range,
        failedSeriesIds: [] as [],
      };
    });
    const read = vi.fn(async () => {
      events.push("read");
      return [task];
    });
    const dependencies: CalendarQueryDependencies = {
      coverage: { ensure: coverage },
      overlay: overlayCapabilities({ read: { read } }),
    };

    const result = await createCalendarQuery(principal, dependencies).read({
      range: { from: "2026-04-01", to: "2026-04-07" },
      layers: ["tasks"],
    });

    expect(events).toEqual(["coverage:2026-04-01:2026-04-07", "read"]);
    expect(result).toEqual({
      status: "complete",
      items: [expect.objectContaining({ id: "tasks:task-1" })],
      unavailable: [],
      completeness: {
        status: "complete",
        type: "complete",
        requestedRange: { from: "2026-04-01", to: "2026-04-07" },
        failedSeriesIds: [],
      },
    });
  });

  it("preserves partial Coverage as a degraded task layer and never reports complete", async () => {
    const read = vi.fn().mockResolvedValue([task]);
    const completeness = {
      status: "partial" as const,
      type: "partial" as const,
      requestedRange: { from: "2026-04-01", to: "2026-04-07" },
      failedSeriesIds: ["series-2"],
    };
    const result = await createCalendarQuery(principal, {
      coverage: { ensure: vi.fn().mockResolvedValue(completeness) },
      overlay: overlayCapabilities({ read: { read } }),
    }).read({
      range: completeness.requestedRange,
      layers: ["tasks", "habits"],
    });

    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "degraded",
      items: [],
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: ["series-2"],
      }],
      completeness,
    });
    expect(result.status).not.toBe("complete");
  });

  it("maps an unavailable Coverage exception to a failed task projection", async () => {
    const read = vi.fn();
    const result = await createCalendarQuery(principal, {
      coverage: { ensure: vi.fn().mockRejectedValue(new Error("coverage unavailable")) },
      overlay: overlayCapabilities({ read: { read } }),
    }).read({
      range: { from: "2026-04-01", to: "2026-04-07" },
      layers: ["tasks"],
    });

    expect(read).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(result.completeness).toEqual({
      status: "unavailable",
      type: "unavailable",
      requestedRange: { from: "2026-04-01", to: "2026-04-07" },
      failedSeriesIds: [],
      reason: "Coverage could not be ensured",
    });
    expect(result.unavailable).toEqual([{
      layer: "tasks",
      code: "recurring_coverage_unavailable",
      failedSeriesIds: [],
    }]);
  });

  it("requires an authenticated user principal and preserves the exact inclusive boundary", async () => {
    expect(() => createCalendarQuery({
      type: "service",
      serviceId: "service-1",
      credential: "adminSecret",
    } as never, {
      coverage: { ensure: vi.fn() },
      overlay: overlayCapabilities(),
    })).toThrow("An authenticated user principal is required");

    const ensure = vi.fn().mockResolvedValue({
      status: "complete" as const,
      type: "complete" as const,
      requestedRange: { from: "2026-01-01", to: "2026-02-11" },
      failedSeriesIds: [] as [],
    });
    await createCalendarQuery(principal, {
      coverage: { ensure },
      overlay: overlayCapabilities(),
    }).read({
      range: { from: "2026-01-01", to: "2026-02-11" },
      layers: ["tasks"],
    });
    expect(ensure).toHaveBeenCalledWith({
      principal,
      range: { from: "2026-01-01", to: "2026-02-11" },
    });
  });
});
