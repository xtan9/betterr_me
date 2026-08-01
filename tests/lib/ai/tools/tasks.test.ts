import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import { TaskWrites, type TaskWritePersistence } from "@/lib/tasks/writes";
import { taskFormSchema, taskUpdateSchema } from "@/lib/validations/task";
import type { ToolContext } from "@/lib/ai/tools/types";

// Mock DB classes
const mockGetTodayTasks = vi.fn();
const mockGetUpcomingTasks = vi.fn();
const mockGetOverdueTasks = vi.fn();
const mockGetTask = vi.fn();
const mockGetUserTasks = vi.fn();
const mockCreateTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockDeleteInstanceWithScope = vi.fn();

const mockSortOrderChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

const mockSupabaseFrom = vi.fn(() => mockSortOrderChain);
const mockRpc = vi.fn();

vi.mock("@/lib/db", () => ({
  RecurringTasksDB: class {
    getUserRecurringTasks = vi.fn();
    createRecurringTask = vi.fn();
    updateRecurringTask = vi.fn();
    pauseRecurringTask = vi.fn();
    deleteRecurringTask = vi.fn();
    deleteInstanceWithScope = mockDeleteInstanceWithScope;
  },
  TasksDB: class {
    getTodayTasks = mockGetTodayTasks;
    getUpcomingTasks = mockGetUpcomingTasks;
    getOverdueTasks = mockGetOverdueTasks;
    getTask = mockGetTask;
    getUserTasks = mockGetUserTasks;
    createTask = mockCreateTask;
    updateTask = mockUpdateTask;
    deleteTask = mockDeleteTask;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {
      from: mockSupabaseFrom,
      rpc: mockRpc,
    } as unknown as ToolContext["supabase"],
    date: "2026-04-08",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function makeWritePersistence(): TaskWritePersistence {
  return {
    getMaxSortOrder: vi.fn().mockResolvedValue(131072),
    createTask: vi.fn(async (task) => ({ id: "t2", ...task } as never)),
    getTask: vi.fn(),
    updateTask: vi.fn(async (_taskId, _userId, updates) => ({
      id: "t1",
      ...updates,
    } as never)),
  };
}

describe("taskTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTask.mockResolvedValue({ id: "t1", user_id: "user-123" });
    mockRpc.mockResolvedValue({
      data: { status: "complete" },
      error: null,
    });
    mockSortOrderChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it("returns an array of 15 tool definitions", () => {
    const tools = taskTools();
    expect(tools).toHaveLength(15);
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
      "resumeRecurringTask",
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

  it("does not present AI tasks as complete when coverage cannot be ensured", async () => {
    const ctx = makeCtx();
    const getTodayTasks = taskTools().find((t) => t.name === "getTodayTasks")!;
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: new Error("coverage unavailable"),
    });

    await expect(getTodayTasks.execute({ date: "2026-04-08" }, ctx))
      .rejects.toMatchObject({
        name: "RecurringCoverageUnavailableError",
        warning: expect.objectContaining({
          code: "recurring_coverage_unavailable",
          requestedRange: { from: "2026-04-08", to: "2026-04-08" },
        }),
      });
    expect(mockGetTodayTasks).not.toHaveBeenCalled();
  });

  it("createTask applies HTTP defaults and deterministic bottom placement", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const createTask = tools.find((t) => t.name === "createTask")!;
    mockSortOrderChain.maybeSingle.mockResolvedValue({
      data: { sort_order: 131072 },
      error: null,
    });
    mockCreateTask.mockResolvedValue({ id: "t2", title: "New task" });

    const result = await createTask.execute(
      { title: "New task", dueDate: "2026-04-09", priority: 1 },
      ctx,
    );

    expect(mockCreateTask).toHaveBeenCalledWith({
      user_id: "user-123",
      title: "New task",
      description: null,
      is_completed: false,
      priority: 1,
      category_id: null,
      due_date: "2026-04-09",
      due_time: null,
      completion_difficulty: null,
      status: "todo",
      section: "personal",
      project_id: null,
      sort_order: 196608,
      completed_at: null,
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

  it("deleteTask skips a recurring occurrence through the recurring adapter", async () => {
    const ctx = makeCtx();
    const deleteTask = taskTools().find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue({
      id: "t1",
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
    });
    mockDeleteInstanceWithScope.mockResolvedValue(undefined);

    const result = await deleteTask.execute({ taskId: "t1" }, ctx);

    expect(mockDeleteInstanceWithScope).toHaveBeenCalledWith(
      "t1",
      "user-123",
      "this",
    );
    expect(mockDeleteTask).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
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
    expect(mockRpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "ensure-user-coverage",
      p_request: {
        userId: "user-123",
        range: { from: "2026-04-08", to: "2026-04-22" },
      },
    });
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

  it("createTask propagates placement failures without attempting persistence", async () => {
    const ctx = makeCtx();
    const createTask = taskTools().find((t) => t.name === "createTask")!;
    const persistenceError = new Error("placement unavailable");
    mockSortOrderChain.maybeSingle.mockResolvedValue({
      data: null,
      error: persistenceError,
    });

    await expect(createTask.execute({ title: "Minimal" }, ctx)).rejects.toBe(
      persistenceError,
    );
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it("createTask rejects values rejected by the HTTP task schema", () => {
    const createTask = taskTools().find((t) => t.name === "createTask")!;

    expect(createTask.parameters.safeParse({ title: "" }).success).toBe(false);
    expect(
      createTask.parameters.safeParse({ title: "Task", priority: 5 }).success,
    ).toBe(false);
    expect(
      createTask.parameters.safeParse({ title: "Task", projectId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("toggleTask synchronizes completion through Task Writes", async () => {
    const ctx = makeCtx();
    const toggleTask = taskTools().find((t) => t.name === "toggleTask")!;
    mockGetTask.mockResolvedValue({ id: "t1", is_completed: false });
    mockUpdateTask.mockResolvedValue({
      id: "t1",
      is_completed: true,
      status: "done",
    });
    const result = await toggleTask.execute({ taskId: "t1" }, ctx);
    expect(mockUpdateTask).toHaveBeenCalledWith(
      "t1",
      "user-123",
      expect.objectContaining({
        is_completed: true,
        status: "done",
        completed_at: expect.any(String),
      }),
    );
    expect(result).toEqual({ id: "t1", is_completed: true, status: "done" });
  });

  it("keeps the prepared lifecycle path inactive for recurring occurrences", async () => {
    const ctx = makeCtx();
    const toggleTask = taskTools().find((t) => t.name === "toggleTask")!;
    const currentTask = {
      id: "t1",
      is_completed: false,
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
    };
    mockGetTask.mockResolvedValue(currentTask);
    mockUpdateTask.mockResolvedValue({
      ...currentTask,
      is_completed: true,
      status: "done",
    });

    const result = await toggleTask.execute({ taskId: "t1" }, ctx);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpdateTask).toHaveBeenCalledWith(
      "t1",
      "user-123",
      expect.objectContaining({
        is_completed: true,
        status: "done",
        completed_at: expect.any(String),
      }),
    );
    expect(result).toEqual({
      ...currentTask,
      is_completed: true,
      status: "done",
    });
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

  it("updateTask synchronizes status and completion through Task Writes", async () => {
    const ctx = makeCtx();
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;
    mockUpdateTask.mockResolvedValue({ id: "t1" });
    await updateTask.execute(
      { taskId: "t1", status: "done" },
      ctx,
    );
    expect(mockUpdateTask).toHaveBeenCalledWith(
      "t1",
      "user-123",
      expect.objectContaining({
        status: "done",
        is_completed: true,
        completed_at: expect.any(String),
      }),
    );
  });

  it("updateTask rejects empty and invalid updates like the HTTP task schema", () => {
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;

    expect(updateTask.parameters.safeParse({ taskId: "t1" }).success).toBe(false);
    expect(
      updateTask.parameters.safeParse({ taskId: "t1", status: "finished" })
        .success,
    ).toBe(false);
    expect(
      updateTask.parameters.safeParse({ taskId: "t1", priority: -1 }).success,
    ).toBe(false);
  });

  it("executes equivalent HTTP and AI create intents with identical behavior", async () => {
    mockSortOrderChain.maybeSingle.mockResolvedValue({
      data: { sort_order: 131072 },
      error: null,
    });
    mockCreateTask.mockImplementation(async (task) => ({ id: "t2", ...task }));
    const aiCreate = taskTools().find((tool) => tool.name === "createTask")!;
    const aiValues = {
      title: "Plan tomorrow",
      dueDate: "2026-08-01",
      priority: 2,
    };

    const aiTask = await aiCreate.execute(aiValues, makeCtx());

    const httpPersistence = makeWritePersistence();
    const httpOutcome = await new TaskWrites(httpPersistence).execute({
      type: "create",
      userId: "user-123",
      values: taskFormSchema.parse({
        title: aiValues.title,
        due_date: aiValues.dueDate,
        priority: aiValues.priority,
      }),
    });

    expect(mockCreateTask).toHaveBeenCalledWith(
      vi.mocked(httpPersistence.createTask).mock.calls[0][0],
    );
    expect(aiTask).toEqual(httpOutcome.task);
  });

  it("executes equivalent HTTP and AI status intents with identical behavior", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
    try {
      mockUpdateTask.mockImplementation(async (_taskId, _userId, updates) => ({
        id: "t1",
        ...updates,
      }));
      const aiUpdate = taskTools().find((tool) => tool.name === "updateTask")!;

      const aiTask = await aiUpdate.execute(
        { taskId: "t1", status: "done" },
        makeCtx(),
      );

      const httpPersistence = makeWritePersistence();
      const httpOutcome = await new TaskWrites(httpPersistence).execute({
        type: "update",
        userId: "user-123",
        taskId: "t1",
        values: taskUpdateSchema.parse({ status: "done" }),
      });

      expect(mockUpdateTask).toHaveBeenCalledWith(
        ...vi.mocked(httpPersistence.updateTask).mock.calls[0],
      );
      expect(aiTask).toEqual(httpOutcome.task);
    } finally {
      vi.useRealTimers();
    }
  });
});
