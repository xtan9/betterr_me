/** Fingerprints requests and records replayable lifecycle outcomes. */

import type {
  RecurringTaskLifecycleState,
  LifecycleSuccess,
  RecurringTaskSeries,
  ConflictOutcome,
} from "./lifecycle-contract";

function idempotencyMapKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

export function replayIdempotent(
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

export function rememberIdempotency(
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

export function fingerprintOf(value: unknown): string {
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
