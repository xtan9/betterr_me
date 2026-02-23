---
phase: 22-bills-goals-net-worth
plan: 02
subsystem: api
tags: [nextjs, swr, plaid, recurring-bills, net-worth, sync-pipeline]

# Dependency graph
requires:
  - phase: 22-bills-goals-net-worth
    plan: 01
    provides: "RecurringBillsDB, NetWorthSnapshotsDB, ManualAssetsDB, MoneyAccountsDB, Zod schemas, Plaid recurring fetch"
  - phase: 19-plaid-integration
    provides: "syncTransactions pipeline, getAccessToken, BankConnectionsDB, createAdminClient"
provides:
  - "GET/POST /api/money/bills with summary stats (total_monthly_cents, bill_count, pending_count)"
  - "PATCH/DELETE /api/money/bills/[id] for bill updates and deletion"
  - "POST /api/money/bills/sync for Plaid recurring transaction detection"
  - "useBills() SWR hook for client-side reactive data fetching"
  - "Recurring bill sync integrated into transaction sync pipeline (non-blocking)"
  - "Net worth snapshot capture after each successful Plaid sync"
affects: [22-04-PLAN, 22-05-PLAN, 22-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Monthly cost normalization via frequency multipliers (WEEKLY*52/12, BIWEEKLY*26/12, etc.)"
    - "Non-blocking post-sync hooks: recurring bill detection + net worth snapshot after transaction sync"
    - "Admin client for sync route (Vault access + RLS bypass for cross-table operations)"

key-files:
  created:
    - "app/api/money/bills/route.ts"
    - "app/api/money/bills/[id]/route.ts"
    - "app/api/money/bills/sync/route.ts"
    - "lib/hooks/use-bills.ts"
  modified:
    - "lib/plaid/sync.ts"

key-decisions:
  - "Bills summary computed server-side (total_monthly_cents normalizes all frequencies to monthly) for consistent display"
  - "Manual bills auto-set source='manual' and user_status='confirmed' (user explicitly created them)"
  - "Sync route uses adminClient for Vault access and cross-household bill upsert operations"
  - "Both recurring bill sync and net worth snapshot are independent try/catch blocks in sync pipeline"

patterns-established:
  - "computeSummary helper for bills list endpoint (server-side aggregation vs client computation)"
  - "Post-sync hook pattern: piggyback on transaction sync for derived data (bills, net worth)"

requirements-completed: [BILL-01, BILL-02, BILL-03, BILL-04]

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 22 Plan 02: Bills API Routes & Sync Pipeline Summary

**Bills CRUD API with frequency-normalized monthly totals, Plaid recurring sync endpoint, SWR hook, and sync pipeline integration for automatic bill detection and net worth snapshots**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T21:38:17Z
- **Completed:** 2026-02-23T21:44:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created full bills CRUD API (GET with summary, POST for manual bills, PATCH for updates, DELETE) following established money API auth pattern
- Built Plaid recurring sync endpoint that fetches from all connected accounts and upserts detected bills
- Integrated recurring bill detection and net worth snapshot capture into the transaction sync pipeline as non-blocking post-sync hooks
- Created useBills() SWR hook with keepPreviousData for smooth UI transitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bills API routes and Plaid recurring sync endpoint** - `3ae7563` (feat)
2. **Task 2: Create bills SWR hook and integrate recurring sync into sync pipeline** - `53f0ab0` (feat)

## Files Created/Modified
- `app/api/money/bills/route.ts` - GET (list with summary) and POST (create manual bill) endpoints
- `app/api/money/bills/[id]/route.ts` - PATCH (update bill) and DELETE endpoints with household verification
- `app/api/money/bills/sync/route.ts` - POST triggers Plaid recurring fetch for all connected accounts
- `lib/hooks/use-bills.ts` - useBills() SWR hook returning bills, summary, isLoading, error, mutate
- `lib/plaid/sync.ts` - Added recurring bill sync and net worth snapshot blocks after transaction sync

## Decisions Made
- Bills summary (total_monthly_cents) computed server-side using frequency multipliers: WEEKLY * 52/12, BIWEEKLY * 26/12, SEMI_MONTHLY * 2, MONTHLY * 1, ANNUALLY / 12
- Manual bills are auto-confirmed (user_status='confirmed', source='manual') since the user explicitly created them
- Sync route uses adminClient (createAdminClient) for Vault access to retrieve Plaid access tokens
- Both post-sync hooks (recurring bills + net worth snapshot) are wrapped in independent try/catch blocks so failures don't cascade to the transaction sync

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All bills API routes ready for UI components (Plan 04: Bills & Goals UI)
- useBills() hook ready for BillsList component
- Sync pipeline automatically refreshes bills and net worth on every transaction sync
- Existing tests pass (1 pre-existing failure in transaction-list.test.tsx unrelated to this plan)

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (3ae7563, 53f0ab0) verified in git log.

---
*Phase: 22-bills-goals-net-worth*
*Completed: 2026-02-23*
