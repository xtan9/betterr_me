# Milestones

## v1.0 Codebase Hardening (Shipped: 2026-02-16)

**Phases completed:** 5 phases, 11 plans, 0 tasks

**Key accomplishments:**
- Fixed frequency correctness: times_per_week 3/3 = 100% (was ~43%), weekly any-day-counts (was Monday-only)
- Wired Zod validation into all 6 API routes, added ensureProfile helper, 20-habit limit, auth redirect allowlist
- Created logger module, removed dead cache (669 lines), hardened all 4 DB constructors, added _warnings to dashboard
- Replaced getUserTasks with COUNT(*) query, added adaptive streak lookback (30→60→120→240→365 days)
- Backfilled 71 tests: logs route (16), Zod schema validation (53), frequency regressions (2)

**Stats:** 116 files changed, +13,330/-1,293 lines, 992 tests passing, 0.83 hours execution time

---


## v1.1 Dashboard Task Fixes (Shipped: 2026-02-17)

**Phases completed:** 1 phase, 1 plan, 2 tasks

**Key accomplishments:**
- Fixed `getTodayTasks` to accept client-sent date parameter instead of server-local time
- Removed `is_completed` filter — completed tasks now appear in dashboard "X of Y" counts
- Eliminated timezone-based task duplication between "Today" and "Tomorrow" sections
- Updated all 3 call sites (dashboard API, dashboard SSR page, tasks API) and added tests

**Stats:** 19 files changed (source), +541/-30 lines, 10 commits, 1 day

---

## v2.0 UI Style Redesign (Shipped: 2026-02-17)

**Phases completed:** 9 phases

**Key accomplishments:**
- Extracted design tokens and established CSS foundation for consistent styling
- Replaced top-nav with collapsible sidebar navigation shell
- Implemented sidebar collapse state persistence
- Created reusable PageHeader and PageBreadcrumbs layout components
- Migrated dashboard page to card-on-gray layout pattern
- Migrated habits, tasks, and remaining pages to new layout
- Added sidebar enrichment (active states, icons, user section)
- Applied visual polish across all pages (dark mode, spacing, typography)
- Stabilized tests and regenerated visual regression baselines

---


## v2.1 UI Polish & Refinement (Shipped: 2026-02-18)

**Phases completed:** 3 phases, 6 plans
**Stats:** 59 files changed, +3220/-276 lines, 55 commits, 2 days

**Key accomplishments:**
- Defined 56 semantic CSS design tokens for categories, priorities, and status indicators with full light/dark mode support
- Eliminated all hardcoded Tailwind color classes across habit, dashboard, task, auth, hero, and settings components
- Standardized card grid spacing with `gap-card-gap` semantic token across all list views
- Restructured sidebar to Chameleon-matched flat navigation with icon containers and smooth teal hover/active transitions
- Restored motivation message colored background and pinned habit checklist footer layout

**Requirements:** 8/8 satisfied (TOKN-01/02/03, SIDE-01/02/03, COMP-01/02)

---


## v3.0 Projects & Kanban (Shipped: 2026-02-21)

**Phases completed:** 5 phases, 12 plans, 25 tasks
**Stats:** 97 files changed, +12,769/-156 lines, 24 code commits, 3 days (~49 min execution)

**Key accomplishments:**
- Added task `status` field (backlog/todo/in_progress/done) with bidirectional `is_completed` sync, section field, sort_order, and migration SQL seeding existing tasks
- Full project CRUD: create with name/section/color, edit, archive/restore, delete (orphans tasks as standalone)
- Redesigned tasks page with Work/Personal section-based layout, project cards with X/Y progress bars, and standalone tasks area
- 4-column kanban board per project with @dnd-kit drag-and-drop, SWR optimistic mutations with rollback, Monday.com-style detail modal, and column quick-add
- Fixed integration bugs: API field forwarding (section/project_id), SWR cache shape corruption on drag-drop, added archived projects navigation
- All UI strings translated in en, zh, zh-TW; 3 deferred requirements (KANB-03/04/05) documented with user decisions as rationale

**Requirements:** 17/17 satisfied (DATA-01..04, PROJ-01..05, FORM-01..02, PAGE-01..03, KANB-01..02, I18N-01)

**Tech debt (7 minor items):** Missing Phase 16 VERIFICATION.md, getSortOrderBetween unused export, archiveProject dead code, getUserTasks ordering, comments/activity placeholders, no sidebar nav highlight on kanban, SUMMARY.md missing requirements-completed frontmatter

---

