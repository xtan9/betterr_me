/** Maps ordinary and recurring results into the shared Task command contract. */

import { encodeSeriesVersion } from "@/lib/recurring-tasks/internal/capabilities";

import type { LifecycleOutcome } from "@/lib/recurring-tasks/internal/lifecycle";

import type {
  TaskCommandPersistenceOutcome,
  TaskCommandType,
  TaskCommandOutcome,
  TaskCommandFailure,
  TaskCommandSuccess,
} from "./command-contract";

export function mapPersistenceOutcome(
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
  if (outcome.status === "coverage-unavailable") {
    return {
      status: "coverage-unavailable",
      type: "coverage-unavailable",
      operation,
      operationId,
      reason: outcome.reason,
    };
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

export function mapLifecycleFailure(
  outcome: Exclude<LifecycleOutcome<unknown>, { status: "complete" | "already-applied" }>,
  operation: TaskCommandType,
  operationId: string,
  seriesId?: string,
  opaqueVersion = false,
): TaskCommandFailure {
  if (outcome.status === "not-found") return notFound(operation, operationId);
  if (outcome.status === "invalid-transition") {
    return invalidTransition(operation, operationId, outcome.reason);
  }
  if (outcome.status === "conflict") {
    if (opaqueVersion && seriesId) {
      return {
        status: "conflict",
        type: "conflict",
        operation,
        operationId,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.expectedRevisionToken === undefined
          ? {}
          : { expectedVersion: encodeSeriesVersion(seriesId, outcome.expectedRevisionToken) }),
        ...(outcome.actualRevisionToken === undefined
          ? {}
          : { actualVersion: encodeSeriesVersion(seriesId, outcome.actualRevisionToken) }),
      };
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
  if (outcome.status === "coverage-unavailable") {
    return {
      status: "coverage-unavailable",
      type: "coverage-unavailable",
      operation,
      operationId,
      reason: outcome.reason,
    };
  }
  return invalidTransition(
    operation,
    operationId,
    "Recurring task coverage is temporarily unavailable",
  );
}

export function isLifecycleSuccess(
  outcome: LifecycleOutcome<unknown>,
): outcome is Extract<LifecycleOutcome<unknown>, { status: "complete" | "already-applied" }> {
  return outcome.status === "complete" || outcome.status === "already-applied";
}

export function notFound(
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

export function invalidTransition(
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
    case "coverage-unavailable":
      return outcome.reason;
  }
}

export function taskCommandHttpFailure(
  outcome: Exclude<TaskCommandOutcome, TaskCommandSuccess>,
): { error: string; status: 400 | 404 | 409 | 503 } {
  switch (outcome.status) {
    case "not-found":
      return { error: taskCommandErrorMessage(outcome), status: 404 };
    case "conflict":
      return { error: taskCommandErrorMessage(outcome), status: 409 };
    case "invalid-transition":
      return { error: taskCommandErrorMessage(outcome), status: 400 };
    case "coverage-unavailable":
      return { error: taskCommandErrorMessage(outcome), status: 503 };
  }
}
