---
phase: 22-bills-goals-net-worth
verified: 2026-02-23T18:00:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
human_verification:
  - test: "Visit /money/bills and verify bill list, calendar tab, confirm/dismiss toggles work in UI"
    expected: "Bills grouped by frequency, calendar shows bill markers per day with month navigation, inline confirm/dismiss buttons change status without modal"
    why_human: "UI interaction flow (tab switching, inline status toggle, calendar day expansion) cannot be verified programmatically"
  - test: "Visit /money/goals, create a goal, add a contribution, verify progress ring and projected date update"
    expected: "Ring percentage increases, projected completion date recalculates based on contribution rate, color-coded status visible"
    why_human: "Visual progress ring rendering and real-time projection recalculation require browser interaction"
  - test: "Visit /money/net-worth, toggle chart timeframes (1M/3M/6M/1Y/All), add a manual asset and verify net worth total updates"
    expected: "Chart data changes on timeframe toggle, manual asset appears in account breakdown section and adds to total"
    why_human: "Chart rendering, timeframe toggle visual feedback, and net worth recalculation after manual asset creation are visual/interactive"
---

# Phase 22: Bills, Goals & Net Worth Verification Report

**Phase Goal:** Users can track recurring charges, save toward financial goals, and see their overall net worth
**Verified:** 2026-02-23T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | App auto-detects recurring charges from transaction patterns; shows list with amounts and frequency; user can confirm or dismiss | VERIFIED | `bills/sync/route.ts` calls `fetchRecurringTransactions`, upserts via `RecurringBillsDB.upsertFromPlaid`; `BillRow` renders confirm/dismiss buttons inline per `user_status`; `BillsList` groups by frequency sections |
| 2 | User can view a bill calendar showing upcoming charges for the month | VERIFIED | `BillCalendar` (190 lines) uses `eachDayOfInterval`, `startOfWeek(startOfMonth)`, `addMonths` navigation; `BillCalendarDay` renders per-day bill markers; frequency projection logic handles WEEKLY/BIWEEKLY/SEMI_MONTHLY/MONTHLY/ANNUALLY |
| 3 | User can create savings goals with target amount and optional deadline, see visual progress, track multiple goals, and see projected completion dates | VERIFIED | `GoalGrid` shows responsive card grid (1/2/3 cols); `GoalCard` reuses `BudgetRing` SVG for donut progress; `goals/route.ts` computes `projected_date` and `status_color` (green/yellow/red); multiple goals displayed simultaneously; `GoalForm` supports create/edit/contribute modes |
| 4 | User can see total net worth (assets minus liabilities) as a number and a line chart over time; net worth updates automatically as accounts sync | VERIFIED | `NetWorthSummary` displays total, change indicator (ArrowUpRight/ArrowDownRight), assets vs liabilities; `NetWorthChart` uses Recharts `LineChart` with 1M/3M/6M/1Y/ALL timeframe toggle; `lib/plaid/sync.ts` captures `NetWorthSnapshotsDB.upsert` after every transaction sync (non-blocking) |

**Score:** 4/4 success criteria verified

---

### Required Artifacts

