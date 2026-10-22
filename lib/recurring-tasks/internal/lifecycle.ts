/** Coordinates atomic Recurring Task Series and Task Occurrence commands. */

import { compareLocalDates, isValidLocalDate, getLocalDateInTimeZone } from "./recurrence";

import {
  type RecurringLifecycleObserver,
  emitRecurringLifecycleSignal,
  type RecurringLifecycleSignal,
  errorType,
} from "./observability";

import type {
  RecurringTaskLifecyclePort,
  RecurringTaskLifecyclePersistence,
  LifecycleClockOptions,
  CreateSeriesRequest,
  LifecycleOutcome,
  RecurringTaskSeries,
  SeriesRevision,
  EnsureCoverageRequest,
  LocalDateRange,
  EnsureUserCoverageRequest,
  UserCoverageOutcome,
  TaskOccurrence,
  UserCoveragePartial,
  ReviseSeriesRequest,
  OccurrenceUpdateRequest,
  OccurrenceOverrideField,
  OccurrenceCommandRequest,
  SeriesCommandRequest,
  RecurringSeriesStatus,
  ActiveSeriesSummary,
  PrewarmCoverageRequest,
  PrewarmSkippedOutcome,
  LifecycleContext,
  LifecycleMutationResult,
  LifecycleFailure,
  InvalidTransitionOutcome,
} from "./lifecycle-contract";

import { fingerprintOf, replayIdempotent, rememberIdempotency } from "./lifecycle-idempotency";

import {
  validateCreateRequest,
  validateTimeZone,
  validateRange,
  checkExpectedRevision,
  validateScopedSeriesTarget,
  validateRevisionRequest,
  validateOccurrenceCommand,
} from "./lifecycle-validation";

import {
  normalizeDefaults,
  currentRevision,
  closeRevision,
  reconcileEligibleOccurrences,
  mergeDetails,
  ownedOccurrence,
  isDateProducedBySeries,
  addUnique,
  successorRevision,
  clearPauseAbsencesFrom,
  withdrawAllEligibleOccurrences,
  toActiveSeriesSummary,
} from "./lifecycle-series";

import {
  ensureCoverageState,
  coverageRangeForExtension,
  coverageFrom,
  isCoverageOperation,
} from "./lifecycle-coverage";

import {
  summarize,
  success,
  isLifecycleSuccess,
  invalidTransition,
  notFound,
  withMutationObservability,
} from "./lifecycle-outcomes";

import {
  emptyObservability,
  addObservability,
  observabilityIfNonZero,
  captureObservability,
} from "./lifecycle-metrics";

export type {
  RecurringSeriesStatus,
  OccurrenceState,
  LifecycleScope,
  SeriesDefaults,
  OccurrenceOverrideField,
  OccurrenceOverrides,
  LocalDateRange,
  LifecycleObservability,
  ActiveSeriesSummary,
  SeriesRevision,
  TaskOccurrence,
  RecurringTaskSeries,
  RecurringTaskLifecycleState,
  RecurringTaskLifecyclePersistence,
  LifecycleClockOptions,
  LifecycleSource,
  LifecycleContext,
  CreateSeriesRequest,
  EnsureCoverageRequest,
  EnsureUserCoverageRequest,
  ReviseSeriesRequest,
  OccurrenceUpdateRequest,
  OccurrenceCommandRequest,
  SeriesCommandRequest,
  PrewarmCoverageRequest,
  LifecycleSuccess,
  NotFoundOutcome,
  InvalidTransitionOutcome,
  ConflictOutcome,
  CoverageUnavailableOutcome,
  PrewarmSkippedOutcome,
  LifecycleOutcome,
  EnsureCoverageOutcome,
  UserCoverageSuccess,
  UserCoveragePartial,
  UserCoverageOutcome,
  RecurringTaskLifecyclePort,
} from "./lifecycle-contract";

export { InMemoryRecurringTaskLifecyclePersistence } from "./lifecycle-memory";

