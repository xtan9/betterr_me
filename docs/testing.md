# Testing Patterns

Rules for writing tests in this repo. These exist so tests actually catch bugs rather than just executing lines — mutation testing (`pnpm mutation-test`) verifies the bar.

The target is **≥85% mutation score per file**. Current Stryker scope is `lib/db/**` only (break threshold starts at 60 and tightens phase-by-phase per the [foundation spec](./superpowers/specs/2026-04-17-mutation-testing-foundation-design.md)); Phase 5 adds `lib/money/**`, `lib/recurring-tasks/**`, and `lib/habits/**` to the scope. Tests that only assert "was called" or "returns a shape" inflate coverage without catching regressions and will let mutants survive.

## The five rules

### R1 — Use `expectQuery()` for DB calls, not `toHaveBeenCalledWith`

`mockSupabaseClient` is a thenable chain mock — every call to `.from()`, `.eq()`, `.select()` returns `this`. If a test only asserts `expect(from).toHaveBeenCalledWith("habits")` and not the full call path, swapping `.from("habits")` → `.from("tasks")` can still pass.

`expectQuery()` (defined in `tests/setup.ts`) asserts on `{ table, method, args }` together against the ordered query log.

```ts
// Bad — misses table-swap bugs
expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", userId);

// Good — catches them
mockSupabaseClient.expectQuery({
  table: "habits",
  method: "eq",
  args: ["user_id", userId],
});
```

**Use for:** every meaningful DB call — `from`, `select`, `eq`, `in`, `gte`, `order`, `range`, `insert`, `update`, `delete`.

**Gotcha — multi-phase queries with repeated args:** `expectQuery` finds *any* matching call. When a source method runs two phases (e.g. SELECT then UPDATE) and both use the same `.from(table)` or `.eq("user_id", userId)`, mutating just one phase won't be caught — the other, unmutated phase still satisfies the assertion. For these cases, assert on the full `queryLog` array:

```ts
expect(mockSupabaseClient.queryLog).toEqual([
  { table: "habit_graduations", method: "from", args: ["habit_graduations"] },
  { table: "habit_graduations", method: "select", args: ["id"] },
  { table: "habit_graduations", method: "eq", args: ["habit_id", habitId] },
  // ... full ordered chain, both phases
]);
```

This catches mutations to *any* single arg/method in *any* position. Use for methods that make multiple DB calls; `expectQuery` is fine for single-query methods.

### R2 — Test error paths explicitly

Any `if (error) throw …` or `if (error) log.error(…)` branch in source needs a test that actually triggers it. Without one, Stryker mutates `if (error)` → `if (false)` and the test still passes.

```ts
it("throws on database error", async () => {
  mockSupabaseClient.setMockResponse(null, new Error("connection refused"));

  await expect(habitsDB.getUserHabits("user-1"))
    .rejects.toThrow("connection refused");
});
```

**Every DB method in source needs a matching error-path test.**

### R3 — Assert on `.order()`, `.range()`, `.limit()` args

For any source call that specifies column, direction, offset, or limit, the test must verify the arguments. Stryker loves flipping `ascending: false` → `ascending: true` or `offset + limit - 1` → `offset - limit - 1`.

```ts
// Source:
.order("created_at", { ascending: false })
.range(offset, offset + limit - 1);

// Test:
mockSupabaseClient.expectQuery({
  method: "order",
  args: ["created_at", { ascending: false }],
});
mockSupabaseClient.expectQuery({
  method: "range",
  args: [0, 19], // offset=0, limit=20 → range(0, 19)
});
```

### R4 — Import pure functions, don't stub them

If a helper is pure (no I/O, no time, no global state), import the real one. Stubs lie when the real function changes — or worse, they encode an invented contract that doesn't match production.

```ts
// Bad — invented contract, test doesn't catch formula regressions
vi.mock("@/lib/money/projections", () => ({
  getDangerZoneStatus: (b, r) => b < r ? "danger" : "safe",
}));

// Good — runs the real function
import { getDangerZoneStatus } from "@/lib/money/projections";
// ... tests naturally exercise production logic
```

**Only mock boundaries:** DB client, `fetch`, `Date.now()` (via `vi.setSystemTime`), `@/lib/logger`, toast. Never mock pure helpers that live in `lib/`.

### R5 — Specific values, not just shape

Assertions like `toBeGreaterThan(0)` or `toBeTruthy()` let whole categories of bugs slip. For aggregations (`Math.max`, sum, count) and derived values, assert on concrete numbers. For strings, assert exact matches.

```ts
// Bad
expect(summary.totalVolume).toBeGreaterThan(0);
expect(result.message).toContain("completed");

// Good
expect(summary.totalVolume).toBe(4500); // 30kg * 10 reps * 15 sets
expect(result.message).toBe("3 workouts completed this week");
```

Same principle for arrays: `.toHaveLength(3)` + `.toEqual([...])` kills far more mutants than `.toHaveLength(3)` alone.

## `// Stryker disable next-line` — when and how

Some mutants are genuinely equivalent — they change the source but not observable behavior. Common cases:

- A `Math.max` on a single-element array where min/max yield the same result in all real inputs
- A default value that's provably never hit (e.g. `?? 0` where the preceding expression can never be `null`)

When a mutant is equivalent, disable it with a comment explaining **why it is equivalent**:

```ts
// Stryker disable next-line: reps is always single-element here; max/min are identical
const peakReps = Math.max(...reps);
```

**Rules:**
- The comment must state the equivalence reason. "Can't kill this mutant" is not acceptable.
- Prefer adding a real test over disabling. Disable only when you've tried and the mutant is provably equivalent.
- Code review flags unjustified disables — if the reason doesn't hold up, the disable goes and a test is added instead.

## Running mutation tests

```bash
# Full run (~8 min for lib/db scope today)
pnpm mutation-test

# Narrow to one file for iteration
pnpm stryker run --mutate "lib/db/habits.ts"
```

Reports land at `reports/mutation/mutation.html`.

> A `pnpm mutation-test:changed` wrapper (for per-PR runs scoped to files changed since `origin/main`) lands in Phase 4 of the foundation rollout — not yet available.

## Mocking reference

Established patterns (see examples in `tests/lib/db/`):

- **Supabase DB calls**: `mockSupabaseClient.setMockResponse(data, error)` + `expectQuery(...)` assertions.
- **Multi-call sequences**: for endpoints that make multiple awaited queries (`const { data, error } = await supabase.from(…).update(…).eq(…)`), use `queueThenResponses` from `tests/helpers/mock-supabase.ts`. Always pair with `afterEach(() => restoreMockSupabaseThen())` — without the cleanup, queued responses leak into the next test.
  ```ts
  import { queueThenResponses, restoreMockSupabaseThen } from "../../helpers/mock-supabase";
  // ...
  afterEach(() => restoreMockSupabaseThen());
  ```
  Note: `.single()` / `.maybeSingle()` do NOT consume queued responses — they read from `setMockResponse` state directly. Mix the two when a method does a `maybeSingle` SELECT then an awaited `.eq()` UPDATE.
- **`fetch`**: `vi.stubGlobal("fetch", vi.fn().mockResolvedValue(...))` + `afterEach(vi.unstubAllGlobals)`.
- **`next-intl`**: `vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }))` or wrap with `NextIntlClientProvider`.
- **SWR**: `vi.mock("swr", () => ({ default: (...args) => mockUseSWR(...args) }))`.
- **Date/time**: `vi.useFakeTimers()` + `vi.setSystemTime("2026-04-15T12:00:00Z")` + `vi.useRealTimers()` in `finally`.
