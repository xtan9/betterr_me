---
phase: 29-exercise-detail-page
plan: 02
subsystem: ui
tags: [next-link, navigation, exercise-library, workout-logger]

requires:
  - phase: 29-exercise-detail-page
    provides: Exercise detail page route at /workouts/exercises/[id]
provides:
  - Navigation links from exercise library cards to exercise detail page
  - Navigation links from workout logger exercise names to exercise detail page
affects: [exercise-detail-page, workout-logger]

tech-stack:
  added: []
  patterns:
    - "Link wrapping Card with preventDefault on interactive children"
    - "target=_blank for links that should not interrupt active workflow"

key-files:
  created: []
  modified:
    - components/fitness/exercise-library/exercise-card.tsx
    - components/fitness/workout-logger/workout-exercise-card.tsx

key-decisions:
  - "Used preventDefault/stopPropagation on dropdown trigger and content to prevent Link navigation when interacting with edit/delete menu"
  - "Workout logger exercise name opens in new tab to preserve active workout state"

patterns-established:
  - "Card-as-link: Wrap entire Card in Link, use preventDefault on interactive children"

requirements-completed: [DETL-05]

duration: 2min
completed: 2026-03-31
---

# Phase 29 Plan 02: Exercise Navigation Links Summary

**Added clickable navigation from exercise library cards and workout logger exercise names to the exercise detail page**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T02:11:30Z
- **Completed:** 2026-03-31T02:13:08Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Exercise library cards are now fully clickable links to /workouts/exercises/[id] with hover border effect
- Workout logger exercise names link to detail page in a new tab (preserving active workout state)
- Custom exercise dropdown (edit/delete) still works without triggering navigation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add navigation links to exercise card and workout exercise card** - `73d2391` (feat)

## Files Created/Modified
- `components/fitness/exercise-library/exercise-card.tsx` - Wrapped Card in Link, added hover:border-primary/50 effect, preventDefault on dropdown
- `components/fitness/workout-logger/workout-exercise-card.tsx` - Converted exercise name h3 to Link with target="_blank"

## Decisions Made
- Used preventDefault/stopPropagation on DropdownMenuTrigger onClick and DropdownMenuContent onClick to prevent Link navigation when interacting with the edit/delete dropdown menu on custom exercises
- Used target="_blank" on workout logger exercise link so users don't lose their active workout session when viewing exercise details

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both exercise touchpoints now link to the detail page
- Ready for end-to-end testing of the complete exercise detail flow

## Self-Check: PASSED

- [x] exercise-card.tsx exists and modified
- [x] workout-exercise-card.tsx exists and modified
- [x] Commit 73d2391 found in git log
- [x] No stubs or placeholder text detected

---
*Phase: 29-exercise-detail-page*
*Completed: 2026-03-31*
