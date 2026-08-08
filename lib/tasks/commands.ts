import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthenticatedPrincipal } from "@/lib/auth/request-context";
import { TasksDB } from "@/lib/db";
import type { Task } from "@/lib/db/types";
import { createActivatedRecurringTaskLifecycle } from "@/lib/recurring-tasks/activation";
import type {
  LifecycleOutcome,
  OccurrenceCommandRequest,
  RecurringTaskLifecyclePort,
} from "@/lib/recurring-tasks/lifecycle";

/** The only state mutations in the shared Task Commands contract. */
export type TaskCommandType = "complete" | "reopen" | "skip";

export type TaskCommandScope = "this";

export interface TaskCommandIntent {
  type: TaskCommandType;
  userId: string;
  taskId: string;
  operationId: string;
  scope?: TaskCommandScope;
  expectedRevisionToken?: number;
}

export type AuthenticatedTaskCommandPrincipal = Extract<
  AuthenticatedPrincipal,
  { type: "user" }
>;

export type AuthenticatedTaskCommandIntent = Omit<
  TaskCommandIntent,
  "userId"
>;

export interface AuthenticatedTaskCommands {
  execute(intent: AuthenticatedTaskCommandIntent): Promise<TaskCommandOutcome>;
}

export interface LegacyTaskToggleIntent {
  userId: string;
  taskId: string;
  operationId: string;
}

export interface TaskCommandOrdinaryRequest {
  type: TaskCommandType;
  userId: string;
  taskId: string;
  operationId: string;
}

export type TaskCommandPersistenceOutcome =
  | { status: "complete" | "already-applied"; task?: Task }
  | { status: "not-found" }
  | { status: "invalid-transition"; reason: string }
  | {
      status: "conflict";
      reason?: string;
      expectedRevisionToken?: number;
      actualRevisionToken?: number;
    };

export interface TaskCommandPersistence {
  /** The visible Task projection is a routing preflight, never an authority. */
  getTask(taskId: string, userId: string): Promise<Task | null>;
  /** Replay a completed command after a destructive command removed its Task. */
  replay?(request: TaskCommandOrdinaryRequest): Promise<TaskCommandPersistenceOutcome>;
  ordinary: {
    complete(
      request: TaskCommandOrdinaryRequest,
    ): Promise<TaskCommandPersistenceOutcome>;
    reopen(
      request: TaskCommandOrdinaryRequest,
    ): Promise<TaskCommandPersistenceOutcome>;
    skip(
      request: TaskCommandOrdinaryRequest,
    ): Promise<TaskCommandPersistenceOutcome>;
  };
  lifecycle: Pick<
    RecurringTaskLifecyclePort,
    "completeOccurrence" | "reopenOccurrence" | "skipOccurrence"
  >;
}

export type TaskCommandSuccess = {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  operation: TaskCommandType;
  operationId: string;
  task?: Task;
};

export type TaskCommandFailure =
  | {
      status: "not-found";
      type: "not-found";
      operation: TaskCommandType;
      operationId: string;
    }
  | {
      status: "invalid-transition";
      type: "invalid-transition";
      operation: TaskCommandType;
      operationId: string;
      reason: string;
    }
  | {
      status: "conflict";
      type: "conflict";
      operation: TaskCommandType;
      operationId: string;
      reason?: string;
      expectedRevisionToken?: number;
      actualRevisionToken?: number;
    };

