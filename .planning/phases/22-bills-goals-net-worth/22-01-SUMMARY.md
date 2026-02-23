---
phase: 22-bills-goals-net-worth
plan: 01
subsystem: database
tags: [supabase, rls, plaid, zod, recurring-bills, savings-goals, net-worth, manual-assets]

# Dependency graph
requires:
  - phase: 21-budgets-spending-analytics
    provides: "BudgetsDB pattern, IN-subquery RLS, BIGINT cents convention, budgets migration"
  - phase: 19-plaid-integration
    provides: "Plaid client, sync pipeline, toCents sign inversion, plaid/types"
provides:
  - "5 new tables: recurring_bills, savings_goals, goal_contributions, net_worth_snapshots, manual_assets"
  - "4 DB classes: RecurringBillsDB, SavingsGoalsDB, NetWorthSnapshotsDB, ManualAssetsDB"
  - "Plaid fetchRecurringTransactions utility with sign inversion"
  - "Zod validation schemas for bills, goals, contributions, and manual assets"
  - "TypeScript interfaces for all new entities"
affects: [22-02-PLAN, 22-03-PLAN, 22-04-PLAN, 22-05-PLAN, 22-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RecurringBillsDB.upsertFromPlaid with price change detection (previous_amount_cents)"
    - "SavingsGoalsDB.addContribution updates running total atomically"
    - "NetWorthSnapshotsDB.upsert for one-per-day snapshot pattern"
    - "goal_contributions RLS via savings_goals join (same pattern as budget_categories)"

key-files:
  created:
    - "supabase/migrations/20260223000002_create_bills_goals_net_worth.sql"
    - "lib/db/recurring-bills.ts"
    - "lib/db/savings-goals.ts"
    - "lib/db/net-worth-snapshots.ts"
    - "lib/db/manual-assets.ts"
    - "lib/plaid/recurring.ts"
    - "lib/validations/bills.ts"
    - "lib/validations/goals.ts"
  modified:
    - "lib/db/types.ts"
    - "lib/db/index.ts"

key-decisions:
  - "upsertFromPlaid detects price changes by comparing new amount_cents vs existing, storing old in previous_amount_cents"
  - "goal_contributions RLS via savings_goals join (same nested IN-subquery pattern as budget_categories via budgets)"
  - "Net worth snapshot uses upsert on (household_id, snapshot_date) unique constraint for idempotent daily updates"
  - "Bill frequency uses Plaid enum values directly (WEEKLY/BIWEEKLY/SEMI_MONTHLY/MONTHLY/ANNUALLY) to avoid mapping layer"

patterns-established:
  - "DetectedBill interface as bridge between Plaid recurring API and DB upsert"
  - "addContribution pattern: insert record + update running total in parent"

requirements-completed: [BILL-01, BILL-02, BILL-04, GOAL-01, GOAL-04, NTWT-01, NTWT-02, NTWT-03]

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 22 Plan 01: Database Foundation Summary

**5 new tables with household-scoped RLS, 4 DB classes, Plaid recurring fetch utility, and Zod validation schemas for bills, goals, and net worth tracking**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T21:29:14Z
- **Completed:** 2026-02-23T21:35:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created complete database schema with 5 tables (recurring_bills, savings_goals, goal_contributions, net_worth_snapshots, manual_assets) all with household-scoped IN-subquery RLS
- Built 4 DB classes following established BudgetsDB pattern with full CRUD operations
- Implemented Plaid recurring transaction fetch with proper sign inversion (toCents(-amount))
- Created comprehensive Zod validation schemas for bills, goals, contributions, and manual assets

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database migration and DB classes** - `e57e553` (feat)
2. **Task 2: Create Plaid recurring fetch utility and Zod validation schemas** - `b5b9b07` (feat)

## Files Created/Modified
- `supabase/migrations/20260223000002_create_bills_goals_net_worth.sql` - All 5 tables with RLS, indexes, and updated_at triggers
- `lib/db/recurring-bills.ts` - RecurringBillsDB class with CRUD + upsertFromPlaid for price change detection
- `lib/db/savings-goals.ts` - SavingsGoalsDB class with CRUD + addContribution (updates running total)
- `lib/db/net-worth-snapshots.ts` - NetWorthSnapshotsDB class with upsert + history queries
- `lib/db/manual-assets.ts` - ManualAssetsDB class with standard CRUD
- `lib/db/types.ts` - Added TypeScript interfaces for all new entities
- `lib/db/index.ts` - Added barrel exports for all 4 new DB classes
- `lib/plaid/recurring.ts` - fetchRecurringTransactions with DetectedBill transform
- `lib/validations/bills.ts` - Zod schemas for bill create/update/sync
- `lib/validations/goals.ts` - Zod schemas for goal, contribution, and manual asset CRUD

## Decisions Made
- Used Plaid's frequency enum values directly (WEEKLY/BIWEEKLY/SEMI_MONTHLY/MONTHLY/ANNUALLY) in the CHECK constraint to avoid a mapping layer between Plaid and our DB
- upsertFromPlaid detects price changes by comparing incoming amount_cents against stored values, recording the old amount in previous_amount_cents for UI price change badges
- goal_contributions uses nested IN-subquery RLS through savings_goals, matching the budget_categories through budgets pattern
- Net worth snapshots use (household_id, snapshot_date) unique constraint with Supabase .upsert() for idempotent daily updates from multiple sources (cron, sync, manual asset changes)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 tables defined and ready for API routes (Plan 02)
- All 4 DB classes importable from `@/lib/db` barrel
- Plaid recurring fetch utility ready for bills sync API
- Zod schemas ready for API route validation
- Existing tests pass (1 pre-existing failure in transaction-list.test.tsx unrelated to this plan)

---
*Phase: 22-bills-goals-net-worth*
*Completed: 2026-02-23*
