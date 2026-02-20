# Feature Research: Codebase Hardening

**Domain:** Codebase hardening for a production habit tracking web app (Next.js 16 + Supabase)
**Researched:** 2026-02-15
**Confidence:** HIGH

This document maps the 20 identified codebase concerns into table stakes, differentiators, and anti-features for a hardening milestone. The ordering rationale follows industry consensus: security vulnerabilities first, then correctness bugs, then validation/type safety, then performance, then code quality, then test coverage.

## Feature Landscape

### Table Stakes (Must Fix -- Users or System Are at Risk)

These are non-negotiable fixes. Leaving any of these unfixed means users see wrong data, the API accepts bad input, or errors are silently lost.

| # | Fix | Category | Why Must-Fix | Complexity | Files Affected |
|---|-----|----------|--------------|------------|----------------|
| T1 | Wire Zod schemas into all API routes | Security + Validation | API routes perform manual validation that diverges from Zod schemas. No length limits server-side (name: 100, description: 500). Prototype pollution possible via unvalidated body properties. Zod schemas already exist -- they just need wiring. | MEDIUM | `app/api/habits/route.ts`, `app/api/habits/[id]/route.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/profile/route.ts` |
| T2 | Fix non-null assertion on `user.email!` | Security | `app/api/habits/route.ts:145` uses `user.email!` in profile auto-creation. If a user authenticates without an email (anonymous auth, edge cases), this inserts `undefined` into the database. | LOW | `app/api/habits/route.ts:145` |
| T3 | Fix `times_per_week` frequency logic | Correctness Bug | `shouldTrackOnDate()` returns `true` for every day when frequency is `times_per_week`. This inflates the denominator in `computePerHabitRates()`, making completion percentages wrong. A user completing a "3x/week" habit 3 of 7 days sees 43% instead of 100%. Tracked as issue #98. | HIGH | `lib/habits/format.ts:88`, `lib/db/habit-logs.ts:308-311`, `lib/db/insights.ts:248`, `tests/lib/db/habit-logs.test.ts` |
| T4 | Fix `weekly` frequency hardcoded to Monday | Correctness Bug | `shouldTrackOnDate()` hardcodes `dayOfWeek === 1` for weekly habits. Users who track a weekly habit on Wednesdays only get credit on Mondays. Streaks and completion rates are wrong. | HIGH | `lib/habits/format.ts:87`, `lib/db/habit-logs.ts:308`, needs schema change (add `day` field to frequency object or derive from `created_at`) |
| T5 | Fix 2 pre-existing test failures | Correctness Bug | Tests for `times_per_week getDetailedHabitStats` fail. These are symptoms of T3 -- fixing the frequency logic fixes these tests. No independent work needed beyond T3. | LOW (covered by T3) | `tests/lib/db/habit-logs.test.ts:285-320` |
| T6 | Fix `computeMissedDays` silent error swallowing | Fragility | Dashboard route catches all errors in `computeMissedDays` and silently returns `missed_scheduled_periods: 0`. A bug in absence computation produces silently incorrect data with no observable failure. At minimum, errors must be logged. | LOW | `app/api/dashboard/route.ts:107-110` |
| T7 | Fix `WeeklyInsight` non-discriminated union type | Type Safety | `WeeklyInsight` uses a flat interface with `params: Record<string, string | number>`. Consumer code cannot narrow by `type`, requiring unsafe property access. This is a correctness risk as new insight types are added. | MEDIUM | `lib/db/insights.ts:7-18`, `components/dashboard/weekly-insight-card.tsx` |
| T8 | Fix profile auto-creation reliability | Fragility | Only `app/api/habits/route.ts` has the auto-create-profile fallback. Other routes (tasks, export, profile) do not. If the Supabase signup trigger fails, those routes hit FK constraint violations. Need to either fix the trigger or extract a shared `ensureProfile()` helper used consistently. | MEDIUM | `app/api/habits/route.ts:133-157`, potentially all API routes that insert user data |

### Differentiators (Nice to Have -- Improve Quality Beyond Baseline)

These improve the codebase but are not blocking users or creating security risk. Valuable for long-term maintainability.

