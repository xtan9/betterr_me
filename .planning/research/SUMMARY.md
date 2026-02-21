# Project Research Summary

**Project:** BetterR.Me v4.0 Money Tracking
**Domain:** Personal finance module added to an existing habit/task tracking web app
**Researched:** 2026-02-21
**Confidence:** HIGH

## Executive Summary

BetterR.Me v4.0 adds personal finance as a first-class feature module alongside the existing Habits and Tasks domains. Unlike a greenfield finance app, every technology and architectural decision must respect the existing deployed codebase — Next.js 16 App Router, Supabase Postgres + Auth, SWR, shadcn/ui, react-hook-form + Zod, next-intl — which remains unchanged. The only net-new dependencies are six packages: `plaid` and `react-plaid-link` for bank account connectivity, `decimal.js` for safe currency arithmetic, `recharts` (via shadcn Charts) for data visualization, `jose` for Plaid webhook JWT verification, and `papaparse` for CSV import as an alternative data-ingestion path. All new code is additive and parallel to existing features, touching only six existing files (sidebar nav, DB barrel exports, type definitions, three i18n locale files, and global CSS tokens).

The recommended architecture is a household-scoped data model where every money table carries a `household_id` column with RLS policies that gate access through a `household_members` join table — enabling the couples/shared-household differentiator from day one without retrofitting. Existing habits and tasks tables remain strictly `user_id`-scoped and are never modified. The data pipeline flows from Plaid (bank sync via webhooks and Vercel Cron) or CSV import into a normalized `transactions` table, which drives categorization, budgets, bills, net worth, and projections in sequence. An admin/service-role Supabase client handles background sync contexts where no user session exists. The "Calm Finance" design philosophy — muted color palette, forward-looking language, no anxiety-inducing red/green — is a cross-cutting constraint applied to all money UI components.

The principal risks are all architectural and must be resolved in Phase 1 before any UI is built: the household RLS model must be finalized, money amounts must be stored as integer cents (not PostgreSQL `numeric`) to avoid silent precision loss through the Supabase JavaScript client, and the Plaid webhook endpoint requires a separate security path (service-role client + JWT signature verification) that bypasses the standard Supabase auth guard used by all existing API routes. Deferring any of these three decisions introduces expensive retroactive data migrations and security exposure.

---

## Key Findings

### Recommended Stack

The existing stack handles nearly every money feature requirement without additions. Supabase provides auth, Postgres, RLS, Vault (for Plaid token encryption), Realtime (for cross-user household cache invalidation), Edge Functions, and pg_cron (for scheduled transaction sync). SWR handles client-side data fetching with established patterns. shadcn/ui + Radix already has all required UI primitives. The six new packages are targeted additions with no overlap or conflict.

**Core new technologies:**
- `plaid` ^41.1.0 + `react-plaid-link` ^4.1.1 — bank account connectivity via Plaid Link OAuth flow and server-side API; 12,000+ US institutions
- `decimal.js` ^10.6.0 — all currency arithmetic; integer cents stored in DB, decimal.js used at display/parse boundaries only; avoids the `0.1 + 0.2 !== 0.3` float problem
- `recharts` ^3.7.0 — charts via shadcn/ui Chart component; dark mode and design tokens already wired up; zero additional theming work
- `jose` ^6.1.3 — Plaid webhook JWT/ES256 signature verification; works in Vercel Edge and Node.js runtimes (unlike `jsonwebtoken` which requires Node.js `crypto`)
- `papaparse` ^5.5.3 — CSV import for users unwilling or unable to use Plaid; works in browser and Node.js
- `nuqs` ^2.x (optional, deferrable to Phase 3) — URL state for transaction list filters; type-safe, batched, Next.js App Router native

Background jobs use Supabase pg_cron + Edge Functions (not Inngest), keeping everything in the existing Supabase ecosystem. Vercel Cron (`vercel.json` cron config) is the simpler starting point. The Plaid Node SDK must run in Node.js runtime routes, not Edge Runtime (Plaid depends on Axios, which does not work in Edge).

For the full stack rationale, alternatives considered, and version compatibility matrix, see `.planning/research/STACK.md`.

### Expected Features

