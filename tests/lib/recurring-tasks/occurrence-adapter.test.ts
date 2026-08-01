import { describe, expect, it, vi } from "vitest";

import {
  OccurrenceAdapter,
  toTaskUpdate,
  toOccurrenceEditIntent,
  type OccurrenceAdapterPersistence,
} from "@/lib/recurring-tasks/occurrence-adapter";
import type { Task } from "@/lib/db/types";

function recurringTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Daily review",
    description: null,
    is_completed: false,
    priority: 1,
    category_id: null,
    due_date: "2026-08-01",
    due_time: "09:00:00",
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "personal",
    sort_order: 65536,
    project_id: null,
    recurring_series_id: "series-1",
    recurring_occurrence_id: "occurrence-1",
    scheduled_date: "2026-08-01",
    recurrence_occurrence_state: "open",
    occurrence_overrides: {},
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function lifecycleSuccess(status: "complete" | "already-applied" = "complete") {
  return {
    status,
    type: status,
    value: {},
    series: {},
    occurrences: [],
    intentionalAbsences: [],
  } as never;
}

function createPersistence(task: Task = recurringTask()): OccurrenceAdapterPersistence {
  return {
    getTask: vi.fn().mockResolvedValue(task),
  };
}

describe("OccurrenceAdapter", () => {
  it("maps product and AI fields to overrides without accepting Scheduled Date edits", () => {
    const intent = toOccurrenceEditIntent({
      userId: " user-1 ",
      taskId: "task-1",
      title: "  Move review  ",
      description: "  Details  ",
      dueDate: "2026-08-05",
      dueTime: "10:30:00",
      status: "done",
    });

    expect(intent).toEqual({
      userId: "user-1",
      taskId: "task-1",
      updates: {
        title: "Move review",
        description: "Details",
        dueDate: "2026-08-05",
        dueTime: "10:30:00",
      },
      completed: true,
    });
    expect(intent.updates).not.toHaveProperty("scheduledDate");
  });

  it("maps one-occurrence edits to the lifecycle field-override command", async () => {
    const persistence = createPersistence();
    const editOccurrence = vi.fn().mockResolvedValue(lifecycleSuccess());
    const adapter = new OccurrenceAdapter(persistence, {
      lifecycle: {
        editOccurrence,
        completeOccurrence: vi.fn(),
        reopenOccurrence: vi.fn(),
        skipOccurrence: vi.fn(),
      },
    });

    const outcome = await adapter.edit(toOccurrenceEditIntent({
      userId: "user-1",
      taskId: "task-1",
      dueDate: "2026-08-05",
      title: "Move review",
    }));

    expect(outcome.status).toBe("complete");
    expect(editOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
      updates: {
        dueDate: "2026-08-05",
        title: "Move review",
      },
    });
  });

  it("maps completion and reopening to explicit lifecycle commands", async () => {
    const persistence = createPersistence();
    const completeOccurrence = vi.fn().mockResolvedValue(lifecycleSuccess());
    const reopenOccurrence = vi.fn().mockResolvedValue(
      lifecycleSuccess("already-applied"),
    );
    const adapter = new OccurrenceAdapter(persistence, {
      lifecycle: {
        editOccurrence: vi.fn(),
        completeOccurrence,
        reopenOccurrence,
        skipOccurrence: vi.fn(),
      },
    });

    const completed = await adapter.complete({
      userId: "user-1",
      taskId: "task-1",
    });
    const reopened = await adapter.reopen({
      userId: "user-1",
      taskId: "task-1",
    });

    expect(completed.status).toBe("complete");
    expect(reopened.status).toBe("already-applied");
    expect(completeOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
    });
    expect(reopenOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
    });
  });

  it("passes typed lifecycle failures through without parsing their reasons", async () => {
    const persistence = createPersistence();
    const conflict = {
      status: "conflict" as const,
      type: "conflict" as const,
      reason: "a reason that is not a presentation contract",
      expectedRevisionToken: 2,
      actualRevisionToken: 3,
    };
    const adapter = new OccurrenceAdapter(persistence, {
      lifecycle: {
        editOccurrence: vi.fn().mockResolvedValue(conflict),
        completeOccurrence: vi.fn(),
        reopenOccurrence: vi.fn(),
        skipOccurrence: vi.fn(),
      },
    });

    const outcome = await adapter.edit(toOccurrenceEditIntent({
      userId: "user-1",
      taskId: "task-1",
      title: "Changed",
    }));

    expect(outcome).toEqual(conflict);
  });

  it("requires the lifecycle for recurring occurrence edits", async () => {
    const persistence = createPersistence();
    const adapter = new OccurrenceAdapter(persistence);

    const outcome = await adapter.edit(toOccurrenceEditIntent({
      userId: "user-1",
      taskId: "task-1",
      dueDate: "2026-08-05",
    }));

    expect(outcome).toEqual({
      status: "invalid-transition",
      type: "invalid-transition",
      reason: "Recurring Task Lifecycle is not configured",
    });
  });

  it("maps non-completion task statuses for standalone Task Writes", () => {
    expect(toTaskUpdate(toOccurrenceEditIntent({
      userId: "user-1",
      taskId: "task-1",
      status: "in_progress",
    }))).toEqual({
      is_completed: false,
      status: "in_progress",
    });
  });

  it("returns a typed not-found outcome before any edit", async () => {
    const persistence = createPersistence();
    persistence.getTask = vi.fn().mockResolvedValue(null);
    const adapter = new OccurrenceAdapter(persistence);

    const outcome = await adapter.edit(toOccurrenceEditIntent({
      userId: "user-1",
      taskId: "missing",
      title: "Changed",
    }));

    expect(outcome).toEqual({ status: "not-found", type: "not-found" });
  });
});
