# Feature Landscape

**Domain:** Personal kanban task management with project containers (single-user, not team collaboration)
**Researched:** 2026-02-18
**Overall confidence:** MEDIUM-HIGH

## Context: What Exists Today

BetterR.Me already has a working task system with:
- Tasks with title, description, intention, priority (0-3), category (work/personal/shopping/other), due date/time
- Binary completion state (`is_completed` boolean + `completed_at` timestamp)
- Completion reflection (`completion_difficulty`: 1=easy, 2=good, 3=hard) -- shown on task detail and dashboard
- Recurring tasks (7 patterns: daily/weekly/monthly/yearly with interval, day-of-week, day-of-month, etc.)
- Flat task list with pending/completed tabs, search, and card grid layout
- SWR-based data fetching with `keepPreviousData`

The milestone adds: Work/Personal sections, projects as named containers, 4-column kanban per project, new `status` field, tasks page redesign, task form changes, and data migration.

---

## Table Stakes

Features users expect from ANY app that calls itself "project-based kanban." Missing any of these would make the feature feel broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **4-status workflow** (Backlog / To Do / In Progress / Done) | Every kanban tool from Trello to Linear uses this pattern. 3 columns feels too simple; 5+ is team-oriented overkill for personal use. | Low | New `status` field on tasks table | Linear, Todoist, Trello all default to ~4 columns. BetterR.Me's proposed 4-column model matches industry standard exactly. |
| **Drag-and-drop between columns** | THE defining kanban interaction. Without it, the board is just a grouped list view. Users expect to grab a card and slide it across columns. | High | dnd-kit library, optimistic UI state, position tracking | dnd-kit is the clear choice for React in 2025/2026 -- accessible, modular, ~10kb. The deprecated react-beautiful-dnd should NOT be used. |
| **Card ordering within columns** | Users expect to arrange cards vertically within a column. Without this, drag-and-drop feels incomplete -- cards snap to fixed positions. | Medium | `sort_order` field on tasks, reorder logic on drag | Use sequential integer reassignment (not fractional indexing) per the marmelab pattern -- simpler and avoids precision issues. |
| **Project as a named container** | Users need to group related tasks. Todoist has "Projects" with sections; Trello has "Boards"; Linear has "Projects" -- all use named containers. | Medium | New `projects` table (id, user_id, name, color, section, status, sort_order) | Keep it simple: name + preset color. No sub-projects, no nested hierarchy. |
| **Work / Personal section separation** | Todoist's most popular organizational pattern is work vs personal separation. Users want mental context switching between life areas. | Low | New `section` field on tasks/projects ('work' / 'personal') | Todoist uses projects + filters for this; BetterR.Me uses structural sections. Simpler and more opinionated -- good for a personal app. |
| **Status-driven completion** (status=done implies is_completed=true) | Once a task reaches "Done" column, it should be complete. Having separate "Done" status and "completed" checkbox creates confusion. | Low | Derive `is_completed` from `status === 'done'`, set `completed_at` on transition to done | Critical: existing code reads `is_completed` everywhere. Must be backward-compatible. Keep `is_completed` as a computed/derived field, not user-editable. |
| **Task form: section selector** | When creating a task, user must choose Work or Personal. This replaces the current category toggle row (work/personal/shopping/other). | Low | Replace category UI with section selector in task-form.tsx | Section is required (not optional). Default to last-used section. |
| **Task form: project selector** | When creating a task, user can optionally assign it to a project. Tasks without a project are "standalone." | Low | New optional `project_id` field on tasks, project dropdown in form | Filter project dropdown by selected section. Show "No project" as default. |
| **Tasks page: section-based layout** | The tasks page needs to show Work and Personal as top-level tabs/sections, with project cards inside each. Todoist and Notion both organize this way. | Medium | Redesign tasks-page-content.tsx | Current flat list with pending/completed tabs must evolve into section > project > kanban hierarchy. |
| **Project color presets** | Every competitor (Trello labels, Todoist project colors, Linear team colors) uses color to distinguish projects visually. | Low | 8-12 preset color values stored as enum/string, render as left-border or background tint | Do NOT build a custom color picker -- presets only. Trello uses ~10 colors; Todoist uses ~20. 8-12 is the sweet spot. |
| **Data migration** (existing tasks get section=personal, status from is_completed) | Existing users must not lose data or see broken UI after upgrade. | Medium | Supabase migration SQL | Non-negotiable. All existing tasks: section='personal', project_id=null, status = is_completed ? 'done' : 'todo'. |

