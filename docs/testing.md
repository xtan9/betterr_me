# Testing Patterns

Rules for writing tests in this repo. These exist so tests actually catch bugs rather than just executing lines — mutation testing (`pnpm mutation-test`) verifies the bar.

The target is **≥85% mutation score per file**. Current Stryker scope is `lib/db/**`, `lib/recurring-tasks/**`, and `lib/habits/**` (break threshold = 85 per `stryker.config.mjs`). Tests that only assert "was called" or "returns a shape" inflate coverage without catching regressions and will let mutants survive.

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
vi.mock("@/lib/habits/format", () => ({
  formatFrequency: () => "Every day",
}));

// Good — runs the real function
import { formatFrequency } from "@/lib/habits/format";
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
# Full run across the central mutation scope
pnpm mutation-test

# Changed mutation scope vs origin/main — what CI runs per PR
pnpm mutation-test:changed

# Narrow to one file for iteration
pnpm stryker run --mutate "lib/db/habits.ts"
```

Reports land at `reports/mutation/mutation.html`. GitHub Actions uploads both
per-PR and weekly reports as `mutation-report-pr` / `mutation-report-full`
artifacts.

**Conditional CI signal:** the ownership registry in
`scripts/ci/classify-changes.mjs` selects the per-PR mutation job. Its central
scope covers implementations and tests under `lib/db/**`,
`lib/recurring-tasks/**`, and `lib/habits/**`, plus the shared mutation harness
and configuration files. Implementation changes mutate the exact changed source
files; test-only changes mutate their owning scope. The same registry builds
Stryker's full `mutate` and `testFiles` configuration, so workflow selection and
the executed command cannot silently omit habits. The signal remains advisory,
not a required merge check. A scheduled Monday 03:00 UTC run executes the full
scope and catches cross-file regressions a per-PR run would miss.

### Scheduled full-run policy and diagnostics

The weekly and manual full mutation job is advisory. It has a 60-minute job
budget. The Stryker command has an explicit 50-minute limit inside a 52-minute
step, leaving the rest of the job budget for process cleanup, diagnostics,
report upload, and runner cleanup. Mutation workflow concurrency is explicitly
non-cancelling: an in-flight scheduled baseline is preserved instead of being
replaced by a newer run.

The `Publish full mutation diagnostic` step writes one category to the Actions
job summary and log:

- `failure` when Stryker returns a non-zero result;
- `timeout` when GitHub stops the Stryker step at 50 minutes;
- `cancellation` when the workflow is cancelled externally;
- `infrastructure interruption` when the mutation step never produces a normal
  outcome; or
- `success` when the declared full scope completes.

GitHub's workflow conclusion remains the fallback diagnostic when a runner is
lost before a summary can be written: `stale` and `startup_failure` identify
infrastructure interruption, while `cancelled` identifies external cancellation.

#### July 2026 cancellation evidence

The scheduled runs from May 4 through July 20 (twelve runs, ending with
[run 29721456552](https://github.com/xtan9/betterr_me/actions/runs/29721456552))
all entered `Run full Stryker` successfully and were cancelled at the job's
60-minute limit. For example, run 29721456552 started Stryker at 06:22:08 UTC
and GitHub cancelled that step at 07:21:56 UTC. This timing, repeated at the
configured boundary, identifies job timeout rather than a test failure or
concurrency cancellation as the cause.

The legacy Money model was still included by the broad `lib/db/**/*.ts` scope
in those runs. After that model and its DB tests were removed, the same declared
mutation globs covered a materially smaller codebase. The next scheduled full
scope [run 30243225170](https://github.com/xtan9/betterr_me/actions/runs/30243225170)
completed successfully on July 27 in 20 minutes 27 seconds, within both the new
50-minute step budget and the unchanged 60-minute job budget.

A representative `pnpm mutation-test` run for issue #587 also completed on a
Windows development host in 34 minutes 11 seconds. It exercised all 36 files in
the declared scope (3,640 mutants and 948 initial tests) and finished with a
95.89% mutation score against the 85% break threshold. The slower of the local
and hosted observations therefore retains almost sixteen minutes of step-budget
headroom.

For follow-up observation, inspect the next two Monday runs. Confirm each job
summary reports `success`, the Stryker step stays below 50 minutes, and the
`mutation-report-full` artifact contains `reports/mutation/mutation.html`. If a
run does not complete, use its summary category first and the workflow
conclusion fallback above; record duration and the last completed step before
changing either budget.

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

## Conditional test selection

Pull-request CI, E2E, mutation, and performance workflows all consume the structured report
from `scripts/ci/classify-changes.mjs` through its fail-safe runner. The ownership
registry is the only path-policy source. The classifier logs and emits a JSON
report containing changed paths,
matched owners, selected suites, fallback reasons, and reasons for intentional
skips. Missing comparison SHAs, unreadable or ambiguous diffs, and unregistered
application paths select the broad validation set.

When changing the classifier, run its targeted policy verification:

```bash
pnpm exec vitest run tests/scripts/classify-changes.test.ts \
  tests/scripts/run-change-classifier.test.ts \
  tests/scripts/detect-pull-request-validated-push.test.ts \
  tests/scripts/gate-policy.test.ts \
  tests/scripts/github-actions-runtime-policy.test.ts \
  tests/scripts/quality-signal-contracts.test.ts \
  tests/scripts/stryker-changed.test.ts
