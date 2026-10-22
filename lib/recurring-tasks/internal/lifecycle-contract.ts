/** Private lifecycle requests, state, outcomes, and transaction contracts. */

import type { TaskStatus, TaskSection, RecurrenceRule } from "@/lib/db/types";

import type { RecurringLifecycleObserver } from "./observability";

export type RecurringSeriesStatus = "active" | "paused" | "ended";

export type OccurrenceState =
  | "open"
  | "completed"
  | "skipped"
  | "withdrawn"
  | "extra";

export type LifecycleScope = "this" | "following" | "all";

export interface SeriesDefaults {
  title: string;
  description: string | null;
  priority: 0 | 1 | 2 | 3;
  categoryId: string | null;
  dueTime: string | null;
  sortOrder?: number;
  status?: TaskStatus;
  section?: TaskSection;
  projectId?: string | null;
}

export type OccurrenceOverrideField = keyof SeriesDefaults | "dueDate";

export type OccurrenceOverrides = Partial<
  Record<OccurrenceOverrideField, unknown>
>;

export interface LocalDateRange {
  from: string;
  to: string;
}

export interface LifecycleObservability {
  createdOccurrences: number;
  intentionalAbsences: number;
  withdrawnOccurrences: number;
}

export interface ActiveSeriesSummary {
  id: string;
  userId: string;
  status: "active";
  timeZone: string;
  coverageHorizon: string | null;
}

export interface SeriesRevision {
  id: string;
  seriesId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  state: RecurringSeriesStatus;
  recurrenceRule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  defaults: SeriesDefaults;
  createdAt: string;
}

export interface TaskOccurrence {
  id: string;
  seriesId: string;
  revisionId: string;
  scheduledDate: string;
  dueDate: string | null;
  details: SeriesDefaults;
  state: OccurrenceState;
  overrides: OccurrenceOverrides;
  taskId: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RecurringTaskSeries {
  id: string;
  userId: string;
  status: RecurringSeriesStatus;
  /** IANA timezone used for clock-derived lifecycle dates. */
  timeZone: string;
  recurrenceAnchor: string;
  activationDate: string;
  occurrenceLimit: number | null;
  lastScheduledDate: string | null;
  coverageHorizon: string | null;
  currentRevisionId: string;
  revisionToken: number;
  revisions: SeriesRevision[];
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  createdAt: string;
  updatedAt: string;
}

interface IdempotencyRecord {
  fingerprint: string;
  result: LifecycleSuccess<RecurringTaskSeries>;
}

export interface RecurringTaskLifecycleState {
  series: Map<string, RecurringTaskSeries>;
  idempotency: Map<string, IdempotencyRecord>;
}

export interface RecurringTaskLifecyclePersistence {
  /**
   * A read is a non-mutating preflight seam. Implementations must provide an
   * isolated snapshot and must not persist callback mutations.
   */
  read?<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T>;

