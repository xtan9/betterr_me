/** Validates lifecycle requests and rechecks scoped identities within transactions. */

import { compareLocalDates } from "./recurrence";

import type {
  CreateSeriesRequest,
  LocalDateRange,
  RecurringTaskSeries,
  ReviseSeriesRequest,
  InvalidTransitionOutcome,
  LifecycleContext,
  ConflictOutcome,
  TaskOccurrence,
  LifecycleScope,
  NotFoundOutcome,
} from "./lifecycle-contract";

import { invalidTransition, notFound } from "./lifecycle-outcomes";

import { ownedOccurrence } from "./lifecycle-series";

export function validateCreateRequest(request: CreateSeriesRequest): void {
  if (compareLocalDates(request.activationDate, request.recurrenceAnchor) < 0) {
    throw new RangeError("Activation Date cannot be before the Recurrence Anchor");
  }
  if (
    request.occurrenceLimit !== undefined
    && request.occurrenceLimit !== null
    && (!Number.isInteger(request.occurrenceLimit) || request.occurrenceLimit < 1)
  ) {
    throw new RangeError("Occurrence Limit must be a positive integer");
  }
  if (
    request.lastScheduledDate
    && compareLocalDates(request.lastScheduledDate, request.activationDate) < 0
  ) {
    throw new RangeError("Last Scheduled Date cannot be before Activation Date");
  }
  if (request.coverage) validateRange(request.coverage);
  validateTimeZone(request.timeZone ?? request.timezone ?? "UTC");
}

export function validateTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new RangeError("Invalid IANA timezone");
  }
  return timeZone;
}

export function validateRange(range: LocalDateRange): void {
  if (compareLocalDates(range.from, range.to) > 0) {
    throw new RangeError("Coverage range must be inclusive and ordered");
  }
}

export function validateRevisionRequest(
  series: RecurringTaskSeries,
  request: ReviseSeriesRequest,
): InvalidTransitionOutcome | undefined {
  if (
    request.occurrenceLimit !== undefined
    && request.occurrenceLimit !== null
    && (!Number.isInteger(request.occurrenceLimit) || request.occurrenceLimit < 1)
  ) {
    return invalidTransition("Occurrence Limit must be a positive integer");
  }
  if (
    request.lastScheduledDate !== undefined
    && request.lastScheduledDate !== null
    && compareLocalDates(request.lastScheduledDate, series.activationDate) < 0
  ) {
    return invalidTransition("Last Scheduled Date cannot be before activation");
  }
  if (request.coverage) validateRange(request.coverage);
  return undefined;
}

export function checkExpectedRevision(
  series: RecurringTaskSeries,
  request: LifecycleContext,
): ConflictOutcome | undefined {
  if (
    request.expectedRevisionToken !== undefined
    && request.expectedRevisionToken !== series.revisionToken
  ) {
    return {
      status: "conflict",
      type: "conflict",
      expectedRevisionToken: request.expectedRevisionToken,
      actualRevisionToken: series.revisionToken,
    };
  }
  return undefined;
}

export function validateOccurrenceCommand(
  series: RecurringTaskSeries,
  occurrence: TaskOccurrence,
  request: {
    scope?: LifecycleScope;
    taskId?: string;
    scheduledDate?: string;
    expectedRevisionId?: string;
  },
): NotFoundOutcome | InvalidTransitionOutcome | ConflictOutcome | undefined {
  if (request.scope !== undefined && request.scope !== "this") {
    return invalidTransition(
      "Task Occurrence state commands only support the this scope",
    );
  }
  if (
    request.taskId !== undefined
    && occurrence.taskId !== request.taskId
  ) {
    return notFound();
  }
  if (
    request.scheduledDate !== undefined
    && occurrence.scheduledDate !== request.scheduledDate
  ) {
    return notFound();
  }
  if (
    request.expectedRevisionId !== undefined
    && occurrence.revisionId !== request.expectedRevisionId
  ) {
    return {
      status: "conflict",
      type: "conflict",
      reason: "Task occurrence revision changed concurrently",
    };
  }
  if (occurrence.seriesId !== series.id) return notFound();
  return undefined;
}

/**
 * Scoped Series commands receive a visible Task as a routing hint. The
 * transaction must prove that the Task still belongs to the requested
 * occurrence and Series before changing a revision or Series state.
 */
export function validateScopedSeriesTarget(
  series: RecurringTaskSeries,
  request: {
    scope?: LifecycleScope;
    taskId?: string;
    occurrenceId?: string;
    scheduledDate?: string;
    expectedRevisionId?: string;
  },
  allowedScopes: readonly LifecycleScope[],
): NotFoundOutcome | InvalidTransitionOutcome | ConflictOutcome | undefined {
  const hasVisibleIdentity = request.taskId !== undefined
    || request.occurrenceId !== undefined
    || request.scheduledDate !== undefined
    || request.expectedRevisionId !== undefined;
  if (!hasVisibleIdentity) return undefined;
  if (!request.taskId || !request.occurrenceId) return notFound();
  if (!request.scope || !allowedScopes.includes(request.scope)) {
    return invalidTransition(
      `Task Command scope must be ${allowedScopes.join(" or ")}`,
    );
  }
  const occurrence = ownedOccurrence(series, request.occurrenceId);
  if (!occurrence || occurrence.seriesId !== series.id) return notFound();
  if (occurrence.taskId !== request.taskId) return notFound();
  if (
    request.scheduledDate !== undefined
    && occurrence.scheduledDate !== request.scheduledDate
  ) {
    return notFound();
  }
  if (
    request.expectedRevisionId !== undefined
    && occurrence.revisionId !== request.expectedRevisionId
  ) {
    return {
      status: "conflict",
      type: "conflict",
      reason: "Task occurrence revision changed concurrently",
    };
  }
  return undefined;
}
