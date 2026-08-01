export { getOccurrencesInRange, getNextOccurrence, describeRecurrence } from './recurrence';
export {
  ensureRecurringInstances,
  type RecurringGenerationResult,
} from './instance-generator';
export * from './lifecycle';
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
