---
phase: 20-routines-templates
plan: 01
subsystem: api
tags: [supabase, zod, crud, routines, fitness]

# Dependency graph
requires:
  - phase: 18-fitness-foundation
    provides: "routines and routine_exercises tables, TypeScript types (Routine, RoutineExercise, RoutineWithExercises)"
provides:
  - "RoutinesDB class with 8 CRUD methods for routines and routine exercises"
  - "5 Zod validation schemas for all routine API input boundaries"
  - "4 API route files with 9 HTTP handlers covering full CRUD"
affects: [20-02, 20-03, 21-workout-history]

# Tech tracking
tech-stack:
  added: []
  patterns: ["RoutinesDB class following WorkoutsDB/CategoriesDB pattern", "Nested Supabase select with referencedTable ordering for routine exercises"]

key-files:
  created:
    - lib/db/routines.ts
    - lib/validations/routine.ts
    - app/api/routines/route.ts
    - app/api/routines/[id]/route.ts
    - app/api/routines/[id]/exercises/route.ts
    - app/api/routines/[id]/exercises/[reId]/route.ts
  modified:
    - lib/db/index.ts

key-decisions:
  - "RoutinesDB follows WorkoutsDB pattern with nested Supabase select + reshape for RoutineWithExercises type"
  - "sort_order uses 65536 gap pattern consistent with workout exercises"
  - "Default target_sets=3 and rest_timer_seconds=90 in addExerciseToRoutine"

patterns-established:
  - "Routine exercise sub-routes at /api/routines/[id]/exercises/[reId] for granular CRUD"

requirements-completed: [ROUT-01, ROUT-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 20 Plan 01: Routines Backend Summary

**RoutinesDB class with 8 CRUD methods, 5 Zod schemas, and 4 API route files covering full routine and routine exercise management**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T19:13:18Z
- **Completed:** 2026-02-24T19:16:55Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- RoutinesDB class with getUserRoutines, getRoutine, createRoutine, updateRoutine, deleteRoutine, addExerciseToRoutine, updateRoutineExercise, removeRoutineExercise
- 5 Zod validation schemas: routineCreate, routineUpdate, routineExerciseAdd, routineExerciseUpdate, saveAsRoutine
- 4 API route files with 9 HTTP handlers (GET/POST routines, GET/PATCH/DELETE routines/[id], GET/POST routines/[id]/exercises, PATCH/DELETE routines/[id]/exercises/[reId])
- All 1311 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RoutinesDB class and Zod validation schemas** - `b55a5a9` (feat)
2. **Task 2: Create routine CRUD API routes** - `e65bd0d` (feat)

## Files Created/Modified
- `lib/db/routines.ts` - RoutinesDB class with 8 CRUD methods for routines and routine exercises
- `lib/db/index.ts` - Added RoutinesDB barrel export
- `lib/validations/routine.ts` - 5 Zod schemas for routine API input validation
- `app/api/routines/route.ts` - GET list and POST create endpoints
- `app/api/routines/[id]/route.ts` - GET detail, PATCH update, DELETE endpoints
- `app/api/routines/[id]/exercises/route.ts` - GET list and POST add exercise endpoints
- `app/api/routines/[id]/exercises/[reId]/route.ts` - PATCH update and DELETE remove exercise endpoints

## Decisions Made
- RoutinesDB follows the same nested Supabase select + reshape pattern from WorkoutsDB for consistency
- sort_order uses 65536 gap pattern for routine exercises, matching workout exercises
- Default target_sets=3 and rest_timer_seconds=90 when adding exercises to routines
- Included exported TypeScript types for all 5 Zod schemas for consumer convenience

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All routine and routine exercise CRUD API endpoints are ready for UI consumption in plan 20-02
- RoutinesDB provides the foundation for copy-on-start (plan 20-03) and save-as-routine features
- saveAsRoutineSchema is pre-built for the save-workout-as-routine endpoint

## Self-Check: PASSED

All 7 files verified present. Both task commits (b55a5a9, e65bd0d) verified in git log.

---
*Phase: 20-routines-templates*
*Completed: 2026-02-24*
