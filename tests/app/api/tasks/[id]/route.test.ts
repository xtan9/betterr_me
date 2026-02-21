import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
import { NextRequest } from "next/server";

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
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
};

const mockRecurringTasksDB = {
  updateInstanceWithScope: vi.fn(),
  deleteInstanceWithScope: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  TasksDB: class {
    constructor() {
      return mockTasksDB;
    }
  },
  RecurringTasksDB: class {
    constructor() {
      return mockRecurringTasksDB;
    }
  },
}));

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
  });

  it("should update task", async () => {
    const updatedTask = {
      id: "task-1",
      user_id: "user-123",
      title: "Updated",
      priority: 3,
    };
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue(updatedTask as any);

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

  it("should update completion_difficulty with valid value", async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: "task-1",
      completion_difficulty: 2,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: 2 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith("task-1", "user-123", {
      completion_difficulty: 2,
    });
  });

  it("should accept null to clear completion_difficulty", async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: "task-1",
      completion_difficulty: null,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ completion_difficulty: null }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith("task-1", "user-123", {
      completion_difficulty: null,
    });
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
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith('task-1', 'user-123',
      expect.objectContaining({
        status: 'done',
        is_completed: true,
        completed_at: expect.any(String),
      })
    );
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
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith('task-1', 'user-123',
      expect.objectContaining({
        status: 'todo',
        is_completed: false,
        completed_at: null,
      })
    );
  });

  it('should update project_id when provided', async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: 'task-1',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ project_id: '550e8400-e29b-41d4-a716-446655440000' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith('task-1', 'user-123',
      expect.objectContaining({ project_id: '550e8400-e29b-41d4-a716-446655440000' })
    );
  });

  it('should clear project_id when set to null', async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: 'task-1',
      project_id: null,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ project_id: null }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith('task-1', 'user-123',
      expect.objectContaining({ project_id: null })
    );
  });

  it('should accept section and sort_order updates', async () => {
    vi.mocked(mockTasksDB.updateTask).mockResolvedValue({
      id: 'task-1',
      section: 'work',
      sort_order: 32768.0,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/tasks/task-1', {
      method: 'PATCH',
      body: JSON.stringify({ section: 'work', sort_order: 32768.0 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockTasksDB.updateTask).toHaveBeenCalledWith('task-1', 'user-123',
      expect.objectContaining({
        section: 'work',
        sort_order: 32768.0,
      })
    );
  });
});

describe("DELETE /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete task", async () => {
    vi.mocked(mockTasksDB.deleteTask).mockResolvedValue();

    const request = new NextRequest("http://localhost:3000/api/tasks/task-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTasksDB.deleteTask).toHaveBeenCalledWith("task-1", "user-123");
  });
});

describe("PATCH /api/tasks/[id] with scope (recurring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delegate scope=this to updateInstanceWithScope", async () => {
    vi.mocked(mockRecurringTasksDB.updateInstanceWithScope).mockResolvedValue();

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
    expect(mockRecurringTasksDB.updateInstanceWithScope).toHaveBeenCalledWith(
      "task-1",
      "user-123",
      "this",
      expect.objectContaining({ title: "Modified" }),
    );
  });

  it("should delegate scope=following to updateInstanceWithScope", async () => {
    vi.mocked(mockRecurringTasksDB.updateInstanceWithScope).mockResolvedValue();

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=following",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Following update" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRecurringTasksDB.updateInstanceWithScope).toHaveBeenCalledWith(
      "task-1",
      "user-123",
      "following",
      expect.objectContaining({ title: "Following update" }),
    );
  });

  it("should delegate scope=all to updateInstanceWithScope", async () => {
    vi.mocked(mockRecurringTasksDB.updateInstanceWithScope).mockResolvedValue();

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=all",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "All update" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRecurringTasksDB.updateInstanceWithScope).toHaveBeenCalledWith(
      "task-1",
      "user-123",
      "all",
      expect.objectContaining({ title: "All update" }),
    );
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
  });

  it("should delegate scope=this to deleteInstanceWithScope", async () => {
    vi.mocked(mockRecurringTasksDB.deleteInstanceWithScope).mockResolvedValue();

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
    expect(mockRecurringTasksDB.deleteInstanceWithScope).toHaveBeenCalledWith(
      "task-1",
      "user-123",
      "this",
    );
  });

  it("should delegate scope=all to deleteInstanceWithScope", async () => {
    vi.mocked(mockRecurringTasksDB.deleteInstanceWithScope).mockResolvedValue();

    const request = new NextRequest(
      "http://localhost:3000/api/tasks/task-1?scope=all",
      { method: "DELETE" },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "task-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRecurringTasksDB.deleteInstanceWithScope).toHaveBeenCalledWith(
      "task-1",
      "user-123",
      "all",
    );
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
