# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v4.0 Money Tracking — Phase 21 complete, ready for Phase 22

## Current Position

Phase: 21 of 25 (Budgets & Spending Analytics)
Plan: 4 of 4 in current phase (COMPLETE)
Status: Phase 21 complete — all 4 plans executed
Last activity: 2026-02-23 — Completed 21-04 (budget testing, verification, bug fixes)

Progress: [████░░░░░░] 40% v4.0

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 11
- Average duration: 5min
- Total execution time: 0.83 hours

**v1.1 Velocity:**
- Total plans completed: 1
- Execution time: ~10min

**v2.1 Velocity:**
- Total plans completed: 6
- Execution time: ~63min

**v3.0 Velocity:**
- Total plans completed: 12
- Total tasks: 25
- Total execution time: ~49min
- Files changed: 97 (+12,769/-156 lines)

**v4.0 Velocity:**
- 19-01: 4min, 2 tasks, 14 files
- 19-02: 5min, 3 tasks (TDD), 3 files
- 19-03: 5min, 2 tasks, 19 files
- 19-04: 6min, 2 tasks, 11 files
- 19-05: 5min, 2 tasks, 10 files
- 19-06: 2min, 2 tasks, 8 files
- 20-01: 4min, 2 tasks, 11 files
- 20-02: 9min, 2 tasks, 9 files
- 20-03: 11min, 2 tasks, 15 files
- 20-04: 6min, 2 tasks, 11 files
- 20-05: 3min, 1 task (checkpoint pending), 3 files
- 21-01: 5min, 2 tasks, 5 files
- 21-02: 4min, 2 tasks, 8 files
- 21-03: 8min, 2 tasks, 13 files
- 21-04: 5min, 2 tasks, 4 files

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full log with outcomes.
Recent decisions affecting current work:

