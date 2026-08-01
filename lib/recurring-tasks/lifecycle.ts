import type {
  RecurrenceRule,
  TaskSection,
  TaskStatus,
} from "@/lib/db/types";
import {
  addLocalDays,
  calculateScheduledDates,
  compareLocalDates,
  getLocalDateInTimeZone,
} from "./recurrence";

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

export class InMemoryRecurringTaskLifecyclePersistence
  implements RecurringTaskLifecyclePersistence
{
  private state: RecurringTaskLifecycleState = {
    series: new Map(),
    idempotency: new Map(),
  };

  private readonly locks = new Map<string, Promise<void>>();

  async read<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T> {
    await (this.locks.get(serializationKey) ?? Promise.resolve());
    return operation(cloneState(this.state));
  }

  async transaction<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(serializationKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(serializationKey, queued);

    await previous;
    try {
      const base = cloneState(this.state);
      const draft = cloneState(base);
      const result = await operation(draft);
      this.commit(serializationKey, base, draft);
      return result;
    } finally {
      release();
      if (this.locks.get(serializationKey) === queued) {
        this.locks.delete(serializationKey);
      }
    }
  }

  snapshot(): RecurringTaskLifecycleState {
    return cloneState(this.state);
  }

  private commit(
    serializationKey: string,
    base: RecurringTaskLifecycleState,
    draft: RecurringTaskLifecycleState,
  ): void {
    const [scope, identifier] = serializationKey.split(":", 2);
    if (scope === "series" && identifier) {
      const series = draft.series.get(identifier);
      if (series && changed(base.series.get(identifier), series)) {
        this.state.series.set(identifier, series);
      }
      this.mergeIdempotencyForSeries(identifier, base, draft);
      return;
    }
    if (scope === "user" && identifier) {
      for (const [seriesId, series] of draft.series) {
        if (
          series.userId === identifier
          && changed(base.series.get(seriesId), series)
        ) {
          this.state.series.set(seriesId, series);
        }
      }
      for (const [key, record] of draft.idempotency) {
        if (
          record.result.series.userId === identifier
          && changed(base.idempotency.get(key), record)
        ) {
          this.state.idempotency.set(key, record);
        }
      }
      return;
    }
    this.state = draft;
  }

  private mergeIdempotencyForSeries(
    seriesId: string,
    base: RecurringTaskLifecycleState,
    draft: RecurringTaskLifecycleState,
  ): void {
    for (const [key, record] of draft.idempotency) {
      if (
        record.result.series.id === seriesId
        && changed(base.idempotency.get(key), record)
      ) {
        this.state.idempotency.set(key, record);
      }
    }
  }
}

export interface LifecycleClockOptions {
  clock?: () => Date;
  idFactory?: () => string;
}

export interface LifecycleContext {
  userId: string;
  timeZone?: string;
  timezone?: string;
  effectiveDate?: string;
  expectedRevisionToken?: number;
  idempotencyKey?: string;
  operationKey?: string;
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
  updates: OccurrenceOverrides;
  completed?: boolean;
}

export interface OccurrenceCommandRequest extends LifecycleContext {
  seriesId: string;
  occurrenceId: string;
}

export interface SeriesCommandRequest extends LifecycleContext {
  seriesId: string;
  coverage?: LocalDateRange;
}

