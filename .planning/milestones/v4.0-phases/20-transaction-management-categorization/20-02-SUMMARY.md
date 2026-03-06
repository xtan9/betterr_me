---
phase: 20-transaction-management-categorization
plan: 02
subsystem: api
tags: [nextjs, api-routes, supabase, categories, transactions, splits, merchant-rules, zod, typescript]

# Dependency graph
requires:
  - phase: 20-transaction-management-categorization
    plan: 01
    provides: "CategoriesDB, MerchantRulesDB, TransactionSplitsDB, TransactionsDB with search/filter, Zod schemas"
provides:
  - "GET/POST /api/money/categories for listing visible and creating custom categories"
  - "PATCH/DELETE /api/money/categories/[id] for updating/deleting non-system categories"
  - "POST/DELETE /api/money/categories/hidden for toggling category visibility per household"
  - "GET/POST /api/money/merchant-rules and DELETE /api/money/merchant-rules/[id] for merchant-to-category rules"
  - "GET/PATCH /api/money/transactions/[id] for single transaction detail with splits"
  - "GET/POST/DELETE /api/money/transactions/[id]/splits for transaction split management"
  - "API tests for categories and enhanced transactions endpoints"
affects: [20-03, 20-04, 20-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["split-amount-validation: Math.abs(splitTotal) === Math.abs(transaction.amount_cents)", "categories [id] route delegates system-category check to CategoriesDB.delete error handling", "hidden category toggle via POST/DELETE on /categories/hidden sub-route"]

key-files:
  created:
    - app/api/money/categories/route.ts
    - app/api/money/categories/[id]/route.ts
    - app/api/money/categories/hidden/route.ts
    - app/api/money/merchant-rules/route.ts
    - app/api/money/merchant-rules/[id]/route.ts
    - app/api/money/transactions/[id]/route.ts
    - app/api/money/transactions/[id]/splits/route.ts
    - tests/app/api/money/categories/route.test.ts
  modified:
    - tests/app/api/money/transactions/route.test.ts

key-decisions:
  - "Split POST replaces existing splits (delete + re-create) for idempotent split updates"
  - "Split amount validation uses Math.abs comparison to handle both positive and negative transaction amounts"
  - "Categories [id] PATCH verifies non-system via getAll lookup; DELETE delegates to CategoriesDB.delete error"

patterns-established:
  - "split-amount-validation: compare absolute values of split total vs transaction amount_cents"
  - "hidden-category-toggle: POST to hide, DELETE with body to unhide on /categories/hidden"
  - "nested-dynamic-route: /transactions/[id]/splits follows Next.js 16 async params pattern"

requirements-completed: [TXNS-04, TXNS-05, TXNS-06, CATG-02, CATG-03]

# Metrics
duration: 9min
completed: 2026-02-22
---

# Phase 20 Plan 02: API Routes Summary

**7 new API route files for category CRUD, merchant rules, transaction detail/update, and transaction splits with Zod validation and 14 passing tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-23T02:20:22Z
- **Completed:** 2026-02-23T02:29:55Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Full category CRUD API: list visible, create custom, update, delete (system-protected), hide/unhide
- Merchant rule management API: list by household, create with auto-lowercase, delete
- Transaction detail API with splits: GET returns transaction + splits, PATCH updates category_id/notes
- Transaction split management with sum-to-total validation and atomic replace (delete + re-create)
- 14 API tests across categories (7 tests) and transactions (7 tests) covering auth gates, happy paths, validation errors, and filter forwarding

## Task Commits

Each task was committed atomically:

1. **Task 1: Create category and merchant rule API routes** - `081dafa` (feat)
2. **Task 2: Create transaction detail, splits API routes and tests** - `c078e8a` (feat)

## Files Created/Modified
- `app/api/money/categories/route.ts` - GET visible categories, POST create custom category
- `app/api/money/categories/[id]/route.ts` - PATCH update, DELETE non-system category
- `app/api/money/categories/hidden/route.ts` - POST hide, DELETE unhide category per household
- `app/api/money/merchant-rules/route.ts` - GET list, POST create merchant-to-category rule
- `app/api/money/merchant-rules/[id]/route.ts` - DELETE merchant rule
- `app/api/money/transactions/[id]/route.ts` - GET transaction with splits, PATCH update fields
- `app/api/money/transactions/[id]/splits/route.ts` - GET/POST/DELETE transaction splits with validation
- `tests/app/api/money/categories/route.test.ts` - 7 tests: auth gates, list, create, validation errors
- `tests/app/api/money/transactions/route.test.ts` - Added 3 tests for search/filter param forwarding and hasMore pagination

## Decisions Made
- Split POST replaces existing splits atomically (delete then create) for idempotent updates
- Split amount validation compares Math.abs values to handle both positive (income) and negative (expense) transactions
- Categories PATCH route fetches all household categories via getAll to verify existence and system-category status before update
- Categories DELETE route delegates system-category check to CategoriesDB.delete which throws on system categories
- Hidden category toggle uses POST/DELETE on a dedicated /categories/hidden sub-route with JSON body containing category_id

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate resolveHousehold call in categories PATCH**
- **Found during:** Task 1 (categories [id] route)
- **Issue:** PATCH handler called resolveHousehold twice (once discarded, once for getAll)
- **Fix:** Stored result in householdId variable, used it for both resolveHousehold check and getAll call
- **Files modified:** app/api/money/categories/[id]/route.ts
- **Verification:** Lint passes, no runtime double-call
- **Committed in:** 081dafa (Task 1 commit)

**2. [Rule 1 - Bug] Fixed unused variable lint warnings in transactions test**
- **Found during:** Task 2 (updating transaction tests)
- **Issue:** Unused `data` variable in category_id filter test; pre-existing unused `request` variable replaced by `validRequest`
- **Fix:** Removed unused variables, cleaned up test code
- **Files modified:** tests/app/api/money/transactions/route.test.ts
- **Verification:** `pnpm lint` shows 0 errors, only 3 pre-existing warnings remain
- **Committed in:** c078e8a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Minor code quality fixes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 API route files created and exporting correct HTTP methods
- Categories API ready for category management UI (Plan 03)
- Transaction detail/update/splits API ready for transaction detail view (Plan 04)
- Merchant rules API ready for categorization settings (Plan 03-04)
- All 1454 tests pass (115 files), lint clean
- Transactions GET returns `{ transactions, total, hasMore }` for list UI pagination

## Self-Check: PASSED

All 9 files verified present. Both task commits (081dafa, c078e8a) verified in git log.

---
*Phase: 20-transaction-management-categorization*
*Plan: 02*
*Completed: 2026-02-22*
