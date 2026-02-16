# Pitfalls Research

**Domain:** Codebase hardening for a production Next.js 16 + Supabase habit tracking app
**Researched:** 2026-02-15
**Confidence:** HIGH (pitfalls derived from direct codebase analysis + verified external patterns)

## Critical Pitfalls

### Pitfall 1: Frequency Logic Fix Breaks Existing Habit Stats Retroactively

**What goes wrong:**
Fixing `shouldTrackOnDate()` for `times_per_week` (currently returns `true` every day) changes the denominator in every calculation that uses it. Three separate consumers rely on this function with its current behavior: `lib/db/insights.ts:248` (weekly insights), `lib/db/habit-logs.ts:295` (streak calculation via private copy), and `lib/habits/absence.ts:74` (dashboard missed-days). Fixing the shared `shouldTrackOnDate` in `lib/habits/format.ts` immediately changes behavior in insights and absence, but the private copy in `habit-logs.ts` stays broken until separately fixed. The result: two different definitions of "scheduled day" coexist during partial fixes, producing internally contradictory stats.

Additionally, 8 existing tests explicitly assert the current (incorrect) behavior:
- `tests/lib/habits/format.test.ts:123-125` asserts `shouldTrackOnDate` returns `true` for `times_per_week` every day
- `tests/lib/habits/absence.test.ts:143-157` asserts `times_per_week` treats every day as scheduled
- `tests/lib/db/habit-logs.test.ts:285-320` has 2 known failing tests under `times_per_week` describe block

**Why it happens:**
The function `shouldTrackOnDate` was written with a simplification for `times_per_week`: "track daily but evaluate weekly." This is conceptually correct for the toggle UI (let users mark any day) but wrong for stats (makes 3x/week look like daily with 43% completion instead of 100%). The simplification leaked across boundaries.

**How to avoid:**
1. Fix all three consumers atomically in a single phase: `lib/habits/format.ts`, `lib/db/habit-logs.ts` (remove private copy, import shared), and verify `lib/db/insights.ts` and `lib/habits/absence.ts` behavior.
2. Update all 8 tests simultaneously. Do not fix the function then discover test failures later.
3. For `times_per_week`, `shouldTrackOnDate` should continue returning `true` (users can mark any day). The fix belongs in the *callers* that count scheduled days: `computePerHabitRates`, `computePerDayRates`, and `getScheduledDays` in `habits.ts:196-215` need `times_per_week`-specific branches (similar to what `getDetailedHabitStats` in `habit-logs.ts:402-415` already implements correctly).
4. Write a characterization test that captures expected completion rates for a 3x/week habit with 3 completions across a 7-day window, asserting ~100% (not ~43%). Run this test first to confirm it fails, then implement the fix.

**Warning signs:**
- Weekly insights show different completion rates than the stats page for the same `times_per_week` habit
- `computeMissedDays` for `times_per_week` shows 4+ missed days when a user completed 3 of their required 3
- Tests pass individually but integration behavior is inconsistent

**Phase to address:**
Must be the first fix in the hardening milestone. All other stats-related work (streak optimization, cache removal) depends on the frequency logic being correct.

---

### Pitfall 2: Database Migration for Weekly Frequency Day Field Corrupts Existing Habits

**What goes wrong:**
The `weekly` frequency type is stored as `{"type": "weekly"}` in a JSONB column. Adding a `day` field requires a migration that updates all existing rows: `UPDATE habits SET frequency = frequency || '{"day": 1}'::jsonb WHERE frequency->>'type' = 'weekly'`. If this migration is written incorrectly or rolled back partially:
- Existing habits could lose their frequency data if the JSONB update overwrites the entire column
- The TypeScript `HabitFrequency` discriminated union type (`{ type: 'weekly' }`) would need to become `{ type: 'weekly'; day?: number }` or `{ type: 'weekly'; day: number }`, and this ripples through Zod schemas, API validation (`isValidFrequency`), and the format functions
- If `day` is required in TypeScript but missing in the DB for not-yet-migrated rows, runtime crashes occur
- Supabase does not support transactional DDL + DML in all migration runners, so a failed migration could leave the database in an inconsistent state

