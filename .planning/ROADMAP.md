# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- 🚧 **v3.0 Projects & Kanban** — Phases 13-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

1 phase, 1 plan, 3 requirements. See `.planning/milestones/v1.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases, 21 plans, 28 requirements. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.1 UI Polish & Refinement (Phases 10-12) — SHIPPED 2026-02-18</summary>

3 phases, 6 plans, 8 requirements. See `.planning/milestones/v2.1-ROADMAP.md` for details.

</details>

### 🚧 v3.0 Projects & Kanban (In Progress)

**Milestone Goal:** Transform the flat task list into a structured project-based system with Work/Personal sections, project containers, and 4-column kanban boards with drag-and-drop.

- [x] **Phase 13: Data Foundation & Migration** - Status field, is_completed sync, migration of existing tasks, backward compatibility (completed 2026-02-19)
- [x] **Phase 14: Projects & Sections** - Project CRUD, task form extensions, tasks page redesign with section-based layout (completed 2026-02-20)
- [x] **Phase 15: Kanban Board** - 4-column kanban with cross-column drag-and-drop, detail modal, quick-add (completed 2026-02-20)

## Phase Details

### Phase 13: Data Foundation & Migration
**Goal**: Existing tasks migrate safely to the new data model, and the status/is_completed sync works bidirectionally without breaking any existing feature
**Depends on**: Nothing (first phase of v3.0)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Existing tasks have `section=personal` and `status` derived from their `is_completed` value after migration
  2. Setting a task's status to `done` via API automatically sets `is_completed=true` and records `completed_at`; moving status away from `done` clears both
  3. Dashboard task counts, sidebar counts, recurring task generation, and all existing task features work identically to before the migration
  4. Task status field accepts exactly four values: backlog, todo, in_progress, done
**Plans**: 2 plans

Plans:
- [ ] 13-01-PLAN.md — Types, sync utility, sort-order utility, migration SQL (TDD)
- [ ] 13-02-PLAN.md — Wire sync into DB layer, API routes, instance generator, update tests

### Phase 14: Projects & Sections
**Goal**: Users can organize tasks into Work/Personal sections and named projects, and the tasks page displays this structure
**Depends on**: Phase 13
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, FORM-01, FORM-02, PAGE-01, PAGE-02
**Success Criteria** (what must be TRUE):
  1. User can create a project with a name, section (Work/Personal), and preset color, and can edit or delete it afterward
  2. User can archive a project so it is hidden from the default view; deleting a project orphans its tasks into standalone within the same section
  3. Task create/edit form has a required section selector (defaults to Personal) and an optional project dropdown filtered by the selected section
  4. Tasks page displays Work and Personal as top-level sections, each showing project cards (with X/Y progress) and a standalone tasks area
  5. All new UI strings (project names, section labels, form fields, confirmations) are translated in en, zh, and zh-TW
**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md — Data foundation: SQL migrations, types, ProjectsDB, validation, API routes, tests
- [ ] 14-02-PLAN.md — Project CRUD UI, task form extensions (section toggle + project dropdown), i18n strings
- [ ] 14-03-PLAN.md — Tasks page redesign (section layout, project cards) + archived projects page

### Phase 15: Kanban Board
**Goal**: Users can view and manage a project's tasks on a 4-column kanban board with cross-column drag-and-drop, a detail modal, and column quick-add
**Depends on**: Phase 14
**Requirements**: PAGE-03, KANB-01, KANB-02, I18N-01
**Success Criteria** (what must be TRUE):
  1. Clicking a project card on the tasks page opens a 4-column kanban board (Backlog, To Do, In Progress, Done) showing that project's tasks
  2. User can drag a task card between columns to change its status, and the change persists after page reload; if the API fails the card snaps back with an error toast
  3. Clicking a kanban card opens a Monday.com-style detail modal showing all task fields; hovering a column reveals a quick-add input to create a task in that column
  4. All kanban UI strings are translated in en, zh, and zh-TW
**Plans**: 4 plans

Plans:
- [x] 15-01-PLAN.md — Foundation: install @dnd-kit, project_id API filter, kanban page route, i18n strings
- [x] 15-02-PLAN.md — Core board: KanbanBoard + KanbanColumn + KanbanCard + drag-and-drop with SWR
- [x] 15-03-PLAN.md — Interactions: Monday.com-style detail modal + column quick-add
- [ ] 15-04-PLAN.md — Documentation gap closure: mark KANB-03/04/05 as deferred in REQUIREMENTS.md and ROADMAP.md

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 3/3 | Complete | 2026-02-18 |
| 11. Sidebar Polish | v2.1 | 2/2 | Complete | 2026-02-18 |
| 12. Component Fixes | v2.1 | 1/1 | Complete | 2026-02-18 |
| 13. Data Foundation & Migration | 2/2 | Complete    | 2026-02-19 | - |
| 14. Projects & Sections | 3/3 | Complete    | 2026-02-20 | - |
| 15. Kanban Board | 3/4 | In Progress   | 2026-02-20 | - |
