# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Every existing feature works correctly, safely, and is covered by tests
**Current focus:** Phase 4: Performance -- COMPLETE

## Current Position

Phase: 4 of 5 (Performance) -- COMPLETE
Plan: 2 of 2 in current phase -- COMPLETE
Status: Phase 04 complete, Phase 05 next
Last activity: 2026-02-16 — Plan 04-02 (adaptive streak lookback) complete

Progress: [█████████░] 90%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 5min
- Total execution time: 0.71 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-frequency-correctness | 2 | 8min | 4min |
| 02-security-and-validation | 3 | 12min | 4min |
| 03-code-quality | 2 | 14min | 7min |
| 04-performance | 2 | 9min | 4.5min |

**Recent Trend:**
- Last 5 plans: 02-03 (4min), 03-01 (5min), 03-02 (9min), 04-01 (4min), 04-02 (5min)
- Trend: Consistent

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Correctness before security — frequency bugs have highest user-visible impact (wrong completion rates)
- [Roadmap]: CORR-01 through CORR-08 must be done atomically — they share shouldTrackOnDate and 8 tests that assert incorrect behavior
- [Phase 1]: Weekly frequency = "any day that week counts" per PRD V1.2 §6.2 — no day picker, no schema migration
- [Phase 1]: CORR-03 and CORR-04 removed (day picker not needed). Requirements reduced from 28 to 26.
- [Plan 01-01]: shouldTrackOnDate for weekly returns true for all days (consistent with times_per_week)
- [Plan 01-01]: Callers handle week-level evaluation individually (stats, insights, getScheduledDays)
- [Plan 01-01]: computeMissedDays keeps day-level granularity for weekly habits (useful for absence indicators)
- [Plan 01-01]: Heatmap shows all days as trackable for weekly (shows which day user completed)
- [Plan 01-02]: WeeklyInsight uses intersection type (base & union) for discriminated union
- [Plan 01-02]: dashboard-content.tsx also needed updating (imported WeeklyInsight from component)
- [Plan 01-02]: No cast needed for next-intl t() call with union params
- [Plan 02-01]: Update schemas use .partial().extend() pattern for PATCH route validation
- [Plan 02-01]: ensureProfile uses 'no-email-{userId}' fallback for emailless users (avoids UNIQUE violation)
- [Plan 02-01]: getActiveHabitCount counts active + paused (archived excluded from limit)
- [Plan 02-01]: getSafeRedirectPath uses exact + prefix match allowlist pattern
- [Plan 02-02]: Habit/task schema fields (category, priority, due_date, due_time) made optional to match existing API contract
- [Plan 02-02]: Added .trim() to Zod name/title schemas for whitespace-only rejection parity with old validators
- [Plan 02-02]: Profile preferences uses type assertion since generic z.record() doesn't overlap concrete ProfilePreferences
- [Plan 02-03]: handle_new_user uses COALESCE with 'no-email-{id}' fallback consistent with ensureProfile
- [Plan 02-03]: EXCEPTION WHEN OTHERS in trigger logs warning but never blocks signup — ensureProfile provides defense-in-depth
- [Plan 03-01]: Logger uses (message, error?, context?) signature to match future Sentry.captureException API
- [Plan 03-01]: All four DB classes hardened (not just HabitLogsDB) for consistency
- [Plan 03-01]: Singleton exports pass createClient() explicitly instead of relying on optional fallback
- [Plan 03-02]: HTTP Cache-Control preserved on stats route; only server-side TTLCache removed (useless on serverless)
- [Plan 03-02]: _warnings convention uses underscore prefix for metadata, only present when non-empty
- [Plan 03-02]: computeMissedDays fallback uses zeros (mathematical identity) since no cached prior value exists
- [Plan 04-01]: getTaskCount mirrors getUserTasks filter logic but uses HEAD-only COUNT query
- [Plan 04-01]: tasks_completed_today uses both due_date AND is_completed:true filters (not just date filter)
- [Plan 04-02]: Adaptive window starts at 30 days, doubles on boundary hit, caps at 365
- [Plan 04-02]: calculateWeeklyStreak left untouched; only the data-fetch layer around it changes
- [Plan 04-02]: Boundary detection: daily uses checkDate < startDate; weekly uses currentStreak < weeksInWindow

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: RESOLVED -- theme-switcher manual DOM workaround removed; next-themes handles it natively
- [Phase 2]: No migration needed for weekly frequency (PRD says any day counts, no day field)
- [Phase 3]: Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 04-02-PLAN.md (Phase 04 complete)
Resume file: .planning/phases/04-performance/04-02-SUMMARY.md
