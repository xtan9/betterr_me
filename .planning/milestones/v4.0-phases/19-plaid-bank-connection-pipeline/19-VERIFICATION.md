---
phase: 19-plaid-bank-connection-pipeline
verified: 2026-02-22T13:15:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 19: Plaid Bank Connection Pipeline — Verification Report

**Phase Goal:** Users can connect real bank accounts via Plaid Link OAuth and see transactions flow in automatically via webhooks + Vercel Cron, with manual entry as a fallback for cash purchases
**Verified:** 2026-02-22T13:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can connect a bank account through Plaid Link OAuth flow and see their accounts appear on `/money/accounts` with balances | VERIFIED | `PlaidLinkButton` uses `usePlaidLink` from `react-plaid-link`, fetches link_token on mount, exchanges public_token via `exchangeAndStore()`, calls `mutate()` to refresh. Accounts page at `app/money/accounts/page.tsx` renders `AccountsList` which calls `useAccounts` SWR hook hitting `/api/money/accounts`. |
| 2 | Transactions sync automatically via Plaid webhooks and Vercel Cron background job — user sees new transactions appear without manual action | VERIFIED | `app/api/money/plaid/webhook/route.ts` handles `TRANSACTIONS/SYNC_UPDATES_AVAILABLE`, `INITIAL_UPDATE`, `HISTORICAL_UPDATE` by calling `syncTransactions()`. `app/api/cron/sync-transactions/route.ts` iterates all `status=connected` connections every 6 hours (scheduled in `vercel.json`). |
| 3 | User can see sync status per account (healthy/stale/error), manually trigger a re-sync, and disconnect a bank connection | VERIFIED | `SyncStatusBadge` displays 4 states (syncing/synced/stale/error). `AccountGroup` has a re-sync button wired to `handleSync` in `AccountsList` which POSTs to `/api/money/accounts/${id}/sync`. `DisconnectDialog` POSTs to `/api/money/accounts/${id}/disconnect` with keep/delete transaction choice. |
| 4 | Plaid access tokens are encrypted at rest via Supabase Vault; webhook endpoint verifies JWT/ES256 signatures before processing any payload | VERIFIED | Migration `20260221000003_add_plaid_columns.sql` creates SECURITY DEFINER vault wrapper functions. `token-exchange.ts` stores access tokens via `supabaseAdmin.rpc('create_plaid_secret', ...)`. `lib/plaid/webhooks.ts` implements full ES256 JWT + SHA-256 body hash verification using `jose`; webhook route calls `verifyPlaidWebhook()` before any processing. |
| 5 | User can manually enter individual transactions (cash purchases) as a fallback | VERIFIED | `ManualTransactionDialog` is a full react-hook-form + zodResolver dialog with all 5 required fields (amount, description, date, category, account). It includes a "Cash" option in the account selector. Wired to `AccountsList` "Other options" dropdown and to `AccountsEmptyState` as a secondary CTA. POSTs to `/api/money/transactions`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260221000003_add_plaid_columns.sql` | Plaid columns + Vault wrapper functions | VERIFIED | 93 lines. Adds `plaid_item_id`, `vault_secret_name`, `sync_cursor` to `bank_connections`; `plaid_account_id` to `accounts`; `plaid_transaction_id`, `source` to `transactions`. Includes 3 SECURITY DEFINER vault RPC functions and partial indexes. |
| `lib/plaid/client.ts` | Plaid API client factory | VERIFIED | 24 lines. Exports `createPlaidClient()`, non-singleton, env-based config. |
| `lib/plaid/token-exchange.ts` | Token exchange + Vault storage | VERIFIED | 216 lines. `exchangeAndStore()` full flow: public_token exchange, institution lookup, Vault RPC storage, bank_connection + account inserts. `getAccessToken()` and `removeAccessToken()` implemented. |
| `lib/plaid/sync.ts` | Cursor-based transaction sync | VERIFIED | 221 lines. `syncTransactions()` cursor pagination loop, sign inversion (`toCents(-amount)`), plaid_account_id resolution, upsert with `onConflict: 'plaid_transaction_id'`, removals, cursor update. |
| `lib/plaid/webhooks.ts` | JWT/ES256 webhook verification | VERIFIED | 74 lines. `verifyPlaidWebhook()`: decodes protected header, rejects non-ES256, fetches JWK from Plaid, imports JWK via `jose`, verifies with `maxTokenAge: '5 min'`, SHA-256 body hash comparison. Fail-closed (try-catch returns false). |
| `lib/db/bank-connections.ts` | BankConnectionsDB CRUD | VERIFIED | 108 lines. Methods: `getByHousehold`, `getById`, `create`, `updateStatus`, `updateSyncCursor`, `disconnect`. Constructor injection pattern. |
| `lib/db/accounts-money.ts` | MoneyAccountsDB CRUD | VERIFIED | 130 lines. Methods: `getByHousehold`, `getByBankConnection`, `getById`, `create`, `updateBalance`, `getCashAccount`. |
| `lib/db/transactions.ts` | TransactionsDB CRUD | VERIFIED | 133 lines. Methods: `getByHousehold`, `create`, `upsertPlaidTransactions`, `deleteByPlaidIds`, `getById`. Upsert uses `onConflict: 'plaid_transaction_id'`. |
| `lib/validations/plaid.ts` | Zod validation schemas | VERIFIED | 49 lines. `manualTransactionSchema`, `exchangeTokenSchema` (validates `public-` prefix), `webhookPayloadSchema`. |
| `app/api/money/plaid/create-link-token/route.ts` | POST: generate Plaid link_token | VERIFIED | 45 lines. Auth check, creates Plaid client, calls `linkTokenCreate`, returns `link_token`. |
| `app/api/money/plaid/exchange-token/route.ts` | POST: exchange public_token | VERIFIED | 57 lines. Auth check, validates with `exchangeTokenSchema`, resolves household, calls `exchangeAndStore()`. |
| `app/api/money/plaid/webhook/route.ts` | POST: JWT-verified webhook handler | VERIFIED | 131 lines. Reads raw text body, verifies with `verifyPlaidWebhook()`, handles TRANSACTIONS and ITEM webhook types, always returns 200. |
| `app/api/money/accounts/route.ts` | GET: list accounts with sync status | VERIFIED | 117 lines. Auth check, `deriveSyncStatus` helper with 4 states, groups by bank_connection, calculates `net_worth_cents`. |
| `app/api/money/accounts/[id]/sync/route.ts` | POST: manual re-sync | VERIFIED | 68 lines. Auth check, RLS-enforced access, `getAccessToken`, `syncTransactions`. |
| `app/api/money/accounts/[id]/disconnect/route.ts` | POST: disconnect with optional transaction delete | VERIFIED | 113 lines. Auth check, Plaid item remove, Vault cleanup via `removeAccessToken`, optional transaction deletion, status update to 'disconnected'. |
| `app/api/money/transactions/route.ts` | GET + POST: transactions | VERIFIED | 120 lines. GET with filters, POST for manual entry with Cash account auto-creation. |
| `app/api/cron/sync-transactions/route.ts` | GET: Vercel Cron background sync | VERIFIED | 77 lines. CRON_SECRET bearer verification, iterates all connected bank_connections, error isolation per connection. |
| `vercel.json` | Cron schedule configuration | VERIFIED | 8 lines. `"path": "/api/cron/sync-transactions"`, `"schedule": "0 */6 * * *"`. |
| `components/money/plaid-link-button.tsx` | Plaid Link trigger button | VERIFIED | 116 lines. Fetches link_token on mount, `usePlaidLink` from `react-plaid-link`, `onSuccess` exchanges token, toast feedback, `mutate()` refresh. |
| `components/money/account-card.tsx` | Individual account card | VERIFIED | 49 lines. Shows name, mask, balance via `formatMoney`, `SyncStatusBadge`. |
| `components/money/account-group.tsx` | Institution group with re-sync/disconnect | VERIFIED | 101 lines. Institution header, subtotal, re-sync button with spinner, disconnect button, error message display, `AccountCard` list. |
| `components/money/accounts-list.tsx` | Full accounts view | VERIFIED | 203 lines. `useAccounts` hook, net worth summary, dismissable error banner, `handleSync` POSTs to sync API, `ManualTransactionDialog` wired to "Other options" dropdown, `DisconnectDialog`. |
| `components/money/sync-status-badge.tsx` | 4-state sync status badge | VERIFIED | 35 lines. syncing (animated spinner), synced, stale, error states with Calm Finance CSS tokens. |
| `components/money/disconnect-dialog.tsx` | Disconnect confirmation dialog | VERIFIED | 105 lines. AlertDialog with keep/delete transaction buttons, POSTs to `/api/money/accounts/${id}/disconnect`. |
| `components/money/accounts-empty-state.tsx` | Welcoming empty state | VERIFIED | 53 lines. Wallet icon, `PlaidLinkButton` as primary CTA, `ManualTransactionDialog` trigger as secondary. |
| `components/money/manual-transaction-dialog.tsx` | Manual transaction entry modal | VERIFIED | 231 lines. react-hook-form + zodResolver, 5 fields (amount, description, date, category, account), Cash option, POSTs to `/api/money/transactions`. |
| `lib/hooks/use-accounts.ts` | SWR hook for accounts data | VERIFIED | 40 lines. `useAccounts()` with `keepPreviousData: true`, typed `AccountsResponse`, exports `ConnectionWithAccounts`. |
| `app/money/accounts/page.tsx` | Accounts page route | VERIFIED | 14 lines. Server component, i18n `PageHeader`, renders `AccountsList`. |
| `app/money/accounts/layout.tsx` | Accounts layout | VERIFIED | 7 lines. Pass-through layout. |
| `app/money/accounts/oauth/page.tsx` | OAuth redirect handler | VERIFIED | 113 lines. Reads `oauth_state_id`, fetches link_token, auto-opens Plaid Link with `receivedRedirectUri`, handles success/exit. |
| `tests/lib/plaid/webhooks.test.ts` | Webhook verification tests | VERIFIED | 185 lines, 8 test cases. Valid JWT, wrong body hash, expired JWT, non-ES256, invalid signature, missing header, key fetch failure, malformed JWT. Uses `@vitest-environment node`. |
| `tests/components/money/accounts-list.test.tsx` | AccountsList component tests | VERIFIED | 221 lines, 6 tests. Empty state, net worth, institution grouping, sync badges, dismissable error banner, accessibility. |
| `tests/components/money/sync-status-badge.test.tsx` | SyncStatusBadge tests | VERIFIED | 61 lines, 5 tests. All 4 states including syncing spinner, accessibility. |
| `tests/components/money/manual-transaction-dialog.test.tsx` | Manual dialog tests | VERIFIED | 192 lines, 5 tests. Fields render, Cash option, submit disabled when invalid, API call, accessibility. |
| `tests/lib/validations/plaid.test.ts` | Validation schema tests | VERIFIED | 160 lines, 19 tests. manualTransactionSchema, exchangeTokenSchema, webhookPayloadSchema coverage. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/plaid/token-exchange.ts` | Supabase Vault | `supabaseAdmin.rpc('create_plaid_secret', ...)` | WIRED | Lines 83-91: RPC call with secret_name and secret_value. `getAccessToken` retrieves via `rpc('get_plaid_secret', ...)`. |
| `lib/plaid/sync.ts` | `lib/plaid/client.ts` | `createPlaidClient()` | WIRED | Line 2 import, line 26 instantiation in `syncTransactions`. |
| `lib/db/bank-connections.ts` | `lib/db/types.ts` | `BankConnection` type import | WIRED | Line 2: `import type { BankConnection, BankConnectionInsert } from "./types"`. |
| `app/api/money/plaid/exchange-token/route.ts` | `lib/plaid/token-exchange.ts` | `exchangeAndStore()` | WIRED | Line 5 import, line 38 call with public_token, householdId, userId, adminClient. |
| `app/api/money/plaid/webhook/route.ts` | `lib/plaid/webhooks.ts` | `verifyPlaidWebhook()` | WIRED | Line 4 import, lines 22-26 call; returns 401 if false. |
| `app/api/money/plaid/webhook/route.ts` | `lib/plaid/sync.ts` | `syncTransactions()` on SYNC_UPDATES_AVAILABLE | WIRED | Line 5 import, lines 77-84 call inside TRANSACTIONS webhook handler. |
| `app/api/cron/sync-transactions/route.ts` | `lib/plaid/sync.ts` | `syncTransactions()` per connection | WIRED | Line 3 import, lines 39-45 call in loop over connected bank_connections. |
| `components/money/plaid-link-button.tsx` | `react-plaid-link` | `usePlaidLink` hook | WIRED | Line 5 import, line 94 `usePlaidLink({ token: linkToken, onSuccess, onExit })`. |
| `components/money/plaid-link-button.tsx` | `/api/money/plaid/create-link-token` | fetch POST | WIRED | Line 30: `fetch("/api/money/plaid/create-link-token", { method: "POST" })`. |
| `components/money/plaid-link-button.tsx` | `/api/money/plaid/exchange-token` | fetch POST with public_token | WIRED | Lines 63-68: `fetch("/api/money/plaid/exchange-token", { method: "POST", body: JSON.stringify({ public_token }) })`. |
| `components/money/accounts-list.tsx` | `lib/hooks/use-accounts.ts` | `useAccounts()` hook | WIRED | Line 16 import, line 26-27 call with destructured connections/netWorthCents/mutate. |
| `components/money/account-group.tsx` | `/api/money/accounts/[id]/sync` | `onSync` callback POSTs to sync endpoint | WIRED | AccountsList `handleSync` (lines 50-69) POSTs to `/api/money/accounts/${connectionId}/sync`, passed as prop to AccountGroup. |
| `components/money/disconnect-dialog.tsx` | `/api/money/accounts/[id]/disconnect` | fetch POST with keep_transactions | WIRED | Lines 41-48: `fetch(\`/api/money/accounts/${connectionId}/disconnect\`, { method: "POST", body: JSON.stringify({ keep_transactions }) })`. |
| `components/money/accounts-list.tsx` | `components/money/manual-transaction-dialog.tsx` | import and render from "Other options" dropdown | WIRED | Line 22 import, line 160 dropdown item calls `setManualDialogOpen(true)`, lines 195-200 render. |
| `components/money/manual-transaction-dialog.tsx` | `/api/money/transactions` | POST fetch | WIRED | Line 71: `fetch("/api/money/transactions", { method: "POST", ... })`. |
| `components/money/manual-transaction-dialog.tsx` | `lib/validations/plaid.ts` | `manualTransactionSchema` for form validation | WIRED | Line 35 import, line 58 `zodResolver(manualTransactionSchema)`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PLAD-01 | 19-01, 19-03, 19-04, 19-05, 19-06 | User can connect bank accounts via Plaid Link OAuth flow | SATISFIED | PlaidLinkButton + create-link-token + exchange-token routes + full OAuth redirect handler |
| PLAD-02 | 19-01, 19-03 | Connected accounts sync transactions automatically via webhooks with cursor-based pagination | SATISFIED | `syncTransactions()` cursor loop + webhook handler triggers sync on TRANSACTIONS events |
| PLAD-03 | 19-01 | Plaid access tokens encrypted at rest via Supabase Vault | SATISFIED | SECURITY DEFINER vault wrapper functions + `exchangeAndStore()` uses `rpc('create_plaid_secret', ...)` |
| PLAD-04 | 19-02 | Webhook endpoint verifies JWT/ES256 signatures via jose before processing | SATISFIED | `verifyPlaidWebhook()` with 8 tests, called before any payload processing in webhook route |
| PLAD-05 | 19-01, 19-03, 19-04, 19-05 | User can see sync status for each connected account (healthy/stale/error) | SATISFIED | `deriveSyncStatus()` in accounts API, `SyncStatusBadge` component with 4 states including syncing |
| PLAD-06 | 19-03, 19-04, 19-05 | User can manually trigger a re-sync for a connected account | SATISFIED | Re-sync button in `AccountGroup`, `handleSync` in `AccountsList` POSTs to `/api/money/accounts/[id]/sync` |
| PLAD-07 | 19-03, 19-04, 19-05 | User can disconnect a bank connection | SATISFIED | `DisconnectDialog` with keep/delete choice, disconnect route revokes Plaid access + removes from Vault |
| PLAD-08 | 19-03 | Background sync via Vercel Cron, cursor-based and idempotent | SATISFIED | `vercel.json` cron schedule, cron route iterates all connected accounts, `syncTransactions` is idempotent via `onConflict: 'plaid_transaction_id'` |

