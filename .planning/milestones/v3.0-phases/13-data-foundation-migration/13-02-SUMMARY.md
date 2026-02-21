---
phase: 13-data-foundation-migration
plan: 02
subsystem: api
tags: [typescript, sync, api-routes, backward-compatibility, task-status, sort-order]

# Dependency graph
requires:
  - phase: 13-01-data-foundation-migration
    provides: syncTaskCreate, syncTaskUpdate, getBottomSortOrder utilities and TaskStatus types
provides:
  - All task mutation points wired to bidirectional status/is_completed sync
  - POST /api/tasks creates tasks with status, section, sort_order
  - PATCH /api/tasks/[id] handles status/section/sort_order updates with sync
  - toggleTaskCompletion in DB layer uses syncTaskUpdate
  - Recurring task instances include status=todo and section=personal
  - Full backward compatibility proven by 1166 passing tests
affects: [14-kanban-api, 15-kanban-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [sync-at-mutation-point, sort-order-on-create]

key-files:
  created: []
  modified:
    - lib/db/tasks.ts
    - app/api/tasks/route.ts
    - app/api/tasks/[id]/route.ts
    - lib/recurring-tasks/instance-generator.ts
    - tests/lib/db/tasks.test.ts
    - tests/app/api/tasks/route.test.ts
    - tests/app/api/tasks/[id]/route.test.ts

key-decisions:
  - "Toggle tests use mockResolvedValueOnce for queued responses instead of setMockResponse overwrite"
  - "POST handler queries max sort_order per user before creating task for proper ordering"
  - "Recurring instances use DB default sort_order (0) — kanban phase will assign proper values"

patterns-established:
  - "Sync at mutation point: every task create/update goes through syncTaskCreate/syncTaskUpdate before DB write"
  - "Sort order on create: new tasks query max sort_order and append with SORT_ORDER_GAP"

requirements-completed: [DATA-03, DATA-04]

# Metrics
duration: 6min
completed: 2026-02-19
---

# Phase 13 Plan 02: Sync Integration and Backward Compatibility Summary

**Wired bidirectional is_completed/status sync into all 5 task mutation points (DB toggle, POST create, PATCH update, instance generator) with 1166 passing tests proving zero behavioral regression**

## Performance

- **Duration:** 5min 42s
- **Started:** 2026-02-19T15:38:09Z
- **Completed:** 2026-02-19T15:43:51Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- All task mutation points wired to sync layer: toggleTaskCompletion, POST /api/tasks, PATCH /api/tasks/[id], recurring instance generator
- POST handler now computes sort_order via getBottomSortOrder and applies syncTaskCreate for status/is_completed consistency
- PATCH handler's manual completed_at logic replaced by syncTaskUpdate, with new status/section/sort_order field handling
- All 1166 existing tests pass with updated mock objects, proving complete backward compatibility (DATA-04)
- New sync integration tests verify status-to-is_completed and is_completed-to-status sync at API layer (DATA-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire sync into DB layer and API routes** - `35e5c0c` (feat)
2. **Task 2: Update existing tests for backward compatibility and add sync integration tests** - `c23ffdc` (test)

## Files Created/Modified
- `lib/db/tasks.ts` - Added syncTaskUpdate import; toggleTaskCompletion now uses sync instead of manual completed_at
- `app/api/tasks/route.ts` - Added syncTaskCreate + getBottomSortOrder; POST handler queries max sort_order, applies sync before create
- `app/api/tasks/[id]/route.ts` - Added syncTaskUpdate; PATCH handler removes manual completed_at, adds status/section/sort_order handling, applies sync before update
- `lib/recurring-tasks/instance-generator.ts` - Added status='todo' and section='personal' to recurring instance creation
- `tests/lib/db/tasks.test.ts` - Added status/section/sort_order to mock Task; updated toggle tests with mockResolvedValueOnce and sync assertions
- `tests/app/api/tasks/route.test.ts` - Added chainable Supabase mock for sort_order query; added POST sync/sort_order/forward-compat tests
- `tests/app/api/tasks/[id]/route.test.ts` - Added PATCH tests for status=done/todo sync and section/sort_order acceptance

## Decisions Made
- Toggle tests needed mockResolvedValueOnce to properly queue getTask/updateTask responses (the existing setMockResponse pattern overwrites, not queues)
- POST sort_order query uses maybeSingle() to gracefully handle first-ever task (no existing rows)
- Recurring instances use DB default sort_order rather than computing per-instance (kanban phase will assign proper values on column move)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed toggle test mock approach for queued responses**
- **Found during:** Task 2
- **Issue:** MockQueryBuilder's setMockResponse overwrites (doesn't queue), causing toggle tests to return wrong task state for getTask call. The existing tests coincidentally passed because they only checked return values, not update payloads.
- **Fix:** Used `mockSupabaseClient.single.mockResolvedValueOnce()` to properly queue getTask and updateTask responses
- **Files modified:** tests/lib/db/tasks.test.ts
- **Verification:** Both toggle tests pass with correct sync assertions
- **Committed in:** c23ffdc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for correct test behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. All changes are code-level wiring.

## Next Phase Readiness
- Phase 13 complete: types, sync utility, sort-order utility, migration SQL, and full integration wiring all done
- All task mutations (create, update, toggle, recurring generate) go through sync layer
- Ready for Phase 14 (kanban API) to use status/section/sort_order fields
- Migration SQL from 13-01 must be applied to production database before kanban features go live

## Self-Check: PASSED

All 7 modified files verified on disk. Both commit hashes (35e5c0c, c23ffdc) verified in git log.

---
*Phase: 13-data-foundation-migration*
*Completed: 2026-02-19*
