import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthenticatedPrincipal } from "@/lib/auth/request-context";

import { createActivatedRecurringTaskLifecycle } from "./activation";
import {
  emitRecurringLifecycleSignal,
  type RecurringLifecycleObserver,
  type RecurringLifecycleSignal,
} from "./observability";
import type {
  ConflictOutcome,
  CreateSeriesRequest,
  EnsureUserCoverageRequest,
  InvalidTransitionOutcome,
  LifecycleOutcome,
  LocalDateRange,
  NotFoundOutcome,
  PrewarmSkippedOutcome,
  CoverageUnavailableOutcome,
  RecurringSeriesStatus,
  RecurringTaskLifecyclePort,
  RecurringTaskSeries,
  ReviseSeriesRequest,
  SeriesCommandRequest,
  SeriesDefaults,
} from "./lifecycle";
import type { RecurrenceRule } from "@/lib/db/types";
import { compareLocalDates, isValidLocalDate } from "./recurrence";

/** A user principal is the only authority accepted by the interactive boundary. */
export type AuthenticatedRecurringTaskPrincipal = Extract<
  AuthenticatedPrincipal,
  { type: "user" }
>;

/** Caller-owned retry identity. It must remain stable across a retry. */
export type RecurringTaskOperationId = string;

/**
 * An opaque technical concurrency token for a Series projection. It is not a
 * domain Series Revision; its encoding is an adapter detail that may change
 * without changing the capability contract.
 */
declare const seriesVersionBrand: unique symbol;
export type SeriesVersion = string & {
  readonly [seriesVersionBrand]: "RecurringTaskSeriesVersion";
};

export const RECURRING_TASK_OPERATION_IDS = Object.freeze({
  createSeries: "recurring-task.series.create",
  reviseSeries: "recurring-task.series.revise",
  pauseSeries: "recurring-task.series.pause",
  resumeSeries: "recurring-task.series.resume",
  endSeries: "recurring-task.series.end",
  listSeries: "recurring-task.series.list",
  getSeries: "recurring-task.series.get",
  ensureCoverage: "recurring-task.coverage.ensure",
} as const);

const STABLE_VALIDATION_REASONS = Object.freeze({
  command: "invalid-command",
  query: "invalid-query",
} as const);

export type RecurringTaskOperation =
  (typeof RECURRING_TASK_OPERATION_IDS)[keyof typeof RECURRING_TASK_OPERATION_IDS];

export interface CreateSeriesCommand {
  operationId: RecurringTaskOperationId;
  recurrenceRule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  timeZone?: string;
  defaults?: SeriesDefaults;
  title?: string;
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
  endType?: "never" | "after_count" | "on_date";
  coverage?: LocalDateRange;
}

export interface ReviseSeriesCommand {
  operationId: RecurringTaskOperationId;
  seriesId: string;
  version: SeriesVersion;
  /** The first Scheduled Date on which the new Series Revision applies. */
  effectiveDate: string;
  recurrenceRule?: RecurrenceRule;
  defaults?: Partial<SeriesDefaults>;
  scope?: "following" | "all";
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
  endType?: "never" | "after_count" | "on_date";
  coverage?: LocalDateRange;
}

export interface SeriesStateCommand {
  operationId: RecurringTaskOperationId;
  seriesId: string;
  version: SeriesVersion;
  effectiveDate?: string;
  coverage?: LocalDateRange;
}

export interface SeriesListQuery {
  status?: RecurringSeriesStatus;
}

export interface SeriesDetailQuery {
  seriesId: string;
}

export interface CoverageEnsureCommand {
  operationId: RecurringTaskOperationId;
  range: LocalDateRange;
}

/** Public Series projection. Ownership and the storage revision counter stay private. */
export type SeriesProjection = Omit<RecurringTaskSeries, "userId" | "revisionToken"> & {
  version: SeriesVersion;
};

type SeriesMutationSuccess<
  ResultType extends string,
  Operation extends RecurringTaskOperation,
> = {
  type: ResultType;
  status: "complete" | "already-applied";
  operation: Operation;
  operationId: RecurringTaskOperationId;
  series: SeriesProjection;
};

export type CreateSeriesSuccess = SeriesMutationSuccess<
  "created",
  typeof RECURRING_TASK_OPERATION_IDS.createSeries
