# Codebase Concerns

**Analysis Date:** 2026-02-15

## Tech Debt

**Known Test Failures:**
- Issue: 2 pre-existing test failures in `times_per_week getDetailedHabitStats`
- Files: `tests/lib/db/habit-logs.test.ts`
- Impact: Unreliable test coverage for weekly habit statistics calculations, potential bugs may go undetected
- Fix approach: Debug the `getDetailedHabitStats` method for `times_per_week` frequency type in `lib/db/habit-logs.ts`, verify weekly grouping logic matches test expectations
- Tracked: GitHub issue #98

**Debug Logging Left in Production:**
- Issue: Debug console.log statements in theme switcher and auth callback
- Files:
  - `components/theme-switcher.tsx` (lines 39-41): Theme debugging logs
  - `app/auth/callback/route.ts` (line 6): Generic "callback" log
- Impact: Pollutes production console, potential performance overhead, leaked implementation details
- Fix approach: Remove or wrap in `if (process.env.NODE_ENV === 'development')` checks

**In-Memory Cache Not Serverless-Safe:**
- Issue: TTLCache uses in-memory Map that resets on every serverless cold start
- Files: `lib/cache.ts`
- Impact: Cache misses on every cold start in serverless environments (Vercel), reduced performance benefit
- Current mitigation: Documented in comments as "acceptable for short-lived caches"
- Fix approach: Consider Redis/Vercel KV for persistent caching, or accept current behavior as optimization-only

**Test-Only Type Assertions:**
- Issue: Extensive use of `as any` type assertions in test files to bypass TypeScript checks
- Files: Multiple test files (50+ occurrences found via grep)
  - `tests/components/settings/profile-form.test.tsx`
  - `tests/components/dashboard/tasks-today.test.tsx`
  - `tests/app/api/dashboard/route.test.ts`
  - Many others
- Impact: Tests may not catch real type mismatches, false confidence in type safety
- Fix approach: Create proper test type factories/builders instead of casting to `any`

**Inline Type Suppression:**
- Issue: One-off eslint-disable for React hooks rule
- Files: `components/theme-switcher.tsx` (line 20)
- Impact: Bypasses linter protection for state-in-effect antipattern
- Current mitigation: Comment indicates "standard hydration guard pattern"
- Fix approach: None needed if truly intentional, but review if pattern can be improved

## Known Bugs

**Large Test Suite Failures:**
- Symptoms: 48+ test failures in feature branch test suite
- Files:
  - `.worktrees/feature-ui-style-redesign/tests/components/habits/streak-counter.test.tsx` (18 failures)
  - `.worktrees/feature-ui-style-redesign/tests/components/mobile-bottom-nav.test.tsx` (9 failures)
  - `.worktrees/feature-ui-style-redesign/tests/components/habits/frequency-selector.test.tsx` (21+ failures)
  - `.worktrees/feature-ui-style-redesign/tests/app/api/export/route.test.ts` (1 failure)
- Trigger: Running `pnpm test:run` in feature branch
- Workaround: Branch may be work-in-progress, failures may be expected during development
- Fix approach: Complete feature branch work or rebase from main

## Security Considerations

**Environment Variables Exposed to Client:**
- Risk: Supabase URL and anon key available in browser bundle
- Files:
  - `lib/supabase/client.ts` (lines 5-6)
  - `lib/supabase/proxy.ts` (lines 16-17)
  - `lib/supabase/server.ts` (lines 8-9)
- Current mitigation: Supabase anon key is designed to be public, Row Level Security (RLS) enforces auth
- Recommendations: Ensure all Supabase tables have proper RLS policies, never expose service role key

**No Explicit Rate Limiting:**
- Risk: API routes have no rate limiting visible in code
- Files: All files in `app/api/`
- Current mitigation: May rely on Vercel's platform-level rate limiting
- Recommendations: Add explicit rate limiting middleware for sensitive operations (auth, exports)

**E2E Test Credentials in Environment:**
- Risk: Test account credentials must be stored in environment variables
- Files:
  - `e2e/global-setup.ts` (lines 30-31)
  - `e2e/auth.setup.ts` (lines 14-15)
  - `e2e/global-teardown.ts` (lines 17-18)
- Current mitigation: Uses separate test account, credentials not committed
- Recommendations: Document that `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` must not be production accounts

## Performance Bottlenecks

**Complex Streak Calculation:**
- Problem: Streak calculation iterates day-by-day with 365-day safety limit
- Files: `lib/db/habit-logs.ts` (lines 195-224, 229-290)
- Cause: Client-side iteration through potentially thousands of dates for long-running habits
- Improvement path: Move calculation to database with window functions or materialized view, cache results aggressively

**N+1 Query Pattern in Dashboard:**
- Problem: Dashboard fetches habits, then individual stats/milestones per habit
- Files:
  - `app/api/dashboard/route.ts` (lines 74-80): Separate fetch for logs and milestones
  - `app/dashboard/page.tsx` (line 38): Client-side milestone fetch with error handling
- Cause: Multiple round-trips to database instead of single JOIN query
- Improvement path: Use Supabase joins to fetch related data in single query, or batch requests

**Large File Stats Calculation:**
- Problem: `getDetailedHabitStats` method is 300+ lines in single file
- Files: `lib/db/habit-logs.ts` (650 lines total, method spans 200-550 approximately)
- Cause: Complex logic for different frequency types, week grouping, streak calculation all in one method
- Improvement path: Split into smaller focused methods, consider extracting streak calculator to separate class

## Fragile Areas

