import { mockSupabaseClient } from "../setup";

/**
 * Queue an ordered sequence of thenable responses for awaited query builders
 * (the destructured `{ data, error }` form — e.g. when source does
 * `const { data, error } = await supabase.from(t).update(...).eq(...)`).
 *
 * Each call to `await <builder>` in source shifts one response off the queue.
 * Terminal methods `.single()` / `.maybeSingle()` do NOT consume queued
 * responses — they read directly from `mockSupabaseClient`'s `setMockResponse`
 * state. So for methods that mix both (a `.maybeSingle()` SELECT followed by
 * an awaited `.eq()` UPDATE), use `setMockResponse` for the single and
 * `queueThenResponses` for the update.
 *
 * Monkey-patches the prototype `then`. You **must** pair this with
 * `afterEach(() => delete (mockSupabaseClient as { then?: unknown }).then)`
 * so the override doesn't leak into the next test.
 *
 * @example
 *   queueThenResponses([
 *     { data: rows, error: null },       // first awaited query
 *     { data: null, error: myError },    // second awaited query
 *   ]);
 */
export function queueThenResponses(
  responses: Array<{ data?: unknown; error?: unknown; count?: number | null }>,
): void {
  const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
  (mockSupabaseClient as { then: typeof mockSupabaseClient.then }).then =
    function (onFulfilled: unknown, onRejected?: unknown) {
      const next = responses.shift();
      if (next) {
        return Promise.resolve(next).then(
          onFulfilled as (value: unknown) => unknown,
          onRejected as ((reason: unknown) => unknown) | undefined,
        );
      }
      return origThen(
        onFulfilled as (value: unknown) => unknown,
        onRejected as ((reason: unknown) => unknown) | undefined,
      );
    };
}

/**
 * Restore the prototype `then` on `mockSupabaseClient`. Call this in
 * `afterEach` when a test used `queueThenResponses`.
 */
export function restoreMockSupabaseThen(): void {
  delete (mockSupabaseClient as { then?: unknown }).then;
}
