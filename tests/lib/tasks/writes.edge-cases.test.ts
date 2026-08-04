import { describe, expect, it, vi } from "vitest";
import {
  TaskNotFoundError,
  TaskWrites,
  taskDeletionErrorMessage,
  taskDeletionHttpFailure,
  type TaskWritePersistence,
} from "@/lib/tasks/writes";

function persistence(): TaskWritePersistence {
  return {
    getMaxSortOrder: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue({ id: "task-1" }),
    getTask: vi.fn(),
    updateTask: vi.fn().mockResolvedValue({ id: "task-1" }),
  } as unknown as TaskWritePersistence;
}

function recurringTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    is_completed: false,
    recurring_series_id: "series-1",
    recurring_occurrence_id: "occurrence-1",
    scheduled_date: "2026-08-04",
    recurrence_occurrence_state: "open",
    ...overrides,
  };
}

const complete = { status: "complete", type: "complete" } as const;

describe("Task Writes edge contracts", () => {
  it("keeps deletion presentation and HTTP mappings stable for every domain outcome", () => {
    const conflict = {
      type: "conflict" as const,
      reason: "revision changed",
      expectedRevisionToken: 2,
      actualRevisionToken: 3,
    };
    expect(taskDeletionErrorMessage(conflict)).toBe("Task deletion conflict");
    expect(taskDeletionErrorMessage(conflict, "occurrence")).toBe(
      "Task occurrence conflict",
    );
    expect(taskDeletionErrorMessage(conflict, "series")).toBe(
      "Recurring task changed concurrently",
    );
    expect(
      taskDeletionErrorMessage({
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-01", to: "2026-08-07" },
        coverageHorizon: null,
        reason: "provider unavailable",
      }),
    ).toBe("Recurring task coverage is temporarily unavailable");
    expect(taskDeletionErrorMessage({ type: "invalid-transition", reason: "blocked" })).toBe(
      "blocked",
    );

    expect(taskDeletionHttpFailure({ type: "not-found" }, "series")).toEqual({
      error: "Recurring task not found",
      status: 404,
    });
    expect(taskDeletionHttpFailure(conflict, "occurrence")).toEqual({
      error: "Task occurrence conflict",
      status: 409,
    });
    expect(
      taskDeletionHttpFailure({
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-01", to: "2026-08-07" },
        coverageHorizon: null,
        reason: "provider unavailable",
      }),
    ).toMatchObject({ status: 503 });
    expect(
      taskDeletionHttpFailure({ type: "invalid-transition", reason: "blocked" }),
    ).toEqual({ error: "blocked", status: 400 });
  });

  it("rejects empty identities and missing persistence before attempting a mutation", async () => {
    const empty = persistence();
    await expect(
      new TaskWrites(empty).delete({ userId: "  ", taskId: "  " }),
    ).resolves.toEqual({ type: "not-found" });
    expect(empty.getTask).not.toHaveBeenCalled();

    const noDelete = persistence();
    vi.mocked(noDelete.getTask).mockResolvedValue({ id: "task-1" } as never);
    await expect(
      new TaskWrites(noDelete).delete({ userId: "user-1", taskId: "task-1" }),
    ).rejects.toThrow("Task deletion persistence is not configured");

    await expect(
      new TaskWrites(persistence()).configureReminder({
        userId: "user-1",
        taskId: "task-1",
        reminders: [],
      }),
    ).rejects.toThrow("Task reminder configuration persistence is not configured");
  });

  it("maps recurring deletion lifecycle failures and protects skipped occurrences", async () => {
    const skipped = persistence();
    vi.mocked(skipped.getTask).mockResolvedValue(
      recurringTask({ recurrence_occurrence_state: "skipped" }) as never,
    );
    await expect(
      new TaskWrites(skipped).delete({ userId: "user-1", taskId: "task-1" }),
    ).resolves.toEqual({ type: "not-found" });

    const missingLifecycle = persistence();
    vi.mocked(missingLifecycle.getTask).mockResolvedValue(recurringTask() as never);
    missingLifecycle.lifecycle = { getSeries: vi.fn() } as never;
    await expect(
      new TaskWrites(missingLifecycle).delete({
        userId: "user-1",
        taskId: "task-1",
        scope: "following",
      }),
    ).resolves.toMatchObject({
      type: "invalid-transition",
      reason: "Recurring task deletion requires lifecycle persistence",
    });

    const missingEnd = persistence();
    vi.mocked(missingEnd.getTask).mockResolvedValue(recurringTask() as never);
    missingEnd.lifecycle = {
      getSeries: vi.fn().mockResolvedValue({
        status: "complete",
        type: "complete",
        series: { status: "active" },
      }),
      deleteSeries: vi.fn(),
    } as never;
    await expect(
      new TaskWrites(missingEnd).delete({
        userId: "user-1",
        taskId: "task-1",
        scope: "following",
      }),
    ).resolves.toMatchObject({
      type: "invalid-transition",
      reason: "Recurring task deletion requires lifecycle persistence",
    });

    const missingDelete = persistence();
    vi.mocked(missingDelete.getTask).mockResolvedValue(recurringTask() as never);
    missingDelete.lifecycle = {
      getSeries: vi.fn().mockResolvedValue({
        status: "complete",
        type: "complete",
        series: { status: "active" },
      }),
      endSeries: vi.fn(),
    } as never;
    await expect(
      new TaskWrites(missingDelete).delete({
        userId: "user-1",
        taskId: "task-1",
        scope: "all",
      }),
    ).resolves.toMatchObject({
      type: "invalid-transition",
      reason: "Recurring task deletion requires lifecycle persistence",
    });
  });

  it.each([
    ["not-found", { status: "not-found", type: "not-found" }, { type: "not-found" }],
    [
      "conflict",
      {
        status: "conflict",
        type: "conflict",
        reason: "changed",
        expectedRevisionToken: 1,
        actualRevisionToken: 2,
      },
      { type: "conflict", reason: "changed", expectedRevisionToken: 1, actualRevisionToken: 2 },
    ],
    [
      "coverage",
      {
        status: "coverage-unavailable",
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-04", to: "2026-08-10" },
        coverageHorizon: "2026-08-04",
        reason: "coverage failed",
      },
      {
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-04", to: "2026-08-10" },
        coverageHorizon: "2026-08-04",
        reason: "coverage failed",
      },
    ],
    [
      "invalid",
      { status: "invalid-transition", type: "invalid-transition", reason: "not allowed" },
      { type: "invalid-transition", reason: "not allowed" },
    ],
  ] as const)("maps a %s lifecycle outcome for following deletion", async (_label, outcome, expected) => {
    const writes = persistence();
    vi.mocked(writes.getTask).mockResolvedValue(recurringTask() as never);
    const getSeries = vi.fn().mockResolvedValue({
      status: "complete",
      type: "complete",
      series: { status: "active" },
    });
    const endSeries = vi.fn().mockResolvedValue(outcome);
    writes.lifecycle = { getSeries, endSeries } as never;

    await expect(
      new TaskWrites(writes).delete({
        userId: "user-1",
        taskId: "task-1",
        scope: "following",
      }),
    ).resolves.toEqual(expected);
  });

  it("handles series deletion guards, terminal series, and lifecycle errors", async () => {
    const writes = new TaskWrites(persistence());
    await expect(
      writes.deleteSeries({ userId: " ", seriesId: " " }),
    ).resolves.toEqual({ type: "not-found" });
    await expect(
      writes.deleteSeries({ userId: "user-1", seriesId: "series-1" }),
    ).rejects.toThrow("Recurring series deletion requires lifecycle persistence");

    const getSeries = vi.fn();
    const deleteSeries = vi.fn();
    const withLifecycle = new TaskWrites({ lifecycle: { getSeries, deleteSeries } } as never);
    getSeries.mockResolvedValue({
      status: "complete",
      type: "complete",
      series: { status: "ended" },
    });
    await expect(
      withLifecycle.deleteSeries({ userId: "user-1", seriesId: "series-1" }),
    ).resolves.toEqual({ type: "not-found" });

    for (const outcome of [
      { status: "conflict", type: "conflict", reason: "changed" },
      {
        status: "coverage-unavailable",
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-01", to: "2026-08-02" },
        coverageHorizon: null,
        reason: "unavailable",
      },
      { status: "invalid-transition", type: "invalid-transition", reason: "blocked" },
    ] as const) {
      getSeries.mockResolvedValueOnce({
        status: "complete",
        type: "complete",
        series: { status: "active" },
      });
      deleteSeries.mockResolvedValueOnce(outcome);
      await expect(
        withLifecycle.deleteSeries({ userId: "user-1", seriesId: "series-1" }),
      ).resolves.toMatchObject({ type: outcome.type });
    }
  });

  it("covers missing-task and recurring execute outcomes without falling back to raw writes", async () => {
    const missingOrder = persistence();
    vi.mocked(missingOrder.getTask).mockResolvedValue(null);
    missingOrder.lifecycle = { editOccurrence: vi.fn() } as never;
    vi.mocked(missingOrder.updateTask).mockResolvedValue({ id: "ordered" } as never);
    await expect(
      new TaskWrites(missingOrder).execute({
        type: "order",
        userId: "user-1",
        taskId: "task-1",
        sortOrder: 3,
      }),
    ).resolves.toEqual({ type: "ordered", task: { id: "ordered" } });

    const missingToggle = persistence();
    vi.mocked(missingToggle.getTask).mockResolvedValue(null);
    await expect(
      new TaskWrites(missingToggle).execute({
        type: "toggle-completion",
        userId: "user-1",
        taskId: "task-1",
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    const missingAfterOrder = persistence();
    vi.mocked(missingAfterOrder.getTask)
      .mockResolvedValueOnce(recurringTask() as never)
      .mockResolvedValueOnce(null);
    missingAfterOrder.lifecycle = { editOccurrence: vi.fn().mockResolvedValue(complete) } as never;
    await expect(
      new TaskWrites(missingAfterOrder).execute({
        type: "order",
        userId: "user-1",
        taskId: "task-1",
        sortOrder: 3,
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    const missingAfterToggle = persistence();
    vi.mocked(missingAfterToggle.getTask)
      .mockResolvedValueOnce(recurringTask() as never)
      .mockResolvedValueOnce(null);
    missingAfterToggle.lifecycle = {
      completeOccurrence: vi.fn().mockResolvedValue(complete),
    } as never;
    await expect(
      new TaskWrites(missingAfterToggle).execute({
        type: "toggle-completion",
        userId: "user-1",
        taskId: "task-1",
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("normalizes full standalone updates and recurring field overrides", async () => {
    const standalone = persistence();
    vi.mocked(standalone.updateTask).mockResolvedValue({ id: "task-1" } as never);
    await new TaskWrites(standalone, () => new Date("2026-08-03T09:00:00.000Z")).execute({
      type: "update",
      userId: "user-1",
      taskId: "task-1",
      values: {
        title: " title ",
        description: " description ",
        priority: 2,
        category_id: "category-1",
        due_date: "2026-08-05",
        due_time: "09:00",
        completion_difficulty: 3,
        status: "in_progress",
        section: "work",
        sort_order: 7,
        project_id: "project-1",
      },
    } as never);
    expect(standalone.updateTask).toHaveBeenCalledWith(
      "task-1",
      "user-1",
      expect.objectContaining({
        title: "title",
        description: "description",
        priority: 2,
        category_id: "category-1",
        due_date: "2026-08-05",
        due_time: "09:00",
        completion_difficulty: 3,
        section: "work",
        sort_order: 7,
        project_id: "project-1",
        status: "in_progress",
        is_completed: false,
        completed_at: null,
      }),
    );

    const recurring = persistence();
    vi.mocked(recurring.getTask).mockResolvedValue(recurringTask() as never);
    const editOccurrence = vi.fn().mockResolvedValue(complete);
    recurring.lifecycle = { editOccurrence } as never;
    await new TaskWrites(recurring).execute({
      type: "update",
      userId: "user-1",
      taskId: "task-1",
      values: {
        title: "title",
        description: "description",
        priority: 1,
        category_id: "category-1",
        due_date: "2026-08-05",
        due_time: "09:00",
        status: undefined,
        section: "work",
        sort_order: 8,
        project_id: "project-1",
      },
    } as never);
    expect(editOccurrence).toHaveBeenCalledWith({
      userId: "user-1",
      seriesId: "series-1",
      occurrenceId: "occurrence-1",
      updates: {
        title: "title",
        description: "description",
        priority: 1,
        categoryId: "category-1",
        dueDate: "2026-08-05",
        dueTime: "09:00",
        section: "work",
        sortOrder: 8,
        projectId: "project-1",
      },
      completed: undefined,
    });

    await expect(
      new TaskWrites(persistence()).execute({ type: "unsupported" } as never),
    ).rejects.toThrow("Unsupported task write intent");
  });

  it("returns typed reminder validation outcomes for malformed requests", async () => {
    const writes = new TaskWrites(persistence());
    const requests = [
      [null, "request", "Task reminder request is required"],
      [{ userId: "", taskId: "task-1", reminders: [] }, "userId", "User identity is required"],
      [{ userId: "user-1", taskId: "", reminders: [] }, "taskId", "Task identity is required"],
      [{ userId: "user-1", taskId: "task-1", reminders: "no" }, "reminders", "reminders must be an array"],
      [{ userId: "user-1", taskId: "task-1", reminders: [null] }, "reminders[0]", "Reminder type is invalid"],
      [{ userId: "user-1", taskId: "task-1", reminders: [{ reminderType: "relative", channels: [] }] }, "reminders[0].channels", "At least one reminder channel is required"],
      [{ userId: "user-1", taskId: "task-1", reminders: [{ reminderType: "relative", relativeMinutes: 1, channels: ["sms"] }] }, "reminders[0].channels", "Reminder channel is invalid"],
      [{ userId: "user-1", taskId: "task-1", reminders: [{ reminderType: "relative", relativeMinutes: 1, channels: ["push", "push"] }] }, "reminders[0].channels", "Reminder channels must be unique"],
      [{ userId: "user-1", taskId: "task-1", reminders: [{ reminderType: "relative", relativeMinutes: 525601, channels: ["push"] }] }, "reminders[0].relativeMinutes", "relativeMinutes must be a whole number within one year"],
    ] as const;

    for (const [request, field, message] of requests) {
      await expect(writes.configureReminders(request as never)).resolves.toEqual({
        type: "invalid",
        field,
        message,
      });
    }
  });
});
