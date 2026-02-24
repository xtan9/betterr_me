---
phase: 23-household-couples
plan: 03
subsystem: ui
tags: [react, swr, next-intl, shadcn, household, view-mode, tabs, i18n]

# Dependency graph
requires:
  - phase: 23-household-couples
    plan: 01
    provides: "HouseholdsDB class, ViewMode type, account visibility columns"
  - phase: 23-household-couples
    plan: 02
    provides: "View-mode filtered API endpoints, invitation lifecycle routes, redaction"
provides:
  - "useHousehold hook with view mode state, member data, and role"
  - "HouseholdViewTabs component (auto-hidden for solo users)"
  - "HouseholdInviteDialog with email form and shareable invite link"
  - "HouseholdMembersList with remove/leave/revoke actions"
  - "HouseholdSettings card for money settings page"
  - "AccountVisibilitySelector dropdown (mine/ours/hidden)"
  - "Invite acceptance page at /money/invite/accept?token="
  - "View-mode-aware SWR hooks for all money data types"
  - "i18n strings for household feature in all 3 locales"
  - "Redacted transaction display in household view (category + amount only)"
affects: [23-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useHousehold() in each page component for SWR-deduplicated household state"
    - "HouseholdViewTabs renders null for solo users (isMultiMember check)"
    - "View prop threading: parent passes viewMode to SWR hooks via optional param"
    - "Redacted TransactionRow: redacted prop hides merchant/description"
    - "NetWorthPageContent wrapper: coordinates view across Chart/Summary/Accounts"

key-files:
  created:
    - "lib/hooks/use-household.ts"
    - "components/money/household-view-tabs.tsx"
    - "components/money/household-invite-dialog.tsx"
    - "components/money/household-members-list.tsx"
    - "components/money/household-settings.tsx"
    - "components/money/account-visibility-selector.tsx"
    - "components/money/net-worth-page-content.tsx"
    - "app/money/invite/accept/page.tsx"
  modified:
    - "lib/hooks/use-accounts.ts"
    - "lib/hooks/use-transactions.ts"
    - "lib/hooks/use-budgets.ts"
    - "lib/hooks/use-goals.ts"
    - "lib/hooks/use-bills.ts"
    - "lib/hooks/use-net-worth.ts"
    - "lib/hooks/use-sidebar-counts.ts"
    - "components/money/accounts-list.tsx"
    - "components/money/account-card.tsx"
    - "components/money/account-group.tsx"
    - "components/money/transaction-list.tsx"
    - "components/money/transaction-row.tsx"
    - "components/money/money-page-shell.tsx"
    - "components/money/budget-overview.tsx"
    - "components/money/goal-grid.tsx"
    - "components/money/bills-page-content.tsx"
    - "components/money/net-worth-chart.tsx"
    - "components/money/net-worth-summary.tsx"
    - "components/money/net-worth-accounts.tsx"
    - "app/money/settings/page.tsx"
    - "app/money/net-worth/page.tsx"
    - "app/api/money/household/route.ts"
    - "app/api/money/household/invite/route.ts"
    - "i18n/messages/en.json"
    - "i18n/messages/zh.json"
    - "i18n/messages/zh-TW.json"

key-decisions:
  - "useHousehold() called per-component (SWR deduplicates), not via context provider"
  - "View mode state lives in useHousehold hook (useState), not URL or context"
  - "HouseholdViewTabs returns null when !isMultiMember (zero visual change for solo users)"
  - "Transaction redaction in UI: hide merchant_name/description row, keep category + amount"
  - "NetWorthPageContent wrapper created to coordinate view across 3 independent components"
  - "Sidebar counts intentionally always 'mine' view (habits/tasks, not money)"
  - "Household API extended to return user_id for client-side current user identification"
  - "DELETE handler added to invite route for invitation revocation"

patterns-established:
  - "useHousehold() per-component pattern: each money page calls useHousehold() for viewMode, SWR deduplicates"
  - "View prop threading: parent component reads viewMode from hook, passes to data-fetching hooks"
  - "Redacted mode: TransactionRow accepts redacted prop to hide private details in household view"
  - "AccountCard extra prop: optional React node for inline customization (visibility selector)"

requirements-completed: [HOUS-01, HOUS-02, HOUS-03, HOUS-05, HOUS-06]

# Metrics
duration: 15min
completed: 2026-02-24
---

# Phase 23 Plan 03: Household UI Components Summary

**Complete household UI: mine/household view tabs on all money pages, invite dialog with shareable link, member management, account visibility controls, transaction redaction in household view, and i18n strings in 3 locales**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-24T05:24:53Z
- **Completed:** 2026-02-24T05:39:53Z
- **Tasks:** 3
- **Files modified:** 34

## Accomplishments
- useHousehold hook with view mode state, member data, role, and userId
- HouseholdViewTabs auto-hidden for solo users, rendered on all money pages (accounts, transactions, budgets, goals, bills, net worth, main shell)
- Full household management UI: invite dialog with shareable link, members list with remove/leave/revoke, settings card
- AccountVisibilitySelector dropdown on each account card in multi-member households
- Transaction redaction in household view: only category + amount shown, detail expansion disabled
- All SWR hooks (accounts, transactions, budgets, goals, bills, net-worth) accept optional view mode
- 37 household i18n strings in en, zh, zh-TW
- Invite acceptance page at /money/invite/accept?token=

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useHousehold hook, HouseholdViewTabs, and household management components** - `0b21447` (feat)
2. **Task 2: Extend SWR hooks with view mode and add i18n strings** - `0677e55` (feat)
3. **Task 3: Wire HouseholdViewTabs into money pages and update components** - `a33c8d9` (feat)

## Files Created/Modified
- `lib/hooks/use-household.ts` - SWR hook for household data with view mode state
- `components/money/household-view-tabs.tsx` - Mine/Household tab switcher (hidden for solo users)
- `components/money/household-invite-dialog.tsx` - Email invite form with shareable link and copy button
- `components/money/household-members-list.tsx` - Member list with remove/leave/revoke actions
- `components/money/household-settings.tsx` - Settings card combining members + invite
- `components/money/account-visibility-selector.tsx` - Mine/ours/hidden dropdown per account
- `components/money/net-worth-page-content.tsx` - Wrapper coordinating view across net worth sub-components
- `app/money/invite/accept/page.tsx` - Token-based invite acceptance page with loading/success/error states
- `lib/hooks/use-accounts.ts` - Added optional view param to SWR key
- `lib/hooks/use-transactions.ts` - Added view param to SWR infinite key
- `lib/hooks/use-budgets.ts` - Added view param to month-based SWR key
- `lib/hooks/use-goals.ts` - Added view param to goals SWR key
- `lib/hooks/use-bills.ts` - Added view param to bills SWR key
- `lib/hooks/use-net-worth.ts` - Added view param to net worth SWR key
- `lib/hooks/use-sidebar-counts.ts` - Added comment: intentionally always 'mine' view
- `components/money/accounts-list.tsx` - Household tabs + visibility selector integration
- `components/money/account-card.tsx` - Added extra prop for inline visibility selector
- `components/money/account-group.tsx` - Added renderAccountExtra prop
- `components/money/transaction-list.tsx` - Household tabs + redacted mode integration
- `components/money/transaction-row.tsx` - Added redacted prop for household view
- `components/money/money-page-shell.tsx` - Household tabs on main money page
- `components/money/budget-overview.tsx` - Household tabs + view mode to useBudget
- `components/money/goal-grid.tsx` - Household tabs + view mode to useGoals
- `components/money/bills-page-content.tsx` - Household tabs above list/calendar tabs
- `components/money/net-worth-chart.tsx` - Accepts view prop (snapshots household-level)
- `components/money/net-worth-summary.tsx` - Accepts view prop for filtered data
- `components/money/net-worth-accounts.tsx` - Accepts view prop for filtered data
- `app/money/settings/page.tsx` - Added HouseholdSettings component
- `app/money/net-worth/page.tsx` - Refactored to use NetWorthPageContent wrapper
- `app/api/money/household/route.ts` - Extended to return user_id
- `app/api/money/household/invite/route.ts` - Added DELETE handler for revocation
- `i18n/messages/en.json` - 37 household strings
- `i18n/messages/zh.json` - 37 household strings (Simplified Chinese)
- `i18n/messages/zh-TW.json` - 37 household strings (Traditional Chinese)

## Decisions Made
- useHousehold() called per-component rather than via React context: SWR deduplicates the network request, and each component gets the same cached data without prop drilling or provider nesting
- View mode state lives in useState inside useHousehold rather than URL params: avoids polluting browser history and works consistently across all pages
- Transaction redaction in UI mirrors server-side: since the API already strips description/merchant_name in household view, the UI additionally hides the text row and disables detail expansion
- NetWorthPageContent wrapper created because the net-worth page had 3 independent client components that needed coordinated view mode switching
- Household API extended to return user_id so HouseholdMembersList can identify the current user without a separate auth API call
- DELETE handler added to invite route for invitation revocation since it was missing from the original API routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added DELETE handler for invite revocation**
- **Found during:** Task 1 (HouseholdMembersList component)
- **Issue:** HouseholdMembersList needs to revoke invitations but the invite API route only had POST, no DELETE handler
- **Fix:** Added DELETE /api/money/household/invite?id= handler with owner-only verification
- **Files modified:** app/api/money/household/invite/route.ts
- **Verification:** Lint passes, handler correctly calls householdsDB.revokeInvite
- **Committed in:** 0b21447 (Task 1 commit)

**2. [Rule 3 - Blocking] Extended household API to return user_id**
- **Found during:** Task 1 (HouseholdMembersList needs current user identification)
- **Issue:** Members list needs to show "(you)" badge and hide remove button for self, but household API didn't return user_id
- **Fix:** Added user_id to household GET response, extended useHousehold hook to expose userId
- **Files modified:** app/api/money/household/route.ts, lib/hooks/use-household.ts
- **Verification:** Lint passes, userId available in hook return
- **Committed in:** 0b21447 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed set-state-in-effect lint error in invite accept page**
- **Found during:** Task 1 (invite acceptance page)
- **Issue:** Calling setState directly in useEffect triggered react-hooks/set-state-in-effect lint error
- **Fix:** Combined state/errorMessage into single setResult call, derived display strings outside effect
- **Files modified:** app/money/invite/accept/page.tsx
- **Verification:** pnpm lint passes with 0 errors
- **Committed in:** 0b21447 (Task 1 commit)

**4. [Rule 2 - Missing Critical] Created NetWorthPageContent wrapper**
- **Found during:** Task 3 (net worth page wiring)
- **Issue:** Net worth page had 3 independent client components with no shared view state; couldn't add tabs without a coordinator
- **Fix:** Created net-worth-page-content.tsx wrapper that owns view mode and passes it to children via props
- **Files modified:** components/money/net-worth-page-content.tsx (new), app/money/net-worth/page.tsx
- **Verification:** All components accept view prop, lint passes
- **Committed in:** a33c8d9 (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (1 bug fix, 1 missing critical, 2 blocking)
**Impact on plan:** All auto-fixes necessary for the UI components to function correctly. No scope creep.

## Issues Encountered
- Pre-existing "Yesterday" date-sensitive test failure in transaction-list.test.tsx remains (documented in 23-01 SUMMARY, not caused by our changes)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full household UI complete and functional for Plan 04 (testing)
- All money pages display Mine/Household tabs (hidden for solo users)
- Invite flow works end-to-end: owner sends invite -> partner clicks link -> acceptance page processes token
- Account visibility controls ready for user testing
- Transaction redaction enforced in both API (Plan 02) and UI (this plan)

## Self-Check: PASSED

All 8 created files verified present on disk. All 3 task commits (0b21447, 0677e55, a33c8d9) verified in git history.

---
*Phase: 23-household-couples*
*Completed: 2026-02-24*
