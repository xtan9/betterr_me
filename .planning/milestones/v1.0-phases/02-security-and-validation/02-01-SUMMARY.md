---
phase: 02-security-and-validation
plan: 01
subsystem: api, validation, auth
tags: [zod, supabase, validation, redirect-allowlist, ensureProfile]

# Dependency graph
requires:
  - phase: 01-frequency-correctness
    provides: "Stable HabitsDB class and existing validation schemas"
provides:
  - "validateRequestBody shared helper for all POST/PATCH routes"
  - "habitUpdateSchema, taskUpdateSchema, profileUpdateSchema for PATCH routes"
  - "preferencesSchema for preferences PATCH route"
  - "ensureProfile helper for safe profile auto-creation"
  - "getActiveHabitCount method on HabitsDB"
  - "getSafeRedirectPath function with redirect allowlist"
  - "MAX_HABITS_PER_USER constant"
affects: [02-02-api-route-hardening, 02-03-auth-route-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "validateRequestBody discriminated union pattern for API route validation"
    - "Update schemas via formSchema.partial().extend() for PATCH routes"
    - "Redirect allowlist with exact + prefix matching"
    - "Race-condition-safe profile creation via 23505 catch"

key-files:
  created:
    - lib/validations/api.ts
    - lib/validations/preferences.ts
    - lib/db/ensure-profile.ts
    - lib/auth/redirect.ts
    - lib/constants.ts
  modified:
    - lib/validations/habit.ts
    - lib/validations/task.ts
    - lib/validations/profile.ts
    - lib/db/habits.ts

key-decisions:
  - "Update schemas use .partial().extend() to allow any subset of fields"
  - "ensureProfile uses 'no-email-{userId}' fallback to avoid UNIQUE constraint violation for emailless users"
  - "getActiveHabitCount counts both 'active' and 'paused' habits (archived = soft-deleted, excluded)"
  - "getSafeRedirectPath uses exact match + prefix match pattern for flexibility"

patterns-established:
  - "validateRequestBody: all API routes use this for consistent validation + error format"
  - "Update schemas: .partial() base + .extend() for status/extra fields + .refine() non-empty check"
  - "Redirect allowlist: exact paths + prefix patterns, preserving query params on match"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 2 Plan 1: Shared Validation Infrastructure Summary

**Zod validation helpers, update schemas for all PATCH routes, ensureProfile with race-condition handling, redirect allowlist, and habit count limit constant**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T05:09:27Z
- **Completed:** 2026-02-16T05:13:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created validateRequestBody shared helper with discriminated union return type for consistent API validation
- Added update schemas (habitUpdateSchema, taskUpdateSchema, profileUpdateSchema) using .partial() pattern
- Created preferencesSchema for the preferences PATCH route
- Built ensureProfile helper with race-condition safety (catches 23505 unique_violation)
- Added getActiveHabitCount method to HabitsDB counting active + paused habits
- Created getSafeRedirectPath with allowlist to prevent open-redirect vulnerabilities
- Established MAX_HABITS_PER_USER = 20 constant

## Task Commits

Each task was committed atomically:

1. **Task 1: Create validation helper, update schemas, and preferences schema** - `e6bf02f` (feat)
2. **Task 2: Create ensureProfile helper, getActiveHabitCount method, redirect allowlist, and constants** - `85d30b2` (feat)

## Files Created/Modified
- `lib/validations/api.ts` - validateRequestBody shared helper with discriminated union types
- `lib/validations/preferences.ts` - preferencesSchema for date_format, week_start_day, theme
- `lib/validations/habit.ts` - Added habitUpdateSchema and HabitUpdateValues type
- `lib/validations/task.ts` - Added taskUpdateSchema and TaskUpdateValues type
- `lib/validations/profile.ts` - Added profileUpdateSchema and ProfileUpdateValues type
- `lib/db/ensure-profile.ts` - ensureProfile helper with race-condition handling
- `lib/db/habits.ts` - Added getActiveHabitCount method to HabitsDB class
- `lib/auth/redirect.ts` - getSafeRedirectPath with allowlist and prefix matching
- `lib/constants.ts` - MAX_HABITS_PER_USER = 20

## Decisions Made
- Update schemas use `.partial().extend()` to allow any subset of fields while adding status/extra fields
- ensureProfile uses `no-email-{userId}` fallback rather than empty string to avoid UNIQUE constraint violations for multiple emailless users
- getActiveHabitCount counts both `active` and `paused` habits toward the limit (archived = soft-deleted, excluded)
- getSafeRedirectPath uses exact path match + prefix match dual strategy for flexibility while maintaining security

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failures in `.worktrees/` directory (52 test files, 573 tests) are from a separate worktree and unrelated to our changes. All 74 test files and 939 tests in the main codebase pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All shared infrastructure ready for Plan 02 (API route hardening) and Plan 03 (auth route hardening)
- validateRequestBody, update schemas, ensureProfile, getActiveHabitCount, getSafeRedirectPath, and MAX_HABITS_PER_USER are all importable
- Zero test regressions, clean build

## Self-Check: PASSED

All 9 files verified (5 created, 4 modified). Both commits (e6bf02f, 85d30b2) confirmed in git log. All 9 expected exports found.

---
*Phase: 02-security-and-validation*
*Completed: 2026-02-16*
