---
phase: 23-fix-save-as-routine-timing
plan: 01
subsystem: api
tags: [supabase, next.js, vitest, bug-fix, workouts, routines]

# Dependency graph
requires:
  - phase: 20-routines-templates
    provides: save-as-routine API endpoint and routine CRUD
provides:
  - Save-as-routine API that accepts any workout status (in_progress, completed, discarded)
  - Unit test suite for save-as-routine API route (4 tests)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - tests/app/api/workouts/[id]/save-as-routine/route.test.ts
  modified:
    - app/api/workouts/[id]/save-as-routine/route.ts

key-decisions:
  - "Remove in_progress guard entirely rather than restructuring UI flow -- exercises and sets exist regardless of workout status"

patterns-established: []

requirements-completed: [ROUT-04]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 23 Plan 01: Fix Save-as-Routine Timing Summary

**Removed in_progress status guard from save-as-routine API, enabling routine creation from the workout finish dialog without timing conflicts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T22:11:18Z
- **Completed:** 2026-02-27T22:13:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed the 6-line `in_progress` status guard that caused 400 errors when saving routines from the finish dialog
- Updated JSDoc to accurately reflect the new behavior (accepts any workout status)
- Added 4 unit tests covering in_progress (regression), completed (preservation), 401 (auth), and 404 (not found)
- Full test suite passes (99 files, 1315 tests) with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove in_progress status guard and update JSDoc** - `fb1a83d` (fix)
2. **Task 2: Add unit tests for save-as-routine route** - `c59368e` (test)

## Files Created/Modified
- `app/api/workouts/[id]/save-as-routine/route.ts` - Removed in_progress guard block, updated JSDoc comment
- `tests/app/api/workouts/[id]/save-as-routine/route.test.ts` - New test file with 4 tests covering all status scenarios

## Decisions Made
- Removed the in_progress guard entirely rather than restructuring the UI flow. The exercises and sets are fully valid in the database regardless of workout status, so the guard served no data integrity purpose and directly contradicted the UX design (save-as-routine lives inside the finish dialog, which opens while the workout is still in_progress).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 is a single-plan phase; this completes the phase
- The save-as-routine feature now works correctly from the workout finish dialog
- No blockers for future phases

## Self-Check: PASSED

- [x] route.ts exists and modified
- [x] route.test.ts exists and created
- [x] SUMMARY.md exists
- [x] Commit fb1a83d found
- [x] Commit c59368e found

---
*Phase: 23-fix-save-as-routine-timing*
*Completed: 2026-02-27*
