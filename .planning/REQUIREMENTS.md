# Requirements: BetterR.Me v4.0 Money Tracking

**Defined:** 2026-02-21
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v4.0 Requirements

Requirements for money tracking milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUN-01**: Household schema with `households` and `household_members` tables, RLS policies gating all money tables through `household_id`
- [x] **FOUN-02**: All money amounts stored as integer cents (BIGINT), with `lib/money/arithmetic.ts` for cents-to-display conversion using decimal.js
- [x] **FOUN-03**: Service-role Supabase admin client (`lib/supabase/admin.ts`) for cron jobs and webhook handlers that bypass RLS
- [x] **FOUN-04**: `resolveHousehold()` helper derives household_id server-side from authenticated user — never from client input
- [x] **FOUN-05**: Sidebar navigation includes "Money" top-level item with sub-navigation to money pages
- [x] **FOUN-06**: Calm Finance design tokens (`--money-*` CSS variables) for money views — muted teal/amber palette, no aggressive red/green
- [x] **FOUN-07**: i18n `money.*` namespace with all money UI strings in en, zh, zh-TW
- [x] **FOUN-08**: Default household auto-created for each user on first money feature access (lazy creation)

### Plaid Integration

- [x] **PLAD-01**: User can connect bank accounts via Plaid Link OAuth flow
- [x] **PLAD-02**: Connected accounts sync transactions automatically via Plaid webhooks with cursor-based pagination
- [x] **PLAD-03**: Plaid access tokens encrypted at rest via Supabase Vault before storage
- [x] **PLAD-04**: Plaid webhook endpoint verifies JWT/ES256 signatures via jose before processing any payload
- [x] **PLAD-05**: User can see sync status for each connected account (healthy/stale/error)
- [x] **PLAD-06**: User can manually trigger a re-sync for a connected account
- [x] **PLAD-07**: User can disconnect a bank connection
- [x] **PLAD-08**: Background sync runs via Vercel Cron, cursor-based and idempotent (partial progress safe)

### Transactions

- [x] **TXNS-01**: User can view a cursor-paginated list of all transactions across accounts
- [ ] **TXNS-02**: User can search transactions by keyword, date range, amount range, and category
- [ ] **TXNS-03**: User can filter transactions by account
- [ ] **TXNS-04**: User can manually override the category of any transaction
- [x] **TXNS-05**: User can create custom categories (household-scoped, shared between partners)
- [x] **TXNS-06**: User can split a transaction across multiple categories
- [ ] **TXNS-07**: User can import transactions via CSV file upload with column mapping and duplicate detection
- [ ] **TXNS-08**: User can manually enter individual transactions (for cash purchases)

### Categorization

- [x] **CATG-01**: Transactions are auto-categorized using Plaid PFCv2 categories on sync
- [x] **CATG-02**: Merchant-name rule engine: user corrections auto-apply to future transactions from the same merchant
- [x] **CATG-03**: System default categories cannot be deleted, only hidden; custom categories are household-scoped

### Budgets & Spending

- [ ] **BUDG-01**: User can create monthly budgets with spending limits per category
- [ ] **BUDG-02**: User can see budget progress bars showing spent vs. remaining
- [ ] **BUDG-03**: User can view spending breakdown charts by category (donut chart)
- [ ] **BUDG-04**: User can view spending trends over time (bar charts, month-over-month)
- [ ] **BUDG-05**: User can drill down from a category chart to see individual transactions
- [ ] **BUDG-06**: Unused budget can roll over to the next month (configurable per budget)

### Bills & Subscriptions

- [ ] **BILL-01**: App auto-detects recurring charges from transaction history (merchant + similar amount + regular interval)
- [ ] **BILL-02**: User can see a list of all detected bills and subscriptions with amounts and frequency
- [ ] **BILL-03**: User can view a bill calendar showing upcoming charges
- [ ] **BILL-04**: User can confirm or dismiss auto-detected bills (false positive handling)

### Savings Goals

- [ ] **GOAL-01**: User can create savings goals with target amount and optional deadline
- [ ] **GOAL-02**: User can see visual progress toward each goal (progress bar/ring)
- [ ] **GOAL-03**: User can track multiple goals simultaneously
- [ ] **GOAL-04**: Goals can be individual or shared with partner (household-scoped)
- [ ] **GOAL-05**: App shows projected completion date based on current savings rate

### Net Worth

- [ ] **NTWT-01**: User can see total net worth (assets minus liabilities) across all connected accounts
- [ ] **NTWT-02**: Net worth is tracked over time with a line chart
- [ ] **NTWT-03**: Net worth updates automatically as accounts sync

### Household/Couples

- [ ] **HOUS-01**: User can invite a partner to join their household via email
- [ ] **HOUS-02**: Each partner has their own login and personal view
- [ ] **HOUS-03**: Both partners can see a combined household spending view
- [ ] **HOUS-04**: User can set accounts as "mine", "ours", or "hidden" (balance-only) for privacy controls
- [ ] **HOUS-05**: Each partner can have individual budgets alongside shared household budgets
- [ ] **HOUS-06**: Household view shows combined net worth, spending, and budgets
- [ ] **HOUS-07**: Partner 1 can use the app solo; Partner 2 joins asynchronously without disruption

### Future-First Dashboard

- [ ] **DASH-01**: Default money home view shows forward-looking financial picture
- [ ] **DASH-02**: Dashboard shows available money until next paycheck
- [ ] **DASH-03**: Dashboard shows upcoming bills for the next 30 days with total amounts
- [ ] **DASH-04**: Dashboard shows projected end-of-month balance at current spending pace
- [ ] **DASH-05**: Income patterns auto-detected from transaction history
- [ ] **DASH-06**: Smart bill calendar with projected balance overlay and danger-zone highlighting
- [ ] **DASH-07**: Money summary card on existing BetterR.Me habit/task dashboard

