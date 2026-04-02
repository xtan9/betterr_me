import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/calendar/feed/route";
import { NextRequest } from "next/server";

// --- Hoisted mocks ---

const {
  mockGetUserEvents,
  mockGetUserTasks,
  mockGetActiveHabits,
  mockGetAllUserLogs,
  mockGetByHousehold,
  mockGetWorkouts,
  mockResolveHousehold,
} = vi.hoisted(() => ({
  mockGetUserEvents: vi.fn(),
  mockGetUserTasks: vi.fn(),
  mockGetActiveHabits: vi.fn(),
  mockGetAllUserLogs: vi.fn(),
  mockGetByHousehold: vi.fn(),
  mockGetWorkouts: vi.fn(),
  mockResolveHousehold: vi.fn(),
}));

const { mockExpandEventsForRange } = vi.hoisted(() => ({
  mockExpandEventsForRange: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  CalendarEventsDB: class {
    getUserEvents = mockGetUserEvents;
  },
  TasksDB: class {
    getUserTasks = mockGetUserTasks;
  },
  HabitsDB: class {
    getActiveHabits = mockGetActiveHabits;
  },
  HabitLogsDB: class {
    getAllUserLogs = mockGetAllUserLogs;
  },
  RecurringBillsDB: class {
    getByHousehold = mockGetByHousehold;
  },
  WorkoutsDB: class {
    getWorkouts = mockGetWorkouts;
  },
}));

vi.mock("@/lib/db/households", () => ({
  HouseholdsDB: class {
    resolveHousehold = mockResolveHousehold;
  },
}));

vi.mock("@/lib/calendar/recurrence", () => ({
  expandEventsForRange: mockExpandEventsForRange,
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/calendar/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as never);

    // Default responses
    mockGetUserEvents.mockResolvedValue([]);
    mockExpandEventsForRange.mockReturnValue([]);
    mockGetUserTasks.mockResolvedValue([]);
    mockGetActiveHabits.mockResolvedValue([]);
    mockGetAllUserLogs.mockResolvedValue([]);
    mockResolveHousehold.mockResolvedValue("hh-1");
    mockGetByHousehold.mockResolvedValue([]);
    mockGetWorkouts.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as never);

    const req = new NextRequest(
      "http://localhost/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-30",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when start_date or end_date is missing", async () => {
    const req = new NextRequest("http://localhost/api/calendar/feed");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const req = new NextRequest(
      "http://localhost/api/calendar/feed?start_date=2026-4-1&end_date=2026-04-30",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns items from all domains", async () => {
    const mockEvent = {
      id: "evt-1",
      user_id: "user-123",
      title: "Meeting",
      start_date: "2026-04-01",
      start_time: "10:00:00",
      end_date: "2026-04-01",
      end_time: "11:00:00",
      is_virtual: false,
      is_recurring: false,
      color: null,
      location: null,
      description: null,
    };

    mockGetUserEvents.mockResolvedValue([]);
    mockExpandEventsForRange.mockReturnValue([mockEvent]);
    mockGetUserTasks.mockResolvedValue([
      {
        id: "task-1",
        title: "Buy groceries",
        due_date: "2026-04-01",
        due_time: null,
        is_completed: false,
        priority: 0,
      },
    ]);
    mockGetActiveHabits.mockResolvedValue([
      {
        id: "habit-1",
        name: "Run",
        frequency: { type: "daily" },
        status: "active",
      },
    ]);
    mockGetAllUserLogs.mockResolvedValue([]);
    mockGetByHousehold.mockResolvedValue([
      {
        id: "bill-1",
        name: "Netflix",
        next_due_date: "2026-04-05",
        amount_cents: 1599,
        is_active: true,
        user_status: "auto",
      },
    ]);
    mockGetWorkouts.mockResolvedValue([
      {
        id: "workout-1",
        title: "Push Day",
        started_at: "2026-04-01T08:00:00Z",
        duration_seconds: 3600,
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-30",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThan(0);

    // Check we have items from multiple sources
    const sources = new Set(body.items.map((i: { source: string }) => i.source));
    expect(sources.has("event")).toBe(true);
    expect(sources.has("task")).toBe(true);
    expect(sources.has("workout")).toBe(true);
  });

  it("filters by layers parameter", async () => {
    mockGetUserEvents.mockResolvedValue([]);
    mockExpandEventsForRange.mockReturnValue([
      {
        id: "evt-1",
        title: "Meeting",
        start_date: "2026-04-01",
        start_time: "10:00:00",
        end_date: "2026-04-01",
        end_time: "11:00:00",
        is_virtual: false,
        is_recurring: false,
        color: null,
        location: null,
        description: null,
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-30&layers=event",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Only event domain should be queried
    expect(mockGetUserEvents).toHaveBeenCalled();
    expect(mockGetUserTasks).not.toHaveBeenCalled();
    expect(mockGetActiveHabits).not.toHaveBeenCalled();
    expect(mockGetWorkouts).not.toHaveBeenCalled();
  });

  it("handles bill fetch failure gracefully", async () => {
    mockResolveHousehold.mockRejectedValue(new Error("No household"));

    const req = new NextRequest(
      "http://localhost/api/calendar/feed?start_date=2026-04-01&end_date=2026-04-30",
    );
    const res = await GET(req);
    // Should still succeed — bills are optional
    expect(res.status).toBe(200);
  });
});
