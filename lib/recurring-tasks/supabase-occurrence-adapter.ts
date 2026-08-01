import type { SupabaseClient } from "@supabase/supabase-js";

import { TasksDB } from "@/lib/db";
import { createTaskWrites } from "@/lib/tasks/writes";

import { createActivatedRecurringTaskLifecycle } from "./activation";
import {
  OccurrenceAdapter,
  type OccurrenceAdapterPersistence,
  type OccurrenceCommandIntent,
  type OccurrenceEditIntent,
  type OccurrenceLifecyclePort,
  toLegacyTaskUpdate,
} from "./occurrence-adapter";

export interface SupabaseOccurrenceAdapterOptions {
  lifecycle?: OccurrenceLifecyclePort;
}

/** Build the occurrence adapter with lifecycle ownership fixed at activation. */
export function createSupabaseOccurrenceAdapter(
  supabase: SupabaseClient,
  options: SupabaseOccurrenceAdapterOptions = {},
): OccurrenceAdapter {
  const tasksDB = new TasksDB(supabase);
  const lifecycle = options.lifecycle ?? createActivatedRecurringTaskLifecycle(supabase);
  const taskWrites = createTaskWrites(supabase);

  const persistence: OccurrenceAdapterPersistence = {
    getTask: tasksDB.getTask.bind(tasksDB),
    standalone: {
      async edit(intent: OccurrenceEditIntent) {
        const outcome = await taskWrites.execute({
          type: "update",
          userId: intent.userId,
          taskId: intent.taskId,
          values: toLegacyTaskUpdate(intent),
        });
        return outcome.task;
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

  // The adapter may read the task projection to resolve durable lineage. A
  // standalone task is handled by the ordinary Task Writes seam; recurring
  // occurrences can only use the lifecycle port.
  return new OccurrenceAdapter(persistence, { lifecycle });
}
