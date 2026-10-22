/** Normalizes Task intents and translates scoped updates into lifecycle requests. */

import { decodeSeriesVersion } from "@/lib/recurring-tasks/internal/capabilities";

import type {
  OccurrenceOverrides,
  ReviseSeriesRequest,
} from "@/lib/recurring-tasks/internal/lifecycle";

import type {
  TaskCommandIntent,
  TaskCommandType,
  TaskCommandFailure,
  TaskCommandOrdinaryRequest,
  TaskCommandUpdates,
} from "./command-contract";

import { invalidTransition, notFound } from "./command-outcomes";

export function normalizeIntent(
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

export function toCommandRequest(
  intent: TaskCommandIntent & { operation: TaskCommandType },
): TaskCommandOrdinaryRequest {
  return {
    type: intent.operation,
    userId: intent.userId,
    taskId: intent.taskId,
    operationId: intent.operationId,
    ...(intent.expectedTaskVersion === undefined ? {} : { expectedTaskVersion: intent.expectedTaskVersion }),
    ...(intent.scope === undefined ? {} : { scope: intent.scope }),
    ...(intent.updates === undefined ? {} : { updates: intent.updates }),
    ...(intent.effectiveDate === undefined
      ? {}
      : { effectiveDate: intent.effectiveDate }),
    ...(intent.expectedVersion === undefined
      ? {}
      : { expectedVersion: intent.expectedVersion }),
  };
}

export function decodeExpectedRevision(
  intent: TaskCommandIntent,
  seriesId: string,
  required: boolean,
):
  | { ok: true; revisionToken?: number }
  | { ok: false; outcome: TaskCommandFailure } {
  if (intent.expectedVersion !== undefined) {
    const decoded = decodeSeriesVersion(intent.expectedVersion, seriesId);
    if (!decoded) {
      return {
        ok: false,
        outcome: invalidTransition(
          intent.type,
          intent.operationId,
          "Series version is invalid",
        ),
      };
    }
    return { ok: true, revisionToken: decoded.revisionToken };
  }
  if (required) {
    return {
      ok: false,
      outcome: invalidTransition(
        intent.type,
        intent.operationId,
        "An expected opaque Series version is required",
      ),
    };
  }
  return {
    ok: true,
    ...(intent.expectedRevisionToken === undefined
      ? {}
      : { revisionToken: intent.expectedRevisionToken }),
  };
}

export function taskUpdatesToOccurrenceRequest(
  updates: TaskCommandUpdates,
): { updates: OccurrenceOverrides; completed?: boolean } | undefined {
  const occurrenceUpdates: OccurrenceOverrides = {};
  if (updates.title !== undefined) occurrenceUpdates.title = updates.title.trim();
  if (updates.description !== undefined) {
    occurrenceUpdates.description = updates.description?.trim() || null;
  }
  if (updates.priority !== undefined) occurrenceUpdates.priority = updates.priority;
  if (updates.category_id !== undefined) {
    occurrenceUpdates.categoryId = updates.category_id?.trim() || null;
  }
  if (updates.due_date !== undefined) {
    occurrenceUpdates.dueDate = updates.due_date?.trim() || null;
  }
  if (updates.due_time !== undefined) {
    occurrenceUpdates.dueTime = updates.due_time?.trim() || null;
  }
  if (updates.section !== undefined) occurrenceUpdates.section = updates.section;
  if (updates.sort_order !== undefined) occurrenceUpdates.sortOrder = updates.sort_order;
  if (updates.project_id !== undefined) {
    occurrenceUpdates.projectId = updates.project_id?.trim() || null;
  }
  if (updates.completion_difficulty !== undefined) {
    return undefined;
  }

  let completed = updates.is_completed;
  if (updates.status !== undefined) {
    if (updates.status === "done" || updates.status === "todo") {
      completed = updates.status === "done";
    } else {
      occurrenceUpdates.status = updates.status;
    }
  }
  if (Object.keys(occurrenceUpdates).length === 0 && completed === undefined) {
    return undefined;
  }
  return {
    updates: occurrenceUpdates,
    ...(completed === undefined ? {} : { completed }),
  };
}

export function taskUpdatesToSeriesDefaults(
  updates: TaskCommandUpdates,
): ReviseSeriesRequest["defaults"] | undefined {
  if (
    updates.due_date !== undefined
    || updates.is_completed !== undefined
    || updates.completion_difficulty !== undefined
  ) {
    return undefined;
  }
  const defaults = {
    ...(updates.title === undefined ? {} : { title: updates.title.trim() }),
    ...(updates.description === undefined
      ? {}
      : { description: updates.description?.trim() || null }),
    ...(updates.priority === undefined ? {} : { priority: updates.priority }),
    ...(updates.category_id === undefined
      ? {}
      : { categoryId: updates.category_id?.trim() || null }),
    ...(updates.due_time === undefined
      ? {}
      : { dueTime: updates.due_time?.trim() || null }),
    ...(updates.status === undefined ? {} : { status: updates.status }),
    ...(updates.section === undefined ? {} : { section: updates.section }),
    ...(updates.sort_order === undefined ? {} : { sortOrder: updates.sort_order }),
    ...(updates.project_id === undefined
      ? {}
      : { projectId: updates.project_id?.trim() || null }),
  };
  return Object.keys(defaults).length === 0 ? undefined : defaults;
}

export function lifecycleMethod(
  operation: TaskCommandType,
): "completeOccurrence" | "reopenOccurrence" | "skipOccurrence" {
  switch (operation) {
    case "complete":
      return "completeOccurrence";
    case "reopen":
      return "reopenOccurrence";
    case "skip":
      return "skipOccurrence";
    case "edit":
      throw new Error("Field edits use the edit command path");
  }
}

function isTaskCommandType(value: unknown): value is TaskCommandType {
  return value === "complete"
    || value === "reopen"
    || value === "skip"
    || value === "edit";
}
