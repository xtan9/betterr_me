---
phase: 18-database-foundation-exercise-library
plan: 03
subsystem: ui
tags: [settings, sidebar, navigation, i18n, weight-unit, workouts, next-intl, lucide-react]

# Dependency graph
requires:
  - phase: 18-01
    provides: "weight_unit field in preferencesSchema, fitness TypeScript types"
provides:
  - WeightUnitSelector component for kg/lbs preference in Settings
  - Workouts sidebar nav item with Dumbbell icon
  - Placeholder /workouts page with SidebarShell layout
  - i18n strings for exercises (16 muscle groups, 9 equipment, 8 exercise types), workouts, settings.weightUnit in all 3 locales
affects: [19-workout-session-ui, 20-exercise-library-routines]

# Tech tracking
tech-stack:
  added: []
  patterns: [weight-unit-toggle-group, placeholder-coming-soon-page]

key-files:
  created:
    - components/settings/weight-unit-selector.tsx
    - app/workouts/page.tsx
    - app/workouts/layout.tsx
  modified:
    - components/settings/settings-content.tsx
    - components/layouts/app-sidebar.tsx
    - tests/components/layouts/app-sidebar.test.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "WeightUnitSelector follows ToggleGroup pattern matching existing WeekStartSelector for UI consistency"
  - "Workouts added as 4th nav item after Tasks — no badge counts per Pitfall 5 from RESEARCH.md"
  - "Exercise i18n uses nested muscleGroups/equipmentTypes/exerciseTypes sub-objects for structured lookups"

patterns-established:
  - "Weight unit preference: controlled ToggleGroup with ?? 'kg' default for existing users without the field"
  - "Placeholder pages: server component with PageHeader + centered Card + icon + coming-soon message"

requirements-completed: [SETT-01, SETT-02, SETT-03]

# Metrics
duration: 8min
completed: 2026-02-23
---

# Phase 18 Plan 03: Settings, Navigation & i18n Summary

**Weight unit kg/lbs toggle in Settings, Workouts sidebar nav with Dumbbell icon, placeholder /workouts page, and comprehensive i18n strings for exercises, workouts, and settings across all 3 locales**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-23T21:37:14Z
- **Completed:** 2026-02-23T21:45:56Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- WeightUnitSelector component using ToggleGroup pattern, saving kg/lbs preference via existing PATCH /api/profile/preferences endpoint
- Workouts nav item with Dumbbell icon in sidebar (4th position), with /workouts placeholder page wrapped in SidebarShell
- 85+ new i18n keys across 3 locale files covering exercises (muscle groups, equipment, exercise types, CRUD operations), workouts placeholder, and settings weight unit

## Task Commits

Each task was committed atomically:

1. **Task 1: Add weight unit preference to Settings** - `4d05fae` (feat)
2. **Task 2: Add Workouts sidebar nav item and placeholder page** - `d5050a7` (feat)
3. **Task 3: Add i18n strings for all Phase 18 features** - `af0263d` (feat)

## Files Created/Modified
- `components/settings/weight-unit-selector.tsx` - Controlled ToggleGroup component for kg/lbs selection
- `components/settings/settings-content.tsx` - Added weightUnit state, initialization, save payload, and Card section
- `components/layouts/app-sidebar.tsx` - Added Dumbbell import and workouts nav item to mainNavItems array
- `app/workouts/layout.tsx` - SidebarShell wrapper layout for workouts section
- `app/workouts/page.tsx` - Server component placeholder with PageHeader and coming-soon card
- `tests/components/layouts/app-sidebar.test.tsx` - Updated assertions for 4 nav items including /workouts
- `i18n/messages/en.json` - Added workouts nav, exercises namespace, settings.weightUnit, workouts namespace
- `i18n/messages/zh.json` - Simplified Chinese translations with standard fitness terminology
- `i18n/messages/zh-TW.json` - Traditional Chinese translations with standard fitness terminology

## Decisions Made
- Used ToggleGroup (same as WeekStartSelector) for weight unit selection rather than Button-based toggle, maintaining UI consistency
- Added Workouts as 4th sidebar nav item without badge counts (no workout count endpoint needed yet per Pitfall 5 in RESEARCH.md)
- Organized exercise i18n with nested sub-objects (muscleGroups, equipmentTypes, exerciseTypes) for cleaner lookups in Phase 20 exercise library UI

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Weight unit preference is saved and readable via existing profile API
- Workouts section is navigable from sidebar, ready for Phase 19 workout session UI
- All Phase 18 i18n strings are in place for Phase 19-21 UI development
- All 1311 existing tests pass with no regressions
- Production build succeeds with /workouts route registered

## Self-Check: PASSED

- All 3 created files verified as existing on disk
- All 3 task commits verified in git log (4d05fae, d5050a7, af0263d)
- SUMMARY.md verified as existing

---
*Phase: 18-database-foundation-exercise-library*
*Completed: 2026-02-23*
