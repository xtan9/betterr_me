# Phase 13: Data Foundation & Migration - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add status field (backlog/todo/in_progress/done), section field, and sort_order field to tasks. Implement bidirectional is_completed/status sync at the API layer. Migrate all existing tasks to the new data model. No UI changes — existing features work identically.

</domain>

<decisions>
## Implementation Decisions

### Status mapping for existing tasks
- is_completed=true → status=done (locked by success criteria)
- is_completed=false → Claude's discretion (backlog or todo — pick most sensible default)
- New tasks default to status=todo
- Recurring task instances default to status=todo
- Reopened tasks (done → incomplete) always reset to status=todo (no previous-status tracking)

### Interim behavior
- Status/section fields exist in DB but are NOT visible in any UI until Phase 14/15
- Existing "mark as complete" toggle continues working as-is; sync layer handles status=done behind the scenes
- API responses include new fields (status, section, sort_order) immediately — frontend ignores them until Phase 14
- API accepts status in create/update requests for forward compatibility

### Sort order seeding
- sort_order column added in Phase 13 (not deferred to Phase 15)
- Existing tasks seeded by creation date: oldest tasks get lowest sort_order (top of column)
- New tasks get sort_order that places them at the bottom of their column
- sort_order is scoped per-project (each project has independent ordering)
- Float-based values for single-row reorder updates (research decision already captured)

### Migration strategy
- Backup + forward-fix approach (no down-migration scripts)
- One-shot SQL migration: add columns, populate defaults, add constraints
- API-layer sync (not DB triggers) for is_completed/status bidirectionality (research decision already captured)

### Claude's Discretion
- Exact default status for is_completed=false migration (backlog vs todo — pick based on UX analysis)
- Migration script structure and ordering
- Constraint and index design
- Error handling in sync layer
- Test strategy for backward compatibility verification

</decisions>

<specifics>
## Specific Ideas

- Status field accepts exactly four values: backlog, todo, in_progress, done
- Section field defaults to "personal" for all existing tasks
- Sync behavior: setting status=done sets is_completed=true + completed_at; moving away from done clears both
- Float-based sort_order enables single-row updates on drag-and-drop (no reindexing)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-data-foundation-migration*
*Context gathered: 2026-02-18*