**Why it happens:**
JSONB columns have no schema enforcement by default. TypeScript types and Zod schemas provide compile-time safety but not runtime guarantees about what is actually stored in the database. The gap between "what TypeScript expects" and "what the DB contains" is the failure mode.

**How to avoid:**
1. Make `day` optional in TypeScript: `{ type: 'weekly'; day?: number }`. Default to `1` (Monday) in code when absent: `const trackDay = frequency.day ?? 1`.
2. Write the migration as a pure JSONB merge: `frequency || '{"day": 1}'::jsonb` -- this preserves existing fields.
3. Add a `pg_jsonschema` CHECK constraint (or a PostgreSQL trigger) that validates the `day` field is 0-6 when `frequency->>'type' = 'weekly'`.
4. Test the migration against a copy of production data before running it on production.
5. Update the Zod schema to accept both `{ type: 'weekly' }` (backwards compat) and `{ type: 'weekly', day: 0-6 }`:
   ```ts
   z.object({ type: z.literal("weekly"), day: z.number().min(0).max(6).optional() })
   ```
6. Update both `isValidFrequency` functions (in `app/api/habits/route.ts` and `app/api/habits/[id]/route.ts`) to accept the optional `day` field -- or better yet, replace them with Zod as planned.

**Warning signs:**
- `shouldTrackOnDate` returns different results for habits created before vs after the migration
- API returns 400 when editing old habits that lack the `day` field
- Streak calculation breaks for pre-migration weekly habits

**Phase to address:**
Implement after Zod wiring (so validation is centralized) but before or alongside the `shouldTrackOnDate` fix for `weekly`. The migration must run before the code that reads `frequency.day` is deployed.

---

### Pitfall 3: Removing In-Memory Cache Without Verifying HTTP Caching Is Sufficient

**What goes wrong:**
The `statsCache` in `lib/cache.ts` is ineffective on Vercel serverless, but removing it is not zero-risk. The stats route (`app/api/habits/[id]/stats/route.ts`) currently sets `Cache-Control: private, max-age=300` AND uses the in-memory cache. If you remove the server cache, every stats request hits the database. The HTTP `Cache-Control` header only works if:
- The client (browser or SWR) respects it
- No intermediate CDN strips `private` headers
- SWR's `revalidate` interval does not override the cache header

Additionally, `invalidateStatsCache()` is called in `app/api/habits/[id]/route.ts:153` and `app/api/habits/[id]/toggle/route.ts:52`. After removing the cache, these calls become no-ops importing from a module that no longer exports them. Every import site must be updated, and every test that mocks or references `invalidateStatsCache` must be updated.

**Why it happens:**
Developers assume "remove the cache" is a pure deletion. In reality, it is a behavior change: response latency increases, import references break, and test mocks fail.

**How to avoid:**
1. Grep for all imports of `cache.ts` before removing: `invalidateStatsCache` (2 call sites), `invalidateUserStatsCache` (check for usage), `statsCache` (1 call site), `getStatsCacheKey` (1 call site).
2. Remove imports and function calls at the same time as removing the module.
3. Verify that SWR on the client uses `keepPreviousData: true` and `revalidateOnFocus` (or similar) to prevent redundant fetches.
4. Confirm the HTTP `Cache-Control: private, max-age=300` header is preserved in the stats route after the cache removal -- this is the real caching mechanism.
5. Consider keeping `X-Cache: MISS` header (always) for observability, or remove it to simplify.

**Warning signs:**
- Build fails with "Cannot find module '@/lib/cache'" after partial removal
- Stats page feels slower after deployment (expected but should be measured)
- Dashboard fires stats requests on every tab switch without any caching

**Phase to address:**
Implement as a standalone change, after frequency logic fixes (since the cache caches incorrect data when frequency logic is wrong). Low risk but requires careful import cleanup.

