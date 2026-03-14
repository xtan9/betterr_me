# Phase 19: Plaid Bank Connection Pipeline - Research

**Researched:** 2026-02-21
**Domain:** Plaid financial data API integration, webhook processing, encrypted secret storage
**Confidence:** HIGH

## Summary

Phase 19 connects users to real bank accounts via the Plaid API. The integration involves four main subsystems: (1) a Plaid Link OAuth front-end flow using `react-plaid-link`, (2) server-side token exchange and encrypted storage of access tokens via Supabase Vault, (3) cursor-based transaction sync via `/transactions/sync` triggered by webhooks and Vercel Cron, and (4) manual transaction entry as a fallback. The existing Phase 18 schema (bank_connections, accounts, transactions) needs additional Plaid-specific columns (plaid_item_id, plaid_account_id, sync cursors, etc.) via a new migration.

The Plaid ecosystem is mature and well-documented. The `plaid` Node.js SDK (v41.x) is auto-generated from their OpenAPI spec and provides typed methods for all endpoints. The `react-plaid-link` package (v4.1.x) provides a `usePlaidLink` hook that handles the entire Link UI flow. Webhook verification uses JWT/ES256 signatures validated via the `jose` library. Supabase Vault handles at-rest encryption of Plaid access tokens using pgsodium's authenticated encryption.

**Primary recommendation:** Use `plaid` + `react-plaid-link` + `jose` as the core stack. Store access tokens in Supabase Vault (not in application columns). Build the webhook endpoint as a Next.js API route that verifies JWT signatures before processing. Use Vercel Cron as a safety net for missed webhooks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Entry point and empty state: Claude's discretion (pick best approach based on existing codebase patterns)
- After successful Plaid Link OAuth: redirect back to /money/accounts showing newly connected accounts with a success toast
- On Plaid Link failure (user cancel, bank unavailable): show error/cancellation toast, user stays on accounts page, can retry immediately
- Unlimited bank connections — no cap on number of institutions a user can connect
- Accounts grouped by institution — bank name header with individual accounts listed underneath (e.g., Chase -> Checking, Savings, Credit Card)
- Current balance only per account — no available balance or credit limit shown
- Overall net worth summary at top of accounts page (assets minus liabilities) AND per-institution subtotals within each group
- Sync status shown as visible text badge per account: "Synced" / "Stale" / "Error"
- No CSV import — feature removed from the app. Only Plaid + manual entry
- Manual entry surfaced as secondary option — Plaid is the primary CTA; manual entry in a dropdown or "Other options" section
- Manual entry opens as a modal/dialog — quick entry without leaving the page
- Required fields: amount, description, date, category
- User picks which account the transaction belongs to (including a "Cash" option for unbanked transactions)
- Initial sync after connecting: account cards show loading/syncing state with spinner until first sync completes
- Sync errors (e.g., bank login expired): error badge on affected account card AND a dismissable banner at top of accounts page
- Re-sync button directly on each account card — always visible, not hidden in a menu
- Disconnect flow: confirmation dialog asks whether to keep or delete previously synced transactions
- Build Plaid integration production-ready (not sandbox-only) — user may charge for the app as a SaaS product
- Design the Plaid integration layer cleanly so swapping providers later isn't painful
- Plaid charges per "item" (bank login), not per account — architecture should track items vs accounts

### Claude's Discretion
- Exact empty state design for first-time user with no accounts
- Plaid Link UI wrapper and loading states during OAuth redirect
- Account card visual design (within Calm Finance design system)
- Re-sync button styling and placement within the card
- Manual entry form layout and validation UX