export interface LifecycleSuccess<T> {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  value: T;
  series: RecurringTaskSeries;
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
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

export type LifecycleOutcome<T = unknown> =
  | (LifecycleSuccess<T> & { value: T })
  | NotFoundOutcome
  | InvalidTransitionOutcome
  | ConflictOutcome
  | CoverageUnavailableOutcome;

export type EnsureCoverageOutcome = LifecycleOutcome<RecurringTaskSeries>;

export interface UserCoverageSuccess {
  status: "complete" | "already-applied";
  type: "complete" | "already-applied";
  series: RecurringTaskSeries[];
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
}

export type UserCoverageOutcome =
  | UserCoverageSuccess
  | NotFoundOutcome
  | CoverageUnavailableOutcome;

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
  getSeries(
    userId: string,
    seriesId: string,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>>;
}

interface LifecycleMutationResult {
  series: RecurringTaskSeries;
  occurrences: TaskOccurrence[];
  intentionalAbsences: string[];
  status?: "complete" | "already-applied";
}

type LifecycleFailure =
  | NotFoundOutcome
  | InvalidTransitionOutcome
  | ConflictOutcome
  | CoverageUnavailableOutcome;

export class RecurringTaskLifecycle implements RecurringTaskLifecyclePort {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(
    private readonly persistence: RecurringTaskLifecyclePersistence,
    options: LifecycleClockOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async createSeries(
    request: CreateSeriesRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    const idempotencyKey = request.idempotencyKey ?? request.operationKey;
    const fingerprint = fingerprintOf({
      ...request,
      idempotencyKey: undefined,
      operationKey: undefined,
    });
    const serializationKey = `user:${request.userId}`;

    return this.persistence.transaction(serializationKey, async (state) => {
      const replay = replayIdempotent(
        state,
        request.userId,
        idempotencyKey,
        fingerprint,
      );
      if (replay) return replay;

      validateCreateRequest(request);
      const now = this.clock().toISOString();
      const seriesId = this.idFactory();
      const revisionId = this.idFactory();
      const defaults = request.defaults ?? {
        title: request.title ?? "",
        description: null,
        priority: 0,
        categoryId: null,
        dueTime: null,
      };
      const revision: SeriesRevision = {
        id: revisionId,
        seriesId,
        effectiveFrom: request.activationDate,
        effectiveTo: null,
        state: "active",
        recurrenceRule: request.recurrenceRule,
        recurrenceAnchor: request.recurrenceAnchor,
        activationDate: request.activationDate,
        defaults: normalizeDefaults(defaults),
        createdAt: now,
      };
      const series: RecurringTaskSeries = {
        id: seriesId,
        userId: request.userId,
        status: "active",
        timeZone: validateTimeZone(
          request.timeZone ?? request.timezone ?? "UTC",
        ),
        recurrenceAnchor: request.recurrenceAnchor,
        activationDate: request.activationDate,
        occurrenceLimit: request.occurrenceLimit ?? null,
        lastScheduledDate: request.lastScheduledDate ?? null,
        coverageHorizon: null,
        currentRevisionId: revisionId,
        revisionToken: 1,
        revisions: [revision],
        occurrences: [],
        intentionalAbsences: [],
        createdAt: now,
        updatedAt: now,
      };
      state.series.set(seriesId, series);

      const coverage = request.coverage
        ?? (request.coverageThrough
          ? { from: request.activationDate, to: request.coverageThrough }
          : undefined);
      const result = coverage
        ? ensureCoverageState(
          series,
          coverage,
          this.idFactory,
          now,
        )
        : summarize(series);
      const outcome = success(result, "complete");
      rememberIdempotency(
        state,
        request.userId,
        idempotencyKey,
        fingerprint,
        outcome,
      );
      return outcome;
    });
  }

  async ensureCoverage(
    request: EnsureCoverageRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    const range: LocalDateRange | undefined = request.range
      ?? (request.fromDate && request.throughDate
        ? { from: request.fromDate, to: request.throughDate }
        : undefined);
    if (!range) {
      throw new RangeError("Coverage range is required");
    }
    return this.mutateExisting(request, "ensure-coverage", (series) => {
      const effectiveRange = coverageRangeForExtension(series, range);
      return ensureCoverageState(
        series,
        effectiveRange,
        this.idFactory,
        this.clock().toISOString(),
      );
    });
  }

  async ensureUserCoverage(
    request: EnsureUserCoverageRequest,
  ): Promise<UserCoverageOutcome> {
    validateRange(request.range);
    return this.persistence.transaction(`user:${request.userId}`, async (state) => {
      const series = [...state.series.values()]
        .filter((candidate) => candidate.userId === request.userId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const occurrences: TaskOccurrence[] = [];
      const intentionalAbsences = new Set<string>();
      for (const candidate of series) {
        const range = coverageRangeForExtension(candidate, request.range);
        const result = ensureCoverageState(
          candidate,
          range,
          this.idFactory,
          this.clock().toISOString(),
        );
        occurrences.push(...result.occurrences);
        result.intentionalAbsences.forEach((date) => intentionalAbsences.add(date));
      }
      return {
        status: "complete",
        type: "complete",
        series,
        occurrences,
        intentionalAbsences: [...intentionalAbsences].sort(),
      };
    });
  }

  async reviseSeries(
    request: ReviseSeriesRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "revise-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      if (series.status === "ended") {
        return invalidTransition("Ended Series cannot be revised");
      }
      const effectiveDate = request.effectiveDate
        ?? this.resolveEffectiveDate(request, series.timeZone);
      if (compareLocalDates(effectiveDate, series.activationDate) < 0) {
        return invalidTransition("A Series Revision cannot begin before activation");
      }
      const invalidRequest = validateRevisionRequest(series, request);
      if (invalidRequest) return invalidRequest;

      const current = currentRevision(series);
      if (compareLocalDates(effectiveDate, current.effectiveFrom) < 0) {
        return invalidTransition(
          "A Series Revision cannot begin before the current revision",
        );
      }
      const revisionDefaults = normalizeDefaults({
        ...current.defaults,
        ...request.defaults,
      });
      const revisionRule = request.recurrenceRule ?? current.recurrenceRule;
      let revision: SeriesRevision;
      if (compareLocalDates(effectiveDate, current.effectiveFrom) === 0) {
        current.state = series.status;
        current.recurrenceRule = revisionRule;
        current.activationDate = effectiveDate;
        current.defaults = revisionDefaults;
        revision = current;
      } else {
        closeRevision(current, effectiveDate);
        revision = {
          id: this.idFactory(),
          seriesId: series.id,
          effectiveFrom: effectiveDate,
          effectiveTo: null,
          state: series.status,
          recurrenceRule: revisionRule,
          recurrenceAnchor: current.recurrenceAnchor,
          activationDate: effectiveDate,
          defaults: revisionDefaults,
          createdAt: this.clock().toISOString(),
        };
        series.revisions.push(revision);
      }
      series.currentRevisionId = revision.id;
      series.revisionToken += 1;
      // Revising defaults/rules does not implicitly resume a paused series.
      if (request.occurrenceLimit !== undefined) {
        series.occurrenceLimit = request.occurrenceLimit;
      }
      if (request.lastScheduledDate !== undefined) {
        series.lastScheduledDate = request.lastScheduledDate;
      }
      series.updatedAt = this.clock().toISOString();

      reconcileEligibleOccurrences(series, effectiveDate);
      if (request.scope === "all") {
        for (const occurrence of series.occurrences) {
          if (occurrence.state !== "open" && occurrence.state !== "extra") {
            continue;
          }
          occurrence.revisionId = revision.id;
          occurrence.details = mergeDetails(
            revision.defaults,
            occurrence.overrides,
          );
        }
      }
      const coverage = request.coverage
        ?? coverageFrom(series.coverageHorizon, effectiveDate);
      return coverage
        ? ensureCoverageState(
          series,
          coverage,
          this.idFactory,
          this.clock().toISOString(),
        )
        : summarize(series);
    });
  }

