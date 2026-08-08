import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { DELETE, PATCH } from "@/app/api/tasks/[id]/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";
import { encodeSeriesVersion } from "@/lib/tasks/commands";

const {
  httpSupabase,
  mockCreateAdapter,
  mockTaskWritesFactory,
  mockDelete,
  mockTaskCommandFactory,
  mockTaskCommandExecute,
} = vi.hoisted(() => {
  const httpSupabase = {};
  const mockDelete = vi.fn();
  const mockCreateAdapter = vi.fn(() => ({}));
  const mockTaskWritesFactory = vi.fn(() => ({
    delete: mockDelete,
    deleteSeries: vi.fn(),
  }));
  const mockTaskCommandExecute = vi.fn();
  const mockTaskCommandFactory = vi.fn(() => ({
    execute: mockTaskCommandExecute,
    toggle: vi.fn(),
  }));
  return {
    httpSupabase,
    mockCreateAdapter,
    mockTaskWritesFactory,
    mockDelete,
    mockTaskCommandFactory,
    mockTaskCommandExecute,
  };
});

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: vi.fn(async () => ({
    ok: true,
    principal: {
      type: "user",
      userId: "user-123",
      credential: "cookie",
      profile: {},
    },
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

vi.mock("@/lib/tasks/commands", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tasks/commands")>(
    "@/lib/tasks/commands",
  );
  return {
    ...actual,
    createAuthenticatedTaskCommands: mockTaskCommandFactory,
    createTaskCommandsForUser: mockTaskCommandFactory,
  };
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
    mockTaskCommandExecute.mockResolvedValue({
      status: "complete",
      type: "complete",
      operation: "edit",
      operationId: "parity-edit-1",
      task,
    });
    mockDelete.mockResolvedValue({ type: "deleted" });
  });

  it("maps equivalent HTTP and AI edits to one canonical occurrence intent", async () => {
    const httpResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/tasks/task-1", {
        method: "PATCH",
        headers: { "Idempotency-Key": "parity-edit-1" },
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
        operationId: "parity-edit-1",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ task });
    expect(aiResult).toEqual(task);
    expect(mockTaskCommandExecute.mock.calls).toEqual([
      [{
        type: "edit",
        taskId: "task-1",
        operationId: "parity-edit-1",
        updates: {
          title: "Move review",
          due_date: "2026-08-05",
          status: "done",
        },
      }],
      [{
        type: "edit",
        taskId: "task-1",
        operationId: "parity-edit-1",
        updates: {
          title: "Move review",
          due_date: "2026-08-05",
          status: "done",
        },
      }],
    ]);
  });

  it("maps equivalent HTTP and AI Series edits to one versioned Task Command", async () => {
    const version = encodeSeriesVersion("series-1", 4);
    const httpResponse = await PATCH(
      new NextRequest(
        "http://localhost:3000/api/tasks/task-1?scope=following&date=2026-08-09",
        {
          method: "PATCH",
          headers: {
            "Idempotency-Key": "series-edit-1",
            "If-Match": version,
          },
          body: JSON.stringify({ title: "Series title" }),
        },
      ),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await updateTaskTool().execute(
      {
        taskId: "task-1",
        title: "Series title",
        scope: "following",
        effectiveDate: "2026-08-09",
        expectedVersion: version,
        operationId: "series-edit-1",
      },
      aiContext,
    );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ success: true, task });
    expect(aiResult).toEqual({ success: true, task });
    expect(mockTaskCommandExecute.mock.calls).toEqual([
      [{
        type: "edit",
        taskId: "task-1",
        operationId: "series-edit-1",
        scope: "following",
        effectiveDate: "2026-08-09",
        expectedVersion: version,
        updates: { title: "Series title" },
      }],
      [{
        type: "edit",
        taskId: "task-1",
        operationId: "series-edit-1",
        scope: "following",
        effectiveDate: "2026-08-09",
        expectedVersion: version,
        updates: { title: "Series title" },
      }],
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
      mockTaskCommandExecute.mockResolvedValue(outcome);

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

  it("maps equivalent HTTP and AI scoped deletions to one Task Command intent", async () => {
    const httpResponse = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/tasks/task-1?scope=all&date=2026-08-09",
        {
          method: "DELETE",
          headers: {
            "Idempotency-Key": "scope-delete-1",
            "If-Match": encodeSeriesVersion("series-1", 4),
          },
        },
      ),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await taskTools()
      .find((tool) => tool.name === "deleteTask")!
      .execute(
        {
          taskId: "task-1",
          operationId: "scope-delete-1",
          scope: "all",
          effectiveDate: "2026-08-09",
          expectedVersion: encodeSeriesVersion("series-1", 4),
        },
        aiContext,
      );

    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ success: true });
    expect(aiResult).toEqual({ success: true });
    expect(mockTaskCommandExecute.mock.calls).toEqual([
      [{
        type: "skip",
        taskId: "task-1",
        operationId: "scope-delete-1",
        scope: "all",
        effectiveDate: "2026-08-09",
        expectedVersion: encodeSeriesVersion("series-1", 4),
      }],
      [{
        type: "skip",
        taskId: "task-1",
        operationId: "scope-delete-1",
        scope: "all",
        effectiveDate: "2026-08-09",
        expectedVersion: encodeSeriesVersion("series-1", 4),
      }],
    ]);
  });

  it("renders a shared not-found deletion outcome consistently", async () => {
    mockTaskCommandExecute.mockResolvedValue({
      status: "not-found",
      type: "not-found",
      operation: "skip",
      operationId: "missing-delete-1",
    });
    const httpResponse = await DELETE(
      new NextRequest("http://localhost:3000/api/tasks/task-1", {
        method: "DELETE",
        headers: { "Idempotency-Key": "missing-delete-1" },
      }),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    const aiResult = await taskTools()
      .find((tool) => tool.name === "deleteTask")!
      .execute(
        { taskId: "task-1", operationId: "missing-delete-1" },
        aiContext,
      );

    expect(httpResponse.status).toBe(404);
    expect(await httpResponse.json()).toEqual({ error: "Task not found" });
    expect(aiResult).toEqual({ error: "Task not found" });
  });
});
