---
phase: 23-household-couples
plan: 02
subsystem: api
tags: [nextjs, api-routes, household, invitation, visibility, view-mode, privacy]

# Dependency graph
requires:
  - phase: 23-household-couples
    plan: 01
    provides: "HouseholdsDB class, MoneyAccountsDB/TransactionsDB view-filtered methods, Zod schemas"
provides:
  - "POST /api/money/household/invite for owner-only invitation creation"
  - "POST /api/money/household/accept with merge flow for existing users"
  - "DELETE /api/money/household/members/[id] for owner-only member removal"
  - "POST /api/money/household/leave for non-owner departure"
  - "PATCH /api/money/accounts/[id]/visibility for mine/ours/hidden changes"
  - "?view=mine|household query param on all money GET endpoints"
  - "Transaction redaction in household view (category + amount only)"
  - "Owner-only write protection on budget and goal mutation endpoints"
affects: [23-03, 23-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "View-mode query param pattern: all GET endpoints accept ?view=mine|household, default 'mine'"
    - "Transaction redaction pattern: redactForHousehold strips description, merchant_name, notes"
    - "Owner-only write protection: verify resource.owner_id === userId before mutation, 403 for non-creators"
    - "AdminClient for cross-household ops: invite, accept, remove, leave routes"

key-files:
  created:
    - "app/api/money/household/invite/route.ts"
    - "app/api/money/household/accept/route.ts"
    - "app/api/money/household/members/[id]/route.ts"
    - "app/api/money/household/leave/route.ts"
    - "app/api/money/accounts/[id]/visibility/route.ts"
  modified:
    - "app/api/money/household/route.ts"
    - "app/api/money/accounts/route.ts"
    - "app/api/money/transactions/route.ts"
    - "app/api/money/transactions/[id]/route.ts"
    - "app/api/money/budgets/route.ts"
    - "app/api/money/budgets/[id]/route.ts"
    - "app/api/money/goals/route.ts"
    - "app/api/money/goals/[id]/route.ts"
    - "app/api/money/bills/route.ts"
    - "app/api/money/net-worth/route.ts"
    - "app/api/money/analytics/spending/route.ts"
    - "lib/db/budgets.ts"
    - "tests/app/api/money/household/route.test.ts"
    - "tests/app/api/money/accounts/route.test.ts"
    - "tests/app/api/money/transactions/route.test.ts"

key-decisions:
  - "Transaction redaction: empty string for description, null for merchant_name/notes/plaid_category_detailed"
  - "Owner-only writes: check resource.owner_id !== null && !== userId for 403; null owner_id allows edit (legacy budgets)"
  - "Bills mine view: manual bills without account_id always shown, Plaid bills filtered by user's accounts"
  - "Net worth household view: ALL accounts (no visibility filter), mine view: user's owned accounts only"
  - "Analytics household view: spending from 'ours' accounts only (same as shared budgets)"
  - "getSpendingByCategoryForShared made public for analytics route access"

patterns-established:
  - "View-mode query param: all money GET endpoints accept ?view=mine|household with 'mine' default"
  - "redactForHousehold helper: strips private transaction details in household view"
  - "Owner-only mutation guard: budget/goal PATCH/DELETE verify owner_id before allowing edit"

requirements-completed: [HOUS-01, HOUS-03, HOUS-04, HOUS-06, HOUS-07]

# Metrics
duration: 11min
completed: 2026-02-24
---

# Phase 23 Plan 02: Household API Routes Summary

**Complete API layer for household invitation lifecycle, membership management, account visibility, and view-mode filtered data access across all money endpoints**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-24T05:11:01Z
- **Completed:** 2026-02-24T05:22:20Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments
- Full household invitation lifecycle: invite, accept (with merge), remove member, leave household
- PATCH visibility endpoint for mine/ours/hidden account state changes
- All 7 money GET endpoints support ?view=mine|household filtering
- Transaction detail redaction in household view (category + amount only)
- Owner-only write protection on budget and goal mutation endpoints (403 for non-creators)
- Existing tests updated to match new function signatures

## Task Commits

Each task was committed atomically:

1. **Task 1: Create household invitation and membership API routes** - `1b91a04` (feat)
2. **Task 2: Add visibility routes and view-mode filtering to accounts and transactions** - `0106da3` (feat)
3. **Task 3: Add view-mode filtering and owner-only writes to budgets/goals/bills/net-worth/analytics** - `d1806bc` (feat)

## Files Created/Modified
- `app/api/money/household/route.ts` - Extended GET to return members, role, invitations
- `app/api/money/household/invite/route.ts` - POST for owner-only invitation creation
- `app/api/money/household/accept/route.ts` - POST for accepting invitations with merge flow
- `app/api/money/household/members/[id]/route.ts` - DELETE for owner-only member removal
- `app/api/money/household/leave/route.ts` - POST for non-owner departure
- `app/api/money/accounts/[id]/visibility/route.ts` - PATCH for account visibility changes
- `app/api/money/accounts/route.ts` - Added ?view= query param with getByHouseholdFiltered
- `app/api/money/transactions/route.ts` - Added ?view= with redactForHousehold helper
- `app/api/money/transactions/[id]/route.ts` - Extended PATCH with household visibility flags
- `app/api/money/budgets/route.ts` - Added ?view= with getByMonthFiltered
- `app/api/money/budgets/[id]/route.ts` - Added owner_id check on PUT and DELETE
- `app/api/money/goals/route.ts` - Added ?view= with getByHouseholdFiltered
- `app/api/money/goals/[id]/route.ts` - Added owner_id check on PATCH and DELETE
- `app/api/money/bills/route.ts` - Added ?view= with user account filtering
- `app/api/money/net-worth/route.ts` - Added ?view= (household=all accounts, mine=owned only)
- `app/api/money/analytics/spending/route.ts` - Added ?view= with shared-account spending
- `lib/db/budgets.ts` - Made getSpendingByCategoryForShared public
- `tests/app/api/money/household/route.test.ts` - Updated to mock HouseholdsDB class methods
- `tests/app/api/money/accounts/route.test.ts` - Updated to use getByHouseholdFiltered mock
- `tests/app/api/money/transactions/route.test.ts` - Updated to use getByHouseholdFiltered mock

## Decisions Made
- Transaction redaction uses empty string for description (not null) to maintain type consistency, null for merchant_name/notes/plaid_category_detailed
- Owner-only writes check owner_id !== null before comparing to userId, allowing legacy budgets with null owner_id to remain editable
- Bills mine view includes all manual bills without account_id (shared visibility) plus Plaid bills linked to user's accounts
- Net worth household view sums ALL accounts (mine + ours + hidden all contribute) per RESEARCH.md guidance
- Analytics household view uses getSpendingByCategoryForShared (ours accounts only) matching shared budget spending logic
- Made getSpendingByCategoryForShared method public to enable analytics route access

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mocks for updated function signatures**
- **Found during:** Task 2 (accounts and transactions view-mode filtering)
- **Issue:** Existing tests mocked getByHousehold but routes now call getByHouseholdFiltered; household route test didn't mock HouseholdsDB class
- **Fix:** Updated 3 test files to mock the correct methods and expected call signatures
- **Files modified:** tests/app/api/money/household/route.test.ts, tests/app/api/money/accounts/route.test.ts, tests/app/api/money/transactions/route.test.ts
- **Verification:** pnpm test:run passes (same pre-existing failure count)
- **Committed in:** 0106da3 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed syntax error in test mock (comma instead of semicolon)**
- **Found during:** Task 2 (test fix)
- **Issue:** Used comma terminator instead of semicolon in class property declaration
- **Fix:** Changed `findOrCreateCash = vi.fn(),` to `findOrCreateCash = vi.fn();`
- **Files modified:** tests/app/api/money/transactions/route.test.ts
- **Committed in:** 0106da3 (Task 2 commit)

**3. [Rule 3 - Blocking] Made getSpendingByCategoryForShared public**
- **Found during:** Task 3 (analytics view-mode filtering)
- **Issue:** Analytics route needed getSpendingByCategoryForShared but it was private in BudgetsDB
- **Fix:** Changed method visibility from private to public
- **Files modified:** lib/db/budgets.ts
- **Committed in:** d1806bc (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 bug fixes, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing "Yesterday" test failure in transaction-list.test.tsx remains (date-sensitive mock, documented in 23-01 SUMMARY)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete API layer ready for UI components (Plan 03)
- All endpoints accept ?view=mine|household for the household/personal view toggle
- Invitation lifecycle endpoints ready for invite dialog and accept flow
- Transaction redaction enforced server-side for household view privacy
- Owner-only write protection prevents unauthorized budget/goal edits

## Self-Check: PASSED

All 5 created files verified present on disk. All 3 task commits (1b91a04, 0106da3, d1806bc) verified in git history.

---
*Phase: 23-household-couples*
*Completed: 2026-02-24*