---

## Differentiators

Features that set BetterR.Me apart from generic kanban tools. Not expected, but valued -- especially given BetterR.Me's focus on self-improvement and reflection.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Completion reflection on drag-to-Done** | BetterR.Me already has `completion_difficulty` (easy/good/hard). Triggering the reflection prompt when a card is dragged to the Done column turns routine task completion into a mindfulness moment. NO other kanban tool does this. | Medium | Intercept drag-end event when target is Done column, show reflection dialog before confirming move | This bridges kanban mechanics with BetterR.Me's self-improvement philosophy. The dashboard already shows these reflections. Unique differentiator. |
| **Intention display on kanban cards** | BetterR.Me's "Your Why" field is unique to the app. Showing the intention as a subtle quote on kanban cards reminds users WHY they're doing the task -- not just WHAT. | Low | Render `task.intention` on card UI if present | Keeps the self-improvement angle visible even in kanban view. No competitor shows "why" on task cards. |
| **Project progress visualization** | Show a simple progress bar on the project card in the tasks page (e.g., "5 of 12 tasks done"). Gives a quick sense of momentum without opening the kanban. | Low | Count tasks by status per project | Todoist shows task counts; Linear shows progress bars. Both patterns work. Simple fraction is sufficient for v1. |
| **Active/Archived project status** | Let users archive completed projects to reduce clutter without deleting. Archived projects hidden by default, available via filter. | Low | `status` field on projects ('active' / 'archived') | Trello's archive pattern. Simple toggle. No "deleted" state -- use actual delete for that. |
| **Standalone tasks section** | Tasks not assigned to any project still appear in each section (Work/Personal) as a "loose tasks" area. Prevents orphan tasks. | Low | Query tasks where project_id IS NULL, group by section | Todoist's "Inbox" serves this purpose. BetterR.Me just shows them inline. |
| **Keyboard-accessible drag-and-drop** | dnd-kit supports keyboard sensors natively. Making the kanban fully keyboard-navigable is an accessibility win and differentiator vs many web kanban tools. | Low | Configure KeyboardSensor in dnd-kit setup | Already supported by dnd-kit -- just needs proper ARIA labels and keyboard shortcuts. Aligns with existing vitest-axe accessibility testing. |

---

## Anti-Features

