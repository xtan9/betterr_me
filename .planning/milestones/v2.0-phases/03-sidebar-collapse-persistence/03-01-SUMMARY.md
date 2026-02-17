---
phase: 03-sidebar-collapse-persistence
plan: 01
subsystem: ui
tags: [sidebar, cookie-persistence, hover-overlay, i18n, accessibility, shadcn]

# Dependency graph
requires:
  - phase: 02-sidebar-shell-navigation-switch
    provides: SidebarShell server component and AppSidebar client component
provides:
  - SidebarLayout client component with pin/hover state management
  - Cookie-persisted sidebar pin state (sidebar_pinned)
  - Hover-reveal overlay mode with CSS transitions
  - Pin toggle button with Tooltip, aria-pressed, i18n labels
affects: [03-02 (tests), 04 (page migration uses sidebar layout), 07 (user profile in sidebar footer)]

# Tech tracking
tech-stack:
  added: []
  patterns: [cookie-persisted UI state with server-side reading, controlled SidebarProvider, hover trigger zone pattern]

key-files:
  created:
    - components/layouts/sidebar-layout.tsx
  modified:
    - components/layouts/sidebar-shell.tsx
    - components/layouts/app-sidebar.tsx
    - app/globals.css
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Separate sidebar_pinned cookie from shadcn sidebar_state cookie to avoid Pitfall 2 conflicts"
  - "Pin toggle button conditionally rendered only when onTogglePin prop is provided (backward compatible)"
  - "Hover overlay uses 150ms ease-in-out (snappy) vs shadcn default 200ms ease-linear (intentional difference)"
  - "Props made optional on AppSidebarProps for backward compatibility with existing tests"

patterns-established:
  - "Cookie-persisted pin state: server reads sidebar_pinned cookie, client writes via document.cookie"
  - "Hover trigger zone: fixed 22px strip on left edge, visible only when unpinned and not hovering"
  - "Controlled SidebarProvider: open prop derived from pinned || hoverOpen, onOpenChange is no-op for desktop"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 3 Plan 1: Sidebar Collapse Persistence Summary

**Cookie-persisted pin/unpin sidebar with hover-reveal overlay, SidebarLayout state hub, and i18n-accessible pin toggle button**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T22:37:21Z
- **Completed:** 2026-02-16T22:41:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- SidebarLayout client component manages pin state (cookie-persisted) and hover-reveal state (transient)
- SidebarShell refactored to read sidebar_pinned cookie server-side and delegate to SidebarLayout
- Pin toggle button in AppSidebar header with Tooltip, aria-pressed, PanelLeftClose/PanelLeft icons
- CSS overlay rules in globals.css for hover-reveal mode with light/dark variants
- All 3 locale files (en, zh, zh-TW) have pin/unpin translation keys

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SidebarLayout, refactor SidebarShell, add hover overlay CSS** - `27758c5` (feat)
2. **Task 2: Add pin toggle button to AppSidebar and i18n translations** - `83520d8` (feat)

## Files Created/Modified
- `components/layouts/sidebar-layout.tsx` - New client component managing pin state, hover state, controlled SidebarProvider, hover trigger zone
- `components/layouts/sidebar-shell.tsx` - Simplified server component reading sidebar_pinned cookie
- `components/layouts/app-sidebar.tsx` - Pin toggle button with Tooltip, aria-pressed, collapsible="offcanvas"
- `app/globals.css` - CSS overlay rules for data-sidebar-hover hover-reveal mode
- `i18n/messages/en.json` - English translations for sidebar pin/unpin
- `i18n/messages/zh.json` - Chinese translations for sidebar pin/unpin
- `i18n/messages/zh-TW.json` - Traditional Chinese translations for sidebar pin/unpin

## Decisions Made
- Separate `sidebar_pinned` cookie from shadcn's `sidebar_state` cookie to avoid Pitfall 2 (cookie conflict)
- Pin toggle button conditionally rendered only when `onTogglePin` prop is provided, preserving backward compatibility
- Hover overlay CSS uses 150ms ease-in-out for snappy feel vs shadcn default 200ms ease-linear (intentional per user decision)
- AppSidebarProps made optional for backward compatibility with existing test suite

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added AppSidebarProps interface early to unblock Task 1 build**
- **Found during:** Task 1 (SidebarLayout creation)
- **Issue:** SidebarLayout passes `pinned` and `onTogglePin` props to AppSidebar, but AppSidebar had no prop interface yet (planned for Task 2)
- **Fix:** Added optional AppSidebarProps interface with `void` statements in Task 1, replaced with full implementation in Task 2
- **Files modified:** components/layouts/app-sidebar.tsx
- **Verification:** Build passes in Task 1
- **Committed in:** 27758c5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- moved interface definition from Task 2 to Task 1 for build compatibility. No scope creep.

## Issues Encountered
- Pre-existing test failure in `habit-detail-page.test.tsx` (TooltipProvider context error) -- not caused by this plan's changes, out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pin/unpin collapse system fully implemented with cookie persistence and hover-reveal overlay
- Ready for Plan 03-02 (test coverage for sidebar collapse behavior)
- Existing AppSidebar tests pass with backward-compatible optional props

---
*Phase: 03-sidebar-collapse-persistence*
*Completed: 2026-02-16*

## Self-Check: PASSED
- All 7 files exist on disk
- Commit 27758c5 found in git log
- Commit 83520d8 found in git log
