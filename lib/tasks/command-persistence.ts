/** Executes and decodes ordinary Task command RPCs. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Task } from "@/lib/db/types";

import type { TaskCommandOrdinaryRequest, TaskCommandPersistenceOutcome } from "./command-contract";

export class SupabaseTaskCommandOrdinaryPersistence {
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

  edit(request: TaskCommandOrdinaryRequest) {
    return this.call(request);
  }

  replay(request: TaskCommandOrdinaryRequest) {
    return this.call(request, "task_command_replay");
  }

  private async call(
    request: TaskCommandOrdinaryRequest,
    procedure: "task_command_atomic" | "task_command_replay" = "task_command_atomic",
  ): Promise<TaskCommandPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(procedure, {
      p_operation: request.type,
      p_request: {
        userId: request.userId,
        taskId: request.taskId,
        idempotencyKey: request.operationId,
        ...(request.expectedTaskVersion === undefined ? {} : { expectedTaskVersion: request.expectedTaskVersion }),
        ...(request.scope === undefined ? {} : { scope: request.scope }),
        ...(request.updates === undefined ? {} : { updates: request.updates }),
        ...(request.effectiveDate === undefined
          ? {}
          : { effectiveDate: request.effectiveDate }),
        ...(request.expectedVersion === undefined
          ? {}
          : { expectedVersion: request.expectedVersion }),
      },
    });
    if (error) throw error;
    return parsePersistenceOutcome(data);
  }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
