/** Routes authenticated Task commands to ordinary or recurring atomic persistence. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { TasksDB } from "@/lib/db";

import type { Task } from "@/lib/db/types";

import { createActivatedRecurringTaskLifecycle } from "@/lib/recurring-tasks/internal/activation";

import type {
  OccurrenceCommandRequest,
  ReviseSeriesRequest,
  OccurrenceUpdateRequest,
  SeriesCommandRequest,
  LifecycleOutcome,
} from "@/lib/recurring-tasks/internal/lifecycle";

import type {
  TaskCommandPersistence,
  TaskCommandIntent,
  TaskCommandOutcome,
  TaskCommandType,
  TaskCommandSuccess,
  AuthenticatedTaskCommands,
  LegacyTaskToggleIntent,
  AuthenticatedTaskCommandPrincipal,
} from "./command-contract";

import {
  normalizeIntent,
  toCommandRequest,
  decodeExpectedRevision,
  lifecycleMethod,
  taskUpdatesToSeriesDefaults,
  taskUpdatesToOccurrenceRequest,
} from "./command-inputs";

import {
  invalidTransition,
  mapPersistenceOutcome,
  isLifecycleSuccess,
  mapLifecycleFailure,
  notFound,
} from "./command-outcomes";

import { SupabaseTaskCommandOrdinaryPersistence } from "./command-persistence";

export type {
  TaskCommandType,
  TaskCommandScope,
  TaskCommandUpdates,
  TaskCommandIntent,
  AuthenticatedTaskCommandPrincipal,
  AuthenticatedTaskCommandIntent,
  AuthenticatedTaskCommands,
  LegacyTaskToggleIntent,
  TaskCommandOrdinaryRequest,
  TaskCommandPersistenceOutcome,
  TaskCommandPersistence,
  TaskCommandSuccess,
  TaskCommandFailure,
  TaskCommandOutcome,
} from "./command-contract";

export {
  isTaskCommandSuccess,
  taskCommandErrorMessage,
  taskCommandHttpFailure,
} from "./command-outcomes";

export { decodeSeriesVersion, encodeSeriesVersion } from "@/lib/recurring-tasks/internal/capabilities";

/**
 * Shared Task Commands route by visible Task identity. The initial projection
 * read selects a branch; recurring branch authority stays inside lifecycle.
 */
export class TaskCommands {
  constructor(private readonly persistence: TaskCommandPersistence) {}

  async execute(intent: TaskCommandIntent): Promise<TaskCommandOutcome> {
    const normalized = normalizeIntent(intent);
    if (!normalized.ok) return normalized.outcome;

    const { operationId, operation, userId, taskId, scope } = normalized.value;
    if (
      (operation === "complete" || operation === "reopen")
      && scope !== undefined
      && scope !== "this"
    ) {
      return invalidTransition(
        operation,
        operationId,
        "Task Commands only support the this scope for occurrence state",
      );
    }
    if (operation === "edit" && !normalized.value.updates) {
      return invalidTransition(
        operation,
        operationId,
        "Task Command edits require at least one update",
      );
    }
    if (
      operation === "edit"
      && normalized.value.updates
      && Object.keys(normalized.value.updates).length === 0
    ) {
      return invalidTransition(
        operation,
        operationId,
        "Task Command edits require at least one update",
      );
    }

    const task = await this.persistence.getTask(taskId, userId);
    if (!task) {
      const replay = this.persistence.replay
        ? await this.persistence.replay(toCommandRequest(normalized.value))
        : { status: "not-found" as const };
      return mapPersistenceOutcome(replay, operation, operationId);
    }

    const hasSeries = Boolean(task.recurring_series_id);
    const hasOccurrence = Boolean(task.recurring_occurrence_id);
    if (hasSeries !== hasOccurrence) {
      return invalidTransition(
        operation,
        operationId,
        "Recurring Task Occurrence metadata is incomplete",
      );
    }

    if (
      operation === "edit"
      && !hasSeries
      && scope !== undefined
      && scope !== "this"
    ) {
      return invalidTransition(
        operation,
        operationId,
        "Task Commands only support the this scope for ordinary Tasks",
      );
    }

    if (hasSeries && hasOccurrence) {
      return this.executeRecurring(normalized.value, task);
    }

    if (
      operation === "skip"
      && scope !== undefined
      && scope !== "this"
      && (!hasSeries || !hasOccurrence)
    ) {
      return invalidTransition(
        operation,
        operationId,
        "Task Commands only support the this scope for occurrence state",
      );
    }

    const ordinaryRequest = toCommandRequest(normalized.value);
    const persistenceOutcome = operation === "edit"
      ? await this.persistence.ordinary.edit(ordinaryRequest)
      : await this.persistence.ordinary[operation](ordinaryRequest);
    return mapPersistenceOutcome(persistenceOutcome, operation, operationId);
  }

