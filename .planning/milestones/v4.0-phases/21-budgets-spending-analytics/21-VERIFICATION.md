---
phase: 21-budgets-spending-analytics
verified: 2026-02-23T20:15:00Z
status: passed
score: 16/16 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 14/16
  gaps_closed:
    - "User can view a bar chart showing 12 months of spending trends with real budget data (BUDG-04)"
    - "Rollover can be confirmed via API, carrying amounts to next month's budget (BUDG-06)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Navigate to /money/budgets, create a budget for the current month, then navigate to a prior month"
    expected: "Prior month shows budget data if it exists; month navigation left/right arrows work correctly"
    why_human: "Visual layout, Calm Finance styling, responsive behavior cannot be verified statically"
  - test: "Create a budget with rollover_enabled=true for a prior month, create a budget for the current month, then navigate to the current month"
    expected: "RolloverPrompt dialog appears and clicking Confirm successfully carries amounts forward"
    why_human: "End-to-end rollover flow involves multiple API calls and UI state; requires live app verification"
  - test: "Click a donut chart slice"
    expected: "CategoryDrillDown sheet slides in from right showing filtered transactions for that category and month"
    why_human: "Interactive chart click behavior and sheet animation require live browser"
  - test: "View the SpendingTrendBar chart after creating budgets for multiple months"
    expected: "Budget bars reflect the actual total_cents from each month's budget, not $0"
    why_human: "Chart rendering and correct bar heights require visual inspection with real data"
  - test: "Verify Calm Finance color palette"
    expected: "Budget rings show sage green (0-74%), amber (75-89%), muted coral/caution (90%+). No aggressive red."
    why_human: "Color perception and CSS variable rendering requires visual inspection"
---

# Phase 21: Budgets & Spending Analytics Verification Report

**Phase Goal:** Users can set monthly spending limits per category and see where their money goes through visual charts
**Verified:** 2026-02-23T20:15:00Z
**Status:** passed — all 16 must-haves verified, both gaps from initial verification closed
**Re-verification:** Yes — after gap closure via Plan 05 (commits 871be70 and e585973)

## Re-verification Summary

This is a re-verification following the initial verification (2026-02-23T11:40:00Z, score: 14/16, status: gaps_found).

Plan 05 closed both gaps:

**Gap 1 closed (BUDG-04 — trend budget data):** `getBudgetTotalsByMonth` method added to `BudgetsDB`, analytics route now enriches trends with `budget_total_cents` per month, and `budget-overview.tsx` passes real budget amounts to `SpendingTrendBar` instead of hardcoded `0`.

**Gap 2 closed (BUDG-06 — rollover wiring):** `RolloverPrompt` now uses `previousBudget.id` directly in the rollover URL, eliminating the intermediate fetch and the reversed source/target ID bug. The component correctly calls `POST /api/money/budgets/${previousBudget.id}/rollover`.

