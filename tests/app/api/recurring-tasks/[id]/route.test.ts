import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";
import { NextRequest } from "next/server";

const {
  mockCreateTaskWrites,
  mockDeleteSeries,
  mockStateFactory,
  mockState,
} = vi.hoisted(() => {
  const mockDeleteSeries = vi.fn();
  const mockState = {
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return {
    mockCreateTaskWrites: vi.fn(() => ({ deleteSeries: mockDeleteSeries })),
    mockDeleteSeries,
    mockStateFactory: vi.fn(() => mockState),
    mockState,
  };
});

vi.mock("@/lib/tasks/writes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks/writes")>(
    "@/lib/tasks/writes",
  );
  return { ...actual, createTaskWrites: mockCreateTaskWrites };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

const mockRecurringTasksDB = {
  getRecurringTask: vi.fn(),
  updateRecurringTask: vi.fn(),
  pauseRecurringTask: vi.fn(),
  resumeRecurringTask: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  RecurringTasksDB: class {
    constructor() {
      return mockRecurringTasksDB;
    }
  },
}));

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return { ...actual, createSupabaseSeriesStateAdapter: mockStateFactory };
});

import { createClient } from "@/lib/supabase/server";

describe("GET /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should return template by ID", async () => {
    const template = { id: "rt-1", title: "Daily standup" };
    vi.mocked(mockRecurringTasksDB.getRecurringTask).mockResolvedValue(
      template,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(template);
    expect(mockRecurringTasksDB.getRecurringTask).toHaveBeenCalledWith(
      "rt-1",
      "user-123",
    );
  });

  it("should return 404 if not found", async () => {
    vi.mocked(mockRecurringTasksDB.getRecurringTask).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/nonexistent",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should update template with valid body", async () => {
    const updated = { id: "rt-1", title: "Updated" };
    mockState.update.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: updated,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(updated);
    expect(mockState.update).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: "rt-1", userId: "user-123" }),
    );
  });

  it("should handle pause action", async () => {
    const paused = { id: "rt-1", status: "paused" };
    mockState.pause.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: paused,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=pause",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(paused);
    expect(mockState.pause).toHaveBeenCalledWith({
      seriesId: "rt-1",
      userId: "user-123",
    });
  });

  it("should handle resume action", async () => {
    const resumed = { id: "rt-1", status: "active" };
    mockState.resume.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: resumed,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(resumed);
    expect(mockState.resume).toHaveBeenCalledWith({
      seriesId: "rt-1",
      userId: "user-123",
      effectiveDate: undefined,
      coverageThrough: undefined,
    });
  });

  it("passes an explicit resume date through as user intent", async () => {
    mockState.resume.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: { id: "rt-1", status: "active" },
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume&date=2026-02-17",
      { method: "PATCH" },
    );

    await PATCH(request, { params: Promise.resolve({ id: "rt-1" }) });

    expect(mockState.resume).toHaveBeenCalledWith({
      seriesId: "rt-1",
      userId: "user-123",
      effectiveDate: "2026-02-17",
      coverageThrough: "2026-02-24",
    });
  });

  it("should return 400 for invalid action", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=invalid",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/invalid action/i);
  });

  it("should return 400 on validation failure", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ priority: 99 }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(400);
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "X" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("should return 404 if resume fails with not found", async () => {
    vi.mocked(mockState.resume).mockRejectedValue(
      new Error("Recurring task not found"),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteSeries.mockResolvedValue({ type: "deleted" });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should delete template", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDeleteSeries).toHaveBeenCalledWith({
      seriesId: "rt-1",
      userId: "user-123",
    });
  });

  it("passes the validated effective date to Task Writes", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?date=2026-08-09",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockDeleteSeries).toHaveBeenCalledWith({
      seriesId: "rt-1",
      userId: "user-123",
      effectiveDate: "2026-08-09",
    });
  });

  it("maps a typed not-found deletion outcome to 404", async () => {
    mockDeleteSeries.mockResolvedValue({ type: "not-found" });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Recurring task not found" });
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("should return 500 on internal error", async () => {
    mockDeleteSeries.mockRejectedValue(new Error("fail"));

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(500);
  });
});