#### Plan 01 — Database Foundation

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260223000002_create_bills_goals_net_worth.sql` | All 5 tables with RLS, indexes, triggers | VERIFIED | 291 lines; all 5 tables (recurring_bills, savings_goals, goal_contributions, net_worth_snapshots, manual_assets); IN-subquery RLS policies for all tables; updated_at triggers on recurring_bills, savings_goals, manual_assets |
| `lib/db/recurring-bills.ts` | RecurringBillsDB class with CRUD + upsertFromPlaid | VERIFIED | 149 lines; exports `RecurringBillsDB`; `getByHousehold`, `create`, `update`, `upsertFromPlaid` (price-change detection), `delete` all implemented |
| `lib/db/savings-goals.ts` | SavingsGoalsDB class with CRUD + contributions | VERIFIED | exports `SavingsGoalsDB`; `getByHousehold`, `create`, `update`, `delete`, `addContribution`, `getContributions` implemented |
| `lib/db/net-worth-snapshots.ts` | NetWorthSnapshotsDB with snapshot CRUD + history | VERIFIED | exports `NetWorthSnapshotsDB` |
| `lib/db/manual-assets.ts` | ManualAssetsDB with CRUD | VERIFIED | exports `ManualAssetsDB` |
| `lib/plaid/recurring.ts` | `fetchRecurringTransactions` with sign inversion | VERIFIED | 66 lines; calls `plaid.transactionsRecurringGet`; applies `toCents(-(stream.last_amount?.amount ?? 0))` sign inversion; returns `{ inflows, outflows }` |
| `lib/validations/bills.ts` | billCreateSchema, billUpdateSchema, billSyncSchema | VERIFIED | Exports `billCreateSchema`, `billUpdateSchema`, `billSyncSchema`, `BillCreateValues`, `BillUpdateValues`; frequency enum, positive-amount constraint |
| `lib/validations/goals.ts` | goalCreateSchema, goalUpdateSchema, contributionCreateSchema, manualAssetCreateSchema, manualAssetUpdateSchema | VERIFIED | All 5 schemas with inferred types; `.refine()` enforces linked_account_id required when funding_type='linked' |

#### Plan 02 — Bills API + Sync Hook

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/money/bills/route.ts` | GET (list + summary) and POST (create manual bill) | VERIFIED | GET computes `total_monthly_cents` using frequency multipliers (WEEKLY=52/12, etc.); POST sets `source:'manual'`, `user_status:'confirmed'` |
| `app/api/money/bills/[id]/route.ts` | PATCH and DELETE | VERIFIED | PATCH validates with billUpdateSchema, DELETE returns 204 |
| `app/api/money/bills/sync/route.ts` | POST triggers Plaid recurring sync for all connections | VERIFIED | Iterates active connections, calls `getAccessToken`, `fetchRecurringTransactions`, maps Plaid account IDs to internal UUIDs, calls `upsertFromPlaid`; per-connection try/catch |
| `lib/hooks/use-bills.ts` | useBills SWR hook | VERIFIED | 38 lines; `useSWR('/api/money/bills', ...)`, returns `{ bills, summary, isLoading, error, mutate }`, `keepPreviousData: true` |

#### Plan 03 — Goals + Net Worth API

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/money/goals/route.ts` | GET (with projections) and POST | VERIFIED | GET computes `computeMonthlyRate` from last 3 months contributions; computes `projected_date`, `status_color` (green/yellow/red with 30-day buffer); POST creates goal with toCents conversion |
| `app/api/money/goals/[id]/route.ts` | GET, PATCH, DELETE | VERIFIED |  |
| `app/api/money/goals/[id]/contributions/route.ts` | GET and POST contributions | VERIFIED | POST calls `SavingsGoalsDB.addContribution`; household ownership verified before mutation |
| `app/api/money/net-worth/route.ts` | GET current net worth with breakdown | VERIFIED | Aggregates accounts by type; adds manual assets; computes change vs latest snapshot with percent |
| `app/api/money/net-worth/snapshots/route.ts` | GET historical with period filter | VERIFIED | Supports 1M/3M/6M/1Y/ALL; formats dates as "Jan 2026" labels for chart |
| `app/api/money/manual-assets/route.ts` | GET and POST manual assets | VERIFIED |  |
| `lib/hooks/use-goals.ts` | useGoals and useGoal hooks | VERIFIED | `useGoals` fetches `/api/money/goals`; `useGoal(id)` conditional fetch; both use `keepPreviousData: true` |
| `lib/hooks/use-net-worth.ts` | useNetWorth and useNetWorthHistory hooks | VERIFIED | `useNetWorthHistory(period)` fetches `/api/money/net-worth/snapshots?period=${period}` |

#### Plan 04 — Bills UI

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/money/bills-list.tsx` | Bill list with frequency sections and dismissed section | VERIFIED | 256 lines (min 80); uses `useBills()`; groups by MONTHLY/WEEKLY/BIWEEKLY/SEMI_MONTHLY/ANNUALLY; collapsible dismissed section; "Add Bill" + "Sync Bills" actions |
| `components/money/bill-row.tsx` | Individual bill row with confirm/dismiss toggle and status badges | VERIFIED | 147 lines (min 40); inline confirm/dismiss/reconfirm buttons per `user_status`; paid-this-month badge; price-change badge with `previous_amount_cents` |
| `components/money/bill-calendar.tsx` | Month grid calendar with bill markers and navigation | VERIFIED | 190 lines (min 60); uses `eachDayOfInterval`, `startOfWeek`, `endOfWeek`, `addMonths`, `subMonths`; frequency projection for all 5 frequencies |
| `components/money/bill-form.tsx` | Create/edit bill dialog | VERIFIED | 218 lines (min 50); react-hook-form + zodResolver; create and edit modes |
| `app/money/bills/page.tsx` | Bills page route | VERIFIED | 17 lines (min 15); server component with i18n; renders `BillsPageContent` in Suspense |

