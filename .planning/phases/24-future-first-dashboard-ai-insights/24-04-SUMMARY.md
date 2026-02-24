---
phase: 24-future-first-dashboard-ai-insights
plan: 04
subsystem: ui
tags: [smart-calendar, insight-cards, money-summary, danger-zones, calm-finance, spending-pulse]

# Dependency graph
requires:
  - phase: 24-future-first-dashboard-ai-insights
    provides: Pure projection functions with getDangerZoneStatus (Plan 01), API routes and SWR hooks (Plan 02), Dashboard UI components (Plan 03)
  - phase: 22-bills-goals-net-worth
    provides: BillCalendar, BillCalendarDay, BudgetOverview, GoalGrid, BillsPageContent components
provides:
  - Smart bill calendar with projected balance danger zone shading (amber/red)
  - Reusable InsightCard and InsightList components for contextual embedded insights
  - MoneySummaryCard spending pulse on main BetterR.Me dashboard (independent SWR)
  - Insight integration on budgets (spending anomalies), bills (subscription alerts), goals (goal progress) pages
affects: [24-05-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [progressive-enhancement-smart-calendar, independent-money-summary-card, embedded-insight-cards]

key-files:
  created:
    - components/money/smart-bill-calendar.tsx
    - components/money/insight-card.tsx
    - components/money/insight-list.tsx
    - components/dashboard/money-summary-card.tsx
  modified:
    - components/money/bill-calendar-day.tsx
    - components/money/money-dashboard.tsx
    - components/money/budget-overview.tsx
    - components/money/bills-page-content.tsx
    - components/money/goal-grid.tsx
    - components/dashboard/dashboard-content.tsx

key-decisions:
  - "SmartBillCalendar reuses BillCalendar grid logic with added balance overlay (DRY, progressive enhancement)"
  - "BillCalendarDay optional props (balanceStatus, projectedBalanceCents) maintain full backward compatibility"
  - "formatCompactMoney helper in bill-calendar-day for abbreviated dollar display ($2.1k) in tight calendar cells"
  - "MoneySummaryCard returns null silently when loading/no accounts — never blocks dashboard layout"
  - "InsightCard uses i18n keys with data interpolation for all messages (no hardcoded English)"
  - "Bills page fetches useDashboardMoney for smart calendar — SWR caching makes this efficient when data is warm"

patterns-established:
  - "Progressive enhancement pattern: SmartBillCalendar replaces BillCalendar only when projection data available"
  - "Silent card pattern: MoneySummaryCard self-manages visibility via independent SWR hook"
  - "Embedded insight pattern: InsightList renders null when empty — zero visual impact when no insights"
  - "Anxiety-aware messaging: InsightCard maps insight types to calm, progress-framing i18n keys"

requirements-completed: [DASH-06, DASH-07, AIML-01, AIML-02, AIML-03, AIML-04, AIML-05]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 24 Plan 04: Insight Cards & Dashboard Integration Summary

**Smart bill calendar with danger zone shading, reusable insight cards embedded on money pages, and spending pulse summary card on the main dashboard**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T18:24:03Z
- **Completed:** 2026-02-24T18:28:55Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built SmartBillCalendar with amber/red danger zone shading from projected daily balances
- Created InsightCard with anxiety-aware i18n messages and InsightList with 5-insight cap
- Added MoneySummaryCard spending pulse to main dashboard with independent SWR hook
- Wired InsightList into budgets, bills, goals, and money dashboard pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Smart bill calendar and reusable insight components** - `8c607c2` (feat)
2. **Task 2: Money summary card on main dashboard + wire insights into existing pages** - `a36c484` (feat)

## Files Created/Modified
- `components/money/smart-bill-calendar.tsx` - Enhanced calendar wrapper with danger zone balance overlay
- `components/money/insight-card.tsx` - Reusable insight card with severity borders and i18n messages
- `components/money/insight-list.tsx` - Insight list rendering max 5 per page, null when empty
- `components/dashboard/money-summary-card.tsx` - Spending pulse card with budget progress bar for main dashboard
- `components/money/bill-calendar-day.tsx` - Added optional balanceStatus/projectedBalanceCents props
- `components/money/money-dashboard.tsx` - Replaced InsightList placeholder with actual component
- `components/money/budget-overview.tsx` - Added InsightList for spending anomalies
- `components/money/bills-page-content.tsx` - Added InsightList + SmartBillCalendar progressive enhancement
- `components/money/goal-grid.tsx` - Added InsightList for goal progress insights
- `components/dashboard/dashboard-content.tsx` - Added MoneySummaryCard between motivation and absence sections

## Decisions Made
- SmartBillCalendar reuses the same grid/navigation logic as BillCalendar with balance overlay added via getDangerZoneStatus
- BillCalendarDay uses optional props for backward compatibility (existing BillCalendar unaffected)
- Added formatCompactMoney helper for abbreviated dollar display in tight calendar cells
- MoneySummaryCard returns null silently when loading or no accounts — dashboard layout unaffected
- Bills page uses useDashboardMoney for smart calendar data with SWR caching for efficiency
- InsightCard maps all insight types to i18n keys with data interpolation — no hardcoded English

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in transaction-list.test.tsx ("transactions.yesterday") - unrelated to our changes, same failure exists before and after

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UI components complete for Phase 24 — Plan 05 (tests & i18n) is the final plan
- i18n keys referenced in InsightCard and MoneySummaryCard need locale file entries (Plan 05)
- pnpm lint: 0 errors, pnpm test: 129/130 pass (1 pre-existing failure)

## Self-Check: PASSED

- All 4 created files verified on disk
- All 6 modified files verified on disk
- Both task commits (8c607c2, a36c484) verified in git log
- pnpm lint: 0 errors (9 pre-existing warnings)
- pnpm test: 129/130 test files pass (1 pre-existing failure unrelated to changes)

---
*Phase: 24-future-first-dashboard-ai-insights*
*Completed: 2026-02-24*