### Deferred Ideas (OUT OF SCOPE)
- CSV import — explicitly removed from the app, not just deferred. Do not build CSV import in any phase.
- Monetization / subscription pricing — user considering SaaS model ($5-10/month) but decision is separate from implementation
- Provider abstraction layer for swapping Plaid with alternatives (Teller, MX, etc.) — nice-to-have, not required for Phase 19
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAD-01 | User can connect bank accounts via Plaid Link OAuth flow | `react-plaid-link` v4.1.x `usePlaidLink` hook + server-side `/link/token/create` + `/item/public_token/exchange` endpoints. Code examples verified from Context7 and Plaid docs. |
| PLAD-02 | Connected accounts sync transactions automatically via Plaid webhooks with cursor-based pagination | `SYNC_UPDATES_AVAILABLE` webhook fires when transactions change. `/transactions/sync` with cursor-based pagination handles added/modified/removed. Verified from Plaid API docs. |
| PLAD-03 | Plaid access tokens encrypted at rest via Supabase Vault before storage | `vault.create_secret()` function stores encrypted secrets. Read via `vault.decrypted_secrets` view. Only accessible to service-role (admin) client. Verified from Supabase docs. |
| PLAD-04 | Plaid webhook endpoint verifies JWT/ES256 signatures via jose before processing any payload | Plaid sends JWT in `Plaid-Verification` header. Verify with `jose.jwtVerify()` using JWK from `/webhook_verification_key/get`. Check `iat` (5 min max) and SHA-256 body hash. Verified from both Plaid docs and jose Context7. |
| PLAD-05 | User can see sync status for each connected account (healthy/stale/error) | Status derived from `bank_connections.status` column + `last_synced_at` timestamp. "Synced" = connected + recent sync, "Stale" = connected + old sync, "Error" = error status. |
| PLAD-06 | User can manually trigger a re-sync for a connected account | API route calls `/transactions/sync` on demand with the stored cursor. Uses admin client to read decrypted access token from Vault. |
| PLAD-07 | User can disconnect a bank connection | Calls Plaid `/item/remove` to revoke access, then updates `bank_connections.status = 'disconnected'`. Confirmation dialog asks whether to keep or delete synced transactions. |
| PLAD-08 | Background sync runs via Vercel Cron, cursor-based and idempotent (partial progress safe) | Vercel Cron hits `/api/cron/sync-transactions` on schedule. Secured via `CRON_SECRET` bearer token. Iterates all connected items, syncs each with stored cursor. Safe to interrupt mid-run. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `plaid` | 41.x | Server-side Plaid API client | Official Node.js SDK, auto-generated from OpenAPI spec, typed methods for all endpoints |
| `react-plaid-link` | 4.1.x | Client-side Plaid Link UI component | Official React hook (`usePlaidLink`) for bank connection OAuth flow |
| `jose` | 5.x | JWT/JWK verification | Lightweight, Web Crypto API-based, supports ES256 for Plaid webhook verification |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase Vault | (extension) | Encrypt Plaid access tokens at rest | Always — requirement PLAD-03 mandates encrypted storage |
| `crypto` (Node built-in) | N/A | SHA-256 hash for webhook body verification | Webhook verification step: compare body hash to JWT claim |