```

This verifies every tracked path has an owner and covers renames, deletions,
test-only and workflow-only changes, mixed-risk diffs, each registered product
area, conservative fallbacks, stable aggregate gate names, and fail-closed gate
results. It intentionally does not run the complete Playwright suite; the
classifier selects the dashboard smoke spec for its own changes in pull-request
CI.

The optional visual, accessibility, and performance signal contracts are
documented in [Quality signals](quality-signals.md). The focused contract test
above checks their workflow names, reported terminology, documentation shape,
and continued separation from the repository's required gate names without
running Playwright.

## Browser test portfolio

Chromium tests prove boundaries that require a real browser: navigation,
browser APIs, HTTP integration, authentication, and persistence wiring. Pure
input variants, calculations, validation, and component presentation belong in
Vitest. One browser journey is enough when another case would exercise the same
wiring with only different business-rule data.

The July 2026 portfolio cleanup removed these redundant browser checks after
confirming their replacement coverage:

| Removed browser coverage | Replacement coverage |
| --- | --- |
| Weekdays, weekly, 2x/week, 3x/week, and custom habit creation variants | `tests/components/habits/frequency-selector.test.tsx` proves every selection payload; `tests/lib/validations/habit.test.ts` and `tests/app/api/habits/route.test.ts` prove accepted frequency shapes. The retained daily creation journey proves UI-to-HTTP persistence and redirect wiring. |
| Habit category loop, empty-name validation, cancel, and repeated sequential creation | `tests/components/categories/category-picker.test.tsx`, `tests/components/habits/habit-form.test.tsx`, and `tests/app/habits/create-habit-page.test.tsx` prove selection, validation, cancellation, request, and redirect behavior. |
| Dashboard skeleton, greeting, snapshot, checklist, motivation, and nav-presence cases | `tests/app/dashboard/dashboard-content.test.tsx`, the focused tests under `tests/components/dashboard/`, and `tests/components/layouts/app-sidebar.test.tsx` prove these presentation variants. |
| Duplicate dashboard mobile, tablet, and desktop cases | `e2e/responsive.spec.ts` remains the browser boundary for representative responsive layout and overflow behavior. |
| Duplicate dashboard habit toggle, uncomplete, streak-display, rapid-toggle, and progress-display cases | `tests/lib/db/habit-logs.test.ts`, `tests/app/dashboard/dashboard-content.test.tsx`, `tests/components/habits/habit-card.test.tsx`, and `tests/components/dashboard/habit-checklist.test.tsx` prove the business rules and presentation. Retained journeys cover both toggle surfaces and persistence after reload. |
| Task-list heading, tabs, and sidebar-link presence | `tests/components/tasks/tasks-page-content.test.tsx` and `tests/components/layouts/app-sidebar.test.tsx` prove presentation; the retained Chromium case proves navigation to task creation. |
| The 150-month Household Runway What-if input | `tests/lib/finance/cushion.test.ts` proves the exact long-run calculation. The retained browser journey proves interview state, What-if wiring, reset, browser history, and local persistence with one representative adjustment. |

For a portfolio-only change, run the affected lower-level selections and only
the retained Chromium journeys:

```bash
pnpm exec vitest run \
  tests/components/habits/frequency-selector.test.tsx \
  tests/components/categories/category-picker.test.tsx \
  tests/components/habits/habit-form.test.tsx \
  tests/app/habits/create-habit-page.test.tsx \
  tests/lib/validations/habit.test.ts \
  tests/app/api/habits/route.test.ts \
  tests/app/dashboard/dashboard-content.test.tsx \
  tests/components/dashboard/daily-snapshot.test.tsx \
  tests/components/dashboard/habit-checklist.test.tsx \
  tests/components/dashboard/motivation-message.test.tsx \
  tests/components/habits/habit-card.test.tsx \
  tests/components/tasks/tasks-page-content.test.tsx \
  tests/components/layouts/app-sidebar.test.tsx \
  tests/lib/db/habit-logs.test.ts \
  tests/lib/finance/cushion.test.ts
pnpm exec playwright test --project=chromium \
  e2e/create-habit.spec.ts e2e/complete-habit.spec.ts \
  e2e/dashboard.spec.ts e2e/tasks-list.spec.ts e2e/responsive.spec.ts
pnpm exec playwright test --project=runway-public-desktop \
  e2e/financial-cushion.spec.ts
```
