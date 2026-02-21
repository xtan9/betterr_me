# Technology Stack: Money Tracking Features

**Project:** BetterR.Me v4.0 Money Tracking
**Researched:** 2026-02-21
**Scope:** Stack ADDITIONS only for money tracking. Existing stack (Next.js 16, React 19, Supabase auth+DB, SWR, shadcn/ui, Tailwind CSS 3, react-hook-form, zod v3, next-intl, date-fns, etc.) is validated and unchanged.

---

## Context: Divergence from moneyy.me Research

The moneyy.me research (2026-02-20) assumed a greenfield project and recommended Neon + Drizzle + Better Auth + TanStack Query + Zustand + Tailwind v4. BetterR.Me already has a mature, deployed stack. This document identifies ONLY what must be ADDED. The following moneyy.me recommendations are explicitly **NOT adopted**:

| moneyy.me Recommendation | BetterR.Me Decision | Rationale |
|--------------------------|---------------------|-----------|
| Neon Postgres | **Keep Supabase Postgres** | Already deployed with RLS, auth, 20+ tables, 1200+ tests. Migration cost is prohibitive and unnecessary. |
| Drizzle ORM | **Keep Supabase JS client** | Existing DB layer uses `SupabaseClient` with typed class pattern (HabitsDB, TasksDB, etc.). Adding Drizzle means two ORMs in one codebase. |
| Better Auth | **Keep Supabase Auth** | Already integrated with proxy middleware, session management, RLS policies. Better Auth solves a problem we do not have. |
| TanStack Query | **Keep SWR** | 26 files already use SWR with established patterns (optimistic updates, date-keyed cache). Switching data fetching libraries mid-project adds risk for no gain. |
| Zustand | **Not needed** | SWR handles server state. React useState/useReducer handles local UI state. Same decision as v3.0 kanban milestone. |
| Tailwind CSS v4 | **Keep Tailwind CSS v3** | 174-line tailwind.config.ts with 56+ custom design tokens. Migration to v4 (CSS-first config) is a separate effort, not part of money features. |
| Zod v4 | **Keep Zod v3** | 12+ validation schemas already use Zod v3 API. Zod v4 has breaking changes. Upgrade separately. |
| Stripe | **Not in v4.0 scope** | PROJECT.md explicitly states "No Stripe/freemium in this milestone." |
| Resend / React Email | **Not in v4.0 scope** | Email notifications are P2 features. Add when needed. |

---

## Recommended Stack Additions

### Banking Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `plaid` | ^41.1.0 | Server-side Plaid API client | Official Node.js SDK. Monthly updates. Handles token exchange, /transactions/sync, webhook verification, account balance queries. 12,000+ US institutions. Required by PROJECT.md. | HIGH |
| `react-plaid-link` | ^4.1.1 | Client-side Plaid Link modal | Official React hook (`usePlaidLink`) for bank account connection OAuth flow. Drop-in integration. TypeScript definitions included. | HIGH |

**Integration with Supabase:**
- Plaid access tokens stored encrypted in Supabase using `vault.secrets` (Supabase Vault extension) -- NOT plain text columns
- Plaid Item metadata (institution, last sync cursor, connection status) stored in a `plaid_items` table with RLS policies scoped to `household_id`
- Transaction data from Plaid normalized into our `transactions` table schema, not stored as raw Plaid JSON

