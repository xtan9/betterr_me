# Roadmap: BetterR.Me

## Milestones

- v1.0 **Codebase Hardening** - Phases 1-5 (shipped 2026-02-16)
- **v1.1 Dashboard Task Fixes** - Phase 6 (in progress)

## Phases

<details>
<summary>v1.0 Codebase Hardening (Phases 1-5) - SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See MILESTONES.md for details.

</details>

### v1.1 Dashboard Task Fixes

**Milestone Goal:** Fix timezone-dependent task duplication and incorrect completion count on dashboard

- [ ] **Phase 6: Dashboard Task Data Flow** - Fix date parameter handling and completion counting so dashboard tasks display correctly

## Phase Details

### Phase 6: Dashboard Task Data Flow
**Goal**: Users see correct task lists and accurate completion counts on the dashboard, regardless of their timezone relative to the server
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: TASK-01, TASK-02, TASK-03
**Success Criteria** (what must be TRUE):
  1. User in any timezone sees only today's tasks in the "Today's Tasks" section, with no duplication into the "Coming Up Tomorrow" section
  2. User who completes a task sees it still counted in the dashboard task total (e.g., completing 1 of 2 tasks shows "1 of 2 completed", not "0 of 1")
  3. User whose local date differs from UTC server date sees tasks filtered by their local date, not the server's date
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Fix getTodayTasks date handling, include completed tasks, update tests

## Progress

**Execution Order:**
Phase 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. Dashboard Task Data Flow | v1.1 | 0/1 | Not started | - |
