import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockGetUserRecurringTasks,
  mockCreateRecurringTask,
  mockUpdateRecurringTask,
  mockPauseRecurringTask,
  mockRpc,
  mockToLegacyRecurringTask,
  mockState,
  mockStateFactory,
  mockGetRecurringTask,
} = vi.hoisted(() => {
  const state = {
    update: vi.fn(),
    pause: vi.fn(),
  };

  return {
    mockGetUserRecurringTasks: vi.fn(),
    mockCreateRecurringTask: vi.fn(),
    mockUpdateRecurringTask: vi.fn(),
    mockPauseRecurringTask: vi.fn(),
    mockRpc: vi.fn(),
    mockToLegacyRecurringTask: vi.fn(),
    mockState: state,
    mockStateFactory: vi.fn(() => state),
    mockGetRecurringTask: vi.fn(),
  };
});

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    TasksDB: class {
      getTodayTasks = vi.fn();
      getUpcomingTasks = vi.fn();
      getOverdueTasks = vi.fn();
      getTask = vi.fn();
      getUserTasks = vi.fn();
      createTask = vi.fn();
      toggleTaskCompletion = vi.fn();
      updateTask = vi.fn();
      deleteTask = vi.fn();
    },
    RecurringTasksDB: class {
      getUserRecurringTasks = mockGetUserRecurringTasks;
      getRecurringTask = mockGetRecurringTask;
      createRecurringTask = mockCreateRecurringTask;
      updateRecurringTask = mockUpdateRecurringTask;
      pauseRecurringTask = mockPauseRecurringTask;
    },
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
  return { ...actual, toLegacyRecurringTask: mockToLegacyRecurringTask };
});

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
    mockRpc.mockResolvedValue({
      data: {
        status: "complete",
        type: "complete",
        series: { id: "rt1", status: "active" },
      },
      error: null,
    });
    mockToLegacyRecurringTask.mockReturnValue({
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

  it("getRecurringTasks calls getUserRecurringTasks", async () => {
    const ctx = makeCtx();
    mockGetUserRecurringTasks.mockResolvedValue([
      { id: "rt1", title: "Weekly review" },
    ]);
    const result = await findTool("getRecurringTasks").execute(
      { status: "active" },
      ctx,
    );
    expect(mockGetUserRecurringTasks).toHaveBeenCalledWith("user-123", {
      status: "active",
    });
    expect(result).toEqual([{ id: "rt1", title: "Weekly review" }]);
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
