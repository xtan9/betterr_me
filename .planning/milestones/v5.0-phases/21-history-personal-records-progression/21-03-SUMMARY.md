---
phase: 21-history-personal-records-progression
plan: 03
subsystem: ui
tags: [workout-history, workout-detail, pr-badges, swr, next-intl, shadcn-card]

# Dependency graph
requires:
  - phase: 21-history-personal-records-progression
    plan: 01
    provides: useWorkouts SWR hook, useExerciseRecords hook, WorkoutsDB.getWorkoutWithExercises, computePersonalRecords
  - phase: 19-workout-logging-core-loop
    provides: useWeightUnit hook, EXERCISE_FIELD_MAP, WorkoutExerciseCard patterns
provides:
  - WorkoutHistoryList client component for paginated workout history on workouts page
  - WorkoutHistoryCard clickable card with workout summary (date, title, volume, duration)
  - WorkoutDetailView read-only view of completed workout with exercises, sets, set type badges, and PR badges
  - /workouts/[id] server route with auth, notFound, and active workout redirect
affects: [21-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [read-only-workout-detail-view, pr-badge-display-on-history-sets, server-side-weight-unit-from-profile]

key-files:
  created:
    - components/fitness/workout-history/workout-history-card.tsx
    - components/fitness/workout-history/workout-history-list.tsx
    - components/fitness/workout-history/workout-detail-view.tsx
    - app/workouts/[id]/page.tsx
  modified:
    - app/workouts/page.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Server-side weight_unit fetch from profiles table in workout detail page (avoids client hydration mismatch)"
  - "PR badges use >= comparison against current records (marks sets that tie or beat the record)"
  - "Read-only detail view reuses EXERCISE_FIELD_MAP grid pattern from active workout but without inputs/buttons"
  - "Workout detail page fetches full WorkoutWithExercises server-side and passes to client component"

patterns-established:
  - "Server-side weight_unit extraction from Supabase profiles for server components"
  - "PR badge display pattern: amber/gold themed inline badge next to qualifying sets"
  - "Breadcrumb navigation in detail pages using Link + ChevronRight"

requirements-completed: [HIST-01, HIST-02, HIST-04, I18N-01]

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 21 Plan 03: Workout History UI Summary

**Workout history list with clickable cards on workouts page and /workouts/[id] detail view with exercise sets, set type badges, and PR badges**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-24T22:52:49Z
- **Completed:** 2026-02-24T22:58:51Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built workout history list with paginated cards showing date, title, duration, volume, and exercise names
- Created workout detail page at /workouts/[id] with full exercise breakdown, set tables, and set type badges
- Added PR badges on sets matching personal records with exercise-type-aware detection
- All UI strings translated in en, zh, and zh-TW locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Create workout history list and card components** - `e62ba5e` (feat)
2. **Task 2: Create workout detail page** - `d7fdb0b` (feat)

## Files Created/Modified
- `components/fitness/workout-history/workout-history-card.tsx` - Clickable summary card for a completed workout
- `components/fitness/workout-history/workout-history-list.tsx` - Paginated list with loading skeleton and empty state
- `components/fitness/workout-history/workout-detail-view.tsx` - Read-only view with summary stats, exercise cards, sets, PR badges
- `app/workouts/[id]/page.tsx` - Server component route with auth, notFound, active redirect, breadcrumb
- `app/workouts/page.tsx` - Added WorkoutHistoryList section below routines
- `i18n/messages/en.json` - Added history, detail, and PR badge strings
- `i18n/messages/zh.json` - Chinese simplified translations
- `i18n/messages/zh-TW.json` - Chinese traditional translations

## Decisions Made
- Fetched weight_unit server-side from profiles table in the detail page to avoid hydration mismatch (client component receives it as prop)
- PR badge comparison uses >= (not >) so that sets matching the record are highlighted, consistent with the spirit of "personal record display"
- Read-only detail view reuses the same EXERCISE_FIELD_MAP grid layout from the active workout logger but without interactive inputs
- Active (in_progress) workouts redirect to /workouts/active instead of showing the detail page

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workout history UI complete, ready for Plan 04 (Exercise Progression Charts / mid-workout PR banner)
- All components consume hooks from Plan 01 (useWorkouts, useExerciseRecords)
- PR badge pattern established for reuse in active workout logger

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (e62ba5e, d7fdb0b) verified in git log.

---
*Phase: 21-history-personal-records-progression*
*Completed: 2026-02-24*