### Already in Project (No New Install)
| Library | Purpose in Phase 19 |
|---------|---------------------|
| `zod` | Validate webhook payloads, manual transaction form data, API request bodies |
| `swr` | Client-side data fetching for accounts list, sync status |
| `sonner` | Toast notifications for connection success/failure |
| `react-hook-form` | Manual transaction entry form |
| `decimal.js` (via `lib/money/arithmetic.ts`) | Convert Plaid dollar amounts to integer cents |
| `lucide-react` | Icons for account cards, sync status badges |
| `next-intl` | i18n for all new UI strings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` for JWT | `jsonwebtoken` | `jose` is smaller, uses Web Crypto (no native deps), better for Edge Runtime |
| Supabase Vault | Column-level encryption with pgcrypto | Vault is purpose-built, managed key rotation, simpler API |
| Vercel Cron | External cron service (EasyCron, cron-job.org) | Vercel Cron is integrated, no external dependency, secured by CRON_SECRET |

**Installation:**
```bash
pnpm add plaid react-plaid-link jose
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── plaid/
│   ├── client.ts            # PlaidApi singleton factory
│   ├── link-token.ts         # Server-side link token creation
│   ├── token-exchange.ts     # Public token -> access token exchange + Vault storage
│   ├── sync.ts               # Cursor-based transaction sync logic
│   ├── webhooks.ts           # Webhook verification (JWT/ES256 + SHA-256)
│   └── types.ts              # Plaid-specific TypeScript types
├── db/
│   ├── bank-connections.ts   # BankConnectionsDB class (CRUD for bank_connections)
│   ├── accounts-money.ts     # MoneyAccountsDB class (CRUD for accounts)
│   └── transactions.ts       # TransactionsDB class (CRUD for transactions)
├── money/
│   └── arithmetic.ts         # (existing) cents conversion
├── validations/
│   ├── money.ts              # (existing) money amount schema
│   └── plaid.ts              # Webhook payload, manual entry schemas
app/
├── api/
│   ├── money/
│   │   ├── plaid/
│   │   │   ├── create-link-token/route.ts   # POST: generate link_token
│   │   │   ├── exchange-token/route.ts      # POST: exchange public_token
│   │   │   └── webhook/route.ts             # POST: receive Plaid webhooks
│   │   ├── accounts/route.ts                # GET: list accounts
│   │   ├── accounts/[id]/
│   │   │   ├── sync/route.ts                # POST: manual re-sync
│   │   │   └── disconnect/route.ts          # POST: disconnect bank
│   │   ├── transactions/route.ts            # GET: list, POST: manual entry
│   │   └── household/route.ts               # (existing)
│   └── cron/
│       └── sync-transactions/route.ts       # Vercel Cron endpoint
├── money/
│   ├── page.tsx              # (existing) money home
│   └── accounts/
│       └── page.tsx          # Accounts page with Plaid Link + account cards
components/
├── money/
│   ├── plaid-link-button.tsx         # Plaid Link trigger button
│   ├── account-card.tsx              # Account card with balance + sync status
│   ├── account-group.tsx             # Institution group (bank name header + accounts)
│   ├── accounts-list.tsx             # Full accounts list with net worth summary
│   ├── manual-transaction-dialog.tsx # Manual entry modal
│   ├── disconnect-dialog.tsx         # Disconnect confirmation dialog
│   ├── sync-status-badge.tsx         # Synced/Stale/Error badge
│   └── money-page-shell.tsx          # (existing) empty state
```

### Pattern 1: Plaid Item vs Account Data Model
**What:** Plaid "Items" represent a bank login (one access_token per Item). Each Item has multiple Accounts. Our `bank_connections` table maps to Items; `accounts` table maps to Plaid accounts within an Item.
**When to use:** Always — this is how Plaid structures data and how billing works.
**Schema mapping:**
```
Plaid Item (1 login) → bank_connections row (1 access_token in Vault)
  └── Plaid Account (checking) → accounts row (plaid_account_id)
  └── Plaid Account (savings)  → accounts row (plaid_account_id)
  └── Plaid Account (credit)   → accounts row (plaid_account_id)
```

### Pattern 2: Token Flow (Link -> Exchange -> Vault)
**What:** Three-step token exchange with encrypted storage.
**When to use:** Every new bank connection.
```
Client                           Server                          Plaid API
  │                                │                                │
  │ 1. GET /create-link-token      │                                │
  │ ─────────────────────────────> │                                │
  │                                │ 2. POST /link/token/create     │
  │                                │ ─────────────────────────────> │
  │                                │ <───── link_token ──────────── │
  │ <──── link_token ──────────── │                                │
  │                                │                                │
  │ 3. Open Plaid Link (OAuth)     │                                │
  │ ═══════════════════════════════════════════════════════════════> │
  │ <══════ onSuccess(public_token) ════════════════════════════════ │
  │                                │                                │
  │ 4. POST /exchange-token        │                                │
  │    { public_token }            │                                │
  │ ─────────────────────────────> │                                │
  │                                │ 5. POST /item/public_token/    │
  │                                │    exchange                    │
  │                                │ ─────────────────────────────> │
  │                                │ <── access_token + item_id ─── │
  │                                │                                │
  │                                │ 6. vault.create_secret(        │
  │                                │      access_token)             │
  │                                │                                │
  │                                │ 7. POST /accounts/get          │
  │                                │ ─────────────────────────────> │
  │                                │ <── accounts list ──────────── │
  │                                │                                │
  │                                │ 8. Insert bank_connection +    │
  │                                │    accounts into DB            │
  │ <── { success, accounts } ──── │                                │
