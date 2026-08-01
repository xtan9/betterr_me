import type { SupabaseClient } from "@supabase/supabase-js";

import { RecurringTasksDB, TasksDB } from "@/lib/db";
import type { TaskUpdateValues } from "@/lib/validations/task";
import { createTaskWrites } from "@/lib/tasks/writes";

import {
  OccurrenceAdapter,
  type OccurrenceAdapterPersistence,
  type OccurrenceLifecyclePort,
  type OccurrenceEditIntent,
  type OccurrenceCommandIntent,
  toLegacyTaskUpdate,
} from "./occurrence-adapter";

export interface SupabaseOccurrenceAdapterOptions {
  lifecycle?: OccurrenceLifecyclePort;
}

/**
 * Build the occurrence adapter with the legacy task projection as its
 * cutover-compatible default. Supplying a lifecycle port switches only the
 * recurring occurrence branch; lifecycle commands never sequence projection
 * writes in this factory.
 */
export function createSupabaseOccurrenceAdapter(
  supabase: SupabaseClient,
  options: SupabaseOccurrenceAdapterOptions = {},
): OccurrenceAdapter {
  const tasksDB = new TasksDB(supabase);

  // Lifecycle mode exposes only the read preflight and lifecycle port. The
  // legacy writer dependencies are intentionally not constructed here.
  if (options.lifecycle) {
    return new OccurrenceAdapter(
      { getTask: tasksDB.getTask.bind(tasksDB) },
      options,
    );
  }

  const taskWrites = createTaskWrites(supabase);
  const getRecurringTasksDB = () => new RecurringTasksDB(supabase);

  const persistence: OccurrenceAdapterPersistence = {
    getTask: tasksDB.getTask.bind(tasksDB),
    legacy: {
      async edit(intent: OccurrenceEditIntent) {
        const outcome = await taskWrites.execute({
          type: "update",
          userId: intent.userId,
          taskId: intent.taskId,
          values: toLegacyTaskUpdate(intent) as TaskUpdateValues,
        });
        return outcome.task;
      },
      async editScoped(intent: OccurrenceEditIntent, task) {
        await getRecurringTasksDB().updateInstanceWithScope(
          task.id,
          intent.userId,
          intent.scope ?? "this",
          toLegacyTaskUpdate(intent),
        );
      },
      async toggle(intent: OccurrenceCommandIntent) {
        const outcome = await taskWrites.execute({
          type: "toggle-completion",
          userId: intent.userId,
          taskId: intent.taskId,
        });
        return outcome.task;
      },
    },
  };

  return new OccurrenceAdapter(persistence, options);
}
