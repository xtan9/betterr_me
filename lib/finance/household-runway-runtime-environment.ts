import type { HouseholdRunwayInterviewStage } from "@/lib/finance/internal/household-runway-interview";
import type { RunwayLocale } from "@/lib/finance/runway-regions";

export type HouseholdRunwayInterviewRuntimeEnvironmentMessage =
  | {
      type: "history_projection_changed";
      destination: "landing" | "interview";
      stage?: HouseholdRunwayInterviewStage;
    }
  | { type: "locale_changed"; locale?: RunwayLocale };

type RuntimeEnvironmentDispatcher = (
  message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
) => void;

const dispatchers = new WeakMap<object, RuntimeEnvironmentDispatcher>();

export function registerHouseholdRunwayRuntimeEnvironment(
  runtime: object,
  dispatcher: RuntimeEnvironmentDispatcher,
) {
  dispatchers.set(runtime, dispatcher);
}

export function unregisterHouseholdRunwayRuntimeEnvironment(runtime: object) {
  dispatchers.delete(runtime);
}

export function dispatchHouseholdRunwayRuntimeEnvironment(
  runtime: object,
  message: HouseholdRunwayInterviewRuntimeEnvironmentMessage,
) {
  dispatchers.get(runtime)?.(message);
}
