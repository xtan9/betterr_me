import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  httpSupabase,
  mockStateFactory,
  mockState,
  mockCreateCapabilities,
  mockPauseSeries,
  mockResumeSeries,
  mockEndSeries,
  mockToRecurringTaskResponse,
} = vi.hoisted(() => {
  const mockState = {
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    editScope: vi.fn(),
    getRecurringTask: vi.fn(),
  };
  const mockCreateCapabilities = vi.fn();
  const mockPauseSeries = vi.fn();
  const mockResumeSeries = vi.fn();
  const mockEndSeries = vi.fn();
  const mockToRecurringTaskResponse = vi.fn();
  return {
    httpSupabase: {},
    mockStateFactory: vi.fn(() => mockState),
    mockState,
    mockCreateCapabilities,
    mockPauseSeries,
    mockResumeSeries,
    mockEndSeries,
    mockToRecurringTaskResponse,
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
    createSupabaseSeriesStateAdapter: mockStateFactory,
    createAuthenticatedRecurringTaskCapabilities: mockCreateCapabilities,
  };
});

vi.mock("@/lib/recurring-tasks/compatibility", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks/compatibility")>(
    "@/lib/recurring-tasks/compatibility",
  );
  return { ...actual, toRecurringTaskResponse: mockToRecurringTaskResponse };
});

const recurringTask = {
  id: "series-1",
  title: "Daily review",
  status: "active",
};

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: {} as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Los_Angeles",
};

function success() {
  return { status: "complete", type: "complete", recurringTask } as const;
}

function commandSuccess(
  type: "paused" | "resumed" | "ended",
  operation: string,
  operationId: string,
) {
  return {
    type,
    status: "complete",
    operation,
    operationId,
    series: recurringTask,
  } as const;
}

function findTool(name: string) {
  return taskTools().find((tool) => tool.name === name)!;
}

describe("HTTP and AI Series State adapter parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCapabilities.mockReturnValue({
      seriesCommands: {
        pauseSeries: mockPauseSeries,
        resumeSeries: mockResumeSeries,
        endSeries: mockEndSeries,
      },
      seriesQueries: { getSeries: vi.fn() },
      coverage: { ensure: vi.fn() },
    });
    mockState.update.mockResolvedValue(success());
    mockState.pause.mockResolvedValue(success());
    mockState.resume.mockResolvedValue(success());
    mockState.editScope.mockResolvedValue({ status: "complete", type: "complete" });
    mockPauseSeries.mockResolvedValue(
      commandSuccess("paused", "recurring-task.series.pause", "pause-1"),
    );
    mockResumeSeries.mockResolvedValue(
      commandSuccess("resumed", "recurring-task.series.resume", "resume-1"),
    );
    mockEndSeries.mockResolvedValue(
      commandSuccess("ended", "recurring-task.series.end", "end-1"),
    );
    mockToRecurringTaskResponse.mockReturnValue(recurringTask);
  });

  it("maps product and AI Series Default edits to the same lifecycle meaning", async () => {
    const httpResponse = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?date=2026-08-05",
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Move review" }),
        },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    const aiResult = await findTool("updateRecurringTask").execute(
      {
        recurringTaskId: "series-1",
        title: "Move review",
        effectiveDate: "2026-08-05",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ recurring_task: recurringTask });
    expect(aiResult).toEqual(recurringTask);
    expect(mockState.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: "user-123",
      seriesId: "series-1",
      title: "Move review",
      effectiveDate: "2026-08-05",
    }));
    expect(mockState.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: "user-123",
      seriesId: "series-1",
      title: "Move review",
      effectiveDate: "2026-08-05",
      inferredDate: "2026-08-01",
      timezone: "America/Los_Angeles",
    }));
  });

  it("maps pause and resume dates consistently across product and AI", async () => {
    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=pause&date=2026-08-06",
        {
          method: "PATCH",
          headers: {
            "Idempotency-Key": "pause-1",
            "If-Match": "rt-series-v1.pause-version",
          },
        },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("pauseRecurringTask").execute(
      {
        recurringTaskId: "series-1",
        operationId: "pause-1",
        version: "rt-series-v1.pause-version",
        effectiveDate: "2026-08-06",
      },
      aiContext,
    );
    await PATCH(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?action=resume&date=2026-08-07",
        {
          method: "PATCH",
          headers: {
            "Idempotency-Key": "resume-1",
            "If-Match": "rt-series-v1.resume-version",
          },
        },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    await findTool("resumeRecurringTask").execute(
      {
        recurringTaskId: "series-1",
        operationId: "resume-1",
        version: "rt-series-v1.resume-version",
        effectiveDate: "2026-08-07",
      },
      aiContext,
    );

    expect(mockPauseSeries).toHaveBeenNthCalledWith(1, {
      operationId: "pause-1",
      seriesId: "series-1",
      version: "rt-series-v1.pause-version",
      effectiveDate: "2026-08-06",
    });
    expect(mockPauseSeries).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationId: "pause-1",
      seriesId: "series-1",
      version: "rt-series-v1.pause-version",
      effectiveDate: "2026-08-06",
    }));
    expect(mockResumeSeries).toHaveBeenCalledWith({
      operationId: "resume-1",
      seriesId: "series-1",
      version: "rt-series-v1.resume-version",
      effectiveDate: "2026-08-07",
      coverage: { from: "2026-08-07", to: "2026-08-14" },
    });
  });

  it("maps the product end path and AI confirmed end to one terminal command", async () => {
    const httpResponse = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/recurring-tasks/series-1?date=2026-08-09",
        {
          method: "DELETE",
          headers: {
            "Idempotency-Key": "end-1",
            "If-Match": "rt-series-v1.end-version",
          },
        },
      ),
      { params: Promise.resolve({ id: "series-1" }) },
    );
    const aiResult = await findTool("deleteRecurringTask").execute(
      {
        recurringTaskId: "series-1",
        operationId: "end-1",
        version: "rt-series-v1.end-version",
        effectiveDate: "2026-08-09",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ success: true });
    expect(aiResult).toEqual({ success: true });
    expect(mockEndSeries).toHaveBeenNthCalledWith(1, {
      operationId: "end-1",
      seriesId: "series-1",
      version: "rt-series-v1.end-version",
      effectiveDate: "2026-08-09",
    });
    expect(mockEndSeries).toHaveBeenNthCalledWith(2, {
      operationId: "end-1",
      seriesId: "series-1",
      version: "rt-series-v1.end-version",
      effectiveDate: "2026-08-09",
    });
  });
});
