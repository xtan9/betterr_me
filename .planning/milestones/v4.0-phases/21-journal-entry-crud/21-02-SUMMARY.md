---
phase: 21-journal-entry-crud
plan: 02
subsystem: ui
tags: [journal, modal, delete-dialog, autosave, mood-selector, page-route, tiptap, swr, i18n]

# Dependency graph
requires:
  - phase: 21-journal-entry-crud/01
    provides: Tiptap editor, bubble menu, mood selector, autosave hook, save status, editor loader/skeleton, i18n strings
provides:
  - Journal entry modal wiring editor + mood + autosave + SWR data + delete
  - Journal delete confirmation dialog (AlertDialog)
  - Journal page route (/journal) with SidebarShell layout
  - Unit tests for mood selector, autosave hook, and entry modal (36 tests)
affects: [22-journal-views, 23-journal-calendar, 25-journal-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: [mock-editor-loader-for-component-tests, journal-page-server-auth-client-content-split]

key-files:
  created:
    - components/journal/journal-entry-modal.tsx
    - components/journal/journal-delete-dialog.tsx
    - app/journal/page.tsx
    - app/journal/journal-page-content.tsx
    - app/journal/layout.tsx
    - tests/components/journal/journal-mood-selector.test.tsx
    - tests/components/journal/journal-entry-modal.test.tsx
    - tests/lib/hooks/use-journal-autosave.test.ts
  modified:
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Mock JournalEditorLoader directly in modal tests (not Tiptap internals) -- avoids fragile React.lazy + dynamic import mocking"
  - "Added common.cancel i18n key at root common namespace for reuse across components"
  - "Journal page uses server component for auth check + client component for modal state (same pattern as kanban)"

patterns-established:
  - "Journal modal tests: mock editor loader at component boundary, not at Tiptap library level"
  - "Autosave hook tests: vi.useFakeTimers + vi.advanceTimersByTime for debounce testing"

requirements-completed: [ENTR-01, ENTR-02, ENTR-03, ENTR-04]

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 21 Plan 02: Entry Modal + Page Route Summary

**Journal entry modal with create/edit/delete flows, /journal page route with SidebarShell, and 36 unit tests covering mood selector, autosave hook, and modal interactions**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T19:33:37Z
- **Completed:** 2026-02-23T19:40:48Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Wired all Plan 01 UI primitives into a working JournalEntryModal with autosave, mood selection, and delete confirmation
- Created /journal page route with SidebarShell layout, auth guard, and "Write Today" button
- Added 36 unit tests (10 mood selector, 14 autosave hook, 12 entry modal) with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create journal entry modal, delete dialog, and page route** - `0072e0a` (feat)
2. **Task 2: Add unit tests for mood selector, autosave hook, and entry modal** - `80608f7` (test)

## Files Created/Modified
- `components/journal/journal-entry-modal.tsx` - Dialog modal wiring editor + mood + autosave + SWR data + delete
- `components/journal/journal-delete-dialog.tsx` - AlertDialog for entry deletion with confirmation
- `app/journal/page.tsx` - Server component with auth guard redirecting to login
- `app/journal/journal-page-content.tsx` - Client component with modal state, "Write Today" button, empty state
- `app/journal/layout.tsx` - SidebarShell layout wrapper for journal pages
- `tests/components/journal/journal-mood-selector.test.tsx` - 10 tests: rendering, interaction, accessibility, deselection
- `tests/components/journal/journal-entry-modal.test.tsx` - 12 tests: new/edit titles, delete flow, close flush, loading
- `tests/lib/hooks/use-journal-autosave.test.ts` - 14 tests: debounce, POST/PATCH, status transitions, flush, beforeunload
- `i18n/messages/en.json` - Added common.cancel, journal.pageTitle, journal.writeToday, journal.emptyState
- `i18n/messages/zh.json` - Chinese Simplified translations for new keys
- `i18n/messages/zh-TW.json` - Chinese Traditional translations for new keys

## Decisions Made
- Mock JournalEditorLoader directly in modal tests rather than mocking Tiptap internals -- avoids fragile React.lazy + next/dynamic mock chains
- Added `common.cancel` i18n key to root common namespace for reuse across delete dialogs
- Journal page follows the kanban pattern: server component for auth, client component for interactive state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed editor mocking strategy in entry modal tests**
- **Found during:** Task 2 (journal-entry-modal.test.tsx)
- **Issue:** Plan prescribed mocking @tiptap/react + @tiptap/react/menus + next/dynamic, but React.lazy couldn't resolve the mocked Tiptap modules (promise resolved to undefined)
- **Fix:** Mocked JournalEditorLoader and JournalEditorSkeleton directly at component boundary instead of mocking Tiptap library internals
- **Files modified:** tests/components/journal/journal-entry-modal.test.tsx
- **Verification:** All 12 modal tests pass
- **Committed in:** 80608f7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for tests to work. Mocking at component boundary is actually more robust than mocking library internals.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All ENTR-01 through ENTR-04 requirements satisfied end-to-end
- Journal entry CRUD is fully functional: create, edit (autosave), delete with confirmation
- /journal page route ready for Phase 23 calendar/timeline expansion
- 36 new tests provide regression safety for future changes

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (0072e0a, 80608f7) verified in git log.

---
*Phase: 21-journal-entry-crud*
*Completed: 2026-02-23*
