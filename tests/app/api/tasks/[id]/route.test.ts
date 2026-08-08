import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
import { NextRequest } from "next/server";

const {
  mockCreateTaskWrites,
  mockTaskDelete,
  mockTaskDeleteSeries,
  mockStateFactory,
  mockState,
  mockTaskCommandFactory,
  mockTaskCommandExecute,
} = vi.hoisted(() => {
  const mockTaskExecute = vi.fn(async (intent: any) => {
    if (intent.type === "update") {
      const updates = { ...intent.values };
      if (updates.title !== undefined) updates.title = updates.title.trim();
      if (updates.description !== undefined) {
        updates.description = updates.description?.trim() || null;
      }
      if (updates.status !== undefined) {
        updates.is_completed = updates.status === "done";
        updates.completed_at = updates.is_completed
          ? new Date().toISOString()
          : null;
      } else if (updates.is_completed !== undefined) {
        updates.status = updates.is_completed ? "done" : "todo";
        updates.completed_at = updates.is_completed
          ? new Date().toISOString()
          : null;
      }
      return {
        type: "updated",
        task: await mockTasksDB.updateTask(
          intent.taskId,
          intent.userId,
          updates,
        ),
      };
    }
    throw new Error(`Unexpected task write intent: ${intent.type}`);
  });
  const mockTaskDelete = vi.fn();
  const mockTaskDeleteSeries = vi.fn();
  const mockTaskCommandExecute = vi.fn();
  const mockTaskCommandFactory = vi.fn(() => ({
    execute: mockTaskCommandExecute,
    toggle: vi.fn(),
  }));
  const mockState = {
    editScope: vi.fn(),
  };
  return {
    mockCreateTaskWrites: vi.fn(() => ({
      execute: mockTaskExecute,
      delete: mockTaskDelete,
      deleteSeries: mockTaskDeleteSeries,
    })),
    mockTaskDelete,
    mockTaskDeleteSeries,
    mockStateFactory: vi.fn(() => mockState),
    mockState,
    mockTaskCommandFactory,
    mockTaskCommandExecute,
  };
});

vi.mock("@/lib/tasks/writes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks/writes")>(
    "@/lib/tasks/writes",
  );
  return { ...actual, createTaskWrites: mockCreateTaskWrites };
});

vi.mock("@/lib/tasks/commands", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks/commands")>(
    "@/lib/tasks/commands",
  );
  return { ...actual, createAuthenticatedTaskCommands: mockTaskCommandFactory };
});

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

const mockTasksDB = {
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  TasksDB: class {
    constructor() {
      return mockTasksDB;
    }
  },
}));

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return { ...actual, createSupabaseSeriesStateAdapter: mockStateFactory };
});

describe("GET /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return task by ID", async () => {
    const mockTask = { id: "task-1", user_id: "user-123", title: "Task 1" };
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(mockTask as any);

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1");
    const response = await GET(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(mockTask);
    expect(mockTasksDB.getTask).toHaveBeenCalledWith("task-1", "user-123");
  });

  it("should return 404 if task not found", async () => {
    vi.mocked(mockTasksDB.getTask).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/nonexistent",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "complete",
      operationId: "test-operation",
      task: { id: "task-1" },
    });
    vi.mocked(mockTasksDB.getTask).mockResolvedValue({
      id: "task-1",
      user_id: "user-123",
    } as any);
  });

  it("should update task", async () => {
    const updatedTask = {
      id: "task-1",
      user_id: "user-123",
      title: "Updated",
      priority: 3,
    };
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: updatedTask,
    });

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated", priority: 3 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.task).toEqual(updatedTask);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      taskId: "task-1",
      updates: { title: "Updated", priority: 3 },
    }));
  });

  it("should return 400 if no valid updates", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
  });

  it("should reject a completion timestamp without completion intent", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completed_at: "2026-07-28T12:00:00.000Z" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
    expect(mockTasksDB.updateTask).not.toHaveBeenCalled();
  });

  it("should update completion_difficulty with valid value", async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: {
      id: "task-1",
      completion_difficulty: 2,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: 2 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      updates: { completion_difficulty: 2 },
    }));
  });

  it("should accept null to clear completion_difficulty", async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: {
      id: "task-1",
      completion_difficulty: null,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: null }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      updates: { completion_difficulty: null },
    }));
  });

  it("should return 400 if completion_difficulty is out of range", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: 5 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("should return 400 if completion_difficulty is 0", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: 0 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
  });

  it("should return 400 if completion_difficulty is a non-numeric string", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: "abc" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
  });

  it("should return 400 if title is empty", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "  " }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
  });

  it('should sync status=done to is_completed=true and completed_at', async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: 'task-1',
      status: 'done',
      is_completed: true,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'complete',
      taskId: 'task-1',
      operationId: expect.any(String),
    }));
  });

  it('should sync status=todo to is_completed=false and completed_at=null', async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: 'task-1',
      status: 'todo',
      is_completed: false,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'todo' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'reopen',
      taskId: 'task-1',
      operationId: expect.any(String),
    }));
  });

  it('should update project_id when provided', async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: {
      id: 'task-1',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ project_id: '550e8400-e29b-41d4-a716-446655440000' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'edit',
      updates: { project_id: '550e8400-e29b-41d4-a716-446655440000' },
    }));
  });

  it('should clear project_id when set to null', async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: {
      id: 'task-1',
      project_id: null,
      },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ project_id: null }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'edit',
      updates: { project_id: null },
    }));
  });

  it('should accept section and sort_order updates', async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "test-operation",
      task: {
      id: 'task-1',
      section: 'work',
      sort_order: 32768.0,
      },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ section: 'work', sort_order: 32768.0 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'edit',
      updates: { section: 'work', sort_order: 32768.0 },
    }));
  });
});

