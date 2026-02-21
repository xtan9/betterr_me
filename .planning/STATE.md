# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v3.0 Gap Closure — Phase 17

## Current Position

Phase: 17 (fix-archive-restore-validation) -- COMPLETE
Plan: 1 of 1 complete (17-01 done)
Status: Phase Complete
Last activity: 2026-02-21 — Completed 17-01 (fix projectUpdateSchema for archive/restore)

Progress: [##########] 100% v1.0 | [##########] 100% v1.1 | [##########] 100% v2.0 | [##########] 100% v2.1 | [##########] 100% v3.0

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 11
- Average duration: 5min
- Total execution time: 0.83 hours

**v1.1 Velocity:**
- Total plans completed: 1
- Execution time: ~10min

**v2.1 Velocity:**
- Total plans completed: 6
- Execution time: ~63min

**v3.0 Velocity:**
- 13-01: 5min (3 tasks, 7 files)
- 13-02: 6min (2 tasks, 7 files)
- 14-01: 2min (2 tasks, 13 files)
- 14-02: 7min (2 tasks, 11 files)
- 14-03: 9min (2 tasks, 9 files)
- 15-01: 3min (2 tasks, 11 files)
- 15-02: 6min (2 tasks, 6 files)
- 15-03: 4min (2 tasks, 4 files)
- 15-04: 2min (2 tasks, 2 files)
- 16-01: 1min (2 tasks, 5 files)
- 16-02: 2min (2 tasks, 5 files)
- 17-01: 2min (2 tasks, 3 files)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log with outcomes.

Recent decisions affecting current work:
- Research recommends @dnd-kit/core v6 (stable) over @dnd-kit/react v0.3.x (pre-1.0)
- API-layer is_completed/status sync preferred over DB trigger (testability)
- Float-based sort_order for kanban reordering (single-row updates)
- SWR as single source of truth for kanban state (no dual local+server state)
- TaskStatus: exactly 4 values (backlog, todo, in_progress, done)
- syncTaskUpdate: status wins when both status and is_completed provided
- Reopened tasks always reset to status=todo
- Migration defaults is_completed=false to status=todo (not backlog)
- Every task mutation goes through sync layer before DB write (sync-at-mutation-point pattern)
- POST creates compute sort_order from max existing value per user
- ProjectSection narrowed to 'personal' | 'work' union type (from generic string)
- Task validation section field narrowed to enum matching ProjectSection
- ON DELETE SET NULL for project_id FK - deleted projects orphan tasks as standalone
- Section toggle placed right after title in task form (per locked decision)
- Section change silently clears project_id (no confirmation needed)
- useProjects fetches all active projects, filters by section client-side
- Lifted pending/completed tabs and search from TaskList to tasks-page-content parent for section layout
- ProjectCard uses inline style for dynamic color accent (borderLeftColor + backgroundColor with opacity)
- Task previews sorted by status priority: in_progress > todo > backlog
- Added menuEdit/menuArchive/menuDelete i18n keys for project card menu actions
- next/dynamic with ssr:false for KanbanBoard to avoid hydration issues with drag-and-drop
- project_id=null query param maps to SQL IS NULL filter for standalone tasks
- KanbanBoardLoader client wrapper extracts next/dynamic ssr:false from server page (fixes Next.js 16 build)
- SWR optimistic mutation with rollbackOnError:true + toast.error for drag-drop status changes
- useMemo wrapping derived tasks array to prevent unstable deps in useCallback/useMemo
- Status badge colors in detail modal: backlog=muted, todo=slate-500, in_progress=blue-500, done=green-500
- Quick-add renders inside ScrollArea after last card, hover state controls visibility
- Dialog open controlled by nullable selectedTask state with null guard for early return
- KANB-03/04/05 moved to Future Requirements > Kanban Polish (not deleted) with Phase 15 context decision as reason
- Fix ProjectInsert at type level (Omit+re-add) rather than handler level to prevent same bug in future callers
- SWR mutate async returns mapped {tasks: Task[]} instead of raw res.json() to match GET cache shape
- Ghost variant for Archived link to maintain visual hierarchy (primary actions remain dominant)
- Used .partial().extend().refine() chain order for Zod schemas (extend before refine, since refine returns ZodEffects not ZodObject)

### Pending Todos

None.

### Blockers/Concerns

- Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)
- is_completed/status bidirectional sync migration testing complete — all 1166 tests pass
- @dnd-kit/core v6 + React 19 peer dep mismatch requires pnpm config (cosmetic, works correctly)

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 17-01-PLAN.md (Phase 17 fully complete)
Resume: Archive/restore validation fix complete, all phases through 17 done