---

### Pitfall 4: Zod Schema Wiring Creates Two Incompatible Validation Paths During Transition

**What goes wrong:**
The plan is to replace hand-rolled `isValidFrequency()` with `habitFormSchema.safeParse()`. But the existing Zod schema (`lib/validations/habit.ts`) is designed for the *form* (client-side), not the API. Key differences:
- The form schema requires `name`, `frequency`, and `category` (as `nullable`). The PATCH route should accept partial updates -- only the fields being changed.
- The form schema uses `z.discriminatedUnion("type", [...])` for frequency. The API's `isValidFrequency` does the same check but also accepts the raw JSON body (not form-encoded data).
- The form schema has `description: z.string().max(500).optional().nullable()`. The API currently has no length limit on description.

If you naively use `habitFormSchema.safeParse(body)` in the PATCH route, every partial update will fail because `name` and `frequency` are required in the form schema.

**Why it happens:**
Form validation schemas and API validation schemas have different requirements. Forms always submit complete data; API PATCH routes submit partial data. Using one schema for both without `.partial()` breaks PATCH.

**How to avoid:**
1. Create two derived schemas from the base:
   ```ts
   // POST: full validation (same as form)
   export const habitCreateSchema = habitFormSchema;

   // PATCH: partial validation
   export const habitUpdateSchema = habitFormSchema.partial();
   ```
2. In the PATCH handler, use `habitUpdateSchema.safeParse(body)`, which makes all fields optional.
3. After parsing, check `Object.keys(result.data).length > 0` to ensure at least one field was provided.
4. Do NOT remove the hand-rolled `isValidFrequency` until the Zod schema is verified to cover all its edge cases (e.g., `count` must be exactly 2 or 3, `days` array must be non-empty for `custom`).
5. Add the `day` field for `weekly` frequency to the Zod schema at the same time (to avoid updating the schema twice).

**Warning signs:**
- PATCH requests return 400 "Name is required" when only updating description
- POST requests accept descriptions longer than 500 characters (if Zod schema is not applied to POST)
- Tests for the PATCH route that send `{ name: "new name" }` (without frequency) start failing

**Phase to address:**
Wire Zod schemas after the frequency type changes (weekly `day` field addition) to avoid touching the schema twice. Update tests simultaneously.

---

### Pitfall 5: Tests Asserting Current (Incorrect) Behavior Block Bug Fixes

**What goes wrong:**
Multiple test files assert the current incorrect behavior as "correct":
- `tests/lib/habits/format.test.ts:117-121`: "weekly tracks only Monday" -- this test will need to change when weekly gets a configurable day
- `tests/lib/habits/format.test.ts:123-125`: "times_per_week tracks every day" -- this is the root cause behavior being fixed
- `tests/lib/habits/absence.test.ts:143-157`: "treats every day as scheduled for times_per_week frequency" -- this test explicitly documents the incorrect behavior
- `tests/lib/db/habit-logs.test.ts` has 2 known failing tests that are acknowledged but not fixed

Developers fixing the bug will run `pnpm test:run`, see 5+ test failures, and cannot tell which failures are expected (from the fix) vs unexpected (regressions). This slows progress and creates risk of accidentally "fixing" a test by making it pass with wrong logic.

**Why it happens:**
Tests were written to match implementation, not specification. When the implementation is wrong, the tests document the wrong behavior. This is a common trap in legacy codebases.

**How to avoid:**
1. Before changing any production code, update the test descriptions to document why they will change:
   ```ts
   it.todo('times_per_week should NOT treat every day as scheduled (fix coming in issue #98)');
   ```
2. Write the *correct* tests first (red), then fix the production code (green). This is the standard TDD approach for bug fixes.
3. For `shouldTrackOnDate`, the fix path depends on the decision: if `shouldTrackOnDate` continues returning `true` for `times_per_week` (so the toggle UI works), then the format test is actually correct and should not change. The bug is in the *callers* that use it for stats calculation.
4. For `weekly`, the test "weekly tracks only Monday" will need to change to "weekly tracks the configured day, defaulting to Monday."
5. Keep a running list of test files that need updating with each fix. Update tests atomically with production code -- never commit a test update without the corresponding fix, and vice versa.

