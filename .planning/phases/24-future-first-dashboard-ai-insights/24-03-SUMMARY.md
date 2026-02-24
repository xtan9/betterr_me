---
phase: 24-future-first-dashboard-ai-insights
plan: 03
subsystem: ui
tags: [dashboard-ui, hero-row, upcoming-bills, cash-flow, income-confirmation, calm-finance]

# Dependency graph
requires:
  - phase: 24-future-first-dashboard-ai-insights
    provides: Pure projection functions and income detection (Plan 01), API routes and SWR hooks (Plan 02)
  - phase: 22-bills-goals-net-worth
    provides: Recurring bills, goals, and net worth data rendered in dashboard nav links
provides:
  - Forward-looking money dashboard with three-number hero row
  - Upcoming bills list sorted by urgency (soonest first, max 7)
  - Cash flow projection with danger zone warnings
  - Income confirmation prompt for first-time deposit detection
  - MoneyDashboard orchestrator component consuming useDashboardMoney hook
  - Updated MoneyPageShell rendering dashboard instead of old nav hub
affects: [24-04-insight-cards, 24-05-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [hero-three-numbers-equal-weight, sub-component-isolation-testing, forward-looking-dashboard]

key-files:
  created:
    - components/money/dashboard-hero.tsx
    - components/money/upcoming-bills-list.tsx
    - components/money/cash-flow-projection.tsx
    - components/money/income-confirmation.tsx
    - components/money/money-dashboard.tsx
  modified:
    - components/money/money-page-shell.tsx
    - tests/components/money/money-page-shell.test.tsx

key-decisions:
  - "Hero row uses three equal-weight cards with no single dominant metric per locked design decision"
  - "Upcoming bills shows max 7 (soonest first) with view-all link to /money/bills for overflow"
  - "Cash flow projection keeps it simple: key number with trend direction, no chart per Calm Finance"
  - "Income confirmation shows top 1-2 highest confidence patterns with confirm/dismiss actions"
  - "MoneyDashboard does NOT import InsightList (Plan 04 wave-3 parallel); placeholder comment left"
  - "MoneyPageShell test updated to mock MoneyDashboard sub-component (consistent with 20-05, 22-06, 23-04 pattern)"

patterns-established:
  - "Dashboard orchestrator pattern: MoneyDashboard owns data fetching via SWR, renders sub-components"
  - "Color coding via Calm Finance tokens: money-sage for positive, money-caution for negative, neutral for expected outflows"
  - "Danger zone warning uses getDangerZoneStatus from projections.ts with money-caution background"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 24 Plan 03: Dashboard UI Summary

**Forward-looking money dashboard with three-number hero row, upcoming bills list, cash flow projection, and income confirmation prompt using Calm Finance design tokens**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T18:17:02Z
- **Completed:** 2026-02-24T18:21:26Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built 5 new dashboard UI components: hero row, upcoming bills, cash flow, income confirmation, and dashboard orchestrator
- Replaced MoneyPageShell old nav hub with MoneyDashboard for connected users
- All components use Calm Finance design tokens (money-sage, money-border, money-surface, money-caution) with no hardcoded colors
- Updated existing tests to account for component restructuring (5/5 pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard hero, upcoming bills, and cash flow projection** - `c9ec958` (feat)
2. **Task 2: Income confirmation, dashboard orchestrator, and MoneyPageShell update** - `f6b84c4` (feat)

## Files Created/Modified
- `components/money/dashboard-hero.tsx` - Three equal-weight hero numbers (available, bills, projected) with Calm Finance styling
- `components/money/upcoming-bills-list.tsx` - Soonest-first bill list with max 7 visible and view-all link
- `components/money/cash-flow-projection.tsx` - Balance trend direction with danger zone warnings
- `components/money/income-confirmation.tsx` - One-time income confirmation prompt with confirm/dismiss
- `components/money/money-dashboard.tsx` - Dashboard orchestrator using useDashboardMoney SWR hook
- `components/money/money-page-shell.tsx` - Updated to render MoneyDashboard instead of old net worth + nav links
- `tests/components/money/money-page-shell.test.tsx` - Updated tests to mock MoneyDashboard sub-component

## Decisions Made
- Hero row displays three equal-weight numbers (no single dominant metric) per locked design decision
- Upcoming bills capped at 7 visible entries sorted by due date ascending (soonest first)
- Cash flow projection uses text-based trend description rather than chart for Calm Finance simplicity
- Income confirmation shows only top 1-2 highest confidence patterns to avoid overwhelming users
- MoneyDashboard placeholder comment left for InsightList (wired in Plan 04, wave-3 parallel)
- MoneyPageShell tests updated to mock sub-component (consistent project test isolation pattern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated money-page-shell tests for new component structure**
- **Found during:** Task 2 (MoneyPageShell update)
- **Issue:** Existing tests expected old nav hub content (accounts.netWorth, $5000.00, nav links) that was replaced by MoneyDashboard
- **Fix:** Updated tests to mock MoneyDashboard and verify it renders with correct viewMode prop
- **Files modified:** tests/components/money/money-page-shell.test.tsx
- **Verification:** pnpm test:run -- 5/5 money-page-shell tests pass
- **Committed in:** f6b84c4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 test update for new component structure)
**Impact on plan:** Essential for test suite to pass with the restructured component. No scope creep.

## Issues Encountered
- Pre-existing test failure in transaction-list.test.tsx ("transactions.yesterday") - unrelated to our changes, same failure exists before and after

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 dashboard UI components ready for InsightList integration in Plan 04
- MoneyDashboard has placeholder comment marking where InsightList will be wired
- All i18n keys referenced but not yet added to locale files (Plan 05 handles i18n + tests)
- pnpm lint: 0 errors, pnpm test: 129/130 pass (1 pre-existing failure)

## Self-Check: PASSED

- All 5 created files verified on disk
- Both modified files verified on disk
- Both task commits (c9ec958, f6b84c4) verified in git log
- pnpm lint: 0 errors (8 pre-existing warnings)
- pnpm test: 129/130 test files pass (1 pre-existing failure unrelated to changes)

---
*Phase: 24-future-first-dashboard-ai-insights*
*Completed: 2026-02-24*
