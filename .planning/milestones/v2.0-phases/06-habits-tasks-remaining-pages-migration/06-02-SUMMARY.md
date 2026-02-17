---
phase: 06-habits-tasks-remaining-pages-migration
plan: 02
subsystem: ui
tags: [page-header, breadcrumbs, card-layout, habits, react]

# Dependency graph
requires:
  - phase: 06-habits-tasks-remaining-pages-migration
    provides: PageBreadcrumbs component and HabitForm hideChrome/id props (plan 01)
  - phase: 04-page-layout-shell
    provides: PageHeader component, PageHeaderSkeleton, content wrapper layout
provides:
  - Habits list page with PageHeader
  - Habit detail page with breadcrumbs, PageHeader, Card-wrapped content
  - Create habit page with breadcrumbs, PageHeader actions, Card-wrapped form
  - Edit habit page with breadcrumbs, PageHeader actions, Card-wrapped form
affects: [06-03-tasks-pages-migration, 06-04-remaining-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Breadcrumbs + PageHeader pattern for nested pages (detail, create, edit)"
    - "Card wrapping for content on detail and form pages"
    - "External form submission via form attribute on PageHeader action buttons"

key-files:
  created: []
  modified:
    - components/habits/habits-page-content.tsx
    - components/habits/habit-detail-content.tsx
    - components/habits/create-habit-content.tsx
    - components/habits/edit-habit-content.tsx
    - tests/app/habits/habit-detail-page.test.tsx
    - tests/components/habits/create-habit-content.test.tsx
    - tests/components/habits/edit-habit-content.test.tsx

key-decisions:
  - "Habit detail: habit name in both breadcrumb and PageHeader h1 title"
  - "Active status badge migrated from bg-emerald-500 to bg-primary (design token inheritance)"
  - "form attribute on submit buttons works in jsdom -- no workaround needed for tests"

patterns-established:
  - "Nested page layout: PageBreadcrumbs above PageHeader, content in Card below"
  - "Form pages: Save/Cancel in PageHeader actions, form connected via id/form attribute"
  - "Skeleton layout: breadcrumb skeleton + PageHeaderSkeleton + Card-wrapped content skeletons"

requirements-completed: [VISL-10]

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 06 Plan 02: Habits Pages Migration Summary

**All 4 habits pages (list, detail, create, edit) migrated to PageHeader with breadcrumbs, Card wrapping, and external form submission via form attribute**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T07:25:00Z
- **Completed:** 2026-02-17T07:30:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Habits list page uses PageHeader with Create button in actions slot
- Habit detail page has breadcrumbs (Habits > habit name), PageHeader with Edit button, all content wrapped in Card
- Create/edit pages have breadcrumbs, Save/Cancel in PageHeader actions, form in Card using hideChrome and form attribute
- Back button removed from detail page, replaced by breadcrumb navigation
- Active status badge migrated from hardcoded bg-emerald-500 to bg-primary design token

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate habits list and detail pages to PageHeader and breadcrumbs** - `0d68454` (feat)
2. **Task 2: Migrate habits create and edit pages to PageHeader, breadcrumbs, and Card** - `585386f` (feat)

## Files Created/Modified
- `components/habits/habits-page-content.tsx` - Replaced inline header with PageHeader, updated skeleton to PageHeaderSkeleton
- `components/habits/habit-detail-content.tsx` - Added breadcrumbs, PageHeader, Card wrapping, removed back button, migrated emerald to primary
- `components/habits/create-habit-content.tsx` - Added breadcrumbs, PageHeader with Save/Cancel, Card-wrapped form with hideChrome
- `components/habits/edit-habit-content.tsx` - Added breadcrumbs, PageHeader with Save/Cancel, Card-wrapped form with hideChrome, updated skeleton
- `tests/app/habits/habit-detail-page.test.tsx` - Replaced back button test with breadcrumb assertion, added common.nav messages, fixed getByText to getByRole for duplicate text
- `tests/components/habits/create-habit-content.test.tsx` - Added common.nav and habits.breadcrumb to translation mocks
- `tests/components/habits/edit-habit-content.test.tsx` - Added common.nav to translation mocks

## Decisions Made
- Habit name displayed in both breadcrumb trail and PageHeader h1 (breadcrumb for navigation context, h1 for page identity)
- Active status badge color changed from hardcoded `bg-emerald-500` to `bg-primary` design token (consistent with Phase 1 token system)
- The HTML `form` attribute on submit buttons (connecting buttons outside `<form>` to the form via id) works correctly in jsdom, so no test workaround needed
- Error state divs had `max-w-*xl mx-auto` removed since the content wrapper in SidebarLayout already constrains width

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate text assertion in detail page test**
- **Found during:** Task 1
- **Issue:** `getByText("Morning Meditation")` found multiple elements (breadcrumb + h1) causing test failure
- **Fix:** Changed to `getByRole("heading", { name: "Morning Meditation" })` to target the h1 specifically
- **Files modified:** tests/app/habits/habit-detail-page.test.tsx
- **Verification:** All 8 detail page tests pass
- **Committed in:** 0d68454 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal -- test query needed to be more specific due to habit name appearing in both breadcrumb and heading. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Habits pages fully migrated, establishing the pattern for tasks pages in 06-03
- PageBreadcrumbs, PageHeader, Card wrapping, and form attribute patterns all validated
- All 203 habit-related tests pass (16 test files)

## Self-Check: PASSED

All files verified present. All commits verified in history.

---
*Phase: 06-habits-tasks-remaining-pages-migration*
*Completed: 2026-02-17*