**Warning signs:**
- `pnpm test:run` shows failures that nobody can explain
- A developer "fixes" a test by reverting it to the old assertion
- Coverage drops because tests are deleted instead of updated

**Phase to address:**
Test updates must happen in lockstep with each production fix. Not a separate phase -- it is part of every fix phase.

---

### Pitfall 6: next-themes Manual DOM Workaround Masks a Configuration Bug

**What goes wrong:**
The `theme-switcher.tsx` component (lines 26-36) manually adds/removes `dark`/`light` CSS classes on `document.documentElement`. This fights against `next-themes`, which is configured with `attribute="class"` in `app/layout.tsx:54`. If you remove the workaround without fixing the root cause, theme switching breaks in production. If you leave the workaround, it creates a race condition: both `next-themes`' internal script and the component's `useEffect` modify the same DOM classes.

The root cause is likely one of:
- `suppressHydrationWarning` on the `<html>` tag works, but `next-themes` needs `disableTransitionOnChange` to avoid FOUC
- The `storageKey="betterr-theme"` conflicts with `next-themes`' default behavior
- `next-themes` v0.4+ changed its class application timing, and the current version installed may have a known issue with React 19 / Next.js 15+

There are also 3 `console.log` statements (lines 39-41) that leak internal state to browser devtools in production.

**Why it happens:**
When `next-themes` did not immediately apply the correct class on mount, the developer added a manual fix instead of diagnosing the configuration. This is a common pattern: workaround first, investigation deferred.

**How to avoid:**
1. First, check the installed `next-themes` version: `pnpm list next-themes`. Verify against the package's GitHub issues for known React 19 / Next.js 15 issues.
2. Test in a minimal reproduction: create a test page with just `ThemeProvider` + `useTheme` + no manual DOM manipulation. If the class applies correctly, the workaround is unnecessary and can be removed.
3. If the class does NOT apply correctly, the fix is in `ThemeProvider` configuration, not in the component. Check that:
   - `attribute="class"` is set (it is, in `layout.tsx:54`)
   - `enableSystem` is set (it is)
   - `disableTransitionOnChange` is considered for smooth switching
4. Remove the `console.log` statements regardless of the workaround decision.
5. After removing the workaround, run Playwright E2E tests (specifically visual regression tests) to verify theme switching works correctly.

**Warning signs:**
- Theme flickers on page load (FOUC)
- `document.documentElement.className` contains both `dark` and `light` simultaneously
- Browser console shows theme debug logs in production

