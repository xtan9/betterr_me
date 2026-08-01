import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockRpc,
  mockToRecurringTaskCompatibility,
  mockState,
  mockStateFactory,
} = vi.hoisted(() => {
  const state = {
    update: vi.fn(),
    pause: vi.fn(),
  };

  return {
    mockRpc: vi.fn(),
    mockToRecurringTaskCompatibility: vi.fn(),
    mockState: state,
    mockStateFactory: vi.fn(() => state),
  };
});

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return { ...actual, createSupabaseSeriesStateAdapter: mockStateFactory };
});

vi.mock("@/lib/recurring-tasks/creation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks/creation")>(
    "@/lib/recurring-tasks/creation",
  );
  return {
    ...actual,
    toRecurringTaskCompatibility: mockToRecurringTaskCompatibility,
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
    mockToRecurringTaskCompatibility.mockReturnValue({
      id: "rt2",
      title: "Daily standup",
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

  it("getRecurringTasks reads lifecycle Series and translates at the adapter", async () => {
    const ctx = makeCtx();
    const result = await findTool("getRecurringTasks").execute(
      { status: "active" },
      ctx,
    );
    expect(mockRpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "list-series",
      p_request: { userId: "user-123", status: "active" },
    });
    expect(mockToRecurringTaskCompatibility.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ id: "rt1", status: "active" }),
    );
    expect(result).toEqual([{ id: "rt2", title: "Daily standup" }]);
  });

  it("createRecurringTask uses the shared initial coverage window", async () => {
    const ctx = makeCtx();
    const result = await findTool("createRecurringTask").execute(
      {
        title: "Daily standup",
        startDate: "2026-04-10",
        recurrenceRule: { frequency: "daily", interval: 1 },
      },
      ctx,
    );
    expect(mockRpc).toHaveBeenCalledWith(
      "recurring_task_lifecycle",
      expect.objectContaining({
        p_operation: "create-series",
        p_request: expect.objectContaining({
          userId: "user-123",
          recurrenceAnchor: "2026-04-10",
          activationDate: "2026-04-10",
          coverage: { from: "2026-04-10", to: "2026-04-17" },
        }),
      }),
    );
    expect(result).toEqual({ id: "rt2", title: "Daily standup" });
  });

  it("updateRecurringTask removes undefined and passes to DB", async () => {
    const ctx = makeCtx();
    await findTool("updateRecurringTask").execute(
      { recurringTaskId: "rt1", title: "Updated title" },
      ctx,
    );
    expect(mockState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId: "rt1",
        userId: "user-123",
        title: "Updated title",
      }),
    );
  });

  it("pauseRecurringTask calls pauseRecurringTask", async () => {
    const ctx = makeCtx();
    await findTool("pauseRecurringTask").execute(
      { recurringTaskId: "rt1" },
      ctx,
    );
    expect(mockState.pause).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: "rt1", userId: "user-123" }),
    );
  });

  it("deleteRecurringTask ends a series through Task Writes", async () => {
    const ctx = makeCtx();
    const result = await findTool("deleteRecurringTask").execute(
      { recurringTaskId: "rt1" },
      ctx,
    );
    expect(mockRpc).toHaveBeenNthCalledWith(1, "recurring_task_lifecycle", {
      p_operation: "get-series",
      p_request: { userId: "user-123", seriesId: "rt1" },
    });
    expect(mockRpc).toHaveBeenNthCalledWith(2, "recurring_task_delete_series", {
      p_operation: "delete-series",
      p_request: {
        userId: "user-123",
        seriesId: "rt1",
        effectiveDate: "2026-04-10",
      },
    });
    expect(result).toEqual({ success: true });
  });

  it("deleteRecurringTask returns error when not found", async () => {
    const ctx = makeCtx();
    mockRpc.mockResolvedValue({
      data: { status: "not-found", type: "not-found" },
      error: null,
    });
    const result = await findTool("deleteRecurringTask").execute(
      { recurringTaskId: "rt999" },
      ctx,
    );
    expect(result).toEqual({ error: "Recurring task not found" });
  });
});
