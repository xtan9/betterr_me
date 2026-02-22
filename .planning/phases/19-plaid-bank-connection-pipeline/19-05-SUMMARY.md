---
phase: 19-plaid-bank-connection-pipeline
plan: 05
subsystem: ui
tags: [react, next.js, plaid-link, swr, i18n, vitest, testing-library, vitest-axe]

# Dependency graph
requires:
  - phase: 19-plaid-bank-connection-pipeline
    plan: 04
    provides: "AccountsList, SyncStatusBadge, PlaidLinkButton, AccountsEmptyState, useAccounts hook"
provides:
  - "/money/accounts page route with server-rendered PageHeader and AccountsList"
  - "/money/accounts/oauth redirect handler for bank OAuth flows"
  - "Updated MoneyPageShell with live net worth summary or empty state (no more coming-soon)"
  - "i18n accounts.title, transactions namespace, extended account keys in 3 locales"
  - "SyncStatusBadge tests covering 4 states (syncing spinner, synced, stale, error)"
  - "AccountsList tests covering empty state, net worth, grouping, badges, error banner, a11y"
affects: [19-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-page-client-list, oauth-redirect-handler, money-page-shell-summary]

key-files:
  created:
    - app/money/accounts/layout.tsx
    - app/money/accounts/page.tsx
    - app/money/accounts/oauth/page.tsx
    - tests/components/money/sync-status-badge.test.tsx
    - tests/components/money/accounts-list.test.tsx
  modified:
    - components/money/money-page-shell.tsx
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - tests/components/money/money-page-shell.test.tsx

key-decisions:
  - "Accounts page uses server component with i18n PageHeader wrapping client AccountsList"
  - "OAuth redirect page auto-opens Plaid Link with receivedRedirectUri for bank OAuth completion"
  - "MoneyPageShell replaced from coming-soon to live summary (net worth + link to accounts) or empty state"

patterns-established:
  - "Server page + client list pattern: server component for i18n headers, client component for SWR data"
  - "OAuth redirect handler: fetch token, auto-open Plaid Link, redirect back to accounts on completion"

requirements-completed: [PLAD-01, PLAD-05, PLAD-06]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 19 Plan 05: Accounts Pages, i18n, and Component Tests Summary

**Accounts page at /money/accounts with OAuth redirect handler, updated money home with live net worth summary, i18n in 3 locales, and 15 component tests covering sync badges and accounts list**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T09:03:40Z
- **Completed:** 2026-02-22T09:08:42Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Accounts page at /money/accounts with server-rendered PageHeader and client AccountsList component
- OAuth redirect page at /money/accounts/oauth that re-initializes Plaid Link for bank OAuth flows
- MoneyPageShell updated from "coming soon" placeholder to live net worth summary with link to accounts page, or empty state for new users
- i18n strings added to all 3 locales: accounts.title, transactions namespace, extended account keys (syncStatus, disconnectTitle, etc.)
- 5 SyncStatusBadge tests covering all 4 visual states including syncing spinner animation
- 6 AccountsList tests covering empty state, net worth, institution grouping, sync badges, error banner, and accessibility
- Updated MoneyPageShell tests to match new summary/empty state behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create accounts page routes, OAuth handler, and update money page shell** - `c4e1d9d` (feat)
2. **Task 2: Add i18n strings and component tests** - `7b304e7` (feat)

## Files Created/Modified
- `app/money/accounts/layout.tsx` - Pass-through layout for accounts routes
- `app/money/accounts/page.tsx` - Server component with PageHeader and AccountsList
- `app/money/accounts/oauth/page.tsx` - OAuth redirect handler with usePlaidLink receivedRedirectUri
- `components/money/money-page-shell.tsx` - Updated from coming-soon to live summary or empty state
- `i18n/messages/en.json` - Added accounts.title, transactions namespace, extended keys
- `i18n/messages/zh.json` - Simplified Chinese translations for all new keys
- `i18n/messages/zh-TW.json` - Traditional Chinese translations for all new keys
- `tests/components/money/sync-status-badge.test.tsx` - 5 tests: syncing spinner, synced, stale, error styling, a11y
- `tests/components/money/accounts-list.test.tsx` - 6 tests: empty, net worth, grouping, badges, error banner, a11y
- `tests/components/money/money-page-shell.test.tsx` - Updated for new component behavior (4 tests)

## Decisions Made
- **Server page + client list pattern:** Accounts page is a server component that renders PageHeader with i18n, wrapping the client AccountsList for SWR data fetching
- **OAuth redirect auto-open:** OAuth page fetches a new link token and auto-opens Plaid Link when ready, with receivedRedirectUri set to window.location.href
- **MoneyPageShell summary:** Replaced coming-soon placeholder with live data: shows net worth + connected account count with link to accounts page, or empty state for new users

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion for duplicate text nodes**
- **Found during:** Task 2 (AccountsList tests)
- **Issue:** AccountsList error banner renders same i18n key in both AlertTitle and sr-only AlertDescription, causing `getByText` to find multiple elements
- **Fix:** Changed to `getAllByText` with length assertion instead of `getByText`
- **Files modified:** tests/components/money/accounts-list.test.tsx
- **Committed in:** 7b304e7

---

**Total deviations:** 1 auto-fixed (1 bug fix in test)
**Impact on plan:** Minor test assertion adjustment. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required (Plaid credentials already covered in 19-01).

## Next Phase Readiness
- Accounts page fully wired and routable at /money/accounts
- OAuth redirect handler ready for bank OAuth flows
- MoneyPageShell shows live data or welcoming empty state
- All UI components from Plan 04 integrated into page routes
- Ready for Plan 06 (manual transaction form and final wiring)

## Self-Check: PASSED

- All 8 source/test files: FOUND
- 19-05-SUMMARY.md: FOUND
- Commit c4e1d9d (Task 1): FOUND
- Commit 7b304e7 (Task 2): FOUND
- Lint: 0 errors (4 pre-existing warnings)
- Tests: 112 files passed, 1420 tests, 0 regressions
- Min line counts: all artifacts exceed minimums

---
*Phase: 19-plaid-bank-connection-pipeline*
*Completed: 2026-02-22*
