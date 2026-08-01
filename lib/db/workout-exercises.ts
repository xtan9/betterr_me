/**
 * Active workout mutations are owned by `lib/fitness/writes.ts`.
 *
 * This module intentionally exports no persistence APIs. Keeping the path as a
 * tracked tombstone makes stale imports fail loudly while source registries can
 * continue to enumerate tracked files during a transition.
 */
export {};
