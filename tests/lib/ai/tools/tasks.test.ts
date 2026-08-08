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
    principal: {
      type: "user",
      userId: "user-123",
      credential: "cookie",
    },
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
      data: {
        status: "complete",
        type: "complete",
        task: { id: "t1", is_completed: true, status: "done" },
        series: [],
        occurrences: [],
        intentionalAbsences: [],
      },
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
    expect(mockRpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "ensure-user-coverage",
      p_request: {
        userId: "user-123",
        range: { from: "2026-04-08", to: "2026-04-08" },
        idempotencyKey: "task-read-coverage:user-123:2026-04-08:2026-04-08",
        source: "interactive",
      },
    });
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetTodayTasks.mock.invocationCallOrder[0],
    );
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

  it("maps partial Coverage to the same typed AI failure", async () => {
    const ctx = makeCtx();
    const getTodayTasks = taskTools().find((t) => t.name === "getTodayTasks")!;
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "partial",
        series: [],
        occurrences: [],
        intentionalAbsences: [],
        failedSeriesIds: ["series-2", "series-1"],
      },
      error: null,
    });

    await expect(getTodayTasks.execute({ date: "2026-04-08" }, ctx))
      .rejects.toMatchObject({
        name: "RecurringCoverageUnavailableError",
        completeness: expect.objectContaining({
          status: "partial",
          failedSeriesIds: ["series-1", "series-2"],
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

  it("deleteTask routes an ordinary skip through shared Task Commands", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const deleteTask = tools.find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue({ id: "t1" });
    mockRpc.mockResolvedValueOnce({
      data: { status: "complete", type: "complete" },
      error: null,
    });

    const result = await deleteTask.execute({ taskId: "t1" }, ctx);

    expect(mockGetTask).toHaveBeenCalledWith("t1", "user-123");
    expect(mockRpc).toHaveBeenCalledWith("task_command_atomic", {
      p_operation: "skip",
      p_request: expect.objectContaining({
        userId: "user-123",
        taskId: "t1",
        idempotencyKey: expect.any(String),
      }),
    });
    expect(result).toEqual({ success: true });
  });

  it("deleteTask returns error when not found", async () => {
    const ctx = makeCtx();
    const tools = taskTools();
    const deleteTask = tools.find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue(null);
    mockRpc.mockResolvedValueOnce({
      data: { status: "not-found", type: "not-found" },
      error: null,
    });

    const result = await deleteTask.execute({ taskId: "t999" }, ctx);

    expect(result).toEqual({ error: "Task not found" });
    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it("deleteTask skips a recurring occurrence through the lifecycle port", async () => {
    const ctx = makeCtx();
    const deleteTask = taskTools().find((t) => t.name === "deleteTask")!;
    mockGetTask.mockResolvedValue({
      id: "t1",
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
    });

    const result = await deleteTask.execute(
      { taskId: "t1", operationId: "ai-skip-1" },
      ctx,
    );

    expect(mockRpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "skip-occurrence",
      p_request: {
        userId: "user-123",
        taskId: "t1",
        seriesId: "series-1",
        occurrenceId: "occurrence-1",
        scope: "this",
        idempotencyKey: "ai-skip-1",
      },
    });
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
        idempotencyKey:
          "task-read-coverage:user-123:2026-04-08:2026-04-22",
        source: "interactive",
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

  it("toggleTask chooses an explicit shared completion command", async () => {
    const ctx = makeCtx();
    const toggleTask = taskTools().find((t) => t.name === "toggleTask")!;
    mockGetTask.mockResolvedValue({ id: "t1", is_completed: false });
    const result = await toggleTask.execute(
      { taskId: "t1", operationId: "ai-complete-1" },
      ctx,
    );
    expect(mockRpc).toHaveBeenCalledWith("task_command_atomic", {
      p_operation: "complete",
      p_request: {
        userId: "user-123",
        taskId: "t1",
        idempotencyKey: "ai-complete-1",
      },
    });
    expect(result).toEqual({ id: "t1", is_completed: true, status: "done" });
  });

  it("routes recurring toggles through explicit lifecycle completion", async () => {
    const ctx = makeCtx();
    const toggleTask = taskTools().find((t) => t.name === "toggleTask")!;
    const currentTask = {
      id: "t1",
      is_completed: false,
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
    };
    mockGetTask.mockResolvedValue(currentTask);
    vi.mocked(mockGetTask)
      .mockResolvedValueOnce(currentTask)
      .mockResolvedValueOnce(currentTask)
      .mockResolvedValueOnce({
        ...currentTask,
        is_completed: true,
        status: "done",
      });

    const result = await toggleTask.execute(
      { taskId: "t1", operationId: "ai-recurring-complete-1" },
      ctx,
    );

    expect(mockRpc).toHaveBeenCalledWith("recurring_task_lifecycle", {
      p_operation: "complete-occurrence",
      p_request: {
        userId: "user-123",
        taskId: "t1",
        seriesId: "series-1",
        occurrenceId: "occurrence-1",
        scope: "this",
        idempotencyKey: "ai-recurring-complete-1",
      },
    });
    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(result).toEqual({ ...currentTask, is_completed: true, status: "done" });
  });

  it("updateTask transforms dueDate and projectId, strips undefined", async () => {
    const ctx = makeCtx();
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "complete",
        type: "complete",
        task: { id: "t1" },
      },
      error: null,
    });
    await updateTask.execute(
      {
        taskId: "t1",
        title: "New",
        dueDate: "2026-05-01",
        projectId: "p2",
      },
      ctx,
    );
    expect(mockRpc).toHaveBeenCalledWith("task_command_atomic", {
      p_operation: "edit",
      p_request: {
        userId: "user-123",
        taskId: "t1",
        idempotencyKey: expect.any(String),
        updates: {
          title: "New",
          due_date: "2026-05-01",
          project_id: "p2",
        },
      },
    });
  });

  it("updateTask routes completion status through shared Task Commands", async () => {
    const ctx = makeCtx();
    const updateTask = taskTools().find((t) => t.name === "updateTask")!;
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "complete",
        type: "complete",
        task: { id: "t1", is_completed: true, status: "done" },
      },
      error: null,
    });
    await updateTask.execute(
      { taskId: "t1", status: "done", operationId: "ai-status-1" },
      ctx,
    );
    expect(mockRpc).toHaveBeenCalledWith("task_command_atomic", {
      p_operation: "complete",
      p_request: {
        userId: "user-123",
        taskId: "t1",
        idempotencyKey: "ai-status-1",
      },
    });
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
      const httpPersistence = makeWritePersistence();
      const httpOutcome = await new TaskWrites(httpPersistence).execute({
        type: "update",
        userId: "user-123",
        taskId: "t1",
        values: taskUpdateSchema.parse({ status: "done" }),
      });
      mockRpc.mockResolvedValueOnce({
        data: {
          status: "complete",
          type: "complete",
          task: httpOutcome.task,
        },
        error: null,
      });
      const aiUpdate = taskTools().find((tool) => tool.name === "updateTask")!;
      const aiTask = await aiUpdate.execute(
        { taskId: "t1", status: "done", operationId: "parity-status-1" },
        makeCtx(),
      );

      expect(mockRpc).toHaveBeenCalledWith("task_command_atomic", {
        p_operation: "complete",
        p_request: {
          userId: "user-123",
          taskId: "t1",
          idempotencyKey: "parity-status-1",
        },
      });
      expect(aiTask).toEqual(
        httpOutcome.task,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
