---
phase: 19-plaid-bank-connection-pipeline
plan: 01
subsystem: database, api
tags: [plaid, supabase-vault, transaction-sync, cursor-pagination, zod, typescript]

# Dependency graph
requires:
  - phase: 18-database-foundation-household-schema
    provides: "stub money tables (bank_connections, accounts, transactions), households, RLS policies"
provides:
  - "Plaid-specific columns on bank_connections, accounts, transactions tables"
  - "Plaid API client factory (createPlaidClient)"
  - "Token exchange with Vault storage (exchangeAndStore, getAccessToken, removeAccessToken)"
  - "Cursor-based transaction sync (syncTransactions)"
  - "BankConnectionsDB, MoneyAccountsDB, TransactionsDB classes"
  - "Zod schemas for manual transaction, token exchange, webhook payload"
  - "TypeScript interfaces: BankConnection, MoneyAccount, Transaction"
affects: [19-02, 19-03, 19-04, 19-05, 19-06]

# Tech tracking
tech-stack:
  added: [plaid@41.3.0, react-plaid-link@4.1.1, jose@6.1.3]
  patterns: [vault-rpc-wrapper, cursor-sync-loop, sign-inversion-at-sync]

key-files:
  created:
    - supabase/migrations/20260221000003_add_plaid_columns.sql
    - lib/plaid/client.ts
    - lib/plaid/types.ts
    - lib/plaid/token-exchange.ts
    - lib/plaid/sync.ts
    - lib/db/bank-connections.ts
    - lib/db/accounts-money.ts
    - lib/db/transactions.ts
    - lib/validations/plaid.ts
  modified:
    - lib/db/types.ts
    - lib/db/index.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Vault wrapper functions (create/get/delete_plaid_secret) as SECURITY DEFINER for PostgREST RPC access"
  - "Sign inversion at sync boundary: toCents(-plaidAmount) converts Plaid positive-outflow to our positive-inflow convention"
  - "Liability account balance negation during exchange (credit/loan balances negated to represent debt)"
  - "MoneyAccount name avoids collision with JS Account/auth concepts"

patterns-established:
  - "Vault RPC pattern: SQL SECURITY DEFINER functions wrapping vault.create_secret/decrypted_secrets for admin.rpc() access"
  - "Plaid sign convention: negate Plaid amounts during sync, not during display"
  - "DB class pattern for money: household-scoped queries with SupabaseClient constructor injection"

requirements-completed: [PLAD-01, PLAD-02, PLAD-03, PLAD-05]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 19 Plan 01: Plaid Server Infrastructure Summary

**Plaid SDK installed, migration adds Plaid columns + Vault wrapper RPCs, server library provides token exchange with Vault encryption and cursor-based transaction sync, three DB classes and Zod schemas ready for API routes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T08:44:20Z
- **Completed:** 2026-02-22T08:48:52Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Plaid SDK (v41.3.0), react-plaid-link, and jose installed
- Migration adds plaid_item_id/vault_secret_name/sync_cursor to bank_connections, plaid_account_id to accounts, plaid_transaction_id/source to transactions, plus partial indexes and Vault wrapper functions
- Full token exchange flow: public_token -> access_token -> Vault storage -> bank_connection + accounts created
- Cursor-based sync loop with sign inversion, account ID resolution, and batch upsert
- Three DB classes (BankConnectionsDB, MoneyAccountsDB, TransactionsDB) following existing HabitsDB pattern
- Zod schemas for manual transaction entry, Plaid token exchange, and webhook payload

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Plaid packages and create database migration** - `d135cbe` (chore)
2. **Task 2: Create Plaid server library, DB classes, and validation schemas** - `768a949` (feat)

## Files Created/Modified
- `supabase/migrations/20260221000003_add_plaid_columns.sql` - ALTER TABLE additions for Plaid columns + Vault wrapper functions
- `lib/plaid/client.ts` - Plaid API client factory (not singleton, per project convention)
- `lib/plaid/types.ts` - PlaidItemData, PlaidSyncResult, SyncStatus, ExchangeResult types
- `lib/plaid/token-exchange.ts` - exchangeAndStore, getAccessToken, removeAccessToken with Vault RPC
- `lib/plaid/sync.ts` - syncTransactions with cursor pagination loop and sign inversion
- `lib/db/bank-connections.ts` - BankConnectionsDB (getByHousehold, create, updateStatus, disconnect, etc.)
- `lib/db/accounts-money.ts` - MoneyAccountsDB (getByHousehold, getByBankConnection, getCashAccount, etc.)
- `lib/db/transactions.ts` - TransactionsDB (getByHousehold with pagination/filtering, upsertPlaidTransactions, deleteByPlaidIds)
- `lib/db/types.ts` - Added BankConnection, MoneyAccount, Transaction interfaces and insert types
- `lib/db/index.ts` - Barrel exports for new DB classes
- `lib/validations/plaid.ts` - manualTransactionSchema, exchangeTokenSchema, webhookPayloadSchema

## Decisions Made
- **Vault wrapper functions as SECURITY DEFINER:** Since vault schema is not exposed via PostgREST, created SQL wrapper functions callable via admin.rpc() that run with definer privileges
- **Sign inversion at sync boundary:** Plaid positive = outflow, our positive = inflow. Convert with `toCents(-plaidAmount)` during sync, not during display. This keeps the DB convention consistent
- **Liability balance negation:** Credit card/loan balances from Plaid are positive (representing debt) but stored as negative in our system (money owed = negative net worth)
- **MoneyAccount naming:** Avoids collision with JavaScript's Account concepts and auth-related Account types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

External services require manual configuration before Plaid integration can be tested:
- `PLAID_CLIENT_ID` and `PLAID_SECRET` from Plaid Dashboard
- `PLAID_ENV` set to 'sandbox' for development
- `PLAID_REDIRECT_URI` for OAuth flow (must be registered in Plaid Dashboard)
- `NEXT_PUBLIC_APP_URL` for webhook URL construction
- `CRON_SECRET` for Vercel Cron authentication
- Enable Vault extension in Supabase Dashboard

## Next Phase Readiness
- Server infrastructure complete for API routes (Plan 02)
- Token exchange flow ready for Plaid Link integration (Plan 03)
- Sync logic ready for webhook and cron endpoints (Plan 04/05)
- All DB classes ready for CRUD operations in API routes

## Self-Check: PASSED

- All 11 source files: FOUND
- Commit d135cbe (Task 1): FOUND
- Commit 768a949 (Task 2): FOUND
- 19-01-SUMMARY.md: FOUND
- Lint: 0 errors (8 pre-existing warnings)
- Tests: 102 passed, 1382 tests, 0 regressions

---
*Phase: 19-plaid-bank-connection-pipeline*
*Completed: 2026-02-22*
