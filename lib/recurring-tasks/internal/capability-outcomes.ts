/** Maps lifecycle outcomes into stable authenticated capability results. */

import type {
  SeriesCommandRequest,
  LifecycleOutcome,
  RecurringTaskSeries,
  NotFoundOutcome,
  InvalidTransitionOutcome,
  ConflictOutcome,
  CoverageUnavailableOutcome,
  PrewarmSkippedOutcome,
  LocalDateRange,
} from "./lifecycle";

import {
  type SeriesStateCommand,
  type RecurringTaskOperation,
  type SeriesCommandSuccess,
  type RecurringTaskFailure,
  type StateCommandResult,
  type RecurringTaskOperationId,
  type ValidationFailure,
  type CoverageCompleteness,
  type CoverageResult,
  RECURRING_TASK_OPERATION_IDS,
  type SeriesProjection,
} from "./capability-contract";

import { parseSeriesVersion, encodeSeriesVersion, isOpaqueSeriesVersion } from "./series-version";

export const STABLE_VALIDATION_REASONS = Object.freeze({
  command: "invalid-command",
  query: "invalid-query",
} as const);

export async function runStateCommand(
  input: SeriesStateCommand,
  operation: RecurringTaskOperation,
  successType: "paused" | "resumed" | "ended",
  invoke: (request: SeriesCommandRequest) => Promise<LifecycleOutcome<RecurringTaskSeries>>,
  userId: string,
): Promise<SeriesCommandSuccess | RecurringTaskFailure> {
  const operationValidation = validateOperationId(operation, input?.operationId);
  if (operationValidation) return operationValidation;
  const operationId = input.operationId;
  if (typeof input?.seriesId !== "string" || !input.seriesId.trim()) {
    return validationFailure(
      operation,
      operationId,
      "seriesId",
      "Series ID is required",
    );
  }
  const version = parseSeriesVersion(input.version, input.seriesId);
  if (!version) {
    return validationFailure(
      operation,
      operationId,
      "version",
      "Series version is invalid",
    );
  }
  const {
    operationId: _operationId,
    seriesId,
    version: _version,
    userId: _callerUserId,
    ...request
  } = input as SeriesStateCommand & { userId?: unknown };

  try {
    const outcome = await invoke({
      ...request,
      userId,
      seriesId,
      expectedRevisionToken: version.revisionToken,
      idempotencyKey: operationId,
      source: "interactive",
    } as SeriesCommandRequest);
    return mapMutationSuccessOrFailure(
      outcome,
      operation,
      operationId,
      successType,
      seriesId,
    ) as StateCommandResult;
  } catch (error) {
    return mapCommandError(error, operation, operationId);
  }
}

export function mapMutationSuccessOrFailure(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
  operation: RecurringTaskOperation,
  operationId: RecurringTaskOperationId,
  successType: "created" | "revised" | "paused" | "resumed" | "ended",
  seriesId?: string,
): SeriesCommandSuccess | RecurringTaskFailure {
  if (isLifecycleSuccess(outcome)) {
    return {
      type: successType,
      status: outcome.status,
      operation,
      operationId,
      series: toSeriesProjection(outcome.series),
    } as SeriesCommandSuccess;
  }
  return mapLifecycleFailure(outcome, operation, operationId, seriesId);
}

export function mapLifecycleFailure(
  outcome:
    | NotFoundOutcome
    | InvalidTransitionOutcome
    | ConflictOutcome
    | CoverageUnavailableOutcome
    | PrewarmSkippedOutcome,
  operation: RecurringTaskOperation,
  operationId?: RecurringTaskOperationId,
  seriesId?: string,
): RecurringTaskFailure {
  const common = {
    operation,
    ...(operationId === undefined ? {} : { operationId }),
  };
  switch (outcome.status) {
    case "not-found":
      return { type: "not-found", status: "not-found", ...common };
    case "invalid-transition":
      return {
        type: "invalid-transition",
        status: "invalid-transition",
        reason: outcome.reason,
        ...common,
      };
    case "conflict":
      return {
        type: "conflict",
        status: "conflict",
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.expectedRevisionToken === undefined
          ? {}
          : { expectedVersion: encodeSeriesVersion(seriesId, outcome.expectedRevisionToken) }),
        ...(outcome.actualRevisionToken === undefined
          ? {}
          : { actualVersion: encodeSeriesVersion(seriesId, outcome.actualRevisionToken) }),
        ...common,
      };
    case "coverage-unavailable":
      return {
        type: "coverage-unavailable",
        status: "coverage-unavailable",
        requestedRange: outcome.requestedRange,
        coverageHorizon: outcome.coverageHorizon,
        reason: outcome.reason,
        ...common,
      };
    case "skipped":
      return {
        type: "invalid-transition",
        status: "invalid-transition",
        reason: outcome.reason,
        ...common,
      };
  }
}

