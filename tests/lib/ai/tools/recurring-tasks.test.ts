import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserRecurringTasks = vi.fn();
const mockCreateRecurringTask = vi.fn();
const mockUpdateRecurringTask = vi.fn();
const mockPauseRecurringTask = vi.fn();
const mockDeleteRecurringTask = vi.fn();

vi.mock("@/lib/db", () => ({
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
    createRecurringTask = mockCreateRecurringTask;
    updateRecurringTask = mockUpdateRecurringTask;
    pauseRecurringTask = mockPauseRecurringTask;
    deleteRecurringTask = mockDeleteRecurringTask;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return taskTools().find((t) => t.name === name)!;
}

describe("recurring task tools", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("createRecurringTask passes correct params with throughDate", async () => {
    const ctx = makeCtx();
    mockCreateRecurringTask.mockResolvedValue({
      id: "rt2",
      title: "Daily standup",
    });
    const result = await findTool("createRecurringTask").execute(
      {
        title: "Daily standup",
        startDate: "2026-04-10",
        recurrenceRule: { frequency: "daily", interval: 1 },
      },
      ctx,
    );
    expect(mockCreateRecurringTask).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Daily standup",
        start_date: "2026-04-10",
        recurrence_rule: { frequency: "daily", interval: 1 },
        end_type: "never",
      }),
      "2026-05-10",
    );
    expect(result).toEqual({ id: "rt2", title: "Daily standup" });
  });

  it("updateRecurringTask removes undefined and passes to DB", async () => {
    const ctx = makeCtx();
    mockUpdateRecurringTask.mockResolvedValue({
      id: "rt1",
      title: "Updated title",
    });
    await findTool("updateRecurringTask").execute(
      { recurringTaskId: "rt1", title: "Updated title" },
      ctx,
    );
    expect(mockUpdateRecurringTask).toHaveBeenCalledWith(
      "rt1",
      "user-123",
      { title: "Updated title" },
    );
  });

  it("pauseRecurringTask calls pauseRecurringTask", async () => {
    const ctx = makeCtx();
    mockPauseRecurringTask.mockResolvedValue({
      id: "rt1",
      status: "paused",
    });
    await findTool("pauseRecurringTask").execute(
      { recurringTaskId: "rt1" },
      ctx,
    );
    expect(mockPauseRecurringTask).toHaveBeenCalledWith("rt1", "user-123");
  });

  it("deleteRecurringTask returns success", async () => {
    const ctx = makeCtx();
    mockDeleteRecurringTask.mockResolvedValue(undefined);
    const result = await findTool("deleteRecurringTask").execute(
      { recurringTaskId: "rt1" },
      ctx,
    );
    expect(mockDeleteRecurringTask).toHaveBeenCalledWith("rt1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
