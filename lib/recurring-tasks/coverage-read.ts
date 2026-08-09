import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createAuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskPrincipal,
  type CoverageCapabilityResult,
  type CoverageCompleteness,
  type CoverageUnavailable,
  type LocalDateRange,
} from "./internal/capabilities";

export type {
  AuthenticatedRecurringTaskPrincipal,
  CoverageCompleteness,
  LocalDateRange,
} from "./internal/capabilities";

const COVERAGE_READ_SOURCES = [
  "task",
  "dashboard",
  "sidebar",
  "calendar",
] as const;

const COVERAGE_READ_OPERATION_PREFIXES = Object.freeze({
  task: "task-read-coverage",
  dashboard: "dashboard-read-coverage",
  sidebar: "sidebar-read-coverage",
  calendar: "calendar-read-coverage",
} satisfies Record<CoverageReadSource, string>);

export type CoverageReadSource = typeof COVERAGE_READ_SOURCES[number];

export type CoverageReadUnexpectedFailureObserver = (
  cause: unknown,
) => void | PromiseLike<void>;

export interface CoverageRead {
  ensure(
    range: LocalDateRange,
    onUnexpectedFailure?: CoverageReadUnexpectedFailureObserver,
  ): Promise<CoverageCompleteness>;
}

export interface CoverageReadOptions {
  supabase: SupabaseClient;
  principal: AuthenticatedRecurringTaskPrincipal;
  source: CoverageReadSource;
}

const COVERAGE_READ_UNAVAILABLE_REASON =
  "Coverage could not be ensured." as const;

export function createCoverageRead(
  options: CoverageReadOptions,
): CoverageRead {
  const { supabase, principal, source } = options;

  requireCoverageReadSource(source);
  if (!principal) {
    throw new TypeError("An authenticated user principal is required");
  }

  const capabilities = createAuthenticatedRecurringTaskCapabilities(
    supabase,
    principal,
  );
  const userId = principal.userId;
  const operationPrefix = COVERAGE_READ_OPERATION_PREFIXES[source];

  return {
    async ensure(range, onUnexpectedFailure) {
      try {
        const operationId = `${operationPrefix}:${userId}:${range.from}:${range.to}`;
        const outcome = await capabilities.coverage.ensure({
          operationId,
          range,
        });
        return toCoverageCompleteness(outcome, range);
      } catch (cause) {
        await notifyUnexpectedFailure(onUnexpectedFailure, cause);
        return unavailableCoverage(range);
      }
    },
  };
}

function toCoverageCompleteness(
  outcome: CoverageCapabilityResult,
  range: LocalDateRange,
): CoverageCompleteness {
  if (outcome?.type === "coverage") return outcome.completeness;
  if (
    outcome?.type === "coverage-unavailable"
    && typeof outcome.reason === "string"
  ) {
    return unavailableCoverage(range, outcome.reason);
  }
  return unavailableCoverage(range);
}

function unavailableCoverage(
  requestedRange: LocalDateRange,
  reason: string = COVERAGE_READ_UNAVAILABLE_REASON,
): CoverageUnavailable {
  return {
    status: "unavailable",
    type: "unavailable",
    requestedRange,
    failedSeriesIds: [],
    reason,
  };
}

async function notifyUnexpectedFailure(
  observer: CoverageReadUnexpectedFailureObserver | undefined,
  cause: unknown,
): Promise<void> {
  if (!observer) return;
  try {
    await observer(cause);
  } catch {
    // Diagnostics are best effort and must not alter the classified result.
  }
}

function requireCoverageReadSource(
  source: unknown,
): asserts source is CoverageReadSource {
  if (
    typeof source !== "string"
    || !COVERAGE_READ_SOURCES.includes(source as CoverageReadSource)
  ) {
    throw new TypeError("Coverage Read source is invalid");
  }
}