export type { RecurringLifecycleEvent, RecurringLifecycleSignal } from "./observability";

export class RecurringTaskLifecycle implements RecurringTaskLifecyclePort {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private readonly observer: RecurringLifecycleObserver;

  constructor(
    private readonly persistence: RecurringTaskLifecyclePersistence,
    options: LifecycleClockOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.observer = options.observer ?? emitRecurringLifecycleSignal;
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

    try {
      const outcome = await this.persistence.transaction(serializationKey, async (state) => {
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
        if (coverage) {
          this.observe({
            event: "coverage_attempt",
            operation: "create-series",
            source: request.source,
            userId: request.userId,
            seriesId,
            from: coverage.from,
            to: coverage.to,
          });
        }
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
      this.observeOutcome("create-series", request, outcome);
      return outcome;
    } catch (error) {
      this.observeFailure("create-series", request, error);
      throw error;
    }
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
    this.observeCoverageAttempt("ensure-coverage", request, range);
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
    this.observe({
      event: "coverage_attempt",
      operation: "ensure-user-coverage",
      source: request.source,
      userId: request.userId,
      from: request.range.from,
      to: request.range.to,
    });
    const series = await (this.persistence.read
      ? this.persistence.read(`user:${request.userId}`, async (state) =>
        [...state.series.values()]
          .filter((candidate) => candidate.userId === request.userId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt)))
      : this.persistence.transaction(`user:${request.userId}`, async (state) =>
        [...state.series.values()]
          .filter((candidate) => candidate.userId === request.userId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))));
    const coveredSeries: RecurringTaskSeries[] = [];
    const occurrencesById = new Map<string, TaskOccurrence>();
    const intentionalAbsences = new Set<string>();
    const failedSeriesIds: string[] = [];
    const observability = emptyObservability();

    for (const candidate of series) {
      try {
        const outcome = await this.ensureCoverage({
          userId: request.userId,
          seriesId: candidate.id,
          range: request.range,
          source: request.source,
        });
        if (!isLifecycleSuccess(outcome)) {
          failedSeriesIds.push(candidate.id);
          continue;
        }
        coveredSeries.push(outcome.series);
        outcome.occurrences.forEach((occurrence) => {
          occurrencesById.set(occurrence.id, occurrence);
        });
        outcome.intentionalAbsences.forEach((date) => intentionalAbsences.add(date));
        addObservability(observability, outcome.observability);
      } catch {
        failedSeriesIds.push(candidate.id);
      }
    }

    const shared = {
      series: coveredSeries,
      occurrences: [...occurrencesById.values()],
      intentionalAbsences: [...intentionalAbsences].sort(),
      ...observabilityIfNonZero(observability),
    };
    if (failedSeriesIds.length === 0) {
      return {
        status: "complete",
        type: "complete",
        ...shared,
      };
    }
    const partial: UserCoveragePartial = {
      status: "partial",
      type: "partial",
      requestedRange: request.range,
      failedSeriesIds: [...new Set(failedSeriesIds)].sort(),
      ...shared,
    };
    this.observe({
      event: "coverage_partial",
      operation: "ensure-user-coverage",
      source: request.source,
      userId: request.userId,
      from: request.range.from,
      to: request.range.to,
      seriesCount: series.length,
      failedSeriesCount: partial.failedSeriesIds.length,
      failedSeriesIds: partial.failedSeriesIds,
    });
    return partial;
  }

  async reviseSeries(
    request: ReviseSeriesRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "revise-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const identity = validateScopedSeriesTarget(
        series,
        request,
        ["following", "all"],
      );
      if (identity) return identity;
      if (series.status === "ended") {
        return invalidTransition("Ended Series cannot be revised");
      }
      const effectiveDate = this.resolveEffectiveDate(request, series.timeZone);
      if (typeof effectiveDate !== "string") return effectiveDate;
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
      const identity = validateOccurrenceCommand(series, occurrence, request);
      if (identity) return identity;
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
      const identity = validateOccurrenceCommand(series, occurrence, request);
      if (identity) return identity;
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
      const identity = validateOccurrenceCommand(series, occurrence, request);
      if (identity) return identity;
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
      const identity = validateOccurrenceCommand(series, occurrence, request);
      if (identity) return identity;
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
      const effectiveDate = this.resolveEffectiveDate(request, series.timeZone);
      if (typeof effectiveDate !== "string") return effectiveDate;
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
      const effectiveDate = this.resolveEffectiveDate(request, series.timeZone);
      if (typeof effectiveDate !== "string") return effectiveDate;
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

