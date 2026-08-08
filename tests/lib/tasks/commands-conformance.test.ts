import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/lib/db/types";
import {
  encodeSeriesVersion,
  TaskCommands,
  type TaskCommandPersistence,
} from "@/lib/tasks/commands";

function fixtureTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "ordinary-task",
    user_id: "conformance-user",
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
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

type ConformanceFixture = {
  persistence: TaskCommandPersistence;
  rpc?: ReturnType<typeof vi.fn>;
};

function createReferenceFixture(): ConformanceFixture {
  const ordinary = fixtureTask();
  const recurring = fixtureTask({
    id: "recurring-task",
    recurring_series_id: "series-1",
    recurring_occurrence_id: "occurrence-1",
    scheduled_date: "2026-08-08",
  });
  const complete = { status: "complete" as const };
  const persistence: TaskCommandPersistence = {
    getTask: vi.fn(async (taskId) => taskId === ordinary.id ? ordinary : recurring),
    ordinary: {
      complete: vi.fn().mockResolvedValue(complete),
      reopen: vi.fn().mockResolvedValue(complete),
      skip: vi.fn().mockResolvedValue(complete),
      edit: vi.fn().mockResolvedValue(complete),
    },
    lifecycle: {
      completeOccurrence: vi.fn().mockResolvedValue(complete),
      reopenOccurrence: vi.fn().mockResolvedValue(complete),
      skipOccurrence: vi.fn().mockResolvedValue(complete),
      editOccurrence: vi.fn().mockResolvedValue(complete),
      reviseSeries: vi.fn().mockResolvedValue(complete),
      endSeries: vi.fn().mockResolvedValue(complete),
    },
  };
  return { persistence };
}

function createRpcFixture(): ConformanceFixture {
  const reference = createReferenceFixture();
  const rpc = vi.fn(async (
    name: string,
    args: { p_operation: string; p_request: Record<string, unknown> },
  ) => ({
    data: {
      status: "complete" as const,
      ...(name === "recurring_task_lifecycle"
        ? { operation: args.p_operation }
        : {}),
    },
    error: null,
  }));
  const callOrdinary = (operation: string) => vi.fn(async (request: object) => {
    await rpc("task_command_atomic", {
      p_operation: operation,
      p_request: request as Record<string, unknown>,
    });
    return { status: "complete" as const };
  });
  const callLifecycle = (operation: string) => vi.fn(async (request: object) => {
    await rpc("recurring_task_lifecycle", {
      p_operation: operation,
      p_request: request as Record<string, unknown>,
    });
    return { status: "complete", type: "complete" } as never;
  });
  return {
    rpc,
    persistence: {
      ...reference.persistence,
      ordinary: {
        complete: callOrdinary("complete"),
        reopen: callOrdinary("reopen"),
        skip: callOrdinary("skip"),
        edit: callOrdinary("edit"),
      },
      lifecycle: {
        completeOccurrence: callLifecycle("complete-occurrence"),
        reopenOccurrence: callLifecycle("reopen-occurrence"),
        skipOccurrence: callLifecycle("skip-occurrence"),
        editOccurrence: callLifecycle("edit-occurrence"),
        reviseSeries: callLifecycle("revise-series"),
        endSeries: callLifecycle("end-series"),
      },
    },
  };
}

function runTaskCommandConformance(
  name: string,
  createFixture: () => ConformanceFixture,
): void {
  describe(`${name} Task Command conformance`, () => {
    it("uses one scope matrix for ordinary Tasks and recurring Occurrences", async () => {
      const fixture = createFixture();
      const commands = new TaskCommands(fixture.persistence);
      const version = encodeSeriesVersion("series-1", 7);

      await commands.execute({
        type: "edit",
        userId: "conformance-user",
        taskId: "ordinary-task",
        operationId: "conformance-ordinary-edit",
        updates: { title: "Ordinary edit" },
      });
      await commands.execute({
        type: "edit",
        userId: "conformance-user",
        taskId: "recurring-task",
        scope: "this",
        operationId: "conformance-occurrence-edit",
        updates: { title: "Occurrence override" },
      });
      await commands.execute({
        type: "edit",
        userId: "conformance-user",
        taskId: "recurring-task",
        scope: "following",
        operationId: "conformance-series-edit",
        expectedVersion: version,
        updates: { title: "Series revision" },
      });
      await commands.execute({
        type: "skip",
        userId: "conformance-user",
        taskId: "recurring-task",
        scope: "this",
        operationId: "conformance-occurrence-skip",
      });
      await commands.execute({
        type: "skip",
        userId: "conformance-user",
        taskId: "recurring-task",
        scope: "all",
        operationId: "conformance-series-end",
        expectedVersion: version,
      });

      expect(fixture.persistence.ordinary.edit).toHaveBeenCalledOnce();
      expect(fixture.persistence.lifecycle.editOccurrence).toHaveBeenCalledOnce();
      expect(fixture.persistence.lifecycle.reviseSeries).toHaveBeenCalledOnce();
      expect(fixture.persistence.lifecycle.skipOccurrence).toHaveBeenCalledOnce();
      expect(fixture.persistence.lifecycle.endSeries).toHaveBeenCalledOnce();
      expect(fixture.persistence.ordinary.skip).not.toHaveBeenCalled();

      expect(fixture.persistence.lifecycle.reviseSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "following",
          expectedRevisionToken: 7,
          idempotencyKey: "conformance-series-edit",
        }),
      );
      expect(fixture.persistence.lifecycle.endSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "all",
          expectedRevisionToken: 7,
          idempotencyKey: "conformance-series-end",
        }),
      );
    });
  });
}

runTaskCommandConformance("in-memory reference", createReferenceFixture);
runTaskCommandConformance("Supabase RPC-shaped", createRpcFixture);
