# Requirements: BetterR.Me v3.0 Projects & Kanban

**Defined:** 2026-02-18
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v3.0 Requirements

Requirements for the Projects & Kanban milestone. Each maps to roadmap phases.

### Data Foundation

- [x] **DATA-01**: User's existing tasks receive `section=personal` and `status` derived from `is_completed` via migration
- [x] **DATA-02**: Task `status` field supports backlog, todo, in_progress, and done values
- [x] **DATA-03**: `is_completed` is derived from `status=done` — setting status to done marks task complete (with `completed_at`), moving away from done clears completion
- [x] **DATA-04**: Dashboard, recurring tasks, and all existing task features continue to work unchanged after migration

### Projects

- [x] **PROJ-01**: User can create a project with a name, section (Work/Personal), and preset color
- [x] **PROJ-02**: User can edit a project's name, color, and section
- [x] **PROJ-03**: User can archive a project (hidden by default, available via filter)
- [x] **PROJ-04**: User can delete a project (tasks become standalone within the same section)
- [x] **PROJ-05**: User can see project progress (X of Y tasks done) on the tasks page project card

### Task Form

- [x] **FORM-01**: User can select a section (Work/Personal) when creating or editing a task (required, defaults to Personal)
- [x] **FORM-02**: User can optionally assign a task to a project (dropdown filtered by selected section)

### Tasks Page

- [x] **PAGE-01**: Tasks page shows Work and Personal as top-level sections
- [x] **PAGE-02**: Each section displays project cards and a standalone tasks area
- [x] **PAGE-03**: Clicking a project card opens the kanban board view for that project

### Kanban Board

- [x] **KANB-01**: User can view a project's tasks in a 4-column kanban board (Backlog, To Do, In Progress, Done)
- [x] **KANB-02**: User can drag and drop tasks between kanban columns to change status

### Internationalization

- [x] **I18N-01**: All new UI strings are translated in en, zh, and zh-TW

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Kanban Polish

- **KANB-03**: User can drag and drop tasks within a column to reorder — deferred; user decided cards auto-sort by priority (high to low), no manual reorder needed (Phase 15 context decision)
- **KANB-04**: Completion reflection on drag-to-Done — deferred; user decided tasks move to Done silently with no emoji prompt (Phase 15 context decision)
- **KANB-05**: Kanban cards display task intention ("Your Why") — deferred; user decided no intention display on cards (Phase 15 context decision)
- **KANB-06**: Kanban board is fully keyboard-navigable with ARIA labels in all 3 locales
- **KANB-07**: Touch-optimized drag-and-drop for mobile devices

### Project Enhancements

- **PROJ-06**: User can drag and drop to reorder projects within a section
- **PROJ-07**: User can view archived projects and restore them

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom kanban columns / user-defined statuses | Fixed 4-column model matches personal use; custom columns are team-oriented complexity |
| WIP (Work-in-Progress) limits | Team feature; solo users know their own capacity |
| Sub-projects / nested hierarchy | Flat projects within sections is sufficient for personal use |
| Multiple board views (list, calendar, timeline) | Kanban-only for projects; existing task list handles flat view |
| Subtasks / checklists on task cards | Keep tasks flat; use description for notes |
| Automations / rules | Power-user feature requiring rule engine; way out of scope |
| Time tracking | Separate product domain; not aligned with self-improvement focus |
| Card cover images / attachments | Visual noise for personal task management |
| Swimlanes | Overkill for personal kanban with <50 tasks per project |
| Collaborative features (assignees, comments, sharing) | BetterR.Me is single-user |
| Project drag-to-reorder | Lower priority than kanban DnD; manual sort via settings sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 13 | Complete |
| DATA-02 | Phase 13 | Complete |
| DATA-03 | Phase 13 | Complete |
| DATA-04 | Phase 13 | Complete |
| PROJ-01 | Phase 16 | Complete |
| PROJ-02 | Phase 14 | Complete |
| PROJ-03 | Phase 16 | Complete |
| PROJ-04 | Phase 14 | Complete |
| PROJ-05 | Phase 14 | Complete |
| FORM-01 | Phase 16 | Complete |
| FORM-02 | Phase 16 | Complete |
| PAGE-01 | Phase 16 | Complete |
| PAGE-02 | Phase 16 | Complete |
| PAGE-03 | Phase 15 | Complete |
| KANB-01 | Phase 15 | Complete |
| KANB-02 | Phase 16 | Complete |
| KANB-03 | Phase 15 | Deferred |
| KANB-04 | Phase 15 | Deferred |
| KANB-05 | Phase 15 | Deferred |
| I18N-01 | Phase 15 | Complete |

**Coverage:**
- v3.0 requirements: 17 active (3 deferred to future)
- Satisfied: 10 | Pending (Phase 16 gap closure): 7
- Mapped to phases: 17
- Deferred: 3 (KANB-03, KANB-04, KANB-05)

**I18N-01 note:** Mapped to Phase 15 for final verification, but i18n strings are added alongside each feature in every phase. Each phase's success criteria includes translation of strings built in that phase.

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-20 — Phase 16 gap closure: FORM-01, FORM-02, PROJ-01, PROJ-03, PAGE-01, PAGE-02, KANB-02 reset to Pending*
