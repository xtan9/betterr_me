import {
  InMemoryRecurringTaskLifecyclePersistence,
  RecurringTaskLifecycle,
  type LifecycleClockOptions,
  type RecurringTaskLifecyclePersistence,
} from "./lifecycle";
import {
  createRecurringTaskCapabilitiesForLifecycle,
  type AuthenticatedRecurringTaskCapabilities,
  type AuthenticatedRecurringTaskPrincipal,
} from "./capabilities";

/**
 * Private reference composition for the capability conformance suite.
 * Production code must use the authenticated Supabase factory instead.
 */
export function createInMemoryRecurringTaskCapabilities(
  principal: AuthenticatedRecurringTaskPrincipal,
  options: LifecycleClockOptions & {
    persistence?: RecurringTaskLifecyclePersistence;
  } = {},
): AuthenticatedRecurringTaskCapabilities {
  const { persistence, ...lifecycleOptions } = options;
  const lifecycle = new RecurringTaskLifecycle(
    persistence ?? new InMemoryRecurringTaskLifecyclePersistence(),
    lifecycleOptions,
  );
  return createRecurringTaskCapabilitiesForLifecycle(principal, lifecycle);
}
