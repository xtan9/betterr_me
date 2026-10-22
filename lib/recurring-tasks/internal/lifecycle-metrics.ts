/** Measures occurrence changes without coupling scheduling rules to telemetry. */

import type { LifecycleObservability, RecurringTaskSeries } from "./lifecycle-contract";

export function emptyObservability(): LifecycleObservability {
  return {
    createdOccurrences: 0,
    intentionalAbsences: 0,
    withdrawnOccurrences: 0,
  };
}

export interface ObservabilitySnapshot {
  occurrenceIds: Set<string>;
  intentionalAbsences: Set<string>;
  withdrawnOccurrences: number;
}

export function captureObservability(series: RecurringTaskSeries): ObservabilitySnapshot {
  return {
    occurrenceIds: new Set(series.occurrences.map((occurrence) => occurrence.id)),
    intentionalAbsences: new Set(series.intentionalAbsences),
    withdrawnOccurrences: series.occurrences.filter(
      (occurrence) => occurrence.state === "withdrawn",
    ).length,
  };
}

export function observabilitySince(
  before: ObservabilitySnapshot,
  series: RecurringTaskSeries,
): LifecycleObservability {
  return {
    createdOccurrences: series.occurrences.filter(
      (occurrence) => !before.occurrenceIds.has(occurrence.id),
    ).length,
    intentionalAbsences: series.intentionalAbsences.filter(
      (date) => !before.intentionalAbsences.has(date),
    ).length,
    withdrawnOccurrences: Math.max(
      0,
      series.occurrences.filter((occurrence) => occurrence.state === "withdrawn").length
        - before.withdrawnOccurrences,
    ),
  };
}

export function mergeObservability(
  left: LifecycleObservability | undefined,
  right: LifecycleObservability,
): LifecycleObservability {
  return {
    createdOccurrences: Math.max(left?.createdOccurrences ?? 0, right.createdOccurrences),
    intentionalAbsences: Math.max(left?.intentionalAbsences ?? 0, right.intentionalAbsences),
    withdrawnOccurrences: Math.max(left?.withdrawnOccurrences ?? 0, right.withdrawnOccurrences),
  };
}

export function addObservability(
  target: LifecycleObservability,
  source: LifecycleObservability | undefined,
): void {
  if (!source) return;
  target.createdOccurrences += source.createdOccurrences;
  target.intentionalAbsences += source.intentionalAbsences;
  target.withdrawnOccurrences += source.withdrawnOccurrences;
}

export function observabilityIfNonZero(
  value: LifecycleObservability | undefined,
): { observability?: LifecycleObservability } {
  if (!value) return {};
  if (
    value.createdOccurrences === 0
    && value.intentionalAbsences === 0
    && value.withdrawnOccurrences === 0
  ) {
    return {};
  }
  return { observability: value };
}
