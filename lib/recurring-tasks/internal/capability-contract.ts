/** Authenticated recurring-task capability contracts and operation identities. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthenticatedPrincipal } from "@/lib/auth/request-context";

import type { RecurringLifecycleSignal } from "./observability";

import type {
  SeriesDefaults,
  LocalDateRange,
  RecurringSeriesStatus,
  SeriesRevision,
  TaskOccurrence,
} from "./lifecycle";

import type { RecurrenceRule } from "@/lib/db/types";

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
export interface SeriesProjection {
  id: string;
  status: RecurringSeriesStatus;
  timeZone: string;
  recurrenceAnchor: string;
  activationDate: string;
  occurrenceLimit: number | null;
  lastScheduledDate: string | null;
  coverageHorizon: string | null;
  currentRevisionId: string;
  revisions: SeriesRevision[];
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  createdAt: string;
  updatedAt: string;
  version: SeriesVersion;
}

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
  occurrences: TaskOccurrence[];
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
export interface RecurringTaskTelemetryPort {
  emit(signal: RecurringLifecycleSignal): void;
}

export type StateCommandResult =
  | PauseSeriesSuccess
  | ResumeSeriesSuccess
  | EndSeriesSuccess
  | RecurringTaskFailure;
