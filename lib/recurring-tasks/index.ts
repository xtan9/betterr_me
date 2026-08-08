export { getOccurrencesInRange, getNextOccurrence, describeRecurrence } from './recurrence';
export { toRecurringTaskResponse } from './compatibility';
export * from './lifecycle';
export {
  createActivatedRecurringTaskLifecycle,
  RECURRING_TASK_LIFECYCLE_CUTOVER,
} from './activation';
export {
  SupabaseRecurringTaskLifecycle,
  createSupabaseRecurringTaskLifecycle,
} from './supabase-lifecycle';
export {
  ensureRecurringTaskCoverage,
  ensureRecurringTaskCoverageThrough,
  recurringCoverageWarning,
  RecurringCoverageUnavailableError,
  taskReadCoverageRange,
  type RecurringCoverageResult,
  type RecurringCoverageWarning,
  type TaskReadCoverageRequest,
} from './coverage';
export {
  prewarmActiveRecurringTaskCoverage,
  type PrewarmAttemptResult,
  type PrewarmOptions,
  type PrewarmResult,
  type RecurringTaskPrewarmingLifecycle,
} from './prewarming';
export * from './occurrence-adapter';
export {
  createSupabaseOccurrenceAdapter,
  type SupabaseOccurrenceAdapterOptions,
} from './supabase-occurrence-adapter';
export * from './series-state-adapter';
export {
  createSupabaseSeriesStateAdapter,
  type SupabaseSeriesStateAdapterOptions,
} from './supabase-series-state-adapter';
export {
  createAuthenticatedRecurringTaskCapabilities,
  createRecurringTaskCapabilities,
  RECURRING_TASK_OPERATION_IDS,
} from './capabilities';
export {
  createRecurringTaskMaintenanceCapability,
  RECURRING_TASK_MAINTENANCE_AUTHORITY,
} from './maintenance';
export type {
  AuthenticatedRecurringTaskCapabilityOptions,
  AuthenticatedRecurringTaskCapabilities,
  AuthenticatedRecurringTaskPrincipal,
  CoverageCapability,
  CoverageCapabilityResult,
  CoverageCompleteness,
  CoverageComplete,
  CoverageEnsureCommand,
  CoveragePartial,
  CoverageResult,
  CoverageUnavailable,
  CreateSeriesCommand,
  CreateSeriesResult,
  CreateSeriesSuccess,
  EndSeriesResult,
  EndSeriesSuccess,
  InvalidTransitionFailure,
  NotFoundFailure,
  PauseSeriesResult,
  PauseSeriesSuccess,
  RecurringTaskFailure,
  RecurringTaskFailureType,
  RecurringTaskOperation,
  RecurringTaskOperationId,
  ReviseSeriesCommand,
  ReviseSeriesResult,
  ReviseSeriesSuccess,
  SeriesCommandSuccess,
  SeriesCommands,
  SeriesDetailQuery,
  SeriesDetailResult,
  SeriesDetailSuccess,
  SeriesListQuery,
  SeriesListResult,
  SeriesListSuccess,
  SeriesProjection,
  SeriesQueries,
  SeriesStateCommand,
  SeriesVersion,
  ValidationFailure,
} from './capabilities';
export type {
  RecurringTaskMaintenanceAuthority,
  RecurringTaskMaintenanceCapability,
  RecurringTaskMaintenanceCapabilityOptions,
  RecurringTaskMaintenanceFailures,
  RecurringTaskMaintenanceResult,
} from './maintenance';
