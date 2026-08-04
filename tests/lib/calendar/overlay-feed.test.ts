import { describe, expect, it, vi } from "vitest";

import {
  queryCalendarOverlayFeed,
  type TaskOverlayCapabilities,
} from "@/lib/calendar/overlay-feed";
import type { Task } from "@/lib/db/types";

const request = {
  userId: "user-1",
  range: { from: "2026-04-01", to: "2026-04-07" },
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Review calendar",
    description: null,
    is_completed: false,
    priority: 1,
    category_id: null,
    due_date: "2026-04-02",
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "open",
    section: "today",
    sort_order: 0,
    project_id: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...overrides,
  } as Task;
}

function capabilities(overrides: Partial<TaskOverlayCapabilities> = {}): TaskOverlayCapabilities {
  return {
    coverage: { ensureThrough: vi.fn().mockResolvedValue({ status: "complete" }) },
    read: { read: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("queryCalendarOverlayFeed", () => {
  it("ensures coverage through the inclusive requested end before reading tasks", async () => {
    const order: string[] = [];
    const caps = capabilities({
      coverage: { ensureThrough: vi.fn(async (value) => {
        order.push(`coverage:${value.range.to}`);
        return { status: "complete" as const };
      }) },
      read: { read: vi.fn(async () => {
        order.push("read");
        return [task()];
      }) },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(order).toEqual(["coverage:2026-04-07", "read"]);
    expect(result.status).toBe("complete");
  });

  it("skips task reads and reports exactly one stable coverage diagnostic", async () => {
    const read = vi.fn();
    const caps = capabilities({
      coverage: {
        ensureThrough: vi.fn().mockResolvedValue({
          status: "partial",
          failedSeriesIds: ["series-2", "series-2"],
        }),
      },
      read: { read },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(read).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{
        layer: "tasks",
        code: "recurring_coverage_unavailable",
        failedSeriesIds: ["series-2"],
      }],
    });
  });

  it("classifies a coverage port failure as recurring coverage unavailable", async () => {
    const reportFailure = vi.fn();
    const read = vi.fn();
    const caps = capabilities({
      coverage: { ensureThrough: vi.fn().mockRejectedValue(new Error("coverage down")) },
      read: { read },
    });

    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      caps,
      { reportFailure },
    );

    expect(read).not.toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(result.unavailable).toEqual([{
      layer: "tasks",
      code: "recurring_coverage_unavailable",
      failedSeriesIds: [],
    }]);
  });

  it("reports a generic task acquisition failure once without exposing its cause", async () => {
    const cause = new Error("secret database details");
    const reportFailure = vi.fn();
    const caps = capabilities({
      read: { read: vi.fn().mockRejectedValue(cause) },
    });

    const result = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      caps,
      { reportFailure },
    );

    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      layer: "tasks",
      cause,
      request,
    }));
    expect(JSON.stringify(result)).not.toContain("secret database details");
    expect(result).toEqual({
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    });
  });

  it("returns a successful empty task result and a typed completion action", async () => {
    const caps = capabilities({
      read: { read: vi.fn().mockResolvedValue([task(), task({
        id: "task-2",
        title: "Timed task",
        due_time: "09:00:00",
      })]) },
    });

    const result = await queryCalendarOverlayFeed({ ...request, layers: ["tasks"] }, caps);

    expect(result.status).toBe("complete");
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "tasks:task-1",
        layer: "tasks",
        kind: "task",
        action: { type: "toggle_task_completion", taskId: "task-1" },
      }),
      expect.objectContaining({
        id: "tasks:task-2",
        action: { type: "toggle_task_completion", taskId: "task-2" },
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty("actions");
    expect(result.items[0]).not.toHaveProperty("meta");

    const empty = await queryCalendarOverlayFeed(
      { ...request, layers: ["tasks"] },
      capabilities(),
    );
    expect(empty).toEqual({ status: "complete", items: [], unavailable: [] });
  });
});