| # | Fix | Category | Value Proposition | Complexity | Files Affected |
|---|-----|----------|-------------------|------------|----------------|
| D1 | Remove in-memory `statsCache` | Code Quality | On Vercel serverless, each cold start has an empty cache and concurrent workers maintain separate caches. `invalidateStatsCache` only clears the calling worker. The cache provides zero benefit in production. HTTP `Cache-Control` headers already handle client caching. Removing dead code reduces cognitive load. | LOW | `lib/cache.ts`, `app/api/habits/[id]/toggle/route.ts:52`, references in stats route |
| D2 | Remove debug `console.log` statements | Code Quality | Three `console.log` calls in `theme-switcher.tsx` leak theme state to browser devtools in production. One `console.log('callback')` fires on every OAuth callback. Noise in server logs, unprofessional in devtools. | LOW | `components/theme-switcher.tsx:39-41`, `app/auth/callback/route.ts:6` |
| D3 | Fix theme-switcher DOM workaround | Code Quality | Component manually adds/removes `dark`/`light` CSS classes on `document.documentElement`, bypassing `next-themes` normal class management. This could cause race conditions if `next-themes` updates. Should investigate root cause and remove workaround. | MEDIUM | `components/theme-switcher.tsx:26-36`, `app/layout.tsx` (ThemeProvider config) |
| D4 | Replace `getUserTasks()` with `COUNT(*)` in dashboard | Performance | Dashboard fetches ALL task rows just to get `allTasks.length` for the `total_tasks` stat. With many tasks, this transfers unnecessary data. A `COUNT(*)` query is O(1) on PostgreSQL. | LOW | `app/api/dashboard/route.ts:65`, `lib/db/tasks.ts` (add `countUserTasks` method) |
| D5 | Optimize streak calculation lookback | Performance | `calculateStreak()` always fetches 365 days of logs regardless of streak length. For a 3-day streak, this fetches 362 unnecessary rows. Could cap lookback or use incremental calculation. | MEDIUM | `lib/db/habit-logs.ts:163-224` |
| D6 | Make `HabitLogsDB` constructor require Supabase client in server contexts | Type Safety | `new HabitLogsDB()` (no argument) silently falls back to the browser client. If an API route omits the server client after a refactor, it fails silently. Making the parameter required prevents this class of bugs. | LOW | `lib/db/habit-logs.ts:36-39` |
| D7 | Add redirect path allowlist to auth callback | Security (defense-in-depth) | Current relative-URL guard (`!next.startsWith('/')`) is functional and prevents external redirects. An allowlist of valid paths adds a second layer. Not urgent since the existing guard works. | LOW | `app/auth/callback/route.ts:10-14` |
| D8 | Add unit tests for `GET /api/habits/[id]/logs` | Test Coverage | Route exists with no test file. Date range filtering, authorization, pagination, and error handling are untested. Regressions go undetected. | MEDIUM | New file: `tests/app/api/habits/[id]/logs/route.test.ts` |
| D9 | Add habit count limit enforcement (20 per user) | Completeness | Engineering plan specified 20-habit limit for V1 performance, but no enforcement exists in POST handler. Not an immediate production issue but grows linearly. | LOW | `app/api/habits/route.ts` POST handler |
| D10 | Add tests for Zod validation paths in API routes | Test Coverage | Once T1 wires Zod schemas, the new validation paths need test coverage for edge cases (oversized payloads, missing fields, malformed frequency objects). | MEDIUM | Test files for all API routes modified in T1 |

### Anti-Features (Things to Deliberately NOT Do During Hardening)

| Anti-Feature | Why Requested | Why Problematic | What to Do Instead |
|--------------|---------------|-----------------|-------------------|
| Migrate to Redis/Upstash for caching | Seems like the "proper" fix for ineffective in-memory cache | Adds a new dependency, operational complexity, and cost for a problem that does not exist (HTTP caching already works). The cache provides no measurable benefit even when it works. | Remove the cache entirely (D1). Zero dependencies, zero cost. |
| Rewrite DB layer architecture | The optional-constructor pattern in `HabitLogsDB` suggests broader architectural issues | This is a hardening milestone, not a rewrite. The constructor issue is isolated to `HabitLogsDB` and can be fixed narrowly (D6). A full DB layer rewrite risks introducing new bugs while fixing theoretical ones. | Make the constructor parameter required in `HabitLogsDB` only. Other DB classes already follow the correct pattern. |
| Add structured logging framework | `console.error` in catch blocks is not "production-grade" | Adding Winston/Pino/etc adds complexity, config, and a new dependency. The app runs on Vercel which captures `console.error` in function logs. The real problem is silent error swallowing (T6), not the logging framework. | Fix T6 (add `console.error` to the silent catch). Keep `console.error` for now. |
| Upgrade major dependencies | "While we're at it" temptation to bump Next.js, Supabase, etc. | Dependency upgrades introduce new behavior and potential breaking changes. Mixing upgrades with bug fixes makes it impossible to isolate regressions. | Defer all major upgrades to a separate milestone. |
| Add comprehensive E2E tests for all fixed bugs | Sounds thorough, but E2E tests are slow and expensive for logic bugs | The bugs being fixed (T3, T4) are in pure functions (`shouldTrackOnDate`) and API routes. Unit tests are the right level -- faster, more precise, easier to maintain. E2E tests should cover user flows, not implementation details. | Add unit tests (T5, D8, D10). Existing E2E suite covers user-visible flows. |
| Add new features alongside hardening | "Since we're touching the habit form, let's add goal tracking" | Feature work and hardening have conflicting goals. Features add new surface area; hardening reduces existing surface area. Mixing them makes it impossible to know if a regression came from the fix or the feature. | Complete all 20 hardening items. Start features in the next milestone. |

