# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- ✅ **v3.0 Projects & Kanban** — Phases 13-17 (shipped 2026-02-21)
- 🚧 **v4.0 Money Tracking** — Phases 18-25 (in progress)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

1 phase, 1 plan, 3 requirements. See `.planning/milestones/v1.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases, 21 plans, 28 requirements. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.1 UI Polish & Refinement (Phases 10-12) — SHIPPED 2026-02-18</summary>

3 phases, 6 plans, 8 requirements. See `.planning/milestones/v2.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v3.0 Projects & Kanban (Phases 13-17) — SHIPPED 2026-02-21</summary>

5 phases, 12 plans, 17 requirements. See `.planning/milestones/v3.0-ROADMAP.md` for details.

</details>

### 🚧 v4.0 Money Tracking (In Progress)

**Milestone Goal:** Add personal finance management to BetterR.Me — Plaid bank connections, transaction management, budgeting, bill tracking, savings goals, net worth, couples/household support, future-first dashboard, and contextual AI insights.

**Phase Numbering:**
- Integer phases (18, 19, 20...): Planned milestone work
- Decimal phases (19.1, 19.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 18: Database Foundation & Household Schema** - Supabase migrations, household model, money arithmetic, Calm Finance tokens, sidebar nav, i18n namespace (completed 2026-02-21)
- [x] **Phase 19: Plaid Bank Connection Pipeline** - Plaid Link OAuth, webhook-driven sync, encrypted token storage, account management, CSV/manual import (completed 2026-02-22)
- [x] **Phase 20: Transaction Management & Categorization** - Transaction list with search/filter/pagination, auto-categorization, merchant rules, custom categories, transaction splitting (completed 2026-02-23)
- [x] **Phase 21: Budgets & Spending Analytics** - Monthly budgets per category, progress tracking, spending charts, drill-down, rollover (completed 2026-02-23)
- [ ] **Phase 22: Bills, Goals & Net Worth** - Recurring charge detection, bill calendar, savings goals with projections, net worth tracking
- [ ] **Phase 23: Household & Couples** - Partner invitation, shared views, privacy controls, individual vs shared budgets/goals
- [ ] **Phase 24: Future-First Dashboard & AI Insights** - Forward-looking dashboard, cash flow projections, income detection, contextual insights, money summary card
- [ ] **Phase 25: Data Management & Polish** - Transaction CSV export, money data deletion, final integration polish

## Phase Details

### Phase 18: Database Foundation & Household Schema
**Goal**: All money-related infrastructure exists so feature phases can build on a stable, secure, correctly-typed foundation
**Depends on**: Nothing (first phase of v4.0; builds on existing codebase)
**Requirements**: FOUN-01, FOUN-02, FOUN-03, FOUN-04, FOUN-05, FOUN-06, FOUN-07, FOUN-08
**Success Criteria** (what must be TRUE):
  1. Supabase migrations create all money tables with `household_id` FK and RLS policies that gate access through `household_members` join — verified by querying as two different users and confirming data isolation
  2. Money amounts round-trip correctly through the API as integer cents — `$10.33`, `$0.07`, `$19.99` stored as `1033`, `7`, `1999` and display correctly via `lib/money/arithmetic.ts`
  3. Sidebar shows "Money" navigation item linking to `/money` page shell; money pages use Calm Finance design tokens (`--money-*` CSS variables) with muted teal/amber palette
  4. A user visiting any money page for the first time gets a household auto-created transparently (lazy creation via `resolveHousehold()`) — no manual setup step
  5. All existing 1207+ tests pass after migrations; money i18n strings exist in all three locale files (en, zh, zh-TW)
**Plans**: 2 plans

Plans:
- [ ] 18-01-PLAN.md — Database schema, admin client, money arithmetic, resolveHousehold, API route, tests
- [ ] 18-02-PLAN.md — Calm Finance design tokens, sidebar nav, i18n money namespace, /money page shell

### Phase 19: Plaid Bank Connection Pipeline
**Goal**: Users can connect real bank accounts via Plaid Link OAuth and see transactions flow in automatically via webhooks + Vercel Cron, with manual entry as a fallback for cash purchases
**Depends on**: Phase 18 (household schema, admin client, money tables)
**Requirements**: PLAD-01, PLAD-02, PLAD-03, PLAD-04, PLAD-05, PLAD-06, PLAD-07, PLAD-08
**Success Criteria** (what must be TRUE):
  1. User can connect a bank account through Plaid Link OAuth flow and see their accounts appear on the `/money/accounts` page with balances
  2. Transactions sync automatically via Plaid webhooks and Vercel Cron background job — user sees new transactions appear without manual action
  3. User can see sync status per account (healthy/stale/error), manually trigger a re-sync, and disconnect a bank connection
  4. Plaid access tokens are encrypted at rest via Supabase Vault; webhook endpoint verifies JWT/ES256 signatures before processing any payload
  5. User can manually enter individual transactions (cash purchases) as a fallback
**Plans**: 6 plans

Plans:
- [ ] 19-01-PLAN.md — DB migration (Plaid columns + Vault functions), Plaid server library, DB classes, Zod schemas
- [ ] 19-02-PLAN.md — TDD: Plaid webhook JWT/ES256 verification with jose
- [ ] 19-03-PLAN.md — API routes (link-token, exchange, webhook, accounts, sync, disconnect, transactions, cron)
- [ ] 19-04-PLAN.md — UI components (PlaidLinkButton, AccountCard, AccountGroup, SyncStatusBadge, DisconnectDialog, AccountsList, useAccounts hook)
- [ ] 19-05-PLAN.md — Accounts page routes, OAuth handler, i18n in 3 locales, component tests
- [ ] 19-06-PLAN.md — Manual transaction dialog wired to AccountsList, validation tests, human verification

### Phase 20: Transaction Management & Categorization
**Goal**: Users can see, search, filter, and understand all their transactions with accurate auto-categorization and the ability to correct mistakes that stick
**Depends on**: Phase 19 (transactions flowing in from Plaid/CSV/manual)
**Requirements**: TXNS-01, TXNS-02, TXNS-03, TXNS-04, TXNS-05, TXNS-06, TXNS-07, TXNS-08, CATG-01, CATG-02, CATG-03
**Success Criteria** (what must be TRUE):
  1. User can view a paginated list of all transactions across accounts, with cursor-based pagination that loads smoothly
  2. User can search transactions by keyword, filter by date range, amount range, category, and account — filters combine and persist in URL
  3. Transactions arriving from Plaid are auto-categorized using PFCv2 categories; user can override any category and the correction auto-applies to future transactions from the same merchant
  4. User can create custom categories (shared across household), split a single transaction across multiple categories, and hide system default categories they do not use
  5. User can import transactions via CSV with column mapping and duplicate detection, and manually enter individual cash transactions
**Plans**: 5 plans

Plans:
- [ ] 20-01-PLAN.md — DB migration (categories/splits/merchant rules tables), DB classes, types, Zod schemas
- [ ] 20-02-PLAN.md — API routes for categories, merchant rules, transaction detail/update, splits
- [ ] 20-03-PLAN.md — Transaction list UI, search, filters, hooks, page route
- [ ] 20-04-PLAN.md — Transaction detail, category override, split form, category manager, sync integration, i18n
- [ ] 20-05-PLAN.md — Component tests, validation tests, human verification

### Phase 21: Budgets & Spending Analytics
**Goal**: Users can set monthly spending limits per category and see where their money goes through visual charts
**Depends on**: Phase 20 (categorized transactions to aggregate)
**Requirements**: BUDG-01, BUDG-02, BUDG-03, BUDG-04, BUDG-05, BUDG-06
**Success Criteria** (what must be TRUE):
  1. User can create monthly budgets with a spending limit per category and see progress bars showing spent vs. remaining for the current month
  2. User can view spending breakdown as a donut chart by category and bar charts showing month-over-month trends
  3. User can drill down from any category in a chart to see the individual transactions that make up that spending
  4. User can enable budget rollover so unused amounts carry forward to the next month
**Plans**: 5 plans

Plans:
- [ ] 21-01-PLAN.md — Database migration (budgets/budget_categories), BudgetsDB class, Zod validation schemas
- [ ] 21-02-PLAN.md — Budget CRUD API routes, spending analytics API, SWR hooks, Recharts install
- [ ] 21-03-PLAN.md — Budget UI (form, progress rings, donut/bar charts, drill-down, rollover prompt, page route, i18n)
- [ ] 21-04-PLAN.md — Component tests, validation tests, human verification
- [ ] 21-05-PLAN.md — Gap closure: trend chart budget data, rollover wiring fix

### Phase 22: Bills, Goals & Net Worth
**Goal**: Users can track recurring charges, save toward financial goals, and see their overall net worth
**Depends on**: Phase 20 (transaction data for bill detection and net worth), Phase 21 (shared UI patterns)
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, GOAL-01, GOAL-02, GOAL-03, GOAL-04, GOAL-05, NTWT-01, NTWT-02, NTWT-03
**Success Criteria** (what must be TRUE):
  1. App auto-detects recurring charges (subscriptions and bills) from transaction patterns and shows them in a list with amounts and frequency; user can confirm or dismiss false positives
  2. User can view a bill calendar showing upcoming charges for the month
  3. User can create savings goals with target amount and optional deadline, see visual progress (bar/ring), track multiple goals simultaneously, and see projected completion dates based on savings rate
  4. User can see total net worth (assets minus liabilities) as a number and a line chart over time; net worth updates automatically as accounts sync
**Plans**: 6 plans

Plans:
- [ ] 22-01-PLAN.md — Database migration, DB classes, Plaid recurring fetch, Zod schemas
- [ ] 22-02-PLAN.md — Bills API routes, Plaid recurring sync, bills SWR hook
- [ ] 22-03-PLAN.md — Goals & net worth API routes, manual assets, SWR hooks, sync pipeline snapshots
- [ ] 22-04-PLAN.md — Bills UI (list, calendar, form, summary header, page route)
- [ ] 22-05-PLAN.md — Goals UI (card grid, progress rings, projections) + Net Worth UI (chart, summary, accounts, manual assets)
- [ ] 22-06-PLAN.md — Navigation, i18n (3 locales), component tests, validation tests, human verification

### Phase 23: Household & Couples
**Goal**: Two partners can share a household with combined and individual financial views while controlling what each sees
**Depends on**: Phase 22 (all single-user money features stable before adding multi-user complexity)
**Requirements**: HOUS-01, HOUS-02, HOUS-03, HOUS-04, HOUS-05, HOUS-06, HOUS-07
**Success Criteria** (what must be TRUE):
  1. User can invite a partner by email; partner accepts and joins the existing household without disrupting the inviter's data or workflow
  2. Each partner has their own login and personal view of their individual accounts, transactions, and budgets
  3. Both partners can see a combined household view showing merged spending, budgets, net worth, and savings goals
  4. User can set each account as "mine", "ours", or "hidden" (balance-only) for privacy; partner respects these visibility settings
  5. Partner 1 can use the app solo from day one; Partner 2 joins asynchronously at any time
**Plans**: TBD

Plans:
- [ ] 23-01: TBD
- [ ] 23-02: TBD
- [ ] 23-03: TBD

### Phase 24: Future-First Dashboard & AI Insights
**Goal**: Users see a forward-looking financial picture with contextual, anxiety-aware insights embedded in the pages they already use
**Depends on**: Phase 22 (bills, goals, net worth data), Phase 21 (budget data), Phase 20 (categorized transactions)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, AIML-01, AIML-02, AIML-03, AIML-04, AIML-05
**Success Criteria** (what must be TRUE):
  1. Default money home view (`/money`) shows a forward-looking dashboard: available money until next paycheck, upcoming bills for next 30 days, and projected end-of-month balance
  2. Income patterns are auto-detected from transaction history; cash flow projections use detected income plus known bills to estimate future balances
  3. Smart bill calendar shows projected balance overlay with danger-zone highlighting for dates where balance may drop low
  4. Contextual insights appear on relevant pages (spending anomalies on budgets page, subscription price increases on bills page, goal progress on goals page) — no chatbot, embedded in UI
  5. Money summary card appears on the existing BetterR.Me habit/task dashboard, loading independently via its own SWR hook so habits/tasks are never blocked
**Plans**: TBD

Plans:
- [ ] 24-01: TBD
- [ ] 24-02: TBD
- [ ] 24-03: TBD

### Phase 25: Data Management & Polish
**Goal**: Users can export and delete their money data, and the full money feature set works as a cohesive whole
**Depends on**: Phase 24 (all money features complete)
**Requirements**: MGMT-01, MGMT-02
**Success Criteria** (what must be TRUE):
  1. User can export transactions as CSV with a selectable date range
  2. User can delete all their money data and household membership in a single action, with appropriate confirmation
**Plans**: TBD

Plans:
- [ ] 25-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 18 -> 18.1 -> 19 -> 19.1 -> ... -> 25

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 3/3 | Complete | 2026-02-18 |
| 11. Sidebar Polish | v2.1 | 2/2 | Complete | 2026-02-18 |
| 12. Component Fixes | v2.1 | 1/1 | Complete | 2026-02-18 |
| 13. Data Foundation & Migration | v3.0 | 2/2 | Complete | 2026-02-19 |
| 14. Projects & Sections | v3.0 | 3/3 | Complete | 2026-02-20 |
| 15. Kanban Board | v3.0 | 4/4 | Complete | 2026-02-20 |
| 16. Integration Bug Fixes | v3.0 | 2/2 | Complete | 2026-02-21 |
| 17. Fix Archive/Restore Validation | v3.0 | 1/1 | Complete | 2026-02-21 |
| 18. Database Foundation & Household Schema | 2/2 | Complete    | 2026-02-21 | - |
| 19. Plaid Bank Connection Pipeline | 6/6 | Complete    | 2026-02-22 | - |
| 20. Transaction Management & Categorization | 5/5 | Complete   | 2026-02-23 | - |
| 21. Budgets & Spending Analytics | 5/5 | Complete    | 2026-02-23 | - |
| 22. Bills, Goals & Net Worth | 5/6 | In Progress|  | - |
| 23. Household & Couples | v4.0 | 0/? | Not started | - |
| 24. Future-First Dashboard & AI Insights | v4.0 | 0/? | Not started | - |
| 25. Data Management & Polish | v4.0 | 0/? | Not started | - |
