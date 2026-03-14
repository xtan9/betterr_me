---
phase: 21-budgets-spending-analytics
plan: 01
subsystem: database
tags: [supabase, postgresql, rls, zod, budgets, spending, bigint-cents]

# Dependency graph
requires:
  - phase: 18-money-core-foundation
    provides: "households table, money tables, BIGINT cents convention, decimal.js arithmetic"
  - phase: 20-transaction-management-categorization
    provides: "categories table, transaction_splits table, category_id on transactions"
provides:
  - "budgets and budget_categories tables with household-scoped RLS"
  - "BudgetsDB class with CRUD, spending aggregation, rollover computation"
  - "Zod schemas for budget create/update/rollover with envelope constraint"
  - "Budget/BudgetCategory TypeScript types"
affects: [21-02-PLAN, 21-03-PLAN, 21-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Envelope budgeting: allocations <= total enforced at validation layer"
    - "Spending aggregation with split transaction handling in JavaScript"
    - "Rollover computation: allocated + rollover - spent per category"

key-files:
  created:
    - supabase/migrations/20260223000001_create_budgets.sql
    - lib/db/budgets.ts
    - lib/validations/budget.ts
  modified:
    - lib/db/types.ts
    - lib/db/index.ts

key-decisions:
  - "Spending aggregation filters amount_cents < 0 (negative = outflow), matching project sign convention"
  - "Budget categories atomically replaced on update (delete + re-insert), same pattern as transaction splits"
  - "Rollover can be negative (overspend debt carries forward to next month)"

patterns-established:
  - "BudgetsDB follows same constructor(SupabaseClient) pattern as all other DB classes"
  - "Budget spending computed via JavaScript aggregation (Supabase JS client has no GROUP BY)"
  - "Envelope constraint validated at Zod schema level, not database level"

requirements-completed: [BUDG-01, BUDG-06]

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 21 Plan 01: Budget Data Foundation Summary

**Budget schema with envelope budgeting, BudgetsDB class with spending aggregation and rollover, and Zod validation schemas**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T05:09:51Z
- **Completed:** 2026-02-23T05:15:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created budgets and budget_categories tables with household-scoped RLS (IN-subquery pattern)
- Built BudgetsDB class with 8 methods: getByMonth, create, update, delete, getSpendingByCategory, getSpendingTrends, computeRollover, confirmRollover
- Created Zod validation schemas with envelope constraint (allocations <= total) for budget CRUD and query operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create budget database migration and BudgetsDB class** - `3405213` (feat)
2. **Task 2: Create budget validation schemas** - `3bbb07d` (feat)

## Files Created/Modified
- `supabase/migrations/20260223000001_create_budgets.sql` - Budget tables with RLS policies and updated_at trigger
- `lib/db/budgets.ts` - BudgetsDB class with CRUD, spending aggregation, and rollover methods
- `lib/db/types.ts` - Budget, BudgetCategory, BudgetCategoryWithSpending, BudgetWithCategories types
- `lib/db/index.ts` - Added BudgetsDB export
- `lib/validations/budget.ts` - Zod schemas for budget create/update/rollover/query with envelope constraint

## Decisions Made
- **Sign convention correction:** Plan stated "positive amount_cents = outflow" but actual codebase convention is negative = outflow (confirmed via `toCents(-plaidAmount)` in sync.ts and `isIncome = amount_cents > 0` in transaction-row.tsx). Implemented spending aggregation with `amount_cents < 0` filter.
- **Atomic category replacement:** On budget update, existing budget_categories are deleted and re-inserted (same pattern as transaction splits) for clean idempotent updates.
- **Rollover can be negative:** Overspend debt carries forward as negative rollover_cents, enabling honest budget tracking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected spending aggregation sign convention**
- **Found during:** Task 1 (BudgetsDB class implementation)
- **Issue:** Plan stated "filter on `amount_cents > 0` for spending" but the actual project convention is negative = outflow (expense), positive = inflow (income). Using `> 0` would have aggregated income instead of spending.
- **Fix:** Changed spending filter to `amount_cents < 0` and used `Math.abs()` to get positive spending totals.
- **Files modified:** `lib/db/budgets.ts`
- **Verification:** Confirmed against sync.ts (`toCents(-plaidAmount)`) and transaction-row.tsx (`isIncome = amount_cents > 0`)
- **Committed in:** 3405213 (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused categoryIds variable**
- **Found during:** Task 1 (lint verification)
- **Issue:** `categoryIds` variable was assigned but never used in `getByMonth` method
- **Fix:** Removed the unused variable
- **Files modified:** `lib/db/budgets.ts`
- **Verification:** `pnpm lint` passes with 0 errors
- **Committed in:** 3405213 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Sign convention fix was critical for correctness. Unused variable was cosmetic. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema and data access layer ready for API routes (Plan 02)
- Validation schemas ready for request validation in budget API endpoints
- BudgetWithCategories type includes spending data for UI components (Plan 03)
- Rollover methods ready for rollover confirmation flow (Plan 02/03)

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 21-budgets-spending-analytics*
*Completed: 2026-02-23*