## Feature Dependencies

```
T1 (Zod validation wiring)
    |
    +---> T2 (email guard) -- T2 touches the same profile auto-creation code, merge with T8
    |
    +---> D10 (Zod validation tests) -- tests must cover the new Zod paths from T1
    |
    +---> D9 (habit count limit) -- best added inside the Zod-validated POST handler from T1

T3 (times_per_week fix)
    |
    +---> T5 (test failures) -- T5 is a symptom of T3, resolves automatically
    |
    +---> T7 (WeeklyInsight type) -- insights consume shouldTrackOnDate; fix T3 first so insight computation is correct before changing the type

T4 (weekly frequency fix)
    |
    +---> T3 -- both touch shouldTrackOnDate; fix together to avoid double-modifying the same function

T6 (error logging) -- independent, no deps
T8 (ensureProfile helper) -- depends on T2 (email guard fix, same code area)

D1 (remove cache) -- independent
D2 (remove debug logs) -- independent
D3 (theme-switcher fix) -- independent, but do after D2 (same file)
D4 (COUNT query) -- independent
D5 (streak optimization) -- depends on T3/T4 (frequency logic must be correct first)
D6 (constructor fix) -- independent
D7 (redirect allowlist) -- independent
D8 (logs route tests) -- independent
```

### Dependency Notes

- **T3 requires T4 to be done together:** Both modify `shouldTrackOnDate()` in `lib/habits/format.ts` and the copy in `lib/db/habit-logs.ts`. Doing them separately means touching the same function twice, risking merge conflicts and double-testing.
- **T5 resolves automatically with T3:** The 2 pre-existing test failures are testing `times_per_week` behavior that T3 fixes. No independent work needed.
- **D10 requires T1:** Cannot test Zod validation paths until they exist in the API routes.
- **D5 requires T3+T4:** Streak calculation optimization depends on `shouldTrackOnDate` being correct first. Optimizing an incorrect function wastes effort.
- **T2 and T8 share code area:** The `user.email!` assertion (T2) is inside the profile auto-creation block (T8). Fix both at once.
- **D3 depends on D2:** Both touch `components/theme-switcher.tsx`. Remove debug logs (D2) first, then fix the DOM workaround (D3) in the same pass.

## Prioritized Fix Order

### Phase 1: Security and Validation (P1 -- do first)

Rationale: Security gaps are the highest-risk items. Wiring Zod schemas (T1) is also the single highest-leverage fix because it resolves the security concern (no server-side length limits), the code quality concern (parallel validation paths), and enables D10 (validation tests) later.

- [x] **T1** -- Wire Zod schemas into all API routes (removes hand-rolled validators, adds length limits)
- [x] **T2** -- Fix `user.email!` non-null assertion (folded into T8)
- [x] **T8** -- Fix profile auto-creation (extract `ensureProfile()` helper, fix email guard)
- [x] **D7** -- Add redirect path allowlist to auth callback (quick, while touching auth code)

### Phase 2: Correctness Bugs (P1 -- do second)

Rationale: Users see wrong data. This is the most user-visible problem. Both frequency bugs touch the same function, so they must be done together.

