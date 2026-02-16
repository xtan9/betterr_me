---
phase: 03-code-quality
plan: 01
subsystem: api, ui
tags: [logger, next-themes, supabase, dependency-injection, typescript]

# Dependency graph
requires:
  - phase: 02-security-and-validation
    provides: "Validated API routes and DB classes"
provides:
  - "lib/logger.ts thin logger wrapper (log.error, log.warn, log.info)"
  - "Clean theme-switcher with no manual DOM manipulation"
  - "Hardened DB constructors requiring explicit Supabase client"
  - "ThemeProvider disableTransitionOnChange for instant theme swap"
affects: [03-code-quality plan 02, future Sentry integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Logger facade pattern: log.error(message, error?, context?) for future Sentry swap"
    - "Required constructor params for DB classes (dependency injection)"
    - "disableTransitionOnChange on ThemeProvider for instant theme switching"

key-files:
  created:
    - "lib/logger.ts"
  modified:
    - "components/theme-switcher.tsx"
    - "app/layout.tsx"
    - "tests/components/theme-switcher.test.tsx"
    - "lib/db/habits.ts"
    - "lib/db/habit-logs.ts"
    - "lib/db/tasks.ts"
    - "lib/db/profiles.ts"

key-decisions:
  - "Logger uses (message, error?, context?) signature to match future Sentry.captureException API"
  - "All four DB classes hardened (not just HabitLogsDB) for consistency"
  - "Singleton exports pass createClient() explicitly instead of relying on optional fallback"

patterns-established:
  - "Logger facade: import { log } from '@/lib/logger' for all server-side logging"
  - "DB class instantiation: always pass Supabase client explicitly"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 3 Plan 01: Logger, Theme-Switcher Fix, and DB Constructor Hardening Summary

**Thin logger wrapper at lib/logger.ts, removed manual DOM class manipulation from theme-switcher, and hardened all four DB class constructors to require explicit Supabase client**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T18:06:12Z
- **Completed:** 2026-02-16T18:11:41Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Created `lib/logger.ts` with `log.error`, `log.warn`, `log.info` methods designed for one-file Sentry swap
- Removed manual DOM class manipulation and debug console.logs from theme-switcher; added `disableTransitionOnChange` to ThemeProvider
- Made Supabase client required in HabitsDB, HabitLogsDB, TasksDB, and ProfilesDB constructors -- `new HabitLogsDB()` without args is now a compile error

## Task Commits

Each task was committed atomically:

1. **Task 1: Create thin logger wrapper module** - `16803c8` (feat)
2. **Task 2: Fix theme-switcher and add disableTransitionOnChange** - `69ebdd0` (fix)
3. **Task 3: Harden DB class constructors to require Supabase client** - `0fdf974` (fix)

## Files Created/Modified
- `lib/logger.ts` - Thin logger wrapper with error/warn/info methods and LogContext support
- `components/theme-switcher.tsx` - Removed second useEffect (DOM manipulation + console.logs), added explanatory comment
- `app/layout.tsx` - Added `disableTransitionOnChange` prop to ThemeProvider
- `tests/components/theme-switcher.test.tsx` - Removed DOM manipulation tests, added negative assertion test
- `lib/db/habits.ts` - Required SupabaseClient constructor, explicit createClient() in singleton
- `lib/db/habit-logs.ts` - Required SupabaseClient constructor, explicit createClient() in singleton
- `lib/db/tasks.ts` - Required SupabaseClient constructor, explicit createClient() in singleton
- `lib/db/profiles.ts` - Required SupabaseClient constructor, explicit createClient() in singleton

## Decisions Made
- Logger `error` method signature uses `(message, error?, context?)` to match Sentry's `captureException(error, { extra: context })` -- this means the Sentry swap changes only 3 function bodies in one file
- All four DB classes were hardened (HabitsDB, HabitLogsDB, TasksDB, ProfilesDB), not just HabitLogsDB as minimally required, for consistency with InsightsDB and HabitMilestonesDB which already require the client
- Singleton exports updated to `new XxxDB(createClient())` making the browser client dependency explicit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Vitest picks up test files from `.worktrees/feature-ui-style-redesign/` directory alongside main project tests. The worktree tests fail due to React useState issues (different node_modules). This is a pre-existing configuration issue unrelated to this plan. All actual project tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Logger module ready for Plan 02 to use when converting console.error calls to log.error
- Theme-switcher clean, no further work needed
- DB constructors hardened, call sites already pass clients explicitly in API routes

## Self-Check: PASSED

- lib/logger.ts: FOUND
- components/theme-switcher.tsx: FOUND
- 03-01-SUMMARY.md: FOUND
- Commit 16803c8 (Task 1): FOUND
- Commit 69ebdd0 (Task 2): FOUND
- Commit 0fdf974 (Task 3): FOUND

---
*Phase: 03-code-quality*
*Completed: 2026-02-16*
