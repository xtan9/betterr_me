---
phase: 24-future-first-dashboard-ai-insights
plan: 01
subsystem: api
tags: [projections, income-detection, insights, date-fns, pure-functions, cash-flow]

# Dependency graph
requires:
  - phase: 22-bills-goals-net-worth
    provides: RecurringBill, SavingsGoal, GoalContribution types and DB tables
  - phase: 20-transaction-management-categorization
    provides: Transaction type and DB tables for spending analysis
provides:
  - dismissed_insights and confirmed_income_patterns DB tables with RLS
  - Pure projection functions (projectDailyBalances, computeAvailableMoney, computeEndOfMonthBalance, computeDailySpendingRate, getDangerZoneStatus)
  - Income pattern detection algorithm (detectIncomePatterns)
  - Insight computation heuristics (computeSpendingAnomalies, computeSubscriptionAlerts, computeGoalInsights, computeInsights, generateInsightId)
  - Consolidated GoalWithProjection type in lib/db/types.ts
  - Insight, DetectedIncome, DailyBalance, DismissedInsight, ConfirmedIncomePattern types
  - incomeConfirmationSchema and insightDismissSchema Zod validation schemas
affects: [24-02-api-routes, 24-03-dashboard-ui, 24-04-insight-cards, 24-05-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function-modules, income-frequency-detection, insight-id-hashing, spending-anomaly-heuristics]

key-files:
  created:
    - supabase/migrations/20260224_dashboard_insights.sql
    - lib/money/projections.ts
    - lib/money/income-detection.ts
    - lib/money/insights.ts
  modified:
    - lib/db/types.ts
    - lib/validations/money.ts
    - components/money/goal-card.tsx
    - components/money/goal-form.tsx
    - components/money/goal-grid.tsx
    - lib/hooks/use-goals.ts
    - app/api/money/goals/route.ts
    - app/api/money/goals/[id]/route.ts

key-decisions:
  - "Consolidated GoalWithProjection from 4 local definitions into lib/db/types.ts for single source of truth"
  - "computeAvailableMoney takes pre-filtered bills (caller determines horizon) for clean separation of concerns"
  - "Income detection uses median interval + stddev-based confidence scoring with 0.7 threshold"
  - "Insight IDs are period-scoped deterministic hashes so dismissed insights resurface in new periods"

patterns-established:
  - "Pure computation modules in lib/money/ with no DB imports — all inputs are typed function args"
  - "Income frequency classification: 5-9d=WEEKLY, 12-14d=BIWEEKLY, 15-16d=SEMI_MONTHLY, 26-35d=MONTHLY"
  - "Insight severity ordering: attention > info > positive, max 5 per page"
  - "generateInsightId for deterministic dismiss tracking: type:entity:period"

requirements-completed: [DASH-04, DASH-05, AIML-01, AIML-02, AIML-03]

# Metrics
duration: 13min
completed: 2026-02-24
---

# Phase 24 Plan 01: Computational Core Summary

**Pure projection, income detection, and insight computation functions with DB migration for dismissed insights and confirmed income patterns**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-24T17:52:31Z
- **Completed:** 2026-02-24T18:05:31Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created migration with dismissed_insights and confirmed_income_patterns tables with full RLS policies
- Built 3 pure-function modules: projections (5 functions), income-detection (1 main + helpers), insights (5 functions)
- Consolidated GoalWithProjection type from 4 separate local definitions into single source of truth in lib/db/types.ts
- Added 10 new types/interfaces and 2 Zod validation schemas for Phase 24 API routes

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration for dismissed_insights and confirmed_income_patterns** - `4ae1506` (feat)
2. **Task 2: Pure computation functions for projections, income detection, and insights** - `dbcfba3` (feat)

## Files Created/Modified
- `supabase/migrations/20260224_dashboard_insights.sql` - Two tables with RLS for insight dismissal and income pattern storage
- `lib/money/projections.ts` - Cash flow projection functions (daily balance walk, available money, end-of-month, spending rate, danger zone)
- `lib/money/income-detection.ts` - Recurring income pattern detection from transaction history
- `lib/money/insights.ts` - Spending anomaly, subscription alert, and goal progress insight computation
- `lib/db/types.ts` - Added GoalWithProjection, Insight, DetectedIncome, DailyBalance, DismissedInsight, ConfirmedIncomePattern, InsightType, InsightPage, InsightSeverity, StatusColor, IncomeFrequency
- `lib/validations/money.ts` - Added incomeConfirmationSchema, insightDismissSchema
- `components/money/goal-card.tsx` - Import GoalWithProjection from types.ts instead of local definition
- `components/money/goal-form.tsx` - Import GoalWithProjection from types.ts instead of local definition
- `components/money/goal-grid.tsx` - Import GoalWithProjection from types.ts instead of local definition
- `lib/hooks/use-goals.ts` - Import GoalWithProjection from types.ts instead of local definition
- `app/api/money/goals/route.ts` - Import GoalWithProjection from types.ts instead of local definition
- `app/api/money/goals/[id]/route.ts` - Import GoalWithProjection from types.ts instead of local definition

## Decisions Made
- Consolidated GoalWithProjection from 4 local definitions (goal-card.tsx, use-goals.ts, goals/route.ts, goals/[id]/route.ts) into lib/db/types.ts as single source of truth
- computeAvailableMoney simplified to take pre-filtered bills array (caller handles horizon logic) for clean separation of concerns
- Income detection confidence = 1 - (stddev of intervals / median interval), clamped to [0, 1], with 0.7 threshold for inclusion
- Insight ID pattern: `type:entity_name:period` for deterministic dismiss tracking with period-scoped resurfacing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused BudgetWithCategories import from insights.ts**
- **Found during:** Task 2 (insights module)
- **Issue:** Plan specified importing BudgetWithCategories but the insights functions don't use it directly
- **Fix:** Removed unused import to pass lint
- **Files modified:** lib/money/insights.ts
- **Verification:** pnpm lint passes with 0 errors

---

**Total deviations:** 1 auto-fixed (1 lint cleanup)
**Impact on plan:** Minimal - unused import removed for lint compliance. No scope creep.

## Issues Encountered
- Pre-existing test failure in transaction-list.test.tsx ("transactions.yesterday" text not found) - unrelated to our changes, confirmed by testing on previous commit

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All computation functions ready for API route integration in Plan 02
- Types and Zod schemas exported for API validation
- Migration SQL ready for deployment
- GoalWithProjection consolidation ensures consistent type usage across the codebase

## Self-Check: PASSED

- All 4 created files verified on disk
- Both task commits (4ae1506, dbcfba3) verified in git log
- All 11 required function exports verified in source files
- pnpm lint: 0 errors (8 pre-existing warnings)
- pnpm test (money): 12/13 test files pass (1 pre-existing failure unrelated to changes)

---
*Phase: 24-future-first-dashboard-ai-insights*
*Completed: 2026-02-24*
