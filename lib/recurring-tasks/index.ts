/**
 * Supported authenticated production boundary for recurring tasks.
 *
 * Persistence, lifecycle composition, maintenance, telemetry, and the
 * in-memory reference implementation are intentionally not part of this
 * package surface. Use `scheduling` for pure recurrence and `compatibility`
 * for legacy HTTP/AI translation.
 */
export {
  createAuthenticatedRecurringTaskCapabilities,
} from "./internal/capabilities";

export type {
  AuthenticatedRecurringTaskCapabilities,
  AuthenticatedRecurringTaskCapabilityOptions,
  AuthenticatedRecurringTaskPrincipal,
  ConflictFailure,
  CoverageCapability,
  CoverageCapabilityResult,
  CoverageCompleteness,
  CoverageComplete,
  CoverageEnsureCommand,
  CoveragePartial,
  CoverageResult,
  CoverageUnavailable,
  CoverageUnavailableFailure,
  CreateSeriesCommand,
  CreateSeriesResult,
  CreateSeriesSuccess,
  EndSeriesResult,
  EndSeriesSuccess,
  InvalidTransitionFailure,
  LocalDateRange,
  NotFoundFailure,
  PauseSeriesResult,
  PauseSeriesSuccess,
  RecurringSeriesStatus,
  RecurringTaskFailure,
  RecurringTaskFailureType,
  RecurringTaskOperation,
  RecurringTaskOperationId,
  ReviseSeriesCommand,
  ReviseSeriesResult,
  ReviseSeriesSuccess,
  SeriesCommandSuccess,
  SeriesCommands,
  SeriesDefaults,
  SeriesDetailQuery,
  SeriesDetailResult,
  SeriesDetailSuccess,
  SeriesListQuery,
  SeriesListResult,
  SeriesListSuccess,
  SeriesProjection,
  SeriesQueries,
  SeriesRevision,
  SeriesStateCommand,
  SeriesVersion,
  TaskOccurrence,
  ValidationFailure,
} from "./internal/capabilities";
