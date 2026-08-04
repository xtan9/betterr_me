/* eslint-disable react-hooks/refs -- the Runtime instance is an external-store resource. */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  createHouseholdRunwayBrowserAdapter,
  restoreHouseholdRunwayBrowserRuntime,
  type HouseholdRunwayBrowserAdapterOptions,
} from "@/lib/finance/household-runway-browser-adapter";
import type {
  HouseholdRunwayInterviewIntent,
  HouseholdRunwayInterviewRuntime,
  HouseholdRunwayInterviewRuntimeSnapshot,
} from "@/lib/finance/household-runway-interview-runtime";

export interface HouseholdRunwayReactRuntimeOptions
  extends HouseholdRunwayBrowserAdapterOptions {
  /** Stable identity for the authenticated Plan supplied by the server. */
  initialPlan?: HouseholdRunwayBrowserAdapterOptions["initialPlan"];
  /** Test seam for the lifecycle boundary; production uses the browser adapter. */
  createAdapter?: (
    options: HouseholdRunwayBrowserAdapterOptions,
  ) => HouseholdRunwayInterviewRuntime;
}

export interface HouseholdRunwayReactRuntimeResult {
  readonly snapshot: HouseholdRunwayInterviewRuntimeSnapshot;
  readonly send: (intent: HouseholdRunwayInterviewIntent) => void;
}

const lifecycleGenerations = new WeakMap<object, number>();

/**
 * The only React-facing Household Runway boundary. Construction is lazy and
 * side-effect free; the external-store subscription is installed before the
 * Runtime's idempotent startup effect runs.
 */
export function useHouseholdRunwayRuntime(
  options: HouseholdRunwayReactRuntimeOptions,
): HouseholdRunwayReactRuntimeResult {
  const runtimeRef = useRef<HouseholdRunwayInterviewRuntime | null>(null);
  if (runtimeRef.current === null) {
    runtimeRef.current = (options.createAdapter ?? createHouseholdRunwayBrowserAdapter)({
      ...options,
      restore: options.restore ?? restoreHouseholdRunwayBrowserRuntime,
    });
  }
  const runtime = runtimeRef.current;

  const subscribe = useCallback(
    (listener: () => void) => runtime.subscribe(listener),
    [runtime],
  );
  const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    const generation = (lifecycleGenerations.get(runtime) ?? 0) + 1;
    lifecycleGenerations.set(runtime, generation);
    runtime.start();
    return () => {
      queueMicrotask(() => {
        if (lifecycleGenerations.get(runtime) === generation) runtime.dispose();
      });
    };
  }, [runtime]);

  const send = useCallback(
    (intent: HouseholdRunwayInterviewIntent) => runtime.send(intent),
    [runtime],
  );

  return { snapshot, send };
}
