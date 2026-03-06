---
phase: 18-database-foundation-household-schema
plan: 02
subsystem: ui
tags: [tailwind, css-tokens, next-intl, lucide-react, sidebar, empty-state]

# Dependency graph
requires: []
provides:
  - Calm Finance CSS design tokens (sage/amber palette) in light and dark mode
  - Tailwind color utilities for money-sage, money-amber, money-surface, money-border
  - Money sidebar navigation item with Wallet icon
  - /money route with SidebarShell layout and empty state shell
  - i18n money namespace in all three locales (en, zh, zh-TW)
affects: [19-plaid-integration, 20-account-management, 21-transaction-engine, 22-budgets-insights, 23-household-couples, 24-dashboard-ai]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Calm Finance design token pattern: --money-* CSS vars registered as Tailwind utilities"
    - "Money page layout: SidebarShell wrapper matching dashboard/habits pattern"

key-files:
  created:
    - app/money/layout.tsx
    - app/money/page.tsx
    - components/money/money-page-shell.tsx
    - tests/components/money/money-page-shell.test.tsx
  modified:
    - app/globals.css
    - tailwind.config.ts
    - components/layouts/app-sidebar.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/layouts/app-sidebar.test.tsx

key-decisions:
  - "Used Wallet icon from lucide-react for Money nav (clean lines, recognizable)"
  - "Money nav placed after Tasks in sidebar order: Dashboard > Habits > Tasks > Money"
  - "Empty state styled as welcoming landing page, not error/broken state"

patterns-established:
  - "Money design tokens: --money-sage/amber/surface/border in both :root and .dark"
  - "Money page shell: client component using useTranslations('money') namespace"
  - "Coming soon badge pattern: intentional interim state for features under development"

requirements-completed: [FOUN-05, FOUN-06, FOUN-07]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 18 Plan 02: UI Shell & Navigation Summary

**Calm Finance design tokens (sage/amber), sidebar Money nav with Wallet icon, /money page with welcoming empty state in all three locales**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T20:19:41Z
- **Completed:** 2026-02-21T20:25:08Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Calm Finance CSS design tokens (8 tokens each in light and dark mode) with Tailwind utility registration
- Sidebar updated with Money nav item (Wallet icon, active state on /money/* paths) -- 4th item after Tasks
- /money route with SidebarShell layout, PageHeader, and MoneyPageShell empty state component
- Complete i18n coverage: money namespace in en.json, zh.json, zh-TW.json with matching key structure
- 28 tests passing (24 updated sidebar + 4 new money page shell including accessibility check)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Calm Finance design tokens, sidebar nav, and i18n strings** - `8bf0ec3` (feat)
2. **Task 2: Create money page shell with empty state** - `dc0b00f` (feat)

## Files Created/Modified
- `app/globals.css` - Added Calm Finance CSS tokens (--money-sage, --money-amber, etc.) in both :root and .dark
- `tailwind.config.ts` - Registered money tokens as Tailwind color utilities
- `components/layouts/app-sidebar.tsx` - Added Money nav item with Wallet icon after Tasks
- `i18n/messages/en.json` - Added money namespace and nav label
- `i18n/messages/zh.json` - Added money namespace and nav label (Simplified Chinese)
- `i18n/messages/zh-TW.json` - Added money namespace and nav label (Traditional Chinese)
- `tests/components/layouts/app-sidebar.test.tsx` - Updated for 4 nav items, added money active state tests
- `app/money/layout.tsx` - SidebarShell layout for money pages
- `app/money/page.tsx` - Server component with PageHeader and MoneyPageShell
- `components/money/money-page-shell.tsx` - Client component with calm empty state and coming soon badge
- `tests/components/money/money-page-shell.test.tsx` - 4 tests including accessibility check

## Decisions Made
- Used Wallet icon (clean lines, recognizable) per RESEARCH.md recommendation
- Money nav positioned as 4th item: Dashboard > Habits > Tasks > Money
- Empty state designed as welcoming landing page, not error/broken state
- Coming soon badge styled with sage-light background for intentional feel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added vitest-axe matchers import to money page shell test**
- **Found during:** Task 2 (MoneyPageShell test)
- **Issue:** `toHaveNoViolations` matcher not registered -- axe test failing with "Invalid Chai property"
- **Fix:** Added `import * as matchers from "vitest-axe/matchers"` and `expect.extend(matchers)` matching other test files' pattern
- **Files modified:** tests/components/money/money-page-shell.test.tsx
- **Verification:** All 4 tests pass including accessibility check
- **Committed in:** dc0b00f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test setup fix. No scope creep.

## Issues Encountered
- Production build fails due to missing Supabase environment variables (pre-existing issue, not related to changes). TypeScript compilation succeeded confirming /money route compiles correctly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UI shell complete and navigable via sidebar
- Money design tokens ready for use in all future money feature components
- i18n namespace established -- future phases add keys to existing money.* structure
- Ready for Phase 19 (Plaid Integration) to add bank connection functionality to the empty state

## Self-Check: PASSED

All 11 created/modified files verified present. Both task commits (8bf0ec3, dc0b00f) verified in git log.

---
*Phase: 18-database-foundation-household-schema*
*Completed: 2026-02-21*