The finance module is competitor-benchmarked against Monarch Money, YNAB, Copilot, Honeydue, Rocket Money, and PocketGuard. BetterR.Me's unique positioning is the only product combining habit tracking, task management, and personal finance with ground-up couples support, a forward-looking dashboard, and anxiety-aware design.

**Must have (table stakes) — users expect these or the money section feels broken:**
- Plaid bank account connection with webhook-driven transaction sync
- Transaction list with search, filter (date, category, account, keyword), and cursor-based pagination
- Auto-categorization using Plaid PFCv2 + household merchant-name rule system with manual override
- Custom categories (household-scoped, shareable between partners)
- Monthly budgets per category with progress bars and optional rollover
- Spending breakdown charts (donut by category, bar over time)
- Bill and subscription auto-detection from transaction patterns
- Savings goals with visual progress and deadline projections
- Net worth tracking (assets minus liabilities, updated on each sync)
- CSV/manual import as an alternative data input path (no Plaid dependency)
- Account management page (connected accounts, balances, sync status, disconnect)
- "Money" top-level sidebar navigation item

**Should have (differentiators — set BetterR.Me apart):**
- Couples/household multi-user with partner invitation flow
- Per-account privacy controls (mine / ours / hidden)
- Future-first dashboard (forward-looking: available balance until next paycheck, upcoming bills, projected end-of-month balance)
- Contextual AI insights embedded in relevant pages (not a chatbot)
- "Calm Finance" design language (muted palette, forward-looking language, no aggressive red/green)
- Smart bill calendar with projected balance overlay
- Integrated money summary card on the existing habit/task dashboard

**Defer to v5+ milestones:**
- Partner spending comparisons (requires mature couples usage data)
- Advanced reporting (custom date ranges, year-over-year, tax categories)
- Anxiety-aware onboarding wizard (optimize after watching real usage)
- Email notifications for bills and budget alerts
- Stripe billing / freemium tier (explicitly out of scope per PROJECT.md)
- Receipt OCR, investment advisory, bill negotiation — explicitly anti-features

For the full feature dependency graph, prioritization matrix, and competitor comparison table, see `.planning/research/FEATURES.md`.

### Architecture Approach

Money tracking is a parallel feature domain, architecturally additive and non-invasive to existing code. The core pattern: new `app/money/*` pages, new `app/api/money/*` and `app/api/plaid/*` routes, new `lib/db/` classes, new `lib/plaid/` and `lib/money/` utility directories, and new Supabase migrations — all following identical conventions to existing HabitsDB/TasksDB/SWR patterns. Existing feature code is not modified except the six files listed in the summary above.

**Major components:**
1. **Household model** (`households`, `household_members`, `resolveHousehold()` helper) — authorization bridge between Supabase auth users and household-scoped money data; every money table references `household_id`; lazy-created on first money feature access
2. **Plaid Integration Layer** (`lib/plaid/`: client, link-token, token-exchange, sync, webhook-verify, encryption) — the only external API integration in the codebase; access tokens encrypted via Supabase Vault or AES-256-GCM before storage; three-phase flow (create link_token, open Plaid Link in browser, exchange public_token server-side)
3. **Background Sync** (Vercel Cron → `/api/cron/sync-transactions` using service-role admin client) — cursor-based, idempotent, handles interrupted syncs by resuming from stored cursor; transaction sync separated from token exchange to avoid serverless timeout
4. **Money DB Classes** (`AccountsDB`, `TransactionsDB`, `BudgetsDB`, `BillsDB`, `GoalsDB`, `CategoriesDB`, `PlaidItemsDB`, `HouseholdsDB`, `MerchantRulesDB`) — household-scoped via `household_id` derived from server-side `resolveHousehold()`, never from client input; same constructor pattern as HabitsDB/TasksDB
5. **Calm Finance design tokens** (`--money-*` CSS variables in `globals.css`) — muted teal/amber palette for money UI, separate from existing `--status-*` tokens used in habits/tasks
6. **Supabase Admin Client** (`lib/supabase/admin.ts`) — service-role client bypassing RLS; used only in cron routes and webhook handlers, never in user-facing API routes

