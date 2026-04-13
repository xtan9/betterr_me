import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/calendar/feed/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUserEvents = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/db", () => ({
  CalendarEventsDB: class {
    getUserEvents = mockGetUserEvents;
  },
}));

vi.mock("@/lib/calendar/recurrence", () => ({
  expandEventsForRange: vi.fn((events: unknown[]) => events),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// A chainable builder whose terminal methods (non-`single`) resolve to { data, error }.
function createMockQuery(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const thenable: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "neq", "gte", "lte", "not"];
  for (const m of chainMethods) {
    thenable[m] = vi.fn(() => thenable);
  }
  thenable.single = vi.fn(() => ({
    data: Array.isArray(result.data) ? (result.data as unknown[])[0] ?? null : result.data ?? null,
    error: result.error ?? null,
  }));
  // Make awaiting the chain yield { data, error }
  (thenable as any).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? [], error: result.error ?? null });
  return thenable;
}

let mockFromHandlers: Record<string, ReturnType<typeof createMockQuery>> = {};

const mockSupabase = {
  auth: {
    getUser: vi.fn(() => ({
      data: { user: { id: "user-123", email: "test@example.com" } },
    })),
  },
  from: vi.fn((table: string) => {
    if (mockFromHandlers[table]) return mockFromHandlers[table];
    return createMockQuery();
  }),
};

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/calendar/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromHandlers = {};
    mockGetUserEvents.mockResolvedValue([]);
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);
    mockSupabase.auth.getUser.mockReturnValue({
      data: { user: { id: "user-123", email: "test@example.com" } },
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockReturnValue({
      data: { user: null },
    } as never);

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when start_date is missing", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?end_date=2026-04-07&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("start_date");
  });

  it("returns 400 when end_date is missing", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026/04/01&end_date=2026-04-07&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("YYYY-MM-DD");
  });

  it("returns 400 for invalid layers", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=events,bogus",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid layers");
    expect(body.error).toContain("bogus");
  });

  it("returns events when events layer is enabled", async () => {
    mockGetUserEvents.mockResolvedValue([
      {
        id: "evt-1",
        user_id: "user-123",
        title: "Meeting",
        start_date: "2026-04-01",
        start_time: "09:00:00",
        end_date: "2026-04-01",
        end_time: "10:00:00",
        description: null,
        location: null,
        color: null,
        category_id: null,
        is_recurring: false,
        recurrence_rule: null,
        end_type: null,
        end_date_recurrence: null,
        end_count: null,
        recurring_event_id: null,
        original_date: null,
        is_exception: false,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
        is_virtual: false,
      },
    ]);

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].domain).toBe("events");
    expect(body.items[0].title).toBe("Meeting");
  });

  it("returns empty items for no enabled layers", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("defaults layers to events when not specified", async () => {
    mockGetUserEvents.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockGetUserEvents).toHaveBeenCalled();
  });

  it("fetches tasks when tasks layer enabled", async () => {
    mockFromHandlers.tasks = createMockQuery({
      data: [
        {
          id: "task-1",
          user_id: "user-123",
          title: "Do laundry",
          due_date: "2026-04-02",
          due_time: null,
          completed: false,
          category_id: null,
        },
      ],
      error: null,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.some((i: { domain: string }) => i.domain === "tasks")).toBe(true);
  });

  it("reports partial failure when tasks query errors", async () => {
    mockFromHandlers.tasks = createMockQuery({
      data: null,
      error: { message: "boom" },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toEqual(["tasks"]);
  });

  it("fetches habits + logs when habits layer enabled", async () => {
    mockFromHandlers.habits = createMockQuery({
      data: [
        {
          id: "h-1",
          user_id: "user-123",
          name: "Meditate",
          frequency: { type: "daily" },
          status: "active",
          created_at: "2026-01-01",
        },
      ],
      error: null,
    });
    mockFromHandlers.habit_logs = createMockQuery({
      data: [
        { habit_id: "h-1", logged_date: "2026-04-02", completed: true },
      ],
      error: null,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=habits",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toBeUndefined();
  });

  it("reports partial failure when habits query errors", async () => {
    mockFromHandlers.habits = createMockQuery({
      data: null,
      error: { message: "boom" },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=habits",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toEqual(["habits"]);
  });

  it("returns empty bills when user has no household", async () => {
    // household_members.single returns null
    mockFromHandlers.household_members = createMockQuery({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=bills",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.partialFailures).toBeUndefined();
  });

  it("fetches bills when user has a household", async () => {
    mockFromHandlers.household_members = createMockQuery({
      data: [{ household_id: "hh-1" }],
      error: null,
    });
    mockFromHandlers.recurring_bills = createMockQuery({
      data: [],
      error: null,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=bills",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toBeUndefined();
  });

  it("reports partial failure when bills query errors", async () => {
    mockFromHandlers.household_members = createMockQuery({
      data: [{ household_id: "hh-1" }],
      error: null,
    });
    mockFromHandlers.recurring_bills = createMockQuery({
      data: null,
      error: { message: "boom" },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=bills",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toEqual(["bills"]);
  });

  it("fetches workouts when workouts layer enabled", async () => {
    mockFromHandlers.workouts = createMockQuery({
      data: [],
      error: null,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=workouts&timezone=UTC",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toBeUndefined();
  });

  it("reports partial failure when workouts query errors", async () => {
    mockFromHandlers.workouts = createMockQuery({
      data: null,
      error: { message: "boom" },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=workouts",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partialFailures).toEqual(["workouts"]);
  });

  it("returns 500 when createClient throws", async () => {
    vi.mocked(createClient).mockRejectedValueOnce(new Error("db down") as never);

    const req = new NextRequest(
      "http://localhost:3000/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-07&layers=events",
    );
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch calendar feed");
  });
});
