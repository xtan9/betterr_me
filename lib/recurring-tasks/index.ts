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
  type RecurringCoverageResult,
} from './coverage';
export * from './occurrence-adapter';
export {
  createSupabaseOccurrenceAdapter,
  type SupabaseOccurrenceAdapterOptions,
} from './supabase-occurrence-adapter';