```

### Pattern 3: Cursor-Based Transaction Sync
**What:** The `/transactions/sync` endpoint returns added/modified/removed transactions with a cursor for incremental updates. The cursor is stored per bank_connection.
**When to use:** Both webhook-triggered sync and cron fallback sync.
```typescript
// Source: Plaid docs - /transactions/sync
async function syncTransactions(accessToken: string, cursor: string | null) {
  let added = [];
  let modified = [];
  let removed = [];
  let hasMore = true;
  let nextCursor = cursor;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor ?? undefined,
    });
    added = added.concat(response.data.added);
    modified = modified.concat(response.data.modified);
    removed = removed.concat(response.data.removed);
    hasMore = response.data.has_more;
    nextCursor = response.data.next_cursor;
  }

  return { added, modified, removed, cursor: nextCursor };
}
```

### Pattern 4: Webhook Verification (JWT/ES256 + SHA-256)
**What:** Plaid signs webhooks with a JWT in the `Plaid-Verification` header. Verify: (1) algorithm is ES256, (2) JWT signature is valid using JWK from Plaid, (3) `iat` is within 5 minutes, (4) SHA-256 of body matches `request_body_sha256` claim.
**When to use:** Every incoming webhook request, before processing the payload.
```typescript
// Source: Plaid docs + jose Context7
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';
import { createHash } from 'crypto';

async function verifyPlaidWebhook(body: string, plaidVerification: string): Promise<boolean> {
  // 1. Decode header without verifying to get kid
  const header = decodeProtectedHeader(plaidVerification);
  if (header.alg !== 'ES256') return false;

  // 2. Fetch JWK from Plaid using the kid
  const keyResponse = await plaidClient.webhookVerificationKeyGet({
    key_id: header.kid!,
  });
  const key = await importJWK(keyResponse.data.key);

  // 3. Verify JWT signature and check iat (5 min max)
  const { payload } = await jwtVerify(plaidVerification, key, {
    maxTokenAge: '5 min',
  });

  // 4. Verify body hash
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return bodyHash === payload.request_body_sha256;
}
```

### Pattern 5: Supabase Vault for Access Tokens
**What:** Store Plaid access tokens encrypted at rest. Only the admin client (service role) can read them.
**When to use:** Storing access tokens after exchange, reading them for sync operations.
```sql
-- Store encrypted access token (in token-exchange.ts via admin client)
SELECT vault.create_secret(
  'access-sandbox-abc123',                    -- the secret value
  'plaid_access_token_<bank_connection_id>',  -- unique name
  'Plaid access token for bank connection'    -- description
);

-- Read decrypted access token (in sync.ts via admin client)
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'plaid_access_token_<bank_connection_id>';
```

### Pattern 6: Vercel Cron Safety Net
**What:** A scheduled cron job that syncs all connected accounts, acting as a fallback for missed webhooks.
**When to use:** Always running alongside webhooks — webhooks are primary, cron is backup.
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-transactions",
      "schedule": "0 */6 * * *"
    }
  ]
}
```
```typescript
// app/api/cron/sync-transactions/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... iterate connected bank_connections, sync each
}
```

### Anti-Patterns to Avoid
- **Storing access tokens in plain text columns:** Use Supabase Vault exclusively. Never store Plaid access tokens in regular database columns.
- **Using `/transactions/get` instead of `/transactions/sync`:** The sync endpoint is the modern API; `/transactions/get` is legacy and requires different webhook handling.
- **Singleton Plaid client in module scope:** Follow project convention — create Plaid client instances in functions, not as module-level singletons, to avoid environment variable issues during testing.
- **Trusting webhook payloads without verification:** Always verify JWT signature + body hash before processing. An unverified webhook endpoint is a security vulnerability.
- **Processing webhooks synchronously:** Webhook handler should acknowledge quickly (200 OK), then process async. Plaid retries on timeout.
- **Ignoring the `has_more` pagination flag:** The `/transactions/sync` response may be paginated. Always loop until `has_more === false`.

## Database Schema Migration

The existing Phase 18 stub tables need Plaid-specific columns. This requires a new migration:

