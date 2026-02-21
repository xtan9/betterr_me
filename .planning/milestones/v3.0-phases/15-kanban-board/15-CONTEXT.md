# Phase 15: Kanban Board - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

4-column kanban board (Backlog, To Do, In Progress, Done) for viewing and managing a project's tasks with drag-and-drop between columns. Clicking a project card on the tasks page opens the board. Comments/updates system and story points are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Card content & density
- Cards show: title, priority badge, due date (if set) — all existing fields
- Monday.com-style card layout: task title prominent, metadata below
- No story points (deferred), no assignee (deferred), no intention/"Your Why" display
- Priority badge visual treatment: Claude's discretion (colored badge, dot, etc.)

### Card click — detail popup
- Clicking a kanban card opens a Monday.com-style full overlay modal
- Left panel: task detail fields (status, priority, section, project, due date, description)
- Right panel: placeholder with empty state for future comments/updates system
- Tabs at top like Monday.com (Details, Activity — structure ready for future)

### Board layout & navigation
- Full page navigation: clicking project card goes to `/projects/[id]/kanban`
- Back button returns to tasks page
- Minimal header: project name with colored accent, back arrow, task count
- No search/filter on the board itself
- Column headers: neutral/subtle with colored count badge (not full-color headers)
- Quick-add task: appears on column hover, positioned after the last card (or first position if column is empty)

### Drag interaction
- Cross-column drag to change task status (Backlog ↔ To Do ↔ In Progress ↔ Done)
- Touch drag supported (long-press to pick up on mobile)
- Optimistic instant save on drop — if API fails, card snaps back with error toast
- No within-column reordering — cards auto-sort by priority (high → low) within each column
- Drag visual feedback: Claude's discretion (@dnd-kit best practices)

### Completion reflection
- Dropped entirely — tasks move to Done silently with no emoji prompt

### Claude's Discretion
- Priority badge visual design (colored badge style, dot indicator, etc.)
- Drag-and-drop visual feedback (lift + shadow, ghost card, etc.)
- Detail popup field layout and styling
- Column empty state design
- Loading skeleton design
- Error state handling

</decisions>

<specifics>
## Specific Ideas

- "Like Monday.com" — referenced Monday.com's kanban as the primary design inspiration
- Card layout inspired by Monday.com: task ID area, title, priority badge row, metadata row
- Detail popup inspired by Monday.com: full overlay modal with left details + right panel structure
- Quick-add on hover, not always visible — appears after last card or in first position when empty
- Fixed priority sort within columns eliminates need for sort_order drag (simplifies implementation)

</specifics>

<deferred>
## Deferred Ideas

- **Story points system** — new data field (DB column, API, form UI). User wants this but it's a new capability
- **Assignee system** — multi-user support with task assignment. Future phase
- **Comments/updates system** — Monday.com-style item updates with @mentions, replies, likes. Right panel placeholder is ready for this
- **Within-column manual reordering** — currently using fixed priority sort; could add custom ordering later
- **Board search/filter** — keep board minimal for now; could add filtering later

</deferred>

---

*Phase: 15-kanban-board*
*Context gathered: 2026-02-20*
