---
phase: 14-projects-sections
plan: 03
subsystem: ui, i18n
tags: [react, next-themes, radix-ui, swr, next-intl, dropdown-menu, progress-bar, section-layout]

# Dependency graph
requires:
  - phase: 14-projects-sections
    provides: Projects table, API routes, ProjectsDB, validation, colors, useProjects hook, ProjectModal, ProjectDeleteDialog, task form section toggle
provides:
  - Section-based tasks page layout (Personal on top, Work below)
  - ProjectCard component with color accent, progress bar, task previews, three-dot menu
  - Archived projects page at /projects/archived with restore functionality
  - ArchivedProjectsContent client component
affects: [15-kanban-board]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SectionBlock inline component for filtering tasks/projects by section"
    - "ProjectCard uses getProjectColor + useTheme for dark mode color accent"
    - "Lifted tabs/search from TaskList to parent tasks-page-content for section layout"
    - "ArchivedProjectsContent follows same SWR + auth pattern as other content components"

key-files:
  created:
    - components/projects/project-card.tsx
    - components/projects/archived-projects-content.tsx
    - app/projects/archived/page.tsx
    - app/projects/archived/layout.tsx
  modified:
    - components/tasks/tasks-page-content.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/tasks/tasks-page-content.test.tsx

key-decisions:
  - "Lifted pending/completed tabs and search from TaskList to tasks-page-content parent level for section layout"
  - "ProjectCard uses inline style for color accent (borderLeftColor + backgroundColor with opacity) to support dynamic project colors"
  - "Task previews in ProjectCard sorted by status priority: in_progress first, then todo, then backlog"
  - "Added menuEdit/menuArchive/menuDelete i18n keys instead of reusing success message strings for menu actions"

patterns-established:
  - "SectionBlock: inline component pattern for rendering section-scoped tasks + projects"
  - "ProjectCard: color accent via left border + subtle background tint (light 0.04 / dark 0.06 opacity)"
  - "ArchivedProjectsContent: SWR hook with status filter for archived project listing"

requirements-completed: [PROJ-05, PAGE-01, PAGE-02]

# Metrics
duration: 9min
completed: 2026-02-20
---

# Phase 14 Plan 03: Tasks Page Redesign & Archived Projects Summary

**Section-based tasks page layout (Personal/Work) with ProjectCard (color accent, progress bar, task previews, three-dot menu) and archived projects page with restore**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-20T17:34:48Z
- **Completed:** 2026-02-20T17:43:39Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Redesigned tasks page from flat TaskList to section-based layout with Personal on top, Work below
- Created ProjectCard with left border color accent, progress bar, up to 5 task previews with status dots, +N more indicator, three-dot menu (Edit/Archive/Delete), and Open Board button
- Created archived projects page at /projects/archived with SidebarShell layout, auth check, and Restore button
- Lifted tabs/search controls to parent level for unified filtering across both sections
- Added Create Project button next to Create Task in page header
- Wired ProjectModal and ProjectDeleteDialog with SWR cache invalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ProjectCard component and redesign tasks page with section layout** - `5bf451b` (feat)
2. **Task 2: Create archived projects page** - `c12731c` (feat)

## Files Created/Modified
- `components/projects/project-card.tsx` - Rich project card with color accent, progress, task previews, menu, Open Board button
- `components/tasks/tasks-page-content.tsx` - Major rewrite: section-based layout, lifted tabs/search, project CRUD wiring
- `components/projects/archived-projects-content.tsx` - Client component for listing/restoring archived projects
- `app/projects/archived/page.tsx` - Server page with auth check and metadata
- `app/projects/archived/layout.tsx` - SidebarShell wrapper for archived projects route
- `i18n/messages/en.json` - Added tasks.page.createProject, tasks.sections, projects.menuEdit/Archive/Delete, projects.archived.backToTasks
- `i18n/messages/zh.json` - Chinese (Simplified) translations for all new keys
- `i18n/messages/zh-TW.json` - Chinese (Traditional) translations for all new keys
- `tests/components/tasks/tasks-page-content.test.tsx` - Updated mocks with section/status fields, added useProjects/useTheme mocks, 2 new tests

## Decisions Made
- Lifted pending/completed tabs and search from TaskList to tasks-page-content parent level -- needed because section-based layout requires unified filtering across both Personal and Work sections
- ProjectCard uses inline style for dynamic color accent rather than Tailwind classes because project colors are user-configurable (12 preset HSL values)
- Added dedicated menuEdit/menuArchive/menuDelete i18n keys rather than reusing success message strings for cleaner translations
- TaskList component left unchanged for backward compatibility (no longer used on tasks page but may be used elsewhere)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test mocks for new component dependencies**
- **Found during:** Task 1 (tasks page redesign)
- **Issue:** Existing tasks-page-content tests failed because mockTasks lacked section/status/sort_order/project_id fields, and useProjects/useTheme were not mocked
- **Fix:** Added all missing Task mock fields, added vi.mock for next-themes and @/lib/hooks/use-projects, added section-related i18n messages
- **Files modified:** tests/components/tasks/tasks-page-content.test.tsx
- **Verification:** All 1202 tests pass
- **Committed in:** 5bf451b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in tests)
**Impact on plan:** Necessary for test correctness with new component structure. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 14 (Projects & Sections) is now complete: data foundation, CRUD UI, and tasks page redesign all done
- Phase 15 (Kanban Board) can build on: ProjectCard "Open Board" button links to /projects/[id]/board, useProjects hook, all project types/API routes
- All 1202 tests pass with no regressions

## Self-Check: PASSED

All 9 claimed files verified on disk. Both commit hashes (5bf451b, c12731c) found in git log.

---
*Phase: 14-projects-sections*
*Completed: 2026-02-20*
