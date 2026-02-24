# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Current focus:** v4.0 Money Tracking — Phase 23 IN PROGRESS (Household & Couples)

## Current Position

Phase: 23 of 25 (Household & Couples)
Plan: 3 of 4 in current phase (COMPLETE)
Status: Plan 23-03 complete — UI components, view tabs, invite flow, i18n
Last activity: 2026-02-24 — Completed 23-03 (UI Components)

Progress: [██████░░░░] 60% v4.0

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
- 21-05: 4min, 2 tasks, 5 files (gap closure)
- 22-01: 5min, 2 tasks, 10 files
- 22-02: 6min, 2 tasks, 5 files
- 22-03: 7min, 2 tasks, 9 files
- 22-04: 6min, 2 tasks, 11 files
- 22-05: 8min, 2 tasks, 9 files
- 22-06: 3min, 3 tasks (2 auto + 1 checkpoint), 6 files
- 23-01: 9min, 2 tasks, 10 files
- 23-02: 11min, 3 tasks, 18 files
- 23-03: 15min, 3 tasks, 34 files

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
- [21-05] getBudgetTotalsByMonth uses single .in() query for efficiency instead of per-month lookups
- [21-05] currentMonth prop made optional on RolloverPrompt for backward compatibility
- [22-01] upsertFromPlaid detects price changes by comparing amount_cents, stores old in previous_amount_cents
- [22-01] goal_contributions RLS via savings_goals join (nested IN-subquery, same as budget_categories)
- [22-01] Net worth snapshot uses upsert on (household_id, snapshot_date) for idempotent daily updates
- [22-01] Bill frequency uses Plaid enum values directly (WEEKLY/BIWEEKLY/SEMI_MONTHLY/MONTHLY/ANNUALLY)
- [22-02] Bills summary total_monthly_cents normalizes all frequencies to monthly via multipliers (WEEKLY*52/12 etc.)
- [22-02] Manual bills auto-set source='manual', user_status='confirmed' (user explicitly created them)
- [22-02] Post-sync hooks: recurring bill detection + net worth snapshot in independent try/catch blocks
- [22-02] Sync route uses adminClient for Vault access and cross-table bill upsert operations
- [22-03] Goal projection uses 3-month rolling window of contributions for monthly savings rate
- [22-03] Status color: green (on track), yellow (within 30d of deadline), red (>30d past deadline)
- [22-03] Net worth change computed vs latest snapshot for simplicity
- [22-03] Snapshot API pre-formats label field (MMM yyyy) for direct chart consumption
- [22-04] Inline confirm/dismiss toggle (no modal) for bill status changes per locked user decision
- [22-04] Paid-this-month heuristic: bill.is_active + updated_at within current month
- [22-04] Calendar projects bills to days using frequency-based calculation from next_due_date
- [22-04] Tabbed List/Calendar views via BillsPageContent with shared useBills hook
- [22-04] Dialog modal={false} on BillForm for Radix Select compatibility
- [22-05] GoalCard reuses BudgetRing SVG with status_color -> ring color mapping (sage/amber/caution)
- [22-05] GoalGrid sorts active goals first by deadline, completed at bottom
- [22-05] NetWorthChart default period 6M, period toggle as row of small buttons with active highlighting
- [22-05] NetWorthAccounts groups by account_type (not Plaid subtype) for cleaner UI sections
- [22-05] ManualAssetForm includes clarification text per research for user guidance
- [22-06] Mock sub-components to isolate BillsList/GoalGrid/NetWorthChart tests from child concerns
- [22-06] Combined all 7 Zod schemas into single bills-goals validation test file for cohesion
- [23-01] ViewMode filter pattern: 'mine' = owner_id match, 'household' = visibility/is_shared match
- [23-01] Historical transactions bulk-hidden when sharing account (is_hidden_from_household=true)
- [23-01] AdminClient (service role) for merge/split operations crossing household boundaries
- [23-01] Category merge uses case-insensitive name deduplication with FK reference remapping
- [23-01] Shared budget spending computed exclusively from 'ours' visibility accounts
- [23-01] Household view: 'ours' accounts (not hidden) + individually shared from 'mine' accounts
- [23-02] All money GET endpoints accept ?view=mine|household, default 'mine' for backward compat
- [23-02] Transaction redaction: empty description, null merchant_name/notes in household view
- [23-02] Owner-only writes: budget/goal mutation endpoints verify owner_id === userId (403 for non-creators)
- [23-02] Net worth household = ALL accounts; analytics household = 'ours' accounts only
- [23-03] useHousehold() per-component with SWR deduplication (no context provider needed)
- [23-03] View mode state in useState (not URL) to avoid history pollution
- [23-03] HouseholdViewTabs renders null for solo users (isMultiMember check)
- [23-03] Transaction redaction in UI: hide merchant/description, disable detail expansion
- [23-03] NetWorthPageContent wrapper coordinates view across 3 independent sub-components
- [23-03] Sidebar counts intentionally always 'mine' view (habits/tasks, not money)

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

Last session: 2026-02-24
Stopped at: Completed 23-03-PLAN.md
Resume: Execute 23-04-PLAN.md (Testing)
