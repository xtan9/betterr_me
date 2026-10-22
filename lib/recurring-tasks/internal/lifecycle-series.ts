/** Series Revision and Task Occurrence rules used by lifecycle commands. */

import { compareLocalDates, calculateScheduledDates } from "./recurrence";

import type {
  SeriesDefaults,
  RecurringTaskSeries,
  SeriesRevision,
  RecurringSeriesStatus,
  TaskOccurrence,
  OccurrenceOverrides,
  OccurrenceOverrideField,
  ActiveSeriesSummary,
} from "./lifecycle-contract";

export function normalizeDefaults(defaults: SeriesDefaults): SeriesDefaults {
  return {
    title: defaults.title,
    description: defaults.description ?? null,
    priority: defaults.priority ?? 0,
    categoryId: defaults.categoryId ?? null,
    dueTime: defaults.dueTime ?? null,
    ...(defaults.sortOrder === undefined ? {} : { sortOrder: defaults.sortOrder }),
    ...(defaults.status === undefined ? {} : { status: defaults.status }),
    ...(defaults.section === undefined ? {} : { section: defaults.section }),
    ...(defaults.projectId === undefined ? {} : { projectId: defaults.projectId }),
  };
}

export function currentRevision(series: RecurringTaskSeries): SeriesRevision {
  const revision = series.revisions.find(
    (candidate) => candidate.id === series.currentRevisionId,
  );
  if (!revision) throw new Error("Series current revision is missing");
  return revision;
}

export function closeRevision(revision: SeriesRevision, effectiveDate: string): void {
  if (
    revision.effectiveTo === null
    || compareLocalDates(effectiveDate, revision.effectiveTo) < 0
  ) {
    revision.effectiveTo = effectiveDate;
  }
}

export function successorRevision(
  series: RecurringTaskSeries,
  previous: SeriesRevision,
  effectiveDate: string,
  state: RecurringSeriesStatus,
  createdAt: string,
  idFactory: () => string,
): SeriesRevision {
  return {
    id: idFactory(),
    seriesId: series.id,
    effectiveFrom: effectiveDate,
    effectiveTo: null,
    state,
    recurrenceRule: previous.recurrenceRule,
    recurrenceAnchor: previous.recurrenceAnchor,
    activationDate: effectiveDate,
    defaults: normalizeDefaults(previous.defaults),
    createdAt,
  };
}

export function resolveRevision(
  series: RecurringTaskSeries,
  scheduledDate: string,
): SeriesRevision | undefined {
  return [...series.revisions]
    .reverse()
    .find((revision) => (
      compareLocalDates(revision.effectiveFrom, scheduledDate) <= 0
      && (
        revision.effectiveTo === null
        || compareLocalDates(scheduledDate, revision.effectiveTo) < 0
      )
    ));
}

function isDateProducedByRevision(
  revision: SeriesRevision,
  scheduledDate: string,
): boolean {
  if (revision.state !== "active") return false;
  return calculateScheduledDates({
    rule: revision.recurrenceRule,
    recurrenceAnchor: revision.recurrenceAnchor,
    activationDate: revision.activationDate,
    range: { from: scheduledDate, to: scheduledDate },
  }).includes(scheduledDate);
}

export function isDateProducedBySeries(
  series: RecurringTaskSeries,
  scheduledDate: string,
): boolean {
  if (
    series.lastScheduledDate
    && compareLocalDates(scheduledDate, series.lastScheduledDate) > 0
  ) {
    return false;
  }
  const revision = resolveRevision(series, scheduledDate);
  return revision ? isDateProducedByRevision(revision, scheduledDate) : false;
}

export function occurrenceHasIntent(occurrence: TaskOccurrence): boolean {
  return Object.keys(occurrence.overrides).length > 0;
}

export function ownedOccurrence(
  series: RecurringTaskSeries,
  occurrenceId: string,
): TaskOccurrence | undefined {
  return series.occurrences.find((occurrence) => occurrence.id === occurrenceId);
}

export function reconcileEligibleOccurrences(
  series: RecurringTaskSeries,
  fromDate: string,
): void {
  for (const occurrence of series.occurrences) {
    if (
      (occurrence.state !== "open" && occurrence.state !== "extra")
      || compareLocalDates(occurrence.scheduledDate, fromDate) < 0
    ) {
      continue;
    }
    if (isDateProducedBySeries(series, occurrence.scheduledDate)) {
      const revision = resolveRevision(series, occurrence.scheduledDate);
      if (revision) {
        occurrence.revisionId = revision.id;
        occurrence.details = mergeDetails(
          revision.defaults,
          occurrence.overrides,
        );
      }
      continue;
    }
    if (occurrence.state === "open") {
      occurrence.state = occurrenceHasIntent(occurrence) ? "extra" : "withdrawn";
    }
  }
}

export function withdrawAllEligibleOccurrences(series: RecurringTaskSeries): void {
  for (const occurrence of series.occurrences) {
    if (occurrence.state !== "open" && occurrence.state !== "extra") continue;
    occurrence.state = "withdrawn";
    series.intentionalAbsences = addUnique(
      series.intentionalAbsences,
      occurrence.scheduledDate,
    );
  }
}

export function mergeDetails(
  defaults: SeriesDefaults,
  overrides: OccurrenceOverrides,
): SeriesDefaults {
  const next = normalizeDefaults(defaults);
  for (const key of Object.keys(overrides) as OccurrenceOverrideField[]) {
    if (key === "dueDate") continue;
    (next as unknown as Record<string, unknown>)[key] = overrides[key];
  }
  return next;
}

export function toActiveSeriesSummary(series: RecurringTaskSeries): ActiveSeriesSummary {
  return {
    id: series.id,
    userId: series.userId,
    status: "active",
    timeZone: series.timeZone,
    coverageHorizon: series.coverageHorizon,
  };
}

export function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value].sort();
}

export function clearPauseAbsencesFrom(
  series: RecurringTaskSeries,
  effectiveDate: string,
): void {
  series.intentionalAbsences = series.intentionalAbsences.filter((date) => {
    if (compareLocalDates(date, effectiveDate) < 0) return true;
    const occurrence = series.occurrences.find(
      (candidate) => candidate.scheduledDate === date,
    );
    // A skipped occurrence is its own durable suppression fact and must
    // survive a later resume boundary.
    return occurrence?.state === "skipped";
  });
}