No regressions detected in previously-passing items.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Budget and budget_categories tables exist with household-scoped RLS | VERIFIED | `supabase/migrations/20260223000001_create_budgets.sql` creates both tables with 8 RLS policies |
| 2 | BudgetsDB class can CRUD budgets with per-category allocations | VERIFIED | `lib/db/budgets.ts` — 9 methods: getByMonth, create, update, delete, getSpendingByCategory, getSpendingTrends, getBudgetTotalsByMonth, computeRollover, confirmRollover |
| 3 | Spending aggregation returns correct sums by category for a date range | VERIFIED | `getSpendingByCategory` filters `amount_cents < 0`, handles splits, aggregates in JS |
| 4 | Budget validation enforces envelope constraint (allocations <= total) | VERIFIED | `lib/validations/budget.ts` — budgetCreateSchema has `.refine()` checking sum <= total |
| 5 | API can create, read, update, delete budgets with per-category allocations | VERIFIED | 4 route files: `budgets/route.ts` (GET+POST), `budgets/[id]/route.ts` (GET+PUT+DELETE) |
| 6 | API returns spending data aggregated by category for a given month | VERIFIED | `analytics/spending/route.ts` mode 1 enriches spending with category display data |
| 7 | API returns spending trend data for the last N months including budget totals | VERIFIED | `analytics/spending/route.ts` mode 2 calls `getBudgetTotalsByMonth` and includes `budget_total_cents` in response |
| 8 | Rollover can be confirmed via API, carrying amounts to next month's budget | VERIFIED | `RolloverPrompt` calls `POST /api/money/budgets/${previousBudget.id}/rollover`; route computes rollover from source and writes to target |
| 9 | SWR hooks provide budget and analytics data to UI components | VERIFIED | `use-budgets.ts` (useBudget), `use-spending-analytics.ts` (useSpendingAnalytics, useSpendingTrends) — all with keepPreviousData |
| 10 | Recharts is installed as a project dependency | VERIFIED | `package.json`: `"recharts": "^3.7.0"` |
| 11 | User can create a monthly budget with total + per-category allocations on a single form | VERIFIED | `budget-form.tsx` — react-hook-form + zodResolver, live Allocated/Unallocated totals, Select for categories |
| 12 | User can see circular progress rings per category showing % spent | VERIFIED | `budget-ring.tsx` — custom SVG, 3-tier color thresholds (sage/amber/caution), capped at 100% visually |
| 13 | User can view a donut chart showing spending breakdown by category | VERIFIED | `spending-donut.tsx` — Recharts PieChart with innerRadius=60, click handler calls onCategoryClick |
| 14 | User can view a bar chart showing 12 months of spending trends with real budget data | VERIFIED | `spending-trend-bar.tsx` receives `budget_total_cents` from API via `useSpendingTrends`; `trendData` in `budget-overview.tsx` line 92: `budget: trend.budget_total_cents \|\| 0` |
| 15 | User can click a chart category to drill down into individual transactions | VERIFIED | `category-drill-down.tsx` — Sheet panel, useTransactions with category_id + date filters, reuses TransactionRow |
| 16 | User can browse previous months with left/right arrows (no future months) | VERIFIED | `budget-overview.tsx` — canGoForward = currentDate < startOfMonth(new Date()), right arrow disabled on current month |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260223000001_create_budgets.sql` | Budget tables with RLS policies | VERIFIED | Creates budgets, budget_categories with 8 RLS policies and updated_at trigger |
| `lib/db/budgets.ts` | BudgetsDB class with 9 methods | VERIFIED | All 9 methods present including new `getBudgetTotalsByMonth` |
| `lib/validations/budget.ts` | Zod schemas for budget CRUD | VERIFIED | budgetCreateSchema, budgetUpdateSchema, rolloverConfirmSchema, spendingQuerySchema, trendQuerySchema all exported |
| `lib/db/types.ts` | Budget/BudgetCategory interfaces | VERIFIED | Budget, BudgetCategory, BudgetCategoryWithSpending, BudgetWithCategories |
| `lib/db/index.ts` | BudgetsDB re-export | VERIFIED | `export { BudgetsDB } from "./budgets"` |
| `app/api/money/budgets/route.ts` | GET + POST endpoints | VERIFIED | Auth pattern: createClient -> getUser -> 401 -> resolveHousehold -> BudgetsDB |
| `app/api/money/budgets/[id]/route.ts` | GET + PUT + DELETE endpoints | VERIFIED | All three handlers present with 404 on not-found, toCents conversion |
| `app/api/money/budgets/[id]/rollover/route.ts` | POST rollover confirmation | VERIFIED | Route uses [id] as fromBudgetId, computes rollover, writes to next month target budget |
| `app/api/money/analytics/spending/route.ts` | Dual-mode spending analytics with budget totals | VERIFIED | Trends mode calls `getBudgetTotalsByMonth`, returns `budget_total_cents` per month |
| `lib/hooks/use-budgets.ts` | useBudget SWR hook | VERIFIED | keepPreviousData=true, fetches /api/money/budgets?month=... |
| `lib/hooks/use-spending-analytics.ts` | useSpendingAnalytics + useSpendingTrends with MonthlyTrend.budget_total_cents | VERIFIED | MonthlyTrend interface includes `budget_total_cents: number` |
| `components/money/budget-ring.tsx` | SVG circular progress ring | VERIFIED | Custom SVG, 3-tier color logic: sage<75%, amber 75-89%, caution 90%+, capped at 100% |
| `components/money/budget-form.tsx` | Envelope budget form | VERIFIED | react-hook-form, zodResolver, live totals, Select for categories, fetch POST/PUT |
| `components/money/budget-overview.tsx` | Main orchestrator with real trend data | VERIFIED | trendData uses `trend.budget_total_cents \|\| 0` (no more hardcoded stub); imports useSpendingTrends |
| `components/money/spending-donut.tsx` | Recharts donut chart | VERIFIED | h-[300px] container, PieChart with innerRadius=60, click handler, empty state |
| `components/money/spending-trend-bar.tsx` | Recharts bar chart | VERIFIED | h-[300px] container, Legend, custom tooltip; receives real budget data from parent |
| `components/money/category-drill-down.tsx` | Sheet panel | VERIFIED | Sheet, useTransactions with category_id/date filters, TransactionRow reuse |
| `components/money/rollover-prompt.tsx` | Rollover dialog with correct wiring | VERIFIED | Calls `POST /api/money/budgets/${previousBudget.id}/rollover`; no intermediate fetch |
| `app/money/budgets/page.tsx` | Budget page route | VERIFIED | Server component, getTranslations, PageHeader + BudgetOverview |
| `components/money/money-page-shell.tsx` | Budget nav link | VERIFIED | Link href="/money/budgets" with PieChart icon |
| `i18n/messages/en.json` | Budget i18n strings | VERIFIED | "budgets" namespace present |
| `i18n/messages/zh.json` | Budget i18n strings | VERIFIED | "budgets" namespace present |
| `i18n/messages/zh-TW.json` | Budget i18n strings | VERIFIED | "budgets" namespace present |
| `tests/components/money/budget-ring.test.tsx` | BudgetRing tests | VERIFIED | 10 tests |
| `tests/components/money/budget-overview.test.tsx` | BudgetOverview tests | VERIFIED | 10 tests |
| `tests/lib/validations/budget.test.ts` | Budget validation tests | VERIFIED | 24 tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/db/budgets.ts` | `supabase budgets + budget_categories tables` | Supabase client queries | WIRED | `this.supabase.from("budgets")` in 7 methods |
| `lib/db/budgets.ts` | `supabase budgets table (by month list)` | getBudgetTotalsByMonth | WIRED | `.in("month", months)` query, returns Map<string, number> |
| `lib/validations/budget.ts` | `lib/validations/money.ts` | moneyAmountSchema import | WIRED | `import { moneyAmountSchema } from "./money"` |
| `app/api/money/budgets/route.ts` | `lib/db/budgets.ts` | `new BudgetsDB(supabase)` | WIRED | `const budgetsDB = new BudgetsDB(supabase)` |
| `lib/hooks/use-budgets.ts` | `app/api/money/budgets/route.ts` | SWR fetch | WIRED | `useSWR(\`/api/money/budgets?month=${month}\`)` |
| `app/api/money/analytics/spending/route.ts` | `lib/db/budgets.ts` | getSpendingByCategory + getSpendingTrends + getBudgetTotalsByMonth | WIRED | All three calls present; `budget_total_cents: budgetTotals.get(t.month) \|\| 0` |
| `components/money/budget-overview.tsx` | `lib/hooks/use-budgets.ts` | useBudget hook | WIRED | `const { budget, isLoading, mutate } = useBudget(currentMonth)` |
| `components/money/budget-overview.tsx` | `lib/hooks/use-spending-analytics.ts` | useSpendingTrends hook | WIRED | `const { trends } = useSpendingTrends(12)`; `trendData` maps `trend.budget_total_cents \|\| 0` |
| `components/money/category-drill-down.tsx` | `lib/hooks/use-transactions.ts` | useTransactions hook with category filter | WIRED | `useTransactions({ category_id: ..., date_from: ..., date_to: ... })` |
| `components/money/budget-form.tsx` | `app/api/money/budgets/route.ts` | fetch POST/PUT | WIRED | `await fetch(url, { method, ... })` with proper URL construction |
| `components/money/rollover-prompt.tsx` | `app/api/money/budgets/[id]/rollover/route.ts` | fetch POST with previousBudget.id | WIRED | `fetch(\`/api/money/budgets/${previousBudget.id}/rollover\`, { method: "POST" })` — source ID is correct |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BUDG-01 | 21-01, 21-02, 21-03, 21-04, 21-05 | User can create monthly budgets with spending limits per category | SATISFIED | Migration, BudgetsDB.create(), API POST, BudgetForm all functional |
| BUDG-02 | 21-02, 21-03, 21-04, 21-05 | User can see budget progress bars showing spent vs. remaining | SATISFIED | BudgetRing SVG rings per category with color thresholds; summary card with totals |
| BUDG-03 | 21-03, 21-04, 21-05 | User can view spending breakdown charts by category (donut chart) | SATISFIED | SpendingDonut using Recharts PieChart with click-to-drill-down |
| BUDG-04 | 21-03, 21-04, 21-05 | User can view spending trends over time (bar charts, month-over-month) | SATISFIED | SpendingTrendBar receives real budget_total_cents per month; no more invisible $0 Budget bars |
| BUDG-05 | 21-02, 21-03, 21-04, 21-05 | User can drill down from a category chart to see individual transactions | SATISFIED | CategoryDrillDown sheet, useTransactions with category+date filter, TransactionRow reuse |
| BUDG-06 | 21-01, 21-02, 21-03, 21-04, 21-05 | Unused budget can roll over to next month (configurable per budget) | SATISFIED | RolloverPrompt correctly calls rollover route with previousBudget.id; route computes rollover and writes to next month categories |

