import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockRpc,
  mockCreateSeries,
  mockReviseSeries,
  mockPauseSeries,
  mockResumeSeries,
  mockEndSeries,
  mockListSeries,
  mockCreateCapabilities,
  mockCapabilities,
  mockToRecurringTaskResponse,
  mockState,
  mockStateFactory,
} = vi.hoisted(() => {
  const state = {
    update: vi.fn(),
    pause: vi.fn(),
  };
  const mockCreateSeries = vi.fn();
  const mockReviseSeries = vi.fn();
  const mockPauseSeries = vi.fn();
  const mockResumeSeries = vi.fn();
  const mockEndSeries = vi.fn();
  const mockListSeries = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockCapabilities = {
    seriesCommands: {
      createSeries: mockCreateSeries,
      reviseSeries: mockReviseSeries,
      pauseSeries: mockPauseSeries,
      resumeSeries: mockResumeSeries,
      endSeries: mockEndSeries,
    },
    seriesQueries: { listSeries: mockListSeries },
    coverage: { ensure: vi.fn() },
  };

  return {
    mockRpc: vi.fn(),
    mockCreateSeries,
    mockReviseSeries,
    mockPauseSeries,
    mockResumeSeries,
    mockEndSeries,
    mockListSeries,
    mockCreateCapabilities,
    mockCapabilities,
    mockToRecurringTaskResponse: vi.fn(),
    mockState: state,
    mockStateFactory: vi.fn(() => state),
  };
});

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
  return {
    ...actual,
    toRecurringTaskResponse: mockToRecurringTaskResponse,
  };
});