For the complete new file inventory (~50 new files), full database schema SQL, RLS policy patterns, and detailed build order, see `.planning/research/ARCHITECTURE.md`.

### Critical Pitfalls

1. **Household RLS model breaks if designed incorrectly** — Existing tables use `auth.uid() = user_id`. Money tables need `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())`. Never add `household_id` to existing habit/task tables. Never accept `household_id` from client request parameters. Always derive server-side via `resolveHousehold()`. Verify by logging in as Partner B and confirming they see Partner A's shared data — and only shared data.

2. **Supabase `numeric` type causes silent float precision loss** — PostgREST serializes Postgres `numeric` as JSON floats; `new Decimal(row.amount)` reconstructs from a possibly-corrupted value. Store all money as integer cents (`BIGINT`) in every migration from day one. Convert to/from `Decimal` only at display and parse boundaries via `lib/money/arithmetic.ts`. This is a confirmed Supabase issue (GitHub supabase/cli#582, closed "not planned"). Test with `$10.33`, `$0.07`, `$19.99` round-trips.

3. **Plaid webhook endpoint bypasses Supabase auth** — The webhook receives unauthenticated server-to-server POST requests. The standard `supabase.auth.getUser()` check returns null, blocking all writes. Use service-role Supabase client. Verify Plaid JWT signature via `jose` before processing any payload. Add `/api/plaid/webhooks` to the proxy middleware allowlist or it gets 302-redirected to `/auth/login`.

4. **Vercel serverless timeout on initial transaction sync** — Initial Plaid sync for an active bank account can return months of history and take 10-30 seconds. Vercel Hobby plan: 10-second timeout. Token exchange API route must return immediately; delegate sync to a background job. Sync is cursor-based — partial progress is safe.

5. **Money data mixed into existing `/api/dashboard`** — If money widgets are added to the existing dashboard endpoint, Plaid sync latency blocks the entire dashboard. Keep all money API endpoints under `/api/money/*`. Use independent SWR hooks on the dashboard page so habits load instantly even when Plaid is unavailable.

For the full pitfall catalogue (9 critical pitfalls, technical debt patterns, security mistakes, performance traps, UX pitfalls, and recovery strategies with costs), see `.planning/research/PITFALLS.md`.

---

## Implications for Roadmap

Based on the combined research, the dependency chain dictates a clear phase ordering: households before Plaid before transactions before budgets before household UI before intelligence. Every shortcut in this chain introduces an expensive retroactive migration or security exposure.

### Phase 1: Database Foundation + Household Model
**Rationale:** Every money table references `household_id`. The RLS model, money column types (integer cents), and the `resolveHousehold()` utility must exist before any feature code is written. This phase has zero user-visible UI but determines security and data correctness for the entire milestone.
**Delivers:** Supabase migrations for all 9 money tables with RLS policies; `HouseholdsDB` class; `resolveHousehold()` helper; `lib/supabase/admin.ts` service-role client; `lib/money/arithmetic.ts` cents utilities; Calm Finance CSS tokens (`--money-*`); i18n `money.*` namespace (all 3 locales); sidebar nav "Money" item; money layout page shell at `app/money/layout.tsx`. All 1207+ existing tests passing after migrations.
**Addresses:** DB schema (P0), sidebar navigation (P0), Calm Finance design tokens (P1).
**Avoids:** Household RLS breakdown (Pitfall 1), numeric precision loss (Pitfall 2), household_id on profiles (Pitfall 8), DB class household scoping gap (Pitfall 5).
**Research flag:** LOW — patterns are well-documented (Supabase RLS official docs, standard migration patterns, direct codebase review). No external research phase needed. Critical verification: run full test suite after each migration step.

### Phase 2: Plaid Bank Connection Pipeline
**Rationale:** Plaid is the primary data source. Everything downstream (transactions, budgets, bills, net worth) depends on bank data flowing in. The webhook endpoint and background sync infrastructure must be hardened before any transaction display logic is added.
**Delivers:** `lib/plaid/` module (client, link-token, token-exchange, encryption, sync, webhook-verify); `PlaidItemsDB` + `AccountsDB`; `PlaidLinkButton` component; `/api/plaid/link-token`, `/api/plaid/exchange-token`, `/api/plaid/webhooks` routes; Vercel Cron sync job (`vercel.json` + `/api/cron/sync-transactions`); Account management page (`/money/accounts`); encrypted access token storage. CSV/manual import as a parallel data input path (no Plaid dependency — validates core experience without Plaid costs).
**Addresses:** Plaid bank connection (P1), account management page (P1), CSV/manual import (P1).
**Avoids:** Webhook auth bypass (Pitfall 3), Vercel timeout on initial sync (Pitfall 7), plain-text token storage (Pitfall 6).
**Research flag:** HIGH — Plaid integration has many sharp edges not fully visible in documentation. Run a research-phase sprint specifically covering: Plaid Sandbox vs. Production behavioral differences, OAuth bank re-authentication flow (Update Mode for ITEM_LOGIN_REQUIRED), exact webhook event sequence for initial sync, Plaid Item error codes and recovery paths.

### Phase 3: Transaction Display + Categorization
**Rationale:** The core user interaction loop. With data flowing from Plaid, users need to see, search, and understand their transactions. Categorization unlocks the entire budgeting stack — without it, budgets and charts require manual labeling per transaction.
**Delivers:** `TransactionsDB` + `CategoriesDB` + `MerchantRulesDB`; cursor-based paginated transactions API; Plaid PFCv2 auto-categorization at sync time; household merchant-name rule engine (correct once, auto-apply forever); manual category override; custom category creation; transaction list page with date/category/account/keyword filters (using `nuqs` or manual `useSearchParams`); spending breakdown charts (donut + bar via shadcn/Recharts); `useTransactions()` SWR hook with `keepPreviousData: true`.
**Addresses:** Transaction list + search (P1), auto-categorization (P1), custom categories (P1), spending breakdown charts (P1).
**Avoids:** SWR cache collision with habit data (Pitfall 4) — separate `useTransactions()` hook under `/api/money/transactions`, never merged with `/api/dashboard`.
**Research flag:** MEDIUM — `nuqs` for URL-state filter management is less established in Next.js 16. Validate early in the phase before committing to it.

### Phase 4: Budgets, Bills, Goals + Net Worth
**Rationale:** The "management layer" that gives transaction data context and value. Depends on categorized transactions from Phase 3. These three features share the same data shape (amounts, categories, periods) and can be built together efficiently.
**Delivers:** `BudgetsDB` + `BillsDB` + `GoalsDB`; budget CRUD with monthly period and optional rollover toggle; bill auto-detection from recurring transaction patterns (merchant + similar amount + regular interval); savings goals with progress rings and deadline projections; net worth aggregation (assets minus liabilities, updates on each sync); data export extending existing export infrastructure (transactions CSV); budget, bills, and goals pages; `/api/money/budgets`, `/api/money/bills`, `/api/money/goals` routes.
**Addresses:** Monthly budgets (P1), net worth (P1), bill detection (P2), savings goals (P2), data export (P2).
**Avoids:** Recomputing budget aggregations client-side (performance trap for households with 5K+ transactions) — aggregate server-side with pre-computed monthly totals.
**Research flag:** LOW — standard CRUD patterns follow existing codebase conventions exactly. Bill detection algorithm is first-principles pattern matching on merchant name + amount + interval; no external research needed.

### Phase 5: Household/Couples
**Rationale:** The primary differentiator. Built after single-user money flow is proven and stable — the DB schema already has `household_id` from Phase 1, so this phase is purely the invitation flow, shared views, and privacy controls, with no data migration required.
**Delivers:** Partner invitation flow (invite by email, accept link, join existing household); per-account privacy controls (mine / ours / hidden); shared household view combining both partners' transactions/budgets/net-worth; individual vs. shared budget distinction; shared savings goals; Supabase Realtime subscriptions for cross-user cache invalidation (Partner A changes category, Partner B's view updates on next focus event).
**Addresses:** Couples/household multi-user (P2), privacy controls (P2), shared budgets (P2), shared goals (P2).
**Avoids:** Partner invitation requiring simultaneous onboarding (async join — Partner 1 uses solo, Partner 2 joins later and data merges); aggressive coloring contradicting Calm Finance on partner spending comparisons.
**Research flag:** MEDIUM — email-based household invitation requires deciding on the invite token strategy. Research the Supabase Auth invitation API (`supabase.auth.admin.inviteUserByEmail`) vs. a custom `household_invitations` table with magic links before planning this phase.

