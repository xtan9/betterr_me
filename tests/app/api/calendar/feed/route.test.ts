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

// Mock Supabase client with chainable query builder
function createMockQuery(data: unknown[] = []) {
  const query: Record<string, unknown> = {};
  const methods = ["select", "eq", "neq", "gte", "lte", "not", "single"];
  for (const method of methods) {
    query[method] = vi.fn(() => query);
  }
  // Terminal: `single()` returns data/error, other terminal is the chain itself
  // For array queries, the chain resolves by reading .data
  (query as Record<string, unknown>).data = data;
  (query as Record<string, unknown>).error = null;

  // Override `single` to return a single record
  query.single = vi.fn(() => ({
    data: data[0] ?? null,
    error: data.length === 0 ? { code: "PGRST116" } : null,
  }));

  // Make the chain thenable for select queries that return arrays
  // Actually, Supabase returns { data, error } at the end of the chain
  // We need to intercept the chain to return properly
  return query;
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
    // Should have called getUserEvents since 'events' is default
    expect(mockGetUserEvents).toHaveBeenCalled();
  });
});