function lifecycleSeries(id: string, status: "active" | "paused" | "ended" = "active") {
  const revision = {
    id: `${id}-revision`,
    seriesId: id,
    effectiveFrom: "2026-04-10",
    effectiveTo: null,
    state: status,
    recurrenceRule: { frequency: "daily", interval: 1 } as const,
    recurrenceAnchor: "2026-04-10",
    activationDate: "2026-04-10",
    defaults: {
      title: "Daily standup",
      description: null,
      priority: 0 as const,
      categoryId: null,
      dueTime: null,
    },
    createdAt: "2026-04-10T00:00:00.000Z",
  };
  return {
    id,
    userId: "user-123",
    status,
    timeZone: "America/Toronto",
    recurrenceAnchor: "2026-04-10",
    activationDate: "2026-04-10",
    occurrenceLimit: null,
    lastScheduledDate: null,
    coverageHorizon: "2026-04-17",
    currentRevisionId: revision.id,
    revisionToken: 1,
    revisions: [revision],
    occurrences: [],
    intentionalAbsences: [],
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function capabilitySeries(id: string, status: "active" | "paused" | "ended" = "active") {
  const { userId: _userId, revisionToken: _revisionToken, ...projection } = lifecycleSeries(id, status);
  return {
    ...projection,
    version: "rt-series-v1.test-version",
  };
}

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: { rpc: mockRpc } as unknown as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return taskTools().find((t) => t.name === name)!;
}

describe("recurring task tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCapabilities.mockReturnValue(mockCapabilities);
    mockRpc.mockImplementation(async (_name, request) => {
      if (request?.p_request?.operationKey === "missing") {
        return { data: { status: "not-found", type: "not-found" }, error: null };
      }
      if (request?.p_operation === "list-series") {
        return {
          data: { series: [lifecycleSeries("rt1")] },
          error: null,
        };
      }
      return {
        data: {
          status: "complete",
          type: "complete",
          series: lifecycleSeries("rt1"),
          value: lifecycleSeries("rt1"),
          occurrences: [],
          intentionalAbsences: [],
        },
        error: null,
      };
    });
    mockToRecurringTaskResponse.mockReturnValue({
      id: "rt2",
      title: "Daily standup",
    });
    mockListSeries.mockResolvedValue({
      type: "listed",
      operation: "recurring-task.series.list",
      series: [capabilitySeries("rt1")],
    });
    mockCreateSeries.mockResolvedValue({
      type: "created",
      status: "complete",
      operation: "recurring-task.series.create",
      operationId: "ai-operation-1",
      series: capabilitySeries("rt1"),
    });
    mockReviseSeries.mockResolvedValue({
      type: "revised",
      status: "complete",
      operation: "recurring-task.series.revise",
      operationId: "ai-revise-1",
      series: capabilitySeries("rt1"),
    });
    mockPauseSeries.mockResolvedValue({
      type: "paused",
      status: "complete",
      operation: "recurring-task.series.pause",
      operationId: "ai-pause-1",
      series: capabilitySeries("rt1", "paused"),
    });
    mockResumeSeries.mockResolvedValue({
      type: "resumed",
      status: "complete",
      operation: "recurring-task.series.resume",
      operationId: "ai-resume-1",
      series: capabilitySeries("rt1"),
    });
    mockEndSeries.mockResolvedValue({
      type: "ended",
      status: "complete",
      operation: "recurring-task.series.end",
      operationId: "ai-end-1",
      series: capabilitySeries("rt1", "ended"),
    });
    mockState.update.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: { id: "rt1", title: "Updated title" },
    });
    mockState.pause.mockResolvedValue({
      status: "complete",
      type: "complete",
      recurringTask: { id: "rt1", status: "paused" },
    });
    mockPauseSeries.mockResolvedValue({
      type: "paused",
      status: "complete",
      operation: "recurring-task.series.pause",
      operationId: "pause-1",
      series: capabilitySeries("rt1", "paused"),
    });
    mockResumeSeries.mockResolvedValue({
      type: "resumed",
      status: "complete",
      operation: "recurring-task.series.resume",
      operationId: "resume-1",
      series: capabilitySeries("rt1", "active"),
    });
    mockEndSeries.mockResolvedValue({
      type: "ended",
      status: "complete",
      operation: "recurring-task.series.end",
      operationId: "end-1",
      series: capabilitySeries("rt1", "ended"),
    });
  });

  it("taskTools includes recurring task tools", () => {
    const tools = taskTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("getRecurringTasks");
    expect(names).toContain("createRecurringTask");
    expect(names).toContain("updateRecurringTask");
    expect(names).toContain("pauseRecurringTask");
    expect(names).toContain("deleteRecurringTask");
  });

  it("getRecurringTasks reads through the authenticated query capability", async () => {
    const ctx = makeCtx();
    const result = await findTool("getRecurringTasks").execute(
      { status: "active" },
      ctx,
    );
    expect(mockListSeries).toHaveBeenCalledWith({ status: "active" });
    expect(mockToRecurringTaskResponse.mock.calls[0]).toEqual([
      expect.objectContaining({ id: "rt1", status: "active" }),
      "user-123",
    ]);
    expect(mockCreateCapabilities).toHaveBeenCalledWith({
      supabase: expect.anything(),
      principal: {
        type: "user",
        userId: "user-123",
        credential: "mcp",
      },
    });
    expect(result).toEqual([{ id: "rt2", title: "Daily standup" }]);
  });

  it("createRecurringTask propagates the caller operation ID through the command capability", async () => {
    const ctx = makeCtx();
    const result = await findTool("createRecurringTask").execute(
      {
        operationId: "ai-operation-1",
        title: "Daily standup",
        startDate: "2026-04-10",
        recurrenceRule: { frequency: "daily", interval: 1 },
      },
      ctx,
    );
    expect(mockCreateSeries).toHaveBeenCalledWith(expect.objectContaining({
      operationId: "ai-operation-1",
      recurrenceAnchor: "2026-04-10",
      activationDate: "2026-04-10",
      coverage: { from: "2026-04-10", to: "2026-04-17" },
    }));
    expect(mockCreateSeries.mock.calls[0]?.[0]).not.toHaveProperty("userId");
    expect(mockToRecurringTaskResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rt1" }),
      "user-123",
    );
    expect(result).toEqual({ id: "rt2", title: "Daily standup" });
  });

  it("updateRecurringTask routes a revision with operation identity and version", async () => {
    const ctx = makeCtx();
    await findTool("updateRecurringTask").execute(
      {
        operationId: "ai-revise-1",
        recurringTaskId: "rt1",
        version: "rt-series-v1.test-version",
        effectiveDate: "2026-04-11",
        title: "Updated title",
      },
      ctx,
    );
    expect(mockReviseSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "ai-revise-1",
        seriesId: "rt1",
        version: "rt-series-v1.test-version",
        effectiveDate: "2026-04-11",
        defaults: { title: "Updated title" },
      }),
    );
  });

  it("pauseRecurringTask calls the pause capability", async () => {
    const ctx = makeCtx();
    await findTool("pauseRecurringTask").execute(
      {
        operationId: "ai-pause-1",
        recurringTaskId: "rt1",
        version: "rt-series-v1.test-version",
      },
      ctx,
    );
    expect(mockPauseSeries).toHaveBeenCalledWith({
      operationId: "ai-pause-1",
      seriesId: "rt1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-04-10",
    });
  });

  it("resumeRecurringTask passes its effective date and coverage to the capability", async () => {
    const ctx = makeCtx();
    await findTool("resumeRecurringTask").execute(
      {
        operationId: "ai-resume-1",
        recurringTaskId: "rt1",
        version: "rt-series-v1.test-version",
        effectiveDate: "2026-04-12",
      },
      ctx,
    );
    expect(mockResumeSeries).toHaveBeenCalledWith({
      operationId: "ai-resume-1",
      seriesId: "rt1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-04-12",
      coverage: { from: "2026-04-12", to: "2026-04-19" },
    });
  });

  it("deleteRecurringTask ends a series through the capability", async () => {
    const ctx = makeCtx();
    const result = await findTool("deleteRecurringTask").execute(
      {
        operationId: "ai-end-1",
        recurringTaskId: "rt1",
        version: "rt-series-v1.test-version",
        effectiveDate: "2026-04-10",
      },
      ctx,
    );
    expect(mockEndSeries).toHaveBeenCalledWith({
      operationId: "ai-end-1",
      seriesId: "rt1",
      version: "rt-series-v1.test-version",
      effectiveDate: "2026-04-10",
    });
    expect(result).toEqual({ success: true });
  });

  it("deleteRecurringTask returns error when not found", async () => {
    const ctx = makeCtx();
    mockEndSeries.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "recurring-task.series.end",
      operationId: "ai-missing-end",
    });
    const result = await findTool("deleteRecurringTask").execute(
      {
        operationId: "missing",
        recurringTaskId: "rt999",
        version: "rt-series-v1.test-version",
      },
      ctx,
    );
    expect(result).toEqual({ error: "Recurring task not found" });
  });
});