```sql
-- Migration: Add Plaid-specific columns to money tables

-- bank_connections: Add Plaid Item fields
ALTER TABLE bank_connections
  ADD COLUMN plaid_item_id TEXT UNIQUE,
  ADD COLUMN institution_id TEXT,          -- Plaid institution ID (e.g., ins_1)
  ADD COLUMN institution_name TEXT,        -- Display name (e.g., "Chase")
  ADD COLUMN vault_secret_name TEXT,       -- Name key for vault.decrypted_secrets lookup
  ADD COLUMN sync_cursor TEXT,             -- Cursor for /transactions/sync
  ADD COLUMN last_synced_at TIMESTAMPTZ,   -- When transactions were last synced
  ADD COLUMN error_code TEXT,              -- Plaid error code if status='error'
  ADD COLUMN error_message TEXT,           -- Human-readable error description
  ADD COLUMN connected_by UUID REFERENCES profiles(id); -- Which user connected this

-- accounts: Add Plaid Account fields
ALTER TABLE accounts
  ADD COLUMN plaid_account_id TEXT UNIQUE,
  ADD COLUMN official_name TEXT,           -- Bank's official account name
  ADD COLUMN mask TEXT,                    -- Last 4 digits (e.g., "1234")
  ADD COLUMN subtype TEXT;                 -- Plaid subtype (checking, savings, credit card, etc.)

-- transactions: Add Plaid Transaction fields
ALTER TABLE transactions
  ADD COLUMN plaid_transaction_id TEXT UNIQUE,
  ADD COLUMN plaid_category_primary TEXT,  -- PFCv2 primary category
  ADD COLUMN plaid_category_detailed TEXT, -- PFCv2 detailed category
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('plaid', 'manual'));

-- Add a "Cash" pseudo-account per household for manual transactions
-- (handled in application code, not a migration — uses accounts table with bank_connection_id=NULL)

-- Indexes for Plaid ID lookups
CREATE INDEX idx_bank_connections_plaid_item ON bank_connections(plaid_item_id) WHERE plaid_item_id IS NOT NULL;
CREATE INDEX idx_accounts_plaid_account ON accounts(plaid_account_id) WHERE plaid_account_id IS NOT NULL;
CREATE INDEX idx_transactions_plaid_txn ON transactions(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
CREATE INDEX idx_transactions_source ON transactions(source);
```

### Plaid Amount Sign Convention
Plaid uses **positive values for outflows** (purchases, debits) and **negative values for inflows** (deposits, credits). This project stores amounts as integer cents. During sync, convert Plaid amounts:
```typescript
// Plaid: positive = money out, negative = money in
// Our DB: positive = money in (income), negative = money out (expense)
// Invert the sign to match our convention
const amountCents = toCents(-plaidTransaction.amount);
```

**Important:** Verify this sign convention decision during planning. Some PFM apps keep Plaid's convention. Pick one and document it clearly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bank connection UI | Custom bank selector | `react-plaid-link` + Plaid Link | Handles OAuth, MFA, 12,000+ institutions, compliance |
| Access token encryption | Custom AES/pgcrypto encryption | Supabase Vault | Managed key rotation, authenticated encryption, backup-safe |
| Webhook JWT verification | Manual JWT parsing | `jose` library | Handles JWK import, ES256 verification, timing-safe comparison |
| Transaction deduplication | Custom dedup logic | Plaid `/transactions/sync` cursor | Cursor-based API inherently handles dedup via added/modified/removed |
| Bank institution metadata | Institution name/logo DB | Plaid institution data from Item | Comes free with the connection — institution_name from metadata |
| Cron job authentication | Custom auth middleware | Vercel `CRON_SECRET` | Built-in, automatic bearer token injection |

**Key insight:** Plaid's API is designed to handle the hard parts (bank authentication, data normalization, deduplication). The application layer should focus on storing data, showing status, and handling errors — not reimplementing what Plaid already provides.

## Common Pitfalls

### Pitfall 1: Plaid Access Token Exposure
**What goes wrong:** Access tokens stored in plain text in the database, or logged to console, or returned to the client.
**Why it happens:** Developers treat access tokens like session tokens. They are permanent API keys to a user's bank account.
**How to avoid:** Store ONLY in Supabase Vault. Never log tokens. Never send to client. The client only ever sees `public_token` (ephemeral) and `link_token` (short-lived).
**Warning signs:** Access token appearing in API response bodies, console.log statements, or non-Vault database columns.

