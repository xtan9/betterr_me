---
phase: 14-projects-sections
plan: 02
subsystem: ui, i18n
tags: [react-hook-form, zod, radix-ui, next-themes, swr, next-intl, dialog, toggle-group, select]

# Dependency graph
requires:
  - phase: 14-projects-sections
    provides: Projects table, ProjectsDB class, API routes, validation schemas, color constants
provides:
  - ProjectModal (create/edit project dialog with form validation)
  - ProjectColorPicker (12 preset color swatches with dark mode support)
  - ProjectDeleteDialog (delete confirmation with standalone task explanation)
  - useProjects SWR hook with section/status filtering
  - TaskForm section toggle (Personal/Work) and project dropdown with color dots
  - Complete i18n strings for projects namespace in en/zh/zh-TW
affects: [14-03-PLAN, 15-kanban-board]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useProjects hook follows same SWR pattern as useHabits (fetcher, data extraction, filter params)"
    - "ProjectModal uses react-hook-form + zodResolver matching existing TaskForm pattern"
    - "Section toggle uses ToggleGroup (type=single, variant=outline) for binary choice"
    - "Project dropdown color dots use getProjectColor + useTheme for dark mode"

key-files:
  created:
    - components/projects/project-modal.tsx
    - components/projects/project-color-picker.tsx
    - components/projects/project-delete-dialog.tsx
    - lib/hooks/use-projects.ts
  modified:
    - components/tasks/task-form.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/tasks/task-form.test.tsx
    - tests/components/tasks/create-task-content.test.tsx
    - tests/components/tasks/edit-task-content.test.tsx

key-decisions:
  - "Section toggle placed right after title field in task form (per locked decision)"
  - "Section change silently clears project_id (no confirmation dialog)"
  - "Project dropdown shows 'No Project' as first option mapping to null project_id"
  - "useProjects fetches all active projects and filters by section client-side"

patterns-established:
  - "useProjects: SWR hook with optional section/status filter params"
  - "ProjectModal: Dialog + react-hook-form + zodResolver for project CRUD"
  - "ProjectDeleteDialog: AlertDialog with destructive action styling pattern"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04, FORM-01, FORM-02]

# Metrics
duration: 7min
completed: 2026-02-20
---

# Phase 14 Plan 02: Project CRUD UI & Task Form Extensions Summary

**ProjectModal/ColorPicker/DeleteDialog components, useProjects SWR hook, task form section toggle and project dropdown with color dots, complete i18n in 3 locales**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-20T17:24:23Z
- **Completed:** 2026-02-20T17:32:05Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- ProjectModal with create/edit modes, react-hook-form validation, section toggle, and color picker
- ProjectColorPicker rendering 12 preset swatches with dark mode support via useTheme
- ProjectDeleteDialog with AlertDialog, destructive styling, and standalone task explanation
- useProjects SWR hook following useHabits pattern with section/status filter support
- Task form extended with section toggle (defaults Personal) and project dropdown filtered by section
- Section switch silently clears project_id to prevent cross-section project assignment
- Complete projects namespace in all 3 locales (46 keys each: CRUD labels, colors, sections, archived)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project UI components and useProjects hook** - `f330703` (feat)
2. **Task 2: Extend task form with section toggle and project dropdown, add all i18n strings** - `fca3b8d` (feat)

## Files Created/Modified
- `components/projects/project-modal.tsx` - Create/edit project dialog with form validation
- `components/projects/project-color-picker.tsx` - Grid of 12 preset color swatches with dark mode
- `components/projects/project-delete-dialog.tsx` - Delete confirmation with standalone task explanation
- `lib/hooks/use-projects.ts` - SWR hook for fetching projects with section/status filters
- `components/tasks/task-form.tsx` - Added section toggle and project dropdown after title field
- `i18n/messages/en.json` - Added projects namespace and tasks section/project keys
- `i18n/messages/zh.json` - Simplified Chinese translations for all new keys
- `i18n/messages/zh-TW.json` - Traditional Chinese translations for all new keys
- `tests/components/tasks/task-form.test.tsx` - Updated mocks, added section/project test, fixed Task mock
- `tests/components/tasks/create-task-content.test.tsx` - Added next-themes and useProjects mocks
- `tests/components/tasks/edit-task-content.test.tsx` - Added mocks and complete Task mock fields

## Decisions Made
- Section toggle placed right after title in task form (per locked design decision from research)
- Section change silently clears project_id -- no user confirmation needed for this low-stakes reset
- Project dropdown shows "No Project" as first option, mapping to null project_id
- useProjects fetches all active projects, filters by section client-side (simpler than per-section API calls)
- Category toggle tests updated to use Shopping/Other buttons to avoid collision with section toggle Work/Personal

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test mocks for new dependencies**
- **Found during:** Task 2 (task form extension)
- **Issue:** Existing task-form, create-task-content, and edit-task-content tests failed because TaskForm now imports useProjects and useTheme
- **Fix:** Added vi.mock for next-themes and @/lib/hooks/use-projects in all 3 test files, added missing Task mock fields (status, section, sort_order, project_id, completion_difficulty), added i18n keys for section/project
- **Files modified:** tests/components/tasks/task-form.test.tsx, tests/components/tasks/create-task-content.test.tsx, tests/components/tasks/edit-task-content.test.tsx
- **Verification:** All 1200 tests pass
- **Committed in:** fca3b8d (Task 2 commit)

**2. [Rule 1 - Bug] Fixed ambiguous button selectors in tests**
- **Found during:** Task 2 (task form extension)
- **Issue:** Category tests using `getByRole('button', { name: /Work/ })` now match both the section toggle "Work" button and the category "Work" toggle
- **Fix:** Updated category selection tests to use Shopping/Other buttons which have no section toggle collision; updated submission test to use getAllByRole for Work button
- **Files modified:** tests/components/tasks/task-form.test.tsx
- **Verification:** All 23 task-form tests pass
- **Committed in:** fca3b8d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes in tests)
**Impact on plan:** Both fixes necessary for test correctness with new form fields. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All project CRUD UI components ready for consumption by tasks page redesign (Plan 14-03)
- Task form has section toggle and project dropdown ready for section-based layout
- useProjects hook available for project filtering in kanban views
- All 1200 tests pass with no regressions

## Self-Check: PASSED

All 11 claimed files verified on disk. Both commit hashes (f330703, fca3b8d) found in git log.

---
*Phase: 14-projects-sections*
*Completed: 2026-02-20*
