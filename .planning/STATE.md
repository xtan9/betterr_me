# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v3.0 Projects & Kanban — Phase 14 (Projects & Sections)

## Current Position

Phase: 14 (second of 3 in v3.0)
Plan: 1 of 3 complete (14-01 done)
Status: In Progress
Last activity: 2026-02-20 — Completed 14-01 (projects data foundation: SQL, types, DB class, API routes)

Progress: [##########] 100% v1.0 | [##########] 100% v1.1 | [##########] 100% v2.0 | [##########] 100% v2.1 | [#####.....] 50% v3.0

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

### Pending Todos

None.

### Blockers/Concerns

- Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)
- is_completed/status bidirectional sync migration testing complete — all 1166 tests pass
- @dnd-kit/core v6 + React 19 peer dep mismatch requires pnpm config (cosmetic, works correctly)

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 14-01-PLAN.md (projects data foundation)
Resume: Phase 14-02 execution (Project CRUD UI, task form extensions)
