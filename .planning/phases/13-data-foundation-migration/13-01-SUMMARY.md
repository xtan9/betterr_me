---
phase: 13-data-foundation-migration
plan: 01
subsystem: database
tags: [typescript, zod, postgresql, tdd, task-status, sort-order, migration]

# Dependency graph
requires: []
provides:
  - TaskStatus type with 4-value constraint (backlog, todo, in_progress, done)
  - Bidirectional status/is_completed sync utility (syncTaskCreate, syncTaskUpdate)
  - Float-based sort-order utilities (getBottomSortOrder, getSortOrderBetween)
  - Migration SQL adding status, section, sort_order columns to tasks table
  - Zod validation schemas for task status
affects: [13-02-data-foundation-migration, 14-kanban-api, 15-kanban-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [api-layer-sync, float-sort-order, tdd-red-green]

key-files:
  created:
    - lib/tasks/sync.ts
    - lib/tasks/sort-order.ts
    - tests/lib/tasks/sync.test.ts
    - tests/lib/tasks/sort-order.test.ts
    - supabase/migrations/20260218000001_add_task_status_section_sort_order.sql
  modified:
    - lib/db/types.ts
    - lib/validations/task.ts

key-decisions:
  - "TaskStatus type constrains to exactly 4 values: backlog, todo, in_progress, done"
  - "syncTaskUpdate: status wins when both status and is_completed provided in same update"
  - "Reopened tasks always reset to status=todo (no previous-status tracking)"
  - "Float sort_order with 65536.0 gap spacing for bisection headroom"
  - "Migration defaults is_completed=false tasks to status=todo for UX consistency"

patterns-established:
  - "API-layer sync: pure functions that transform task mutations to ensure is_completed/status consistency"
  - "Float-based ordering: SORT_ORDER_GAP=65536.0, getBottomSortOrder for appending, getSortOrderBetween for insertion"
  - "TDD for pure utility functions: write failing tests first, then implement"

requirements-completed: [DATA-01, DATA-02]

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 13 Plan 01: Data Foundation Types, Sync, and Migration Summary

**TaskStatus type definitions, bidirectional is_completed/status sync utility with 23 TDD tests, sort-order utilities, and migration SQL for status/section/sort_order columns**

## Performance

- **Duration:** 4min 47s
- **Started:** 2026-02-19T15:30:34Z
- **Completed:** 2026-02-19T15:35:21Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- TaskStatus type with 4-value constraint and Zod validation schema, fully backward-compatible with existing Task type usage
- Bidirectional sync utility handling all input combinations: default creation, explicit status, is_completed toggle, conflict resolution (status wins), reopened-task reset
- Float-based sort-order utilities with 65536.0 gap for drag-and-drop reordering
- Migration SQL ready to run: adds 3 columns, syncs existing data, seeds sort_order, creates indexes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add type definitions and validation schemas** - `ebfe143` (feat)
2. **Task 2: TDD - Create sync and sort-order utilities with tests** - `94e3b26` (test: RED), `151b6bc` (feat: GREEN)
3. **Task 3: Create migration SQL** - `0897ce5` (chore)

_TDD Task 2 has two commits: failing tests (RED) then implementation (GREEN)._

## Files Created/Modified
- `lib/db/types.ts` - Added TaskStatus, TaskSection types; status/section/sort_order to Task interface; optional fields to TaskInsert; status to TaskFilters
- `lib/validations/task.ts` - Added taskStatusSchema; extended taskFormSchema and taskUpdateSchema with status/section/sort_order
- `lib/tasks/sync.ts` - syncTaskCreate and syncTaskUpdate for bidirectional status/is_completed consistency
- `lib/tasks/sort-order.ts` - SORT_ORDER_GAP, getBottomSortOrder, getSortOrderBetween for float-based ordering
- `tests/lib/tasks/sync.test.ts` - 17 test cases covering all sync input combinations
- `tests/lib/tasks/sort-order.test.ts` - 6 test cases for sort-order utilities
- `supabase/migrations/20260218000001_add_task_status_section_sort_order.sql` - Migration adding 3 columns with data sync and indexes

## Decisions Made
- TaskStatus constrained to exactly 4 values (backlog, todo, in_progress, done) via TypeScript union type + Zod enum + SQL CHECK constraint
- Status wins over is_completed when both provided in same update (explicit status is more specific)
- Reopened tasks always reset to status=todo (no previous-status tracking, per locked decision)
- Float sort_order with 65536.0 gap provides ample bisection headroom (~52 levels before precision loss)
- Migration defaults existing is_completed=false tasks to status=todo (not backlog) for UX consistency with kanban conventions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `vi` import in sync test file**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** `vi` imported from vitest but not used, causing lint warning
- **Fix:** Removed unused import
- **Files modified:** tests/lib/tasks/sync.test.ts
- **Verification:** `pnpm lint` shows 0 errors (3 pre-existing warnings only)
- **Committed in:** 151b6bc (part of GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial lint fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Migration SQL must be run against the database when ready (standard Supabase migration workflow).

## Next Phase Readiness
- Type foundation complete: TaskStatus, TaskSection, sync utility, sort-order utility all tested and ready
- Plan 13-02 can wire sync utility into DB layer, API routes, and instance generator
- Migration SQL ready to apply to production database
- All 1160 existing tests pass with no regressions

## Self-Check: PASSED

All 7 created/modified files verified on disk. All 4 commit hashes (ebfe143, 94e3b26, 151b6bc, 0897ce5) verified in git log.

---
*Phase: 13-data-foundation-migration*
*Completed: 2026-02-19*
