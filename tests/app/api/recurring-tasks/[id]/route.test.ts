import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";
import { NextRequest } from "next/server";

const {
  mockStateFactory,
  mockState,
  mockPauseSeries,
  mockResumeSeries,
  mockEndSeries,
  mockGetSeriesQuery,
  mockCreateCapabilities,
  mockCapabilities,
  mockLifecycle,
  mockToRecurringTaskResponse,
} = vi.hoisted(() => {
  const mockGetSeries = vi.fn();
  const mockGetSeriesQuery = vi.fn();
  const mockState = {
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  const mockPauseSeries = vi.fn();
  const mockResumeSeries = vi.fn();
  const mockEndSeries = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockCapabilities = {
    seriesCommands: {
      pauseSeries: mockPauseSeries,
      resumeSeries: mockResumeSeries,
      endSeries: mockEndSeries,
    },
    seriesQueries: { getSeries: mockGetSeriesQuery },
    coverage: { ensure: vi.fn() },
  };
  return {
    mockStateFactory: vi.fn(() => mockState),
    mockState,
    mockPauseSeries,
    mockResumeSeries,
    mockEndSeries,
    mockGetSeries,
    mockGetSeriesQuery,
    mockCreateCapabilities,
    mockCapabilities,
    mockLifecycle: { getSeries: mockGetSeries },
    mockToRecurringTaskResponse: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return {
    ...actual,
    createSupabaseSeriesStateAdapter: mockStateFactory,
    createActivatedRecurringTaskLifecycle: vi.fn(() => mockLifecycle),
    createAuthenticatedRecurringTaskCapabilities: mockCreateCapabilities,
  };
});

vi.mock("@/lib/recurring-tasks/compatibility", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/recurring-tasks/compatibility")
  >("@/lib/recurring-tasks/compatibility");
  return {
    ...actual,
    toRecurringTaskResponse: mockToRecurringTaskResponse,
  };
});

import { createClient } from "@/lib/supabase/server";

describe("GET /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockToRecurringTaskResponse.mockImplementation((series) => series);
    mockPauseSeries.mockResolvedValue({
      type: "paused",
      status: "complete",
      operation: "recurring-task.series.pause",
      operationId: "pause-op",
      series: { id: "rt-1", status: "paused" },
    });
    mockResumeSeries.mockResolvedValue({
      type: "resumed",
      status: "complete",
      operation: "recurring-task.series.resume",
      operationId: "resume-op",
      series: { id: "rt-1", status: "active" },
    });
    mockEndSeries.mockResolvedValue({
      type: "ended",
      status: "complete",
      operation: "recurring-task.series.end",
      operationId: "end-op",
      series: { id: "rt-1", status: "ended" },
    });
  });

  it("should return template by ID", async () => {
    const template = { id: "rt-1", title: "Daily standup" };
    mockGetSeriesQuery.mockResolvedValue({
      type: "found",
      operation: "recurring-task.series.get",
      series: template,
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(template);
    expect(mockGetSeriesQuery).toHaveBeenCalledWith({ seriesId: "rt-1" });
  });

  it("should return 404 if not found", async () => {
    mockGetSeriesQuery.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "recurring-task.series.get",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/nonexistent",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });

  it("maps typed detail query failures without inspecting error text", async () => {
    mockGetSeriesQuery.mockResolvedValue({
      status: "conflict",
      type: "conflict",
      operation: "recurring-task.series.get",
      reason: "private database detail",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Recurring task operation conflict",
    });
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
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
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
      {
        method: "PATCH",
        headers: {
          "Idempotency-Key": "pause-op-1",
          "If-Match": "rt-series-v1.pause-version",
        },
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(paused);
    expect(mockPauseSeries).toHaveBeenCalledWith({
      operationId: "pause-op-1",
      seriesId: "rt-1",
      version: "rt-series-v1.pause-version",
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
      {
        method: "PATCH",
        headers: {
          "Idempotency-Key": "resume-op-1",
          "If-Match": "rt-series-v1.resume-version",
        },
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(resumed);
    expect(mockResumeSeries).toHaveBeenCalledWith({
      operationId: "resume-op-1",
      seriesId: "rt-1",
      version: "rt-series-v1.resume-version",
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
      {
        method: "PATCH",
        headers: {
          "Idempotency-Key": "resume-op-2",
          "If-Match": "rt-series-v1.resume-version",
        },
      },
    );

    await PATCH(request, { params: Promise.resolve({ id: "rt-1" }) });

    expect(mockResumeSeries).toHaveBeenCalledWith({
      operationId: "resume-op-2",
      seriesId: "rt-1",
      version: "rt-series-v1.resume-version",
      effectiveDate: "2026-02-17",
      coverage: { from: "2026-02-17", to: "2026-02-24" },
    });
  });

  it("maps missing command metadata to a typed validation response", async () => {
    mockPauseSeries.mockResolvedValue({
      type: "validation",
      status: "validation",
      operation: "recurring-task.series.pause",
      field: "operationId",
      reason: "Operation ID is required",
    });

    const response = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/rt-1?action=pause",
        { method: "PATCH" },
      ),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Operation ID is required" });
    expect(mockState.pause).not.toHaveBeenCalled();
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
    vi.mocked(mockResumeSeries).mockRejectedValue(
      new Error("Recurring task not found"),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume",
      {
        method: "PATCH",
        headers: {
          "Idempotency-Key": "resume-op-3",
          "If-Match": "rt-series-v1.resume-version",
        },
      },
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
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockEndSeries.mockResolvedValue({
      type: "ended",
      status: "complete",
      operation: "recurring-task.series.end",
      operationId: "end-op",
      series: { id: "rt-1", status: "ended" },
    });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should delete template", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "end-op-1",
          "If-Match": "rt-series-v1.end-version",
        },
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockEndSeries).toHaveBeenCalledWith({
      operationId: "end-op-1",
      seriesId: "rt-1",
      version: "rt-series-v1.end-version",
    });
  });

  it("passes the validated effective date to Task Writes", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?date=2026-08-09",
      {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "end-op-2",
          "If-Match": "rt-series-v1.end-version",
        },
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockEndSeries).toHaveBeenCalledWith({
      operationId: "end-op-2",
      seriesId: "rt-1",
      version: "rt-series-v1.end-version",
      effectiveDate: "2026-08-09",
    });
  });

  it("maps a typed not-found deletion outcome to 404", async () => {
    mockEndSeries.mockResolvedValue({
      type: "not-found",
      status: "not-found",
      operation: "recurring-task.series.end",
      operationId: "end-op-3",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "end-op-3",
          "If-Match": "rt-series-v1.end-version",
        },
      },
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
    mockEndSeries.mockRejectedValue(new Error("fail"));

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "end-op-4",
          "If-Match": "rt-series-v1.end-version",
        },
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(500);
  });
});
