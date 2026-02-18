---
phase: 07-sidebar-enrichment
plan: 03
subsystem: ui
tags: [sidebar, badges, notification-counts, swr, api-endpoint, sidebar-menu-badge]

# Dependency graph
requires:
  - phase: 07-sidebar-enrichment
    provides: Collapsible section groups with SidebarMenuBadge pre-imported (plan 01), SidebarUserFooter (plan 02)
  - phase: 02-sidebar-shell
    provides: AppSidebar component with nav items and SidebarMenuButton mock pattern
provides:
  - GET /api/sidebar/counts endpoint returning habits_incomplete and tasks_due
  - useSidebarCounts SWR hook with 5-min refresh and 1-min dedup
  - SidebarMenuBadge on Habits and Tasks nav items with live counts
  - Badge display capped at "9+" for counts > 9
affects: [sidebar-enrichment, 08-visual-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [sidebar-badge-counts, lightweight-sidebar-api]

key-files:
  created:
    - app/api/sidebar/counts/route.ts
    - lib/hooks/use-sidebar-counts.ts
    - tests/app/api/sidebar/counts/route.test.ts
  modified:
    - components/layouts/app-sidebar.tsx
    - tests/components/layouts/app-sidebar.test.tsx

key-decisions:
  - "Badge counts keyed by nav item labelKey (habits/tasks) -- extensible to future nav items"
  - "formatBadge helper caps display at 9+ to prevent badge overflow in narrow sidebar"
  - "SWR config: 5-min refresh + 1-min dedup + revalidateOnFocus:false -- badges are informational, not critical"

patterns-established:
  - "Sidebar badge pattern: badgeCounts record mapped to SidebarMenuBadge siblings inside SidebarMenuItem"
  - "Lightweight counts API: parallel DB queries returning minimal JSON for sidebar badge rendering"

requirements-completed: [SIDE-10]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 7 Plan 3: Sidebar Notification Badges Summary

**Live notification badges on Habits/Tasks nav items via dedicated counts API endpoint and SWR hook with 5-min refresh**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T19:06:43Z
- **Completed:** 2026-02-17T19:10:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created lightweight GET /api/sidebar/counts endpoint returning habits_incomplete and tasks_due counts via parallel DB queries
- Built useSidebarCounts SWR hook with 5-minute refresh interval, 1-minute dedup, and keepPreviousData for midnight transitions
- Added SidebarMenuBadge to Habits and Tasks nav items with live counts, hidden when 0, capped at "9+" for overflow
- 4 API tests + 5 badge tests all passing; 23 total AppSidebar tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sidebar counts API endpoint and SWR hook** - `5a96ff6` (feat)
2. **Task 2: Add notification badges to AppSidebar nav items** - `9a113f2` (feat)

## Files Created/Modified
- `app/api/sidebar/counts/route.ts` - Lightweight GET endpoint returning badge counts from HabitsDB and TasksDB
- `lib/hooks/use-sidebar-counts.ts` - SWR hook with 5-min refresh, 1-min dedup, keepPreviousData
- `tests/app/api/sidebar/counts/route.test.ts` - 4 tests: auth, counts, zero counts, error handling
- `components/layouts/app-sidebar.tsx` - Integrated useSidebarCounts hook and SidebarMenuBadge rendering on main nav items
- `tests/components/layouts/app-sidebar.test.tsx` - 5 new badge tests: visibility, cap, per-item correctness

## Decisions Made
- Badge counts keyed by nav item labelKey (habits/tasks) for extensibility to future nav items
- formatBadge helper caps display at "9+" to prevent badge overflow in narrow sidebar
- SWR config uses 5-min refresh + 1-min dedup + revalidateOnFocus:false since badges are informational, not critical
- Removed eslint-disable comment on SidebarMenuBadge import (now actively used)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All sidebar enrichment complete: section groups (07-01), user footer (07-02), notification badges (07-03)
- Phase 7 fully done, ready for Phase 8 (visual polish)
- All tests passing (23 AppSidebar + 4 API = 27 new/updated), build clean, lint clean

## Self-Check: PASSED

All 5 files verified present. Both commit hashes (5a96ff6, 9a113f2) confirmed in git log.

---
*Phase: 07-sidebar-enrichment*
*Completed: 2026-02-17*
