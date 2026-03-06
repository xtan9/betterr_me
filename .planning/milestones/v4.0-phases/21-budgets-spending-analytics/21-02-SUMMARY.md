---
phase: 21-budgets-spending-analytics
plan: 02
subsystem: api
tags: [next.js, api-routes, swr, recharts, budgets, spending-analytics, bigint-cents]

# Dependency graph
requires:
  - phase: 21-budgets-spending-analytics
    plan: 01
    provides: "BudgetsDB class with CRUD/spending/rollover, Zod validation schemas, Budget types"
  - phase: 20-transaction-management-categorization
    provides: "TransactionsDB, CategoriesDB, transaction/category tables"
provides:
  - "Budget CRUD API routes (GET list, POST create, GET detail, PUT update, DELETE)"
  - "Rollover confirmation API route"
  - "Spending analytics API route (category breakdown and monthly trends)"
  - "useBudget SWR hook for budget data fetching"
  - "useSpendingAnalytics and useSpendingTrends SWR hooks"
  - "Recharts 3.7.0 installed for chart rendering"
affects: [21-03-PLAN, 21-04-PLAN]

# Tech tracking
tech-stack:
  added: [recharts 3.7.0]
  patterns:
    - "Budget API follows money auth pattern: createClient -> getUser -> resolveHousehold"
    - "Dual-mode analytics endpoint: month query for category breakdown, type=trends for multi-month"
    - "Dollar-to-cents conversion at API boundary via toCents() before passing to DB layer"

key-files:
  created:
    - app/api/money/budgets/route.ts
    - app/api/money/budgets/[id]/route.ts
    - app/api/money/budgets/[id]/rollover/route.ts
    - app/api/money/analytics/spending/route.ts
    - lib/hooks/use-budgets.ts
    - lib/hooks/use-spending-analytics.ts
  modified:
    - package.json

key-decisions:
  - "Spending analytics uses dual-mode endpoint: month param for category breakdown, type=trends for multi-month trends"
  - "Rollover route verifies rollover_enabled on source budget before computing"
  - "Budget GET by ID looks up month first then delegates to getByMonth for full spending data"
  - "SWR hooks derive isLoading from data/error shape to avoid SWR getter-based re-render cycles"

patterns-established:
  - "Budget API routes follow existing money API pattern (createClient -> getUser -> 401 -> resolveHousehold -> DB)"
  - "Analytics endpoint enriches raw spending data with category display info via CategoriesDB"
  - "Rollover requires target budget to exist before confirmation (fail-fast validation)"

requirements-completed: [BUDG-01, BUDG-02, BUDG-05, BUDG-06]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 21 Plan 02: Budget API Routes & Hooks Summary

**Budget CRUD/rollover/analytics API routes with Recharts and SWR hooks for reactive data fetching**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T05:19:02Z
- **Completed:** 2026-02-23T05:23:47Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 4 API route files covering full budget CRUD, rollover confirmation, and spending analytics
- Installed Recharts 3.7.0 with native React 19 support for chart rendering
- Built 3 SWR hooks (useBudget, useSpendingAnalytics, useSpendingTrends) with keepPreviousData for smooth UX

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Recharts and create budget API routes** - `c549d13` (feat)
2. **Task 2: Create SWR hooks for budgets and spending analytics** - `5b6adeb` (feat)

## Files Created/Modified
- `app/api/money/budgets/route.ts` - Budget list (GET) and create (POST) with YYYY-MM query param
- `app/api/money/budgets/[id]/route.ts` - Budget detail (GET), update (PUT), delete (DELETE)
- `app/api/money/budgets/[id]/rollover/route.ts` - Rollover confirmation (POST) with enabled check
- `app/api/money/analytics/spending/route.ts` - Spending by category and monthly trends
- `lib/hooks/use-budgets.ts` - useBudget SWR hook with keepPreviousData
- `lib/hooks/use-spending-analytics.ts` - useSpendingAnalytics and useSpendingTrends SWR hooks
- `package.json` - Added recharts 3.7.0 dependency
- `pnpm-lock.yaml` - Updated lockfile with recharts and its dependencies

## Decisions Made
- **Dual-mode analytics endpoint:** Single route handles both category breakdown (month param) and monthly trends (type=trends param) to keep the API surface minimal.
- **Rollover guard:** Route checks `rollover_enabled` on source budget and rejects with 400 if disabled, preventing accidental rollover operations.
- **Budget ID lookup pattern:** GET by ID first fetches the budget's month, then delegates to `getByMonth` which includes full spending data computation -- avoids duplicating the spending enrichment logic.
- **Derived isLoading:** SWR hooks derive `isLoading` from `!data && !error` shape instead of destructuring SWR's `isLoading` flag, consistent with existing hooks (use-accounts, use-categories) to avoid getter-based re-render cycles.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All API endpoints ready for budget UI components (Plan 03)
- SWR hooks ready for integration into budget page and analytics dashboard
- Recharts available for chart components (spending breakdown, trend visualization)
- Rollover flow testable end-to-end (create source budget, create target budget, confirm rollover)

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 21-budgets-spending-analytics*
*Completed: 2026-02-23*
