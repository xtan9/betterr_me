import type { SupabaseClient } from "@supabase/supabase-js";

import { createActivatedRecurringTaskLifecycle } from "./activation";
import {
  emitRecurringLifecycleSignal,
  type RecurringLifecycleObserver,
} from "./observability";
import {
  prewarmActiveRecurringTaskCoverage,
  type PrewarmOptions,
  type PrewarmResult,
  type RecurringTaskPrewarmingLifecycle,
} from "./prewarming";

const RECURRING_TASK_MAINTENANCE_SERVICE_ID = "recurring-task-maintenance" as const;

/** The cron authority accepted by the maintenance composition only. */
export interface RecurringTaskMaintenanceAuthority {
  type: "cron";
  serviceId: typeof RECURRING_TASK_MAINTENANCE_SERVICE_ID;
}

export const RECURRING_TASK_MAINTENANCE_AUTHORITY = Object.freeze({
  type: "cron",
  serviceId: RECURRING_TASK_MAINTENANCE_SERVICE_ID,
} as const satisfies RecurringTaskMaintenanceAuthority);

export interface RecurringTaskMaintenanceCapabilityOptions {
  supabase: SupabaseClient;
  authority: RecurringTaskMaintenanceAuthority;
}

export interface RecurringTaskMaintenanceFailures {
  total: number;
  activeSeriesScan: number;
  coveragePrewarm: number;
}

export interface RecurringTaskMaintenanceResult {
  status: "complete" | "partial" | "unavailable";
  type: "complete" | "partial" | "unavailable";
  seriesCount: number;
  warmedSeriesCount: number;
  skippedSeriesCount: number;
  failedSeriesCount: number;
  operationalFailures: RecurringTaskMaintenanceFailures;
}

export interface RecurringTaskMaintenanceCapability {
  run(): Promise<RecurringTaskMaintenanceResult>;
}

type MaintenanceCompositionOptions = Omit<PrewarmOptions, "observer"> & {
  observer?: RecurringLifecycleObserver;
};

export function createRecurringTaskMaintenanceCapability(
  supabase: SupabaseClient,
  authority: RecurringTaskMaintenanceAuthority,
): RecurringTaskMaintenanceCapability;
export function createRecurringTaskMaintenanceCapability(
  options: RecurringTaskMaintenanceCapabilityOptions,
): RecurringTaskMaintenanceCapability;
export function createRecurringTaskMaintenanceCapability(
  supabaseOrOptions: SupabaseClient | RecurringTaskMaintenanceCapabilityOptions,
  authority?: RecurringTaskMaintenanceAuthority,
): RecurringTaskMaintenanceCapability {
  const supabase = "supabase" in supabaseOrOptions
    ? supabaseOrOptions.supabase
    : supabaseOrOptions;
  const maintenanceAuthority = "supabase" in supabaseOrOptions
    ? supabaseOrOptions.authority
    : authority;
  requireMaintenanceAuthority(maintenanceAuthority);

  const observer: RecurringLifecycleObserver = emitRecurringLifecycleSignal;
  const lifecycle = createActivatedRecurringTaskLifecycle(supabase, { observer });
  return createRecurringTaskMaintenanceCapabilityForLifecycle(
    maintenanceAuthority,
    lifecycle,
    { observer },
  );
}

/** Private reference-composition seam used to test maintenance behavior. */
export function createRecurringTaskMaintenanceCapabilityForLifecycle(
  authority: RecurringTaskMaintenanceAuthority,
  lifecycle: RecurringTaskPrewarmingLifecycle,
  options: MaintenanceCompositionOptions = {},
): RecurringTaskMaintenanceCapability {
  requireMaintenanceAuthority(authority);
  const { observer = emitRecurringLifecycleSignal, ...prewarmOptions } = options;

  return {
    async run() {
      let result: PrewarmResult;
      try {
        result = await prewarmActiveRecurringTaskCoverage(lifecycle, {
          ...prewarmOptions,
          observer,
        });
      } catch {
        return unavailableResult();
      }
      return aggregateResult(result);
    },
  };
}

function aggregateResult(result: PrewarmResult): RecurringTaskMaintenanceResult {
  const failedSeriesCount = result.failedSeriesIds.length;
  const operationalFailures: RecurringTaskMaintenanceFailures = {
    total: failedSeriesCount,
    activeSeriesScan: 0,
    coveragePrewarm: failedSeriesCount,
  };
  const status = failedSeriesCount === 0 ? "complete" : "partial";
  return {
    status,
    type: status,
    seriesCount: result.seriesCount,
    warmedSeriesCount: result.warmedSeriesCount,
    skippedSeriesCount: result.skippedSeriesCount,
    failedSeriesCount,
    operationalFailures,
  };
}

function unavailableResult(): RecurringTaskMaintenanceResult {
  return {
    status: "unavailable",
    type: "unavailable",
    seriesCount: 0,
    warmedSeriesCount: 0,
    skippedSeriesCount: 0,
    failedSeriesCount: 0,
    operationalFailures: {
      total: 1,
      activeSeriesScan: 1,
      coveragePrewarm: 0,
    },
  };
}

function requireMaintenanceAuthority(
  authority: RecurringTaskMaintenanceAuthority | undefined,
): asserts authority is RecurringTaskMaintenanceAuthority {
  if (
    !authority
    || authority.type !== "cron"
    || authority.serviceId !== RECURRING_TASK_MAINTENANCE_SERVICE_ID
  ) {
    throw new TypeError("A recurring task maintenance authority is required");
  }
}
