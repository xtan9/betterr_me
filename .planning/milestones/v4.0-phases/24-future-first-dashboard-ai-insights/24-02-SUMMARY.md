---
phase: 24-future-first-dashboard-ai-insights
plan: 02
subsystem: api
tags: [dashboard-api, insights-api, income-detection, swr-hooks, server-aggregation, spending-pulse]

# Dependency graph
requires:
  - phase: 24-future-first-dashboard-ai-insights
    provides: Pure projection, income detection, and insight computation functions (Plan 01)
  - phase: 22-bills-goals-net-worth
    provides: RecurringBillsDB, SavingsGoalsDB, BudgetsDB for data access
  - phase: 20-transaction-management-categorization
    provides: TransactionsDB, CategoriesDB for spending data and category lookup
provides:
  - Aggregated dashboard API endpoint (balances, bills, projections, income status)
  - Lightweight money summary endpoint for main dashboard card
  - Income detection and confirmation API (GET + POST)
  - Contextual insights API with dismiss support (GET + POST)
  - useDashboardMoney SWR hook with typed response
  - useInsights SWR hook with dismiss helper
  - useMoneySummary independent SWR hook
affects: [24-03-dashboard-ui, 24-04-insight-cards, 24-05-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-side-aggregation, independent-swr-hooks, parallel-api-queries, spending-pulse-fast-path]

key-files:
  created:
    - app/api/money/dashboard/route.ts
    - app/api/money/dashboard/summary/route.ts
    - app/api/money/income/route.ts
    - app/api/money/insights/route.ts
    - lib/hooks/use-dashboard-money.ts
    - lib/hooks/use-insights.ts
    - lib/hooks/use-money-summary.ts
  modified: []

key-decisions:
  - "Dashboard endpoint aggregates all data server-side in parallel queries to avoid client waterfalls"
  - "Summary endpoint uses fast path (early return) when no accounts exist for immediate response"
  - "Income dismiss just deletes the pattern — absence of confirmation = not confirmed"
  - "Insights route computes goal projections inline from contributions (avoids circular dependency with goals route)"
  - "useMoneySummary uses shouldRetryOnError: false and revalidateOnFocus: false for independence from main dashboard"

patterns-established:
  - "Server-side aggregation: single dashboard endpoint fetches all data in parallel and computes projections server-side"
  - "Independent SWR hooks: useMoneySummary has its own key and does not block habits/tasks dashboard loading"
  - "Spending pulse fast path: summary endpoint returns has_accounts: false immediately if no accounts exist"
  - "Income detection on-demand: dashboard triggers income detection only when no confirmed patterns exist"

requirements-completed: [DASH-01, DASH-02, DASH-03, AIML-04]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 24 Plan 02: API Routes & SWR Hooks Summary

**Server-side aggregated dashboard, insights, income, and summary API routes with three typed SWR hooks for zero-waterfall data loading**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T18:09:50Z
- **Completed:** 2026-02-24T18:14:28Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created 4 API routes: dashboard (aggregated), summary (lightweight), income (detection + confirmation), insights (compute + dismiss)
- Built 3 SWR hooks with typed responses matching API contracts for Plan 03/04 UI components
- Dashboard endpoint fetches all data in parallel (accounts, bills, transactions, income patterns) and computes projections server-side
- Summary endpoint provides spending pulse with fast-path for no-accounts case

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard, summary, and income API routes** - `522788f` (feat)
2. **Task 2: Insights API route and all SWR hooks** - `e0331aa` (feat)

## Files Created/Modified
- `app/api/money/dashboard/route.ts` - Aggregated dashboard endpoint with projections, bills, income status
- `app/api/money/dashboard/summary/route.ts` - Lightweight spending pulse for main dashboard card
- `app/api/money/income/route.ts` - Income pattern detection GET and confirmation/dismiss POST
- `app/api/money/insights/route.ts` - Contextual insights computation GET and dismiss POST
- `lib/hooks/use-dashboard-money.ts` - SWR hook for full money dashboard data with keepPreviousData
- `lib/hooks/use-insights.ts` - SWR hook for insights with dismiss helper function
- `lib/hooks/use-money-summary.ts` - Independent SWR hook for main dashboard money card

## Decisions Made
- Dashboard aggregates all data server-side in parallel Promise.all to eliminate client-side waterfalls
- Summary endpoint returns early with `{ has_accounts: false }` when no accounts exist (fast path)
- Income dismiss action deletes the confirmed pattern rather than marking it; absence = not confirmed
- Insights route computes goal projections inline using contributions to avoid circular dependency with goals route
- useMoneySummary configured with shouldRetryOnError: false and 5-minute refresh for independence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in transaction-list.test.tsx ("transactions.yesterday") - unrelated to our changes, confirmed same failure exists before and after

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All API routes ready for UI component integration in Plan 03 (dashboard page) and Plan 04 (insight cards)
- SWR hooks export typed interfaces for direct consumption by React components
- useMoneySummary is fully independent for main dashboard integration without blocking other data

## Self-Check: PASSED

- All 7 created files verified on disk
- Both task commits (522788f, e0331aa) verified in git log
- pnpm lint: 0 errors (8 pre-existing warnings)
- pnpm test: 129/130 test files pass (1 pre-existing failure unrelated to changes)

---
*Phase: 24-future-first-dashboard-ai-insights*
*Completed: 2026-02-24*
