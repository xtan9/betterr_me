---
phase: 19-plaid-bank-connection-pipeline
plan: 04
subsystem: ui
tags: [react, plaid-link, swr, sonner, lucide-react, tailwind, i18n]

# Dependency graph
requires:
  - phase: 19-plaid-bank-connection-pipeline
    plan: 01
    provides: "Plaid types (SyncStatus, MoneyAccount, BankConnection), formatMoney, DB classes"
provides:
  - "PlaidLinkButton component (usePlaidLink, token exchange, toast feedback)"
  - "AccountCard component (name, mask, balance, sync status badge)"
  - "AccountGroup component (institution header, subtotal, re-sync, disconnect trigger)"
  - "AccountsList component (net worth, error banner, sync handler, empty state, dropdown)"
  - "SyncStatusBadge component (syncing spinner, synced, stale, error)"
  - "DisconnectDialog component (keep/delete transaction choice)"
  - "AccountsEmptyState component (welcoming design, Plaid Link CTA)"
  - "useAccounts SWR hook (ConnectionWithAccounts type, keepPreviousData)"
affects: [19-05, 19-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [swr-accounts-hook, connection-with-accounts-type, calm-finance-components]

key-files:
  created:
    - lib/hooks/use-accounts.ts
    - components/money/plaid-link-button.tsx
    - components/money/account-card.tsx
    - components/money/sync-status-badge.tsx
    - components/money/accounts-empty-state.tsx
    - components/money/account-group.tsx
    - components/money/disconnect-dialog.tsx
    - components/money/accounts-list.tsx
  modified:
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "ConnectionWithAccounts type extends BankConnection with accounts array and derived sync_status for SWR response"
  - "PlaidLinkButton fetches link_token on mount (eager) rather than on-demand for faster UX"
  - "AccountsEmptyState replaces MoneyPageShell placeholder with functional Plaid Link CTA"
  - "DisconnectDialog uses two action buttons (keep/delete) rather than radio+single button for clarity"

patterns-established:
  - "Money SWR hook pattern: useAccounts() with keepPreviousData and typed response shape"
  - "Calm Finance component styling: border-money-border bg-money-surface with sage/amber status tokens"
  - "Sync status badge pattern: 4-state badge with animated spinner for syncing state"

requirements-completed: [PLAD-01, PLAD-05, PLAD-06, PLAD-07]

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 19 Plan 04: Accounts UI Components Summary

**8 UI components + SWR hook: PlaidLinkButton with usePlaidLink, AccountCard/Group with sync badges, AccountsList with net worth/error banner/dropdown, DisconnectDialog with keep/delete choice, welcoming empty state**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T08:53:29Z
- **Completed:** 2026-02-22T08:59:42Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- 8 reusable money UI components following Calm Finance design tokens
- useAccounts SWR hook with ConnectionWithAccounts type providing grouped account data
- PlaidLinkButton wired to usePlaidLink with token fetch, exchange, and toast feedback
- SyncStatusBadge with 4 visual states including animated spinner for syncing
- AccountsList composing all components: net worth summary, dismissable error banner, account groups, empty state, and "Other options" dropdown
- DisconnectDialog offering keep/delete transaction choice via AlertDialog
- i18n translations added to all 3 locales (en, zh, zh-TW) for all new UI strings

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SWR hook, Plaid Link button, and account display components** - `e7395dc` (feat)
2. **Task 2: Create account group, disconnect dialog, and accounts list** - Files already committed in prior 19-03 execution (`28e0447`); this task verified they match plan requirements

## Files Created/Modified
- `lib/hooks/use-accounts.ts` - SWR hook with ConnectionWithAccounts type and keepPreviousData
- `components/money/plaid-link-button.tsx` - Plaid Link trigger with usePlaidLink, token fetch/exchange, toast
- `components/money/account-card.tsx` - Individual account card with name, mask, balance, sync badge
- `components/money/sync-status-badge.tsx` - 4-state badge (syncing spinner, synced, stale, error)
- `components/money/accounts-empty-state.tsx` - Welcoming empty state with Plaid Link CTA
- `components/money/account-group.tsx` - Institution group with re-sync button, disconnect trigger, subtotal
- `components/money/disconnect-dialog.tsx` - AlertDialog with keep/delete transaction options
- `components/money/accounts-list.tsx` - Full accounts view: net worth, error banner, groups, empty state, dropdown
- `i18n/messages/en.json` - Added syncStatus, account, plaid, accounts, disconnect translation keys
- `i18n/messages/zh.json` - Chinese simplified translations for all new keys
- `i18n/messages/zh-TW.json` - Chinese traditional translations for all new keys

## Decisions Made
- **ConnectionWithAccounts extends BankConnection:** Added accounts array and sync_status to the base type for clean SWR response typing
- **Eager link_token fetch:** PlaidLinkButton fetches token on mount for faster Link opening vs on-demand fetch
- **Two-button disconnect:** DisconnectDialog uses separate "Keep Transactions" and "Delete Transactions" buttons rather than radio+confirm for clearer UX
- **Dismissable error banner with auto-reset:** Banner dismisses via X button but re-appears when connections change (new errors detected)

## Deviations from Plan

### Task 2 files pre-created

**1. [Observation] Task 2 components already committed by 19-03 execution**
- **Found during:** Task 2
- **Issue:** account-group.tsx, disconnect-dialog.tsx, and accounts-list.tsx were already created and committed in commit `28e0447` (19-03 plan execution)
- **Impact:** No new commit needed for Task 2 since the files matched plan requirements exactly
- **Resolution:** Verified all files meet Task 2 requirements, no changes needed

---

**Total deviations:** 0 auto-fixes needed
**Impact on plan:** Task 2 artifacts were pre-created by prior plan execution; verified they meet all requirements.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required (Plaid credentials already covered in 19-01).

## Next Phase Readiness
- All 8 UI components ready for accounts page composition (Plan 05)
- PlaidLinkButton ready to wire into page layout
- AccountsList ready to be the main content of /money/accounts route
- "Other options" dropdown ready for ManualTransactionDialog wiring (Plan 06)

## Self-Check: PASSED

- All 8 source files: FOUND
- 19-04-SUMMARY.md: FOUND
- Commit e7395dc (Task 1): FOUND
- Commit 28e0447 (Task 2 via 19-03): FOUND
- Lint: 0 errors (4 pre-existing warnings)
- Tests: 110 files passed, 1409 tests, 0 regressions

---
*Phase: 19-plaid-bank-connection-pipeline*
*Completed: 2026-02-22*