describe("DELETE /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskDelete.mockResolvedValue({ type: "deleted" });
    mockTaskDeleteSeries.mockResolvedValue({ type: "deleted" });
  });

  it("should delete task", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith({
      type: "skip",
      taskId: "task-1",
      operationId: expect.any(String),
    });
  });
});

describe("PATCH /api/tasks/[id] with scope (recurring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.editScope.mockResolvedValue({
      status: "complete",
      type: "complete",
    });
  });

  it("routes scope=this field edits through shared Task Commands", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=this",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Modified" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      taskId: "task-1",
      scope: "this",
      updates: { title: "Modified" },
    }));
  });

  it("routes scope=following to a versioned shared Task Command", async () => {

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=following",
      {
        method: "PATCH",
        headers: { "If-Match": "rt-series-v1.following" },
        body: JSON.stringify({ title: "Following update" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      taskId: "task-1",
      scope: "following",
      expectedVersion: "rt-series-v1.following",
      updates: { title: "Following update" },
    }));
  });

  it("routes scope=all to a versioned shared Task Command", async () => {

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=all",
      {
        method: "PATCH",
        headers: { "X-Series-Version": "rt-series-v1.all" },
        body: JSON.stringify({ title: "All update" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith(expect.objectContaining({
      type: "edit",
      taskId: "task-1",
      scope: "all",
      expectedVersion: "rt-series-v1.all",
      updates: { title: "All update" },
    }));
  });

  it("should return 400 for invalid scope", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=invalid",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "X" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/invalid scope/i);
  });
});

describe("DELETE /api/tasks/[id] with scope (recurring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskDelete.mockResolvedValue({ type: "deleted" });
    mockTaskDeleteSeries.mockResolvedValue({ type: "deleted" });
  });

  it("should route scope=this through shared Task Commands", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=this",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith({
      type: "skip",
      taskId: "task-1",
      scope: "this",
      operationId: expect.any(String),
    });
  });

  it("routes scope=all deletion and its effective date through Task Commands", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=all&date=2026-08-06",
      {
        method: "DELETE",
        headers: { "If-Match": "rt-series-v1.all" },
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith({
      type: "skip",
      taskId: "task-1",
      scope: "all",
      effectiveDate: "2026-08-06",
      expectedVersion: "rt-series-v1.all",
      operationId: expect.any(String),
    });
  });

  it("should route standalone deletion through shared Task Commands", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTaskCommandExecute).toHaveBeenCalledWith({
      type: "skip",
      taskId: "task-1",
      operationId: expect.any(String),
    });
  });

  it("maps a typed not-found deletion outcome to 404", async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "skip",
      operationId: "test-operation",
    });

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1",
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Task not found" });
  });

  it("should return 400 for invalid delete scope", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=wrong",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(400);
  });
});