### Pitfall 2: Webhook Endpoint Skipping Verification
**What goes wrong:** Webhook handler processes payloads without verifying the JWT signature, enabling spoofed webhooks.
**Why it happens:** Verification adds complexity; developers skip it "temporarily" and forget.
**How to avoid:** Verification is the FIRST thing the webhook handler does. If verification fails, return 401 immediately. No exceptions.
**Warning signs:** Webhook handler that reads `req.body` before calling verification function.

### Pitfall 3: Not Handling `SYNC_UPDATES_AVAILABLE` vs Initial Sync
**What goes wrong:** App waits for initial transactions but doesn't differentiate between initial sync and incremental updates.
**Why it happens:** The same webhook code (`SYNC_UPDATES_AVAILABLE`) fires for both initial data load and updates.
**How to avoid:** Check `initial_update_complete` and `historical_update_complete` fields in the webhook payload. Show loading/syncing UI until `initial_update_complete` is true.
**Warning signs:** Accounts showing "Synced" status before any transactions have actually loaded.

### Pitfall 4: Plaid Amount Sign Convention Mismatch
**What goes wrong:** Transactions show wrong signs — income appears as expenses, purchases appear as deposits.
**Why it happens:** Plaid uses positive for outflows (spending), which is opposite to many accounting conventions.
**How to avoid:** Define your sign convention early and document it. Convert during sync, not during display.
**Warning signs:** Net worth calculations that increase when user makes purchases.

### Pitfall 5: Missing Cursor Persistence on Partial Sync Failure
**What goes wrong:** Sync crashes mid-pagination, cursor isn't saved, entire sync must restart from scratch.
**Why it happens:** Cursor only saved at the end of the sync loop.
**How to avoid:** The cursor from `/transactions/sync` is valid at each page boundary. However, the Plaid docs note that encountering an error during pagination requires restarting from the beginning (TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION). Save cursor AFTER full loop completes.
**Warning signs:** Duplicate transactions appearing after failed syncs.

### Pitfall 6: Webhook Timeout Causing Retries
**What goes wrong:** Plaid retries webhook delivery because handler takes too long, causing duplicate processing.
**Why it happens:** Webhook handler does heavy processing (DB writes, API calls) synchronously before responding.
**How to avoid:** Acknowledge the webhook with 200 quickly. Use the webhook as a trigger to call `/transactions/sync` — the sync itself is idempotent.
**Warning signs:** Same webhook processed multiple times, duplicate transactions.

### Pitfall 7: OAuth Redirect URI Misconfiguration
**What goes wrong:** Plaid Link OAuth flow fails in production because redirect URI isn't configured.
**Why it happens:** Sandbox works without redirect URI for many institutions. Production requires it.
**How to avoid:** Register redirect URI in Plaid Dashboard. Set it in `/link/token/create` call. Must be HTTPS in production. Add to Plaid's Allowed redirect URIs list.
**Warning signs:** Works in sandbox, fails in production with OAuth-based banks.

### Pitfall 8: Not Handling Item Error States (ITEM_LOGIN_REQUIRED)
**What goes wrong:** User's bank session expires, but app keeps trying to sync and failing silently.
**Why it happens:** Bank connections can enter error state when bank requires re-authentication.
**How to avoid:** Handle `ITEM_ERROR` webhook type. When `error_code === 'ITEM_LOGIN_REQUIRED'`, set bank_connection status to 'error' and show the error badge. Use Plaid Link in "update mode" to re-authenticate.
**Warning signs:** Growing number of sync failures with no user-visible indication.

## Code Examples

### Plaid Client Setup
```typescript
// lib/plaid/client.ts
// Source: plaid-node Context7
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

export function createPlaidClient(): PlaidApi {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as 'sandbox' | 'production']
      || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
        'PLAID-SECRET': process.env.PLAID_SECRET!,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  return new PlaidApi(configuration);
}
```

### Link Token Creation API Route
```typescript
// app/api/money/plaid/create-link-token/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPlaidClient } from '@/lib/plaid/client';
import { Products, CountryCode } from 'plaid';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plaid = createPlaidClient();
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: user.id },
    client_name: 'BetterR.Me',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/money/plaid/webhook`,
    redirect_uri: process.env.PLAID_REDIRECT_URI,
  });

  return NextResponse.json({ link_token: response.data.link_token });
}
```

### Plaid Link React Component
```typescript
// components/money/plaid-link-button.tsx
// Source: react-plaid-link GitHub README
'use client';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from '@/components/ui/button';