- [x] **T3** -- Fix `times_per_week` frequency logic (resolves issue #98)
- [x] **T4** -- Fix `weekly` frequency hardcoded to Monday
- [x] **T5** -- Fix 2 pre-existing test failures (resolved by T3)
- [x] **T7** -- Fix `WeeklyInsight` discriminated union type (insights consume fixed frequency logic)

### Phase 3: Fragility and Code Quality (P2 -- do third)

Rationale: These do not cause user-visible bugs but make the system unreliable or harder to debug. Low complexity, high leverage for maintainability.

- [x] **T6** -- Add error logging to `computeMissedDays` catch block
- [x] **D1** -- Remove in-memory `statsCache` (dead code on serverless)
- [x] **D2** -- Remove debug `console.log` statements
- [x] **D3** -- Fix theme-switcher DOM workaround
- [x] **D6** -- Make `HabitLogsDB` constructor require Supabase client

### Phase 4: Performance (P2 -- do fourth)

Rationale: Performance fixes depend on correctness fixes being done first (D5 depends on T3+T4). These are optimizations, not bugs -- users are not blocked.

- [x] **D4** -- Replace `getUserTasks()` with `COUNT(*)` query in dashboard
- [x] **D5** -- Optimize streak calculation lookback window

### Phase 5: Test Coverage (P3 -- do last)

Rationale: Tests validate all the fixes above. Writing tests last ensures they cover the final corrected behavior, not intermediate states. D10 specifically requires T1 to be complete.

- [x] **D8** -- Add unit tests for `GET /api/habits/[id]/logs` route
- [x] **D9** -- Add habit count limit enforcement (20 per user)
- [x] **D10** -- Add tests for Zod validation paths in API routes

## Feature Prioritization Matrix

| # | Fix | User Value | Implementation Cost | Risk if Skipped | Priority |
|---|-----|------------|---------------------|-----------------|----------|
| T1 | Zod validation wiring | HIGH | MEDIUM | HIGH (security) | P1 |
| T2 | Email guard | MEDIUM | LOW | MEDIUM (edge case crash) | P1 |
| T3 | times_per_week fix | HIGH | HIGH | HIGH (wrong data) | P1 |
| T4 | weekly frequency fix | HIGH | HIGH | HIGH (wrong data) | P1 |
| T5 | Test failures fix | LOW | LOW | LOW (symptom of T3) | P1 |
| T6 | Error logging | MEDIUM | LOW | MEDIUM (silent bugs) | P2 |
| T7 | WeeklyInsight type | MEDIUM | MEDIUM | MEDIUM (type safety) | P1 |
| T8 | Profile reliability | MEDIUM | MEDIUM | MEDIUM (FK violations) | P1 |
| D1 | Remove cache | LOW | LOW | LOW (dead code) | P2 |
| D2 | Remove debug logs | LOW | LOW | LOW (noise) | P2 |
| D3 | Theme-switcher fix | LOW | MEDIUM | LOW (race condition risk) | P2 |
| D4 | COUNT query | MEDIUM | LOW | LOW (perf at scale) | P2 |
| D5 | Streak optimization | MEDIUM | MEDIUM | LOW (perf at scale) | P2 |
| D6 | Constructor fix | LOW | LOW | LOW (refactor safety) | P2 |
| D7 | Redirect allowlist | LOW | LOW | LOW (defense-in-depth) | P2 |
| D8 | Logs route tests | MEDIUM | MEDIUM | MEDIUM (untested route) | P3 |
| D9 | Habit count limit | LOW | LOW | LOW (future perf) | P3 |
| D10 | Validation tests | MEDIUM | MEDIUM | MEDIUM (coverage gap) | P3 |

**Priority key:**
- P1: Must fix -- users see wrong data or system is at security risk
- P2: Should fix -- improves reliability, performance, or maintainability
- P3: Nice to have -- test coverage and limits

## Sources

- Codebase audit: `/home/xingdi/code/betterr_me/.planning/codebase/CONCERNS.md` (2026-02-15)
- Project definition: `/home/xingdi/code/betterr_me/.planning/PROJECT.md` (2026-02-15)
- Architecture analysis: `/home/xingdi/code/betterr_me/.planning/codebase/ARCHITECTURE.md` (2026-02-15)
- Testing patterns: `/home/xingdi/code/betterr_me/.planning/codebase/TESTING.md` (2026-02-15)
- Source code inspection: `lib/habits/format.ts`, `lib/cache.ts`, `lib/validations/habit.ts`, `app/api/habits/route.ts`, `app/api/tasks/route.ts`, `app/api/dashboard/route.ts`, `lib/db/habit-logs.ts`, `lib/db/insights.ts`, `components/theme-switcher.tsx`, `app/auth/callback/route.ts`
- Industry consensus on remediation order: [Atlassian Technical Debt Guide](https://www.atlassian.com/agile/software-development/technical-debt), [SEI/CMU Technical Debt Recommendations](https://www.sei.cmu.edu/blog/5-recommendations-to-help-your-organization-manage-technical-debt/), [Code Hardening in CI/CD](https://www.appsecengineer.com/blog/the-hard-truth-about-code-hardening-in-ci-cd)

---
*Feature research for: BetterR.Me Codebase Hardening*
*Researched: 2026-02-15*
