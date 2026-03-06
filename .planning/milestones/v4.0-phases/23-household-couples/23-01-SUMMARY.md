---
phase: 23-household-couples
plan: 01
subsystem: database
tags: [supabase, rls, households, invitations, visibility, zod]

# Dependency graph
requires:
  - phase: 18-database-foundation-household-schema
    provides: "households/household_members tables, RLS IN-subquery pattern"
  - phase: 19-plaid-bank-connection-pipeline
    provides: "bank_connections, accounts, transactions tables with connected_by"
provides:
  - "household_invitations table with token-based invite flow"
  - "Account visibility (mine/ours/hidden) and owner_id columns"
  - "Transaction visibility flags (hidden/shared to household)"
  - "Budget/goal ownership (owner_id, is_shared) columns"
  - "HouseholdsDB class with full invitation lifecycle"
  - "View-filtered query methods on all money DB classes"
  - "Zod validation schemas for household operations"
affects: [23-02, 23-03, 23-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ViewMode ('mine'|'household') filter pattern across DB classes"
    - "AdminClient usage for cross-household data operations (merge/split)"
    - "Category merge with name deduplication and reference remapping"

key-files:
  created:
    - "supabase/migrations/20260224000001_household_invitations_visibility.sql"
    - "lib/validations/household.ts"
  modified:
    - "lib/db/types.ts"
    - "lib/db/households.ts"
    - "lib/db/accounts-money.ts"
    - "lib/db/transactions.ts"
    - "lib/db/budgets.ts"
    - "lib/db/savings-goals.ts"
    - "lib/db/index.ts"

key-decisions:
  - "ViewMode filter pattern: 'mine' filters by owner_id, 'household' filters by visibility/is_shared"
  - "Historical transactions hidden by default when sharing account (is_hidden_from_household=true on bulk)"
  - "Merge flow uses adminClient (service role) to bypass RLS for cross-household data operations"
  - "Category merge deduplicates by name (case-insensitive), remaps all FK references"
  - "Shared budget spending computed only from 'ours' visibility accounts"
  - "Household view transactions: 'ours' accounts (not hidden) OR 'mine' accounts (individually shared)"

patterns-established:
  - "ViewMode pattern: all money DB classes accept (householdId, userId, view: ViewMode) for filtered queries"
  - "AdminClient merge/split: HouseholdsDB.acceptInvite and removeMember take adminClient param for cross-household ops"
  - "Backward compatibility wrapper: resolveHousehold standalone function delegates to HouseholdsDB class method"

requirements-completed: [HOUS-01, HOUS-02, HOUS-04, HOUS-05, HOUS-07]

# Metrics
duration: 9min
completed: 2026-02-24
---

# Phase 23 Plan 01: Household Schema & DB Classes Summary

**Household invitation system with token-based flow, account/transaction visibility columns, and view-filtered DB query methods across all money classes**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T04:59:34Z
- **Completed:** 2026-02-24T05:08:04Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Migration SQL with household_invitations table, visibility/ownership columns, backfills, RLS, and indexes
- HouseholdsDB class with 11 methods covering full invitation lifecycle (create, accept with merge, remove with split, revoke)
- View-filtered query methods (mine/household) on MoneyAccountsDB, TransactionsDB, BudgetsDB, SavingsGoalsDB
- Zod validation schemas for invite, visibility change, and transaction visibility operations
- Extended types for all money entities with ownership and visibility fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database migration for invitations and visibility columns** - `8c580a7` (feat)
2. **Task 2: Extend types, DB classes, and create validation schemas** - `1533042` (feat)

## Files Created/Modified
- `supabase/migrations/20260224000001_household_invitations_visibility.sql` - Invitations table, visibility columns, backfills, RLS, indexes
- `lib/db/types.ts` - Added HouseholdInvitation, AccountVisibility, ViewMode, HouseholdMemberWithProfile; extended MoneyAccount, Transaction, Budget, SavingsGoal
- `lib/db/households.ts` - HouseholdsDB class with resolveHousehold, getMembers, createInvite, acceptInvite (merge), removeMember (split), revokeInvite, getPendingInvitesForEmail
- `lib/db/accounts-money.ts` - Added getByHouseholdFiltered, updateVisibility methods
- `lib/db/transactions.ts` - Added getByHouseholdFiltered, updateHouseholdVisibility, applyQueryOptions helper
- `lib/db/budgets.ts` - Added getByMonthFiltered, getSpendingByCategoryForShared methods
- `lib/db/savings-goals.ts` - Added getByHouseholdFiltered method
- `lib/db/index.ts` - Added HouseholdsDB barrel export
- `lib/validations/household.ts` - inviteSchema, visibilityChangeSchema, transactionVisibilitySchema with inferred types
- `tests/components/money/transaction-list.test.tsx` - Fixed fixture to include new Transaction visibility fields

## Decisions Made
- ViewMode filter pattern: 'mine' = owner_id match, 'household' = visibility/is_shared match
- Historical transactions bulk-hidden (is_hidden_from_household=true) when changing account from 'mine' to 'ours'
- AdminClient (service role) required for merge/split operations that cross household boundaries
- Category merge uses case-insensitive name matching to detect duplicates, remaps all FK references
- Shared budget spending computed exclusively from 'ours' visibility accounts
- Household view includes transactions from 'ours' accounts (not hidden) plus individually shared transactions from 'mine' accounts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed transaction-list test fixture missing new fields**
- **Found during:** Task 2 (type extension)
- **Issue:** Transaction test fixture was missing new is_hidden_from_household and is_shared_to_household fields
- **Fix:** Added the two boolean fields with default false values to the makeTransaction helper
- **Files modified:** tests/components/money/transaction-list.test.tsx
- **Verification:** pnpm test:run passes (same pre-existing failure count)
- **Committed in:** 1533042 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor fixture update required for type completeness. No scope creep.

## Issues Encountered
- Pre-existing date-sensitive test failure in transaction-list.test.tsx ("Yesterday" header test) -- not caused by our changes, test mocks a static date that no longer matches the current date

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All DB classes extended with view-filtered methods, ready for API route layer (Plan 02)
- HouseholdsDB provides complete invitation lifecycle for API endpoints
- Zod schemas ready for API boundary validation
- Migration SQL ready for deployment

## Self-Check: PASSED

All 9 created/modified files verified present on disk. Both task commits (8c580a7, 1533042) verified in git history.

---
*Phase: 23-household-couples*
*Completed: 2026-02-24*
