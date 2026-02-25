---
phase: 26-fix-journal-entry-validation
plan: 01
subsystem: api
tags: [zod, validation, journal, supabase, migration, typescript]

# Dependency graph
requires:
  - phase: 20-journal-api-crud
    provides: Journal API routes and Zod schemas
provides:
  - Fixed Zod schemas with optional title and nullable mood
  - DB migration making mood column nullable
  - Updated TypeScript types for mood: number | null
  - Updated tests reflecting correct validation behavior
affects: [journal-entries, journal-ui, journal-calendar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type assertion for Zod output in validateRequestBody (input/output type mismatch)"

key-files:
  created:
    - supabase/migrations/20260223200001_make_mood_nullable.sql
  modified:
    - lib/validations/journal.ts
    - lib/db/types.ts
    - app/api/journal/route.ts
    - components/journal/journal-mood-dot.tsx
    - tests/app/api/journal/route.test.ts
    - tests/app/api/journal/[id]/route.test.ts

key-decisions:
  - "Used type assertion (as JournalEntryFormValues) to bridge Zod input/output type gap in validateRequestBody"
  - "moodDotColor returns muted fallback for null mood (consistent with existing no-match fallback)"

patterns-established:
  - "Zod default(null) + nullable() for optional DB columns with null semantics"

requirements-completed: [ENTR-01, ENTR-02, ENTR-04, ENTR-05]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 26 Plan 01: Fix Journal Entry Validation Summary

**Fixed two critical Zod validation bugs: title now defaults to empty string (was required), mood now accepts null (was forced to 3)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T04:28:00Z
- **Completed:** 2026-02-24T04:32:06Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Fixed Zod schema so autosave POST succeeds without title field (defaults to "")
- Fixed Zod schema to accept mood: null matching the deselect UX design
- Created DB migration to make mood column nullable
- Updated TypeScript types and component props for mood: number | null
- Removed redundant ?? fallbacks in POST handler (Zod defaults handle all fields)
- Updated tests: 2 modified, 2 new test cases added, all 1460 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Zod schemas, TypeScript types, and DB migration** - `982fa00` (fix)
2. **Task 2: Update tests and verify all pass** - `080867f` (test)

## Files Created/Modified
- `lib/validations/journal.ts` - Fixed title (optional, default "") and mood (nullable, default null) schemas
- `lib/db/types.ts` - Updated JournalEntry.mood and JournalCalendarDay.mood to number | null
- `app/api/journal/route.ts` - Removed redundant ?? fallbacks, added type assertion for Zod output
- `components/journal/journal-mood-dot.tsx` - Updated moodDotColor and props to accept null mood
- `supabase/migrations/20260223200001_make_mood_nullable.sql` - ALTER TABLE to drop NOT NULL on mood
- `tests/app/api/journal/route.test.ts` - Updated missing-title test (201 not 400), default mood null, new null mood test
- `tests/app/api/journal/[id]/route.test.ts` - Added PATCH with mood: null test

## Decisions Made
- Used type assertion (`as JournalEntryFormValues`) to bridge Zod's input/output type gap in validateRequestBody generic. The `ZodSchema<T>` resolves T to input type (where defaults are `| undefined`) but safeParse output always has defaults applied.
- moodDotColor returns "bg-muted-foreground" for null mood, consistent with the existing no-match fallback behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript type mismatch in validateRequestBody**
- **Found during:** Task 1 (Build verification)
- **Issue:** `validateRequestBody` generic `ZodSchema<T>` resolves T to Zod input type, where `.default()` fields are `T | undefined`. This caused `validation.data.title` to be `string | undefined` instead of `string`.
- **Fix:** Added type assertion `validation.data as JournalEntryFormValues` to use Zod's output type (where defaults are always applied).
- **Files modified:** app/api/journal/route.ts
- **Verification:** pnpm build passes with zero type errors
- **Committed in:** 982fa00 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed type mismatch above.

## User Setup Required
- DB migration `20260223200001_make_mood_nullable.sql` must be applied to Supabase before the fix takes effect in production.

## Next Phase Readiness
- Journal entry CRUD is fully unblocked -- POST and PATCH accept missing title and null mood
- All tests pass, build clean, lint clean
- Migration ready to apply to production Supabase instance

## Self-Check: PASSED

All files verified present. Both commits (982fa00, 080867f) confirmed in git log.

---
*Phase: 26-fix-journal-entry-validation*
*Completed: 2026-02-24*