### AI Insights

- [ ] **AIML-01**: App surfaces spending anomalies with context (e.g., "Groceries up 15% vs 3-month average")
- [ ] **AIML-02**: App detects subscription price increases and alerts user
- [ ] **AIML-03**: App shows progress toward goals with projected completion date
- [ ] **AIML-04**: Insights are embedded in relevant pages (dashboard, budgets, bills, goals), not in a chatbot
- [ ] **AIML-05**: Insights use anxiety-aware, progress-framing language consistent with Calm Finance

### Data Management

- [ ] **MGMT-01**: User can export transactions as CSV with selectable date range
- [ ] **MGMT-02**: User can delete their money data and household membership

## v5 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Features

- **ADVN-01**: Partner spending comparisons (side-by-side category breakdowns, neutral framing)
- **ADVN-02**: Advanced reporting (custom date ranges, year-over-year, tax categories)
- **ADVN-03**: Anxiety-aware progressive onboarding wizard
- **ADVN-04**: Email notifications for bill due dates and budget threshold alerts
- **ADVN-05**: Stripe billing integration with freemium tier enforcement

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI chatbot for financial advice | SEC/FINRA compliance risk, LLM hallucination liability with financial advice |
| Bill negotiation service | Operational complexity, legal liability, 35-60% fee structure erodes trust |
| Investment advisory / robo-advisor | SEC/FINRA registration required, different product category |
| Real-time chat between partners | Scope creep, couples already have messaging apps |
| Gamification for money (streaks, badges) | Conflicts with Calm Finance philosophy — financial anxiety |
| Multi-currency support | Massive complexity, US-focused for v4.0 |
| Automatic bill payment | Money transmitter licensing, ACH complexity, liability |
| Native mobile apps | Web-only, responsive design covers mobile |
| Envelope budgeting (YNAB-style) | High complexity, niche audience — standard category-limit budgeting instead |
| Receipt scanning / OCR | Specialized feature requiring camera integration and OCR pipeline |
| Separate moneyy.me branding | Single codebase, single deployment, single auth inside BetterR.Me |
| Stripe/freemium billing | Build features first (explicit decision), add billing in future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUN-01 | Phase 18 | Complete |
| FOUN-02 | Phase 18 | Complete |
| FOUN-03 | Phase 18 | Complete |
| FOUN-04 | Phase 18 | Complete |
| FOUN-05 | Phase 18 | Complete |
| FOUN-06 | Phase 18 | Complete |
| FOUN-07 | Phase 18 | Complete |
| FOUN-08 | Phase 18 | Complete |
| PLAD-01 | Phase 19 | Complete |
| PLAD-02 | Phase 19 | Complete |
| PLAD-03 | Phase 19 | Complete |
| PLAD-04 | Phase 19 | Complete |
| PLAD-05 | Phase 19 | Complete |
| PLAD-06 | Phase 19 | Complete |
| PLAD-07 | Phase 19 | Complete |
| PLAD-08 | Phase 19 | Complete |
| TXNS-01 | Phase 20 | Complete |
| TXNS-02 | Phase 20 | Pending |
| TXNS-03 | Phase 20 | Pending |
| TXNS-04 | Phase 20 | Pending |
| TXNS-05 | Phase 20 | Complete |
| TXNS-06 | Phase 20 | Complete |
| TXNS-07 | Phase 20 | Pending |
| TXNS-08 | Phase 20 | Pending |
| CATG-01 | Phase 20 | Complete |
| CATG-02 | Phase 20 | Complete |
| CATG-03 | Phase 20 | Complete |
| BUDG-01 | Phase 21 | Pending |
| BUDG-02 | Phase 21 | Pending |
| BUDG-03 | Phase 21 | Pending |
| BUDG-04 | Phase 21 | Pending |
| BUDG-05 | Phase 21 | Pending |
| BUDG-06 | Phase 21 | Pending |
| BILL-01 | Phase 22 | Pending |
| BILL-02 | Phase 22 | Pending |
| BILL-03 | Phase 22 | Pending |
| BILL-04 | Phase 22 | Pending |
| GOAL-01 | Phase 22 | Pending |
| GOAL-02 | Phase 22 | Pending |
| GOAL-03 | Phase 22 | Pending |
| GOAL-04 | Phase 22 | Pending |
| GOAL-05 | Phase 22 | Pending |
| NTWT-01 | Phase 22 | Pending |
| NTWT-02 | Phase 22 | Pending |
| NTWT-03 | Phase 22 | Pending |
| HOUS-01 | Phase 23 | Pending |
| HOUS-02 | Phase 23 | Pending |
| HOUS-03 | Phase 23 | Pending |
| HOUS-04 | Phase 23 | Pending |
| HOUS-05 | Phase 23 | Pending |
| HOUS-06 | Phase 23 | Pending |
| HOUS-07 | Phase 23 | Pending |
| DASH-01 | Phase 24 | Pending |
| DASH-02 | Phase 24 | Pending |
| DASH-03 | Phase 24 | Pending |
| DASH-04 | Phase 24 | Pending |
| DASH-05 | Phase 24 | Pending |
| DASH-06 | Phase 24 | Pending |
| DASH-07 | Phase 24 | Pending |
| AIML-01 | Phase 24 | Pending |
| AIML-02 | Phase 24 | Pending |
| AIML-03 | Phase 24 | Pending |
| AIML-04 | Phase 24 | Pending |
| AIML-05 | Phase 24 | Pending |
| MGMT-01 | Phase 25 | Pending |
| MGMT-02 | Phase 25 | Pending |

**Coverage:**
- v4.0 requirements: 66 total
- Mapped to phases: 66
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
