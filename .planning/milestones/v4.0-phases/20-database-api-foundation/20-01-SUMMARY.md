---
phase: 20-database-api-foundation
plan: 01
subsystem: database
tags: [supabase, migrations, rls, typescript, zod, tiptap, journal]

# Dependency graph
requires:
  - phase: 14-projects-sections
    provides: "ProjectsDB pattern, projects migration pattern, updated_at trigger function"
provides:
  - "journal_entries table with UNIQUE(user_id, entry_date) and RLS"
  - "journal_entry_links polymorphic table with RLS via EXISTS"
  - "JournalEntriesDB class (upsert, CRUD, calendar, timeline)"
  - "JournalEntryLinksDB class (link CRUD)"
  - "Journal TypeScript types (JournalEntry, JournalEntryLink, etc.)"
  - "Zod validation schemas (journalEntryFormSchema, journalEntryUpdateSchema, journalLinkSchema)"
  - "Preview text extraction utility (getPreviewText)"
affects: [20-02, 21-editor-experience, 22-prompt-system, 23-calendar-timeline, 24-integration-links]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Supabase upsert with composite onConflict for one-entry-per-day model"
    - "Polymorphic links table with RLS via EXISTS subquery (no user_id column)"
    - "Tiptap JSON plain text extraction for preview generation"

key-files:
  created:
    - "supabase/migrations/20260222100001_create_journal_entries.sql"
    - "supabase/migrations/20260222100002_create_journal_entry_links.sql"
    - "lib/db/journal-entries.ts"
    - "lib/db/journal-entry-links.ts"
    - "lib/validations/journal.ts"
    - "lib/journal/utils.ts"
  modified:
    - "lib/db/types.ts"
    - "lib/db/index.ts"

key-decisions:
  - "Used Supabase .upsert() with onConflict: 'user_id,entry_date' for atomic one-entry-per-day enforcement"
  - "No user_id column on journal_entry_links -- RLS uses EXISTS subquery on journal_entries for ownership check"
  - "Calendar query selects only entry_date, mood, title (never full JSONB content) for performance"

patterns-established:
  - "Upsert pattern: .upsert(data, { onConflict: 'col1,col2' }) for composite unique constraints"
  - "Polymorphic link table: link_type CHECK + link_id without FK, RLS via parent table EXISTS"

requirements-completed: [ENTR-05]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 20 Plan 01: Database & API Foundation Summary

**Journal data layer with Supabase upsert on UNIQUE(user_id, entry_date), polymorphic entry links, Zod validation, and Tiptap preview extraction**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T04:33:38Z
- **Completed:** 2026-02-23T04:36:53Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Two database migrations creating journal_entries (with UNIQUE constraint, RLS, indexes, trigger) and journal_entry_links (polymorphic with RLS via EXISTS)
- JournalEntriesDB class with 7 methods including upsert for one-entry-per-day and lightweight calendar query
- JournalEntryLinksDB class with 3 link CRUD methods
- Complete TypeScript type definitions and Zod validation schemas
- Preview text extraction utility for Tiptap JSON content

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database migrations, TypeScript types, and preview utility** - `685e7f1` (feat)
2. **Task 2: Create JournalEntriesDB, JournalEntryLinksDB classes, Zod schemas, and barrel exports** - `38e2b01` (feat)

## Files Created/Modified
- `supabase/migrations/20260222100001_create_journal_entries.sql` - journal_entries table with UNIQUE(user_id, entry_date), RLS, indexes, trigger
- `supabase/migrations/20260222100002_create_journal_entry_links.sql` - Polymorphic links table with RLS via EXISTS subquery
- `lib/db/types.ts` - Added JournalEntry, JournalEntryInsert, JournalEntryUpdate, JournalCalendarDay, JournalEntryLink, JournalEntryLinkInsert, JournalLinkType
- `lib/db/journal-entries.ts` - JournalEntriesDB class (upsertEntry, getEntryByDate, getEntry, updateEntry, deleteEntry, getCalendarMonth, getTimeline)
- `lib/db/journal-entry-links.ts` - JournalEntryLinksDB class (getLinksForEntry, addLink, removeLink)
- `lib/db/index.ts` - Added barrel exports for journal DB classes
- `lib/validations/journal.ts` - Zod schemas for entry form, entry update, and link validation
- `lib/journal/utils.ts` - getPreviewText and extractPlainText for Tiptap JSON

## Decisions Made
- Used Supabase `.upsert()` with `onConflict: 'user_id,entry_date'` for atomic create-or-update semantics
- No user_id on journal_entry_links table -- RLS enforced via EXISTS subquery joining to journal_entries
- Calendar endpoint query selects only `entry_date, mood, title` (never full JSONB content) for performance
- Timeline query returns full JournalEntry objects with cursor-based pagination on entry_date

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Database migrations must be applied to Supabase before features work in production.

## Next Phase Readiness
- Complete journal data layer ready for Plan 02 (API routes + SWR hooks)
- JournalEntriesDB and JournalEntryLinksDB classes exported via barrel and importable from `@/lib/db`
- Zod schemas ready for API route validation
- Preview text utility ready for timeline API response

## Self-Check: PASSED

All 8 files verified on disk. Both task commits (685e7f1, 38e2b01) verified in git log.

---
*Phase: 20-database-api-foundation*
*Completed: 2026-02-23*