- Keep Supabase for money features (no Better Auth+Drizzle+Neon)
- Plaid for bank connections (12,000+ US institutions)
- decimal.js for money arithmetic (integer cents in DB)
- Calm Finance design for money views only (muted teal/amber)
- No billing in v4.0 (build features first)
- Couples/household from day one (household_id in schema from first migration)
- [18-01] All money amounts BIGINT cents, converted via decimal.js at API boundary
- [18-01] IN-subquery RLS pattern for all money tables (99.78% faster than joins)
- [18-01] Categories SELECT allows NULL household_id for system defaults
- [18-01] Intl.NumberFormat("en-US") for consistent money formatting in Node.js
- [18-02] Wallet icon for Money nav (clean lines, recognizable, matches existing icon style)
- [18-02] Money nav position: Dashboard > Habits > Tasks > Money
- [18-02] Empty state designed as welcoming landing page, not error/broken state
- [19-01] Vault wrapper functions (SECURITY DEFINER) for PostgREST RPC access to Plaid secrets
- [19-01] Sign inversion at sync boundary: toCents(-plaidAmount) for Plaid->DB convention
- [19-01] Liability balance negation during exchange (credit/loan = negative in our system)
- [19-01] MoneyAccount naming avoids collision with JS Account / auth Account types
- [19-02] @vitest-environment node for jose v6 tests (jsdom Uint8Array polyfill incompatible)
- [19-02] Fail-closed webhook verification pattern (try-catch returns false on any error)
- [19-03] Webhook always returns 200 even on internal errors to prevent Plaid retries
- [19-03] Disconnect gracefully handles Plaid revocation errors (log but continue)
- [19-03] deriveSyncStatus helper derives UI state from connection fields (syncing/synced/stale/error)
- [19-03] Cron auth: Bearer CRON_SECRET header verification pattern
- [19-04] ConnectionWithAccounts extends BankConnection with accounts array and sync_status for SWR
- [19-04] PlaidLinkButton eager link_token fetch on mount for faster UX
- [19-04] DisconnectDialog uses two action buttons (keep/delete) for clarity
- [19-04] Dismissable error banner auto-resets when connections change (new errors detected)
- [19-05] Server page + client list pattern: server i18n header wrapping client SWR component
- [19-05] OAuth redirect auto-opens Plaid Link with receivedRedirectUri on mount
- [19-05] MoneyPageShell shows live net worth summary or empty state (replaced coming-soon)
- [19-06] ManualTransactionDialog uses react-hook-form + zodResolver with manualTransactionSchema
- [19-06] Cash account option (value: 'cash') in account selector for unbanked transactions
- [19-06] Manual entry button in AccountsEmptyState alongside Plaid Link for discoverability
- [19-06] react-plaid-link added as project dependency
- [20-01] TransactionsDB.getByHousehold returns { transactions, total } for count-based pagination
- [20-01] escapeIlike helper prevents SQL injection via ILIKE wildcards in user search input
- [20-01] CategoriesDB.getVisible uses two-step approach: fetch hidden IDs, then exclude via NOT IN
- [20-02] Split POST replaces existing splits atomically (delete + re-create) for idempotent updates
- [20-02] Split amount validation uses Math.abs comparison for positive/negative transaction amounts
- [20-02] Hidden category toggle uses POST/DELETE on /categories/hidden sub-route
- [20-03] Compact card-row layout (not data table) for Calm Finance aesthetic
- [20-03] Load More button (not infinite scroll) for pagination
- [20-03] router.replace (not push) for filter changes to avoid filling browser history
- [20-03] Suspense boundary wraps TransactionList for useSearchParams SSR compatibility
- [20-04] Toast action/cancel pattern for merchant rule prompt (sonner with 10s duration)
- [20-04] Split form uses react-hook-form useFieldArray with auto-fill remainder for 2-split case
- [20-04] applyMerchantRules queries merchant_category_rules directly with admin client in sync pipeline
- [20-04] CategoryManager tracks hidden categories in local state for immediate UI feedback
- [20-05] Mock sub-components to isolate TransactionList tests from child component concerns
- [20-05] Combined all 5 Zod validation schemas into single test file for transaction management cohesion
- [21-01] Spending aggregation filters amount_cents < 0 (negative = outflow), matching project sign convention
- [21-01] Budget categories atomically replaced on update (delete + re-insert), same pattern as transaction splits
- [21-01] Rollover can be negative (overspend debt carries forward to next month)
- [21-02] Dual-mode analytics endpoint: month param for category breakdown, type=trends for multi-month
- [21-02] Rollover route verifies rollover_enabled on source budget before computing
- [21-02] Budget GET by ID delegates to getByMonth for full spending data (avoids logic duplication)
- [21-02] SWR hooks derive isLoading from data/error shape (consistent with existing hooks)
- [21-03] BudgetRing uses custom SVG (~60 lines) instead of charting library for lightweight progress rings
- [21-03] Donut chart data derived from budget.categories (avoids redundant useSpendingAnalytics API call)
- [21-03] CategoryDrillDown uses Sheet side panel to preserve budget overview context
- [21-03] Added --money-caution CSS variable (muted coral) for Calm Finance over-budget states
- [21-04] Dialog modal={false} pattern when containing Radix Select/Combobox components
- [21-04] Month navigation uses startOfMonth comparison (not isFuture) for current-month boundary

### Pending Todos

None.

### Blockers/Concerns

- Vitest picks up .worktrees/ test files causing spurious failures (pre-existing, not blocking)
- @dnd-kit/core v6 + React 19 peer dep mismatch requires pnpm config (cosmetic, works correctly)
- Plaid API costs ~$1-2/connected account/month — monitor unit economics
- Plaid access tokens must be encrypted at rest from first migration
- Household data isolation (RLS + application-layer) critical for couples feature
- Supabase `numeric` type causes silent float precision loss — use BIGINT cents only
- Plaid webhook endpoint bypasses Supabase auth — needs service-role client + JWT verification
- Phase 19 (Plaid) flagged HIGH for research before planning
- Phase 23 (Household/Couples) flagged MEDIUM for research (invite token strategy)
- Phase 24 (Dashboard/AI) flagged HIGH for research (cash flow projections, constrained LLM)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 21-04-PLAN.md (Phase 21 complete)
Resume: Begin Phase 22 research/planning (Bills, Goals & Net Worth)