>;
export type ReviseSeriesSuccess = SeriesMutationSuccess<
  "revised",
  typeof RECURRING_TASK_OPERATION_IDS.reviseSeries
>;
export type PauseSeriesSuccess = SeriesMutationSuccess<
  "paused",
  typeof RECURRING_TASK_OPERATION_IDS.pauseSeries
>;
export type ResumeSeriesSuccess = SeriesMutationSuccess<
  "resumed",
  typeof RECURRING_TASK_OPERATION_IDS.resumeSeries
>;
export type EndSeriesSuccess = SeriesMutationSuccess<
  "ended",
  typeof RECURRING_TASK_OPERATION_IDS.endSeries
>;

export type SeriesCommandSuccess =
  | CreateSeriesSuccess
  | ReviseSeriesSuccess
  | PauseSeriesSuccess
  | ResumeSeriesSuccess
  | EndSeriesSuccess;

export type RecurringTaskFailureType =
  | "validation"
  | "not-found"
  | "conflict"
  | "invalid-transition"
  | "coverage-unavailable";

interface FailureBase<Type extends RecurringTaskFailureType> {
  type: Type;
  status: Type;
  operation: RecurringTaskOperation;
  operationId?: RecurringTaskOperationId;
}

export interface ValidationFailure extends FailureBase<"validation"> {
  field?: string;
  reason: string;
}

export type NotFoundFailure = FailureBase<"not-found">;

export interface ConflictFailure extends FailureBase<"conflict"> {
  reason?: string;
  expectedVersion?: SeriesVersion;
  actualVersion?: SeriesVersion;
}

export interface InvalidTransitionFailure
  extends FailureBase<"invalid-transition"> {
  reason: string;
}

export interface CoverageUnavailableFailure
  extends FailureBase<"coverage-unavailable"> {
  requestedRange: LocalDateRange;
  coverageHorizon?: string | null;
  reason: string;
}

export type RecurringTaskFailure =
  | ValidationFailure
  | NotFoundFailure
  | ConflictFailure
  | InvalidTransitionFailure
  | CoverageUnavailableFailure;

export type CreateSeriesResult = CreateSeriesSuccess | RecurringTaskFailure;
export type ReviseSeriesResult = ReviseSeriesSuccess | RecurringTaskFailure;
export type PauseSeriesResult = PauseSeriesSuccess | RecurringTaskFailure;
export type ResumeSeriesResult = ResumeSeriesSuccess | RecurringTaskFailure;
export type EndSeriesResult = EndSeriesSuccess | RecurringTaskFailure;

export interface SeriesListSuccess {
  type: "listed";
  operation: typeof RECURRING_TASK_OPERATION_IDS.listSeries;
  series: SeriesProjection[];
}

export interface SeriesDetailSuccess {
  type: "found";
  operation: typeof RECURRING_TASK_OPERATION_IDS.getSeries;
  series: SeriesProjection;
}

export type SeriesListResult = SeriesListSuccess | RecurringTaskFailure;
export type SeriesDetailResult = SeriesDetailSuccess | RecurringTaskFailure;

export interface CoverageComplete {
  status: "complete";
  type: "complete";
  requestedRange: LocalDateRange;
  failedSeriesIds: [];
}

export interface CoveragePartial {
  status: "partial";
  type: "partial";
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
}

export interface CoverageUnavailable {
  status: "unavailable";
  type: "unavailable";
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
  reason: string;
}

export type CoverageCompleteness =
  | CoverageComplete
  | CoveragePartial
  | CoverageUnavailable;

export interface CoverageResult {
  type: "coverage";
  status: CoverageCompleteness["status"];
  operation: typeof RECURRING_TASK_OPERATION_IDS.ensureCoverage;
  operationId: RecurringTaskOperationId;
  requestedRange: LocalDateRange;
  completeness: CoverageCompleteness;
  series: SeriesProjection[];
  occurrences: RecurringTaskSeries["occurrences"];
  intentionalAbsences: string[];
}

export type CoverageCapabilityResult = CoverageResult | RecurringTaskFailure;

