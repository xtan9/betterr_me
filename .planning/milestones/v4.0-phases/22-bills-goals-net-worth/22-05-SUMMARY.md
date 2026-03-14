---
phase: 22-bills-goals-net-worth
plan: 05
subsystem: ui
tags: [savings-goals, net-worth, recharts, progress-ring, card-grid, manual-assets, react-hook-form]

# Dependency graph
requires:
  - phase: 22-bills-goals-net-worth
    plan: 03
    provides: "Goals API with projections, net worth API with breakdown, manual assets CRUD, SWR hooks"
provides:
  - "GoalCard with BudgetRing progress ring and color-coded status"
  - "GoalGrid responsive card layout with sorting and empty/loading states"
  - "GoalForm with create/edit/contribute modes using react-hook-form + zod"
  - "NetWorthChart with Recharts LineChart and 1M/3M/6M/1Y/All timeframe toggle"
  - "NetWorthSummary with change indicator (green up/red down) and assets/liabilities"
  - "NetWorthAccounts with account breakdown by type and manual assets section"
  - "ManualAssetForm dialog for property/vehicle/investment/other assets"
  - "Goals page route at /money/goals"
  - "Net worth page route at /money/net-worth"
affects: [22-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GoalCard reuses BudgetRing SVG with color override based on status_color from API"
    - "Timeframe toggle: row of small buttons with active state (bg-money-sage text-white)"
    - "Chart layout: line chart on top -> summary -> account breakdown per locked decision"
    - "Dialog modal={false} when containing Select components (Radix interaction fix)"

key-files:
  created:
    - "components/money/goal-card.tsx"
    - "components/money/goal-grid.tsx"
    - "components/money/goal-form.tsx"
    - "components/money/net-worth-chart.tsx"
    - "components/money/net-worth-summary.tsx"
    - "components/money/net-worth-accounts.tsx"
    - "components/money/manual-asset-form.tsx"
    - "app/money/goals/page.tsx"
    - "app/money/net-worth/page.tsx"
  modified: []

key-decisions:
  - "GoalCard reuses BudgetRing with status_color -> ring color mapping (green=sage, yellow=amber, red=caution)"
  - "GoalGrid sorts active goals first (by deadline, then created_at), completed at bottom"
  - "GoalForm uses modal={false} on Dialog to prevent Radix Select interaction conflicts"
  - "NetWorthChart uses custom tooltip showing net worth + assets + liabilities per snapshot"
  - "NetWorthAccounts groups connected accounts by account_type using useMemo"
  - "ManualAssetForm includes clarification text per research recommendation"

patterns-established:
  - "Status color to CSS variable mapping pattern for color-coded financial indicators"
  - "Period toggle pattern: row of buttons with active highlighting via conditional classes"

requirements-completed: [GOAL-01, GOAL-02, GOAL-03, GOAL-04, GOAL-05, NTWT-01, NTWT-02, NTWT-03]

# Metrics
duration: 8min
completed: 2026-02-23
---

# Phase 22 Plan 05: Goals & Net Worth UI Summary

**Goal card grid with BudgetRing progress visualization and projections, plus net worth dashboard with Recharts line chart, timeframe toggle, assets/liabilities summary, and manual asset management**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-23T21:49:35Z
- **Completed:** 2026-02-23T21:58:17Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built complete goals UI with card grid layout, progress rings reusing BudgetRing SVG, color-coded status (green/yellow/red), and projected completion dates
- Built goals form with three modes (create/edit/contribute), linked account selector, and react-hook-form + zod validation
- Built net worth dashboard with Recharts LineChart, period toggle (1M/3M/6M/1Y/All), custom tooltip, and optional dashed lines for assets/liabilities
- Built net worth summary showing total amount, change indicator with directional arrows, and assets/liabilities side-by-side
- Built net worth accounts breakdown grouped by account type with manual assets section and ManualAssetForm dialog

## Task Commits

Each task was committed atomically:

1. **Task 1: Create savings goals UI components and page route** - `aef86b3` (feat)
2. **Task 2: Create net worth UI components and page route** - `a6b66ec` (feat)

## Files Created/Modified
- `components/money/goal-card.tsx` - Goal card with BudgetRing progress, status colors, projection text, and action buttons
- `components/money/goal-grid.tsx` - Responsive 1/2/3-column grid with sorting, empty state, and loading skeletons
- `components/money/goal-form.tsx` - Dialog with create/edit (linked accounts) and contribute modes
- `app/money/goals/page.tsx` - Server component with i18n header wrapping GoalGrid
- `components/money/net-worth-chart.tsx` - Recharts LineChart with period toggle, custom tooltip, and empty state
- `components/money/net-worth-summary.tsx` - Total net worth, change indicator (ArrowUpRight/Down), assets/liabilities
- `components/money/net-worth-accounts.tsx` - Account breakdown by type with manual assets section
- `components/money/manual-asset-form.tsx` - Dialog for property/vehicle/investment/other manual assets
- `app/money/net-worth/page.tsx` - Server component rendering chart -> summary -> accounts

## Decisions Made
- GoalCard reuses BudgetRing component (custom SVG, ~60 lines) with color override based on API's status_color field, avoiding duplicate SVG code
- GoalGrid uses card grid layout (per locked decision) with 1-col mobile, 2-col md, 3-col lg
- GoalForm uses `modal={false}` on Dialog when containing Select components (same pattern as BudgetForm) to prevent Radix interaction conflicts
- NetWorthChart default period is 6M (most useful range for tracking trends)
- NetWorthAccounts groups accounts by account_type field, not Plaid subtype, for cleaner grouping
- ManualAssetForm includes clarification text from research: "Add assets not tracked by connected accounts"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed GoalForm referencing outer closure instead of prop**
- **Found during:** Task 1 (GoalForm)
- **Issue:** Inner GoalCreateEditDialog component referenced `allAccounts` from outer closure instead of `accounts` prop
- **Fix:** Changed reference to use the `accounts` prop passed to the inner component
- **Files modified:** `components/money/goal-form.tsx`
- **Verification:** ESLint no longer reports unused `accounts` parameter
- **Committed in:** aef86b3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor scope, essential for correctness. No scope creep.

## Issues Encountered
- i18n strings for goals and netWorth sections were already added by 22-04 plan execution, so locale file edits were no-ops (no impact, strings already present)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Goals page at /money/goals fully functional with card grid, progress rings, create/edit/contribute flows
- Net worth page at /money/net-worth fully functional with line chart, summary, account breakdown, and manual asset management
- All UI components consume SWR hooks from 22-03 (useGoals, useNetWorth, useNetWorthHistory, useAccounts)
- Phase 22 Plan 06 (tests/verification) is the final plan and can now proceed
- Existing tests pass (1 pre-existing failure in transaction-list.test.tsx unrelated)

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (aef86b3, a6b66ec) verified in git log.

---
*Phase: 22-bills-goals-net-worth*
*Completed: 2026-02-23*
