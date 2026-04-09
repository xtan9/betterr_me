import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

// Mock DB classes
const mockGetTodayTasks = vi.fn();
const mockGetUpcomingTasks = vi.fn();
const mockGetOverdueTasks = vi.fn();
const mockGetTask = vi.fn();
const mockGetUserTasks = vi.fn();
const mockCreateTask = vi.fn();
const mockToggleTaskCompletion = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();

vi.mock("@/lib/db", () => ({
  TasksDB: class {
    getTodayTasks = mockGetTodayTasks;
    getUpcomingTasks = mockGetUpcomingTasks;
    getOverdueTasks = mockGetOverdueTasks;
    getTask = mockGetTask;
    getUserTasks = mockGetUserTasks;
    createTask = mockCreateTask;
    toggleTaskCompletion = mockToggleTaskCompletion;
    updateTask = mockUpdateTask;
    deleteTask = mockDeleteTask;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-08",
    timezone: "America/Toronto",
    ...overrides,
  };
}

describe("taskTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an array of 9 tool definitions", () => {
    const tools = taskTools();
    expect(tools).toHaveLength(9);
    expect(tools.map((t) => t.name)).toEqual([
      "getTodayTasks",
      "getUpcomingTasks",
      "getOverdueTasks",
      "getTask",
      "getProjectTasks",
      "createTask",
      "toggleTask",
      "updateTask",
      "deleteTask",
    ]);
  });

  it("getTodayTasks calls TasksDB.getTodayTasks with userId and date", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const getTodayTasks = tools.find((t) => t.name === "getTodayTasks")!;
    mockGetTodayTasks.mockResolvedValue([{ id: "t1", title: "Buy groceries" }]);

    const result = await getTodayTasks.execute({ date: "2026-04-08" }, ctx);

    expect(mockGetTodayTasks).toHaveBeenCalledWith("user-123", "2026-04-08");
    expect(result).toEqual([{ id: "t1", title: "Buy groceries" }]);
  });

  it("createTask calls TasksDB.createTask with correct params", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const createTask = tools.find((t) => t.name === "createTask")!;
    mockCreateTask.mockResolvedValue({ id: "t2", title: "New task" });

    const result = await createTask.execute(
      { title: "New task", dueDate: "2026-04-09", priority: 1 },
      ctx,
    );

    expect(mockCreateTask).toHaveBeenCalledWith({
      user_id: "user-123",
      title: "New task",
      due_date: "2026-04-09",
      priority: 1,
    });
    expect(result).toEqual({ id: "t2", title: "New task" });
  });

  it("deleteTask calls TasksDB.deleteTask", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const deleteTask = tools.find((t) => t.name === "deleteTask")!;
    mockDeleteTask.mockResolvedValue(undefined);

    const result = await deleteTask.execute({ taskId: "t1" }, ctx);

    expect(mockDeleteTask).toHaveBeenCalledWith("t1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
