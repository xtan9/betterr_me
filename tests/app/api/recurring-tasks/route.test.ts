import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/recurring-tasks/route";
import { NextRequest } from "next/server";

const { mockEnsureProfile, mockCreateSeries, mockToLegacyRecurringTask } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
  mockCreateSeries: vi.fn(),
  mockToLegacyRecurringTask: vi.fn(),
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

const mockRecurringTasksDB = {
  getUserRecurringTasks: vi.fn(),
  createRecurringTask: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  RecurringTasksDB: class {
    constructor() {
      return mockRecurringTasksDB;
    }
  },
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock("@/lib/recurring-tasks/creation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks/creation")>(
    "@/lib/recurring-tasks/creation",
  );
  return {
    ...actual,
    createSeriesCreation: vi.fn(() => ({ create: mockCreateSeries })),
    toLegacyRecurringTask: mockToLegacyRecurringTask,
  };
});

import { createClient } from "@/lib/supabase/server";

describe("GET /api/recurring-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockCreateSeries.mockResolvedValue({
      mode: "lifecycle",
      outcome: {
        status: "complete",
        type: "complete",
        series: {},
      },
    });
  });

  it("should return recurring tasks for authenticated user", async () => {
    const mockTemplates = [
      { id: "rt-1", user_id: "user-123", title: "Daily standup" },
    ];
    vi.mocked(mockRecurringTasksDB.getUserRecurringTasks).mockResolvedValue(
      mockTemplates,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_tasks).toEqual(mockTemplates);
    expect(mockRecurringTasksDB.getUserRecurringTasks).toHaveBeenCalledWith(
      "user-123",
      undefined,
    );
  });

  it("should filter by status query param", async () => {
    vi.mocked(mockRecurringTasksDB.getUserRecurringTasks).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks?status=paused",
    );
    await GET(request);

    expect(mockRecurringTasksDB.getUserRecurringTasks).toHaveBeenCalledWith(
      "user-123",
      { status: "paused" },
    );
  });

  it("should ignore invalid status param", async () => {
    vi.mocked(mockRecurringTasksDB.getUserRecurringTasks).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks?status=invalid",
    );
    await GET(request);

    expect(mockRecurringTasksDB.getUserRecurringTasks).toHaveBeenCalledWith(
      "user-123",
      undefined,
    );
  });

  it("should return 401 if not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("should return 500 on internal error", async () => {
    vi.mocked(mockRecurringTasksDB.getUserRecurringTasks).mockRejectedValue(
      new Error("DB fail"),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
    );
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});

describe("POST /api/recurring-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
    mockCreateSeries.mockResolvedValue({
      mode: "lifecycle",
      outcome: {
        status: "complete",
        type: "complete",
        series: {},
      },
    });
  });

  it("should create a recurring task with valid body", async () => {
    const created = { id: "rt-1", title: "Read daily" };
    mockToLegacyRecurringTask.mockReturnValue(created);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Read daily",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.recurring_task).toEqual(created);
    expect(mockCreateSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        title: "Read daily",
        legacyStartDate: "2026-02-01",
      }),
    );
  });

  it("should return 400 on validation failure (missing title)", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        body: JSON.stringify({
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("should return 400 on validation failure (missing recurrence_rule)", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Missing rule",
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("should return 401 if not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Task",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("should call ensureProfile before creating", async () => {
    mockToLegacyRecurringTask.mockReturnValue({ id: "rt-1" });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Task",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });
});
