---
phase: 06-habits-tasks-remaining-pages-migration
plan: 03
subsystem: ui
tags: [pageheader, breadcrumbs, card-layout, shadcn, tasks, settings]

# Dependency graph
requires:
  - phase: 06-habits-tasks-remaining-pages-migration
    plan: 01
    provides: PageBreadcrumbs component, TaskForm hideChrome/id props, breadcrumb i18n strings
  - phase: 04-page-layout-shell
    provides: PageHeader component and content wrapper layout
provides:
  - Tasks list page with PageHeader
  - Task detail page with breadcrumbs, PageHeader, Card-wrapped content
  - Task create page with breadcrumbs, PageHeader actions, Card-wrapped form
  - Task edit page with breadcrumbs, PageHeader actions, Card-wrapped form
  - Settings page with PageHeader
affects: [06-04-remaining-pages-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "External form submission via form attribute linking PageHeader buttons to form id"
    - "Breadcrumb + PageHeader grouping in wrapper div for nested page layouts"

key-files:
  created: []
  modified:
    - components/tasks/tasks-page-content.tsx
    - components/tasks/task-detail-content.tsx
    - components/tasks/create-task-content.tsx
    - components/tasks/edit-task-content.tsx
    - components/settings/settings-content.tsx
    - tests/components/tasks/task-detail-content.test.tsx
    - tests/components/tasks/create-task-content.test.tsx
    - tests/components/tasks/edit-task-content.test.tsx

key-decisions:
  - "Task detail Card uses max-w-3xl while create/edit forms use max-w-2xl (matching existing widths)"
  - "Back button replaced with breadcrumb navigation (Tasks > item name) for consistent hierarchy"
  - "Settings page keeps multi-card layout with no container Card wrapping (locked decision)"

patterns-established:
  - "Nested page layout: PageBreadcrumbs + PageHeader in wrapper div, content in Card below"
  - "Form pages: hideChrome + id on form, Cancel/Submit in PageHeader actions via form attribute"

requirements-completed: [VISL-10]

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 06 Plan 03: Tasks and Settings Pages Migration Summary

**All 4 task pages (list, detail, create, edit) and settings page migrated to PageHeader with breadcrumbs and Card layout**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T07:25:03Z
- **Completed:** 2026-02-17T07:32:40Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Migrated tasks list page to PageHeader with Create button in actions slot
- Migrated task detail page: replaced back button with breadcrumbs, added PageHeader with Edit action, wrapped content in Card
- Migrated create/edit task pages: breadcrumbs, PageHeader with Save/Cancel actions, Card-wrapped form with hideChrome and external submit
- Migrated settings page to PageHeader with Save button (both error and main states)
- Updated all 3 task test files with breadcrumb translations and adjusted assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate tasks list and detail pages to PageHeader and breadcrumbs** - `0fc551f` (feat)
2. **Task 2: Migrate create/edit task pages and settings page** - `d2e6a73` (feat)

## Files Created/Modified
- `components/tasks/tasks-page-content.tsx` - Replaced inline header with PageHeader, skeleton with PageHeaderSkeleton
- `components/tasks/task-detail-content.tsx` - Replaced back button with breadcrumbs, added PageHeader + Card wrapping, updated skeleton
- `components/tasks/create-task-content.tsx` - Added breadcrumbs, PageHeader with Save/Cancel, Card-wrapped form with hideChrome
- `components/tasks/edit-task-content.tsx` - Added breadcrumbs, PageHeader with Save/Cancel, Card-wrapped form with hideChrome, updated skeleton
- `components/settings/settings-content.tsx` - Replaced inline header with PageHeader (main and error states)
- `tests/components/tasks/task-detail-content.test.tsx` - Replaced back button test with breadcrumb test, fixed duplicate text query, added common.nav translations
- `tests/components/tasks/create-task-content.test.tsx` - Added breadcrumb and common.nav translations to mock
- `tests/components/tasks/edit-task-content.test.tsx` - Added common.nav translations to mock

## Decisions Made
- Task detail page uses `max-w-3xl` on Card (matching existing content width), while create/edit pages use `max-w-2xl` (matching existing form width)
- Back button in task detail replaced with PageBreadcrumbs (`Tasks > task title`) for consistent hierarchical navigation matching the habits pattern
- Settings page retains its multi-card layout as a locked decision -- only the header was migrated to PageHeader
- Error states in settings and edit-task simplified by removing max-w constraint (content wrapper handles centering)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task title ("Buy groceries") appearing in both breadcrumb and PageHeader caused `getByText` to fail in tests -- resolved by using `getAllByText` with length assertion for the duplicate text case.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All task pages and settings page now use the consistent PageHeader + breadcrumb + Card layout
- Ready for 06-04 (remaining pages migration) which covers any other pages not yet migrated
- All 951 tests passing, lint clean

## Self-Check: PASSED

All files verified present. All commits verified in history.
