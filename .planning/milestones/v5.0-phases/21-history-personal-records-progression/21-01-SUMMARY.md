---
phase: 21-history-personal-records-progression
plan: 01
subsystem: api
tags: [recharts, shadcn-chart, supabase, swr, personal-records, exercise-history]

# Dependency graph
requires:
  - phase: 18-fitness-foundation
    provides: exercises, workouts, workout_exercises, workout_sets tables and types
  - phase: 19-workout-logging
    provides: WorkoutsDB with active workout methods, EXERCISE_FIELD_MAP
provides:
  - shadcn chart component (ChartContainer, ChartTooltip, ChartConfig) for progression charts
  - WorkoutsDB.getWorkoutsWithSummary() for paginated workout history with enriched summaries
  - WorkoutsDB.getExerciseHistory() for per-workout aggregated exercise stats
  - WorkoutsDB.getExerciseSets() for raw set data with workout dates
  - computePersonalRecords() and isNewPR() pure functions for PR detection
  - GET /api/workouts with enriched summaries and pagination
  - GET /api/exercises/[id]/history for exercise progression data
  - GET /api/exercises/[id]/records for computed personal records
  - useWorkouts() SWR hook for history list
  - useExerciseHistory() and useExerciseRecords() SWR hooks for progression data
affects: [21-02, 21-03, 21-04]

# Tech tracking
tech-stack:
  added: [recharts]
  patterns: [on-demand-pr-computation, nested-supabase-select-aggregation, exercise-type-aware-pr-detection]

key-files:
  created:
    - components/ui/chart.tsx
    - lib/fitness/personal-records.ts
    - app/api/exercises/[id]/history/route.ts
    - app/api/exercises/[id]/records/route.ts
    - lib/hooks/use-workouts.ts
    - lib/hooks/use-exercise-history.ts
  modified:
    - lib/db/workouts.ts
    - app/api/workouts/route.ts
    - package.json

key-decisions:
  - "On-demand PR computation from workout_sets (no separate personal_records table) -- acceptable for <500 workouts per exercise"
  - "Exercise-type-aware isNewPR using EXERCISE_FIELD_MAP to check relevant PR types per exercise type (weight, reps, duration)"
  - "GET /api/workouts returns flat array (not {workouts: [...]}) for simpler SWR typing"
  - "getExerciseSets helper method added to WorkoutsDB for records route (not in original plan but needed for clean data flow)"

patterns-established:
  - "Nested Supabase select + app-code aggregation for workout summary enrichment"
  - "Exercise-type-aware PR detection via EXERCISE_FIELD_MAP flags"
  - "Conditional SWR fetching (null key) for optional exercise ID parameters"

requirements-completed: [HIST-01, HIST-03, HIST-04]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 21 Plan 01: Data Foundation Summary

**Recharts via shadcn chart installed, 3 API routes for workout history/exercise progression/personal records, 2 DB methods, PR computation with exercise-type-aware detection, and 3 SWR hooks**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T22:43:09Z
- **Completed:** 2026-02-24T22:48:01Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Installed shadcn chart component with Recharts dependency for progression charts
- Added WorkoutsDB methods for enriched workout history and per-exercise aggregated stats
- Created personal-records.ts with exercise-type-aware PR detection (bodyweight checks reps, duration checks time, weight_reps checks weight/volume)
- Built 3 API routes (workout history, exercise progression, personal records) and 3 SWR hooks

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn chart, add DB methods and PR computation** - `5df0050` (feat)
2. **Task 2: Create API routes and SWR hooks for history and progression** - `69b6a99` (feat)

## Files Created/Modified
- `components/ui/chart.tsx` - shadcn ChartContainer, ChartTooltip, ChartTooltipContent wrappers for Recharts
- `lib/db/workouts.ts` - Added getWorkoutsWithSummary(), getExerciseHistory(), getExerciseSets() methods
- `lib/fitness/personal-records.ts` - computePersonalRecords() and isNewPR() pure functions
- `app/api/workouts/route.ts` - Enhanced GET handler with enriched summaries and pagination
- `app/api/exercises/[id]/history/route.ts` - GET endpoint for exercise progression data
- `app/api/exercises/[id]/records/route.ts` - GET endpoint for exercise personal records
- `lib/hooks/use-workouts.ts` - useWorkouts() SWR hook with pagination and keepPreviousData
- `lib/hooks/use-exercise-history.ts` - useExerciseHistory() and useExerciseRecords() SWR hooks
- `package.json` - recharts dependency added

## Decisions Made
- Used on-demand PR computation (compute from workout_sets at query time) instead of a separate personal_records table -- acceptable performance for <500 workouts per exercise
- isNewPR uses EXERCISE_FIELD_MAP to determine relevant PR types per exercise type (bodyweight_reps only checks reps PR, duration only checks duration PR, weight_reps checks weight and volume PRs)
- GET /api/workouts returns flat array directly (not wrapped in {workouts: [...]}) for simpler SWR typing in useWorkouts hook
- Added getExerciseSets() helper to WorkoutsDB for the records route to get raw set data with workout dates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reverted shadcn card.tsx overwrite**
- **Found during:** Task 1 (shadcn chart installation)
- **Issue:** `pnpm dlx shadcn@latest add chart` overwrote card.tsx with an older forwardRef-based version that removed CardAction export, which would break existing components
- **Fix:** Reverted card.tsx via `git checkout -- components/ui/card.tsx`
- **Files modified:** components/ui/card.tsx (reverted)
- **Verification:** card.tsx back to original with CardAction export intact

**2. [Rule 3 - Blocking] Added getExerciseSets() method to WorkoutsDB**
- **Found during:** Task 2 (records route implementation)
- **Issue:** The records API route needs raw completed sets with workout dates for computePersonalRecords(), but no existing method provides this data shape
- **Fix:** Added getExerciseSets() method that fetches all completed normal sets for an exercise enriched with workout_started_at
- **Files modified:** lib/db/workouts.ts
- **Verification:** Type check passes, records route compiles

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data layer components ready for Plan 02 (Workout History UI) and Plan 03 (Progression Charts)
- shadcn chart component installed and available for ExerciseProgressChart
- SWR hooks ready for direct consumption by UI components
- PR detection logic ready for mid-workout PR banner (Plan 04)

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (5df0050, 69b6a99) verified in git log.

---
*Phase: 21-history-personal-records-progression*
*Completed: 2026-02-24*
