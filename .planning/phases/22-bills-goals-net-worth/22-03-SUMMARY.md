---
phase: 22-bills-goals-net-worth
plan: 03
subsystem: api
tags: [savings-goals, net-worth, manual-assets, swr, date-fns, projection, api-routes]

# Dependency graph
requires:
  - phase: 22-bills-goals-net-worth
    plan: 01
    provides: "SavingsGoalsDB, NetWorthSnapshotsDB, ManualAssetsDB, MoneyAccountsDB, Zod schemas for goals/assets"
provides:
  - "7 API routes: goals CRUD, goal contributions, net worth current + snapshots, manual assets CRUD"
  - "useGoals and useGoal SWR hooks with projection data"
  - "useNetWorth and useNetWorthHistory SWR hooks with keepPreviousData"
  - "Goal projection computation: monthly rate, projected date, green/yellow/red status colors"
  - "Net worth computation: asset/liability breakdown by account type with change indicators"
affects: [22-04-PLAN, 22-05-PLAN, 22-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Goal projection: 3-month contribution window, monthly_rate = total/months_with_data, linear extrapolation"
    - "Status color: green (on track or no deadline), yellow (projected <= deadline+30d or no projection), red (projected > deadline+30d)"
    - "Net worth: sum positive account balances + manual assets as assets, abs(negative balances) as liabilities"
    - "Snapshot period filtering: 1M/3M/6M/1Y/ALL mapped to subDays offsets"

key-files:
  created:
    - "app/api/money/goals/route.ts"
    - "app/api/money/goals/[id]/route.ts"
    - "app/api/money/goals/[id]/contributions/route.ts"
    - "app/api/money/net-worth/route.ts"
    - "app/api/money/net-worth/snapshots/route.ts"
    - "app/api/money/manual-assets/route.ts"
    - "app/api/money/manual-assets/[id]/route.ts"
    - "lib/hooks/use-goals.ts"
    - "lib/hooks/use-net-worth.ts"
  modified: []

key-decisions:
  - "Goal projection uses 3-month rolling window of contributions to calculate monthly savings rate"
  - "Status color thresholds: green (on track), yellow (within 30 days of deadline), red (>30 days past deadline)"
  - "Net worth change computed vs latest snapshot (not vs fixed period) for simplicity"
  - "Snapshot API returns formatted label field (MMM yyyy) for chart display"

patterns-established:
  - "computeProjection helper: reusable across goals list and detail routes"
  - "Period-to-days mapping pattern for timeframe-filtered queries"

requirements-completed: [GOAL-01, GOAL-02, GOAL-03, GOAL-04, GOAL-05, NTWT-01, NTWT-02, NTWT-03]

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 22 Plan 03: Goals & Net Worth API Summary

**7 API routes for savings goals with projection/status-color computation, net worth with asset/liability breakdown, and manual assets CRUD, plus 4 SWR hooks**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T21:38:18Z
- **Completed:** 2026-02-23T21:45:30Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built complete Goals API with projection logic (monthly rate from 3-month contribution window, projected completion date, green/yellow/red status colors)
- Built Net Worth API computing assets/liabilities breakdown by account type, including manual assets, with change indicators vs latest snapshot
- Built Net Worth Snapshots API with period filtering (1M/3M/6M/1Y/ALL) and formatted chart labels
- Built Manual Assets CRUD API with household-scoped ownership verification
- Created 4 SWR hooks (useGoals, useGoal, useNetWorth, useNetWorthHistory) with keepPreviousData for smooth UX

## Task Commits

Each task was committed atomically:

1. **Task 1: Create goals and net worth API routes with manual assets** - `5fa6321` (feat)
2. **Task 2: Create SWR hooks for goals and net worth** - `b53bdea` (feat)

## Files Created/Modified
- `app/api/money/goals/route.ts` - GET (list with projections) and POST (create goal with cents conversion)
- `app/api/money/goals/[id]/route.ts` - GET (detail with projection), PATCH (update), DELETE
- `app/api/money/goals/[id]/contributions/route.ts` - GET (list) and POST (add contribution)
- `app/api/money/net-worth/route.ts` - GET current net worth with asset/liability breakdown by type
- `app/api/money/net-worth/snapshots/route.ts` - GET historical snapshots with period filtering
- `app/api/money/manual-assets/route.ts` - GET (list) and POST (create)
- `app/api/money/manual-assets/[id]/route.ts` - PATCH (update) and DELETE
- `lib/hooks/use-goals.ts` - useGoals and useGoal SWR hooks with projection types
- `lib/hooks/use-net-worth.ts` - useNetWorth and useNetWorthHistory SWR hooks

## Decisions Made
- Goal projection uses a 3-month rolling window of contributions; monthly rate = total contributions / months with data (minimum 1 month). Guards against zero/negative rate by returning null projected_date.
- Status color thresholds follow user decision: green (projected <= deadline or no deadline), yellow (projected <= deadline + 30 days or can't project), red (projected > deadline + 30 days)
- Net worth change is computed vs the latest snapshot rather than a fixed period, simplifying the computation while still providing meaningful comparison data
- Snapshot API pre-formats a `label` field with "MMM yyyy" format for direct chart consumption, avoiding client-side date formatting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 API routes ready for UI consumption (Plans 04/05)
- SWR hooks typed and ready for goals page (useGoals, useGoal) and net worth page (useNetWorth, useNetWorthHistory)
- Projection computation established; can be reused in goal card/ring components
- Net worth breakdown data shape supports both summary and per-type account display
- Existing tests continue to pass (1 pre-existing failure in transaction-list.test.tsx unrelated)

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (5fa6321, b53bdea) verified in git log.

---
*Phase: 22-bills-goals-net-worth*
*Completed: 2026-02-23*
