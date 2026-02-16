---
phase: 04-performance
plan: 01
subsystem: api
tags: [supabase, count-query, dashboard, performance, head-only]

# Dependency graph
requires:
  - phase: 02-security-and-validation
    provides: "TasksDB class with getUserTasks and TaskFilters type"
provides:
  - "getTaskCount method on TasksDB using HEAD-only COUNT query"
  - "Dashboard API route and SSR page using count queries instead of full row fetches for stats"
affects: [api, dashboard, tasks]

# Tech tracking
tech-stack:
  added: []
  patterns: ["HEAD-only COUNT query pattern for Supabase stats (count: 'exact', head: true)"]

key-files:
  created: []
  modified:
    - lib/db/tasks.ts
    - app/api/dashboard/route.ts
    - app/dashboard/page.tsx
    - tests/app/api/dashboard/route.test.ts
    - tests/lib/db/tasks.test.ts

key-decisions:
  - "getTaskCount mirrors getUserTasks filter logic but uses HEAD-only COUNT query"
  - "tasks_completed_today uses both due_date AND is_completed:true filters (not just date filter)"

patterns-established:
  - "HEAD-only COUNT pattern: use { count: 'exact', head: true } for count-only queries, matching getActiveHabitCount and countCompletedLogs"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 4 Plan 1: Dashboard Count Query Optimization Summary

**Replaced full task row fetches with HEAD-only COUNT queries for dashboard total_tasks and tasks_completed_today stats**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T19:19:04Z
- **Completed:** 2026-02-16T19:22:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `getTaskCount` method to TasksDB using `{ count: 'exact', head: true }` -- transfers zero row data
- Updated dashboard API route to use count queries instead of fetching all task rows for `.length`
- Updated SSR dashboard page with same count optimization
- Added 5 new unit tests for `getTaskCount` and updated 13 dashboard route tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getTaskCount method and wire into dashboard codepaths** - `7906f06` (feat)
2. **Task 2: Update dashboard route tests and add getTaskCount unit tests** - `e1bd941` (test)

## Files Created/Modified
- `lib/db/tasks.ts` - Added getTaskCount method with HEAD-only COUNT query and TaskFilters support
- `app/api/dashboard/route.ts` - Replaced getUserTasks count calls with getTaskCount
- `app/dashboard/page.tsx` - Replaced getUserTasks count calls with getTaskCount (SSR)
- `tests/app/api/dashboard/route.test.ts` - Updated mocks for getTaskCount, fixed call index assertions
- `tests/lib/db/tasks.test.ts` - Added 5 getTaskCount tests (count all, filters, null, errors)

## Decisions Made
- `getTaskCount` mirrors the exact filter logic from `getUserTasks` (is_completed, priority, due_date, has_due_date) so any filter combination works for counts
- `tasks_completed_today` uses both `due_date` AND `is_completed: true` filters -- the plan correctly identified this as Pitfall 4 (using only date filter would give tasks_due_today, not tasks_completed_today)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Count query pattern established and tested, ready for Plan 02 (additional performance optimizations)
- All 918 tests pass with no regressions

## Self-Check: PASSED

All 5 modified files verified on disk. Both task commits (7906f06, e1bd941) verified in git log.

---
*Phase: 04-performance*
*Completed: 2026-02-16*
