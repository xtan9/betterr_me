/** Composes authenticated Series commands and queries over the lifecycle. */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createActivatedRecurringTaskLifecycle } from "./activation";

import { emitRecurringLifecycleSignal, type RecurringLifecycleObserver } from "./observability";

import type {
  RecurringTaskLifecyclePort,
  CreateSeriesRequest,
  ReviseSeriesRequest,
  LifecycleOutcome,
  RecurringTaskSeries,
  UserCoverageOutcome,
  EnsureUserCoverageRequest,
  NotFoundOutcome,
  InvalidTransitionOutcome,
  ConflictOutcome,
  CoverageUnavailableOutcome,
  PrewarmSkippedOutcome,
  LocalDateRange,
} from "./lifecycle";

import { isValidLocalDate, compareLocalDates } from "./recurrence";

import {
  type AuthenticatedRecurringTaskPrincipal,
  type AuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskCapabilityOptions,
  type RecurringTaskTelemetryPort,
  type SeriesCommands,
  RECURRING_TASK_OPERATION_IDS,
  type CreateSeriesCommand,
  type CreateSeriesResult,
  type ReviseSeriesCommand,
  type ReviseSeriesResult,
  type PauseSeriesResult,
  type ResumeSeriesResult,
  type EndSeriesResult,
  type SeriesQueries,
  type CoverageCapability,
} from "./capability-contract";

import {
  validateOperationId,
  mapMutationSuccessOrFailure,
  mapCommandError,
  validationFailure,
  runStateCommand,
  toSeriesProjection,
  mapQueryError,
  isLifecycleSuccess,
  mapLifecycleFailure,
  STABLE_VALIDATION_REASONS,
  makeCoverageResult,
} from "./capability-outcomes";

import { parseSeriesVersion } from "./series-version";

export {
  type AuthenticatedRecurringTaskPrincipal,
  type RecurringTaskOperationId,
  type SeriesVersion,
  RECURRING_TASK_OPERATION_IDS,
  type RecurringTaskOperation,
  type CreateSeriesCommand,
  type ReviseSeriesCommand,
  type SeriesStateCommand,
  type SeriesListQuery,
  type SeriesDetailQuery,
  type CoverageEnsureCommand,
  type SeriesProjection,
  type CreateSeriesSuccess,
  type ReviseSeriesSuccess,
  type PauseSeriesSuccess,
  type ResumeSeriesSuccess,
  type EndSeriesSuccess,
  type SeriesCommandSuccess,
  type RecurringTaskFailureType,
  type ValidationFailure,
  type NotFoundFailure,
  type ConflictFailure,
  type InvalidTransitionFailure,
  type CoverageUnavailableFailure,
  type RecurringTaskFailure,
  type CreateSeriesResult,
  type ReviseSeriesResult,
  type PauseSeriesResult,
  type ResumeSeriesResult,
  type EndSeriesResult,
  type SeriesListSuccess,
  type SeriesDetailSuccess,
  type SeriesListResult,
  type SeriesDetailResult,
  type CoverageComplete,
  type CoveragePartial,
  type CoverageUnavailable,
  type CoverageCompleteness,
  type CoverageResult,
  type CoverageCapabilityResult,
  type SeriesCommands,
  type SeriesQueries,
  type CoverageCapability,
  type AuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskCapabilityOptions,
} from "./capability-contract";

export {
  type DecodedSeriesVersion,
  encodeSeriesVersion,
  decodeSeriesVersion,
} from "./series-version";

export type {
  LocalDateRange,
  RecurringSeriesStatus,
  SeriesDefaults,
  SeriesRevision,
  TaskOccurrence,
} from "./lifecycle";

export function createAuthenticatedRecurringTaskCapabilities(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
): AuthenticatedRecurringTaskCapabilities;

export function createAuthenticatedRecurringTaskCapabilities(
  options: AuthenticatedRecurringTaskCapabilityOptions,
): AuthenticatedRecurringTaskCapabilities;

export function createAuthenticatedRecurringTaskCapabilities(
  supabaseOrOptions: SupabaseClient | AuthenticatedRecurringTaskCapabilityOptions,
  principal?: AuthenticatedRecurringTaskPrincipal,
): AuthenticatedRecurringTaskCapabilities {
  const supabase = "supabase" in supabaseOrOptions
    ? supabaseOrOptions.supabase
    : supabaseOrOptions;
  const isOptions = principal === undefined && "supabase" in supabaseOrOptions;
  const authenticatedPrincipal = isOptions
    ? supabaseOrOptions.principal
    : principal;

  return createAuthenticatedRecurringTaskCapabilitiesWithTelemetry(
    supabase,
    authenticatedPrincipal as AuthenticatedRecurringTaskPrincipal,
    { emit: emitRecurringLifecycleSignal },
  );
}