**Phase to address:**
Implement as an isolated fix. Low dependency on other changes. The console.log removal can be done first as a trivial sub-task.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Duplicated `shouldTrackOnDate` (format.ts + habit-logs.ts private method) | Self-contained class, no external dependency | Two copies diverge: format.ts is used by 5 callers, habit-logs.ts has its own copy with identical logic. Fixing one does not fix the other. | Never -- deduplicate now |
| Hand-rolled `isValidFrequency` in 2 API routes instead of Zod | Quick to write, no schema import needed | Two validation paths diverge from Zod; edge cases (like new `day` field) must be added in 3 places (Zod + 2 validators) | Only acceptable in early MVP before schemas exist |
| `user.email!` non-null assertion in profile auto-creation | Avoids null-check boilerplate | Crashes silently if a Supabase auth provider does not provide email | Never in production code |
| Fetching all tasks (`getUserTasks`) to get a count | Works with small datasets | Linear memory growth; fetches full row objects when only count is needed | Acceptable below 100 tasks/user, unacceptable at scale |
| In-memory cache for serverless functions | Works in dev, provides nice `X-Cache` header | Zero benefit in production (each Lambda has its own cache instance); false confidence in caching | Never on serverless |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase JSONB | Adding a field to the TypeScript type without a migration; old rows lack the field | Always add migration first, make new fields optional in TypeScript, provide defaults in code |
| Supabase RLS | Forgetting to add RLS policies when adding new tables or columns | Run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in every create-table migration |
| next-themes + SSR | Accessing `resolvedTheme` during server render causes hydration mismatch | Use `mounted` guard pattern: `if (!mounted) return null` before rendering theme-dependent UI |
| SWR + date-based keys | Not using `keepPreviousData: true` causes flash of empty state at midnight | Always set `keepPreviousData: true` when SWR key contains a date |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 365-day log fetch on every toggle | Toggle response time increases with habit age | Cap lookback to `current_streak + buffer` days; skip if streak is 0 | Noticeable above 3 months of daily logging |
| Dashboard fetches ALL tasks for count | Dashboard API response grows with total task count | Add `countTasks(userId)` method using `SELECT count(*) ... head: true` | Noticeable above 200 tasks per user |
| N+1 `computeMissedDays` in dashboard | Dashboard enrichment loops per habit, each doing date iteration | Already mitigated by bulk `getAllUserLogs`; in-memory iteration is O(habits * 30 days), acceptable | Not a problem below 50 habits |
| JSONB frequency column without index | Queries filtering by `frequency->>'type'` do full table scan | Add GIN index on `frequency` column if filtering by type becomes common | Not a problem below 10K habits total |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No server-side string length validation | A malicious client can POST a 10MB habit description, filling the database | Wire Zod schemas (max 100 chars name, max 500 chars description) into API route handlers |
| `user.email!` non-null assertion | Crashes the profile creation flow if auth provider does not supply email; error message may leak internal details | Replace with `user.email ?? ''` and add explicit guard |
| `console.log` of theme state in production | Leaks internal state (theme, resolved theme, HTML classes) to browser devtools | Remove the 3 `console.log` calls in `theme-switcher.tsx:39-41` |
| `computeMissedDays` catch block silently returns `{missed: 0, streak: 0}` | A bug in absence calculation produces invisibly wrong data; users see "no missed days" when they actually missed many | Log errors with `console.error` (already done) but also consider a monitoring flag or metric |

## UX Pitfalls

