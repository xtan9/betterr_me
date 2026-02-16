# Roadmap: BetterR.Me Codebase Hardening

## Overview

This milestone hardens the existing BetterR.Me codebase by fixing correctness bugs that show users wrong data, wiring existing Zod schemas into API routes for proper validation, cleaning up dead code and fragile patterns, optimizing performance bottlenecks, and backfilling test coverage. The work follows dependency order: correctness first (users see wrong stats), then security (API boundaries), then cleanup (maintainability), then performance (depends on correct logic), then tests (validate everything).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Frequency Correctness** - Fix shouldTrackOnDate for times_per_week and weekly frequencies, unify duplicate implementations, fix all related tests (completed 2026-02-16)
- [ ] **Phase 2: Security and Validation** - Wire Zod schemas into all API routes, harden profile auto-creation, add auth redirect allowlist, enforce habit count limit
- [ ] **Phase 3: Code Quality** - Remove dead cache, clean up debug logs, fix theme-switcher, require Supabase client in constructors, add error logging
- [ ] **Phase 4: Performance** - Replace full task fetch with COUNT(*) query, cap streak calculation lookback window
- [ ] **Phase 5: Test Coverage** - Add unit tests for habit logs route, Zod validation paths, habit count limit, and verify all frequency tests reflect correct behavior

## Phase Details

### Phase 1: Frequency Correctness
**Goal**: Users see accurate completion percentages and streak counts for all habit frequency types
**Depends on**: Nothing (first phase)
**Requirements**: CORR-01, CORR-02, CORR-05, CORR-06, CORR-07, CORR-08
**Success Criteria** (what must be TRUE):
  1. A user with a times_per_week habit (e.g., 3x/week) who completes it 3 times in a week sees 100% completion rate for that week, not ~43%
  2. A weekly habit is satisfied by any completion that week — not hardcoded to Monday
  3. All tests in habit-logs.test.ts pass, including the 2 previously failing tests (issue #98)
  4. Only one copy of shouldTrackOnDate exists in the codebase (in lib/habits/format.ts), and all consumers import from there
  5. WeeklyInsight type uses discriminated union for type-safe params access
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Fix shouldTrackOnDate, deduplicate, update all consumer modules and tests
- [x] 01-02-PLAN.md — Replace WeeklyInsight flat type with discriminated union

### Phase 2: Security and Validation
**Goal**: Every API route validates input with Zod schemas, profile creation is reliable, and auth redirect is hardened
**Depends on**: Phase 1
**Requirements**: SECV-01, SECV-02, SECV-03, SECV-04, SECV-05, SECV-06, SECV-07, SECV-08
**Success Criteria** (what must be TRUE):
  1. Sending a POST/PATCH request with an oversized name (>100 chars) or description (>500 chars) to any API route returns a 400 validation error
  2. Sending a PATCH request with only a subset of fields succeeds (partial update via .partial() Zod schema)
  3. A user signing up via OAuth without an email address does not crash profile auto-creation
  4. Attempting to create a 21st habit returns a 400 error with a clear message about the 20-habit limit
  5. Auth callback with an external or unexpected redirect path falls back to a safe default route
**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md — Create shared infrastructure: validation helper, update schemas, ensureProfile, redirect allowlist, constants
- [ ] 02-02-PLAN.md — Wire Zod validation into all 6 API routes, add ensureProfile and habit limit, update tests
- [ ] 02-03-PLAN.md — Harden auth redirect paths and fix handle_new_user trigger

### Phase 3: Code Quality
**Goal**: Dead code and fragile patterns are removed so the codebase is maintainable and debuggable
**Depends on**: Phase 2
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06
**Success Criteria** (what must be TRUE):
  1. No console.log statements exist in theme-switcher.tsx or auth/callback/route.ts
  2. The file lib/cache.ts does not exist and no imports reference it anywhere in the codebase
  3. Theme switching between light and dark mode works correctly without any manual DOM class manipulation in theme-switcher.tsx
  4. Instantiating HabitLogsDB without a Supabase client argument produces a TypeScript compilation error
  5. When computeMissedDays encounters an error, the dashboard response includes a _warnings array and the error is logged
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Create logger module, fix theme-switcher DOM workaround, harden DB constructors
- [ ] 03-02-PLAN.md — Remove cache module, add _warnings to dashboard, convert all server-side console calls to logger

### Phase 4: Performance
**Goal**: Dashboard and stats queries are optimized to avoid unnecessary data fetching
**Depends on**: Phase 1 (correctness fixes must be complete before optimizing streak logic)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. The dashboard API route uses a COUNT(*) query for task count, not getUserTasks() that fetches all rows
  2. Streak calculation for a habit with a 5-day streak does not query 365 days of logs — lookback is capped relative to current streak length
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Replace getUserTasks count calls with getTaskCount HEAD queries in dashboard route and SSR page
- [ ] 04-02-PLAN.md — Refactor calculateStreak to use adaptive lookback window (30->60->120->240->365)

### Phase 5: Test Coverage
**Goal**: All fixes from prior phases are validated by tests, and previously untested API routes have coverage
**Depends on**: Phase 2 (Zod wiring must be complete to test validation paths), Phase 1 (frequency fixes must be complete)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Unit tests exist for GET /api/habits/[id]/logs covering date range filtering, authentication, pagination, and error cases
  2. Unit tests verify that API routes reject invalid input (wrong types, missing required fields, oversized strings) with appropriate Zod error responses
  3. A unit test confirms that creating a 21st habit is rejected by the API
  4. All frequency-related tests assert correct behavior (times_per_week uses weekly-group evaluation, weekly uses user-chosen day)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Frequency Correctness | 2/2 | Complete | 2026-02-16 |
| 2. Security and Validation | 0/3 | Not started | - |
| 3. Code Quality | 0/2 | Not started | - |
| 4. Performance | 0/2 | Not started | - |
| 5. Test Coverage | 0/TBD | Not started | - |