#### Plan 05 — Goals + Net Worth UI

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/money/goal-card.tsx` | Goal card with progress ring and projection | VERIFIED | 156 lines (min 50); reuses `BudgetRing`; ring color from `status_color`; projection text; deadline display; "Add Funds" button for manual goals |
| `components/money/goal-grid.tsx` | Multi-goal card grid layout | VERIFIED | 149 lines (min 30); `useGoals()` hook; responsive grid (1/sm:2/lg:3); sorted by deadline then created_at |
| `components/money/net-worth-chart.tsx` | Recharts LineChart with timeframe toggle | VERIFIED | 208 lines (min 60); `LineChart`, `ResponsiveContainer`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`; 1M/3M/6M/1Y/ALL preset buttons; `useNetWorthHistory(period)` |
| `components/money/net-worth-summary.tsx` | Assets vs liabilities summary with change indicator | VERIFIED | 98 lines (min 40); `useNetWorth()`; ArrowUpRight/ArrowDownRight with money-sage/money-caution colors |
| `components/money/net-worth-accounts.tsx` | Account breakdown by type with manual assets section | VERIFIED | 239 lines (min 50); `NetWorthAccounts` exported |
| `app/money/goals/page.tsx` | Goals page route | VERIFIED | 14 lines (min 15 — 1 short); server component; renders `GoalGrid` |
| `app/money/net-worth/page.tsx` | Net worth page route | VERIFIED | 18 lines (min 15); renders NetWorthChart, NetWorthSummary, NetWorthAccounts in order |