### Phase 6: Intelligence + Future-First Dashboard
**Rationale:** Requires data maturity (2+ months of transaction history) and stable categorization, budgets, and bills from prior phases. The future-first dashboard (the signature feature) depends on the cash flow projection engine, which depends on income pattern detection and bill detection from Phase 4.
**Delivers:** Income pattern detection (recurring inflows from transaction history); cash flow projection engine (extrapolate spending pace + known upcoming bills); future-first money overview page at `/money` (available balance until next paycheck, upcoming bills, projected month-end balance, calendar-based cash flow); smart bill calendar with projected balance overlay and danger-zone highlighting; contextual rule-based insights embedded in relevant pages ("Your grocery spending is 23% above last month's average"); money summary card on the existing habit/task dashboard; optional LLM-enhanced insights (constrained to factual observations only, legal review required before launch).
**Addresses:** Future-first dashboard (P3), contextual AI insights (P3), smart bill calendar (P3), dashboard money summary card (P2).
**Avoids:** AI generating financial advice (Pitfall 9) — rule-based insights first; LLM prompts constrained to prohibit "should," "recommend," "consider," comparative benchmarks, and advisory language; legal review of all insight text before shipping.
**Research flag:** HIGH — cash flow projection algorithm and income detection have sparse community documentation. Run a research-phase sprint on: projection accuracy approaches, LLM prompt engineering for non-advisory financial observations, and whether off-the-shelf income detection exists or must be built from transaction patterns.

