import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/recurring-tasks/route";
import { NextRequest } from "next/server";

const {
  mockEnsureProfile,
  mockCreateSeries,
  mockListSeries,
  mockCreateCapabilities,
  mockToRecurringTaskResponse,
  mockCapabilities,
} = vi.hoisted(() => {
  const mockListSeries = vi.fn();
  const mockCreateSeries = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockCapabilities = {
    seriesCommands: { createSeries: mockCreateSeries },
    seriesQueries: { listSeries: mockListSeries },
    coverage: { ensure: vi.fn() },
  };
  return {
    mockEnsureProfile: vi.fn(),
    mockCreateSeries,
    mockListSeries,
    mockCreateCapabilities,
    mockToRecurringTaskResponse: vi.fn(),
    mockCapabilities,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return {
    ...actual,
    createAuthenticatedRecurringTaskCapabilities: mockCreateCapabilities,
  };
});

vi.mock("@/lib/recurring-tasks/compatibility", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks/compatibility")>(
    "@/lib/recurring-tasks/compatibility",
  );
  return {
    ...actual,
    toRecurringTaskResponse: mockToRecurringTaskResponse,
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
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockToRecurringTaskResponse.mockImplementation((series) => series);
  });

  it("should return recurring tasks for authenticated user", async () => {
    const mockTemplates = [
      { id: "rt-1", user_id: "user-123", title: "Daily standup" },
    ];
    mockListSeries.mockResolvedValue({
      type: "listed",
      operation: "recurring-task.series.list",
      series: mockTemplates,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_tasks).toEqual(mockTemplates);
    expect(mockListSeries).toHaveBeenCalledWith({ status: undefined });
  });

  it("should filter by status query param", async () => {
    mockListSeries.mockResolvedValue({
      type: "listed",
      operation: "recurring-task.series.list",
      series: [],
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks?status=paused",
    );
    await GET(request);

    expect(mockListSeries).toHaveBeenCalledWith({ status: "paused" });
  });

  it("should ignore invalid status param", async () => {
    mockListSeries.mockResolvedValue({
      type: "listed",
      operation: "recurring-task.series.list",
      series: [],
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks?status=invalid",
    );
    await GET(request);

    expect(mockListSeries).toHaveBeenCalledWith({ status: undefined });
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

  it("maps a typed list validation failure", async () => {
    mockListSeries.mockResolvedValue({
      type: "validation",
      status: "validation",
      operation: "recurring-task.series.list",
      reason: "invalid-query",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
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
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockCreateSeries.mockResolvedValue({
      type: "created",
      status: "complete",
      operation: "recurring-task.series.create",
      operationId: "operation-1",
      series: {},
    });
    mockToRecurringTaskResponse.mockImplementation((series) => series);
  });

  it("should create a recurring task with valid body", async () => {
    const created = { id: "rt-1", title: "Read daily" };
    mockToRecurringTaskResponse.mockReturnValue(created);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        headers: { "Idempotency-Key": "operation-1" },
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
        operationId: "operation-1",
        defaults: expect.objectContaining({ title: "Read daily" }),
        recurrenceAnchor: "2026-02-01",
        activationDate: "2026-02-01",
      }),
    );
  });

  it("requires a caller-supplied operation ID", async () => {
    mockCreateSeries.mockResolvedValue({
      type: "validation",
      status: "validation",
      operation: "recurring-task.series.create",
      operationId: "",
      field: "operationId",
      reason: "Operation ID is required",
    });
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

    expect(response.status).toBe(400);
    expect(mockCreateSeries).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "" }),
    );
  });

  it("maps typed capability failures without inspecting error text", async () => {
    mockCreateSeries.mockResolvedValue({
      type: "conflict",
      status: "conflict",
      operation: "recurring-task.series.create",
      operationId: "operation-1",
      reason: "private database detail",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        headers: { "Idempotency-Key": "operation-1" },
        body: JSON.stringify({
          title: "Read daily",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Recurring task creation conflict",
    });
  });

  it("returns the authoritative Series on an idempotent replay", async () => {
    const replayed = { id: "rt-1", title: "Read daily", version: "opaque" };
    mockCreateSeries.mockResolvedValue({
      type: "created",
      status: "already-applied",
      operation: "recurring-task.series.create",
      operationId: "operation-1",
      series: replayed,
    });
    mockToRecurringTaskResponse.mockReturnValue(replayed);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        headers: { "Idempotency-Key": "operation-1" },
        body: JSON.stringify({
          title: "Read daily",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-02-01",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recurring_task: replayed });
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
    mockToRecurringTaskResponse.mockReturnValue({ id: "rt-1" });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks",
      {
        method: "POST",
        headers: { "Idempotency-Key": "operation-1" },
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