Features to explicitly NOT build. Either wrong for the personal-use context, premature, or scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom columns / user-defined statuses** | Massively increases complexity (dynamic schema, column CRUD, validation). Linear/ClickUp need this for teams; BetterR.Me's personal-use context does not. The 4 fixed columns (Backlog/To Do/In Progress/Done) cover all personal workflow needs. | Keep 4 fixed statuses. Users who need custom workflows are using the wrong tool. |
| **WIP (Work-in-Progress) limits** | Team kanban feature. In personal use, the user IS the bottleneck -- they know their own capacity. WIP limits add friction without value for solo users. | Omit entirely. No column card limits. |
| **Sub-projects / nested project hierarchy** | Todoist supports 3-level sub-projects. This adds navigation complexity, parent-child state management, and confusing breadcrumbs. Personal users rarely need more than flat projects within sections. | Keep projects flat within Work/Personal sections. One level only. |
| **Multiple board views** (list, calendar, timeline, gallery) | Notion and ClickUp offer 5+ views. Each view is a separate component with its own data fetching and state management. Massive scope for little value in v1. | Kanban is the only project view. The existing task list page shows all tasks. |
| **Task labels / tags** | Current `category` field serves as a lightweight tag. Adding a full labels system (create, edit, multi-assign, color, filter) is a separate feature. | Keep using section (work/personal) as the primary organizer. Drop the old category field once sections ship. |
| **Subtasks / checklists on task cards** | Trello and Notion support subtasks. Adding nested task trees requires recursive data structures, UI for collapsing/expanding, completion rollup logic. | Keep tasks flat. Use description field for checklist-like notes if needed. |
| **Automations / rules** (e.g., auto-move on due date) | Trello Butler, ClickUp automations -- these are power-user features requiring a rule engine. Way out of scope. | Manual drag-and-drop only. |
| **Time tracking** | KanbanFlow and ClickUp have built-in time tracking. Requires timer UI, time entry storage, reporting. Separate product domain. | Omit. Not aligned with BetterR.Me's self-improvement focus. |
| **Card cover images / attachments** | Visual noise for personal task management. Trello supports card covers but they're rarely used for personal kanban. | Omit. Keep cards text-focused. |
| **Swimlanes** (sub-grouping within board) | Linear uses swimlanes for priority/label grouping on boards. Useful for teams, overkill for personal kanban with <50 tasks per project. | Single flat list per column. Use card priority indicators for visual grouping. |
| **Collaborative features** (assignees, comments, sharing) | BetterR.Me is explicitly single-user. Adding collaboration changes the entire auth model, data access patterns, and UI complexity. | Omit completely. No assignees, no comments, no sharing. |
| **Drag-and-drop for project reordering** | While nice, dragging to reorder projects within sections is lower priority than the kanban board DnD itself. Adds complexity to an already DnD-heavy milestone. | Use manual sort_order field, editable via project settings. Add DnD project reorder in a future polish milestone. |

---

## Feature Dependencies

```
Section field (work/personal) on tasks table
    |
    +--> Projects table (each project belongs to a section)
    |       |
    |       +--> Kanban board per project (reads tasks by project_id + status)
    |       |       |
    |       |       +--> Drag-and-drop between columns (dnd-kit)
    |       |       |       |
    |       |       |       +--> Completion reflection on drag-to-Done
    |       |       |
    |       |       +--> Card ordering within columns (sort_order field)
    |       |
    |       +--> Project color presets
    |       |
    |       +--> Active/Archived status
    |       |
    |       +--> Project progress visualization
    |
    +--> Task form redesign (section selector + project selector)
    |
    +--> Tasks page redesign (section tabs > project cards > kanban)
    |
    +--> Standalone tasks section (tasks with no project_id)

Status field (backlog/todo/in_progress/done) on tasks table
    |
    +--> is_completed derived from status === 'done'
    |
    +--> completed_at set/cleared on status transitions to/from done
    |
    +--> Kanban column mapping (status -> column position)

Data migration (must run BEFORE any new UI deploys)
    |
    +--> All existing tasks get section='personal', status derived from is_completed
```

**Critical path:** Data migration -> Status field -> Section field -> Projects table -> Kanban board -> DnD -> Tasks page redesign

**The migration must happen first** because all subsequent features depend on the new fields existing.

---

## MVP Recommendation

**Phase 1 -- Foundation (must ship together):**
1. Database migration: add `status`, `section`, `sort_order` to tasks table; create `projects` table
2. Data migration: existing tasks get section='personal', status derived from is_completed
3. Status field logic: derive `is_completed` from status, update all API routes and DB methods
4. Backward compatibility: ensure dashboard, task detail, and existing task list still work with new fields

**Phase 2 -- Projects & Sections:**
5. Projects CRUD (API + DB layer): create, read, update, archive projects
6. Section selector in task form (replace old category toggles)
7. Project selector in task form
8. Tasks page redesign: section tabs with project cards and standalone tasks

**Phase 3 -- Kanban Board:**
9. Kanban board component (4-column layout, reads from status field)
10. Drag-and-drop between columns (dnd-kit)
11. Card ordering within columns
12. Completion reflection dialog on drag-to-Done

**Defer to future milestones:**
- Project progress visualization: Nice-to-have, add after core kanban works
- Keyboard DnD: dnd-kit supports it, but thorough ARIA labeling needs dedicated testing
- Project drag-to-reorder: Manual sort_order is fine for v1

---

