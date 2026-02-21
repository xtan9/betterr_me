# Project Research Summary

**Project:** BetterR.Me v3.0 -- Projects & Kanban Milestone
**Domain:** Personal kanban task management with project containers (single-user)
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

BetterR.Me is adding project organization and kanban boards to its existing task management system. The feature set is well-understood: 4-column kanban (Backlog / To Do / In Progress / Done), drag-and-drop between columns, Work/Personal sections replacing category-based distinction, projects as named containers with preset colors, and a completion reflection trigger on drag-to-Done. This is a pattern implemented by Todoist, Trello, and Linear -- the implementation path is clear and the research is convergent across all four areas.

The stack addition is minimal: only `@dnd-kit/core` v6 + `@dnd-kit/sortable` + `@dnd-kit/utilities` (~15kB combined, 3 packages). Everything else -- UI components, form handling, data fetching, validation, i18n, testing -- is already in the existing stack. The architecture layers cleanly onto the existing `DB class -> API route -> SWR hook -> React component` pattern with no new architectural paradigms. The database changes are additive: a new `projects` table, and four new nullable/defaulted columns on `tasks` (`section`, `status`, `project_id`, `sort_order`).

The highest-risk area is the data model migration, not the DnD implementation. Adding a `status` enum alongside the existing `is_completed` boolean creates a dual-source-of-truth that touches the dashboard, sidebar counts, recurring tasks, and 94+ test assertions. The mitigation is a bidirectional sync in the API layer and a careful expand-and-contract migration strategy. Secondary risk is SWR cache fragmentation -- kanban drag operations must invalidate task lists, dashboard, and sidebar caches simultaneously. A centralized cache invalidation utility should be built before any kanban work begins.

## Key Findings

### Recommended Stack

The existing stack handles 95% of the feature requirements. The only new dependency is the drag-and-drop library.

**New dependencies (3 packages, ~15kB):**
- `@dnd-kit/core` v6.3.1: DnD primitives (DndContext, sensors, collision detection) -- battle-tested, hook-based, excellent accessibility with keyboard + screen reader support
- `@dnd-kit/sortable` v10.0.0: Sortable preset for reordering items within and between kanban columns
- `@dnd-kit/utilities` v3.2.2: CSS transform utilities for drag animations

**Critical compatibility note:** `@dnd-kit/core` v6 does not declare React 19 in its peer dependencies, but works correctly. Add `pnpm.peerDependencyRules.allowedVersions` to `package.json` (same pattern shadcn/ui uses for React 19).

