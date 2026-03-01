---
phase: 20-routines-templates
plan: 02
subsystem: ui
tags: [routines, swr, react-hook-form, zod, copy-on-start, save-as-routine, fitness]

# Dependency graph
requires:
  - phase: 20-routines-templates
    provides: "RoutinesDB class with 8 CRUD methods, Zod validation schemas, 4 API route files"
provides:
  - "POST /api/routines/[id]/start copy-on-start endpoint with EXERCISE_FIELD_MAP-aware set pre-filling"
  - "POST /api/workouts/[id]/save-as-routine endpoint creating routines from completed workouts"
  - "useRoutines SWR hook with 30s dedup for routine data fetching"
  - "RoutineCard, RoutineExerciseList, RoutineForm UI components"
  - "Routines management page at /workouts/routines with full CRUD"
affects: [20-03, 21-workout-history]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Copy-on-start deep-copy with EXERCISE_FIELD_MAP field filtering", "Reuse WorkoutAddExercise sheet for routine exercise picker"]

key-files:
  created:
    - app/api/routines/[id]/start/route.ts
    - app/api/workouts/[id]/save-as-routine/route.ts
    - lib/hooks/use-routines.ts
    - components/fitness/routines/routine-card.tsx
    - components/fitness/routines/routine-exercise-list.tsx
    - components/fitness/routines/routine-form.tsx
    - components/fitness/routines/routines-page-content.tsx
    - app/workouts/routines/page.tsx
  modified:
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Copy-on-start uses EXERCISE_FIELD_MAP to null out inapplicable fields (weight/reps/duration) per exercise type"
  - "Reused WorkoutAddExercise sheet component for routine exercise picker instead of building a separate one"
  - "Routine form uses create-then-edit pattern: create routine first, then add exercises in edit mode"
  - "Save-as-routine extracts best completed set values (max weight, first completed reps/duration) as targets"

patterns-established:
  - "Copy-on-start pattern: routine -> workout with pre-filled sets respecting exercise type field config"
  - "Reuse exercise picker sheet across workout logger and routine form contexts"

requirements-completed: [ROUT-01, ROUT-02, ROUT-03, ROUT-04]

# Metrics
duration: 7min
completed: 2026-02-24
---

# Phase 20 Plan 02: Routines UI & Template Instantiation Summary

**Copy-on-start and save-as-routine API endpoints, useRoutines SWR hook, routine management UI with exercise-type-aware target editing, and /workouts/routines page**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T19:19:14Z
- **Completed:** 2026-02-24T19:26:45Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- POST /api/routines/[id]/start creates a workout with deep-copied exercises and pre-filled sets from routine, respecting EXERCISE_FIELD_MAP per exercise type
- POST /api/workouts/[id]/save-as-routine creates a routine from a completed workout's exercise data with best-set value extraction
- useRoutines SWR hook with 30s dedup, RoutineCard with start/edit/delete actions, RoutineExerciseList with inline blur-commit editable targets
- RoutineForm dialog supports create and edit modes with exercise management via reused WorkoutAddExercise picker
- Routines management page at /workouts/routines with grid layout, empty state, and delete confirmation
- i18n strings added to all three locale files (en, zh, zh-TW)
- All 1311 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create copy-on-start and save-as-routine API endpoints** - `1e5cd4c` (feat)
2. **Task 2: Create useRoutines SWR hook and routine UI components** - `05ac1a2` (feat)
3. **Task 3: Create routine form and routines management page** - `39435ad` (feat)

## Files Created/Modified
- `app/api/routines/[id]/start/route.ts` - POST endpoint for copy-on-start routine instantiation with EXERCISE_FIELD_MAP-aware set pre-filling
- `app/api/workouts/[id]/save-as-routine/route.ts` - POST endpoint creating routine from completed workout data
- `lib/hooks/use-routines.ts` - SWR hook for fetching routines with 30s dedup
- `components/fitness/routines/routine-card.tsx` - Routine display card with start/edit/delete actions and exercise summary
- `components/fitness/routines/routine-exercise-list.tsx` - Editable exercise rows with exercise-type-aware target fields and weight unit conversion
- `components/fitness/routines/routine-form.tsx` - Dialog-based create/edit form with exercise picker integration
- `components/fitness/routines/routines-page-content.tsx` - Client component with grid display, empty state, CRUD actions
- `app/workouts/routines/page.tsx` - Server component page wrapper for routines management
- `i18n/messages/en.json` - Added routines namespace with all UI strings
- `i18n/messages/zh.json` - Added routines namespace (Simplified Chinese)
- `i18n/messages/zh-TW.json` - Added routines namespace (Traditional Chinese)

## Decisions Made
- Copy-on-start uses EXERCISE_FIELD_MAP to null out inapplicable fields (weight for bodyweight exercises, reps for duration exercises, etc.)
- Reused WorkoutAddExercise sheet component for the routine exercise picker rather than building a duplicate
- Routine form uses a create-then-edit pattern: create the routine first (name + notes), then add exercises in edit mode
- Save-as-routine extracts max weight from completed sets and first completed set's reps/duration as targets

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All routine UI and template instantiation endpoints are complete
- Copy-on-start and save-as-routine patterns ready for integration testing
- Plan 20-03 can build on the routine management foundation for any remaining features

## Self-Check: PASSED

All 8 created files verified present. All 3 task commits (1e5cd4c, 05ac1a2, 39435ad) verified in git log.

---
*Phase: 20-routines-templates*
*Completed: 2026-02-24*