  /**
   * A transaction is the lifecycle's atomicity seam. Implementations must
   * serialize calls for the same key, commit state only after the callback
   * resolves, and roll back all callback mutations when it rejects.
   */
  transaction<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T>;
}

export interface LifecycleClockOptions {
  clock?: () => Date;
  idFactory?: () => string;
  observer?: RecurringLifecycleObserver;
}

export type LifecycleSource = "interactive" | "prewarm";

export interface LifecycleContext {
  expectedTaskVersion?: string;
  userId: string;
  timeZone?: string;
  timezone?: string;
  effectiveDate?: string;
  expectedRevisionToken?: number;
  idempotencyKey?: string;
  operationKey?: string;
  source?: LifecycleSource;
}

export interface CreateSeriesRequest extends LifecycleContext {
  recurrenceRule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  defaults?: SeriesDefaults;
  title?: string;
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
  endType?: "never" | "after_count" | "on_date";
  coverage?: LocalDateRange;
  coverageThrough?: string;
}

export interface EnsureCoverageRequest extends LifecycleContext {
  seriesId: string;
  range?: LocalDateRange;
  fromDate?: string;
  throughDate?: string;
}

export interface EnsureUserCoverageRequest extends LifecycleContext {
  range: LocalDateRange;
}

export interface ReviseSeriesRequest extends LifecycleContext {
  seriesId: string;
  /** Visible Task identity for scoped command routing; revalidated in-transaction. */
  taskId?: string;
  occurrenceId?: string;
  effectiveDate?: string;
  recurrenceRule?: RecurrenceRule;
  defaults?: Partial<SeriesDefaults>;
  scope?: Exclude<LifecycleScope, "this">;
  occurrenceLimit?: number | null;
  lastScheduledDate?: string | null;
  endType?: "never" | "after_count" | "on_date";
  coverage?: LocalDateRange;
}

export interface OccurrenceUpdateRequest extends LifecycleContext {
  seriesId: string;
  occurrenceId: string;
  /** Visible Task identity and requested scope are authoritative only after revalidation. */
  taskId?: string;
  scope?: LifecycleScope;
  scheduledDate?: string;
  expectedRevisionId?: string;
  updates: OccurrenceOverrides;
  completed?: boolean;
}

export interface OccurrenceCommandRequest extends LifecycleContext {
  seriesId: string;
  occurrenceId: string;
  /** Visible Task identity used by shared Task Commands routing. */
  taskId?: string;
  /** Requested scope is revalidated in the lifecycle transaction. */
  scope?: LifecycleScope;
  /** Scheduled Date from the visible Task projection, checked against ledger state. */
  scheduledDate?: string;
  /** Optional immutable ledger revision fact for callers that have it. */
  expectedRevisionId?: string;
}

export interface SeriesCommandRequest extends LifecycleContext {
  seriesId: string;
  /** Visible Task identity and deletion scope for scoped Series commands. */
  taskId?: string;
  occurrenceId?: string;
  scope?: LifecycleScope;
  scheduledDate?: string;
  expectedRevisionId?: string;
  coverage?: LocalDateRange;
}

export interface PrewarmCoverageRequest extends LifecycleContext {
  seriesId: string;
  range: LocalDateRange;
}

export interface LifecycleSuccess<T> {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  value: T;
  series: RecurringTaskSeries;
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  observability?: LifecycleObservability;
  [key: string]: unknown;
}

export interface NotFoundOutcome {
  status: "not-found";
  type: "not-found";
}

export interface InvalidTransitionOutcome {
  status: "invalid-transition";
  type: "invalid-transition";
  reason: string;
}

export interface ConflictOutcome {
  status: "conflict";
  type: "conflict";
  reason?: string;
  expectedRevisionToken?: number;
  actualRevisionToken?: number;
}

export interface CoverageUnavailableOutcome {
  status: "coverage-unavailable";
  type: "coverage-unavailable";
  requestedRange: LocalDateRange;
  coverageHorizon: string | null;
  reason: string;
}

export interface PrewarmSkippedOutcome {
  status: "skipped";
  type: "skipped";
  reason: "already-covered" | "inactive-series";
}

export type LifecycleOutcome<T = unknown> =
  | (LifecycleSuccess<T> & { value: T })
  | NotFoundOutcome
  | InvalidTransitionOutcome
  | ConflictOutcome
  | CoverageUnavailableOutcome
  | PrewarmSkippedOutcome;

export type EnsureCoverageOutcome = LifecycleOutcome<RecurringTaskSeries>;

export interface UserCoverageSuccess {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  series: RecurringTaskSeries[];
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  observability?: LifecycleObservability;
}

export interface UserCoveragePartial {
  status: "partial";
  type: "partial";
  requestedRange: LocalDateRange;
  failedSeriesIds: string[];
  series: RecurringTaskSeries[];
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  observability?: LifecycleObservability;
}

export type UserCoverageOutcome =
  | UserCoverageSuccess
  | UserCoveragePartial
  | NotFoundOutcome
  | CoverageUnavailableOutcome
  | PrewarmSkippedOutcome;

export interface RecurringTaskLifecyclePort {
  createSeries(
    request: CreateSeriesRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  ensureCoverage(
    request: EnsureCoverageRequest,
  ): Promise<EnsureCoverageOutcome>;
  ensureUserCoverage(
    request: EnsureUserCoverageRequest,
  ): Promise<UserCoverageOutcome>;
  reviseSeries(
    request: ReviseSeriesRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  editOccurrence(
    request: OccurrenceUpdateRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  skipOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  completeOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  reopenOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  pauseSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  resumeSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  endSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  deleteSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
  listSeries(
    userId: string,
    status?: RecurringSeriesStatus,
  ): Promise<{ series: RecurringTaskSeries[] }>;
  getSeries(
    userId: string,
    seriesId: string,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
}

export interface LifecycleMutationResult {
  series: RecurringTaskSeries;
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  observability?: LifecycleObservability;
  status?: "complete" | "already-applied";
}

export type LifecycleFailure =
  | NotFoundOutcome
  | InvalidTransitionOutcome
  | ConflictOutcome
  | CoverageUnavailableOutcome
  | PrewarmSkippedOutcome;