/**
 * Private interactive composition seam. Hosts may inject telemetry at
 * construction time, while the supported capability result stays focused on
 * user-facing lifecycle facts.
 */
export function createAuthenticatedRecurringTaskCapabilitiesWithTelemetry(
  supabase: SupabaseClient,
  principal: AuthenticatedRecurringTaskPrincipal,
  telemetry: RecurringTaskTelemetryPort,
): AuthenticatedRecurringTaskCapabilities {
  const observer: RecurringLifecycleObserver = (signal) => telemetry.emit(signal);
  return createRecurringTaskCapabilitiesForLifecycle(
    principal,
    createActivatedRecurringTaskLifecycle(supabase, { observer }),
  );
}

/** Descriptive alias for callers that do not need to mention authentication in a factory name. */
export const createRecurringTaskCapabilities =
  createAuthenticatedRecurringTaskCapabilities;

/** Internal composition seam used by the private reference implementation and tests. */
export function createRecurringTaskCapabilitiesForLifecycle(
  principal: AuthenticatedRecurringTaskPrincipal,
  lifecycle: RecurringTaskLifecyclePort,
): AuthenticatedRecurringTaskCapabilities {
  const userId = requireUserPrincipal(principal);

  const seriesCommands: SeriesCommands = {
    async createSeries(input) {
      const validation = validateOperationId(
        RECURRING_TASK_OPERATION_IDS.createSeries,
        input?.operationId,
      );
      if (validation) return validation;
      const operationId = input.operationId;
      const {
        operationId: _operationId,
        userId: _callerUserId,
        ...request
      } = input as CreateSeriesCommand & { userId?: unknown };

      try {
        const outcome = await lifecycle.createSeries({
          ...request,
          userId,
          idempotencyKey: operationId,
          source: "interactive",
        } as CreateSeriesRequest);
        return mapMutationSuccessOrFailure(
          outcome,
          RECURRING_TASK_OPERATION_IDS.createSeries,
          operationId,
          "created",
        ) as CreateSeriesResult;
      } catch (error) {
        return mapCommandError(
          error,
          RECURRING_TASK_OPERATION_IDS.createSeries,
          operationId,
        );
      }
    },

    async reviseSeries(input) {
      const operationValidation = validateOperationId(
        RECURRING_TASK_OPERATION_IDS.reviseSeries,
        input?.operationId,
      );
      if (operationValidation) return operationValidation;
      const operationId = input.operationId;
      if (typeof input?.seriesId !== "string" || !input.seriesId.trim()) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
          operationId,
          "seriesId",
          "Series ID is required",
        );
      }
      if (
        typeof input?.effectiveDate !== "string"
        || !input.effectiveDate.trim()
      ) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
          operationId,
          "effectiveDate",
          "Effective Scheduled Date is required",
        );
      }
      if (!isValidLocalDate(input.effectiveDate)) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
          operationId,
          "effectiveDate",
          "Effective Scheduled Date must be a valid local date",
        );
      }
      const version = parseSeriesVersion(input.version, input.seriesId);
      if (!version) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
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
      } = input as ReviseSeriesCommand & { userId?: unknown };

      try {
        const outcome = await lifecycle.reviseSeries({
          ...request,
          userId,
          seriesId,
          expectedRevisionToken: version.revisionToken,
          idempotencyKey: operationId,
          source: "interactive",
        } as ReviseSeriesRequest);
        return mapMutationSuccessOrFailure(
          outcome,
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
          operationId,
          "revised",
          seriesId,
        ) as ReviseSeriesResult;
      } catch (error) {
        return mapCommandError(
          error,
          RECURRING_TASK_OPERATION_IDS.reviseSeries,
          operationId,
        );
      }
    },

    pauseSeries: (input) => runStateCommand(
      input,
      RECURRING_TASK_OPERATION_IDS.pauseSeries,
      "paused",
      lifecycle.pauseSeries.bind(lifecycle),
      userId,
    ) as Promise<PauseSeriesResult>,

    resumeSeries: (input) => runStateCommand(
      input,
      RECURRING_TASK_OPERATION_IDS.resumeSeries,
      "resumed",
      lifecycle.resumeSeries.bind(lifecycle),
      userId,
    ) as Promise<ResumeSeriesResult>,

    endSeries: (input) => runStateCommand(
      input,
      RECURRING_TASK_OPERATION_IDS.endSeries,
      "ended",
      lifecycle.endSeries.bind(lifecycle),
      userId,
    ) as Promise<EndSeriesResult>,
  };

  const seriesQueries: SeriesQueries = {
    async listSeries(input = {}) {
      if (
        input.status !== undefined
        && !["active", "paused", "ended"].includes(input.status)
      ) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.listSeries,
          undefined,
          "status",
          "Series status is invalid",
        );
      }
      try {
        const result = await lifecycle.listSeries(userId, input.status);
        return {
          type: "listed",
          operation: RECURRING_TASK_OPERATION_IDS.listSeries,
          series: result.series.map(toSeriesProjection),
        };
      } catch (error) {
        return mapQueryError(error, RECURRING_TASK_OPERATION_IDS.listSeries);
      }
    },

    async getSeries(input) {
      const seriesId = typeof input === "string" ? input : input?.seriesId;
      if (!seriesId?.trim()) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.getSeries,
          undefined,
          "seriesId",
          "Series ID is required",
        );
      }
      try {
        const outcome = await lifecycle.getSeries(userId, seriesId);
        if (isLifecycleSuccess(outcome)) {
          return {
            type: "found",
            operation: RECURRING_TASK_OPERATION_IDS.getSeries,
            series: toSeriesProjection(outcome.series),
          };
        }
        return mapLifecycleFailure(
          outcome as Exclude<
            LifecycleOutcome<RecurringTaskSeries>,
            { series: unknown }
          >,
          RECURRING_TASK_OPERATION_IDS.getSeries,
        );
      } catch (error) {
        return mapQueryError(error, RECURRING_TASK_OPERATION_IDS.getSeries);
      }
    },
  };

  const coverage: CoverageCapability = {
    async ensure(input) {
      const operationValidation = validateOperationId(
        RECURRING_TASK_OPERATION_IDS.ensureCoverage,
        input?.operationId,
      );
      if (operationValidation) return operationValidation;
      const operationId = input.operationId;
      const range = input?.range;
      if (!isValidRange(range)) {
        return validationFailure(
          RECURRING_TASK_OPERATION_IDS.ensureCoverage,
          operationId,
          "range",
          "Coverage range must be inclusive and ordered",
        );
      }

      // Coverage Read owns unexpected-failure observation and normalization;
      // keep known validation exceptions typed and let other causes cross this
      // internal capability boundary unchanged.
      let outcome: UserCoverageOutcome;
      try {
        outcome = await lifecycle.ensureUserCoverage({
          userId,
          range,
          idempotencyKey: operationId,
          source: "interactive",
        } as EnsureUserCoverageRequest);
      } catch (error) {
        if (error instanceof RangeError) {
          return validationFailure(
            RECURRING_TASK_OPERATION_IDS.ensureCoverage,
            operationId,
            undefined,
            STABLE_VALIDATION_REASONS.command,
          );
        }
        throw error;
      }
      if (outcome.status === "complete" || outcome.status === "already-applied") {
        return makeCoverageResult(
          operationId,
          range,
          "complete",
          outcome.series,
          outcome.occurrences,
          outcome.intentionalAbsences,
        );
      }
      if (outcome.status === "partial") {
        return makeCoverageResult(
          operationId,
          range,
          "partial",
          outcome.series,
          outcome.occurrences,
          outcome.intentionalAbsences,
          outcome.failedSeriesIds,
        );
      }
      if (outcome.status === "coverage-unavailable") {
        return makeCoverageResult(
          operationId,
          range,
          "unavailable",
          [],
          [],
          [],
          [],
          outcome.reason,
        );
      }
      return mapLifecycleFailure(
        outcome as unknown as
          | NotFoundOutcome
          | InvalidTransitionOutcome
          | ConflictOutcome
          | CoverageUnavailableOutcome
          | PrewarmSkippedOutcome,
        RECURRING_TASK_OPERATION_IDS.ensureCoverage,
        operationId,
      );
    },
  };

  return { seriesCommands, seriesQueries, coverage };
}

function requireUserPrincipal(
  principal: AuthenticatedRecurringTaskPrincipal | undefined,
): string {
  if (
    !principal
    || principal.type !== "user"
    || typeof principal.userId !== "string"
    || !principal.userId.trim()
  ) {
    throw new TypeError("An authenticated user principal is required");
  }
  return principal.userId;
}

function isValidRange(range: unknown): range is LocalDateRange {
  if (
    !range
    || typeof range !== "object"
    || typeof (range as LocalDateRange).from !== "string"
    || typeof (range as LocalDateRange).to !== "string"
  ) {
    return false;
  }
  const value = range as LocalDateRange;
  return isValidLocalDate(value.from)
    && isValidLocalDate(value.to)
    && compareLocalDates(value.from, value.to) <= 0;
}