export function mapCommandError(
  error: unknown,
  operation: RecurringTaskOperation,
  operationId: RecurringTaskOperationId,
): RecurringTaskFailure {
  if (error instanceof RangeError) {
    return validationFailure(
      operation,
      operationId,
      undefined,
      STABLE_VALIDATION_REASONS.command,
    );
  }
  throw error;
}

export function mapQueryError(
  error: unknown,
  operation: RecurringTaskOperation,
): RecurringTaskFailure {
  if (error instanceof RangeError) {
    return validationFailure(
      operation,
      undefined,
      undefined,
      STABLE_VALIDATION_REASONS.query,
    );
  }
  throw error;
}

export function validationFailure(
  operation: RecurringTaskOperation,
  operationId: RecurringTaskOperationId | undefined,
  field: string | undefined,
  reason: string,
): ValidationFailure {
  return {
    type: "validation",
    status: "validation",
    operation,
    ...(operationId === undefined ? {} : { operationId }),
    ...(field === undefined ? {} : { field }),
    reason,
  };
}

export function validateOperationId(
  operation: RecurringTaskOperation,
  operationId: unknown,
): ValidationFailure | undefined {
  if (typeof operationId !== "string" || !operationId.trim()) {
    return validationFailure(
      operation,
      typeof operationId === "string" ? operationId : undefined,
      "operationId",
      "Operation ID is required",
    );
  }
  return undefined;
}

export function makeCoverageResult(
  operationId: RecurringTaskOperationId,
  requestedRange: LocalDateRange,
  status: CoverageCompleteness["status"],
  series: RecurringTaskSeries[],
  occurrences: RecurringTaskSeries["occurrences"],
  intentionalAbsences: string[],
  failedSeriesIds: string[] = [],
  reason = "Coverage is unavailable",
): CoverageResult {
  const ids = [...new Set(failedSeriesIds)].sort();
  const completeness: CoverageCompleteness = status === "complete"
    ? {
      status: "complete",
      type: "complete",
      requestedRange,
      failedSeriesIds: [],
    }
    : status === "partial"
      ? {
        status: "partial",
        type: "partial",
        requestedRange,
        failedSeriesIds: ids,
      }
      : {
        status: "unavailable",
        type: "unavailable",
        requestedRange,
        failedSeriesIds: ids,
        reason,
      };

  return {
    type: "coverage",
    status,
    operation: RECURRING_TASK_OPERATION_IDS.ensureCoverage,
    operationId,
    requestedRange,
    completeness,
    series: series.map(toSeriesProjection),
    occurrences,
    intentionalAbsences: [...intentionalAbsences].sort(),
  };
}

export function isLifecycleSuccess(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): outcome is Extract<LifecycleOutcome<RecurringTaskSeries>, { series: RecurringTaskSeries }> {
  return "series" in outcome && "value" in outcome;
}

export function toSeriesProjection(series: RecurringTaskSeries): SeriesProjection {
  const raw = series as RecurringTaskSeries & {
    version?: string;
  };
  const {
    userId: _userId,
    revisionToken: _revisionToken,
    version: rawVersion,
    ...publicSeries
  } = raw;
  const version = rawVersion && isOpaqueSeriesVersion(rawVersion)
    ? rawVersion
    : encodeSeriesVersion(series.id, series.revisionToken);
  return { ...publicSeries, version } as SeriesProjection;
}