**Sources:** [plaid npm](https://www.npmjs.com/package/plaid) v41.1.0, [react-plaid-link npm](https://www.npmjs.com/package/react-plaid-link) v4.1.1, [Plaid Link Web SDK docs](https://plaid.com/docs/link/web/)

### Money Arithmetic

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `decimal.js` | ^10.6.0 | Precise decimal arithmetic for all currency | JavaScript floats break: `0.1 + 0.2 !== 0.3`. Every budget calculation, transaction sum, balance check, and net worth computation MUST use decimal.js. Store as integers (cents) in Postgres, convert with decimal.js in application layer. | HIGH |

**Integration pattern:**
```typescript
import Decimal from "decimal.js";

// All money amounts stored as integer cents in DB
// Application layer converts: 1599 cents -> Decimal("15.99")
function centsToDecimal(cents: number): Decimal {
  return new Decimal(cents).dividedBy(100);
}

function decimalToCents(amount: Decimal): number {
  return amount.times(100).round().toNumber();
}

// Budget remaining calculation
function budgetRemaining(budgetCents: number, spentCents: number): Decimal {
  return centsToDecimal(budgetCents).minus(centsToDecimal(spentCents));
}
```

**Source:** [decimal.js npm](https://www.npmjs.com/package/decimal.js) v10.6.0, [decimal.js API docs](https://mikemcl.github.io/decimal.js/)

### Data Visualization (Charts)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `recharts` | ^3.7.0 | Charts for spending breakdowns, budget progress, net worth trends | shadcn/ui's Chart component is built on Recharts. BetterR.Me already has chart color tokens (`--chart-1` through `--chart-5`) in the Tailwind config. Zero additional theming work. Dark mode works automatically through shadcn theme integration. | HIGH |

**Integration with existing stack:**
- Install Recharts, then add shadcn/ui Chart component: `npx shadcn@latest add chart`
- Chart colors already defined in `tailwind.config.ts` (`chart["1"]` through `chart["5"]`)
- shadcn Chart component provides `ChartContainer`, `ChartTooltip`, `ChartLegend` wrappers
- All chart components are client components (`"use client"`) -- standard App Router pattern
- Calm Finance design: use muted color palette (blues, grays, soft greens) not aggressive red/green

**Chart types needed:**
| Chart | Recharts Component | Purpose |
|-------|-------------------|---------|
| Spending by category | `PieChart` / `RadialBarChart` | Monthly spending breakdown |
| Spending over time | `AreaChart` / `BarChart` | Trend visualization |
| Budget progress | `BarChart` (horizontal) | Category budget vs. spent |
| Net worth trend | `LineChart` / `AreaChart` | Assets minus liabilities over time |
| Cash flow | `BarChart` (stacked) | Income vs. expenses by month |
| Savings goal progress | `RadialBarChart` | Visual progress toward goal |

**Source:** [recharts npm](https://www.npmjs.com/package/recharts) v3.7.0, [shadcn/ui Charts](https://ui.shadcn.com/docs/components/radix/chart)

### Webhook Verification

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `jose` | ^6.1.3 | JWT/JWK verification for Plaid webhooks | Plaid signs outgoing webhooks with ES256 JWTs. The `jose` library verifies these signatures using JWKs from Plaid's `/webhook_verification_key/get` endpoint. Zero dependencies, Web Crypto API based, works in Node.js and Edge Runtime. Plaid's own docs reference this library pattern. | HIGH |

**Why `jose` and not `jsonwebtoken`:**
- `jose` uses Web Crypto API (works in Edge Runtime and serverless)
- `jsonwebtoken` uses Node.js `crypto` module (fails in Edge Runtime)
- `jose` supports ES256 algorithm natively
- `jose` has JWK import built-in (`importJWK`)

**Webhook verification pattern:**
```typescript
import { jwtVerify, importJWK } from "jose";

async function verifyPlaidWebhook(
  body: string,
  plaidVerificationHeader: string
): Promise<boolean> {
  // 1. Decode JWT header to get key_id
  // 2. Fetch JWK from Plaid: /webhook_verification_key/get
  // 3. Import JWK and verify JWT with ES256
  // 4. Verify iat is within 5 minutes (replay protection)
  // 5. Verify SHA-256 of body matches request_body_sha256 claim
  const key = await importJWK(jwk, "ES256");
  const { payload } = await jwtVerify(plaidVerificationHeader, key);
  // ... verify claims
}
```

**Source:** [jose npm](https://www.npmjs.com/package/jose) v6.1.3, [Plaid webhook verification docs](https://plaid.com/docs/api/webhooks/webhook-verification/)

### CSV Import

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `papaparse` | ^5.5.3 | CSV parsing for bank statement import | Battle-tested CSV parser (10M+ weekly downloads). Handles malformed input, streaming large files, header detection, type inference. No dependencies. Works in browser (Web Workers) and Node.js. CSV import is the cost-management strategy -- users who do not want Plaid can still import bank data. | HIGH |
| `@types/papaparse` | ^5.3.x | TypeScript definitions | Type definitions for papaparse. | HIGH |

**Why CSV import matters architecturally:**
- Validates the core experience without Plaid API costs
- Free-tier users can still import bank data manually
- Transaction source abstraction: the app does not care whether data came from Plaid or CSV
- Provides a fallback if Plaid connection fails or user's bank is unsupported

**Source:** [papaparse npm](https://www.npmjs.com/package/papaparse) v5.5.3

### URL State for Filters

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `nuqs` | ^2.x | Type-safe URL search params state | Transaction list needs shareable/bookmarkable filter states (date range, category, account, search term). `nuqs` provides a `useState`-like API synced to URL params. 6 kB gzipped. Next.js App Router native support. No conflict with SWR -- `nuqs` manages URL state, SWR manages server data cache. | MEDIUM |

**Why `nuqs` and not manual `useSearchParams`:**
- Type-safe parsers for dates, numbers, enums (not just strings)
- Batched URL updates (multiple params in one history entry)
- Server Component access via `createSearchParamsCache`
- Shallow routing (no server round-trip on filter change)
- SWR keys can derive from `nuqs` state for automatic refetch on filter change

**Integration pattern:**
```typescript
import { useQueryState, parseAsString, parseAsIsoDate } from "nuqs";

// In transaction list component
const [category, setCategory] = useQueryState("category", parseAsString);
const [dateFrom, setDateFrom] = useQueryState("from", parseAsIsoDate);
const [dateTo, setDateTo] = useQueryState("to", parseAsIsoDate);

// SWR key derives from URL state
const { data } = useSWR(
  `/api/transactions?category=${category}&from=${dateFrom}&to=${dateTo}`,
  fetcher,
  { keepPreviousData: true }
);
```

**Source:** [nuqs docs](https://nuqs.dev), [nuqs npm](https://www.npmjs.com/package/nuqs)

---

## Background Jobs Strategy

### Supabase pg_cron + Edge Functions (NOT Inngest)

The moneyy.me research recommended Inngest for background jobs. For BetterR.Me, **use Supabase's native pg_cron + Edge Functions** instead.

| Approach | Why |
|----------|-----|
| **Supabase pg_cron** | Already included in Supabase (no additional service). Triggers Edge Functions or database functions on a schedule. Supports sub-minute intervals. No vendor addition. |
| **Supabase Edge Functions** | Deno-based serverless functions hosted alongside your database. Can call Plaid's `/transactions/sync`, process webhooks, run categorization. No cold start issues since they run on Supabase's infrastructure, not Vercel. |
| **NOT Inngest** | Adding Inngest means another vendor, another billing relationship, another failure point. Supabase pg_cron + Edge Functions handle the same use cases (scheduled sync, webhook processing) without leaving the Supabase ecosystem. |

**Background job use cases:**
1. **Scheduled transaction sync** -- pg_cron triggers Edge Function every 4-6 hours to call `/transactions/sync` for each connected Plaid Item
2. **Webhook processing** -- Plaid webhook hits a Next.js API route, which writes a job to a `sync_jobs` table, pg_cron picks it up
3. **Bill detection** -- After new transactions sync, Edge Function runs bill/subscription detection logic
4. **Stale connection cleanup** -- pg_cron checks for Items that have not synced in 7+ days and marks them for re-auth

**Fallback:** If Supabase Edge Functions prove too limited (execution time, memory), Inngest (`^3.52.3`, free tier: 50K executions/month) is the escape hatch. But start with Supabase-native.

**Sources:** [Supabase Cron docs](https://supabase.com/docs/guides/cron), [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase Cron module](https://supabase.com/modules/cron)

---

## Supabase-Specific Patterns for Money Features

### Supabase Vault for Plaid Token Encryption

Plaid access tokens grant permanent read access to bank accounts. They MUST be encrypted at rest.

**Supabase Vault** is a Postgres extension that encrypts secrets at rest using Transparent Column Encryption. It is already available in every Supabase project -- no additional library needed.

```sql
-- Store Plaid access token in Vault
SELECT vault.create_secret('plaid_access_token_item_123', 'access-sandbox-xxx-yyy');

-- Retrieve decrypted token (only via SQL function, never exposed to client)
SELECT decrypted_secret FROM vault.decrypted_secrets
WHERE name = 'plaid_access_token_item_123';
```

**Why Vault and not application-layer encryption (e.g., AES-256 in Node.js):**
- Vault encryption key is managed by Supabase, separate from database data
- Backups and replication streams preserve encryption
- No encryption key management in application code
- No key rotation logic to implement
- Works with RLS -- server-side functions access tokens, clients never see them

**Source:** [Supabase Vault docs](https://supabase.com/docs/guides/database/vault), [Supabase Vault blog](https://supabase.com/blog/supabase-vault)

### Supabase RLS for Household Isolation

Every money table (`transactions`, `accounts`, `budgets`, `bills`, `savings_goals`, `plaid_items`) gets a `household_id` column with RLS policies.

**Pattern:** Use Supabase Auth `auth.uid()` to look up the user's `household_id` from a `household_members` table, then filter all queries by that household.

```sql
-- RLS policy for transactions table
CREATE POLICY "Users can view their household's transactions"
ON transactions FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = auth.uid()
  )
);
```

**Defense-in-depth:** The DB layer classes (e.g., `TransactionsDB`) also filter by `household_id` in application code. RLS is the safety net, not the only layer.

**Source:** [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [Multi-tenant RLS patterns](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/)

### Supabase Realtime for Household Sync

When one partner adds a transaction or updates a budget, the other partner's view should update. Supabase Realtime's Postgres Changes feature listens to table changes and pushes them to authorized clients.

**No additional library needed** -- `@supabase/supabase-js` already includes Realtime support. SWR cache invalidation triggered by Realtime events:

```typescript
// Listen for transaction changes in household
const channel = supabase
  .channel("household-transactions")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "transactions",
      filter: `household_id=eq.${householdId}` },
    () => {
      // Invalidate SWR cache to refetch
      mutate("/api/transactions");
    }
  )
  .subscribe();
```

**Source:** [Supabase Realtime docs](https://supabase.com/docs/guides/realtime)

---

## Existing Stack Serving Money Features

These technologies are already installed and require NO additions:

| Existing Technology | How It Serves Money Features |
|---------------------|------------------------------|
| **Supabase (auth + DB)** | User authentication, Postgres database, RLS policies, Vault for token encryption, Realtime for household sync, Edge Functions for background jobs, pg_cron for scheduled sync |
| **SWR** | Fetching transactions, budgets, accounts, goals. Optimistic updates on categorization. `keepPreviousData: true` for filter changes. Cache invalidation on Supabase Realtime events. |
| **react-hook-form + zod** | Budget creation forms, savings goal forms, manual transaction entry, CSV column mapping, category rule editing |
| **shadcn/ui + Radix UI** | Card, Table, Dialog, Select, Badge, Progress, Tabs, Sheet, Popover, Calendar (react-day-picker already installed), Skeleton -- all needed for money UI |
| **next-intl** | All money feature strings in en, zh, zh-TW. Currency formatting uses `Intl.NumberFormat` (built-in), not a library. |
| **next-themes** | Dark mode for money views. Calm Finance color tokens extend existing design token system. |
| **date-fns** | Transaction date formatting, date range calculations, bill due date logic, month boundaries for budget periods. Already installed at ^4.1.0. |
| **lucide-react** | Icons for accounts, categories, budgets, bills, goals, trends. Already has finance-related icons (Wallet, CreditCard, PiggyBank, TrendingUp, Receipt, etc.) |
| **sonner** | Toast notifications for sync completion, budget alerts, goal milestones. |
| **Tailwind CSS 3** | All money feature layout and styling. Extend with Calm Finance color tokens in CSS variables. |
| **Vitest + Playwright** | Unit/integration tests for money logic, E2E tests for Plaid Link flow, budget creation, transaction filtering. |
| **jszip** | Already installed -- can extend data export to include financial data alongside habit data. |

---

## Installation

```bash
# Banking integration
pnpm add plaid react-plaid-link

# Money arithmetic (CRITICAL -- never use native JS floats for currency)
pnpm add decimal.js

# Charts (then: npx shadcn@latest add chart)
pnpm add recharts

# Webhook verification (Plaid ES256 JWT)
pnpm add jose

# CSV import
pnpm add papaparse
pnpm add -D @types/papaparse

# URL state for transaction filters (optional, can defer to Phase 3)
pnpm add nuqs
```

**Total new runtime dependencies: 6** (plaid, react-plaid-link, decimal.js, recharts, jose, papaparse)
**Total new dev dependencies: 1** (@types/papaparse)
**Optional: 1** (nuqs -- can be deferred)

No new testing libraries needed -- existing Vitest + Testing Library + Playwright cover all needs.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Banking API | Plaid | MX / Finicity | Plaid has 12,000+ US institutions, best documentation, largest developer community. MX/Finicity are viable if Plaid costs become prohibitive at scale. |
| Money math | decimal.js | dinero.js | dinero.js is higher-level (money objects with currency), but BetterR.Me is US-only initially. decimal.js is simpler, sufficient, and more widely used. Upgrade to dinero.js if multi-currency support is added. |
| Money math | decimal.js | big.js | decimal.js handles both arbitrary precision AND scientific notation. big.js is slightly smaller but less capable. The size difference is negligible. |
| Charts | Recharts (via shadcn) | Tremor | Tremor wraps Recharts but adds an abstraction layer. Since shadcn/ui Charts already wrap Recharts with our design tokens, Tremor is redundant. |
| Charts | Recharts (via shadcn) | Chart.js / react-chartjs-2 | Chart.js uses canvas (not SVG). Worse accessibility, harder to style with Tailwind/CSS variables, less React-idiomatic. Recharts is the shadcn/ui default. |
| Charts | Recharts (via shadcn) | Nivo | Nivo has SSR support but is heavier and less customizable. Recharts wins because shadcn/ui integrates it directly. |
| CSV parsing | papaparse | csv-parse | csv-parse is Node.js only. papaparse works in both browser (for client-side preview) and Node.js (for server-side processing). |
| Webhook JWT | jose | jsonwebtoken | jsonwebtoken uses Node.js `crypto` module, which fails in Vercel Edge Runtime. jose uses Web Crypto API -- works everywhere. |
| Background jobs | Supabase pg_cron + Edge Functions | Inngest | Adding another vendor is unnecessary when Supabase provides native scheduling. Inngest is the fallback if Edge Functions prove limited. |
| Background jobs | Supabase pg_cron + Edge Functions | Vercel Cron | Vercel Cron has a 10s execution limit on Hobby plan (30s on Pro). Plaid transaction sync can take longer. Supabase Edge Functions have 150s default timeout. |
| URL state | nuqs | Manual useSearchParams | useSearchParams returns raw strings, requires manual parsing/serialization, no batching, no type safety. nuqs solves all of these. |
| Data fetching | Keep SWR | TanStack Query | 26 files already use SWR. Migration cost is high, benefit is marginal. SWR handles all needed patterns (optimistic updates, keepPreviousData, revalidation). |
| State management | Keep React state | Zustand | Same conclusion as v3.0: SWR for server state, React state for local UI. No global client state complex enough to justify a state library. |
| ORM | Keep Supabase client | Drizzle | Running two ORMs in one project is a maintenance nightmare. The Supabase client with typed DB classes works. Financial queries (aggregations, date ranges) can use `.rpc()` for Postgres functions when the query builder is insufficient. |

---

## What NOT to Add

| Do NOT Add | Why | What to Use Instead |
|------------|-----|---------------------|
| Drizzle ORM | Would create two data access layers in one codebase. All existing DB classes use Supabase client. | Supabase JS client + typed DB classes (existing pattern) |
| Better Auth | Supabase Auth is already deployed, tested, integrated with RLS. Replacing it gains nothing. | Supabase Auth (existing) |
| TanStack Query | 26 files use SWR. Migration mid-project is risky for zero gain. | SWR (existing) |
| Zustand | No complex global client state justifies it. | React useState/useReducer (existing) |
| Tailwind CSS v4 | Massive config migration (56+ tokens, 174-line config). Separate milestone. | Tailwind CSS v3 (existing) |
| Zod v4 | Breaking changes from v3. 12+ validation schemas would need updating. Separate migration. | Zod v3 (existing) |
| Stripe | Explicitly out of scope for v4.0. "No Stripe/freemium in this milestone." | Nothing -- all features free in v4.0 |
| Resend / React Email | Email notifications are P2. Add when shipping bill reminders. | Nothing for now |
| Inngest (initially) | Supabase pg_cron + Edge Functions cover same use cases without adding a vendor. | Supabase Cron + Edge Functions |
| framer-motion | Chart animations handled by Recharts. Page transitions not needed. | Recharts built-in animations + Tailwind transitions |
| dinero.js | Overkill for single-currency (USD). decimal.js is sufficient. | decimal.js |

---

## Version Compatibility Matrix

| New Package | Compatible With | Notes |
|-------------|-----------------|-------|
| plaid ^41.1.0 | Node.js 18+ | Monthly releases. Works with Next.js API routes. |
| react-plaid-link ^4.1.1 | React 18-19 | TypeScript included. `usePlaidLink` hook. |
| decimal.js ^10.6.0 | Any JS runtime | Zero dependencies. Works everywhere. |
| recharts ^3.7.0 | React 18-19 | shadcn/ui Chart component wraps Recharts. |
| jose ^6.1.3 | Web Crypto API (Node 18+, Edge Runtime) | Zero dependencies. Works in Vercel serverless AND edge. |
| papaparse ^5.5.3 | Browser + Node.js | @types/papaparse for TypeScript. |
| nuqs ^2.x | Next.js >=14.2.0, React 18-19 | Requires NuqsAdapter in root layout. |

All packages are compatible with the existing stack: Next.js 16.1.6, React 19, TypeScript 5, pnpm 10.11.

---

## New Database Tables (Supabase Migrations)

No new libraries -- these are Supabase migration files using the existing migration pattern:

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `households` | id, name, created_by, created_at | Household entity. Every money table references this. |
| `household_members` | household_id, user_id, role, joined_at | Maps users to households. Roles: owner, member. |
| `plaid_items` | id, household_id, institution_id, institution_name, status, consent_expiration, last_synced_at, sync_cursor | Plaid connection metadata. Access token stored in Vault, NOT here. |
| `accounts` | id, household_id, plaid_item_id (nullable), name, type, subtype, balance_cents, currency, visibility (mine/theirs/ours), is_manual | Financial accounts -- linked via Plaid or manually created. |
| `transactions` | id, household_id, account_id, plaid_transaction_id (nullable), amount_cents, date, name, merchant_name, category, subcategory, is_pending, source (plaid/csv/manual) | All transactions regardless of source. |
| `budgets` | id, household_id, category, amount_cents, period (monthly), start_date | Budget per category per month. |
| `bills` | id, household_id, name, amount_cents, frequency, next_due_date, account_id, is_auto_detected | Recurring bills and subscriptions. |
| `savings_goals` | id, household_id, name, target_cents, current_cents, target_date, icon | Savings goals with progress tracking. |
| `category_rules` | id, household_id, pattern (merchant name match), category, subcategory | User-defined auto-categorization rules. |

All tables include `household_id` with RLS policies from day one.

---

## Sources

### Package Versions (HIGH confidence -- verified via npm registry)
- [plaid npm v41.1.0](https://www.npmjs.com/package/plaid) -- published 2026-02-03
- [react-plaid-link npm v4.1.1](https://www.npmjs.com/package/react-plaid-link) -- published 2025-12
- [decimal.js npm v10.6.0](https://www.npmjs.com/package/decimal.js) -- published 2025-07
- [recharts npm v3.7.0](https://www.npmjs.com/package/recharts) -- published 2026-01
- [jose npm v6.1.3](https://www.npmjs.com/package/jose) -- published 2025-11
- [papaparse npm v5.5.3](https://www.npmjs.com/package/papaparse) -- published 2025-05
- [nuqs npm](https://www.npmjs.com/package/nuqs) -- v2.x series
- [inngest npm v3.52.3](https://www.npmjs.com/package/inngest) -- fallback option

### Integration Patterns (HIGH confidence -- official documentation)
- [Plaid Link Web SDK](https://plaid.com/docs/link/web/) -- React integration
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) -- JWT/ES256 pattern
- [Plaid Transactions Sync](https://plaid.com/docs/transactions/) -- Cursor-based sync
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) -- Token encryption at rest
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) -- Multi-tenant isolation
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) -- Household sync
- [Supabase Cron](https://supabase.com/docs/guides/cron) -- Scheduled background jobs
- [Supabase Edge Functions Scheduling](https://supabase.com/docs/guides/functions/schedule-functions) -- Cron + Edge Functions
- [shadcn/ui Charts](https://ui.shadcn.com/docs/components/radix/chart) -- Recharts integration
- [nuqs docs](https://nuqs.dev) -- URL state management

### Architecture Patterns (MEDIUM confidence -- community sources)
- [Multi-tenant RLS on Supabase](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) -- Household isolation
- [Supabase Vault tutorial](https://makerkit.dev/blog/tutorials/supabase-vault) -- Secret storage
- [Background jobs with Supabase](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions) -- Job runner pattern
- [Inngest + Vercel + Supabase](https://www.inngest.com/blog/vercel-integration) -- Fallback option

---
*Stack research for: BetterR.Me v4.0 Money Tracking*
*Researched: 2026-02-21*
*Scope: Additions only -- existing stack unchanged*