  async endSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "end-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      const identity = validateScopedSeriesTarget(
        series,
        request,
        ["following", "all"],
      );
      if (identity) return identity;
      if (series.status === "ended") return summarize(series);
      const effectiveDate = this.resolveEffectiveDate(request, series.timeZone);
      if (typeof effectiveDate !== "string") return effectiveDate;
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
      if (request.scope === "all") {
        withdrawAllEligibleOccurrences(series);
      } else {
        reconcileEligibleOccurrences(series, effectiveDate);
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

  async deleteSeries(
    request: SeriesCommandRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    return this.mutateExisting(request, "delete-series", (series) => {
      const invalid = checkExpectedRevision(series, request);
      if (invalid) return invalid;
      if (series.status === "ended") return summarize(series);
      const effectiveDate = this.resolveEffectiveDate(request, series.timeZone);
      if (typeof effectiveDate !== "string") return effectiveDate;
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
      withdrawAllEligibleOccurrences(series);
      return summarize(series);
    });
  }

  async listSeries(
    userId: string,
    status?: RecurringSeriesStatus,
  ): Promise<{ series: RecurringTaskSeries[] }> {
    const read = this.persistence.read
      ? this.persistence.read.bind(this.persistence)
      : this.persistence.transaction.bind(this.persistence);
    const series = await read(`user:${userId}`, async (state) =>
      [...state.series.values()]
        .filter((candidate) => candidate.userId === userId)
        .filter((candidate) => status === undefined || candidate.status === status)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((candidate) => summarize(candidate).series),
    );
    return { series };
  }

  async listActiveSeries(): Promise<{ series: ActiveSeriesSummary[] }> {
    const series = await (this.persistence.read
      ? this.persistence.read("active-series", async (state) =>
        [...state.series.values()]
          .filter((candidate) => candidate.status === "active")
          .map(toActiveSeriesSummary))
      : this.persistence.transaction("active-series", async (state) =>
        [...state.series.values()]
          .filter((candidate) => candidate.status === "active")
          .map(toActiveSeriesSummary)));
    return { series };
  }

  async prewarmCoverage(
    request: PrewarmCoverageRequest,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    validateRange(request.range);
    this.observeCoverageAttempt("prewarm-coverage", request, request.range);
    return this.mutateExisting(request, "prewarm-coverage", (series) => {
      if (series.status !== "active") {
        return {
          status: "skipped",
          type: "skipped",
          reason: "inactive-series",
        } satisfies PrewarmSkippedOutcome;
      }
      if (
        series.coverageHorizon
        && compareLocalDates(series.coverageHorizon, request.range.to) >= 0
      ) {
        return {
          status: "skipped",
          type: "skipped",
          reason: "already-covered",
        } satisfies PrewarmSkippedOutcome;
      }
      return ensureCoverageState(
        series,
        coverageRangeForExtension(series, request.range),
        this.idFactory,
        this.clock().toISOString(),
      );
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

  private observe(signal: RecurringLifecycleSignal): void {
    this.observer(signal);
  }

  private observeCoverageAttempt(
    operation: string,
    request: LifecycleContext & { seriesId?: string },
    range: LocalDateRange,
  ): void {
    this.observe({
      event: "coverage_attempt",
      operation,
      source: request.source,
      userId: request.userId,
      seriesId: request.seriesId,
      from: range.from,
      to: range.to,
    });
  }

  private observeOutcome(
    operation: string,
    request: LifecycleContext & { seriesId?: string },
    outcome: LifecycleOutcome<RecurringTaskSeries>,
  ): void {
    if (outcome.status === "already-applied") {
      if (isCoverageOperation(operation, request)) {
        this.observe({
          event: "coverage_retry",
          operation,
          source: request.source,
          userId: request.userId,
          seriesId: request.seriesId ?? outcome.series.id,
          status: outcome.status,
        });
      }
      return;
    }
    if (outcome.status === "conflict") {
      this.observe({
        event: "lifecycle_conflict",
        operation,
        source: request.source,
        userId: request.userId,
        seriesId: request.seriesId,
        status: outcome.status,
      });
      return;
    }
    if (outcome.status === "skipped") {
      this.observe({
        event: "prewarm_skipped",
        operation,
        source: request.source,
        userId: request.userId,
        seriesId: request.seriesId,
        status: outcome.reason,
      });
      return;
    }
    if (!isLifecycleSuccess(outcome)) {
      if (outcome.status !== "not-found") {
        this.observe({
          event: "lifecycle_failure",
          operation,
          source: request.source,
          userId: request.userId,
          seriesId: request.seriesId,
          status: outcome.status,
        });
      }
      return;
    }
    const observability = outcome.observability;
    if (!observability) return;
    const common = {
      operation,
      source: request.source,
      userId: request.userId,
      seriesId: request.seriesId ?? outcome.series.id,
    };
    if (observability.createdOccurrences > 0) {
      this.observe({
        ...common,
        event: "occurrence_created",
        count: observability.createdOccurrences,
      });
    }
    if (observability.intentionalAbsences > 0) {
      this.observe({
        ...common,
        event: "intentional_absence",
        count: observability.intentionalAbsences,
      });
    }
    if (observability.withdrawnOccurrences > 0) {
      this.observe({
        ...common,
        event: "occurrence_withdrawn",
        count: observability.withdrawnOccurrences,
      });
    }
  }

  private observeFailure(
    operation: string,
    request: LifecycleContext & { seriesId?: string },
    error: unknown,
  ): void {
    this.observe({
      event: "lifecycle_failure",
      operation,
      source: request.source,
      userId: request.userId,
      seriesId: request.seriesId,
      errorType: errorType(error),
    });
  }

  private async mutateExisting(
    request: LifecycleContext & { seriesId: string },
    operationName: string,
    operation: (
      series: RecurringTaskSeries,
    ) => LifecycleMutationResult | LifecycleFailure,
  ): Promise<LifecycleOutcome<RecurringTaskSeries>> {
    try {
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
      const outcome = await this.persistence.transaction(
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
          const before = captureObservability(series);
          const result = operation(series);
          const rawOutcome = "type" in result
            ? result
            : success(result, result.status ?? "complete");
          const outcome = isLifecycleSuccess(rawOutcome)
            ? withMutationObservability(rawOutcome, before)
            : rawOutcome;
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
      this.observeOutcome(operationName, request, outcome);
      return outcome;
    } catch (error) {
      this.observeFailure(operationName, request, error);
      throw error;
    }
  }

  private resolveEffectiveDate(
    request: LifecycleContext,
    seriesTimeZone: string,
  ): string | InvalidTransitionOutcome {
    const explicitDate = request.effectiveDate?.trim();
    if (explicitDate) {
      return isValidLocalDate(explicitDate)
        ? explicitDate
        : invalidTransition("Effective Date must be a valid local date");
    }
    // A command's implicit boundary is a property of the person's stored
    // Series, not of whichever transport happened to invoke the lifecycle.
    const timeZone = validateTimeZone(seriesTimeZone);
    return getLocalDateInTimeZone(this.clock(), timeZone);
  }
}

export function createRecurringTaskLifecycle(
  persistence: RecurringTaskLifecyclePersistence,
  options: LifecycleClockOptions = {},
): RecurringTaskLifecycle {
  return new RecurringTaskLifecycle(persistence, options);
}
