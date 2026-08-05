import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticateRequest, querySupabaseCalendarOverlayFeed, logError } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  querySupabaseCalendarOverlayFeed: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest,
  cookieRouteErrorMessage: (error: { status: number }) => error.status === 401 ? "Unauthorized" : "Server misconfigured",
}));
vi.mock("@/lib/calendar/supabase-overlay-feed", () => ({
  querySupabaseCalendarOverlayFeed,
}));
vi.mock("@/lib/logger", () => ({ log: { error: logError } }));

import { GET } from "@/app/api/calendar/overlay-feed/route";

const client = { from: vi.fn() };

function request(url: string) {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe("GET /api/calendar/overlay-feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequest.mockResolvedValue({
      ok: true,
      principal: { type: "user", userId: "user-1", credential: "cookie" },
      client,
    });
    querySupabaseCalendarOverlayFeed.mockResolvedValue({
      status: "complete",
      items: [],
      unavailable: [],
    });
  });

  it("requires authentication and inclusive local-date task requests", async () => {
    authenticateRequest.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks"))).status).toBe(401);

    const response = await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks"));
    expect(response.status).toBe(200);
    expect(querySupabaseCalendarOverlayFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        range: { from: "2026-04-01", to: "2026-04-07" },
        layers: ["tasks"],
      }),
      client,
      expect.any(Object),
    );
    const options = querySupabaseCalendarOverlayFeed.mock.calls[0][2];
    const cause = new Error("database unavailable");
    options.reportFailure({
      layer: "tasks",
      request: {
        userId: "user-1",
        range: { from: "2026-04-01", to: "2026-04-07" },
      },
      cause,
    });
    expect(logError).toHaveBeenCalledWith(
      "Calendar overlay layer acquisition failed",
      cause,
      {
        layer: "tasks",
        userId: "user-1",
        from: "2026-04-01",
        to: "2026-04-07",
      },
    );
    expect(await response.json()).toEqual({ items: [] });
  });

  it("accepts habits/workouts alone and combined task/habit/workout selections", async () => {
    await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=habits"));
    expect(querySupabaseCalendarOverlayFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ layers: ["habits"] }),
      client,
      expect.any(Object),
    );

    await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks,habits"));
    expect(querySupabaseCalendarOverlayFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ layers: ["tasks", "habits"] }),
      client,
      expect.any(Object),
    );

    await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=workouts&timezone=America%2FLos_Angeles"));
    expect(querySupabaseCalendarOverlayFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ layers: ["workouts"], timezone: "America/Los_Angeles" }),
      client,
      expect.any(Object),
    );
  });

  it("deduplicates and canonicalizes selected overlay layers before querying", async () => {
    await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=workouts,tasks,workouts,habits,tasks"));

    expect(querySupabaseCalendarOverlayFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ layers: ["tasks", "habits", "workouts"] }),
      client,
      expect.any(Object),
    );
  });

  it("does not put Calendar Events in the overlay response", async () => {
    querySupabaseCalendarOverlayFeed.mockResolvedValueOnce({
      status: "complete",
      items: [{
        layer: "tasks",
        kind: "task",
        id: "tasks:task-1",
        taskId: "task-1",
        title: "Task",
        date: "2026-04-02",
        startTime: null,
        endTime: null,
        allDay: true,
        completed: false,
        action: { type: "toggle_task_completion", taskId: "task-1" },
      }],
      unavailable: [],
    });

    const body = await (await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks"))).json();
    expect(body.items[0].layer).toBe("tasks");
    expect(body.items[0]).not.toHaveProperty("events");
  });

  it("maps unavailable acquisition without exposing raw error text", async () => {
    querySupabaseCalendarOverlayFeed.mockResolvedValueOnce({
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    });

    const response = await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ items: [], unavailableLayers: ["tasks"] });
  });

  it("returns a degraded response with successful items and an unavailable habit layer", async () => {
    querySupabaseCalendarOverlayFeed.mockResolvedValueOnce({
      status: "degraded",
      items: [{
        layer: "tasks",
        kind: "task",
        id: "tasks:task-1",
        taskId: "task-1",
        title: "Task",
        date: "2026-04-02",
        startTime: null,
        endTime: null,
        allDay: true,
        completed: false,
        action: { type: "toggle_task_completion", taskId: "task-1" },
      }],
      unavailable: [{ layer: "habits", code: "unavailable" }],
    });

    const response = await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks,habits"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [expect.objectContaining({ id: "tasks:task-1" })],
      unavailableLayers: ["habits"],
    });
  });

  it("rejects ranges that are reversed, too long, or invalid", async () => {
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-07&end_date=2026-04-01&layers=tasks"))).status).toBe(400);
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-05-14&layers=tasks"))).status).toBe(400);
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-02-30&end_date=2026-03-01&layers=tasks"))).status).toBe(400);
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=workouts&timezone=Not%2FAZone"))).status).toBe(400);
  });
});