export interface SeriesCommands {
  createSeries(input: CreateSeriesCommand): Promise<CreateSeriesResult>;
  reviseSeries(input: ReviseSeriesCommand): Promise<ReviseSeriesResult>;
  pauseSeries(input: SeriesStateCommand): Promise<PauseSeriesResult>;
  resumeSeries(input: SeriesStateCommand): Promise<ResumeSeriesResult>;
  endSeries(input: SeriesStateCommand): Promise<EndSeriesResult>;
}

export interface SeriesQueries {
  listSeries(input?: SeriesListQuery): Promise<SeriesListResult>;
  getSeries(input: SeriesDetailQuery | string): Promise<SeriesDetailResult>;
}

export interface CoverageCapability {
  ensure(input: CoverageEnsureCommand): Promise<CoverageCapabilityResult>;
}

export interface AuthenticatedRecurringTaskCapabilities {
  readonly seriesCommands: SeriesCommands;
  readonly seriesQueries: SeriesQueries;
  readonly coverage: CoverageCapability;
}

export interface AuthenticatedRecurringTaskCapabilityOptions {
  supabase: SupabaseClient;
  principal: AuthenticatedRecurringTaskPrincipal;
}

/** Private composition port; telemetry is never part of a public capability result. */
interface RecurringTaskTelemetryPort {
  emit(signal: RecurringLifecycleSignal): void;
}

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

      try {
        const outcome = await lifecycle.ensureUserCoverage({
          userId,
          range,
          idempotencyKey: operationId,
          source: "interactive",
        } as EnsureUserCoverageRequest);
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
      } catch {
        return makeCoverageResult(
          operationId,
          range,
          "unavailable",
          [],
          [],
          [],
          [],
          "Coverage could not be ensured",
        );
      }
    },
  };

  return { seriesCommands, seriesQueries, coverage };
}

type StateCommandResult =
  | PauseSeriesSuccess
  | ResumeSeriesSuccess
  | EndSeriesSuccess
  | RecurringTaskFailure;

async function runStateCommand(
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

function mapMutationSuccessOrFailure(
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

function mapLifecycleFailure(
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

function mapCommandError(
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

function mapQueryError(
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

function validationFailure(
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

function validateOperationId(
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

function makeCoverageResult(
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

function isLifecycleSuccess(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): outcome is Extract<LifecycleOutcome<RecurringTaskSeries>, { series: RecurringTaskSeries }> {
  return "series" in outcome && "value" in outcome;
}

function toSeriesProjection(series: RecurringTaskSeries): SeriesProjection {
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

function isOpaqueSeriesVersion(value: string): value is SeriesVersion {
  return value.startsWith("rt-series-v1.") && parseEncodedVersion(value) !== undefined;
}

export interface DecodedSeriesVersion {
  seriesId: string;
  revisionToken: number;
}

export function encodeSeriesVersion(
  seriesId: string | undefined,
  revisionToken: number,
): SeriesVersion {
  const payload = JSON.stringify({
    seriesId: seriesId ?? "",
    revisionToken,
  });
  const encoded = encodeBase64Url(payload);
  return `rt-series-v1.${encoded}` as SeriesVersion;
}

function parseSeriesVersion(
  value: unknown,
  seriesId: unknown,
): DecodedSeriesVersion | undefined {
  return decodeSeriesVersion(value, seriesId);
}

/** Decode an opaque Series version only at the command/lifecycle boundary. */
export function decodeSeriesVersion(
  value: unknown,
  seriesId?: unknown,
): DecodedSeriesVersion | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = parseEncodedVersion(value);
  if (!decoded) return undefined;
  return typeof seriesId !== "string" || decoded.seriesId === seriesId
    ? decoded
    : undefined;
}

function parseEncodedVersion(value: unknown): DecodedSeriesVersion | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("rt-series-v1.")) return undefined;
  try {
    const json = decodeBase64Url(value.slice("rt-series-v1.".length));
    const parsed = JSON.parse(json) as Partial<DecodedSeriesVersion>;
    if (
      typeof parsed.seriesId !== "string"
      || typeof parsed.revisionToken !== "number"
      || !Number.isInteger(parsed.revisionToken)
      || parsed.revisionToken < 1
    ) {
      return undefined;
    }
    return {
      seriesId: parsed.seriesId,
      revisionToken: parsed.revisionToken,
    };
  } catch {
    return undefined;
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}
