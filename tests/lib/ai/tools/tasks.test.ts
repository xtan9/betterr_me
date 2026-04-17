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
  RecurringTasksDB: class {
    getUserRecurringTasks = vi.fn();
    createRecurringTask = vi.fn();
    updateRecurringTask = vi.fn();
    pauseRecurringTask = vi.fn();
    deleteRecurringTask = vi.fn();
  },
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

  it("returns an array of 14 tool definitions", () => {
    const tools = taskTools();
    expect(tools).toHaveLength(14);
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
      "getRecurringTasks",
      "createRecurringTask",
      "updateRecurringTask",
      "pauseRecurringTask",
      "deleteRecurringTask",
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
      description: null,
      due_date: "2026-04-09",
      due_time: null,
      priority: 1,
      project_id: undefined,
      is_completed: false,
    });
    expect(result).toEqual({ id: "t2", title: "New task" });
  });

  it("deleteTask verifies existence then deletes", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const deleteTask = tools.find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue({ id: "t1" });
    mockDeleteTask.mockResolvedValue(undefined);

    const result = await deleteTask.execute({ taskId: "t1" }, ctx);

    expect(mockGetTask).toHaveBeenCalledWith("t1", "user-123");
    expect(mockDeleteTask).toHaveBeenCalledWith("t1", "user-123");
    expect(result).toEqual({ success: true });
  });

  it("deleteTask returns error when not found", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const deleteTask = tools.find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue(null);

    const result = await deleteTask.execute({ taskId: "t999" }, ctx);

    expect(result).toEqual({ error: "Task not found" });
    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it("getUpcomingTasks calls TasksDB.getUpcomingTasks with days", async () => {
    const ctx = makeCtx();
    const getUpcomingTasks = taskTools().find((t) => t.name === "getUpcomingTasks")!;
    mockGetUpcomingTasks.mockResolvedValue([{ id: "t1" }]);
    const result = await getUpcomingTasks.execute(
      { date: "2026-04-08", days: 14 },
      ctx,
    );
    expect(mockGetUpcomingTasks).toHaveBeenCalledWith(
      "user-123",
      "2026-04-08",
      14,
    );
    expect(result).toEqual([{ id: "t1" }]);
  });

  it("getUpcomingTasks passes undefined days when omitted", async () => {
    const ctx = makeCtx();
    const getUpcomingTasks = taskTools().find((t) => t.name === "getUpcomingTasks")!;
    mockGetUpcomingTasks.mockResolvedValue([]);
    await getUpcomingTasks.execute({ date: "2026-04-08" }, ctx);
    expect(mockGetUpcomingTasks).toHaveBeenCalledWith(
      "user-123",
      "2026-04-08",
      undefined,
    );
  });

  it("getOverdueTasks calls TasksDB.getOverdueTasks", async () => {
    const ctx = makeCtx();
    const getOverdueTasks = taskTools().find((t) => t.name === "getOverdueTasks")!;
    mockGetOverdueTasks.mockResolvedValue([{ id: "t1" }]);
    const result = await getOverdueTasks.execute({ date: "2026-04-08" }, ctx);
    expect(mockGetOverdueTasks).toHaveBeenCalledWith("user-123", "2026-04-08");
    expect(result).toEqual([{ id: "t1" }]);
  });

  it("getTask calls TasksDB.getTask", async () => {
    const ctx = makeCtx();
    const getTask = taskTools().find((t) => t.name === "getTask")!;
    mockGetTask.mockResolvedValue({ id: "t1", title: "Single" });
    const result = await getTask.execute({ taskId: "t1" }, ctx);
    expect(mockGetTask).toHaveBeenCalledWith("t1", "user-123");
    expect(result).toEqual({ id: "t1", title: "Single" });
  });

  it("getProjectTasks calls TasksDB.getUserTasks with filters", async () => {
    const ctx = makeCtx();
    const getProjectTasks = taskTools().find((t) => t.name === "getProjectTasks")!;
    mockGetUserTasks.mockResolvedValue([{ id: "t1" }]);
    const result = await getProjectTasks.execute(
      { projectId: "p1", status: "open", priority: 2 },
      ctx,
    );
    expect(mockGetUserTasks).toHaveBeenCalledWith("user-123", {
      project_id: "p1",
      status: "open",
      priority: 2,
    });
    expect(result).toEqual([{ id: "t1" }]);
  });

  it("createTask defaults priority to 0 and dueDate to null", async () => {
    const ctx = makeCtx();
    const createTask = taskTools().find((t) => t.name === "createTask")!;
    mockCreateTask.mockResolvedValue({ id: "tx" });
    await createTask.execute({ title: "Minimal" }, ctx);
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Minimal",
        priority: 0,
        due_date: null,
        project_id: undefined,
        is_completed: false,
      }),
    );
  });

  it("toggleTask calls TasksDB.toggleTaskCompletion", async () => {
    const ctx = makeCtx();
    const toggleTask = taskTools().find((t) => t.name === "toggleTask")!;
    mockToggleTaskCompletion.mockResolvedValue({ id: "t1", is_completed: true });
    const result = await toggleTask.execute({ taskId: "t1" }, ctx);
    expect(mockToggleTaskCompletion).toHaveBeenCalledWith("t1", "user-123");
    expect(result).toEqual({ id: "t1", is_completed: true });
  });

  it("updateTask transforms dueDate and projectId, strips undefined", async () => {
    const ctx = makeCtx();
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;
    mockUpdateTask.mockResolvedValue({ id: "t1" });
    await updateTask.execute(
      {
        taskId: "t1",
        title: "New",
        dueDate: "2026-05-01",
        projectId: "p2",
      },
      ctx,
    );
    expect(mockUpdateTask).toHaveBeenCalledWith("t1", "user-123", {
      title: "New",
      due_date: "2026-05-01",
      project_id: "p2",
    });
  });

  it("updateTask with only partial fields does not include undefined keys", async () => {
    const ctx = makeCtx();
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;
    mockUpdateTask.mockResolvedValue({ id: "t1" });
    await updateTask.execute(
      { taskId: "t1", status: "done" },
      ctx,
    );
    expect(mockUpdateTask).toHaveBeenCalledWith("t1", "user-123", {
      status: "done",
    });
  });
});
