---
phase: 03-code-quality
plan: 02
subsystem: api
tags: [logger, cache-removal, error-handling, serverless, graceful-degradation]

# Dependency graph
requires:
  - phase: 03-code-quality
    plan: 01
    provides: "lib/logger.ts with log.error, log.warn, log.info"
provides:
  - "Zero dead code: lib/cache.ts deleted, no imports remain"
  - "Dashboard _warnings convention for graceful degradation"
  - "Consistent log.error/log.warn across all 13 server-side API routes"
  - "lib/validations/api.ts and lib/auth/redirect.ts use log.warn"
affects: [future Sentry integration, any new API routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_warnings convention: optional array in API responses for non-fatal degradation"
    - "All server-side error logging through lib/logger.ts facade"
    - "HTTP Cache-Control preserved, server-side TTLCache removed (serverless-safe)"

key-files:
  created: []
  modified:
    - "app/api/dashboard/route.ts"
    - "lib/db/types.ts"
    - "app/api/habits/[id]/stats/route.ts"
    - "app/api/habits/[id]/route.ts"
    - "app/api/habits/[id]/toggle/route.ts"
    - "app/api/habits/[id]/logs/route.ts"
    - "app/api/habits/route.ts"
    - "app/api/tasks/route.ts"
    - "app/api/tasks/[id]/route.ts"
    - "app/api/tasks/[id]/toggle/route.ts"
    - "app/api/insights/weekly/route.ts"
    - "app/api/export/route.ts"
    - "app/api/profile/route.ts"
    - "app/api/profile/preferences/route.ts"
    - "lib/validations/api.ts"
    - "lib/auth/redirect.ts"

key-decisions:
  - "HTTP Cache-Control headers preserved on stats route; only server-side TTLCache removed"
  - "_warnings array uses underscore prefix to signal metadata, only present when non-empty"
  - "computeMissedDays fallback uses zeros (mathematical identity) since no cached prior value exists"

patterns-established:
  - "_warnings convention: spread into response only when non-empty, omitted otherwise"
  - "All new API routes must import { log } from '@/lib/logger' instead of using console"

# Metrics
duration: 9min
completed: 2026-02-16
---

# Phase 3 Plan 02: Cache Removal, Dashboard Warnings, and Logger Conversion Summary

**Deleted dead in-memory cache module, added _warnings graceful degradation to dashboard, and converted all 20+ server-side console.error/warn calls to use the logger facade**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-16T18:14:09Z
- **Completed:** 2026-02-16T18:23:09Z
- **Tasks:** 3
- **Files modified:** 18 (2 deleted, 16 updated)

## Accomplishments
- Deleted `lib/cache.ts` (TTLCache) and `tests/lib/cache.test.ts` -- useless on serverless, preserved HTTP Cache-Control
- Added `_warnings` convention to dashboard route: computeMissedDays failures now surface visibly instead of being silently swallowed
- Converted all ~22 `console.error` calls and 2 `console.warn` calls across 14 server-side files to `log.error`/`log.warn`

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove in-memory cache module and all references** - `b982525` (refactor)
2. **Task 2: Add _warnings to dashboard and fix computeMissedDays error handling** - `688ff53` (feat)
3. **Task 3: Convert all server-side console.error/console.warn to logger** - `9489437` (refactor)

## Files Created/Modified
- `lib/cache.ts` - DELETED (dead in-memory TTLCache)
- `tests/lib/cache.test.ts` - DELETED (tests for deleted module)
- `lib/db/types.ts` - Added optional `_warnings?: string[]` to DashboardData
- `app/api/dashboard/route.ts` - Added logger import, _warnings array, log.error for all catch blocks
- `app/api/habits/[id]/stats/route.ts` - Removed cache logic, added logger, converted console.error
- `app/api/habits/[id]/route.ts` - Removed cache invalidation calls, added logger, converted console.error
- `app/api/habits/[id]/toggle/route.ts` - Removed cache invalidation, added logger, converted console.error
- `app/api/habits/[id]/logs/route.ts` - Added logger, converted console.error
- `app/api/habits/route.ts` - Added logger, converted console.error
- `app/api/tasks/route.ts` - Added logger, converted console.error
- `app/api/tasks/[id]/route.ts` - Added logger, converted console.error
- `app/api/tasks/[id]/toggle/route.ts` - Added logger, converted console.error
- `app/api/insights/weekly/route.ts` - Added logger, converted console.error
- `app/api/export/route.ts` - Added logger, converted console.error
- `app/api/profile/route.ts` - Added logger, converted console.error
- `app/api/profile/preferences/route.ts` - Removed cache invalidation, added logger, converted console.error
- `lib/validations/api.ts` - Added logger, converted console.warn to log.warn
- `lib/auth/redirect.ts` - Added logger, converted console.warn to log.warn
- `tests/app/api/habits/[id]/stats/route.test.ts` - Removed cache imports/tests, kept computation and Cache-Control tests
- `tests/app/api/habits/[id]/route.test.ts` - Removed cache imports/tests, kept CRUD behavior tests
- `tests/app/api/habits/[id]/toggle/route.test.ts` - Removed cache import and invalidation test
- `tests/app/api/profile/preferences/route.test.ts` - Removed cache imports/tests

## Decisions Made
- HTTP Cache-Control headers preserved on stats route since browser caching is still useful; only server-side in-memory cache removed (useless on serverless cold starts)
- `_warnings` uses underscore prefix to signal response metadata, and is only included when non-empty (no empty array noise in normal responses)
- computeMissedDays fallback uses zeros as mathematical identity for missed days -- no cached prior value is available to use as "stale data" (documented with code comment referencing RESEARCH.md Pitfall 5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Vitest picks up test files from `.worktrees/feature-ui-style-redesign/` directory causing pre-existing failures (noted in STATE.md). All actual project tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Code Quality) is now complete: logger established, all console calls converted, dead code removed, graceful degradation convention in place
- Ready for Phase 4 planning and execution
- Future Sentry integration: swap 3 function bodies in lib/logger.ts, all call sites already use the facade

## Self-Check: PASSED

- lib/cache.ts: CONFIRMED DELETED
- tests/lib/cache.test.ts: CONFIRMED DELETED
- lib/db/types.ts: FOUND
- app/api/dashboard/route.ts: FOUND
- lib/validations/api.ts: FOUND
- lib/auth/redirect.ts: FOUND
- Commit b982525 (Task 1): FOUND
- Commit 688ff53 (Task 2): FOUND
- Commit 9489437 (Task 3): FOUND

---
*Phase: 03-code-quality*
*Completed: 2026-02-16*