### Anti-Patterns Found

No blocker or warning anti-patterns remain. The two previously identified issues have been resolved:

- `components/money/budget-overview.tsx` line 92: `budget: 0, // Will be enriched...` — RESOLVED. Now reads `budget: trend.budget_total_cents || 0`.
- `components/money/rollover-prompt.tsx`: Wrong budget ID used in rollover URL — RESOLVED. Now uses `previousBudget.id`.

### Human Verification Required

#### 1. Visual budget creation and progress rings

**Test:** Navigate to `/money/budgets`, click "Create Budget", enter a total and category allocations.
**Expected:** Form shows live Allocated/Unallocated totals; on save, category rings appear with correct sage/amber/caution colors based on spend percentage.
**Why human:** Visual color rendering and Calm Finance aesthetic require live browser.

#### 2. Donut chart click-to-drill-down

**Test:** With an existing budget, click a slice of the donut chart.
**Expected:** CategoryDrillDown sheet slides in from the right, showing transactions filtered to that category and month.
**Why human:** Interactive chart click and Sheet animation cannot be verified statically.

#### 3. Month navigation UX

**Test:** Use left/right arrow buttons to browse months; right arrow should be disabled on the current month.
**Expected:** Data updates when switching months; right arrow disabled on current month, enabled on past months.
**Why human:** Visual confirmation of disabled state and data refresh.