All 8 PLAD requirements satisfied. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/money/manual-transaction-dialog.tsx` | 119, 141, 172, 194 | HTML `placeholder` attribute on input fields | Info | Standard UX pattern for form inputs — not a stub. These are user-facing placeholder labels, not implementation placeholders. |
| `lib/plaid/sync.ts` | 133, 145 | `console.error` for account mapping failures | Info | Acceptable for background sync path where individual account mapping failures should not crash the entire sync. Not a stub. |

No blockers found. No stub implementations. No empty handlers. No `return null` returns outside of intentional fallback paths.

### Human Verification Required

#### 1. Plaid Link OAuth Full Flow

**Test:** With Plaid sandbox credentials configured (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`), click "Connect Bank Account" and complete the Plaid Link flow using sandbox credentials.
**Expected:** Bank accounts appear on `/money/accounts` with balances, institution name, and "Syncing" status badge.
**Why human:** Requires real Plaid sandbox environment; cannot verify end-to-end OAuth flow programmatically.

#### 2. Webhook Delivery from Plaid

**Test:** With a deployed instance and correct `NEXT_PUBLIC_APP_URL`, connect a sandbox account and wait for Plaid to send a webhook.
**Expected:** Transactions appear in the database automatically without manual re-sync.
**Why human:** Requires deployed environment with external Plaid webhook delivery.

