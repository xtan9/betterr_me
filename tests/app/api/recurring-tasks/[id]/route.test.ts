import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";

const {
  mockReviseSeries,
  mockPauseSeries,
  mockResumeSeries,
  mockEndSeries,
  mockGetSeriesQuery,
  mockCreateCapabilities,
  mockCapabilities,
  mockToRecurringTaskResponse,
} = vi.hoisted(() => {
  const mockReviseSeries = vi.fn();
  const mockPauseSeries = vi.fn();
  const mockResumeSeries = vi.fn();
  const mockEndSeries = vi.fn();
  const mockGetSeriesQuery = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockCapabilities = {
    seriesCommands: {
      reviseSeries: mockReviseSeries,
      pauseSeries: mockPauseSeries,
      resumeSeries: mockResumeSeries,
      endSeries: mockEndSeries,
    },
    seriesQueries: { getSeries: mockGetSeriesQuery },
    coverage: { ensure: vi.fn() },
  };
  return {
    mockReviseSeries,
    mockPauseSeries,
    mockResumeSeries,
    mockEndSeries,
    mockGetSeriesQuery,
    mockCreateCapabilities,
    mockCapabilities,
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

const mutationHeaders = (operationId: string) => ({
  "Idempotency-Key": operationId,
  "If-Match": "rt-series-v1.test-version",
});

describe("GET /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockToRecurringTaskResponse.mockImplementation((series) => series);
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("returns a template by ID through the query capability", async () => {
    const template = { id: "rt-1", title: "Daily standup" };
    mockGetSeriesQuery.mockResolvedValue({
      type: "found",
      operation: "recurring-task.series.get",
      series: template,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1"),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recurring_task: template });
    expect(mockGetSeriesQuery).toHaveBeenCalledWith({ seriesId: "rt-1" });
  });

  it("maps typed detail failures without inspecting error text", async () => {
    mockGetSeriesQuery.mockResolvedValue({
      status: "conflict",
      type: "conflict",
      operation: "recurring-task.series.get",
      reason: "private database detail",
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1"),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Recurring task operation conflict",
    });
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } } )) },
    } as any);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1"),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockToRecurringTaskResponse.mockImplementation((series) => series);
    mockReviseSeries.mockResolvedValue({
      status: "complete",
      type: "revised",
      series: { id: "rt-1", title: "Updated" },
    });
    mockPauseSeries.mockResolvedValue({
      status: "complete",
      type: "paused",
      series: { id: "rt-1", status: "paused" },
    });
    mockResumeSeries.mockResolvedValue({
      status: "complete",
      type: "resumed",
      series: { id: "rt-1", status: "active" },
    });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("routes effective-dated definition edits through the revise capability", async () => {
    const updated = { id: "rt-1", title: "Updated" };
    mockReviseSeries.mockResolvedValue({
      status: "complete",
      type: "revised",
      series: updated,
    });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?date=2026-08-07", {
        method: "PATCH",
        headers: mutationHeaders("http-operation-1"),
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recurring_task: updated });
    expect(mockReviseSeries).toHaveBeenCalledWith({
      operationId: "http-operation-1",
      seriesId: "rt-1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-08-07",
      defaults: { title: "Updated" },
    });
  });

  it("routes pause and resume actions through typed capabilities", async () => {
    await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?action=pause", {
        method: "PATCH",
        headers: mutationHeaders("http-pause-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?action=resume&date=2026-08-08", {
        method: "PATCH",
        headers: mutationHeaders("http-resume-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(mockPauseSeries).toHaveBeenCalledWith({
      operationId: "http-pause-1",
      seriesId: "rt-1",
      version: "rt-series-v1.test-version",
    });
    expect(mockResumeSeries).toHaveBeenCalledWith({
      operationId: "http-resume-1",
      seriesId: "rt-1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-08-08",
      coverage: { from: "2026-08-08", to: "2026-08-15" },
    });
  });

  it("maps typed command conflicts and not-found results", async () => {
    mockPauseSeries.mockResolvedValue({
      status: "conflict",
      type: "conflict",
      operation: "recurring-task.series.pause",
      operationId: "http-conflict-1",
    });

    const conflictResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?action=pause", {
        method: "PATCH",
        headers: mutationHeaders("http-conflict-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(conflictResponse.status).toBe(409);

    mockPauseSeries.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "recurring-task.series.pause",
      operationId: "http-not-found-1",
    });
    const notFoundResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?action=pause", {
        method: "PATCH",
        headers: mutationHeaders("http-not-found-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(notFoundResponse.status).toBe(404);
  });

  it("rejects invalid actions, dates, and bodies", async () => {
    const invalidAction = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?action=invalid", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(invalidAction.status).toBe(400);

    const invalidDate = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?date=nope", {
        method: "PATCH",
        headers: mutationHeaders("http-invalid-date-1"),
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(invalidDate.status).toBe(400);

    const invalidBody = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?date=2026-08-07", {
        method: "PATCH",
        headers: mutationHeaders("http-invalid-body-1"),
        body: JSON.stringify({ priority: 99 }),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(invalidBody.status).toBe(400);
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } } )) },
    } as any);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1", {
        method: "PATCH",
        headers: mutationHeaders("http-unauthenticated-1"),
        body: JSON.stringify({ title: "X" }),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockEndSeries.mockResolvedValue({
      status: "complete",
      type: "ended",
      series: { id: "rt-1", status: "ended" },
    });
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("ends a series through the capability with operation identity and version", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1?date=2026-08-09", {
        method: "DELETE",
        headers: mutationHeaders("http-end-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockEndSeries).toHaveBeenCalledWith({
      operationId: "http-end-1",
      seriesId: "rt-1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-08-09",
    });
  });

  it("maps typed not-found outcomes and internal errors", async () => {
    mockEndSeries.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "recurring-task.series.end",
      operationId: "http-delete-not-found-1",
    });
    const notFound = await DELETE(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1", {
        method: "DELETE",
        headers: mutationHeaders("http-delete-not-found-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(notFound.status).toBe(404);

    mockEndSeries.mockRejectedValue(new Error("fail"));
    const internalError = await DELETE(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1", {
        method: "DELETE",
        headers: mutationHeaders("http-delete-error-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );
    expect(internalError.status).toBe(500);
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } } )) },
    } as any);

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/recurring-tasks/rt-1", {
        method: "DELETE",
        headers: mutationHeaders("http-delete-unauthenticated-1"),
      }),
      { params: Promise.resolve({ id: "rt-1" }) },
    );

    expect(response.status).toBe(401);
  });
});
