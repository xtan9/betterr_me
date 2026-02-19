import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockGetHabitsWithTodayStatus, mockGetTodayTasks } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockGetHabitsWithTodayStatus: vi.fn(),
    mockGetTodayTasks: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
  },
  TasksDB: class {
    getTodayTasks = mockGetTodayTasks;
  },
}));

describe("GET /api/sidebar/counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const request = new NextRequest(
      "http://localhost/api/sidebar/counts?date=2026-02-17"
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns correct counts", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockGetHabitsWithTodayStatus.mockResolvedValue([
      { id: "h1", completed_today: true },
      { id: "h2", completed_today: false },
      { id: "h3", completed_today: false },
    ]);
    mockGetTodayTasks.mockResolvedValue([
      { id: "t1", title: "Task 1", is_completed: false },
      { id: "t2", title: "Task 2", is_completed: false },
      { id: "t3", title: "Task 3", is_completed: true },
    ]);

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const request = new NextRequest(
      "http://localhost/api/sidebar/counts?date=2026-02-17"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ habits_incomplete: 2, tasks_due: 2 });
  });

  it("returns zero counts when all complete", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockGetHabitsWithTodayStatus.mockResolvedValue([
      { id: "h1", completed_today: true },
      { id: "h2", completed_today: true },
    ]);
    mockGetTodayTasks.mockResolvedValue([]);

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const request = new NextRequest(
      "http://localhost/api/sidebar/counts?date=2026-02-17"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ habits_incomplete: 0, tasks_due: 0 });
  });

  it("returns 500 on database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockGetHabitsWithTodayStatus.mockRejectedValue(new Error("DB error"));

    const { GET } = await import("@/app/api/sidebar/counts/route");
    const request = new NextRequest(
      "http://localhost/api/sidebar/counts?date=2026-02-17"
    );
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch sidebar counts");
  });
});
