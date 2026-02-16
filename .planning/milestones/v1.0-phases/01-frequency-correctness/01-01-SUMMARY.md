---
phase: 01-frequency-correctness
plan: 01
subsystem: api
tags: [frequency, weekly, times_per_week, shouldTrackOnDate, streak, stats, insights]

# Dependency graph
requires: []
provides:
  - "Canonical shouldTrackOnDate returning true for weekly frequency (any day counts)"
  - "Deduplicated shouldTrackOnDate: single definition in lib/habits/format.ts"
  - "Weekly streak calculation via calculateWeeklyStreak with targetPerWeek=1"
  - "Week-level stats evaluation for weekly habits in getDetailedHabitStats"
  - "Week-level counting in getScheduledDays for weekly frequency"
  - "Week-level per-habit rates in computePerHabitRates for weekly/times_per_week"
  - "computePerDayRates skips weekly/times_per_week (not meaningful for week-level habits)"
affects: [01-frequency-correctness, habit-detail, dashboard, insights]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Weekly frequency uses same week-level evaluation pattern as times_per_week across all callers"
    - "shouldTrackOnDate is the single source of truth for scheduling, callers handle week-level aggregation"

key-files:
  created: []
  modified:
    - lib/habits/format.ts
    - lib/db/habit-logs.ts
    - lib/db/habits.ts
    - lib/db/insights.ts
    - tests/lib/habits/format.test.ts
    - tests/lib/habits/heatmap.test.ts
    - tests/lib/habits/absence.test.ts
    - tests/lib/db/habit-logs.test.ts

key-decisions:
  - "shouldTrackOnDate for weekly returns true for all days (consistent with times_per_week, simplest approach)"
  - "Callers that need week-level evaluation handle it in their own logic (stats, insights, getScheduledDays)"
  - "computeMissedDays keeps day-level granularity for weekly (counts days since last completion, useful for absence indicators)"
  - "Heatmap uses shouldTrackOnDate directly (weekly shows all days as trackable, showing which day user actually completed)"

patterns-established:
  - "Week-level evaluation pattern: check frequency.type === 'weekly' || 'times_per_week', compute targetPerWeek, delegate to shared weekly logic"
  - "Single shouldTrackOnDate definition: all consumers import from lib/habits/format.ts, never duplicate"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 1 Plan 1: Fix Weekly Frequency Summary

**Fixed shouldTrackOnDate weekly hardcoding (Monday-only to any-day), deduplicated across codebase, updated 6 consumer modules to use correct week-level evaluation for weekly habits**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T03:52:58Z
- **Completed:** 2026-02-16T03:57:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Fixed shouldTrackOnDate to return true for all days when frequency is weekly (was hardcoded to Monday)
- Removed duplicate private shouldTrackOnDate from HabitLogsDB, consolidated to single import from format.ts
- Routed weekly frequency through calculateWeeklyStreak (targetPerWeek=1) and getTimesPerWeekStats (targetPerWeek=1) for correct streak and stats calculations
- Updated getScheduledDays to count weeks (not individual days) for weekly frequency
- Updated insights computePerHabitRates to use week-level evaluation and computePerDayRates to skip weekly/times_per_week
- Updated 4 test files: replaced 4 tests asserting buggy behavior, added 2 new weekly frequency tests
- All 939 tests pass, lint clean, build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix shouldTrackOnDate, deduplicate, and update all consumer modules** - `ca27e0c` (fix)
2. **Task 2: Update all tests to assert correct frequency behavior** - `d7fc769` (test)

## Files Created/Modified
- `lib/habits/format.ts` - Changed weekly case from dayOfWeek===1 to true
- `lib/db/habit-logs.ts` - Removed duplicate shouldTrackOnDate, added import, routed weekly to calculateWeeklyStreak and getTimesPerWeekStats
- `lib/db/habits.ts` - Updated getScheduledDays to count weeks for weekly frequency
- `lib/db/insights.ts` - Updated computePerHabitRates for week-level evaluation, computePerDayRates to skip weekly/times_per_week
- `tests/lib/habits/format.test.ts` - Replaced "weekly tracks only Monday" with "weekly tracks every day"
- `tests/lib/habits/heatmap.test.ts` - Replaced "only Monday is scheduled" with "all days are scheduled"
- `tests/lib/habits/absence.test.ts` - Updated weekly absence tests with correct day-level expected counts
- `tests/lib/db/habit-logs.test.ts` - Added weekly frequency tests for getDetailedHabitStats and calculateStreak

## Decisions Made
- shouldTrackOnDate for weekly returns true for all days (consistent with times_per_week, per user decision in Phase 1 context)
- Callers that need week-level evaluation (stats, insights, getScheduledDays) handle it in their own logic
- computeMissedDays keeps day-level granularity for weekly (counts consecutive days without completion, useful for absence indicators)
- Heatmap uses shouldTrackOnDate directly (weekly shows all days as trackable)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All frequency calculation logic is now correct for weekly and times_per_week
- Ready for Plan 02 (if applicable) or next phase
- No blockers or concerns

## Self-Check: PASSED

All 8 modified files verified present. Both task commits (ca27e0c, d7fc769) verified in git log. 939/939 tests passing. Build succeeds. Lint clean.

---
*Phase: 01-frequency-correctness*
*Completed: 2026-02-16*
