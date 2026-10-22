/** Shared Task command and persistence contracts. */

import type { AuthenticatedPrincipal } from "@/lib/auth/request-context";

import type { Task } from "@/lib/db/types";

import type { RecurringTaskLifecyclePort } from "@/lib/recurring-tasks/internal/lifecycle";

import type { TaskUpdateValues } from "@/lib/validations/task";

/** Mutations accepted by every interactive Task delivery channel. */
export type TaskCommandType = "complete" | "reopen" | "skip" | "edit";

export type TaskCommandScope = "this" | "following" | "all";

export type TaskCommandUpdates = TaskUpdateValues;

export interface TaskCommandIntent {
  expectedTaskVersion?: string;
  type: TaskCommandType;
  userId: string;
  taskId: string;
  operationId: string;
  scope?: TaskCommandScope;
  updates?: TaskCommandUpdates;
  effectiveDate?: string;
  /** Opaque public Series version required for future/all Series effects. */
  expectedVersion?: string;
  /** Compatibility for already-bound occurrence state callers. */
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
  expectedTaskVersion?: string;
  type: TaskCommandType;
  userId: string;
  taskId: string;
  operationId: string;
  scope?: TaskCommandScope;
  updates?: TaskCommandUpdates;
  effectiveDate?: string;
  expectedVersion?: string;
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
      expectedVersion?: string;
      actualVersion?: string;
    }
  | { status: "coverage-unavailable"; reason: string };

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
    edit(
      request: TaskCommandOrdinaryRequest,
    ): Promise<TaskCommandPersistenceOutcome>;
  };
  lifecycle: Pick<
    RecurringTaskLifecyclePort,
    | "completeOccurrence"
    | "reopenOccurrence"
    | "skipOccurrence"
    | "editOccurrence"
    | "reviseSeries"
    | "endSeries"
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
      expectedVersion?: string;
      actualVersion?: string;
    }
  | {
      status: "coverage-unavailable";
      type: "coverage-unavailable";
      operation: TaskCommandType;
      operationId: string;
      reason: string;
    };

export type TaskCommandOutcome = TaskCommandSuccess | TaskCommandFailure;
