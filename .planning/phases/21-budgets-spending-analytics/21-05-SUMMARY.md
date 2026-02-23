---
phase: 21-budgets-spending-analytics
plan: 05
subsystem: api, ui
tags: [budgets, spending-trends, rollover, supabase, swr, recharts]

# Dependency graph
requires:
  - phase: 21-budgets-spending-analytics
    provides: "Budget CRUD, spending analytics API, budget overview UI, rollover route"
provides:
  - "getBudgetTotalsByMonth method for efficient budget total lookups"
  - "budget_total_cents field in spending trends API response"
  - "Real budget data in SpendingTrendBar chart (no more $0 bars)"
  - "Correct rollover wiring using previousBudget.id as source"
affects: [budgets, spending-analytics, rollover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enrich API responses with cross-table lookups in a single request"

key-files:
  created: []
  modified:
    - lib/db/budgets.ts
    - app/api/money/analytics/spending/route.ts
    - lib/hooks/use-spending-analytics.ts
    - components/money/budget-overview.tsx
    - components/money/rollover-prompt.tsx

key-decisions:
  - "getBudgetTotalsByMonth uses single .in() query for efficiency instead of per-month lookups"
  - "currentMonth prop made optional on RolloverPrompt for backward compatibility"

patterns-established:
  - "Enrich trend API responses with budget totals via Map lookup pattern"

requirements-completed: [BUDG-01, BUDG-02, BUDG-03, BUDG-04, BUDG-05, BUDG-06]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 21 Plan 05: Gap Closure Summary

**Spending trend chart wired to real budget totals per month, and rollover prompt fixed to use previous month budget ID as source**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T19:56:16Z
- **Completed:** 2026-02-23T20:00:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Spending trends API now returns budget_total_cents per month alongside spending data
- SpendingTrendBar chart displays actual budget amounts (not hardcoded $0)
- Rollover prompt correctly calls the rollover endpoint with previousBudget.id as the source budget
- Removed unnecessary intermediate API call and request body from rollover confirmation

## Task Commits

Each task was committed atomically:

1. **Task 1: Enrich spending trends API with budget totals per month** - `871be70` (feat)
2. **Task 2: Fix rollover prompt wiring and clean up unused schema** - `e585973` (fix)

## Files Created/Modified
- `lib/db/budgets.ts` - Added getBudgetTotalsByMonth method for efficient budget total lookups by month
- `app/api/money/analytics/spending/route.ts` - Enriched trends response with budget_total_cents field
- `lib/hooks/use-spending-analytics.ts` - Updated MonthlyTrend interface to include budget_total_cents
- `components/money/budget-overview.tsx` - Replaced hardcoded budget: 0 with real budget data from API
- `components/money/rollover-prompt.tsx` - Fixed rollover to use previousBudget.id, removed unnecessary fetch

## Decisions Made
- Used single `.in("month", months)` query in getBudgetTotalsByMonth for efficiency (batch lookup vs N+1)
- Made currentMonth prop optional on RolloverPrompt rather than removing it (backward compatible, avoids breaking caller)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable lint warning for currentMonth**
- **Found during:** Task 2 (Fix rollover prompt wiring)
- **Issue:** Removing the intermediate fetch left `currentMonth` destructured but unused, causing lint warning
- **Fix:** Made currentMonth optional in interface, removed from destructuring
- **Files modified:** components/money/rollover-prompt.tsx
- **Verification:** pnpm lint passes with 0 errors (only pre-existing warnings)
- **Committed in:** e585973 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/lint)
**Impact on plan:** Minor cleanup required by the plan's own changes. No scope creep.

## Issues Encountered
- Pre-existing test failure in transaction-list.test.tsx (date-dependent "yesterday" test) - not caused by plan changes, unrelated to budget/rollover code

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 21 fully complete with all 5 plans executed and all BUDG requirements satisfied
- Both verification gaps (BUDG-04 trend data, BUDG-06 rollover wiring) are closed
- Ready to proceed to Phase 22 (Bills, Goals & Net Worth)

---
*Phase: 21-budgets-spending-analytics*
*Completed: 2026-02-23*

## Self-Check: PASSED
- All 5 modified files verified to exist on disk
- Commit 871be70 (Task 1) verified in git log
- Commit e585973 (Task 2) verified in git log
