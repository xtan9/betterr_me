---
phase: 16-integration-bug-fixes
plan: 02
subsystem: ui
tags: [swr, kanban, drag-drop, i18n, navigation]

# Dependency graph
requires:
  - phase: 15-kanban-board
    provides: KanbanBoard component with drag-drop SWR mutation
  - phase: 14-projects-sections
    provides: Tasks page with project sections layout
provides:
  - Correct SWR cache shape after kanban drag-drop (no cache corruption)
  - Archived projects navigation link in tasks page header
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SWR mutate async function must return cache-compatible shape when revalidate:false"

key-files:
  created: []
  modified:
    - components/kanban/kanban-board.tsx
    - components/tasks/tasks-page-content.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "SWR mutate async returns mapped {tasks: Task[]} instead of raw res.json() to match GET cache shape"
  - "Ghost variant for Archived link to maintain visual hierarchy (primary actions remain dominant)"

patterns-established:
  - "SWR mutate with revalidate:false: always return cache-compatible shape from async function"

requirements-completed: [KANB-02, PROJ-03]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 16 Plan 02: Kanban SWR Cache Fix and Archived Projects Link Summary

**Fixed kanban drag-drop cache corruption by returning correct {tasks: Task[]} shape from SWR mutate, and added archived projects navigation link with i18n support**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T05:55:27Z
- **Completed:** 2026-02-21T05:57:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed SWR mutate async function to return `{tasks: Task[]}` shape matching GET response format, preventing kanban board from emptying after drag-drop
- Added "Archived" ghost link button in tasks page header navigating to `/projects/archived`
- Added `viewArchived` i18n key in all 3 locale files (en: "Archived", zh: "已归档", zh-TW: "已封存")

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix kanban SWR mutate to return correct cache shape after drag-drop** - `f14bec4` (fix)
2. **Task 2: Add archived projects navigation link to tasks page header** - `0d8f0b7` (feat)

## Files Created/Modified
- `components/kanban/kanban-board.tsx` - SWR mutate async function now destructures PATCH response and returns mapped task list in `{tasks: Task[]}` shape
- `components/tasks/tasks-page-content.tsx` - Added ghost "Archived" link button with Archive icon in PageHeader actions
- `i18n/messages/en.json` - Added `tasks.page.viewArchived: "Archived"`
- `i18n/messages/zh.json` - Added `tasks.page.viewArchived: "已归档"`
- `i18n/messages/zh-TW.json` - Added `tasks.page.viewArchived: "已封存"`

## Decisions Made
- SWR mutate async function returns mapped `{tasks: Task[]}` instead of raw `res.json()` to match GET cache shape -- prevents cache corruption when `revalidate: false`
- Ghost variant for Archived link to maintain visual hierarchy -- Create Project (outline) and Create Task (primary) remain visually dominant

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 complete with all integration bug fixes applied
- All 1207 tests pass, build succeeds, lint clean (0 errors)
- Ready for milestone completion

## Self-Check: PASSED

All 5 modified files verified on disk. Both task commits (f14bec4, 0d8f0b7) verified in git log.

---
*Phase: 16-integration-bug-fixes*
*Completed: 2026-02-21*