## Competitor Analysis Summary

### Todoist (closest competitor for personal productivity)
- **Projects + Sections model:** Projects are top-level containers; sections divide them into phases. Board view shows sections as columns. This is exactly the pattern BetterR.Me is adopting.
- **View switching:** Users can toggle between list and board view per project. BetterR.Me only needs board view for projects (existing task list handles the flat view).
- **Color:** Projects have color presets (~20 options). Clean, no custom picker.
- **What to learn:** Section-as-column is intuitive. Quick-add with `#Project /Section` is powerful but out of scope for v1.

### Trello (kanban-first, visual)
- **Board = Project:** Each board is its own kanban. Lists are columns. Cards are tasks.
- **Labels for context:** Color-coded labels add metadata without hierarchy. BetterR.Me's section + priority already covers this.
- **Archive pattern:** Cards move to archive, not delete. Keeps history. BetterR.Me should archive Done tasks periodically or on project archive.
- **What to learn:** Keep DnD fast and smooth. Card details should be accessible in one click (not a new page load). Consider a slide-over panel for task detail in future.

### Linear (developer-focused, opinionated)
- **Fixed status workflow:** Triage -> Backlog -> Todo -> In Progress -> In Review -> Done. Opinionated, not customizable per-project. BetterR.Me's 4-column approach follows this philosophy.
- **Time-in-status tracking:** Shows how long a task sat in each status. Interesting for future analytics but out of scope.
- **Status-as-source-of-truth:** Status drives everything; completed is derived. Exactly the pattern BetterR.Me should adopt.
- **What to learn:** Opinionated > customizable for personal tools. Don't let users create custom columns.

### Notion (flexible, database-driven)
- **Database views:** Same data shown as board, list, calendar, gallery. Powerful but complex. BetterR.Me should NOT try to replicate this flexibility.
- **Relations:** Notion links databases (tasks <-> projects). BetterR.Me's `project_id` FK is the simplified version of this.
- **Sub-groups:** Board view supports sub-grouping (e.g., by priority within status). Overkill for personal use.
- **What to learn:** The board view of a database is a "view," not a "feature." Keep data model clean and let the UI be a projection of it.

---

## Sources

### Competitor & Feature Research (MEDIUM confidence -- web search verified across multiple sources)
- [Zapier: The 5 best Kanban tools in 2026](https://zapier.com/blog/best-kanban-apps/)
- [Any.do: Best Kanban Apps for Personal and Team Use in 2026](https://www.any.do/blog/best-kanban-apps-for-personal-and-team-use-in-2026/)
- [Todoist: Introducing Boards](https://www.todoist.com/inspiration/kanban-board)
- [Todoist: Use the board layout](https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI)
- [Todoist: Introduction to sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn)
- [Todoist: Introduction to projects](https://www.todoist.com/help/articles/introduction-to-projects-TLTjNftLM)
- [Linear Docs: Board layout](https://linear.app/docs/board-layout)
- [Linear Docs: Concepts](https://linear.app/docs/conceptual-model)
- [Notion: Board view](https://www.notion.com/help/boards)
- [Notion: Getting started with projects and tasks](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks)

### Technical Implementation (HIGH confidence -- verified implementations)
- [GitHub: Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) -- reference Kanban with dnd-kit + Tailwind + shadcn/ui
- [marmelab: Building a Kanban board with shadcn (Jan 2026)](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) -- optimistic update patterns
- [LogRocket: Build a Kanban board with dnd-kit](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/)
- [Puck: Top 5 Drag-and-Drop Libraries for React in 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)

### UX Patterns (MEDIUM confidence -- synthesized from multiple blog posts and guides)
- [Atlassian: What is a kanban board?](https://www.atlassian.com/agile/kanban/boards)
- [Atlassian: Kanban](https://www.atlassian.com/agile/kanban)
- [ProKanban: Defining Workflow in Kanban](https://www.prokanban.org/blog/www-prokanban-org-blog-defining-workflow-in-kanban-key-elements-for-success)
- [Brisqi: Offline-first Personal Kanban App](https://brisqi.com/)
