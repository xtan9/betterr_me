---
phase: 22-bills-goals-net-worth
plan: 04
subsystem: ui
tags: [react, nextjs, date-fns, calendar, recurring-bills, tabs, i18n]

# Dependency graph
requires:
  - phase: 22-bills-goals-net-worth
    plan: 02
    provides: "Bills API routes (GET/POST/PATCH/DELETE), useBills() SWR hook, bills summary stats"
  - phase: 21-budgets-analytics
    provides: "Calm Finance design tokens, Dialog modal={false} pattern, budget-form pattern"
provides:
  - "BillsList component with frequency-grouped sections and inline confirm/dismiss toggle"
  - "BillRow with paid-this-month badge, price change badge, and status actions"
  - "BillSummaryHeader showing total monthly cost and bill counts"
  - "BillForm dialog for creating and editing bills with react-hook-form + zod"
  - "BillCalendar month grid with per-day bill markers and month navigation"
  - "BillCalendarDay with inline expand showing bill details"
  - "Bills page route at /money/bills with tabbed List/Calendar views"
affects: [22-05-PLAN, 22-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frequency projection to calendar grid (weekly/biweekly/monthly/annual date calculation)"
    - "Inline confirm/dismiss toggle pattern for auto-detected vs confirmed vs dismissed bills"
    - "Tabbed page content pattern: server page with client Tabs component wrapping multiple views"

key-files:
  created:
    - "components/money/bill-summary-header.tsx"
    - "components/money/bill-row.tsx"
    - "components/money/bills-list.tsx"
    - "components/money/bill-form.tsx"
    - "components/money/bill-calendar.tsx"
    - "components/money/bill-calendar-day.tsx"
    - "components/money/bills-page-content.tsx"
    - "app/money/bills/page.tsx"
  modified:
    - "i18n/messages/en.json"
    - "i18n/messages/zh.json"
    - "i18n/messages/zh-TW.json"

key-decisions:
  - "Inline confirm/dismiss toggle (no modal) per locked user decision for bill status changes"
  - "Paid-this-month heuristic derived from bill.is_active + updated_at in current month"
  - "Calendar uses month grid style (calmer/structured) with inline day expansion for bill details"
  - "Tabs pattern (List | Calendar) for clean navigation between bill views"
  - "Dialog modal={false} on BillForm for Radix Select compatibility (per Phase 21 decision)"
  - "Frequency projection calculates all bill occurrences in a given month from next_due_date + frequency"

patterns-established:
  - "Tabbed page content: server page renders PageHeader, client BillsPageContent renders Tabs with multiple views"
  - "Collapsible dismissed section: dismissed items at bottom of list, expandable for browsing/re-confirmation"
  - "Bill frequency grouping: bills sorted into Monthly/Weekly/Annual sections with ascending due date sort"

requirements-completed: [BILL-01, BILL-02, BILL-03, BILL-04]

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 22 Plan 04: Bills UI Summary

**Complete bills UI with frequency-grouped list, inline confirm/dismiss toggles, month-grid calendar with day expansion, create/edit form, and tabbed List/Calendar page at /money/bills**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T21:49:19Z
- **Completed:** 2026-02-23T21:56:24Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Built BillsList with frequency sections (Monthly/Weekly/Annual), inline confirm/dismiss, price change badges, paid-this-month indicators, and collapsible dismissed section
- Created BillCalendar with month grid, per-day bill markers (names for 1-2 bills, count badge for 3+), inline expand details, and frequency-based date projection
- Implemented BillForm dialog for both creating manual bills and editing confirmed bills using react-hook-form + zod validation
- Added bills page route at /money/bills with tabbed List/Calendar views via BillsPageContent
- Added i18n bills keys to all three locales (en, zh, zh-TW)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bill list components with frequency grouping, confirm/dismiss toggle, and form** - `ae98100` (feat)
2. **Task 2: Create bill calendar and bills page route** - `c418569` (feat)

## Files Created/Modified
- `components/money/bill-summary-header.tsx` - Summary stats: N bills, N pending, $X/mo
- `components/money/bill-row.tsx` - Individual bill with status actions, paid badge, price change badge
- `components/money/bills-list.tsx` - Frequency-grouped bill list with summary header, add/sync actions, dismissed section
- `components/money/bill-form.tsx` - Create/edit dialog with react-hook-form + zod, frequency select, due date
- `components/money/bill-calendar.tsx` - Month grid calendar with bill projection and navigation arrows
- `components/money/bill-calendar-day.tsx` - Day cell with bill markers and inline expand for details
- `components/money/bills-page-content.tsx` - Client Tabs wrapper for List/Calendar views
- `app/money/bills/page.tsx` - Server page route with i18n header and Suspense boundary
- `i18n/messages/en.json` - English bills translations (37 keys)
- `i18n/messages/zh.json` - Simplified Chinese bills translations
- `i18n/messages/zh-TW.json` - Traditional Chinese bills translations

## Decisions Made
- Used inline confirm/dismiss toggle (no modal) per locked user decision -- auto-detected bills show Confirm/Dismiss, confirmed show Dismiss, dismissed show Re-confirm
- Paid-this-month uses heuristic: bill.is_active && updated_at is within current month (precise check would require transaction matching not available yet)
- Calendar projects bills to all matching days in a month based on frequency: WEEKLY walks every 7 days, MONTHLY maps to same day-of-month, ANNUALLY checks month+day match
- BillsPageContent uses Tabs (List | Calendar) for clean navigation between views rather than showing both simultaneously
- BillForm uses Dialog modal={false} per Phase 21 decision for Radix Select compatibility inside dialogs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All bill UI components ready for integration with goals and net worth UI (Plan 05)
- Bills page accessible at /money/bills with full list and calendar views
- Inline confirm/dismiss toggles call PATCH /api/money/bills/[id] from Plan 02
- Calendar correctly projects bills across months using frequency-based calculation
- Existing tests pass (1 pre-existing failure in transaction-list.test.tsx unrelated to this plan)

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (ae98100, c418569) verified in git log. All artifact line count minimums met (bills-list: 256/80, bill-row: 147/40, bill-calendar: 190/60, bill-form: 218/50, page: 17/15).

---
*Phase: 22-bills-goals-net-worth*
*Completed: 2026-02-23*