#### Plan 06 — Navigation, i18n, Tests

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/components/money/bills-list.test.tsx` | BillsList component tests | VERIFIED | 257 lines (min 40); 7 tests: summary header, frequency groups, dismissed section, empty state, confirm/dismiss API call, loading skeleton, accessibility (axe) |
| `tests/components/money/goal-grid.test.tsx` | GoalGrid component tests | VERIFIED | 208 lines (min 40); 6 tests: grid layout, progress percent, status colors, empty state, create button opens form, loading, accessibility |
| `tests/components/money/net-worth-chart.test.tsx` | NetWorthChart component tests | VERIFIED | 133 lines (min 30); 5 tests: chart container, timeframe buttons, period switching, empty state, accessibility |
| `tests/validations/bills-goals.test.tsx` | Validation tests for 7 Zod schemas | VERIFIED | 323 lines (min 60); covers billCreate, billUpdate, goalCreate (with refine), goalUpdate, contributionCreate, manualAssetCreate, manualAssetUpdate |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/db/recurring-bills.ts` | supabase recurring_bills table | `.from('recurring_bills')` | WIRED | `getByHousehold`, `create`, `update`, `upsertFromPlaid`, `delete` all query `recurring_bills` table |
| `lib/plaid/recurring.ts` | `lib/plaid/client.ts` | `createPlaidClient` | WIRED | `createPlaidClient()` called; `plaid.transactionsRecurringGet` invoked |
| `app/api/money/bills/route.ts` | `lib/db/recurring-bills.ts` | `new RecurringBillsDB` | WIRED | `new RecurringBillsDB(supabase)` instantiated; `getByHousehold` and `create` called |
| `app/api/money/bills/sync/route.ts` | `lib/plaid/recurring.ts` | `fetchRecurringTransactions` | WIRED | Imported and called with decrypted access token per connection |
| `lib/hooks/use-bills.ts` | `/api/money/bills` | `useSWR` | WIRED | `useSWR<BillsResponse>('/api/money/bills', fetcher, ...)` |
| `components/money/bills-list.tsx` | `lib/hooks/use-bills.ts` | `useBills()` | WIRED | `import { useBills } from '@/lib/hooks/use-bills'`; called at component top |
| `components/money/bill-row.tsx` | `/api/money/bills/[id]` | `fetch` PATCH | WIRED | `fetch('/api/money/bills/${id}', { method: 'PATCH', ... })` in `handleStatusChange` |
| `components/money/bill-calendar.tsx` | date-fns | `eachDayOfInterval` etc. | WIRED | Imports `eachDayOfInterval`, `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `addMonths` |
| `app/api/money/goals/[id]/contributions/route.ts` | `lib/db/savings-goals.ts` | `SavingsGoalsDB.addContribution` | WIRED | `goalsDB.addContribution(id, amountCents, note)` called in POST handler |
| `components/money/goal-grid.tsx` | `lib/hooks/use-goals.ts` | `useGoals()` | WIRED | `import { useGoals } from '@/lib/hooks/use-goals'` |
| `components/money/net-worth-chart.tsx` | `lib/hooks/use-net-worth.ts` | `useNetWorthHistory` | WIRED | `import { useNetWorthHistory } from '@/lib/hooks/use-net-worth'`; called with period state |
| `components/money/net-worth-chart.tsx` | recharts | `LineChart`, `ResponsiveContainer` | WIRED | `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer` all imported and rendered |
| `lib/plaid/sync.ts` | `lib/plaid/recurring.ts` | `fetchRecurringTransactions` | WIRED | Imported at top of sync.ts; called after successful transaction sync in non-blocking try/catch |
| `lib/plaid/sync.ts` | `NetWorthSnapshotsDB` | `.upsert()` | WIRED | `snapshotsDB.upsert(householdId, today, totalCents, assetsCents, liabilitiesCents)` called after recurring bills sync |
| `components/money/money-page-shell.tsx` | `/money/bills`, `/money/goals`, `/money/net-worth` | `Link href` | WIRED | All three nav links present with correct hrefs and icons (CalendarCheck, Target, TrendingUp) |
| `i18n/messages/en.json` | `components/money/*` | `useTranslations('money')` | WIRED | `money.bills`, `money.goals`, `money.netWorth` sections present in en.json, zh.json, and zh-TW.json |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BILL-01 | 22-01, 22-02 | Auto-detect recurring charges from transaction history | SATISFIED | `fetchRecurringTransactions` calls Plaid recurring API; `upsertFromPlaid` syncs to DB; integrated into transaction sync pipeline |
| BILL-02 | 22-02, 22-04 | See list of detected bills with amounts and frequency | SATISFIED | `BillsList` renders frequency-grouped sections (Monthly/Weekly/Annual) with `formatMoney` amounts and due dates |
| BILL-03 | 22-04 | View bill calendar showing upcoming charges | SATISFIED | `BillCalendar` renders month grid; projects bills forward by frequency; shows individual bill names per day |
| BILL-04 | 22-02, 22-04 | Confirm or dismiss auto-detected bills | SATISFIED | `BillRow` shows inline Confirm/Dismiss buttons for `user_status='auto'`; PATCH `/api/money/bills/[id]` updates status |
| GOAL-01 | 22-03, 22-05 | Create savings goals with target amount and optional deadline | SATISFIED | `GoalForm` + POST `/api/money/goals`; `goalCreateSchema` validates target_amount (positive) and optional deadline |
| GOAL-02 | 22-05 | Visual progress toward each goal | SATISFIED | `GoalCard` uses `BudgetRing` SVG donut; percent = `(current_cents / target_cents) * 100`; ring color = status_color |
| GOAL-03 | 22-05 | Track multiple goals simultaneously | SATISFIED | `GoalGrid` renders all goals in responsive card grid (1/2/3 columns); sorted by deadline then created_at |
| GOAL-04 | 22-01 | Goals are household-scoped | SATISFIED | `savings_goals` table has `household_id` FK; RLS policies enforce household membership; contribution endpoint verifies `household_id` before mutation |
| GOAL-05 | 22-03, 22-05 | Show projected completion date based on savings rate | SATISFIED | `computeMonthlyRate` averages contributions over last 3 months; `computeProjection` calculates months-to-go; `GoalCard` shows projected date with green/yellow/red status |
| NTWT-01 | 22-03, 22-05 | See total net worth across all connected accounts | SATISFIED | `NetWorthSummary` shows total_cents (large text), assets_cents (green), liabilities_cents; breakdown by account type in `NetWorthAccounts` |
| NTWT-02 | 22-03, 22-05 | Net worth tracked over time with line chart | SATISFIED | `net_worth_snapshots` table; `NetWorthChart` with Recharts LineChart; 1M/3M/6M/1Y/ALL timeframe toggle |
| NTWT-03 | 22-02 | Net worth updates automatically as accounts sync | SATISFIED | `lib/plaid/sync.ts` captures net worth snapshot after every transaction sync (non-blocking try/catch) |

All 12 requirements (BILL-01 through NTWT-03) are SATISFIED.

No orphaned requirements found — all 12 IDs declared across plans match the 12 in REQUIREMENTS.md for Phase 22.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/money/goals/page.tsx` | — | File is 14 lines; plan specified min_lines: 15 | Info | One line short of minimum — content is complete (server component + GoalGrid); not a stub |

No blockers. No TODO/FIXME/placeholder comments found in any phase 22 files. No empty handler stubs. No static API returns bypassing database queries.

---

### Human Verification Required

The human verification checkpoint (Plan 06, Task 3) is documented as approved in the 22-06-SUMMARY.md ("checkpoint approved"). The summary states: *"Human verified the complete Phase 22 feature set including bills list/calendar, savings goals with progress rings, and net worth dashboard with chart"* and *"All bills/goals/net-worth features verified by human in both light and dark modes"*.

For completeness, the following items are flagged as needing human validation if re-testing is desired:

**1. Bill List and Calendar Interaction**

**Test:** Visit `/money/bills`. Add a manual bill. Switch to Calendar tab. Navigate months forward.
**Expected:** Bill appears in correct frequency section; calendar shows bill on its due date; navigating forward projects recurring bills correctly.
**Why human:** Tab switching, inline status toggle, calendar day click-to-expand are visual/interactive flows.

**2. Savings Goal Progress Ring and Projection**

**Test:** Visit `/money/goals`. Create a goal with deadline. Add a contribution. Observe ring update.
**Expected:** Donut ring fills proportionally; projected completion date recalculates; status color changes based on trajectory vs deadline.
**Why human:** Visual progress ring rendering and real-time state updates require browser.

**3. Net Worth Chart Timeframe Toggle**

**Test:** Visit `/money/net-worth`. Toggle between 1M/3M/6M/1Y/All. Add a manual asset.
**Expected:** Chart data changes per timeframe; manual asset appears in accounts section; net worth total increases.
**Why human:** Chart rendering, visual feedback on toggle, and net worth recalculation post-asset creation are browser-verified.

---

### Gaps Summary

No gaps found. All four success criteria are verified. All 12 requirements (BILL-01 through NTWT-03) are satisfied with concrete implementation evidence. All artifacts exceed minimum-line thresholds (one file 1 line short of threshold has complete content). All key links are wired end-to-end from UI hooks through API routes to database classes and the Plaid recurring integration. Human verification is documented as approved in the phase summary.

---

_Verified: 2026-02-23T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
