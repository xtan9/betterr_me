---
phase: 02-sidebar-shell-navigation-switch
plan: 01
subsystem: ui
tags: [sidebar, shadcn, navigation, layout, sheet, responsive]

# Dependency graph
requires:
  - phase: 01-design-token-extraction-css-foundation
    provides: CSS custom properties for sidebar colors, widths, typography, and Tailwind registrations
provides:
  - shadcn/ui sidebar primitive with Phase 1 token-aligned width constants
  - AppSidebar component with 3 nav items, active state detection, i18n labels
  - SidebarShell server component wrapping SidebarProvider + AppSidebar + SidebarInset
  - Mobile header with SidebarTrigger for Sheet/drawer navigation
  - All authenticated route layouts using SidebarShell
affects: [02-sidebar-shell-navigation-switch/plan-02, 03-page-migration, 07-sidebar-footer-profile]

# Tech tracking
tech-stack:
  added: [shadcn/ui sidebar]
  patterns: [SidebarShell wrapper for authenticated routes, cookie-based sidebar state persistence, pathname-based active state detection]

key-files:
  created:
    - components/ui/sidebar.tsx
    - components/layouts/app-sidebar.tsx
    - components/layouts/sidebar-shell.tsx
  modified:
    - app/dashboard/layout.tsx
    - app/habits/layout.tsx
    - app/tasks/layout.tsx
    - components.json
    - components/ui/button.tsx
    - components/ui/input.tsx
    - components/ui/separator.tsx
    - components/ui/sheet.tsx
    - components/ui/skeleton.tsx
    - components/ui/tooltip.tsx
    - package.json
    - pnpm-lock.yaml
  deleted:
    - components/layouts/app-layout.tsx
    - components/main-nav.tsx
    - components/mobile-bottom-nav.tsx

key-decisions:
  - "Sidebar width constants set to 12.5rem (200px) and 17.5rem (280px) matching Phase 1 CSS variables"
  - "SidebarShell is a server component (async, reads cookies) wrapping the client-side SidebarProvider"
  - "Dashboard active state includes /dashboard/settings path for settings page highlighting"
  - "Empty SidebarFooter placeholder reserved for Phase 7 (user profile, theme/language switchers)"

patterns-established:
  - "SidebarShell pattern: all authenticated route layouts wrap children in <SidebarShell> for consistent sidebar navigation"
  - "Active state via pathname matching: exact match for dashboard, startsWith for habits/tasks"
  - "Cookie-based sidebar persistence: sidebar_state cookie read server-side for defaultOpen prop"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 02 Plan 01: Sidebar Shell & Navigation Switch Summary

**shadcn/ui sidebar with 3-item navigation (Dashboard, Habits, Tasks), active state highlighting, mobile Sheet drawer, replacing old top-nav + bottom-tab layout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T19:19:18Z
- **Completed:** 2026-02-16T19:23:45Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Installed shadcn/ui sidebar component with width constants aligned to Phase 1 design tokens (12.5rem desktop, 17.5rem mobile)
- Created AppSidebar with 3 navigation items using Lucide icons, i18n labels via next-intl, and pathname-based active state detection
- Created SidebarShell as a shared server component wrapper with cookie-based state persistence and mobile-only header with hamburger trigger
- Replaced all 3 authenticated route layouts (dashboard, habits, tasks) to use SidebarShell
- Deleted old navigation components (AppLayout, MainNav, MobileBottomNav) with zero dual-nav state

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn sidebar and create AppSidebar + SidebarShell** - `d572b8c` (feat)
2. **Task 2: Replace AppLayout with SidebarShell and delete old navigation** - `592ac65` (feat)

## Files Created/Modified
- `components/ui/sidebar.tsx` - shadcn/ui sidebar primitive with token-aligned width constants
- `components/layouts/app-sidebar.tsx` - Sidebar navigation with 3 items, active state, i18n
- `components/layouts/sidebar-shell.tsx` - Server component layout wrapper (SidebarProvider + AppSidebar + SidebarInset)
- `app/dashboard/layout.tsx` - Updated to use SidebarShell
- `app/habits/layout.tsx` - Updated to use SidebarShell
- `app/tasks/layout.tsx` - Updated to use SidebarShell
- `components.json` - Fixed config field for Tailwind v3 compatibility
- `components/ui/{button,input,separator,sheet,skeleton,tooltip}.tsx` - Updated by shadcn CLI during sidebar install
- `components/layouts/app-layout.tsx` - DELETED (replaced by SidebarShell)
- `components/main-nav.tsx` - DELETED (replaced by AppSidebar)
- `components/mobile-bottom-nav.tsx` - DELETED (replaced by sidebar Sheet)

## Decisions Made
- Set sidebar width constants to 12.5rem/17.5rem to match Phase 1 CSS variables (--sidebar-width, --sidebar-width-mobile)
- Made SidebarShell a server component (async) so it can read the sidebar_state cookie server-side for defaultOpen
- Dashboard active state includes /dashboard/settings so the settings page highlights the Dashboard nav item
- Left SidebarFooter empty as placeholder for Phase 7 (user profile, theme/language switchers)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored Phase 1 sidebar CSS tokens overwritten by shadcn CLI**
- **Found during:** Task 1 (shadcn sidebar installation)
- **Issue:** The `pnpx shadcn@latest add sidebar` command overwrote the Phase 1 sidebar CSS variables in globals.css with shadcn's default gray/blue values, and reformatted tailwind.config.ts with tab indentation and duplicate keys
- **Fix:** Restored all sidebar CSS variables in both :root and .dark to Phase 1 values (emerald/teal brand), restored tailwind.config.ts to its original format without duplicate sidebar keys
- **Files modified:** app/globals.css, tailwind.config.ts
- **Verification:** `git diff` shows both files clean (restored to committed state), build passes
- **Committed in:** d572b8c (part of Task 1 commit)

**2. [Rule 3 - Blocking] Removed duplicate use-mobile.tsx created by shadcn CLI**
- **Found during:** Task 1 (shadcn sidebar installation)
- **Issue:** shadcn CLI created hooks/use-mobile.tsx alongside existing hooks/use-mobile.ts (identical content)
- **Fix:** Removed the .tsx duplicate, keeping original .ts file which all imports resolve to
- **Files modified:** hooks/use-mobile.tsx (deleted)
- **Verification:** sidebar.tsx import resolves correctly, build passes
- **Committed in:** d572b8c (part of Task 1 commit, file not staged since it was untracked and deleted)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary to preserve Phase 1 design tokens and avoid file confusion. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sidebar navigation is fully functional across all authenticated routes
- Plan 02-02 (test updates) is ready to proceed -- the mobile-bottom-nav.test.tsx needs updating for the new sidebar components
- Phase 03 (page migration) can begin as SidebarShell provides the layout shell for all pages
- Phase 07 will populate the empty SidebarFooter with user profile and settings controls

## Self-Check: PASSED

- components/ui/sidebar.tsx: FOUND
- components/layouts/app-sidebar.tsx: FOUND
- components/layouts/sidebar-shell.tsx: FOUND
- components/layouts/app-layout.tsx: DELETED (confirmed)
- components/main-nav.tsx: DELETED (confirmed)
- components/mobile-bottom-nav.tsx: DELETED (confirmed)
- Commit d572b8c: FOUND
- Commit 592ac65: FOUND

---
*Phase: 02-sidebar-shell-navigation-switch*
*Completed: 2026-02-16*
