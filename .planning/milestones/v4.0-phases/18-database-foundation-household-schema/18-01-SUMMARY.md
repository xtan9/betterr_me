---
phase: 18-database-foundation-household-schema
plan: 01
subsystem: database
tags: [supabase, rls, bigint-cents, decimal-js, household, money-arithmetic, zod]

# Dependency graph
requires: []
provides:
  - "households + household_members tables with RLS (IN-subquery pattern)"
  - "bank_connections, accounts, transactions, categories stub tables with RLS"
  - "Service-role admin client (createAdminClient) for server-only operations"
  - "Money arithmetic library (toCents, formatMoney, centsToDecimal, addCents, subtractCents)"
  - "resolveHousehold() lazy household creation helper"
  - "GET /api/money/household endpoint"
  - "Zod schemas for money amounts and household IDs"
  - "Household and HouseholdMember TypeScript types"
affects: [19-plaid-integration, 20-transaction-management, 21-budgets, 22-bills, 23-household-couples, 24-dashboard-ai, 25-polish]

# Tech tracking
tech-stack:
  added: [decimal.js]
  patterns: [IN-subquery RLS for household isolation, BIGINT cents for money storage, lazy household creation with race condition handling]

key-files:
  created:
    - supabase/migrations/20260221000001_create_households.sql
    - supabase/migrations/20260221000002_create_money_tables.sql
    - lib/supabase/admin.ts
    - lib/money/arithmetic.ts
    - lib/validations/money.ts
    - lib/db/households.ts
    - app/api/money/household/route.ts
    - tests/lib/money/arithmetic.test.ts
    - tests/app/api/money/household/route.test.ts
  modified:
    - lib/db/types.ts
    - lib/db/index.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "All money amounts use BIGINT cents in Postgres, decimal.js for conversion at API boundary"
  - "IN-subquery RLS pattern for all money tables (99.78% faster than joins per Supabase docs)"
  - "Service-role key uses SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) to prevent client bundling"
  - "Categories SELECT policy allows NULL household_id for system defaults visible to all authenticated users"

patterns-established:
  - "Household-scoped RLS: all money tables use household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid()))"
  - "Lazy household creation: resolveHousehold() follows ensureProfile() check-then-insert with 23505 race condition handling"
  - "Money arithmetic: toCents/formatMoney with decimal.js, Intl.NumberFormat for consistent Node.js formatting"
  - "Admin client: createAdminClient() with SUPABASE_SERVICE_ROLE_KEY for server-only operations"

requirements-completed: [FOUN-01, FOUN-02, FOUN-03, FOUN-04, FOUN-08]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 18 Plan 01: Database Foundation & Household Schema Summary

**Supabase migrations for 6 household-scoped tables with RLS, decimal.js money arithmetic with integer-cents round-trip, and lazy household auto-creation via resolveHousehold()**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T20:20:00Z
- **Completed:** 2026-02-21T20:23:33Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created 6 database tables (households, household_members, bank_connections, accounts, transactions, categories) with BIGINT money amounts, RLS, indexes, and updated_at triggers
- Built money arithmetic library with decimal.js that correctly handles precision edge cases ($0.07, $19.99, $0.1+$0.2=30 cents)
- Implemented resolveHousehold() lazy creation with 23505 unique_violation race condition handling
- Added GET /api/money/household endpoint following existing project API route pattern
- All 1370 tests pass (32 new + 1338 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Supabase migrations and admin client** - `5af5a0a` (feat)
2. **Task 2: Create money arithmetic, resolveHousehold, API route, and tests** - `3f59e9e` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `supabase/migrations/20260221000001_create_households.sql` - households + household_members tables with RLS and indexes
- `supabase/migrations/20260221000002_create_money_tables.sql` - bank_connections, accounts, transactions, categories with RLS
- `lib/supabase/admin.ts` - Service-role admin client (SUPABASE_SERVICE_ROLE_KEY, no NEXT_PUBLIC_)
- `lib/money/arithmetic.ts` - toCents, formatMoney, centsToDecimal, addCents, subtractCents via decimal.js
- `lib/validations/money.ts` - Zod schemas for money amounts and household IDs
- `lib/db/households.ts` - resolveHousehold() lazy creation with race condition handling
- `lib/db/types.ts` - Added Household and HouseholdMember interfaces
- `lib/db/index.ts` - Added resolveHousehold barrel export
- `app/api/money/household/route.ts` - GET endpoint returning household_id for authenticated users
- `tests/lib/money/arithmetic.test.ts` - 29 precision tests for money arithmetic
- `tests/app/api/money/household/route.test.ts` - 3 API route tests (auth, success, error)

## Decisions Made
- All money amounts use BIGINT cents in Postgres, converted via decimal.js at the API boundary
- IN-subquery RLS pattern chosen for all money tables (performance: 99.78% faster than joins per Supabase docs)
- Service-role key uses `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) to prevent client-side bundling
- Categories SELECT policy allows NULL household_id rows (system defaults) to be visible to all authenticated users
- Used `Intl.NumberFormat("en-US")` instead of `toLocaleString` for consistent comma grouping in Node.js

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `SUPABASE_SERVICE_ROLE_KEY` environment variable will be needed when the admin client is first used at runtime (Phase 19+).

## Next Phase Readiness
- All 6 foundation tables exist with RLS policies ready for data
- Money arithmetic library ready for use in transaction display (Phase 20+)
- resolveHousehold() ready to be called from any money API route
- Admin client ready for Plaid webhook handlers (Phase 19)
- Plan 02 (sidebar, design tokens, i18n, money page shell) can proceed immediately

## Self-Check: PASSED

All 10 created files verified on disk. Both task commits (5af5a0a, 3f59e9e) verified in git log.

---
*Phase: 18-database-foundation-household-schema*
*Completed: 2026-02-21*