#### 3. Supabase Vault Extension

**Test:** With Vault extension enabled in Supabase Dashboard, connect a bank account and verify no plain-text access token appears in the `bank_connections` table's `vault_secret_name` column.
**Expected:** `vault_secret_name` column contains a key reference (e.g., `plaid_access_token_<uuid>`), not the actual token.
**Why human:** Requires configured Supabase instance with Vault extension enabled.

#### 4. Sync Status Display Lifecycle

**Test:** After connecting a bank, observe the sync status badge cycle: "Syncing" (no cursor + no last_synced_at) → "Synced" (after first sync completes) → "Stale" (>24 hours without sync).
**Expected:** Badge accurately reflects sync state with correct colors (sage/amber).
**Why human:** Real-time UI state transitions require visual inspection.

#### 5. Manual Transaction Cash Account

**Test:** Open "Other options" dropdown, click "Enter transaction manually", select "Cash" as the account, fill all fields, and submit.
**Expected:** Transaction is created with a Cash account auto-created in the database (first time). Toast confirms success.
**Why human:** Cash account auto-creation on first use requires database interaction to verify.

### Gaps Summary

No gaps. All 5 observable truths are verified against actual code. All 35 required artifacts exist, are substantive (not stubs), and are correctly wired. All 8 PLAD requirements have implementation evidence. The 5 items requiring human verification are environmental/integration concerns (Plaid sandbox, deployed webhooks, Vault extension) that cannot be tested programmatically — they represent expected external dependencies, not gaps in the implementation.

---

_Verified: 2026-02-22T13:15:00Z_
_Verifier: Claude Sonnet 4.6 (gsd-verifier)_