**Timezone Date Handling:**
- Files:
  - `lib/utils.ts` (`getLocalDateString()`)
  - `lib/db/habit-logs.ts` (manual date parsing: `const [y, m, d] = dateStr.split('-').map(Number)`)
- Why fragile: Manual string parsing and local date construction can break on edge cases (DST transitions, user timezone changes)
- Safe modification: Always use `getLocalDateString()` helper, never use `.toISOString().split('T')[0]`, add tests for DST edge cases
- Test coverage: Limited timezone edge case coverage

**Weekly Habit Grouping Logic:**
- Files: `lib/db/habit-logs.ts` (lines 228-290, 494-549)
- Why fragile: Complex week start calculation, week boundary detection, partial week handling
- Safe modification: Add comprehensive test coverage before changing, validate with multiple `week_start_day` values (0=Sunday through 6=Saturday)
- Test coverage: Known failures in this area (issue #98)

**Theme Hydration:**
- Files: `components/theme-switcher.tsx` (lines 23-43)
- Why fragile: Manual DOM class manipulation to force theme sync, workaround for hydration mismatch
- Safe modification: Understand next-themes SSR limitations, test with JavaScript disabled
- Test coverage: No automated tests for theme hydration edge cases

**SWR Cache Keys with Dates:**
- Files: Multiple hooks using SWR with date-based keys
- Why fragile: Keys must update at midnight for proper cache invalidation, requires `keepPreviousData: true` pattern
- Safe modification: Always include `keepPreviousData: true` when SWR key contains date from `getLocalDateString()`
- Test coverage: Limited coverage of midnight transitions

## Scaling Limits

**Stats Cache Size:**
- Current capacity: 1000 entries max (default in TTLCache)
- Limit: With 1000+ concurrent users each viewing stats, cache eviction starts
- Scaling path: Increase `maxSize` parameter, or switch to Redis/Vercel KV for distributed cache

**Serverless Memory for Large Habits:**
- Current capacity: No explicit limits, but day-by-day iteration in streak calc
- Limit: Habits with 2+ years of daily logs could exceed serverless memory/timeout
- Scaling path: Database-side aggregation, pagination for historical data, or streaming responses

**Test Suite Runtime:**
- Current capacity: 340 test files, 2+ minute CI runtime
- Limit: Adding more features will slow CI feedback loop
- Scaling path: Parallelize tests better, split into unit/integration/e2e stages

## Dependencies at Risk

**React 19 Canary:**
- Risk: Using React 19.0.0 which may have less stable ecosystem support
- Impact: Some third-party libraries may not fully support React 19 patterns
- Migration plan: Monitor for React 19 stability, consider pinning to 18.x LTS if issues arise

**radix-ui Unified Package:**
- Risk: Using new unified `radix-ui` package instead of individual @radix-ui/* packages
- Impact: Less community documentation, potential for breaking changes in unified package
- Migration plan: May need to switch back to individual packages if unified package is deprecated

**Supabase SSR Pattern Evolution:**
- Risk: Supabase SSR library patterns changed significantly with Next.js 15+
- Impact: Future Supabase updates may break current client pattern
- Migration plan: Stay current with @supabase/ssr updates, monitor for deprecation notices

## Missing Critical Features

**No Input Validation on Client:**
- Problem: Form validation only on server-side (Zod schemas at API boundaries)
- Blocks: Poor UX for invalid submissions, wasted API calls
- Fix approach: Add react-hook-form + Zod integration on client side (already using both libraries)

**No Offline Support:**
- Problem: App requires network connection for all operations
- Blocks: Users can't track habits without internet
- Fix approach: Add service worker, IndexedDB cache, sync queue for offline-first experience

**No Bulk Operations:**
- Problem: No way to batch-update or batch-delete habits/tasks
- Blocks: Managing large numbers of items is tedious
- Fix approach: Add select-all UI pattern, batch API endpoints

## Test Coverage Gaps

**E2E Test Data Cleanup Edge Cases:**
- What's not tested: Cleanup when E2E tests crash mid-run without teardown
- Files: `e2e/global-teardown.ts`
- Risk: Orphaned "E2E Test -" prefixed data accumulates in database
- Priority: Low - documented defensive measure, cascade delete handles most cases

**API Error Response Consistency:**
- What's not tested: Whether all API routes return consistent error shape `{ error: string }`
- Files: All files in `app/api/`
- Risk: Client error handling may break if error format varies
- Priority: Medium - add integration tests for error paths

**Accessibility Testing Coverage:**
- What's not tested: Most components lack vitest-axe automated accessibility checks
- Files: Component files in `components/`
- Risk: Accessibility regressions may ship undetected
- Priority: High - project uses vitest-axe but only `tests/accessibility/a11y.test.tsx` found
- Fix approach: Add `expect(await axe(container)).toHaveNoViolations()` to component tests

**Mobile Responsive Edge Cases:**
- What's not tested: UI at exact breakpoint widths (768px, 1024px)
- Files: Tailwind responsive classes throughout codebase
- Risk: Layout breaks at exact breakpoint boundaries
- Priority: Medium - Playwright mobile tests exist but may not cover all breakpoints
- Fix approach: Add visual regression tests at exact breakpoint widths

**Streak Calculation for Future Dates:**
- What's not tested: Behavior when system clock is set to future date
- Files: `lib/db/habit-logs.ts` (streak calculation methods)
- Risk: Undefined behavior if user logs completion for future dates
- Priority: Low - unlikely scenario, but should validate dates <= today

---

*Concerns audit: 2026-02-15*