**DnD library decision (resolving research conflict):** STACK.md and ARCHITECTURE.md disagreed on library choice. STACK.md recommends `@dnd-kit/core` v6 (stable); ARCHITECTURE.md recommends `@dnd-kit/react` v0.3.x (new rewrite). **The recommendation is `@dnd-kit/core` v6 (stable).** Rationale:
- `@dnd-kit/react` is at v0.3.1 -- pre-1.0, API may break between minor versions
- `@dnd-kit/react` has a known missing `"use client"` directive issue (GitHub #1654)
- `@dnd-kit/core` v6 has extensive community examples specifically for kanban + shadcn/ui + Tailwind
- The React 19 peer dep issue is cosmetic (works correctly, just needs pnpm config)
- Multiple reference implementations validate this path: Georgegriff/react-dnd-kit-tailwind-shadcn-ui, marmelab kanban tutorial (Jan 2026)

**What NOT to add:** framer-motion (Tailwind transitions sufficient), react-virtualized (premature at personal app scale), Zustand/Redux (SWR + useState covers all state needs), immer (simple spread operators suffice).

See: `.planning/research/STACK.md` for full analysis.

### Expected Features

**Must have (table stakes):**
- 4-status workflow: Backlog / To Do / In Progress / Done
- Drag-and-drop between columns AND card ordering within columns
- Projects as named containers with preset color palette (8-12 colors)
- Work / Personal section separation (replaces old category toggles)
- Status-driven completion: `status=done` implies `is_completed=true` (bidirectional sync)
- Task form: section selector (required) + project selector (optional)
- Tasks page redesign: section tabs with project cards and standalone tasks
- Data migration: existing tasks get `section='personal'`, `status` derived from `is_completed`

**Should have (differentiators):**
- Completion reflection on drag-to-Done -- bridges kanban mechanics with BetterR.Me's self-improvement philosophy; NO competitor does this
- Intention ("Your Why") display on kanban cards -- unique to BetterR.Me
- Project progress visualization (X of Y tasks done)
- Active/Archived project status
- Standalone tasks section (tasks without a project)
- Keyboard-accessible drag-and-drop (native to dnd-kit, needs ARIA labels)

**Defer (v2+):**
- Custom columns / user-defined statuses
- WIP limits, swimlanes, sub-projects
- Multiple board views (calendar, timeline, gallery)
- Subtasks/checklists, labels/tags, automations
- Collaborative features (single-user app)
- Drag-to-reorder projects (manual sort_order sufficient for v1)

**Critical path:** Data migration -> Status field -> Section field -> Projects table -> Kanban board -> DnD -> Tasks page redesign

See: `.planning/research/FEATURES.md` for full feature landscape and competitor analysis.

### Architecture Approach

The architecture extends the existing data flow without introducing new patterns. A new `ProjectsDB` class follows the same constructor-injected Supabase client pattern as `HabitsDB` and `TasksDB`. New API routes (`/api/projects`, `/api/tasks/reorder`) follow existing REST conventions. New SWR hooks (`useProjects`, `useTasks`, `useKanbanTasks`) follow the same typed fetcher pattern. The kanban board is a client component with `"use client"` (or `next/dynamic` with `ssr: false`), while the task list view remains server-renderable.

**Major components:**
1. `ProjectsDB` + `/api/projects` -- CRUD for projects, RLS-protected
2. `TasksDB` extensions + `/api/tasks/reorder` -- kanban queries, bulk reorder endpoint
3. `KanbanBoard` + `KanbanColumn` + `KanbanCard` -- DnD components using @dnd-kit
4. Tasks page redesign -- section tabs (Work/Personal), project cards, standalone tasks
5. Task form extensions -- section selector, project dropdown, status field

**Key architectural decisions:**
- **SWR as single source of truth for kanban state** -- no dual local state + server state. Optimistic updates via `mutate()` with `rollbackOnError: true`. Local `useState` only during active drag for in-flight visual position.
- **Float-based sort_order** -- enables single-row updates on reorder (midpoint calculation). No full column renumbering.
- **Dedicated reorder endpoint** (`POST /api/tasks/reorder`) -- cross-column moves need atomic status + sort_order updates; keeps existing PATCH endpoint clean.
- **Application-level is_completed/status sync** (resolving research conflict) -- PITFALLS.md suggested a DB trigger; ARCHITECTURE.md suggested API-layer sync. **Recommendation: API-layer sync.** A DB trigger hides logic and makes unit testing harder. The sync is simple (4 lines of code in PATCH handler) and explicitly testable. If bugs emerge, a DB trigger can be added as a safety net later.

**New files:** ~26 new files (DB classes, API routes, hooks, components, validations, migrations, i18n strings)
**Modified files:** ~12 existing files (types, task DB, task API, task form, task card, tasks page, sidebar)

See: `.planning/research/ARCHITECTURE.md` for full component boundaries, data model SQL, and data flow diagrams.

### Critical Pitfalls

1. **Breaking the `is_completed` boolean contract** -- The existing system has 94+ assertions on `is_completed`. Dashboard, sidebar, recurring tasks, and task list all depend on it. Adding a `status` field without bidirectional sync causes tasks to appear "done" in kanban but "pending" in dashboard. **Prevention:** Keep `is_completed` forever as a denormalized field. Sync bidirectionally in API PATCH handlers. Run all 1084+ existing tests after migration. Never remove `is_completed`.

2. **SWR cache fragmentation** -- Kanban drag must invalidate kanban view, task list, dashboard, AND sidebar counts. Missing any cache causes stale data. **Prevention:** Build a centralized `invalidateTaskCaches()` utility BEFORE the kanban board. Retrofit existing mutation sites (`create-task-content.tsx`, `dashboard-content.tsx`) to use it.

3. **Hydration mismatch with SSR** -- DnD components use browser APIs that do not exist on the server. `"use client"` does NOT prevent server pre-rendering. **Prevention:** Wrap kanban board with `next/dynamic({ ssr: false })`. Provide loading skeleton. Test with production build.

4. **Breaking recurring task instance generation** -- `RecurringTasksDB` filters on `is_completed = false` for scope operations. If `project_id` gets a NOT NULL constraint, instance generation breaks. **Prevention:** `project_id` MUST be nullable. Do NOT add `status` or `project_id` to the `recurring_tasks` template table. Add integration test for recurring tasks post-migration.

5. **Optimistic update rollback chaos** -- DnD library internal state and SWR cache can diverge on API failure. `revalidateOnFocus` during drag cancels the operation. **Prevention:** Disable `revalidateOnFocus` while `isDragging`. Use local state as visual truth during drag, sync from SWR when not dragging. Batch status + sort_order into single API call.

See: `.planning/research/PITFALLS.md` for full pitfall analysis, recovery strategies, and phase-to-pitfall mapping.

## Implications for Roadmap

Based on the combined research, the feature decomposes into 4 phases with clear dependency ordering.

### Phase 1: Database Foundation & Migration

**Rationale:** Everything depends on the data model. The `status`, `section`, `project_id`, and `sort_order` columns must exist before any UI work. The `projects` table must exist before project CRUD. The data migration for existing tasks must run before any new UI deploys.

**Delivers:**
- `projects` table with RLS policies
- New columns on `tasks` table (`section`, `status`, `project_id`, `sort_order`)
- Data migration: existing tasks get `section='personal'`, `status` derived from `is_completed`, `sort_order` from `ROW_NUMBER()`
- `ProjectsDB` class + `TasksDB` extensions
- Type definitions (`Project`, `TaskSection`, `TaskStatus`, `TaskWithProject`)
- Validation schemas (project, reorder, extended task)
- Bidirectional `is_completed`/`status` sync in task API PATCH handler
- Centralized SWR cache invalidation utility (`invalidateTaskCaches()`)

**Addresses features:** Data migration, status field, section field, status-driven completion
**Avoids pitfalls:** #1 (is_completed contract), #4 (SWR fragmentation), #6 (recurring tasks)

**Verification:** Run ALL existing 1084+ tests. Specifically: `tasks.test.ts` (21 is_completed assertions), `dashboard/route.test.ts`, recurring task scope operations. Create a recurring task after migration and verify instances generate correctly.

### Phase 2: Projects & Sections

**Rationale:** Projects and sections are the organizational layer that gives structure to the tasks page. They must exist before the kanban board because the kanban board is scoped to a project. Building project CRUD and the tasks page redesign first validates the data model without DnD complexity.

**Delivers:**
- Projects API routes (`/api/projects`, `/api/projects/[id]`)
- `useProjects()` SWR hook
- Project CRUD UI (create, edit, archive, delete)
- Project color presets (8-12 hex colors)
- Section selector in task form (replaces category toggles)
- Project selector in task form (optional, filtered by section)
- Tasks page redesign: Work/Personal section tabs with project cards
- Standalone tasks section (tasks without project_id)
- Sidebar navigation: Projects nav item
- i18n strings for all three locales (en, zh, zh-TW)

**Addresses features:** Projects as named containers, Work/Personal sections, task form redesign, tasks page redesign, project color presets, active/archived status, standalone tasks
**Avoids pitfalls:** Building DnD on a shifting data model; mixing layout changes with interaction bugs

### Phase 3: Kanban Board & Drag-and-Drop

**Rationale:** The kanban board is the most complex interactive component and depends on all prior work. It needs stable project CRUD, the status field, sort_order, and the reorder API. Building it last means the data model, validation, and caching patterns are proven before adding DnD complexity.

**Delivers:**
- Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- pnpm `peerDependencyRules` for React 19 compatibility
- `KanbanBoard` component with `DndContext` + `DragOverlay`
- `KanbanColumn` (4 columns: Backlog, To Do, In Progress, Done)
- `KanbanCard` (draggable task card with `useSortable`)
- Cross-column drag with status change
- Within-column reorder with float-based sort_order
- Optimistic updates via SWR `mutate()` with rollback
- `POST /api/tasks/reorder` endpoint
- Completion reflection dialog on drag-to-Done
- `next/dynamic` SSR-disabled wrapper with loading skeleton
- Status dropdown on each card (non-DnD fallback for accessibility/mobile)

**Addresses features:** Drag-and-drop between columns, card ordering, completion reflection on drag-to-Done
**Uses stack:** `@dnd-kit/core` v6, `@dnd-kit/sortable`, SWR optimistic updates
**Avoids pitfalls:** #2 (hydration mismatch), #3 (optimistic rollback), DnD library incompatibility

**Verification:** Test with React Strict Mode. Run `pnpm build && pnpm start` and verify no hydration errors. Simulate network failure during drag -- card must return to original position with error toast. Test keyboard-only navigation (arrow keys between columns).

### Phase 4: Polish & Production Readiness

**Rationale:** Final phase for edge cases, accessibility, performance, and UX refinement that should not block the core feature delivery.

**Delivers:**
- Keyboard-accessible DnD with custom ARIA announcements in all 3 locales
- Intention ("Your Why") display on kanban cards
- Project progress visualization (X of Y tasks done)
- Touch device optimization (grab handle, visual feedback on drag start)
- Independent column scrolling (`overflow-y: auto`, max-height)
- Empty column states
- Delete project confirmation with orphan task handling
- Mobile responsive kanban layout
- Full test coverage for new components

**Addresses features:** Keyboard DnD, intention display, project progress, touch UX
**Avoids pitfalls:** #5 (mobile DnD), UX pitfalls (DnD-only status change, no scroll, missing empty states)

### Phase Ordering Rationale

- **Data model first** because both the list view and kanban view depend on `status`, `section`, `project_id`, and `sort_order`. The migration also exercises the `is_completed`/`status` sync.
- **Projects & sections second** because the kanban board is scoped to a project. Building project CRUD first validates the data model through normal CRUD operations before adding DnD complexity.
- **Kanban third** because it is the most complex interaction and builds on everything: stable data model, working project/section structure, proven SWR caching patterns, and validated API routes.
- **Polish last** because accessibility, touch optimization, and progress visualization should not block core feature delivery.
- **This ordering avoids the top pitfalls:** Phase 1 addresses `is_completed` sync and recurring task safety before any UI changes. Phase 2 validates the data model without DnD. Phase 3 can focus purely on the drag-and-drop interaction.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1 (Database Foundation):** The `is_completed`/`status` bidirectional sync needs careful design. Review all existing `is_completed` query sites before writing the migration. May need `/gsd:research-phase` for Supabase migration best practices with existing data.
- **Phase 3 (Kanban Board):** Build a 2-column, 3-card proof-of-concept prototype FIRST to validate `@dnd-kit/core` v6 works with React 19 + Next.js 16 + React Strict Mode before committing to the full implementation.

**Phases with standard patterns (skip deep research):**
- **Phase 2 (Projects & Sections):** Standard CRUD with existing patterns. Follows `HabitsDB`/`TasksDB` class pattern exactly. Well-understood REST API + SWR hook pattern.
- **Phase 4 (Polish):** Accessibility and UX refinements follow established dnd-kit documentation and existing vitest-axe testing patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Multiple independent sources (npm, GitHub, tutorials, community projects) converge on @dnd-kit/core v6 as the right choice. React 19 compat fix is documented. |
| Features | MEDIUM-HIGH | Feature scope is clear based on competitor analysis (Todoist, Trello, Linear). User decisions (4 columns, preset colors, Work/Personal sections) are already locked in. Minor uncertainty on edge cases. |
| Architecture | HIGH | Extends existing patterns exactly. No new architectural paradigms. DB class, API route, SWR hook, React component -- all follow established conventions. |
| Pitfalls | HIGH | Codebase-specific analysis identified 7 critical pitfalls with concrete file references and line-level impacts. Prevention strategies are actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **DnD proof-of-concept:** The `@dnd-kit/core` v6 + React 19 combination needs a hands-on prototype before full build. While multiple sources say it works, a 30-minute POC eliminates the biggest technical risk.
- **Float sort_order normalization threshold:** The 0.001 gap threshold for re-normalizing sort_order is a heuristic. At personal app scale (dozens of tasks per column) this is unlikely to matter, but should be monitored.
- **Mobile touch DnD behavior:** `@dnd-kit` supports `TouchSensor` but behavior with the existing mobile viewport breakpoints needs testing on actual devices, not just responsive browser.
- **i18n for DnD accessibility announcements:** Screen reader announcements for drag operations need translation into zh and zh-TW. CJK screen readers may handle ARIA live regions differently -- needs validation during Phase 4.
- **Category field deprecation:** FEATURES.md suggests dropping the old `category` field once sections ship. This needs a clear deprecation plan -- which phase removes it, and how to handle existing data with category values.

## Sources

### Primary (HIGH confidence)
- [@dnd-kit/core on npm](https://www.npmjs.com/package/@dnd-kit/core) -- v6.3.1, package details, peer deps
- [@dnd-kit/sortable on npm](https://www.npmjs.com/package/@dnd-kit/sortable) -- v10.0.0
- [dnd-kit official docs](https://dndkit.com/) -- API reference, sortable preset, accessibility
- [pnpm peerDependencyRules docs](https://pnpm.io/settings) -- allowedVersions configuration
- [SWR Mutation & Revalidation docs](https://swr.vercel.app/docs/mutation) -- optimistic update pattern
- BetterR.Me codebase analysis -- `lib/db/tasks.ts`, `lib/db/recurring-tasks.ts`, `components/dashboard/dashboard-content.tsx`, `components/tasks/tasks-page-content.tsx`, `app/api/tasks/route.ts`, and 15+ other files

### Secondary (MEDIUM confidence)
- [Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) -- Reference kanban with dnd-kit + shadcn/ui
- [marmelab: Building a Kanban board with shadcn (Jan 2026)](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) -- Optimistic update patterns
- [Todoist Board Layout](https://www.todoist.com/help/articles/use-the-board-layout-in-todoist-AiAVsyEI) -- Competitor feature analysis
- [Linear Board Layout docs](https://linear.app/docs/board-layout) -- Competitor architecture analysis
- [Top 5 DnD Libraries for React 2026 (Puck)](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) -- Ecosystem comparison
- [Basedash: Implementing Re-Ordering at the Database Level](https://www.basedash.com/blog/implementing-re-ordering-at-the-database-level-our-experience) -- Float sort_order pattern

### Tertiary (LOW confidence)
- [@dnd-kit/react on npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.3.1, pre-1.0, evaluated but NOT recommended
- [GitHub Discussion #1842: @dnd-kit/react vs @dnd-kit/core roadmap](https://github.com/clauderic/dnd-kit/discussions/1842) -- No maintainer response on stability timeline

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
