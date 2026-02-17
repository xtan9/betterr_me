---
phase: 04-performance
plan: 02
subsystem: database
tags: [supabase, streak, adaptive-window, performance]

# Dependency graph
requires:
  - phase: 01-frequency-correctness
    provides: shouldTrackOnDate, calculateWeeklyStreak
provides:
  - "Adaptive lookback calculateStreak (30->60->120->240->365 day windows)"
  - "Tests proving adaptive window behavior for short, boundary, and max streaks"
affects: [habit-logs, dashboard, habit-detail]

# Tech tracking
tech-stack:
  added: []
  patterns: [adaptive-window-loop, boundary-detection-retry]

key-files:
  created: []
  modified:
    - lib/db/habit-logs.ts
    - tests/lib/db/habit-logs.test.ts

key-decisions:
  - "Adaptive window starts at 30 days, doubles on boundary hit, caps at 365"
  - "calculateWeeklyStreak left untouched; only the data-fetch layer around it changes"
  - "Boundary detection for daily uses checkDate < startDate; for weekly uses currentStreak < weeksInWindow"

patterns-established:
  - "Adaptive window loop: start small, expand on boundary hit, cap at max"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 04 Plan 02: Adaptive Streak Lookback Summary

**calculateStreak refactored from fixed 365-day fetch to adaptive 30-day starting window that doubles on boundary hit, reducing data transfer for short streaks**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T19:19:05Z
- **Completed:** 2026-02-16T19:23:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Refactored calculateStreak to start with a 30-day lookback window instead of always fetching 365 days
- Window doubles (30->60->120->240->365) only when streak reaches the boundary, reducing data transfer for the common case (short streaks)
- Added 3 targeted tests proving adaptive behavior: short streak (single query), boundary expansion (double query), and max cap (365 days)
- All 25 existing tests pass unchanged, proving behavioral equivalence

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor calculateStreak to use adaptive lookback window** - `069d861` (feat)
2. **Task 2: Add tests verifying adaptive lookback behavior** - `ec312b5` (test)

## Files Created/Modified
- `lib/db/habit-logs.ts` - calculateStreak now uses adaptive window loop (INITIAL_WINDOW=30, MAX_WINDOW=365) instead of fixed 365-day fetch
- `tests/lib/db/habit-logs.test.ts` - 3 new tests in "calculateStreak adaptive lookback" describe block verifying window behavior

## Decisions Made
- Adaptive window starts at 30 days (covers most users with short streaks) and doubles on boundary hit
- calculateWeeklyStreak left completely untouched -- only the data-fetch layer around it changes
- Boundary detection for daily/weekdays/custom uses `checkDate < startDate`; for weekly uses `currentStreak < weeksInWindow`
- Tests spy on `getLogsByDateRange` directly to verify query window sizes without needing Supabase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Streak calculation is now optimized for the common case (short streaks use ~30 days of data)
- Long streaks still correctly expand to full 365-day window
- Ready for any further performance work or next phase

## Self-Check: PASSED

- FOUND: lib/db/habit-logs.ts
- FOUND: tests/lib/db/habit-logs.test.ts
- FOUND: 04-02-SUMMARY.md
- FOUND: commit 069d861
- FOUND: commit ec312b5

---
*Phase: 04-performance*
*Completed: 2026-02-16*