interface PlaidLinkButtonProps {
  linkToken: string;
  onSuccess: (publicToken: string) => void;
}

export function PlaidLinkButton({ linkToken, onSuccess }: PlaidLinkButtonProps) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => onSuccess(publicToken),
    onExit: (err) => {
      if (err) {
        // Show error toast
      }
    },
  });

  return (
    <Button onClick={() => open()} disabled={!ready}>
      Connect Bank Account
    </Button>
  );
}
```

### Vault Secret Storage
```typescript
// lib/plaid/token-exchange.ts
import { createAdminClient } from '@/lib/supabase/admin';

async function storeAccessToken(bankConnectionId: string, accessToken: string): Promise<void> {
  const admin = createAdminClient();
  const secretName = `plaid_access_token_${bankConnectionId}`;

  // Store in Supabase Vault via SQL function
  const { error } = await admin.rpc('vault_create_secret', {
    secret: accessToken,
    name: secretName,
    description: `Plaid access token for bank connection ${bankConnectionId}`,
  });

  if (error) throw error;
}

async function getAccessToken(bankConnectionId: string): Promise<string> {
  const admin = createAdminClient();
  const secretName = `plaid_access_token_${bankConnectionId}`;

  const { data, error } = await admin
    .from('decrypted_secrets')  // vault.decrypted_secrets view
    .select('decrypted_secret')
    .eq('name', secretName)
    .single();

  if (error || !data) throw new Error(`Access token not found for ${bankConnectionId}`);
  return data.decrypted_secret;
}
```

**Note on Vault access:** The `vault.create_secret()` and `vault.decrypted_secrets` may need to be called via raw SQL (`admin.rpc()`) rather than the PostgREST API, because the vault schema is not exposed through PostgREST by default. This needs verification during implementation — a custom Postgres function may be needed as a wrapper.

### Vercel Cron Endpoint
```typescript
// app/api/cron/sync-transactions/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get all connected bank connections
  const { data: connections } = await admin
    .from('bank_connections')
    .select('id, vault_secret_name, sync_cursor')
    .eq('status', 'connected');

  // Sync each connection
  for (const conn of connections ?? []) {
    try {
      // Read decrypted access token, sync transactions
      // Update cursor on success, set error on failure
    } catch (error) {
      // Update bank_connection status to 'error'
    }
  }

  return NextResponse.json({ synced: connections?.length ?? 0 });
}
```

## Environment Variables Required

```env
# Plaid API (required)
PLAID_CLIENT_ID=           # From Plaid Dashboard
PLAID_SECRET=              # From Plaid Dashboard (use sandbox secret for dev)
PLAID_ENV=sandbox          # 'sandbox' | 'production'
PLAID_REDIRECT_URI=        # OAuth redirect URI (https:// in production)

# Vercel Cron (required for production)
CRON_SECRET=               # Random 16+ character string

