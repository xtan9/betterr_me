---
phase: 19-workout-logging-core-loop
plan: 05
subsystem: ui
tags: [react, shadcn, sheet, alert-dialog, swr, rest-timer, workout, fitness]

# Dependency graph
requires:
  - phase: 19-workout-logging-core-loop
    provides: "useExercises hook, ExerciseFilterBar, rest timer hook (useRestTimer) from Plans 02-03"
  - phase: 18-database-foundation
    provides: "WorkoutWithExercises type, Exercise type, exercise library components"
provides:
  - "Exercise picker sheet for adding exercises to workout via searchable/filterable bottom sheet"
  - "Rest timer floating display with -15s/+15s adjustment and skip buttons"
  - "Finish workout confirmation dialog with summary stats (duration, exercises, sets, volume)"
  - "Discard workout confirmation dialog with destructive styling"
  - "Resume active workout banner on workouts landing page"
  - "Start Workout button on workouts page (hidden when active workout exists)"
affects: [19-06-PLAN (workout logger assembly), workout-logger integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Bottom sheet exercise picker reusing existing filter components", "Floating fixed-position rest timer overlay", "Parent-computed duration prop to satisfy React compiler purity rules", "Ref-based time snapshot to avoid impure Date.now() in render"]

key-files:
  created:
    - components/fitness/workout-logger/workout-add-exercise.tsx
    - components/fitness/workout-logger/workout-rest-timer.tsx
    - components/fitness/workout-logger/workout-finish-dialog.tsx
    - components/fitness/workout-logger/workout-discard-dialog.tsx
    - components/fitness/workout-resume-banner.tsx
    - components/fitness/start-workout-button.tsx
  modified:
    - app/workouts/page.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Duration prop pattern: WorkoutFinishDialog accepts durationSeconds as prop (parent computes via Date.now() in event handler) to satisfy React compiler purity rules"
  - "Ref-based time snapshot in WorkoutResumeBanner avoids impure Date.now() during render"
  - "Exercise picker uses bottom Sheet on mobile (h-85vh) with grouped exercises by muscle group"
  - "StartWorkoutButton as separate client component to keep workouts page as server component"

patterns-established:
  - "Bottom sheet picker: Sheet + existing filter components for item selection workflows"
  - "React compiler Date.now() pattern: compute time-dependent values in event handlers or refs, pass as props"

requirements-completed: [WLOG-02, WLOG-07, WLOG-08, REST-01, REST-02, REST-03, REST-04, REST-05]

# Metrics
duration: 10min
completed: 2026-02-24
---

# Phase 19 Plan 05: Workout Supporting UI Components Summary

**Exercise picker sheet, rest timer floating display, finish/discard dialogs, and resume banner with start workout button for workouts landing page**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-24T05:11:29Z
- **Completed:** 2026-02-24T05:21:51Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Exercise picker sheet with searchable/filterable list reusing useExercises hook and ExerciseFilterBar
- Rest timer floating banner with countdown display (M:SS), -15s/+15s adjust buttons, skip, and pulse animation on completion
- Finish workout dialog showing summary stats (duration, exercises, sets completed, total volume)
- Discard workout dialog with destructive confirmation styling
- Resume active workout banner on workouts page (non-blocking inline banner, not modal)
- Start Workout button integrated in PageHeader, hidden when active workout exists
- i18n translations added for all new strings across all three locales (en, zh, zh-TW)
- All 1311 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Exercise picker sheet and rest timer display** - `1d54ebe` (feat)
2. **Task 2: Finish/discard dialogs, resume banner, and workouts page update** - `3a55e1a` (feat)

## Files Created/Modified
- `components/fitness/workout-logger/workout-add-exercise.tsx` - Exercise picker bottom sheet with filter bar and grouped exercise list
- `components/fitness/workout-logger/workout-rest-timer.tsx` - Floating rest timer countdown with -15s/+15s/skip controls
- `components/fitness/workout-logger/workout-finish-dialog.tsx` - Finish workout AlertDialog with 4-stat summary grid
- `components/fitness/workout-logger/workout-discard-dialog.tsx` - Discard workout AlertDialog with destructive confirm
- `components/fitness/workout-resume-banner.tsx` - Inline resume banner with SWR active workout check
- `components/fitness/start-workout-button.tsx` - Start Workout button with POST /api/workouts and 409 redirect
- `app/workouts/page.tsx` - Updated with resume banner, start workout button, removed coming soon card
- `i18n/messages/en.json` - 17 new workout translation keys
- `i18n/messages/zh.json` - 17 new workout translation keys (Simplified Chinese)
- `i18n/messages/zh-TW.json` - 17 new workout translation keys (Traditional Chinese)

## Decisions Made
- WorkoutFinishDialog accepts `durationSeconds` as prop rather than computing Date.now() internally, to satisfy React compiler purity rules that forbid impure function calls during render
- WorkoutResumeBanner uses a ref-based time snapshot (computed when workout data changes) instead of calling Date.now() directly in the render path
- Exercise picker uses h-85vh bottom Sheet for near-full-screen picker on mobile with scrollable exercise list
- StartWorkoutButton created as separate client component to keep the workouts page as a server component (consistent with Phase 18-04 pattern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed React compiler purity violation in WorkoutFinishDialog**
- **Found during:** Task 2 (Finish dialog)
- **Issue:** Date.now() called inside useMemo during render, flagged as impure function by React compiler lint rule
- **Fix:** Refactored duration computation to accept as a prop from parent (computed in event handler)
- **Files modified:** components/fitness/workout-logger/workout-finish-dialog.tsx
- **Verification:** `pnpm lint` passes with 0 errors
- **Committed in:** 3a55e1a (Task 2 commit)

**2. [Rule 1 - Bug] Fixed React compiler purity violation in WorkoutResumeBanner**
- **Found during:** Task 2 (Resume banner)
- **Issue:** Date.now() called directly in render path for elapsed time computation
- **Fix:** Used useRef to snapshot elapsed time when workout data arrives (only on ID change)
- **Files modified:** components/fitness/workout-resume-banner.tsx
- **Verification:** `pnpm lint` passes with 0 errors
- **Committed in:** 3a55e1a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for React compiler compliance. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 5 planned UI components are ready for the workout logger assembly (Plan 06)
- Exercise picker reuses existing useExercises hook with same filtering pattern
- Rest timer display accepts props matching useRestTimer hook's return type
- Finish/discard dialogs follow the existing AlertDialog pattern (ProjectDeleteDialog style)
- Resume banner uses lightweight SWR fetch to /api/workouts/active with 30s dedup
- StartWorkoutButton shares SWR key with resume banner for automatic deduplication

## Self-Check: PASSED

All 6 created files verified present. Both task commits (1d54ebe, 3a55e1a) verified in git log.

---
*Phase: 19-workout-logging-core-loop*
*Completed: 2026-02-24*
