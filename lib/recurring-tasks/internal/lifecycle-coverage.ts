/** Materializes exact Coverage Horizons while preserving intentional occurrence state. */

import { compareLocalDates, addLocalDays, calculateScheduledDates } from "./recurrence";

import type {
  RecurringTaskSeries,
  LocalDateRange,
  LifecycleMutationResult,
  LifecycleContext,
} from "./lifecycle-contract";

import { validateRange } from "./lifecycle-validation";

import { captureObservability, observabilitySince } from "./lifecycle-metrics";

import {
  occurrenceHasIntent,
  resolveRevision,
  mergeDetails,
  normalizeDefaults,
} from "./lifecycle-series";

import { summarize } from "./lifecycle-outcomes";

export function coverageRangeForExtension(
  series: RecurringTaskSeries,
  requested: LocalDateRange,
): LocalDateRange {
  if (
    series.coverageHorizon
    && compareLocalDates(requested.from, addLocalDays(series.coverageHorizon, 1)) > 0
  ) {
    return {
      from: addLocalDays(series.coverageHorizon, 1),
      to: requested.to,
    };
  }
  return requested;
}

export function ensureCoverageState(
  series: RecurringTaskSeries,
  range: LocalDateRange,
  idFactory: () => string,
  updatedAt: string = series.updatedAt,
): LifecycleMutationResult {
  validateRange(range);
  const before = captureObservability(series);
  const datesByRevision = new Map<string, string[]>();
  const intentionalAbsences = new Set(series.intentionalAbsences);
  const producedDates = new Set<string>();

  for (const revision of series.revisions) {
    const start = maxDate(range.from, revision.effectiveFrom);
    const end = revision.effectiveTo
      ? minDate(range.to, addLocalDays(revision.effectiveTo, -1))
      : range.to;
    if (compareLocalDates(start, end) > 0) continue;

    const dates = calculateScheduledDates({
      rule: revision.recurrenceRule,
      recurrenceAnchor: revision.recurrenceAnchor,
      activationDate: revision.activationDate,
      range: { from: start, to: end },
    });
    datesByRevision.set(revision.id, dates);
    if (revision.state !== "active") {
      for (const date of dates) intentionalAbsences.add(date);
    } else {
      for (const date of dates) producedDates.add(date);
    }
  }

  const scheduledDates = [...datesByRevision.values()]
    .flat()
    .sort();
  let retainedCount = series.occurrences.filter(
    (occurrence) => occurrence.state !== "withdrawn",
  ).length;
  for (const occurrence of [...series.occurrences].sort(
    (left, right) => left.scheduledDate.localeCompare(right.scheduledDate)
      || left.id.localeCompare(right.id),
  )) {
    if (
      occurrence.state === "open"
      && compareLocalDates(occurrence.scheduledDate, range.from) >= 0
      && compareLocalDates(occurrence.scheduledDate, range.to) <= 0
    ) {
      const retainedBefore = series.occurrences.filter(
        (candidate) => candidate.state !== "withdrawn"
          && compareLocalDates(candidate.scheduledDate, occurrence.scheduledDate) < 0,
      ).length;
      const exceedsLimit = series.occurrenceLimit !== null
        && retainedBefore >= series.occurrenceLimit;
      const isPastLastScheduledDate = series.lastScheduledDate !== null
        && compareLocalDates(
          occurrence.scheduledDate,
          series.lastScheduledDate,
        ) > 0;
      if (
        !producedDates.has(occurrence.scheduledDate)
        || exceedsLimit
        || isPastLastScheduledDate
      ) {
        occurrence.state = occurrenceHasIntent(occurrence) ? "extra" : "withdrawn";
        if (occurrence.state === "withdrawn") retainedCount -= 1;
      }
    }
  }

  for (const date of scheduledDates) {
    const revision = resolveRevision(series, date);
    if (!revision) {
      intentionalAbsences.add(date);
      continue;
    }
    if (revision.state !== "active") continue;

    const existing = series.occurrences.find(
      (occurrence) => occurrence.scheduledDate === date,
    );
    if (existing) {
      if (existing.state === "withdrawn") {
        if (
          series.status === "ended"
          || (
            series.lastScheduledDate !== null
            && compareLocalDates(date, series.lastScheduledDate) > 0
          )
          || (
            series.occurrenceLimit !== null
            && retainedCount >= series.occurrenceLimit
          )
        ) {
          intentionalAbsences.add(date);
          continue;
        }
        existing.state = "open";
        existing.revisionId = revision.id;
        existing.details = mergeDetails(
          revision.defaults,
          existing.overrides,
        );
        existing.dueDate = existing.dueDate ?? date;
        retainedCount += 1;
      }
      continue;
    }

    if (series.status === "ended") {
      continue;
    }

    if (
      series.occurrenceLimit !== null
      && retainedCount >= series.occurrenceLimit
    ) {
      series.status = "ended";
      break;
    }
    if (
      series.lastScheduledDate
      && compareLocalDates(date, series.lastScheduledDate) > 0
    ) {
      series.status = "ended";
      break;
    }

    series.occurrences.push({
      id: idFactory(),
      seriesId: series.id,
      revisionId: revision.id,
      scheduledDate: date,
      dueDate: date,
      details: normalizeDefaults(revision.defaults),
      state: "open",
      overrides: {},
      taskId: null,
      completedAt: null,
      createdAt: series.updatedAt,
    });
    retainedCount += 1;
  }

  if (series.occurrenceLimit !== null && retainedCount >= series.occurrenceLimit) {
    series.status = "ended";
  }
  if (
    series.lastScheduledDate !== null
    && compareLocalDates(range.to, series.lastScheduledDate) >= 0
  ) {
    series.status = "ended";
  }

  if (
    series.coverageHorizon === null
    || compareLocalDates(range.to, series.coverageHorizon) > 0
  ) {
    series.coverageHorizon = range.to;
  }
  series.intentionalAbsences = [...intentionalAbsences].sort();
  series.updatedAt = updatedAt;
  return summarize(series, observabilitySince(before, series));
}

export function isCoverageOperation(
  operation: string,
  request: LifecycleContext & { seriesId?: string },
): boolean {
  return operation.includes("coverage")
    || operation === "prewarm-coverage"
    || "coverage" in request
    || "range" in request;
}

export function coverageFrom(
  coverageHorizon: string | null,
  effectiveDate: string,
): LocalDateRange | undefined {
  return coverageHorizon && compareLocalDates(coverageHorizon, effectiveDate) >= 0
    ? { from: effectiveDate, to: coverageHorizon }
    : undefined;
}

function maxDate(left: string, right: string): string {
  return compareLocalDates(left, right) >= 0 ? left : right;
}

function minDate(left: string, right: string): string {
  return compareLocalDates(left, right) <= 0 ? left : right;
}
