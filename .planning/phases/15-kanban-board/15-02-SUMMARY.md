---
phase: 15-kanban-board
plan: 02
subsystem: ui
tags: [dnd-kit, kanban, drag-drop, swr, optimistic-update]

# Dependency graph
requires:
  - phase: 15-kanban-board/01
    provides: "@dnd-kit/core installed, project_id API filter, kanban page route, i18n kanban namespace"
provides:
  - "4-column kanban board (Backlog, To Do, In Progress, Done) with drag-and-drop"
  - "Optimistic status updates via SWR mutate with rollback on API failure"
  - "KanbanColumn, KanbanCard, KanbanCardOverlay, KanbanBoard, KanbanBoardLoader components"
  - "Priority-sorted cards within columns (high to low)"
  - "Board header with project color accent, back navigation, task count"
affects: [15-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["useDroppable/useDraggable pattern for kanban columns and cards", "Client wrapper component for next/dynamic ssr:false in server page", "SWR optimistic mutation with rollbackOnError for drag-drop"]

key-files:
  created:
    - components/kanban/kanban-column.tsx
    - components/kanban/kanban-card.tsx
    - components/kanban/kanban-card-overlay.tsx
    - components/kanban/kanban-board.tsx
    - components/kanban/kanban-board-loader.tsx
  modified:
    - app/projects/[id]/kanban/page.tsx

key-decisions:
  - "KanbanBoardLoader client wrapper extracts next/dynamic ssr:false from server page to fix Next.js 16 build error"
  - "useMemo wrapping tasksData?.tasks to prevent unstable array reference in useCallback/useMemo deps"
  - "void selectedTask to suppress unused variable lint — state prepared for Plan 03 detail modal"

patterns-established:
  - "Client wrapper pattern: Server Component page uses client wrapper that contains next/dynamic ssr:false import"
  - "Optimistic drag pattern: SWR mutate with optimisticData, rollbackOnError:true, revalidate:false, catch for toast"

requirements-completed: [KANB-01, KANB-02]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 15 Plan 02: Core Kanban Board Summary

**4-column drag-and-drop kanban board with @dnd-kit DndContext, SWR optimistic status mutations, priority-sorted cards, and project-colored header**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-21T04:01:50Z
- **Completed:** 2026-02-21T04:08:18Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built KanbanColumn (droppable), KanbanCard (draggable), and KanbanCardOverlay (ghost) components with @dnd-kit hooks
- Created KanbanBoard with DndContext, Mouse/Touch/Keyboard sensors, SWR data fetching, and optimistic drag-end handler
- Cards display title, colored priority badge (red/yellow/blue), and due date with calendar icon
- Fixed pre-existing build error: extracted next/dynamic ssr:false from Server Component into KanbanBoardLoader client wrapper

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KanbanColumn and KanbanCard components** - `871df27` (feat)
2. **Task 2: Create KanbanBoard with DndContext, SWR, and drag-end handler** - `3a38d2d` (feat)

## Files Created/Modified
- `components/kanban/kanban-column.tsx` - Droppable column with header, badge count, ScrollArea, empty state
- `components/kanban/kanban-card.tsx` - Draggable task card with title, priority badge, due date
- `components/kanban/kanban-card-overlay.tsx` - Static ghost card for DragOverlay with shadow+rotate effect
- `components/kanban/kanban-board.tsx` - Main board: DndContext, SWR fetch, optimistic drag handler, 4-column layout
- `components/kanban/kanban-board-loader.tsx` - Client wrapper for next/dynamic ssr:false import
- `app/projects/[id]/kanban/page.tsx` - Updated to use KanbanBoardLoader instead of inline dynamic import

## Decisions Made
- Created KanbanBoardLoader client wrapper to fix Next.js 16 restriction on ssr:false in Server Components
- Wrapped tasks array derivation in useMemo to satisfy react-hooks/exhaustive-deps for stable dependency references
- Used void selectedTask pattern to prepare state for Plan 03 detail modal without lint warnings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed next/dynamic ssr:false in Server Component build error**
- **Found during:** Task 2 (KanbanBoard verification)
- **Issue:** Kanban page.tsx was a Server Component using next/dynamic with ssr:false, which Next.js 16 disallows
- **Fix:** Created KanbanBoardLoader client component wrapper containing the dynamic import, updated page to use it
- **Files modified:** components/kanban/kanban-board-loader.tsx (created), app/projects/[id]/kanban/page.tsx (modified)
- **Verification:** pnpm build compiles successfully (remaining error is pre-existing in projects API)
- **Committed in:** 3a38d2d (Task 2 commit)

**2. [Rule 1 - Bug] Fixed unstable tasks array reference causing render loops**
- **Found during:** Task 2 (lint verification)
- **Issue:** `tasks = tasksData?.tasks ?? []` created new empty array each render, making useMemo/useCallback deps unstable
- **Fix:** Wrapped in `useMemo(() => tasksData?.tasks ?? [], [tasksData?.tasks])`
- **Files modified:** components/kanban/kanban-board.tsx
- **Verification:** pnpm lint passes with 0 errors (only pre-existing warnings remain)
- **Committed in:** 3a38d2d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for build correctness and stable rendering. No scope creep.

## Issues Encountered
- Pre-existing type error in `app/api/projects/route.ts:75` (ProjectInsert missing status/sort_order) -- logged to deferred-items.md, not related to kanban
- Pre-existing test error in update-password-form.test.tsx (window not defined) -- not a regression

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 kanban components ready for Plan 03 (detail modal, quick-add)
- selectedTask state in KanbanBoard ready to wire to detail modal
- Board renders with full drag-and-drop functionality
- KanbanBoardLoader pattern established for SSR-safe client component loading

## Self-Check: PASSED

All 6 key files verified present. Both task commits (871df27, 3a38d2d) verified in git log.

---
*Phase: 15-kanban-board*
*Completed: 2026-02-21*
