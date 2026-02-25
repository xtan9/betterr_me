---
phase: 20-database-api-foundation
plan: 02
subsystem: api
tags: [next.js, supabase, swr, zod, vitest, journal, rest-api, hooks]

# Dependency graph
requires:
  - phase: 20-database-api-foundation
    provides: "JournalEntriesDB, JournalEntryLinksDB, Zod schemas, TypeScript types, preview utility"
provides:
  - "POST /api/journal upsert endpoint with Zod validation"
  - "GET /api/journal with date lookup and timeline mode"
  - "GET/PATCH/DELETE /api/journal/[id] CRUD endpoints"
  - "GET /api/journal/calendar lightweight month overview endpoint"
  - "useJournalEntry, useJournalCalendar, useJournalTimeline SWR hooks"
  - "70 unit tests covering DB classes, API routes, validation, and preview utility"
affects: [21-editor-experience, 22-prompt-system, 23-calendar-timeline, 24-integration-links]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Timeline cursor pagination via mode=timeline query param on existing route"
    - "SWR hooks with keepPreviousData for date-keyed data"
    - "Upsert API pattern: POST always returns 201 (create-or-update semantics)"

key-files:
  created:
    - "app/api/journal/route.ts"
    - "app/api/journal/[id]/route.ts"
    - "app/api/journal/calendar/route.ts"
    - "lib/hooks/use-journal-entry.ts"
    - "lib/hooks/use-journal-calendar.ts"
    - "lib/hooks/use-journal-timeline.ts"
    - "tests/lib/db/journal-entries.test.ts"
    - "tests/lib/db/journal-entry-links.test.ts"
    - "tests/app/api/journal/route.test.ts"
    - "tests/app/api/journal/[id]/route.test.ts"
    - "tests/app/api/journal/calendar/route.test.ts"
    - "tests/lib/journal/utils.test.ts"
  modified:
    - "app/api/journal/route.ts"
    - "tests/setup.ts"

key-decisions:
  - "Timeline mode reuses GET /api/journal with ?mode=timeline param instead of separate route"
  - "POST /api/journal always returns 201 regardless of create vs update (upsert semantics)"
  - "hasMore pagination flag uses entries.length === limit comparison"

patterns-established:
  - "SWR hook pattern: useJournalEntry(date) with keepPreviousData:true for date-keyed queries"
  - "API route timeline mode: ?mode=timeline&cursor=&limit= on existing collection route"

requirements-completed: [ENTR-05]

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 20 Plan 02: Journal API Routes, SWR Hooks, and Unit Tests Summary

**Journal REST API (3 routes, 7 endpoints) with SWR hooks and 70 unit tests covering upsert, CRUD, calendar, timeline, and preview utility**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T04:39:32Z
- **Completed:** 2026-02-23T04:45:46Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Complete journal REST API with 7 endpoints across 3 route files following project auth/validation/error conventions
- 3 SWR hooks (useJournalEntry, useJournalCalendar, useJournalTimeline) with keepPreviousData for smooth transitions
- 70 new unit tests all passing with zero regressions (1381 total tests, 104 test files)
- Timeline cursor pagination integrated into existing GET /api/journal route

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API routes for journal entries and calendar** - `5206fcb` (feat)
2. **Task 2: Create SWR hooks and comprehensive unit tests** - `aad195a` (feat)

## Files Created/Modified
- `app/api/journal/route.ts` - GET (by date + timeline mode) and POST (upsert) endpoints
- `app/api/journal/[id]/route.ts` - GET, PATCH, DELETE for single journal entry
- `app/api/journal/calendar/route.ts` - GET lightweight month overview (entry_date, mood, title)
- `lib/hooks/use-journal-entry.ts` - useJournalEntry(date) SWR hook
- `lib/hooks/use-journal-calendar.ts` - useJournalCalendar(year, month) SWR hook
- `lib/hooks/use-journal-timeline.ts` - useJournalTimeline(cursor) SWR hook
- `tests/lib/db/journal-entries.test.ts` - 19 tests for JournalEntriesDB class
- `tests/lib/db/journal-entry-links.test.ts` - 7 tests for JournalEntryLinksDB class
- `tests/app/api/journal/route.test.ts` - 14 tests for GET/POST /api/journal
- `tests/app/api/journal/[id]/route.test.ts` - 9 tests for GET/PATCH/DELETE /api/journal/[id]
- `tests/app/api/journal/calendar/route.test.ts` - 7 tests for calendar endpoint
- `tests/lib/journal/utils.test.ts` - 14 tests for getPreviewText and extractPlainText
- `tests/setup.ts` - Added maybeSingle and limit to global mock

## Decisions Made
- Timeline mode reuses GET /api/journal with `?mode=timeline` query param instead of a separate route file, keeping the API surface cleaner
- POST /api/journal always returns 201 regardless of whether the upsert created or updated, following plan recommendation
- hasMore pagination flag computed as `entries.length === limit` (simple, no extra DB query)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error on content field type**
- **Found during:** Task 1 (API route creation)
- **Issue:** Zod schema's `.default()` on `content` field produced `Record<string, unknown> | undefined` in TypeScript output type
- **Fix:** Added `?? { type: 'doc', content: [] }` fallback in POST route
- **Files modified:** `app/api/journal/route.ts`
- **Verification:** `pnpm exec tsc --noEmit` passes
- **Committed in:** aad195a (Task 2 commit, route was already staged)

**2. [Rule 3 - Blocking] Added missing maybeSingle and limit to global Supabase mock**
- **Found during:** Task 2 (Unit tests for DB classes)
- **Issue:** MockQueryBuilder in tests/setup.ts lacked `maybeSingle` and `limit` chainable methods needed by JournalEntriesDB
- **Fix:** Added `maybeSingle` (terminal method returning promise) and `limit` (chainable method) to MockQueryBuilder class
- **Files modified:** `tests/setup.ts`
- **Verification:** All 1381 tests pass including all existing tests (zero regressions)
- **Committed in:** aad195a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes essential for correctness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Database migrations from Plan 01 must be applied before these endpoints work in production.

## Next Phase Readiness
- Complete journal data layer + API + hooks ready for UI phases
- Phase 21 (Editor Experience) can consume useJournalEntry hook and POST/PATCH endpoints
- Phase 23 (Calendar Timeline) can consume useJournalCalendar and useJournalTimeline hooks
- Phase 24 (Integration Links) can build on JournalEntryLinksDB (tested in this plan)

## Self-Check: PASSED

All 12 created files verified on disk. Both task commits (5206fcb, aad195a) verified in git log.

---
*Phase: 20-database-api-foundation*
*Completed: 2026-02-23*
