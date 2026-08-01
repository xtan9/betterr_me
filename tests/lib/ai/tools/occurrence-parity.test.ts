import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { DELETE, PATCH } from "@/app/api/tasks/[id]/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  httpSupabase,
  mockCreateAdapter,
  mockEdit,
  mockTaskWritesFactory,
  mockDelete,
} = vi.hoisted(() => {
  const httpSupabase = {};
  const mockEdit = vi.fn();
  const mockDelete = vi.fn();
  const mockCreateAdapter = vi.fn(() => ({
    edit: mockEdit,
  }));
  const mockTaskWritesFactory = vi.fn(() => ({
    delete: mockDelete,
    deleteSeries: vi.fn(),
  }));
  return {
    httpSupabase,
    mockCreateAdapter,
    mockEdit,
    mockTaskWritesFactory,
    mockDelete,
  };
});

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: vi.fn(async () => ({
    ok: true,
    principal: { userId: "user-123", credential: "cookie", profile: {} },
    client: httpSupabase,
  })),
}));

vi.mock("@/lib/recurring-tasks/supabase-occurrence-adapter", () => ({
  createSupabaseOccurrenceAdapter: mockCreateAdapter,
}));

vi.mock("@/lib/tasks/writes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks/writes")>(
    "@/lib/tasks/writes",
  );
  return { ...actual, createTaskWrites: mockTaskWritesFactory };
});

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: {} as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Los_Angeles",
};

const task = {
  id: "task-1",
  title: "Move review",
  due_date: "2026-08-05",
  is_completed: true,
  status: "done",
};

function updateTaskTool() {
  return taskTools().find((tool) => tool.name === "updateTask")!;
}

describe("HTTP and AI occurrence adapter parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEdit.mockResolvedValue({
      status: "complete",
      type: "complete",
      task,
    });
    mockDelete.mockResolvedValue({ type: "deleted" });
  });

  it("maps equivalent HTTP and AI edits to one canonical occurrence intent", async () => {
    const httpResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/tasks/task-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Move review",
          due_date: "2026-08-05",
          status: "done",
        }),
      }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await updateTaskTool().execute(
      {
        taskId: "task-1",
        title: "Move review",
        dueDate: "2026-08-05",
        status: "done",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ task });
    expect(aiResult).toEqual(task);
    expect(mockEdit.mock.calls).toEqual([
      [
        {
          userId: "user-123",
          taskId: "task-1",
          updates: { title: "Move review", dueDate: "2026-08-05" },
          completed: true,
        },
      ],
      [
        {
          userId: "user-123",
          taskId: "task-1",
          updates: { title: "Move review", dueDate: "2026-08-05" },
          completed: true,
        },
      ],
    ]);
  });

  it.each([
    [
      "not-found",
      { status: "not-found", type: "not-found" },
      404,
      { error: "Task not found" },
    ],
    [
      "conflict",
      {
        status: "conflict",
        type: "conflict",
        reason: "not a presentation contract",
      },
      409,
      { error: "Task occurrence conflict" },
    ],
    [
      "already-applied",
      { status: "already-applied", type: "already-applied", task },
      200,
      { task },
    ],
  ] as const)(
    "renders the typed %s outcome consistently",
    async (_name, outcome, httpStatus, expected) => {
      mockEdit.mockResolvedValue(outcome);

      const httpResponse = await PATCH(
        new NextRequest("http://localhost:3000/api/tasks/task-1", {
          method: "PATCH",
          body: JSON.stringify({ title: "Move review" }),
        }),
        { params: Promise.resolve({ id: "task-1" }) },
      );
      const aiResult = await updateTaskTool().execute(
        { taskId: "task-1", title: "Move review" },
        aiContext,
      );

      expect(httpResponse.status).toBe(httpStatus);
      expect(await httpResponse.json()).toEqual(expected);
      expect(aiResult).toEqual(
        httpStatus === 200 ? task : expected,
      );
    },
  );

  it("maps equivalent HTTP and AI scoped deletions to one Task Writes intent", async () => {
    const httpResponse = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/tasks/task-1?scope=all&date=2026-08-09",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await taskTools()
      .find((tool) => tool.name === "deleteTask")!
      .execute(
        {
          taskId: "task-1",
          scope: "all",
          effectiveDate: "2026-08-09",
        },
        aiContext,
      );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ success: true });
    expect(aiResult).toEqual({ success: true });
    expect(mockDelete.mock.calls).toEqual([
      [
        {
          taskId: "task-1",
          userId: "user-123",
          scope: "all",
          effectiveDate: "2026-08-09",
        },
      ],
      [
        {
          taskId: "task-1",
          userId: "user-123",
          scope: "all",
          effectiveDate: "2026-08-09",
        },
      ],
    ]);
  });

  it("renders a shared not-found deletion outcome consistently", async () => {
    mockDelete.mockResolvedValue({ type: "not-found" });
    const httpResponse = await DELETE(
      new NextRequest("http://localhost:3000/api/tasks/task-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await taskTools()
      .find((tool) => tool.name === "deleteTask")!
      .execute({ taskId: "task-1" }, aiContext);

    expect(httpResponse.status).toBe(404);
    expect(await httpResponse.json()).toEqual({ error: "Task not found" });
    expect(aiResult).toEqual({ error: "Task not found" });
  });
});
