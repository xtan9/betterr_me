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
// The return type mirrors the mock's built-in `then` signature: the mock
// resolves with `{ data, error, count }` shapes, but callers destructure
// only the fields they care about, so the loose typing is safe here.
type MockThenable = typeof mockSupabaseClient.then;

export function queueThenResponses(
  responses: Array<{ data?: unknown; error?: unknown; count?: number | null }>,
): void {
  const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
  const patched: MockThenable = function (onFulfilled, onRejected) {
    const next = responses.shift();
    if (next) {
      // Fill in defaults so the queued response matches the mock's full
      // shape (`{ data, error, count }`) — callers that destructure a
      // missing field get `undefined`, same as the stock mock behavior.
      const filled = {
        data: next.data ?? null,
        error: next.error ?? null,
        count: next.count ?? null,
      };
      return Promise.resolve(filled).then(onFulfilled, onRejected);
    }
    return origThen(onFulfilled, onRejected);
  };
  mockSupabaseClient.then = patched;
}

/**
 * Restore the prototype `then` on `mockSupabaseClient`. Call this in
 * `afterEach` when a test used `queueThenResponses`.
 */
export function restoreMockSupabaseThen(): void {
  delete (mockSupabaseClient as { then?: unknown }).then;
}
