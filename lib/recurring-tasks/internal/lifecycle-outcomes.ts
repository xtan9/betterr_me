/** Constructs typed lifecycle results and attaches mutation observations. */

import type {
  RecurringTaskSeries,
  LifecycleObservability,
  LifecycleMutationResult,
  LifecycleOutcome,
  LifecycleSuccess,
  InvalidTransitionOutcome,
  NotFoundOutcome,
} from "./lifecycle-contract";

import {
  observabilityIfNonZero,
  type ObservabilitySnapshot,
  mergeObservability,
  observabilitySince,
} from "./lifecycle-metrics";

export function summarize(
  series: RecurringTaskSeries,
  observability?: LifecycleObservability,
): LifecycleMutationResult {
  return {
    series,
    occurrences: series.occurrences.filter(
      (occurrence) => occurrence.state !== "withdrawn",
    ),
    intentionalAbsences: [...series.intentionalAbsences].sort(),
    ...observabilityIfNonZero(observability),
  };
}

export function withMutationObservability(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
  before: ObservabilitySnapshot,
): LifecycleOutcome<RecurringTaskSeries> {
  if (!isLifecycleSuccess(outcome)) return outcome;
  return {
    ...outcome,
    ...observabilityIfNonZero(
      mergeObservability(outcome.observability, observabilitySince(before, outcome.series)),
    ),
  };
}

export function success(
  result: LifecycleMutationResult,
  status: "complete" | "already-applied",
): LifecycleSuccess<RecurringTaskSeries> {
  return {
    status,
    type: status,
    value: result.series,
    series: result.series,
    occurrences: result.occurrences,
    intentionalAbsences: result.intentionalAbsences,
    ...observabilityIfNonZero(result.observability),
  };
}

export function isLifecycleSuccess(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): outcome is LifecycleSuccess<RecurringTaskSeries> {
  return "value" in outcome;
}

export function invalidTransition(reason: string): InvalidTransitionOutcome {
  return { status: "invalid-transition", type: "invalid-transition", reason };
}

export function notFound(): NotFoundOutcome {
  return { status: "not-found", type: "not-found" };
}