### Phase Ordering Rationale

- Households first because every money table references `household_id` — retrofitting it on populated tables requires migrating every row.
- Plaid before transactions because the primary data source must be established before display.
- Transactions before budgets because budgets aggregate categorized transactions; categories must exist first.
- Budgets/bills/goals before household UI because single-user value must be proven before adding multi-user complexity.
- Household layer before intelligence because AI insights in a household context require the household model to be stable.
- Intelligence last because the projection engine and AI insights require 2+ months of accumulated historical data to be meaningful.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Plaid Pipeline):** Complex external integration with many undocumented edge cases (OAuth re-auth flow, ITEM_ERROR recovery, Sandbox vs. Production behavioral differences). Run `/gsd:research-phase` before planning Phase 2.
- **Phase 5 (Household/Couples):** Supabase Auth invitation API for the household invite flow. The correct approach needs research before architecture is finalized.
- **Phase 6 (Intelligence):** Cash flow projection algorithm, income pattern detection, and constrained LLM prompting for non-advisory insights all have sparse documentation. Run `/gsd:research-phase` before planning Phase 6.

Phases with standard, well-documented patterns (can skip research-phase):
- **Phase 1 (Database Foundation):** Supabase migrations, RLS policies, DB class pattern — thoroughly documented in official Supabase docs and established in the existing codebase.
- **Phase 3 (Transactions):** SWR hooks with cursor pagination, shadcn/Recharts charts, Zod validation — all established patterns with official documentation.
- **Phase 4 (Budgets/Bills/Goals):** Standard CRUD following the same DB class pattern used throughout the codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified via npm registry (2025-11 to 2026-02). Official Plaid, Supabase, and shadcn/ui documentation confirms integration patterns. `nuqs` is MEDIUM — newer library with less community precedent in production Next.js 16. |
| Features | HIGH | Competitor analysis from NerdWallet, CNBC, Monarch, YNAB, Honeydue, Copilot confirmed across multiple sources. Plaid PFCv2 categorization documented officially. Feature dependency graph derived from research, not assumption. |
| Architecture | HIGH | Integration patterns derived directly from existing BetterR.Me codebase review. All new patterns (household RLS, cursor sync, service-role client) documented in official Supabase and Plaid docs and confirmed by codebase analysis. |
| Pitfalls | HIGH | 9 critical pitfalls verified against official docs, confirmed GitHub issues (supabase/cli#582 for numeric precision, plaid/plaid-node#604 for Edge Runtime), and direct codebase analysis of all 15+ existing API routes and RLS policies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Plaid OAuth bank re-authentication flow (Update Mode):** Documentation exists but the exact UX and error recovery sequence for major OAuth banks (Chase, Bank of America, Wells Fargo) needs validation during Phase 2 planning. Some banks require a full OAuth redirect; the Plaid Link flow differs meaningfully between OAuth and credential-based institutions.

- **Supabase Edge Functions vs. Vercel Cron for background sync:** STACK.md recommends starting with Vercel Cron (simpler, zero new dependencies). If transaction volume per household is high, Edge Functions' 150-second timeout becomes relevant. Validate empirically with realistic transaction volumes before Phase 2 is complete.

- **`nuqs` integration with SWR for transaction filters:** The pattern of deriving SWR keys from `nuqs` URL state is documented but not widely battle-tested in production Next.js 16 App Router apps. Validate early in Phase 3 before committing.

- **Plaid PFCv2 categorization accuracy in practice:** Plaid claims >90% primary category accuracy. Real-world accuracy varies by institution and transaction type. Budget for a higher-than-expected manual override rate in early user testing; the merchant-name rule engine is the correction mechanism.

- **AI insights legal review scope:** PITFALLS.md flags SEC/FINRA compliance risk for AI-generated financial observations. The boundary between "observation" and "advice" is unclear. A legal review of sample insight text should happen before Phase 6, not during it.

---

## Sources

### Primary (HIGH confidence — official documentation)
- [Plaid Link Web SDK](https://plaid.com/docs/link/web/) — Plaid Link integration, link_token flow
- [Plaid Transactions Sync](https://plaid.com/docs/transactions/sync-migration/) — cursor-based sync, delta updates
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) — JWT/ES256 verification
- [Plaid AI-Enhanced Categorization (PFCv2)](https://plaid.com/blog/ai-enhanced-transaction-categorization/) — categorization accuracy claims
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — household RLS patterns
- [Supabase Vault](https://supabase.com/docs/guides/database/vault) — Plaid token encryption at rest
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) — cross-user household cache invalidation
- [Supabase Cron](https://supabase.com/docs/guides/cron) — scheduled transaction sync
- [Supabase Edge Functions Scheduling](https://supabase.com/docs/guides/functions/schedule-functions) — background job execution
- [shadcn/ui Charts](https://ui.shadcn.com/docs/components/radix/chart) — Recharts integration with design tokens
- [nuqs docs](https://nuqs.dev) — URL state for transaction filters
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) — background sync scheduling
- npm registry — plaid v41.1.0, react-plaid-link v4.1.1, decimal.js v10.6.0, recharts v3.7.0, jose v6.1.3, papaparse v5.5.3

### Secondary (MEDIUM confidence — community sources, multiple corroborating)
- [NerdWallet: Best Budget Apps 2026](https://www.nerdwallet.com/finance/learn/best-budget-apps) — competitor feature landscape
- [CNBC Select: Best Budgeting Apps 2026](https://www.cnbc.com/select/best-budgeting-apps/) — competitor positioning
- [Multi-tenant RLS on Supabase (AntStack)](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) — household isolation patterns
- [Plaid Integration with Next.js 14 (Medium)](https://medium.com/@nazardubovyk/step-by-step-guide-to-integrate-plaid-with-next-js-14-app-router-356b547b5a4a) — integration patterns
- [Supabase Best Practices (Leanware)](https://www.leanware.co/insights/supabase-best-practices) — RLS and service role patterns
- BetterR.Me codebase direct review — existing patterns for HabitsDB, TasksDB, SWR hooks, proxy middleware, migrations, and all 15+ existing API routes

### Tertiary (confirmed bugs/issues)
- [GitHub supabase/cli#582](https://github.com/supabase/cli/issues/582) — `numeric` columns returned as JS float, closed "not planned"
- [GitHub plaid/plaid-node#604](https://github.com/plaid/plaid-node/issues/604) — Plaid Node SDK incompatible with Edge Runtime due to Axios dependency
- [GitGuardian: Plaid Access Token Leak Remediation](https://www.gitguardian.com/remediation/plaid-access-token) — token security

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