export type TaskCommandOutcome = TaskCommandSuccess | TaskCommandFailure;

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
    if (scope !== undefined && scope !== "this") {
      return invalidTransition(
        operation,
        operationId,
        "Task Commands only support the this scope for occurrence state",
      );
    }

    const task = await this.persistence.getTask(taskId, userId);
    if (!task) {
      const replay = this.persistence.replay
        ? await this.persistence.replay({
            type: operation,
            userId,
            taskId,
            operationId,
          })
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

    if (hasSeries && hasOccurrence) {
      return this.executeRecurring(normalized.value, task);
    }

    if (operation === "skip" && scope !== undefined) {
      return invalidTransition(
        operation,
        operationId,
        "Recurring deletion scope requires a Task Occurrence",
      );
    }

    const persistenceOutcome = await this.persistence.ordinary[operation]({
      type: operation,
      userId,
      taskId,
      operationId,
    });
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

    const request: OccurrenceCommandRequest = {
      userId: intent.userId,
      taskId: task.id,
      seriesId,
      occurrenceId,
      scope: "this",
      ...(task.scheduled_date === undefined || task.scheduled_date === null
        ? {}
        : { scheduledDate: task.scheduled_date }),
      ...(intent.expectedRevisionToken === undefined
        ? {}
        : { expectedRevisionToken: intent.expectedRevisionToken }),
      idempotencyKey: intent.operationId,
    };

    const lifecycleOutcome = await this.persistence.lifecycle[
      lifecycleMethod(operation)
    ](request);
    if (!isLifecycleSuccess(lifecycleOutcome)) {
      return mapLifecycleFailure(lifecycleOutcome, operation, intent.operationId);
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

class SupabaseTaskCommandOrdinaryPersistence {
  constructor(private readonly supabase: SupabaseClient) {}

  complete(request: TaskCommandOrdinaryRequest) {
    return this.call(request);
  }

  reopen(request: TaskCommandOrdinaryRequest) {
    return this.call(request);
  }

  skip(request: TaskCommandOrdinaryRequest) {
    return this.call(request);
  }

  replay(request: TaskCommandOrdinaryRequest) {
    return this.callReplay(request);
  }

  private async call(
    request: TaskCommandOrdinaryRequest,
  ): Promise<TaskCommandPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc("task_command_atomic", {
      p_operation: request.type,
      p_request: {
        userId: request.userId,
        taskId: request.taskId,
        idempotencyKey: request.operationId,
      },
    });
    if (error) throw error;
    return parsePersistenceOutcome(data);
  }

  private async callReplay(
    request: TaskCommandOrdinaryRequest,
  ): Promise<TaskCommandPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc("task_command_replay", {
      p_operation: request.type,
      p_request: {
        userId: request.userId,
        taskId: request.taskId,
        idempotencyKey: request.operationId,
      },
    });
    if (error) throw error;
    return parsePersistenceOutcome(data);
  }
}

function normalizeIntent(
  intent: TaskCommandIntent,
):
  | { ok: true; value: TaskCommandIntent & { operation: TaskCommandType } }
  | { ok: false; outcome: TaskCommandFailure } {
  const operation = isTaskCommandType(intent?.type) ? intent.type : "complete";
  const operationId = typeof intent?.operationId === "string"
    ? intent.operationId.trim()
    : "";
  const userId = typeof intent?.userId === "string" ? intent.userId.trim() : "";
  const taskId = typeof intent?.taskId === "string" ? intent.taskId.trim() : "";

  if (!operationId) {
    return {
      ok: false,
      outcome: invalidTransition(
        operation,
        operationId,
        "Task Command operation ID is required",
      ),
    };
  }
  if (!isTaskCommandType(intent?.type)) {
    return {
      ok: false,
      outcome: invalidTransition(
        operation,
        operationId,
        "Unsupported Task Command",
      ),
    };
  }
  if (!userId || !taskId) {
    return { ok: false, outcome: notFound(operation, operationId) };
  }

  return {
    ok: true,
    value: {
      ...intent,
      operation,
      operationId,
      userId,
      taskId,
    },
  };
}

function lifecycleMethod(
  operation: TaskCommandType,
): "completeOccurrence" | "reopenOccurrence" | "skipOccurrence" {
  switch (operation) {
    case "complete":
      return "completeOccurrence";
    case "reopen":
      return "reopenOccurrence";
    case "skip":
      return "skipOccurrence";
  }
}

function mapPersistenceOutcome(
  outcome: TaskCommandPersistenceOutcome,
  operation: TaskCommandType,
  operationId: string,
): TaskCommandOutcome {
  if (outcome.status === "complete" || outcome.status === "already-applied") {
    return {
      status: outcome.status,
      type: outcome.status,
      operation,
      operationId,
      ...(outcome.task ? { task: outcome.task } : {}),
    };
  }
  if (outcome.status === "not-found") return notFound(operation, operationId);
  if (outcome.status === "invalid-transition") {
    return invalidTransition(operation, operationId, outcome.reason);
  }
  if (outcome.status !== "conflict") {
    return invalidTransition(
      operation,
      operationId,
      "Task Command persistence returned an invalid outcome",
    );
  }
  return {
    status: "conflict",
    type: "conflict",
    operation,
    operationId,
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
    ...(outcome.expectedRevisionToken === undefined
      ? {}
      : { expectedRevisionToken: outcome.expectedRevisionToken }),
    ...(outcome.actualRevisionToken === undefined
      ? {}
      : { actualRevisionToken: outcome.actualRevisionToken }),
  };
}

