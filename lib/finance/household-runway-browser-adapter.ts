import {
  createHouseholdRunwayBrowserAdapterWithCapabilities,
  type HouseholdRunwayBrowserAdapterOptions,
} from "@/lib/finance/internal/household-runway-browser-adapter";
import type { HouseholdRunwayInterviewRuntime } from "@/lib/finance/household-runway-interview-runtime";

export type {
  HouseholdRunwayBrowserAdapterOptions,
  HouseholdRunwayBrowserEnvironment,
  HouseholdRunwayBrowserReportPresentation,
} from "@/lib/finance/internal/household-runway-browser-adapter";

/** Composes the supported Runtime with the production browser capabilities. */
export function createHouseholdRunwayBrowserAdapter(
  options: HouseholdRunwayBrowserAdapterOptions = {},
): HouseholdRunwayInterviewRuntime {
  return createHouseholdRunwayBrowserAdapterWithCapabilities(options);
}
