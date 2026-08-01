import type { SupabaseClient } from "@supabase/supabase-js";

import { TasksDB } from "@/lib/db";

import { createActivatedRecurringTaskLifecycle } from "./activation";
import {
  SeriesStateAdapter,
  type SeriesStateLifecyclePort,
} from "./series-state-adapter";

export interface SupabaseSeriesStateAdapterOptions {
  lifecycle?: SeriesStateLifecyclePort;
}

/** Build the shared Series State adapter with lifecycle ownership fixed at activation. */
export function createSupabaseSeriesStateAdapter(
  supabase: SupabaseClient,
  options: SupabaseSeriesStateAdapterOptions = {},
): SeriesStateAdapter {
  const tasksDB = new TasksDB(supabase);
  const lifecycle = options.lifecycle ?? createActivatedRecurringTaskLifecycle(supabase);

  // Scoped mutations are sequenced by the lifecycle RPC. The task projection
  // is only a read preflight for resolving occurrence lineage.
  return new SeriesStateAdapter(
    { getTask: tasksDB.getTask.bind(tasksDB) },
    { lifecycle },
  );
}