  private async executeRecurring(
    intent: TaskCommandIntent,
    task: Task,
  ): Promise<TaskCommandOutcome> {
    const operation = intent.type;
    const seriesId = task.recurring_series_id;
    const occurrenceId = task.recurring_occurrence_id;
    if (!seriesId || !occurrenceId) {
      return invalidTransition(
        operation,
        intent.operationId,
        "Recurring Task Occurrence metadata is incomplete",
      );
    }

    if (operation === "edit") {
      return this.executeRecurringEdit(intent, task, seriesId, occurrenceId);
    }
    if (operation === "skip" && intent.scope !== undefined && intent.scope !== "this") {
      return this.executeRecurringEnd(intent, task, seriesId, occurrenceId);
    }

    const expected = decodeExpectedRevision(
      intent,
      seriesId,
      false,
    );
    if (!expected.ok) return expected.outcome;
    const request: OccurrenceCommandRequest = {
      userId: intent.userId,
      taskId: task.id,
      seriesId,
      occurrenceId,
      scope: "this",
      ...(task.scheduled_date === undefined || task.scheduled_date === null
        ? {}
        : { scheduledDate: task.scheduled_date }),
      ...(expected.revisionToken === undefined
        ? {}
        : { expectedRevisionToken: expected.revisionToken }),
      idempotencyKey: intent.operationId,
    };

    const lifecycleOutcome = await this.persistence.lifecycle[
      lifecycleMethod(operation)
    ](request);
    if (!isLifecycleSuccess(lifecycleOutcome)) {
      return mapLifecycleFailure(
        lifecycleOutcome,
        operation,
        intent.operationId,
        seriesId,
        intent.expectedVersion !== undefined,
      );
    }

    const current = operation === "skip"
      ? undefined
      : await this.persistence.getTask(intent.taskId, intent.userId);
    return {
      status: lifecycleOutcome.status,
      type: lifecycleOutcome.status,
      operation,
      operationId: intent.operationId,
      ...(current ? { task: current } : {}),
    };
  }

  private async executeRecurringEdit(
    intent: TaskCommandIntent,
    task: Task,
    seriesId: string,
    occurrenceId: string,
  ): Promise<TaskCommandOutcome> {
    const expected = decodeExpectedRevision(
      intent,
      seriesId,
      intent.scope !== undefined && intent.scope !== "this",
    );
    if (!expected.ok) return expected.outcome;
    const updates = intent.updates ?? {};
    if (intent.scope !== undefined && intent.scope !== "this") {
      const defaults = taskUpdatesToSeriesDefaults(updates);
      if (defaults === undefined) {
        return invalidTransition(
          "edit",
          intent.operationId,
          "Scoped Series edits cannot change completion state or due date",
        );
      }
      const request: ReviseSeriesRequest = {
        ...(intent.expectedTaskVersion === undefined ? {} : { expectedTaskVersion: intent.expectedTaskVersion }),
        userId: intent.userId,
        taskId: task.id,
        occurrenceId,
        seriesId,
        scope: intent.scope,
        effectiveDate: intent.effectiveDate ?? task.scheduled_date ?? undefined,
        defaults,
        ...(expected.revisionToken === undefined
          ? {}
          : { expectedRevisionToken: expected.revisionToken }),
        idempotencyKey: intent.operationId,
      };
      const outcome = await this.persistence.lifecycle.reviseSeries(request);
      if (!isLifecycleSuccess(outcome)) {
        return mapLifecycleFailure(
          outcome,
          "edit",
          intent.operationId,
          seriesId,
          true,
        );
      }
      return await this.successAfterLifecycle(
        outcome,
        "edit",
        intent.operationId,
        intent.userId,
        task.id,
      );
    }

    const occurrence = taskUpdatesToOccurrenceRequest(updates);
    if (occurrence === undefined) {
      return invalidTransition(
        "edit",
        intent.operationId,
        "Task Command edits require at least one supported update",
      );
    }
    const request: OccurrenceUpdateRequest = {
      ...(intent.expectedTaskVersion === undefined ? {} : { expectedTaskVersion: intent.expectedTaskVersion }),
      userId: intent.userId,
      taskId: task.id,
      seriesId,
      occurrenceId,
      scope: "this",
      ...(task.scheduled_date === undefined || task.scheduled_date === null
        ? {}
        : { scheduledDate: task.scheduled_date }),
      updates: occurrence.updates,
      ...(occurrence.completed === undefined
        ? {}
        : { completed: occurrence.completed }),
      ...(expected.revisionToken === undefined
        ? {}
        : { expectedRevisionToken: expected.revisionToken }),
      idempotencyKey: intent.operationId,
    };
    const outcome = await this.persistence.lifecycle.editOccurrence(request);
    if (!isLifecycleSuccess(outcome)) {
      return mapLifecycleFailure(
        outcome,
        "edit",
        intent.operationId,
        seriesId,
        intent.expectedVersion !== undefined,
      );
    }
    return await this.successAfterLifecycle(
      outcome,
      "edit",
      intent.operationId,
      intent.userId,
      task.id,
    );
  }

