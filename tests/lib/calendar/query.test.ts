import { describe, expect, it, vi } from "vitest";

import {
  createCalendarQuery,
  type CalendarQueryDependencies,
} from "@/lib/calendar/query";
import type { CalendarOverlayReadCapabilities } from "@/lib/calendar/overlay-feed";
import type { Habit, Task } from "@/lib/db/types";

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

const habit = {
  id: "habit-1",
  name: "Read",
  frequency: { type: "daily" },
} as Habit;

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
    const coverage = vi.fn(async (range: { from: string; to: string }) => {
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

  it("suppresses partial Task data while preserving an independently successful Habit layer", async () => {
    const read = vi.fn().mockResolvedValue([task]);
    const activeHabits = vi.fn().mockResolvedValue([habit]);
    const completionLogs = vi.fn().mockResolvedValue([]);
    const completeness = {
      status: "partial" as const,
      type: "partial" as const,
      requestedRange: { from: "2026-04-01", to: "2026-04-07" },
      failedSeriesIds: ["series-2"],
    };
    const result = await createCalendarQuery(principal, {
      coverage: { ensure: vi.fn().mockResolvedValue(completeness) },
      overlay: overlayCapabilities({
        read: { read },
        habits: {
          activeHabits: { read: activeHabits },
          completionLogs: { read: completionLogs },
        },
      }),
    }).read({
      range: completeness.requestedRange,
      layers: ["tasks", "habits"],
    });

    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "degraded",
      items: expect.arrayContaining([expect.objectContaining({
        id: "habits:habit-1:2026-04-01",
        layer: "habits",
      })]),
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: ["series-2"],
      }],
      completeness,
    });
    expect(result.status).not.toBe("complete");
  });

  it("classifies unavailable Coverage as a failed task projection", async () => {
    const read = vi.fn();
    const result = await createCalendarQuery(principal, {
      coverage: {
        ensure: vi.fn().mockResolvedValue({
          status: "unavailable",
          type: "unavailable",
          requestedRange: { from: "2026-04-01", to: "2026-04-07" },
          failedSeriesIds: [],
          reason: "Coverage could not be ensured.",
        }),
      },
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
      reason: "Coverage could not be ensured.",
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
      from: "2026-01-01",
      to: "2026-02-11",
    }, expect.any(Function));
  });

  it("does not request recurring-task Coverage when the task Calendar Layer is not selected", async () => {
    const ensure = vi.fn();

    const result = await createCalendarQuery(principal, {
      coverage: { ensure },
      overlay: overlayCapabilities(),
    }).read({
      range: { from: "2026-04-01", to: "2026-04-07" },
      layers: ["habits"],
    });

    expect(ensure).not.toHaveBeenCalled();
    expect(result.completeness).toBeNull();
    expect(result.status).toBe("complete");
  });

  it("reports an unexpected Coverage cause once through the shared observer without changing classification", async () => {
    const cause = new Error("private Coverage failure");
    const reportFailure = vi.fn(() => {
      throw new Error("reporter unavailable");
    });
    const ensure = vi.fn(async (
      range: { from: string; to: string },
      observe: (cause: unknown) => void,
    ) => {
      observe(cause);
      return {
        status: "unavailable" as const,
        type: "unavailable" as const,
        requestedRange: range,
        failedSeriesIds: [],
        reason: "Coverage could not be ensured.",
      };
    });

    const result = await createCalendarQuery(principal, {
      coverage: { ensure },
      overlay: overlayCapabilities(),
    }).read(
      {
        range: { from: "2026-04-01", to: "2026-04-07" },
        layers: ["tasks"],
      },
      { reportFailure },
    );

    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith({
      layer: "tasks",
      request: {
        userId: principal.userId,
        range: { from: "2026-04-01", to: "2026-04-07" },
      },
      cause,
    });
    expect(result.status).toBe("failed");
    expect(result.completeness).toMatchObject({ status: "unavailable" });
  });
});
