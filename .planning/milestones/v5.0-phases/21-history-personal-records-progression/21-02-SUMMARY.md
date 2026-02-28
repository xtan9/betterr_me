---
phase: 21-history-personal-records-progression
plan: 02
subsystem: ui, api
tags: [dashboard, workout-stats, supabase, next-intl, swr, tailwind]

# Dependency graph
requires:
  - phase: 18-fitness-foundation
    provides: workouts table schema and WorkoutsDB
  - phase: 19-active-workout
    provides: completed workout data in workouts table
provides:
  - Dashboard API workout stats (last_workout_at, week_workout_count)
  - WorkoutStatsWidget component for dashboard
  - Purple stat-icon color variant in design system
affects: [21-03, 21-04, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.resolve() wrapper for Supabase thenable-to-Promise conversion (enables .catch())"
    - "Conditional dashboard widget rendering based on non-null/non-zero data check"

key-files:
  created:
    - components/dashboard/workout-stats-widget.tsx
  modified:
    - app/api/dashboard/route.ts
    - lib/db/types.ts
    - components/dashboard/dashboard-content.tsx
    - app/dashboard/page.tsx
    - app/globals.css
    - tailwind.config.ts
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/app/api/dashboard/route.test.ts

key-decisions:
  - "Promise.resolve() wrapper for Supabase queries to convert PromiseLike to Promise (enables .catch() for graceful fallback)"
  - "Purple stat-icon color added to design system for workout theme differentiation"
  - "Server-rendered dashboard page returns null/0 workout defaults — SWR hydrates real values from API"

patterns-established:
  - "Supabase thenable wrapping: Promise.resolve(supabase.from(...).select(...)) for .catch() support"
  - "Dashboard widget conditional rendering: hide section when all values are null/zero"

requirements-completed: [HIST-06, I18N-01]

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 21 Plan 02: Dashboard Workout Stats Summary

**Dashboard API extended with workout stats (last_workout_at, week_workout_count) and WorkoutStatsWidget showing relative dates and weekly count**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-24T22:43:05Z
- **Completed:** 2026-02-24T22:49:30Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Extended DashboardData type and API to return last_workout_at and week_workout_count
- Created WorkoutStatsWidget with Dumbbell icon, relative date formatting, and weekly count
- Added purple stat-icon color variant to design system (light + dark mode)
- All workout dashboard strings translated in en, zh, zh-TW
- Widget conditionally hidden for users with no workout data

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend dashboard API with workout stats** - `d671d50` (feat)
2. **Task 2: Create workout stats widget and integrate into dashboard** - `e001de8` (feat)

## Files Created/Modified
- `lib/db/types.ts` - Added last_workout_at and week_workout_count to DashboardData stats
- `app/api/dashboard/route.ts` - Two new Supabase workout queries in supplementary Promise.all
- `app/dashboard/page.tsx` - Default null/0 workout values for server-rendered page
- `components/dashboard/workout-stats-widget.tsx` - New widget with relative date logic
- `components/dashboard/dashboard-content.tsx` - Integrated WorkoutStatsWidget with conditional rendering
- `app/globals.css` - Purple stat-icon CSS variables (light + dark)
- `tailwind.config.ts` - Purple stat-icon Tailwind color tokens
- `i18n/messages/en.json` - Workout stats dashboard strings (English)
- `i18n/messages/zh.json` - Workout stats dashboard strings (Simplified Chinese)
- `i18n/messages/zh-TW.json` - Workout stats dashboard strings (Traditional Chinese)
- `tests/app/api/dashboard/route.test.ts` - Updated mock with Supabase from() for workout queries

## Decisions Made
- Used `Promise.resolve()` wrapper on Supabase queries because Supabase `.then()` returns a `PromiseLike` (not a full `Promise`), which lacks `.catch()`. Wrapping converts it to a proper Promise for graceful degradation.
- Added purple stat-icon color variant to design system (HSL 270) to visually differentiate workout stats from existing blue (habits) and orange (streaks) cards.
- Server-rendered dashboard page provides `last_workout_at: null` and `week_workout_count: 0` as defaults; SWR revalidation from the API fills in real values on the client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Supabase PromiseLike lacks .catch() method**
- **Found during:** Task 1 (Extend dashboard API with workout stats)
- **Issue:** TypeScript error: `.catch()` does not exist on type `PromiseLike<any>`. Supabase client returns thenables, not full Promises.
- **Fix:** Wrapped Supabase query chains with `Promise.resolve()` before chaining `.then()` and `.catch()`
- **Files modified:** `app/api/dashboard/route.ts`
- **Verification:** `pnpm tsc --noEmit` passes
- **Committed in:** d671d50

**2. [Rule 3 - Blocking] Missing purple stat-icon color in design system**
- **Found during:** Task 2 (Create workout stats widget)
- **Issue:** Plan specified Dumbbell icon with styled container but no purple color existed in the stat-icon palette
- **Fix:** Added `--stat-icon-purple` / `--stat-icon-purple-bg` CSS variables (light + dark mode) and Tailwind tokens
- **Files modified:** `app/globals.css`, `tailwind.config.ts`
- **Verification:** Component renders with correct purple icon background
- **Committed in:** e001de8

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for the code to compile and render correctly. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard workout stats are live; users see fitness activity at a glance
- Ready for Phase 21-03 (exercise history) and 21-04 (progression charts)
- Workout stats widget pattern can be extended for more fitness metrics

---
*Phase: 21-history-personal-records-progression*
*Completed: 2026-02-24*
