import type { SupabaseClient } from "@supabase/supabase-js";

import { RecurringTasksDB, TasksDB } from "@/lib/db";
import {
  SeriesStateAdapter,
  type SeriesStateLifecyclePort,
  type SeriesStatePersistence,
} from "./series-state-adapter";

export interface SupabaseSeriesStateAdapterOptions {
  lifecycle?: SeriesStateLifecyclePort;
}

/**
 * Build the shared Series State adapter with the legacy projection as its
 * cutover-compatible default. Lifecycle mode exposes only the task read
 * preflight and lifecycle port, so delivery code cannot sequence projection
 * writes around a lifecycle mutation.
 */
export function createSupabaseSeriesStateAdapter(
  supabase: SupabaseClient,
  options: SupabaseSeriesStateAdapterOptions = {},
): SeriesStateAdapter {
  if (options.lifecycle) {
    const tasksDB = new TasksDB(supabase);
    return new SeriesStateAdapter(
      { getTask: tasksDB.getTask.bind(tasksDB) },
      options,
    );
  }

  const recurringTasksDB = new RecurringTasksDB(supabase);
  const persistence: SeriesStatePersistence = {
    getTask: async (taskId, userId) => {
      const tasksDB = new TasksDB(supabase);
      return tasksDB.getTask(taskId, userId);
    },
    legacy: {
      getRecurringTask: bindLegacyMethod(recurringTasksDB, "getRecurringTask"),
      updateRecurringTask: bindLegacyMethod(
        recurringTasksDB,
        "updateRecurringTask",
      ),
      updateInstanceWithScope: bindLegacyMethod(
        recurringTasksDB,
        "updateInstanceWithScope",
      ),
      pauseRecurringTask: bindLegacyMethod(
        recurringTasksDB,
        "pauseRecurringTask",
      ),
      resumeRecurringTask: bindLegacyMethod(
        recurringTasksDB,
        "resumeRecurringTask",
      ),
      archiveRecurringTask: bindLegacyMethod(
        recurringTasksDB,
        "archiveRecurringTask",
      ),
      deleteRecurringTask: bindLegacyMethod(
        recurringTasksDB,
        "deleteRecurringTask",
      ),
      deleteInstanceWithScope: bindLegacyMethod(
        recurringTasksDB,
        "deleteInstanceWithScope",
      ),
    },
  };

  return new SeriesStateAdapter(persistence);
}

function bindLegacyMethod<
  TName extends keyof NonNullable<SeriesStatePersistence["legacy"]>,
>(
  db: RecurringTasksDB,
  name: TName,
): NonNullable<SeriesStatePersistence["legacy"]>[TName] {
  const method = db[name] as unknown as
    | ((...args: never[]) => unknown)
    | undefined;
  if (typeof method === "function") {
    return method.bind(db) as NonNullable<
      SeriesStatePersistence["legacy"]
    >[TName];
  }
  return ((..._args: never[]) => {
    throw new Error(`Legacy Series State method is unavailable: ${String(name)}`);
  }) as NonNullable<SeriesStatePersistence["legacy"]>[TName];
}