function mapLifecycleFailure(
  outcome: Exclude<LifecycleOutcome<unknown>, { status: "complete" | "already-applied" }>,
  operation: TaskCommandType,
  operationId: string,
): TaskCommandFailure {
  if (outcome.status === "not-found") return notFound(operation, operationId);
  if (outcome.status === "invalid-transition") {
    return invalidTransition(operation, operationId, outcome.reason);
  }
  if (outcome.status === "conflict") {
    return {
      status: "conflict",
      type: "conflict",
      operation,
      operationId,
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(outcome.expectedRevisionToken === undefined
        ? {}
        : { expectedRevisionToken: outcome.expectedRevisionToken }),
      ...(outcome.actualRevisionToken === undefined
        ? {}
        : { actualRevisionToken: outcome.actualRevisionToken }),
    };
  }
  return invalidTransition(
    operation,
    operationId,
    "Recurring task coverage is temporarily unavailable",
  );
}

function isLifecycleSuccess(
  outcome: LifecycleOutcome<unknown>,
): outcome is Extract<LifecycleOutcome<unknown>, { status: "complete" | "already-applied" }> {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

function parsePersistenceOutcome(value: unknown): TaskCommandPersistenceOutcome {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Invalid Task Command outcome returned by the database");
  }
  if (value.status === "complete" || value.status === "already-applied") {
    return {
      status: value.status,
      ...(value.task && isRecord(value.task) ? { task: value.task as unknown as Task } : {}),
    };
  }
  if (value.status === "not-found") return { status: "not-found" };
  if (value.status === "invalid-transition" && typeof value.reason === "string") {
    return { status: "invalid-transition", reason: value.reason };
  }
  if (value.status === "conflict") {
    return {
      status: "conflict",
      ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
      ...(typeof value.expectedRevisionToken === "number"
        ? { expectedRevisionToken: value.expectedRevisionToken }
        : {}),
      ...(typeof value.actualRevisionToken === "number"
        ? { actualRevisionToken: value.actualRevisionToken }
        : {}),
    };
  }
  throw new Error("Invalid Task Command outcome returned by the database");
}

function isTaskCommandType(value: unknown): value is TaskCommandType {
  return value === "complete" || value === "reopen" || value === "skip";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notFound(
  operation: TaskCommandType,
  operationId: string,
): TaskCommandFailure {
  return {
    status: "not-found",
    type: "not-found",
    operation,
    operationId,
  };
}

function invalidTransition(
  operation: TaskCommandType,
  operationId: string,
  reason: string,
): TaskCommandFailure {
  return {
    status: "invalid-transition",
    type: "invalid-transition",
    operation,
    operationId,
    reason,
  };
}

export function isTaskCommandSuccess(
  outcome: TaskCommandOutcome,
): outcome is TaskCommandSuccess {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

export function taskCommandErrorMessage(
  outcome: Exclude<TaskCommandOutcome, TaskCommandSuccess>,
): string {
  switch (outcome.status) {
    case "not-found":
      return "Task not found";
    case "conflict":
      return "Task occurrence conflict";
    case "invalid-transition":
      return outcome.reason;
  }
}

export function taskCommandHttpFailure(
  outcome: Exclude<TaskCommandOutcome, TaskCommandSuccess>,
): { error: string; status: 400 | 404 | 409 } {
  switch (outcome.status) {
    case "not-found":
      return { error: taskCommandErrorMessage(outcome), status: 404 };
    case "conflict":
      return { error: taskCommandErrorMessage(outcome), status: 409 };
    case "invalid-transition":
      return { error: taskCommandErrorMessage(outcome), status: 400 };
  }
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