  private async executeRecurringEnd(
    intent: TaskCommandIntent,
    task: Task,
    seriesId: string,
    occurrenceId: string,
  ): Promise<TaskCommandOutcome> {
    const expected = decodeExpectedRevision(intent, seriesId, true);
    if (!expected.ok) return expected.outcome;
    const request: SeriesCommandRequest = {
      userId: intent.userId,
      taskId: task.id,
      occurrenceId,
      seriesId,
      scope: intent.scope,
      effectiveDate: intent.effectiveDate ?? task.scheduled_date ?? undefined,
      ...(expected.revisionToken === undefined
        ? {}
        : { expectedRevisionToken: expected.revisionToken }),
      idempotencyKey: intent.operationId,
    };
    const outcome = await this.persistence.lifecycle.endSeries(request);
    if (!isLifecycleSuccess(outcome)) {
      return mapLifecycleFailure(
        outcome,
        "skip",
        intent.operationId,
        seriesId,
        true,
      );
    }
    return await this.successAfterLifecycle(
      outcome,
      "skip",
      intent.operationId,
      intent.userId,
      task.id,
    );
  }

  private async successAfterLifecycle(
    outcome: Extract<LifecycleOutcome<unknown>, { status: "complete" | "already-applied" }>,
    operation: TaskCommandType,
    operationId: string,
    userId: string,
    taskId: string,
  ): Promise<TaskCommandSuccess> {
    const current = await this.persistence.getTask(taskId, userId);
    return {
      status: outcome.status,
      type: outcome.status,
      operation,
      operationId,
      ...(current ? { task: current } : {}),
    };
  }
}

/** Bind command authority once so delivery callers cannot supply a user ID. */
export function bindTaskCommands(
  userId: string,
  commands: Pick<TaskCommands, "execute">,
): AuthenticatedTaskCommands {
  const boundUserId = userId.trim();
  if (!boundUserId) throw new TypeError("An authenticated user ID is required");
  return {
    execute(intent) {
      return commands.execute({ ...intent, userId: boundUserId });
    },
  };
}

/**
 * Compatibility boundary for the legacy toggle endpoint. New callers use
 * TaskCommands.execute with an explicit complete or reopen intent.
 */
export class LegacyTaskToggle {
  constructor(
    private readonly getTask: TaskCommandPersistence["getTask"],
    private readonly commands: Pick<TaskCommands, "execute">,
  ) {}

  async execute(intent: LegacyTaskToggleIntent): Promise<TaskCommandOutcome> {
    const task = await this.getTask(intent.taskId, intent.userId);
    if (!task) return notFound("complete", intent.operationId);
    return this.commands.execute({
      ...intent,
      type: task.is_completed ? "reopen" : "complete",
    });
  }
}

export function createSupabaseTaskCommands(
  supabase: SupabaseClient,
): TaskCommands {
  const tasksDB = new TasksDB(supabase);
  const lifecycle = createActivatedRecurringTaskLifecycle(supabase);
  const ordinary = new SupabaseTaskCommandOrdinaryPersistence(supabase);

  return new TaskCommands({
    getTask: tasksDB.getTask.bind(tasksDB),
    ordinary,
    replay: ordinary.replay.bind(ordinary),
    lifecycle,
  });
}

export function createAuthenticatedTaskCommands(
  supabase: SupabaseClient,
  principal: AuthenticatedTaskCommandPrincipal,
): AuthenticatedTaskCommands {
  if (principal.type !== "user") {
    throw new TypeError("An authenticated user principal is required");
  }
  return bindTaskCommands(
    principal.userId,
    createSupabaseTaskCommands(supabase),
  );
}

/** AI tools receive an already authenticated user-bound context. */
export function createTaskCommandsForUser(
  supabase: SupabaseClient,
  userId: string,
): AuthenticatedTaskCommands {
  return bindTaskCommands(userId, createSupabaseTaskCommands(supabase));
}

export function createSupabaseLegacyTaskToggle(
  supabase: SupabaseClient,
): LegacyTaskToggle {
  const tasksDB = new TasksDB(supabase);
  return new LegacyTaskToggle(
    tasksDB.getTask.bind(tasksDB),
    createSupabaseTaskCommands(supabase),
  );
}

/** Read a caller-supplied retry identity, with a per-request fallback. */
export function operationIdFromRequest(request: Pick<Request, "headers">): string {
  const supplied = request.headers.get("Idempotency-Key")
    ?? request.headers.get("X-Operation-Id");
  return supplied?.trim() || newTaskCommandOperationId();
}

export function newTaskCommandOperationId(): string {
  return crypto.randomUUID();
}

/** Return an explicit state command only when no other Task field is changing. */
export function taskCommandTypeFromUpdate(
  values: Record<string, unknown>,
): TaskCommandType | undefined {
  const definedValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
  const keys = Object.keys(definedValues);
  const completed = definedValues.is_completed;
  const status = definedValues.status;

  if (keys.length === 1 && typeof completed === "boolean") {
    return completed ? "complete" : "reopen";
  }
  if (keys.length === 1 && (status === "done" || status === "todo")) {
    return status === "done" ? "complete" : "reopen";
  }
  if (
    keys.length === 2
    && keys.every((key) => key === "is_completed" || key === "status")
    && typeof completed === "boolean"
    && (status === "done" || status === "todo")
    && completed === (status === "done")
  ) {
    return completed ? "complete" : "reopen";
  }
  return undefined;
}