#### 4. SpendingTrendBar shows real budget bars

**Test:** Create budgets for at least two months, then view the trend chart.
**Expected:** Budget bars in the bar chart show the actual total_cents from each month's budget (not invisible $0 bars). The "Budget vs Spent" legend is meaningful.
**Why human:** Chart bar heights and visual appearance require a browser with real data.

#### 5. Rollover flow end-to-end

**Test:** Create a budget with rollover_enabled=true for January. Create a February budget. Navigate to February — RolloverPrompt should appear. Click Confirm.
**Expected:** Rollover amounts carry from January category allocations to February category rollover_cents.
**Why human:** Multi-step API flow with live database state.

### Gaps Summary

No gaps remaining. Both gaps from the initial verification have been closed:

**Gap 1 (BUDG-04) — CLOSED:** `getBudgetTotalsByMonth` method was added to `BudgetsDB` (commit 871be70). The analytics API now calls this method and includes `budget_total_cents` in each trend row. `budget-overview.tsx` maps `trend.budget_total_cents || 0` into `trendData`, which `SpendingTrendBar` renders. The bar chart now has both meaningful "Budget" and "Spent" bars for every month where a budget exists.

**Gap 2 (BUDG-06) — CLOSED:** `RolloverPrompt` was simplified (commit e585973). The component now uses `previousBudget.id` directly in the fetch URL: `POST /api/money/budgets/${previousBudget.id}/rollover`. The intermediate fetch (which was the source of the wrong ID bug) was removed entirely. The rollover route correctly treats the URL `[id]` as `fromBudgetId` (the previous month's source budget) and computes rollover to the next month's target budget.

All six BUDG requirements are fully satisfied at the implementation level. Human verification of visual and interactive behaviors is recommended before closing the phase.

---

_Verified: 2026-02-23T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — initial verification 2026-02-23T11:40:00Z (14/16), gap closure via Plan 05_