  async editOccurrence(
    request: OccurrenceUpdateRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "edit-occurrence", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const occurrence = ownedOccurrence(series, request.occurrenceId);
      if (!occurrence) return notFound();
      if (occurrence.state === "completed") {
        if (request.completed === false && Object.keys(request.updates).length === 0) {
          occurrence.state = isDateProducedBySeries(series, occurrence.scheduledDate)
            ? "open"
            : "extra";
          occurrence.completedAt = null;
          series.updatedAt = this.clock().toISOString();
          return summarize(series);
        }
        return invalidTransition("Completed Occurrences retain frozen details");
      }
      if (occurrence.state === "skipped" || occurrence.state === "withdrawn") {
        return invalidTransition("Only Open or Extra Occurrences can be edited");
      }

      for (const key of Object.keys(request.updates) as OccurrenceOverrideField[]) {
        occurrence.overrides[key] = request.updates[key];
        if (key === "dueDate") {
          occurrence.dueDate = request.updates[key] as string | null;
        } else {
          (occurrence.details as unknown as Record<string, unknown>)[key] =
            request.updates[key];
        }
      }
      occurrence.state = occurrence.state === "extra" ? "extra" : "open";
      if (request.completed === true) {
        occurrence.state = "completed";
        occurrence.completedAt = this.clock().toISOString();
      }
      series.updatedAt = this.clock().toISOString();
      return summarize(series);
    });
  }

  async skipOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "skip-occurrence", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const occurrence = ownedOccurrence(series, request.occurrenceId);
      if (!occurrence) return notFound();
      if (occurrence.state === "skipped") {
        return { ...summarize(series), status: "already-applied" };
      }
      if (occurrence.state !== "open" && occurrence.state !== "extra") {
        return invalidTransition("Only Open or Extra Occurrences can be skipped");
      }
      occurrence.state = "skipped";
      series.intentionalAbsences = addUnique(
        series.intentionalAbsences,
        occurrence.scheduledDate,
      );
      series.updatedAt = this.clock().toISOString();
      return summarize(series);
    });
  }

  async completeOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "complete-occurrence", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const occurrence = ownedOccurrence(series, request.occurrenceId);
      if (!occurrence) return notFound();
      if (occurrence.state === "completed") {
        return { ...summarize(series), status: "already-applied" };
      }
      if (occurrence.state !== "open" && occurrence.state !== "extra") {
        return invalidTransition("Only Open or Extra Occurrences can be completed");
      }
      occurrence.state = "completed";
      occurrence.completedAt = this.clock().toISOString();
      series.updatedAt = this.clock().toISOString();
      return summarize(series);
    });
  }

  async reopenOccurrence(
    request: OccurrenceCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "reopen-occurrence", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const occurrence = ownedOccurrence(series, request.occurrenceId);
      if (!occurrence) return notFound();
      if (occurrence.state === "open" || occurrence.state === "extra") {
        return { ...summarize(series), status: "already-applied" };
      }
      if (occurrence.state !== "completed") {
        return invalidTransition("Only completed Occurrences can be reopened");
      }
      occurrence.state = isDateProducedBySeries(series, occurrence.scheduledDate)
        ? "open"
        : "extra";
      occurrence.completedAt = null;
      series.updatedAt = this.clock().toISOString();
      return summarize(series);
    });
  }

  async pauseSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "pause-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      if (series.status !== "active") {
        return invalidTransition(
          series.status === "ended"
            ? "Ended Series cannot be paused"
            : "Paused Series is already paused",
        );
      }
      const effectiveDate = request.effectiveDate
        ?? this.resolveEffectiveDate(request, series.timeZone);
      if (compareLocalDates(effectiveDate, series.activationDate) < 0) {
        return invalidTransition("Lifecycle date cannot precede activation");
      }
      const current = currentRevision(series);
      if (compareLocalDates(effectiveDate, current.effectiveFrom) < 0) {
        return invalidTransition(
          "A lifecycle transition cannot begin before the current revision",
        );
      }
      let pausedRevision: SeriesRevision;
      if (compareLocalDates(effectiveDate, current.effectiveFrom) === 0) {
        current.state = "paused";
        current.activationDate = effectiveDate;
        pausedRevision = current;
      } else {
        closeRevision(current, effectiveDate);
        pausedRevision = successorRevision(
          series,
          current,
          effectiveDate,
          "paused",
          this.clock().toISOString(),
          this.idFactory,
        );
        series.revisions.push(pausedRevision);
      }
      series.currentRevisionId = pausedRevision.id;
      series.status = "paused";
      series.revisionToken += 1;
      series.updatedAt = this.clock().toISOString();
      reconcileEligibleOccurrences(series, effectiveDate);
      const coverage = request.coverage
        ?? coverageFrom(series.coverageHorizon, effectiveDate);
      return coverage
        ? ensureCoverageState(
          series,
          coverage,
          this.idFactory,
          this.clock().toISOString(),
        )
        : summarize(series);
    });
  }

  async resumeSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "resume-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      if (series.status === "ended") {
        return invalidTransition("Ended Series cannot be resumed");
      }
      if (series.status !== "paused") {
        return invalidTransition("Active Series is not paused");
      }
      const effectiveDate = request.effectiveDate
        ?? this.resolveEffectiveDate(request, series.timeZone);
      if (compareLocalDates(effectiveDate, series.activationDate) < 0) {
        return invalidTransition("Lifecycle date cannot precede activation");
      }
      const current = currentRevision(series);
      if (compareLocalDates(effectiveDate, current.effectiveFrom) < 0) {
        return invalidTransition(
          "A lifecycle transition cannot begin before the current revision",
        );
      }
      let resumedRevision: SeriesRevision;
      if (compareLocalDates(effectiveDate, current.effectiveFrom) === 0) {
        current.state = "active";
        current.activationDate = effectiveDate;
        resumedRevision = current;
      } else {
        closeRevision(current, effectiveDate);
        resumedRevision = successorRevision(
          series,
          current,
          effectiveDate,
          "active",
          this.clock().toISOString(),
          this.idFactory,
        );
        series.revisions.push(resumedRevision);
      }
      series.currentRevisionId = resumedRevision.id;
      series.status = "active";
      series.revisionToken += 1;
      series.updatedAt = this.clock().toISOString();
      clearPauseAbsencesFrom(series, effectiveDate);
      return request.coverage
        ? ensureCoverageState(
          series,
          request.coverage,
          this.idFactory,
          this.clock().toISOString(),
        )
        : summarize(series);
    });
  }

  async endSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "end-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      if (series.status === "ended") return summarize(series);
      const effectiveDate = request.effectiveDate
        ?? this.resolveEffectiveDate(request, series.timeZone);
      if (compareLocalDates(effectiveDate, series.activationDate) < 0) {
        return invalidTransition("Lifecycle date cannot precede activation");
      }
      const current = currentRevision(series);
      if (compareLocalDates(effectiveDate, current.effectiveFrom) < 0) {
        return invalidTransition(
          "A lifecycle transition cannot begin before the current revision",
        );
      }
      let endedRevision: SeriesRevision;
      if (compareLocalDates(effectiveDate, current.effectiveFrom) === 0) {
        current.state = "ended";
        current.activationDate = effectiveDate;
        endedRevision = current;
      } else {
        closeRevision(current, effectiveDate);
        endedRevision = successorRevision(
          series,
          current,
          effectiveDate,
          "ended",
          this.clock().toISOString(),
          this.idFactory,
        );
        series.revisions.push(endedRevision);
      }
      series.currentRevisionId = endedRevision.id;
      series.status = "ended";
      series.revisionToken += 1;
      series.updatedAt = this.clock().toISOString();
      reconcileEligibleOccurrences(series, effectiveDate);
      const coverage = request.coverage
        ?? coverageFrom(series.coverageHorizon, effectiveDate);
      return coverage
        ? ensureCoverageState(
          series,
          coverage,
          this.idFactory,
          this.clock().toISOString(),
        )
        : summarize(series);
    });
  }

  async getSeries(
    userId: string,
    seriesId: string,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.persistence.transaction(`series:${seriesId}`, async (state) => {
      const series = state.series.get(seriesId);
      if (!series || series.userId !== userId) return notFound();
      return success(summarize(series), "complete");
    });
  }

  private async mutateExisting(
    request: LifecycleContext & { seriesId: string },
    operationName: string,
    operation: (
      series: RecurringTaskSeries,
    ) => LifecycleMutationResult | LifecycleFailure,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    if (this.persistence.read) {
      const missing = await this.persistence.read(
        `series:${request.seriesId}`,
        async (state) => {
          const series = state.series.get(request.seriesId);
          if (!series || series.userId !== request.userId) {
            return true;
          }
          if (
            "occurrenceId" in request
            && !series.occurrences.some(
              (occurrence) => occurrence.id === request.occurrenceId,
            )
          ) {
            return true;
          }
          return false;
        },
      );
      if (missing) return notFound();
    }

    const fingerprint = fingerprintOf({
      ...request,
      operationName,
      idempotencyKey: undefined,
      operationKey: undefined,
    });
    return this.persistence.transaction(
      `series:${request.seriesId}`,
      async (state) => {
        const replay = replayIdempotent(
          state,
          request.userId,
          request.idempotencyKey ?? request.operationKey,
          fingerprint,
        );
        if (replay) return replay;

        const series = state.series.get(request.seriesId);
        if (!series || series.userId !== request.userId) return notFound();
        const result = operation(series);
        const outcome = "type" in result
          ? result
          : success(result, result.status ?? "complete");
        if (isLifecycleSuccess(outcome)) {
          rememberIdempotency(
            state,
            request.userId,
            request.idempotencyKey ?? request.operationKey,
            fingerprint,
            outcome,
          );
        }
        return outcome;
      },
    );
  }

  private resolveEffectiveDate(
    request: LifecycleContext,
    seriesTimeZone: string,
  ): string {
    const timeZone = validateTimeZone(
      request.timeZone ?? request.timezone ?? seriesTimeZone,
    );
    return request.effectiveDate
      ?? getLocalDateInTimeZone(
        this.clock(),
        timeZone,
      );
  }
}