# Already in project
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/transactions/get` (polling) | `/transactions/sync` (cursor-based) | 2022 | Incremental updates, no duplicate management needed |
| Legacy category taxonomy | Personal Finance Category v2 (PFCv2) | December 2025 | ~10% primary category accuracy improvement, new subcategories |
| Manual JWK management | `jose` library with `importJWK` | Ongoing | Simpler, more secure JWT verification |
| Environment-specific webhook URLs | Single webhook URL + environment field in payload | Current | Payload includes `environment` field to distinguish sandbox vs production |

**Deprecated/outdated:**
- `plaid.Client` (pre-v9.0.0): Use `Configuration` + `PlaidApi` from current SDK
- `/transactions/get` + `TRANSACTIONS_REMOVED` webhook: Use `/transactions/sync` + `SYNC_UPDATES_AVAILABLE`
- PFCv1 categories: Use PFCv2 (`personal_finance_category_version: 'v2'` or default for new customers after Dec 2025)

## Open Questions

1. **Supabase Vault access from PostgREST**
   - What we know: Vault provides `vault.create_secret()` and `vault.decrypted_secrets` view. These work via SQL.
   - What's unclear: Whether the Supabase JS client can call these directly or if we need custom Postgres wrapper functions exposed via `admin.rpc()`.
   - Recommendation: Create wrapper functions in the migration (e.g., `create_plaid_secret(name, value)` and `get_plaid_secret(name)`) that call the Vault functions. These can be called via `admin.rpc()`. Test during implementation.

2. **Plaid OAuth Redirect URI for Next.js**
   - What we know: OAuth banks require a redirect_uri that Plaid opens after bank auth. Must be registered in Plaid Dashboard.
   - What's unclear: Exact page structure for the redirect handler in Next.js App Router. The `react-plaid-link` package handles `receivedRedirectUri` prop.
   - Recommendation: Create a `/money/accounts/oauth` page that re-initializes Plaid Link with `receivedRedirectUri`. Test with OAuth-enabled sandbox institutions.

3. **Cash Account Creation Timing**
   - What we know: User decision says manual entries can be assigned to a "Cash" account. This is an accounts row with `bank_connection_id = NULL`.
   - What's unclear: Should the Cash account be auto-created when the household is created, or only when the user first attempts a manual entry?
   - Recommendation: Lazy creation — create the Cash account when the user first opens the manual entry dialog and no Cash account exists. Consistent with the existing `resolveHousehold()` lazy-creation pattern.

4. **Sign Convention for Amounts**
   - What we know: Plaid uses positive for outflows. Project needs a clear convention for `amount_cents` in the transactions table.
   - What's unclear: Which convention to adopt project-wide.
   - Recommendation: Use accounting convention (negative = outflow/expense, positive = inflow/income). Invert Plaid's sign during sync. Document clearly in types.

## Sources

### Primary (HIGH confidence)
- `/websites/plaid` (Context7) - Link token creation, public token exchange, /transactions/sync API, webhook verification process, SYNC_UPDATES_AVAILABLE webhook format
- `/plaid/plaid-node` (Context7) - PlaidApi client configuration, environment setup, token exchange pattern
- `/panva/jose` (Context7) - `jwtVerify()`, `importJWK()`, `createRemoteJWKSet()`, `decodeProtectedHeader()` — all verified for ES256 support
- `/websites/supabase` (Context7) - `vault.create_secret()`, `vault.decrypted_secrets` view, encryption details
- [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault) - Official Vault documentation, function signatures, access control
- [react-plaid-link npm](https://www.npmjs.com/package/react-plaid-link) - v4.1.1, `usePlaidLink` hook API

### Secondary (MEDIUM confidence)
- [Plaid Webhook Verification Docs](https://plaid.com/docs/api/webhooks/webhook-verification/) - JWT/ES256 verification process, 5-minute iat check, SHA-256 body hash
- [Plaid Transaction Webhooks](https://plaid.com/docs/transactions/webhooks/) - SYNC_UPDATES_AVAILABLE fields, initial_update_complete/historical_update_complete
- [Plaid Sandbox Test Credentials](https://plaid.com/docs/sandbox/test-credentials/) - user_good/pass_good, 2FA code 1234
- [Vercel Cron Docs](https://vercel.com/docs/cron-jobs/quickstart) - vercel.json configuration, CRON_SECRET bearer token
- [Plaid Items API](https://plaid.com/docs/api/items/) - /item/remove for disconnection
- [Plaid Accounts API](https://plaid.com/docs/api/accounts/) - /accounts/get for balance retrieval, account types

### Tertiary (LOW confidence)
- Plaid amount sign convention details — verified via multiple sources but edge cases (credit card payments, refunds) need testing with real Plaid sandbox data
- Vault PostgREST access pattern — needs implementation-time verification; may require SQL wrapper functions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 and official docs, versions confirmed on npm
- Architecture: HIGH - Token flow, webhook verification, cursor sync all documented in Plaid's official guides with code examples
- Pitfalls: HIGH - Common issues well-documented across Plaid community, GitHub issues, and official troubleshooting guides
- Database schema: MEDIUM - Extension of existing Phase 18 tables is straightforward, but Vault access pattern via PostgREST needs verification
- Sign convention: MEDIUM - Plaid's convention is documented but the project-wide decision needs to be locked during planning

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days — Plaid API is stable, jose and react-plaid-link update infrequently)
