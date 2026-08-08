import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecurringLifecycleObserver } from "./observability";
import { createSupabaseRecurringTaskLifecycle } from "./supabase-lifecycle";

/**
 * The application cutover and its storage migration share one immutable
 * release identifier. Keeping the identifier at the lifecycle boundary makes
 * it possible for architecture checks and operational tooling to verify that
 * every production adapter is using the activated owner.
 */
export const RECURRING_TASK_LIFECYCLE_CUTOVER = Object.freeze({
  migrationKey: "20260803000001_activate_recurring_task_lifecycle",
  mode: "lifecycle",
} as const);

export interface RecurringTaskLifecycleActivationOptions {
  observer?: RecurringLifecycleObserver;
}

/**
 * Return the only lifecycle port that production delivery code may use.
 * Compatibility request/response translation belongs above this function;
 * legacy persistence is deliberately not an activation option.
 */
export function createActivatedRecurringTaskLifecycle(
  supabase: SupabaseClient,
  options: RecurringTaskLifecycleActivationOptions = {},
) {
  return createSupabaseRecurringTaskLifecycle(supabase, options);
}
