---
phase: 07-sidebar-enrichment
plan: 02
subsystem: ui
tags: [sidebar, user-footer, avatar, dropdown-menu, theme-switcher, language-switcher, logout, swr, next-themes, i18n]

# Dependency graph
requires:
  - phase: 02-sidebar-shell
    provides: AppSidebar component with SidebarFooter placeholder
  - phase: 07-sidebar-enrichment
    provides: Collapsible section groups, Settings nav item (plan 01)
provides:
  - SidebarUserFooter component with user avatar, name, email display
  - Account dropdown with Settings link, theme/language switchers, logout
  - Theme switching via useTheme (Light/Dark/System radio group)
  - Language switching with cookie persistence and page reload
  - Logout via supabase.auth.signOut() with redirect
affects: [07-03, sidebar-enrichment]

# Tech tracking
tech-stack:
  added: []
  patterns: [sidebar-user-footer-dropdown, hydration-guard-for-theme]

key-files:
  created:
    - components/layouts/sidebar-user-footer.tsx
    - tests/components/layouts/sidebar-user-footer.test.tsx
  modified:
    - components/layouts/app-sidebar.tsx
    - tests/components/layouts/app-sidebar.test.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "SidebarUserFooter mocked in AppSidebar tests for isolation -- each component tested independently"
  - "Hydration guard (mounted state) wraps theme radio group to prevent SSR/client mismatch"
  - "Language change uses startTransition wrapper to satisfy react-hooks/immutability lint rule for document.cookie"

patterns-established:
  - "Sidebar footer pattern: SidebarMenu > SidebarMenuItem > DropdownMenu with SidebarMenuButton trigger"
  - "Profile data fetched via useSWR('/api/profile') with loading skeleton fallback"

requirements-completed: [SIDE-05, VISL-09]

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 7 Plan 2: Sidebar User Footer Summary

**SidebarUserFooter with avatar/name/email, account dropdown containing Settings, theme radio group, language switcher, and logout action**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-17T18:57:40Z
- **Completed:** 2026-02-17T19:04:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created SidebarUserFooter component with user profile display (avatar with initials fallback, name, email)
- Account dropdown with Settings link, theme switcher (Light/Dark/System radio group), language switcher (3 locales), and logout
- Theme changes apply immediately via next-themes useTheme; language changes set cookie and reload page
- 10 new tests covering all key behaviors; 18 existing AppSidebar tests updated for isolation
- i18n keys added to all 3 locale files (7 new keys each: myAccount, logOut, theme, language, themeLight, themeDark, themeSystem)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SidebarUserFooter component with account dropdown** - `157f3fb` (feat)
2. **Task 2: Write tests for SidebarUserFooter component** - `d65a4fb` (test)

## Files Created/Modified
- `components/layouts/sidebar-user-footer.tsx` - New component: user avatar + name + email in sidebar footer with dropdown menu
- `components/layouts/app-sidebar.tsx` - Import and render SidebarUserFooter in SidebarFooter
- `tests/components/layouts/sidebar-user-footer.test.tsx` - 10 tests: profile display, initials, loading, settings link, logout, theme, language
- `tests/components/layouts/app-sidebar.test.tsx` - Added SidebarUserFooter mock for test isolation
- `i18n/messages/en.json` - Added 7 sidebar keys (myAccount, logOut, theme, language, themeLight, themeDark, themeSystem)
- `i18n/messages/zh.json` - Added 7 sidebar keys (Chinese Simplified translations)
- `i18n/messages/zh-TW.json` - Added 7 sidebar keys (Chinese Traditional translations)

## Decisions Made
- SidebarUserFooter mocked in AppSidebar tests for isolation -- each component tested independently
- Hydration guard (mounted state) wraps theme radio group to prevent SSR/client mismatch (same pattern as ThemeSwitcher)
- Language change uses startTransition wrapper to satisfy react-hooks/immutability lint rule for document.cookie (same pattern as LanguageSwitcher)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed AppSidebar test isolation for SidebarUserFooter dependencies**
- **Found during:** Task 2 (test verification)
- **Issue:** AppSidebar tests failed because SidebarUserFooter (now rendered as child) requires useSWR, useTheme, useLocale -- not mocked in AppSidebar test file
- **Fix:** Added vi.mock for @/components/layouts/sidebar-user-footer returning a simple div placeholder
- **Files modified:** tests/components/layouts/app-sidebar.test.tsx
- **Verification:** All 18 existing AppSidebar tests pass, no behavior change
- **Committed in:** d65a4fb (Task 2 commit)

**2. [Rule 1 - Bug] Fixed lint errors for document.cookie mutation and hydration guard**
- **Found during:** Task 1 (lint verification)
- **Issue:** react-hooks/immutability error on document.cookie assignment; eslint-disable format for set-state-in-effect needed adjustment
- **Fix:** Wrapped cookie assignment in startTransition (matching existing LanguageSwitcher pattern); used single-line useEffect with eslint-disable comment (matching ThemeSwitcher pattern)
- **Files modified:** components/layouts/sidebar-user-footer.tsx
- **Verification:** pnpm lint passes with 0 errors
- **Committed in:** 157f3fb (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug fix)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SidebarUserFooter complete and tested, ready for 07-03 (today's count badges)
- All sidebar enrichment components (section groups + user footer) now in place
- All tests passing (28 layout tests), build clean, lint clean

## Self-Check: PASSED

All 7 files verified present. Both commit hashes (157f3fb, d65a4fb) confirmed in git log.

---
*Phase: 07-sidebar-enrichment*
*Completed: 2026-02-17*
