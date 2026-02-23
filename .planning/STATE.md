# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v4.0 Journal — Phase 21 (Journal Entry CRUD)

## Current Position

Phase: 21 of 25 (Journal Entry CRUD)
Plan: 1 of 2 in current phase
Status: Executing
Last activity: 2026-02-23 — Completed 21-01 (Editor UI primitives: Tiptap editor, bubble menu, mood selector, autosave hook)

Progress: [##########] 100% v1.0 | [##########] 100% v1.1 | [##########] 100% v2.0 | [##########] 100% v2.1 | [##########] 100% v3.0 | [###░░░░░░░] 33% v4.0

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
- Total plans completed: 12
- Total tasks: 25
- Total execution time: ~49min
- Files changed: 97 (+12,769/-156 lines)

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log with outcomes.
- Research recommends Tiptap JSONB storage over TEXT (STACK.md overrides ARCHITECTURE.md)
- Dashboard journal widget must be self-contained (own SWR hook, not added to DashboardData)
- Tiptap loaded via next/dynamic ssr:false + immediatelyRender:false (same pattern as kanban)
- Debounced autosave (2s) with localStorage draft fallback for content safety
- Supabase .upsert() with onConflict: 'user_id,entry_date' for atomic one-entry-per-day enforcement
- No user_id on journal_entry_links -- RLS uses EXISTS subquery on journal_entries
- Calendar query selects only entry_date, mood, title (never full content) for performance
- Timeline mode reuses GET /api/journal with ?mode=timeline param instead of separate route
- POST /api/journal always returns 201 (upsert semantics, create-or-update)
- hasMore pagination flag uses entries.length === limit comparison
- Mood onChange passes null (not 0) for deselect -- cleaner API matching nullable DB column
- BubbleMenu imported from @tiptap/react/menus (v3 path, not @tiptap/react)
- Autosave hook uses entryIdRef for POST-to-PATCH transition without stale closures
- sendBeacon uses Blob with application/json content-type for beforeunload fallback

### Pending Todos

None.

### Blockers/Concerns

- Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)
- @dnd-kit/core v6 + React 19 peer dep mismatch requires pnpm config (cosmetic, works correctly)
- v3.0 DB migrations must be applied to Supabase before features work in production
- Quick task 2 migration (drop intention column) must be applied to Supabase

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix Create Task button to default section based on context (Work vs Personal) | 2026-02-21 | f484f8e | [1-fix-create-task-button-to-default-sectio](./quick/1-fix-create-task-button-to-default-sectio/) |
| 2 | Remove Why This Matters (intention) concept from tasks | 2026-02-21 | 33e612c | [2-remove-why-this-matters-concept-from-tas](./quick/2-remove-why-this-matters-concept-from-tas/) |
| 3 | Fix kanban task detail popup animation (fade+slide instead of zoom) | 2026-02-21 | 48ba545 | [3-fix-kanban-task-detail-popup-animation-o](./quick/3-fix-kanban-task-detail-popup-animation-o/) |
| 4 | Add colorful section toggle styles (teal Personal, blue Work) | 2026-02-21 | e64a7e4 | [3-make-tasks-edit-page-section-options-col](./quick/3-make-tasks-edit-page-section-options-col/) |

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 21-01-PLAN.md (Editor UI primitives: Tiptap editor, bubble menu, mood selector, autosave)
Resume: Ready to execute 21-02-PLAN.md (Entry modal + page route)