export function createRecurringTaskLifecycle(
  persistence: RecurringTaskLifecyclePersistence,
  options: LifecycleClockOptions = {},
): RecurringTaskLifecycle {
  return new RecurringTaskLifecycle(persistence, options);
}

function cloneState(state: RecurringTaskLifecycleState): RecurringTaskLifecycleState {
  return {
    series: new Map(
      [...state.series.entries()].map(([id, series]) => [id, cloneSeries(series)]),
    ),
    idempotency: new Map(
      [...state.idempotency.entries()].map(([key, record]) => [
        key,
        structuredClone(record),
      ]),
    ),
  };
}

function changed<T>(before: T | undefined, after: T | undefined): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function cloneSeries(series: RecurringTaskSeries): RecurringTaskSeries {
  return structuredClone(series);
}

function normalizeDefaults(defaults: SeriesDefaults): SeriesDefaults {
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

function validateCreateRequest(request: CreateSeriesRequest): void {
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

function validateTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new RangeError("Invalid IANA timezone");
  }
  return timeZone;
}

function validateRange(range: LocalDateRange): void {
  if (compareLocalDates(range.from, range.to) > 0) {
    throw new RangeError("Coverage range must be inclusive and ordered");
  }
}

function validateRevisionRequest(
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

function checkExpectedRevision(
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

function currentRevision(series: RecurringTaskSeries): SeriesRevision {
  const revision = series.revisions.find(
    (candidate) => candidate.id === series.currentRevisionId,
  );
  if (!revision) throw new Error("Series current revision is missing");
  return revision;
}

function closeRevision(revision: SeriesRevision, effectiveDate: string): void {
  if (
    revision.effectiveTo === null
    || compareLocalDates(effectiveDate, revision.effectiveTo) < 0
  ) {
    revision.effectiveTo = effectiveDate;
  }
}

function successorRevision(
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

function resolveRevision(
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

function isDateProducedBySeries(
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

function occurrenceHasIntent(occurrence: TaskOccurrence): boolean {
  return Object.keys(occurrence.overrides).length > 0;
}

function ownedOccurrence(
  series: RecurringTaskSeries,
  occurrenceId: string,
): TaskOccurrence | undefined {
  return series.occurrences.find((occurrence) => occurrence.id === occurrenceId);
}

function reconcileEligibleOccurrences(
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

function mergeDetails(
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

function coverageRangeForExtension(
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

function ensureCoverageState(
  series: RecurringTaskSeries,
  range: LocalDateRange,
  idFactory: () => string,
  updatedAt: string = series.updatedAt,
): LifecycleMutationResult {
  validateRange(range);
  const datesByRevision = new Map<string, string[]>();
  const intentionalAbsences = new Set(series.intentionalAbsences);

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
    }
  }

  const scheduledDates = [...datesByRevision.values()]
    .flat()
    .sort();
  const producedDates = new Set(scheduledDates);
  for (const occurrence of series.occurrences) {
    if (
      occurrence.state === "open"
      && compareLocalDates(occurrence.scheduledDate, range.from) >= 0
      && compareLocalDates(occurrence.scheduledDate, range.to) <= 0
      && !producedDates.has(occurrence.scheduledDate)
    ) {
      occurrence.state = occurrenceHasIntent(occurrence) ? "extra" : "withdrawn";
    }
  }

  let retainedCount = series.occurrences.filter(
    (occurrence) => occurrence.state !== "withdrawn",
  ).length;
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
    series.status === "active"
    && series.lastScheduledDate !== null
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
  return summarize(series);
}

function summarize(series: RecurringTaskSeries): LifecycleMutationResult {
  return {
    series,
    occurrences: series.occurrences.filter(
      (occurrence) => occurrence.state !== "withdrawn",
    ),
    intentionalAbsences: [...series.intentionalAbsences].sort(),
  };
}

function coverageFrom(
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

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value].sort();
}

function clearPauseAbsencesFrom(
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

function success(
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
  };
}

function isLifecycleSuccess(
  outcome: LifecycleOutcome<RecurringTaskSeries>,
): outcome is LifecycleSuccess<RecurringTaskSeries> {
  return "value" in outcome;
}

function invalidTransition(reason: string): InvalidTransitionOutcome {
  return { status: "invalid-transition", type: "invalid-transition", reason };
}

function notFound(): NotFoundOutcome {
  return { status: "not-found", type: "not-found" };
}

function idempotencyMapKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

function replayIdempotent(
  state: RecurringTaskLifecycleState,
  userId: string,
  idempotencyKey: string | undefined,
  fingerprint: string,
): LifecycleSuccess<RecurringTaskSeries> | ConflictOutcome | undefined {
  if (!idempotencyKey) return undefined;
  const record = state.idempotency.get(idempotencyMapKey(userId, idempotencyKey));
  if (!record) return undefined;
  if (record.fingerprint !== fingerprint) {
    return {
      status: "conflict",
      type: "conflict",
      reason: "Idempotency key was reused for a different request",
    };
  }
  return {
    ...structuredClone(record.result),
    status: "already-applied",
    type: "already-applied",
  };
}

function rememberIdempotency(
  state: RecurringTaskLifecycleState,
  userId: string,
  idempotencyKey: string | undefined,
  fingerprint: string,
  result: LifecycleSuccess<RecurringTaskSeries>,
): void {
  if (!idempotencyKey) return;
  state.idempotency.set(idempotencyMapKey(userId, idempotencyKey), {
    fingerprint,
    result: structuredClone(result),
  });
}

function fingerprintOf(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectKeys(entry)]),
  );
}
