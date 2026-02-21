# Phase 14: Projects & Sections - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can organize tasks into Work/Personal sections and named projects, and the tasks page displays this structure. Includes project CRUD (create, edit, archive, delete), task form extensions (section selector, project dropdown), and a redesigned tasks page with section-based layout. Kanban board view is Phase 15.

</domain>

<decisions>
## Implementation Decisions

### Section & project layout
- Stacked vertically — Personal section on top, Work section below, single scrollable page
- Sections are always expanded, not collapsible
- Within each section: standalone tasks appear first, then project cards below
- Each section has a clear header label ("Personal" / "Work")

### Project card design
- Rich content cards showing: project name, preset color accent, progress bar + text count (X/Y done), up to 5 task previews, and a button to open the kanban
- Task previews ordered: in-progress tasks first, then todo tasks
- Each task preview has a status dot (colored indicator for in_progress vs todo)
- "+N more" shown when tasks exceed the 5-task preview limit
- Three-dot menu (⋯) in top-right corner for Edit, Archive, Delete actions
- 10-12 preset colors available when creating/editing a project

### Project color application
- Claude's discretion on how to apply the preset color to the card (left border, background tint, header bar, etc.) — research similar web apps for best practice

### Project card interaction
- Claude's discretion on whether clicking card body opens kanban vs button-only

### Project lifecycle UX
- Create project via modal dialog (name, section selector, color picker)
- Single "Create Project" button at the top of the tasks page (section chosen inside the modal)
- Delete project shows a confirmation dialog explaining tasks will become standalone
- Archived projects accessed via a separate /projects/archived page

### Task form changes
- Section selector placed near the top of the form, right after task name
- Section selector is toggle buttons (two side-by-side: "Personal" and "Work"), defaults to Personal
- Project dropdown filtered by selected section, shows color dots next to project names
- Project assignment is optional (task can be standalone)

### Claude's Discretion
- Project color application style (research similar apps for best visual approach)
- Card body click behavior (click-to-open-kanban vs button-only)
- Section switching behavior when task already assigned to a project in the old section (clear silently vs warn-then-clear)
- Exact spacing, typography, and responsive behavior

</decisions>

<specifics>
## Specific Ideas

- User wants rich, content-heavy project cards — not minimal/sparse
- In-progress tasks should be visually prominent on the card (shown first, status dot)
- Research similar web apps (Linear, Notion, Asana) for project color application best practices
- Progress should be visually represented with both a bar and text count

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-projects-sections*
*Context gathered: 2026-02-19*
