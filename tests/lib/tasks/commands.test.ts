import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/lib/db/types";
import {
  bindTaskCommands,
  encodeSeriesVersion,
  TaskCommands,
  type TaskCommandPersistence,
} from "@/lib/tasks/commands";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Review task",
    description: null,
    is_completed: false,
    priority: 0,
    category_id: null,
    due_date: null,
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "personal",
    sort_order: 0,
    project_id: null,
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function persistence(): TaskCommandPersistence {
  return {
    getTask: vi.fn(),
    ordinary: {
      complete: vi.fn(),
      reopen: vi.fn(),
      skip: vi.fn(),
      edit: vi.fn(),
    },
    lifecycle: {
      completeOccurrence: vi.fn(),
      reopenOccurrence: vi.fn(),
      skipOccurrence: vi.fn(),
      editOccurrence: vi.fn(),
      reviseSeries: vi.fn(),
      endSeries: vi.fn(),
    },
  };
}

describe("TaskCommands", () => {
  it("binds authenticated identity outside the command intent", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task());
    vi.mocked(store.ordinary.complete).mockResolvedValue({
      status: "complete",
    });
    const commands = bindTaskCommands("user-1", new TaskCommands(store));

    await commands.execute({
      type: "complete",
      taskId: "task-1",
      operationId: "bound-command-1",
    });

    expect(store.getTask).toHaveBeenCalledWith("task-1", "user-1");
    expect(store.ordinary.complete).toHaveBeenCalledWith({
      type: "complete",
      userId: "user-1",
      taskId: "task-1",
      operationId: "bound-command-1",
    });
  });

  it("rejects unsupported runtime command types without mutating", async () => {
    const store = persistence();

    await expect(
      new TaskCommands(store).execute({
        type: "toggle" as never,
        userId: "user-1",
        taskId: "task-1",
        operationId: "unsupported-command-1",
      }),
    ).resolves.toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      operation: "complete",
      operationId: "unsupported-command-1",
      reason: "Unsupported Task Command",
    });
    expect(store.getTask).not.toHaveBeenCalled();
    expect(store.ordinary.complete).not.toHaveBeenCalled();
  });

  it("routes an ordinary completion through ordinary task persistence", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task());
    vi.mocked(store.ordinary.complete).mockResolvedValue({
      status: "complete",
      task: task({ is_completed: true, status: "done" }),
    });

    const outcome = await new TaskCommands(store).execute({
      type: "complete",
      userId: "user-1",
      taskId: "task-1",
      operationId: "task-complete-1",
    });

    expect(outcome).toEqual({
      status: "complete",
      type: "complete",
      operation: "complete",
      operationId: "task-complete-1",
      task: task({ is_completed: true, status: "done" }),
    });
    expect(store.ordinary.complete).toHaveBeenCalledWith({
      type: "complete",
      userId: "user-1",
      taskId: "task-1",
      operationId: "task-complete-1",
    });
    expect(store.lifecycle.completeOccurrence).not.toHaveBeenCalled();
  });

  it("routes an ordinary field edit through ordinary Task Command persistence", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task());
    vi.mocked(store.ordinary.edit).mockResolvedValue({
      status: "complete",
      task: task({ title: "Updated title" }),
    });

    await expect(
      new TaskCommands(store).execute({
        type: "edit",
        userId: "user-1",
        taskId: "task-1",
        operationId: "ordinary-edit-1",
        updates: { title: "Updated title" },
      }),
    ).resolves.toMatchObject({
      status: "complete",
      operation: "edit",
      operationId: "ordinary-edit-1",
      task: task({ title: "Updated title" }),
    });

    expect(store.ordinary.edit).toHaveBeenCalledWith({
      type: "edit",
      userId: "user-1",
      taskId: "task-1",
      operationId: "ordinary-edit-1",
      updates: { title: "Updated title" },
    });
  });

  it("rejects future and all scopes for ordinary Tasks before persistence", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task());

    await expect(
      new TaskCommands(store).execute({
        type: "edit",
        userId: "user-1",
        taskId: "task-1",
        scope: "following",
        operationId: "ordinary-scoped-edit-1",
        updates: { title: "Not a Series edit" },
      }),
    ).resolves.toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      operation: "edit",
      operationId: "ordinary-scoped-edit-1",
      reason: "Task Commands only support the this scope for ordinary Tasks",
    });
    expect(store.ordinary.edit).not.toHaveBeenCalled();
  });

  it("routes a single-occurrence field edit as an override with visible identity", async () => {
    const store = persistence();
    const current = task({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
      scheduled_date: "2026-08-07",
    });
    vi.mocked(store.getTask).mockResolvedValue(current);
    vi.mocked(store.lifecycle.editOccurrence).mockResolvedValue({
      status: "complete",
      type: "complete",
    } as never);

    await expect(
      new TaskCommands(store).execute({
        type: "edit",
        userId: "user-1",
        taskId: "task-1",
        scope: "this",
        operationId: "occurrence-edit-1",
        updates: {
          title: "  Personal title  ",
          due_date: "2026-08-09",
          status: "in_progress",
        },
      }),
    ).resolves.toMatchObject({
      status: "complete",
      operation: "edit",
      operationId: "occurrence-edit-1",
    });

    expect(store.lifecycle.editOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      taskId: "task-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
      scope: "this",
      scheduledDate: "2026-08-07",
      updates: {
        title: "Personal title",
        dueDate: "2026-08-09",
        status: "in_progress",
      },
      idempotencyKey: "occurrence-edit-1",
    });
  });

  it.each(["following", "all"] as const)(
    "routes scope=%s field edits through a versioned Series Revision",
    async (scope) => {
      const store = persistence();
      const current = task({
        recurring_series_id: "series-1",
        recurring_occurrence_id: "occurrence-1",
        scheduled_date: "2026-08-07",
      });
      vi.mocked(store.getTask).mockResolvedValue(current);
      vi.mocked(store.lifecycle.reviseSeries).mockResolvedValue({
        status: "complete",
        type: "complete",
      } as never);

      await expect(
        new TaskCommands(store).execute({
          type: "edit",
          userId: "user-1",
          taskId: "task-1",
          scope,
          effectiveDate: "2026-08-08",
          operationId: `series-edit-${scope}-1`,
          expectedVersion: encodeSeriesVersion("series-1", 4),
          updates: {
            title: "Following title",
            priority: 2,
          },
        }),
      ).resolves.toMatchObject({
        status: "complete",
        operation: "edit",
        operationId: `series-edit-${scope}-1`,
      });

      expect(store.lifecycle.reviseSeries).toHaveBeenCalledWith({
        userId: "user-1",
        taskId: "task-1",
        occurrenceId: "occurrence-1",
        seriesId: "series-1",
        scope,
        effectiveDate: "2026-08-08",
        defaults: {
          title: "Following title",
          priority: 2,
        },
        expectedRevisionToken: 4,
        idempotencyKey: `series-edit-${scope}-1`,
      });
    },
  );

  it("requires a valid opaque Series version for Series effects", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
      scheduled_date: "2026-08-07",
    }));

    await expect(
      new TaskCommands(store).execute({
        type: "edit",
        userId: "user-1",
        taskId: "task-1",
        scope: "following",
        operationId: "missing-version-1",
        updates: { title: "Unsafe revision" },
      }),
    ).resolves.toMatchObject({
      status: "invalid-transition",
      operation: "edit",
      operationId: "missing-version-1",
    });
    expect(store.lifecycle.reviseSeries).not.toHaveBeenCalled();
  });

  it.each(["following", "all"] as const)(
    "maps scope=%s deletion to an explicit versioned endSeries command",
    async (scope) => {
      const store = persistence();
      vi.mocked(store.getTask).mockResolvedValue(task({
        recurring_series_id: "series-1",
        recurring_occurrence_id: "occurrence-1",
        scheduled_date: "2026-08-07",
      }));
      vi.mocked(store.lifecycle.endSeries).mockResolvedValue({
        status: "complete",
        type: "complete",
      } as never);

      await expect(
        new TaskCommands(store).execute({
          type: "skip",
          userId: "user-1",
          taskId: "task-1",
          scope,
          operationId: `series-delete-${scope}-1`,
          expectedVersion: encodeSeriesVersion("series-1", 5),
        }),
      ).resolves.toMatchObject({
        status: "complete",
        operation: "skip",
        operationId: `series-delete-${scope}-1`,
      });

      expect(store.lifecycle.endSeries).toHaveBeenCalledWith({
        userId: "user-1",
        taskId: "task-1",
        occurrenceId: "occurrence-1",
        seriesId: "series-1",
        scope,
        effectiveDate: "2026-08-07",
        expectedRevisionToken: 5,
        idempotencyKey: `series-delete-${scope}-1`,
      });
    },
  );

  it("replays a destructive command after its visible Task is gone", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(null);
    store.replay = vi.fn().mockResolvedValue({
      status: "complete",
    });

    await expect(
      new TaskCommands(store).execute({
        type: "skip",
        userId: "user-1",
        taskId: "task-1",
        operationId: "task-skip-1",
      }),
    ).resolves.toEqual({
      status: "complete",
      type: "complete",
      operation: "skip",
      operationId: "task-skip-1",
    });
    expect(store.replay).toHaveBeenCalledWith({
      type: "skip",
      userId: "user-1",
      taskId: "task-1",
      operationId: "task-skip-1",
    });
    expect(store.ordinary.skip).not.toHaveBeenCalled();
  });

  it("routes a recurring completion through the lifecycle with visible identity and scope", async () => {
    const store = persistence();
    const current = task({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
      scheduled_date: "2026-08-07",
    });
    const completed = task({
      ...current,
      is_completed: true,
      status: "done",
      recurrence_occurrence_state: "completed",
    });
    vi.mocked(store.getTask)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(completed);
    vi.mocked(store.lifecycle.completeOccurrence).mockResolvedValue({
      status: "complete",
      type: "complete",
    } as never);

    const outcome = await new TaskCommands(store).execute({
      type: "complete",
      userId: "user-1",
      taskId: "task-1",
      scope: "this",
      operationId: "occurrence-complete-1",
      expectedRevisionToken: 4,
    });

    expect(outcome).toEqual({
      status: "complete",
      type: "complete",
      operation: "complete",
      operationId: "occurrence-complete-1",
      task: completed,
    });
    expect(store.lifecycle.completeOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      taskId: "task-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
      scope: "this",
      scheduledDate: "2026-08-07",
      expectedRevisionToken: 4,
      idempotencyKey: "occurrence-complete-1",
    });
    expect(store.ordinary.complete).not.toHaveBeenCalled();
  });

  it.each([
    ["reopen", "reopenOccurrence"],
    ["skip", "skipOccurrence"],
  ] as const)("keeps %s as an explicit command", async (type, method) => {
    const store = persistence();
    const current = task({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
      scheduled_date: "2026-08-07",
    });
    vi.mocked(store.getTask).mockResolvedValue(current);
    vi.mocked(store.lifecycle[method]).mockResolvedValue({
      status: "already-applied",
      type: "already-applied",
    } as never);

    const outcome = await new TaskCommands(store).execute({
      type,
      userId: "user-1",
      taskId: "task-1",
      operationId: `occurrence-${type}-1`,
    });

    expect(outcome).toMatchObject({
      status: "already-applied",
      type: "already-applied",
      operation: type,
      operationId: `occurrence-${type}-1`,
    });
    expect(store.lifecycle[method]).toHaveBeenCalledOnce();
  });

  it("fails closed when recurring membership metadata is incomplete", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(
      task({ recurring_series_id: "series-1", recurring_occurrence_id: null }),
    );

    await expect(
      new TaskCommands(store).execute({
        type: "complete",
        userId: "user-1",
        taskId: "task-1",
        operationId: "incomplete-membership-1",
      }),
    ).resolves.toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      operation: "complete",
      operationId: "incomplete-membership-1",
      reason: "Recurring Task Occurrence metadata is incomplete",
    });
    expect(store.ordinary.complete).not.toHaveBeenCalled();
    expect(store.lifecycle.completeOccurrence).not.toHaveBeenCalled();
  });

  it("rejects non-occurrence scopes before choosing a persistence adapter", async () => {
    const store = persistence();
    vi.mocked(store.getTask).mockResolvedValue(task());

    await expect(
      new TaskCommands(store).execute({
        type: "skip",
        userId: "user-1",
        taskId: "task-1",
        scope: "following" as never,
        operationId: "wrong-scope-1",
      }),
    ).resolves.toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      operation: "skip",
      operationId: "wrong-scope-1",
      reason: "Task Commands only support the this scope for occurrence state",
    });
    expect(store.ordinary.skip).not.toHaveBeenCalled();
    expect(store.lifecycle.skipOccurrence).not.toHaveBeenCalled();
  });

  it("preserves an already-applied lifecycle outcome on operation replay", async () => {
    const store = persistence();
    const current = task({
      recurring_series_id: "series-1",
      recurring_occurrence_id: "occurrence-1",
    });
    vi.mocked(store.getTask).mockResolvedValue(current);
    vi.mocked(store.lifecycle.reopenOccurrence).mockResolvedValue({
      status: "already-applied",
      type: "already-applied",
    } as never);

    await expect(
      new TaskCommands(store).execute({
        type: "reopen",
        userId: "user-1",
        taskId: "task-1",
        operationId: "reopen-replay-1",
      }),
    ).resolves.toMatchObject({
      status: "already-applied",
      type: "already-applied",
      operation: "reopen",
      operationId: "reopen-replay-1",
    });
  });
});