Common user experience mistakes during hardening.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Changing `weekly` frequency from Monday to creation-day retroactively | Users with existing Monday habits suddenly see their streak reset because the tracking day changed | Default new `day` field to Monday (1) for existing habits; only let users choose a day for new habits or via explicit edit |
| Fixing `times_per_week` stats without explaining the change | Users see their completion rate jump from ~43% to ~100% overnight, causing confusion | Consider a one-time UI notification or changelog entry explaining the stats calculation improvement |
| Removing the cache increases response latency | Stats page loads noticeably slower after cache removal (previously served from memory on warm instances) | Ensure HTTP `Cache-Control` headers are correctly set so the browser caches responses for 5 minutes |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **`shouldTrackOnDate` fix:** Often only fixes the shared copy in `format.ts` -- verify the private copy in `habit-logs.ts:295` is also fixed (or removed and replaced with import)
- [ ] **Zod wiring:** Often only applied to POST -- verify PATCH routes use `.partial()` schema and still reject empty updates
- [ ] **Cache removal:** Often only deletes `lib/cache.ts` -- verify all 4 import sites are cleaned up and tests updated
- [ ] **Weekly day field migration:** Often only adds the migration -- verify the TypeScript type, Zod schema, API validator, `shouldTrackOnDate`, and `formatFrequency` are all updated
- [ ] **Theme-switcher fix:** Often only removes the `console.log` -- verify the manual DOM manipulation is also removed and theme switching still works
- [ ] **Test updates:** Often marked "done" after fixing format tests -- verify absence tests, habit-logs tests, API route tests, and insight tests are also updated
- [ ] **i18n:** Any new user-facing string (e.g., day picker for weekly habits) must exist in all 3 locale files: `en.json`, `zh.json`, `zh-TW.json`

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Frequency fix breaks existing stats | MEDIUM | Revert the `shouldTrackOnDate` change; redeploy; re-plan the fix with callers updated simultaneously |
| Migration corrupts JSONB frequency data | HIGH | Restore from Supabase point-in-time recovery; fix the migration SQL; re-run. Data loss is bounded to changes since last backup |
| Zod schema rejects valid PATCH requests | LOW | Hot-fix by using `.partial()` on the schema; deploy within minutes |
| Cache removal causes excessive DB load | LOW | Re-add `Cache-Control` headers if missing; SWR client-side cache handles most cases; add the module back temporarily if needed |
| Theme switching breaks after workaround removal | LOW | Re-add the workaround temporarily; file issue against next-themes; investigate root cause async |
| Tests fail in CI after frequency logic changes | LOW | Check which tests assert old behavior; update them in the same PR; do not merge PRs with known test failures |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Frequency logic fix breaks stats (Pitfall 1) | Phase 1: Fix frequency logic + all callers + all tests atomically | `pnpm test:run` passes with 0 failures; manual verification of stats page for times_per_week habit |
| Migration corrupts JSONB data (Pitfall 2) | Phase 2: DB migration + type updates + Zod update | Run migration on staging first; verify existing habits load correctly; verify new habits can set custom day |
| Cache removal without cleanup (Pitfall 3) | Phase 3: Remove cache module + all references | `pnpm build` succeeds (no dangling imports); stats route still returns `Cache-Control` header |
| Zod partial update breakage (Pitfall 4) | Phase 2: Wire Zod after frequency type changes | PATCH request with single field succeeds; PATCH with empty body returns 400; POST with missing name returns 400 |
| Tests blocking fixes (Pitfall 5) | Every phase: update tests with each fix | `pnpm test:run` passes after each PR; no `it.skip` or `it.todo` left unresolved |
| Theme workaround masking config bug (Pitfall 6) | Phase 3: Investigate root cause, then remove workaround | E2E visual regression tests pass for light/dark/system themes; no console.log in production |

## Sources

- Direct codebase analysis: `lib/habits/format.ts`, `lib/db/habit-logs.ts`, `lib/db/insights.ts`, `lib/habits/absence.ts`, `lib/cache.ts`, `components/theme-switcher.tsx`, `app/layout.tsx`, `app/api/habits/route.ts`, `app/api/habits/[id]/route.ts`, `app/api/habits/[id]/stats/route.ts`, `app/api/habits/[id]/toggle/route.ts`, `app/api/dashboard/route.ts`, `lib/validations/habit.ts`, `lib/db/types.ts`
- Test files: `tests/lib/habits/format.test.ts`, `tests/lib/habits/absence.test.ts`, `tests/lib/db/habit-logs.test.ts`, `tests/components/theme-switcher.test.tsx`
- Existing codebase audit: `.planning/codebase/CONCERNS.md`
- Project plan: `.planning/PROJECT.md`
- [Zod API validation patterns in Next.js](https://dub.co/blog/zod-api-validation) -- MEDIUM confidence, verified against codebase patterns
- [Zod `.partial()` for PATCH routes](https://kirandev.com/nextjs-api-routes-zod-validation) -- MEDIUM confidence
- [next-themes hydration mismatch workarounds](https://github.com/pacocoursey/next-themes) -- MEDIUM confidence
- [shadcn/ui ThemeProvider hydration error with Next.js 15](https://github.com/shadcn-ui/ui/issues/5552) -- MEDIUM confidence
- [Supabase JSONB column management](https://supabase.com/docs/guides/database/json) -- HIGH confidence (official docs)
- [Supabase database migrations best practices](https://supabase.com/docs/guides/deployment/database-migrations) -- HIGH confidence (official docs)

---
*Pitfalls research for: BetterR.Me codebase hardening milestone*
*Researched: 2026-02-15*
