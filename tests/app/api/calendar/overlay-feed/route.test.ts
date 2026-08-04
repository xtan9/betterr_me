import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticateRequest, queryCalendarOverlayFeed, createCapabilities, logError } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  queryCalendarOverlayFeed: vi.fn(),
  createCapabilities: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest,
  cookieRouteErrorMessage: (error: { status: number }) => error.status === 401 ? "Unauthorized" : "Server misconfigured",
}));
vi.mock("@/lib/calendar/overlay-feed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calendar/overlay-feed")>("@/lib/calendar/overlay-feed");
  return { ...actual, queryCalendarOverlayFeed };
});
vi.mock("@/lib/calendar/supabase-overlay-feed", () => ({
  createSupabaseTaskOverlayCapabilities: createCapabilities,
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
    createCapabilities.mockReturnValue({});
    queryCalendarOverlayFeed.mockResolvedValue({
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
    expect(queryCalendarOverlayFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        range: { from: "2026-04-01", to: "2026-04-07" },
        layers: ["tasks"],
      }),
      {},
      expect.any(Object),
    );
    expect(await response.json()).toEqual({ items: [] });
  });

  it("does not put Calendar Events in the overlay response", async () => {
    queryCalendarOverlayFeed.mockResolvedValueOnce({
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
    queryCalendarOverlayFeed.mockResolvedValueOnce({
      status: "failed",
      items: [],
      unavailable: [{ layer: "tasks", code: "unavailable" }],
    });

    const response = await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ items: [], unavailableLayers: ["tasks"] });
  });

  it("rejects ranges that are reversed, too long, or invalid", async () => {
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-07&end_date=2026-04-01&layers=tasks"))).status).toBe(400);
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-05-14&layers=tasks"))).status).toBe(400);
    expect((await GET(request("/api/calendar/overlay-feed?start_date=2026-02-30&end_date=2026-03-01&layers=tasks"))).status).toBe(400);
  });
});
