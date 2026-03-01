---
phase: 20-routines-templates
plan: 03
subsystem: ui
tags: [routines, i18n, workouts-page, finish-dialog, save-as-routine, fitness]

# Dependency graph
requires:
  - phase: 20-routines-templates
    provides: "RoutineCard, useRoutines hook, RoutineForm components, save-as-routine API endpoint"
provides:
  - "WorkoutsPageRoutines client component integrating routines into workouts landing page"
  - "Save as Routine expandable section in workout finish dialog"
  - "Complete i18n coverage for routines across en, zh, zh-TW (67 keys per locale)"
affects: [21-workout-history]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Client component extraction for server page hybrid rendering (WorkoutsPageRoutines)"]

key-files:
  created:
    - components/fitness/workouts-page-routines.tsx
  modified:
    - app/workouts/page.tsx
    - components/fitness/workout-logger/workout-finish-dialog.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "WorkoutsPageRoutines as separate client component keeps workouts page server-rendered for PageHeader"
  - "Edit/delete on landing page cards redirect to /workouts/routines management page instead of inline CRUD"
  - "Save as Routine uses expandable accordion pattern to keep finish dialog clean by default"

patterns-established:
  - "Hybrid server/client page pattern: server component for static content + client component for SWR-powered sections"

requirements-completed: [ROUT-01, ROUT-02, ROUT-03, ROUT-04]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 20 Plan 03: Routines Integration & i18n Summary

**Workouts landing page with routine cards and start-from-routine flow, save-as-routine in finish dialog, and complete 3-locale i18n coverage (67 keys per locale)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T19:29:24Z
- **Completed:** 2026-02-24T19:33:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- WorkoutsPageRoutines client component showing up to 3 routine cards with start buttons on the workouts landing page, with loading skeleton, empty state prompt, and manage routines link
- Save as Routine expandable section in workout finish dialog with name input, pre-filled workout title, API call to save-as-routine endpoint, and success/error toasts
- 20+ new i18n keys added to all 3 locale files (en, zh, zh-TW) for save-as-routine, manage routines, empty states, target fields, and confirmation messages
- All 1311 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire routines into workouts landing page and finish dialog** - `4e7d25b` (feat)
2. **Task 2: Add i18n translations for routines in all 3 locales** - `23b898d` (feat)

## Files Created/Modified
- `components/fitness/workouts-page-routines.tsx` - Client component rendering My Routines section with routine cards, start buttons, and empty state
- `app/workouts/page.tsx` - Updated to include WorkoutsPageRoutines between resume banner and exercise library
- `components/fitness/workout-logger/workout-finish-dialog.tsx` - Added Save as Routine expandable section with name input and API integration
- `i18n/messages/en.json` - Added 20+ routine i18n keys and workouts namespace routine section keys
- `i18n/messages/zh.json` - Added matching Simplified Chinese translations
- `i18n/messages/zh-TW.json` - Added matching Traditional Chinese translations

## Decisions Made
- WorkoutsPageRoutines as a separate client component keeps the workouts page.tsx server-rendered for getTranslations on the PageHeader
- Edit/delete actions on landing page routine cards redirect to /workouts/routines management page rather than duplicating inline CRUD logic
- Save as Routine uses an expandable accordion-style toggle to keep the finish dialog clean by default, only showing the input when the user wants to save
- Routine name input is pre-filled with the workout title when the user expands the save-as-routine section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete routine workflow is now accessible end-to-end: create routine -> add exercises -> start workout from routine -> finish workout -> save as routine
- All routine UI strings translated in 3 locales
- Phase 20 (Routines & Templates) is fully complete
- Ready for Phase 21 (Workout History) which can build on the routine and workout data

## Self-Check: PASSED

All 6 files verified present. Both task commits (4e7d25b, 23b898d) verified in git log.

---
*Phase: 20-routines-templates*
*Completed: 2026-02-24*
