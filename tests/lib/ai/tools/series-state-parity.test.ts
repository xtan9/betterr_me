import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  httpSupabase,
  mockProfileMaybeSingle,
  mockReviseSeries,
  mockPauseSeries,
  mockResumeSeries,
  mockEndSeries,
  mockCreateCapabilities,
  mockCapabilities,
  mockToRecurringTaskResponse,
  recurringTask,
} = vi.hoisted(() => {
  const recurringTask = {
    id: "series-1",
    title: "Daily review",
    status: "active",
  };
  const mockReviseSeries = vi.fn();
  const mockPauseSeries = vi.fn();
  const mockResumeSeries = vi.fn();
  const mockEndSeries = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockCapabilities = {
    seriesCommands: {
      reviseSeries: mockReviseSeries,
      pauseSeries: mockPauseSeries,
      resumeSeries: mockResumeSeries,
      endSeries: mockEndSeries,
    },
    seriesQueries: { getSeries: vi.fn() },
    coverage: { ensure: vi.fn() },
  };
  const mockProfileMaybeSingle = vi.fn();
  const httpSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mockProfileMaybeSingle })),
      })),
    })),
  };
  return {
    httpSupabase,
    mockProfileMaybeSingle,
    mockReviseSeries,
    mockPauseSeries,
    mockResumeSeries,
    mockEndSeries,
    mockCreateCapabilities,
    mockCapabilities,
    mockToRecurringTaskResponse: vi.fn(() => recurringTask),
    recurringTask,
  };
});

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: vi.fn(async () => ({
    ok: true,
    principal: { userId: "user-123", credential: "cookie", profile: {} },
    client: httpSupabase,
  })),
  cookieRouteErrorMessage: vi.fn(() => "Authentication required"),
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

const version = "rt-series-v1.parity-version";
const headers = (operationId: string) => ({
  "Idempotency-Key": operationId,
  "If-Match": version,
});

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: httpSupabase as unknown as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Los_Angeles",
};

function findTool(name: string) {
  return taskTools().find((tool) => tool.name === name)!;
}

describe("HTTP and AI Series capability parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-08-01T12:00:00.000Z") });
    mockProfileMaybeSingle.mockResolvedValue({
      data: { timezone: "America/Los_Angeles" },
      error: null,
    });
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockReviseSeries.mockResolvedValue({
      status: "complete",
      type: "revised",
      series: recurringTask,
    });
    mockPauseSeries.mockResolvedValue({
      status: "complete",
      type: "paused",
      series: recurringTask,
    });
    mockResumeSeries.mockResolvedValue({
      status: "complete",
      type: "resumed",
      series: recurringTask,
    });
    mockEndSeries.mockResolvedValue({
      status: "complete",
      type: "ended",
      series: recurringTask,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps Series Default edits to one canonical revision command", async () => {
    const httpResponse = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?date=2026-08-05",
        {
          method: "PATCH",
          headers: headers("parity-revise"),
          body: JSON.stringify({ title: "Move review" }),
        },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    const aiResult = await findTool("updateRecurringTask").execute(
      {
        operationId: "parity-revise",
        recurringTaskId: "series-1",
        version,
        title: "Move review",
        effectiveDate: "2026-08-05",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ recurring_task: recurringTask });
    expect(aiResult).toEqual(recurringTask);
    expect(mockReviseSeries).toHaveBeenNthCalledWith(1, {
      operationId: "parity-revise",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-05",
      defaults: { title: "Move review" },
    });
    expect(mockReviseSeries).toHaveBeenNthCalledWith(2, {
      operationId: "parity-revise",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-05",
      defaults: { title: "Move review" },
    });
  });

  it("maps pause and resume dates to the same typed commands", async () => {
    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=pause&date=2026-08-06",
        { method: "PATCH", headers: headers("parity-pause") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("pauseRecurringTask").execute(
      {
        operationId: "parity-pause",
        recurringTaskId: "series-1",
        version,
        effectiveDate: "2026-08-06",
      },
      aiContext,
    );
    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=resume&date=2026-08-07",
        { method: "PATCH", headers: headers("parity-resume") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("resumeRecurringTask").execute(
      {
        operationId: "parity-resume",
        recurringTaskId: "series-1",
        version,
        effectiveDate: "2026-08-07",
      },
      aiContext,
    );

    expect(mockPauseSeries).toHaveBeenNthCalledWith(1, {
      operationId: "parity-pause",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-06",
    });
    expect(mockPauseSeries).toHaveBeenNthCalledWith(2, {
      operationId: "parity-pause",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-06",
    });
    expect(mockResumeSeries).toHaveBeenNthCalledWith(1, {
      operationId: "parity-resume",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-07",
      coverage: { from: "2026-08-07", to: "2026-08-14" },
    });
    expect(mockResumeSeries).toHaveBeenNthCalledWith(2, {
      operationId: "parity-resume",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-07",
      coverage: { from: "2026-08-07", to: "2026-08-14" },
    });
  });

  it("resolves omitted pause and resume dates to the same reference date", async () => {
    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=pause",
        { method: "PATCH", headers: headers("omitted-pause") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("pauseRecurringTask").execute(
      {
        operationId: "omitted-pause",
        recurringTaskId: "series-1",
        version,
      },
      aiContext,
    );

    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=resume",
        { method: "PATCH", headers: headers("omitted-resume") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("resumeRecurringTask").execute(
      {
        operationId: "omitted-resume",
        recurringTaskId: "series-1",
        version,
      },
      aiContext,
    );

    expect(mockPauseSeries).toHaveBeenNthCalledWith(1, {
      operationId: "omitted-pause",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
    });
    expect(mockPauseSeries).toHaveBeenNthCalledWith(2, {
      operationId: "omitted-pause",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
    });
    expect(mockResumeSeries).toHaveBeenNthCalledWith(1, {
      operationId: "omitted-resume",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
      coverage: { from: "2026-08-01", to: "2026-08-08" },
    });
    expect(mockResumeSeries).toHaveBeenNthCalledWith(2, {
      operationId: "omitted-resume",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
      coverage: { from: "2026-08-01", to: "2026-08-08" },
    });
  });

  it("maps product end and AI confirmation to one terminal command", async () => {
    const httpResponse = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?date=2026-08-09",
        { method: "DELETE", headers: headers("parity-end") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    const aiResult = await findTool("deleteRecurringTask").execute(
      {
        operationId: "parity-end",
        recurringTaskId: "series-1",
        version,
        effectiveDate: "2026-08-09",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ success: true });
    expect(aiResult).toEqual({ success: true });
    expect(mockEndSeries).toHaveBeenNthCalledWith(1, {
      operationId: "parity-end",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-09",
    });
    expect(mockEndSeries).toHaveBeenNthCalledWith(2, {
      operationId: "parity-end",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-09",
    });
  });

  it("resolves an omitted end date identically across HTTP and AI", async () => {
    const httpResponse = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1",
        { method: "DELETE", headers: headers("omitted-end") },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    const aiResult = await findTool("deleteRecurringTask").execute(
      {
        operationId: "omitted-end",
        recurringTaskId: "series-1",
        version,
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(aiResult).toEqual({ success: true });
    expect(mockEndSeries).toHaveBeenNthCalledWith(1, {
      operationId: "omitted-end",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
    });
    expect(mockEndSeries).toHaveBeenNthCalledWith(2, {
      operationId: "omitted-end",
      seriesId: "series-1",
      version,
      effectiveDate: "2026-08-01",
    });
  });
});
