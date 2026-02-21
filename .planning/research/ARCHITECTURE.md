# Architecture Research

**Domain:** Money tracking integration into existing BetterR.Me app
**Researched:** 2026-02-21
**Confidence:** HIGH

## System Overview: How Money Tracking Fits Into BetterR.Me

The existing BetterR.Me architecture is a three-layer system: Server Components for initial render, SWR-backed Client Components for interactivity, and API routes delegating to DB classes with Supabase RLS. Money tracking adds a fourth dimension: **external data ingestion** (Plaid webhooks + background sync) that does not exist in the current habits/tasks model where all data originates from user input.

```
EXISTING BETTERR.ME (untouched)          NEW MONEY LAYER (added)
================================         ================================

┌─────────────────────────────┐          ┌─────────────────────────────┐
│    Sidebar Navigation       │          │    Sidebar Navigation       │
│  Dashboard | Habits | Tasks │    -->   │  + Money (new nav item)     │
└─────────────┬───────────────┘          └─────────────┬───────────────┘
              │                                        │
┌─────────────┴───────────────┐          ┌─────────────┴───────────────┐
│   Existing Pages + SWR      │          │   Money Pages + SWR         │
│   /dashboard (habits/tasks) │          │   /money (hub)              │
│   /habits, /tasks           │          │   /money/transactions       │
│                             │          │   /money/budgets            │
│                             │          │   /money/accounts           │
│                             │          │   /money/bills              │
│                             │          │   /money/goals              │
└─────────────┬───────────────┘          └─────────────┬───────────────┘
              │                                        │
┌─────────────┴───────────────┐          ┌─────────────┴───────────────┐
│   Existing API Routes       │          │   Money API Routes          │
│   /api/dashboard            │          │   /api/money/accounts       │
│   /api/habits/*             │          │   /api/money/transactions   │
│   /api/tasks/*              │          │   /api/money/budgets        │
│   /api/projects/*           │          │   /api/money/bills          │
│                             │          │   /api/money/goals          │
│                             │          │   /api/plaid/*  (webhooks)  │
└─────────────┬───────────────┘          └─────────────┬───────────────┘
              │                                        │
┌─────────────┴───────────────┐          ┌─────────────┴───────────────┐
│   Existing DB Classes       │          │   Money DB Classes          │
│   HabitsDB, TasksDB,       │          │   AccountsDB, TransDB,     │
│   ProjectsDB, ProfilesDB   │          │   BudgetsDB, BillsDB,      │
│   HabitLogsDB, InsightsDB   │          │   GoalsDB, CategoriesDB,   │
│                             │          │   PlaidItemsDB, HouseholdsDB│
└─────────────┬───────────────┘          └─────────────┬───────────────┘
              │                                        │
┌─────────────┴────────────────────────────────────────┴──────────────┐
│                    Supabase PostgreSQL                               │
│   Existing tables (profiles, habits, tasks, projects, ...)          │
│   + New tables (households, accounts, transactions, budgets, ...)   │
│   RLS: existing = auth.uid() = user_id                              │
│   RLS: money = household_id IN (user's households)                  │
└─────────────────────────────────────────────────────────────────────┘
              │
              │  (NEW: external data ingestion -- does not exist today)
              │
┌─────────────┴───────────────────────────────────────────────────────┐
│                    External Services                                 │
│   ┌──────────────┐    ┌─────────────────┐    ┌────────────────┐     │
│   │  Plaid API   │    │  Vercel Cron     │    │  Plaid Link    │     │
│   │  (webhooks)  │    │  (polling sync)  │    │  (browser SDK) │     │
│   └──────────────┘    └─────────────────┘    └────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Principle: Additive, Not Invasive

Money tracking is a **parallel feature domain** alongside habits and tasks. It shares infrastructure (Supabase auth, sidebar layout, design tokens, i18n, SWR patterns) but does not modify existing feature code. The only existing files that need modification are:

1. **`components/layouts/app-sidebar.tsx`** -- add "Money" nav item to `mainNavItems` array
2. **`lib/db/index.ts`** -- add barrel exports for new DB classes
3. **`lib/db/types.ts`** -- add money-related type definitions
4. **`i18n/messages/*.json`** -- add `money.*` namespace translations
5. **`app/globals.css`** -- add Calm Finance design tokens (money-specific colors)
6. **`lib/hooks/use-sidebar-counts.ts`** -- optionally add money badge counts

Everything else is new files in new directories. This preserves the existing test suite and avoids regressions.

## Integration Points With Existing Architecture

### 1. Supabase Client Pattern (No Change)

The existing three-client pattern works perfectly for money features.

```typescript
// Server-side (API routes) -- exact same pattern as habits/tasks
const supabase = await createClient();
const accountsDB = new AccountsDB(supabase);
const accounts = await accountsDB.getHouseholdAccounts(householdId);

// Client-side -- exact same pattern
const accountsDB = new AccountsDB(createClient());
```

**No changes needed** to `lib/supabase/client.ts`, `lib/supabase/server.ts`, or `lib/supabase/proxy.ts`.

### 2. RLS Pattern: From user_id to household_id

This is the most significant architectural shift. Existing tables use `user_id = auth.uid()` for RLS. Money tables need `household_id`-based access because couples share financial data.

**The bridge: `household_members` table.**

```sql
-- Existing pattern (habits, tasks, projects):
CREATE POLICY "Users can view own habits"
  ON habits FOR SELECT
  USING (auth.uid() = user_id);

-- New pattern (money tables):
CREATE POLICY "Users can view household accounts"
  ON accounts FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );
```

**Critical: existing tables are NOT modified.** Habits, tasks, and projects remain `user_id`-scoped. Only money tables use `household_id`-scoped RLS. This prevents any regression in existing features.

**Single-user default:** When a user signs up, the `handle_new_user` trigger (already exists) is extended to also create a default household with one member. Single users never see household UI -- it activates only when a partner is invited.

### 3. SWR Data Fetching (Same Pattern, New Hooks)

Money hooks follow the exact same SWR pattern as existing hooks.

```typescript
// lib/hooks/use-accounts.ts -- mirrors use-habits.ts pattern
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Account } from "@/lib/db/types";

export function useAccounts() {
  const { data, error, isLoading, mutate } = useSWR<{ accounts: Account[] }>(
    "/api/money/accounts",
    fetcher
  );

  return {
    accounts: data?.accounts ?? [],
    error,
    isLoading,
    mutate,
  };
}

// lib/hooks/use-transactions.ts -- adds pagination + filters
export function useTransactions(filters?: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("category", filters.categoryId);
  if (filters?.startDate) params.set("start", filters.startDate);
  if (filters?.endDate) params.set("end", filters.endDate);
  if (filters?.cursor) params.set("cursor", filters.cursor);

  const key = `/api/money/transactions?${params}`;
  const { data, error, isLoading, mutate } = useSWR<TransactionPage>(
    key,
    fetcher,
    { keepPreviousData: true } // Same pattern as date-based SWR keys
  );

  return {
    transactions: data?.transactions ?? [],
    nextCursor: data?.nextCursor ?? null,
    error,
    isLoading,
    mutate,
  };
}
```

**Key difference from existing hooks:** Transaction hooks use cursor-based pagination (not date-based cache invalidation like dashboard). The `keepPreviousData: true` pattern already exists in the codebase for date-keyed SWR.

### 4. API Route Pattern (Same, With Household Context)

Existing API routes extract `user.id` from auth. Money routes extract `user.id` AND resolve the user's `household_id`.

```typescript
// app/api/money/accounts/route.ts
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // NEW: resolve household context (not needed for habits/tasks)
    const householdsDB = new HouseholdsDB(supabase);
    const householdId = await householdsDB.getUserHouseholdId(user.id);
    if (!householdId) {
      return NextResponse.json({ error: "No household" }, { status: 400 });
    }

    const accountsDB = new AccountsDB(supabase);
    const accounts = await accountsDB.getHouseholdAccounts(householdId);

    return NextResponse.json({ accounts });
  } catch (error) {
    log.error("GET /api/money/accounts error", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
```

**Pattern:** The household resolution is a 2-line addition at the top of each money API route. Extract to a helper: `getHouseholdContext(supabase, userId)` to avoid repetition.

### 5. DB Class Pattern (Same Constructor, New Classes)

New DB classes follow the exact same pattern as `HabitsDB`, `TasksDB`, `ProjectsDB`.

```typescript
// lib/db/accounts.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, AccountInsert } from "./types";

export class AccountsDB {
  constructor(private supabase: SupabaseClient) {}

  async getHouseholdAccounts(householdId: string): Promise<Account[]> {
    const { data, error } = await this.supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .order("institution_name", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getAccount(accountId: string, householdId: string): Promise<Account | null> {
    const { data, error } = await this.supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("household_id", householdId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data;
  }
}
```

**Same patterns:** constructor with SupabaseClient, `PGRST116` for not-found, throw errors for caller to handle, return arrays defaulting to `[]`.

### 6. Validation Pattern (Same Zod Approach)

```typescript
// lib/validations/budget.ts
import { z } from "zod";

export const budgetFormSchema = z.object({
  category_id: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"), // String for decimal.js
  period: z.enum(["monthly", "weekly"]),
  name: z.string().trim().min(1).max(100),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;

export const budgetUpdateSchema = budgetFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

**Money-specific:** Amounts are validated as strings (for decimal.js compatibility), not numbers. This prevents floating-point issues at the validation boundary.

### 7. Page Structure (Same Layout, New Routes)

Money pages reuse the existing `SidebarShell` layout via the dashboard layout hierarchy.

```
app/
├── dashboard/
│   ├── layout.tsx          # Existing -- wraps with SidebarShell (UNCHANGED)
│   ├── page.tsx            # Existing dashboard (UNCHANGED)
│   └── settings/           # Existing settings (UNCHANGED)
├── habits/                 # Existing (UNCHANGED)
├── tasks/                  # Existing (UNCHANGED)
├── money/                  # NEW -- all money pages
│   ├── layout.tsx          # Reuses SidebarShell (same as dashboard/layout.tsx)
│   ├── page.tsx            # Money hub/overview
│   ├── accounts/
│   │   └── page.tsx        # Connected accounts management
│   ├── transactions/
│   │   └── page.tsx        # Transaction list + search + filters
│   ├── budgets/
│   │   └── page.tsx        # Budget management
│   ├── bills/
│   │   └── page.tsx        # Bills & subscriptions
│   └── goals/
│       └── page.tsx        # Savings goals
```

**Layout reuse:** `app/money/layout.tsx` imports `SidebarShell` the same way `app/dashboard/layout.tsx` does. No new layout components needed.

### 8. i18n Pattern (New Namespace, Same Convention)

```json
// i18n/messages/en.json -- add "money" top-level namespace
{
  "common": { "nav": { "money": "Money" } },
  "money": {
    "accounts": {
      "title": "Accounts",
      "connectBank": "Connect Bank",
      "balance": "Balance"
    },
    "transactions": {
      "title": "Transactions",
      "search": "Search transactions...",
      "noResults": "No transactions found"
    },
    "budgets": {
      "title": "Budgets",
      "remaining": "{amount} remaining",
      "overspent": "Over by {amount}"
    }
  }
}
```

**Same convention:** Server components use `await getTranslations("money.accounts")`, client components use `useTranslations("money.accounts")`. All three locale files (en, zh, zh-TW) updated simultaneously.

## New Architectural Components (Not In Existing Codebase)

### Component 1: Plaid Integration Layer

This is entirely new. The existing app has no external API integrations.

```
lib/
├── plaid/                      # NEW directory
│   ├── client.ts               # Plaid Node SDK client singleton
│   ├── link-token.ts           # Create link tokens for Plaid Link
│   ├── token-exchange.ts       # Exchange public_token for access_token
│   ├── sync.ts                 # Transaction sync logic (cursor-based)
│   ├── webhook-verify.ts       # Webhook JWT signature verification
│   └── encryption.ts           # AES-256-GCM for access token encryption
```

**Why a separate `lib/plaid/` directory instead of putting it in `lib/db/`:** Plaid logic is API client code (HTTP calls to Plaid servers), not database operations. The existing `lib/db/` directory contains only Supabase query classes. Mixing Plaid API calls into DB classes would violate the existing separation of concerns.

### Component 2: Webhook Route Handler

New route type that does not exist in the current codebase. Existing API routes only handle authenticated user requests. The Plaid webhook endpoint receives unauthenticated POST requests from Plaid's servers.

```typescript
// app/api/plaid/webhooks/route.ts
export async function POST(request: NextRequest) {
  try {
    // 1. Verify webhook signature (Plaid JWT)
    const body = await request.text();
    const isValid = await verifyPlaidWebhook(
      body,
      request.headers.get("Plaid-Verification") || ""
    );
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body);

    // 2. Handle different webhook types
    switch (payload.webhook_type) {
      case "TRANSACTIONS":
        if (payload.webhook_code === "SYNC_UPDATES_AVAILABLE") {
          // Queue sync job (Vercel Cron or direct execution)
          await triggerTransactionSync(payload.item_id);
        }
        break;
      case "ITEM":
        if (payload.webhook_code === "ERROR") {
          await handleItemError(payload.item_id, payload.error);
        }
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    log.error("Plaid webhook error", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

**No auth check needed** (unlike all existing routes). Instead, JWT signature verification replaces user authentication.

### Component 3: Background Sync (Vercel Cron)

The existing app has no background jobs. Adding Inngest (from the moneyy.me research) is overkill for BetterR.Me because:

1. BetterR.Me already deploys to Vercel (Vercel Cron is built-in, free)
2. The app already has the existing recurring task generation pattern (`ensureRecurringInstances`) that runs inline during API calls
3. Adding Inngest means a new dependency, new infrastructure, new webhook endpoint

**Use Vercel Cron instead of Inngest.** Simpler, zero new dependencies, follows the existing "do work in API route" pattern.

```json
// vercel.json (new file)
{
  "crons": [
    {
      "path": "/api/cron/sync-transactions",
      "schedule": "0 */4 * * *"
    }
  ]
}
```

```typescript
// app/api/cron/sync-transactions/route.ts
export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminClient(); // Service role for cron
  const items = await getStaleItems(supabase); // Items not synced in 4+ hours

  for (const item of items) {
    await syncTransactionsForItem(supabase, item);
  }

  return NextResponse.json({ synced: items.length });
}
```

**Trade-off acknowledged:** Vercel Cron has a 10-second timeout on Hobby plan (60s on Pro). If syncing many accounts at once hits this limit, the cron job processes items in priority order and finishes what it can. Each item sync is idempotent (cursor-based), so partial progress is safe. If scale requires it later, Inngest can be added as a drop-in replacement.

### Component 4: Supabase Admin Client (New Client Type)

The existing app has three Supabase clients (browser, server, proxy). Background sync requires a fourth: the **admin/service-role client** for cron jobs where there is no user session.

```typescript
// lib/supabase/admin.ts (NEW)
import { createClient } from "@supabase/supabase-js";

/**
 * Admin client with service_role key. Bypasses RLS.
 * ONLY use in cron jobs and background sync. NEVER in user-facing routes.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Security constraint:** The service role key bypasses RLS. This client must ONLY be used in cron routes (not user-facing API routes). User-facing routes continue using the existing server client with RLS enforcement.

### Component 5: Money Arithmetic with decimal.js

All existing numeric operations in BetterR.Me use native JavaScript numbers (streak counts, completion rates, sort_order). Money requires decimal.js.

```typescript
// lib/money/arithmetic.ts (NEW)
import Decimal from "decimal.js";

/** Format cents (integer) to display string. Store money as cents in DB. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Decimal(cents).dividedBy(100).toFixed(2);
}

/** Parse user input to cents for storage. */
export function parseToCents(input: string): number {
  return new Decimal(input).times(100).round().toNumber();
}

/** Sum an array of cent values (avoids floating point). */
export function sumCents(values: number[]): number {
  return values.reduce((acc, val) => acc + val, 0); // Integers are safe
}

/** Calculate budget remaining. */
export function budgetRemaining(budgetCents: number, spentCents: number): number {
  return budgetCents - spentCents;
}
```

**Design decision:** Store all money as integer cents in the database (not decimal columns). This avoids floating-point issues entirely for storage and most arithmetic. Use decimal.js only at display boundaries (formatting) and when parsing user input.

## Data Model: How New Tables Relate to Existing Schema

```
EXISTING (unchanged)                    NEW (money tables)
===================                     ==================

profiles (1)──────────────────────────→ household_members (N)
    │                                       │
    │ user_id (FK)                          │ user_id + household_id
    │                                       │
    ├── habits (N)                          │
    ├── habit_logs (N)                  households (1)
    ├── tasks (N)                           │
    ├── projects (N)                        ├── plaid_items (N)
    └── recurring_tasks (N)                 │       │
                                            │       └── accounts (N)
                                            │               │
                                            │               └── transactions (N)
                                            │
                                            ├── categories (N)
                                            │       │ (system defaults + custom)
                                            │       └── merchant_rules (N)
                                            │
                                            ├── budgets (N)
                                            │       └── (joins to categories)
                                            │
                                            ├── recurring_bills (N)
                                            │
                                            └── savings_goals (N)
```

**Key relationship:** `profiles.id` links to `household_members.user_id`. A user has one active household. The `profiles` table itself is NOT modified -- the linkage goes through the new `household_members` join table.

### New Tables (Supabase Migrations)

```sql
-- Migration: 20260222000001_create_households.sql
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (household_id, user_id)
);

-- Auto-create household for new users (extend existing handle_new_user)
-- OR create household on first money feature access (lazy creation)

-- Migration: 20260222000002_create_plaid_items.sql
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,  -- AES-256-GCM encrypted
  institution_id TEXT,
  institution_name TEXT,
  transactions_cursor TEXT,              -- For /transactions/sync
  last_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'login_required')),
  error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000003_create_accounts.sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plaid_item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  official_name TEXT,
  type TEXT NOT NULL,           -- checking, savings, credit, investment, loan
  subtype TEXT,
  mask TEXT,                     -- Last 4 digits
  institution_name TEXT,
  current_balance_cents BIGINT,
  available_balance_cents BIGINT,
  iso_currency_code TEXT DEFAULT 'USD',
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000004_create_categories.sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE, -- NULL = system default
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  plaid_primary TEXT,       -- Maps to Plaid PFC primary category
  plaid_detailed TEXT,      -- Maps to Plaid PFC detailed category
  is_system BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000005_create_transactions.sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT UNIQUE,          -- Plaid dedup key
  pending_transaction_id TEXT,               -- For pending-to-posted reconciliation
  amount_cents BIGINT NOT NULL,              -- Positive = expense, negative = income
  iso_currency_code TEXT DEFAULT 'USD',
  date DATE NOT NULL,
  name TEXT NOT NULL,                        -- Raw from Plaid
  merchant_name TEXT,                        -- Cleaned merchant name from Plaid
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  category_confidence TEXT,                  -- 'high', 'medium', 'low' from Plaid
  is_pending BOOLEAN DEFAULT false,
  is_manual BOOLEAN DEFAULT false,           -- True for CSV import or manual entry
  is_excluded BOOLEAN DEFAULT false,         -- True for transfers, refunds user wants to exclude
  notes TEXT,
  source TEXT DEFAULT 'plaid' CHECK (source IN ('plaid', 'csv', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_household_date
  ON transactions (household_id, date DESC);
CREATE INDEX idx_transactions_account
  ON transactions (account_id, date DESC);
CREATE INDEX idx_transactions_category
  ON transactions (household_id, category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX idx_transactions_plaid_id
  ON transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

-- Migration: 20260222000006_create_budgets.sql
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'weekly')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000007_create_recurring_bills.sql
CREATE TABLE recurring_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  merchant_pattern TEXT,          -- Regex for auto-matching transactions
  is_active BOOLEAN DEFAULT true,
  last_paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000008_create_savings_goals.sql
CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_cents BIGINT NOT NULL,
  current_amount_cents BIGINT DEFAULT 0,
  target_date DATE,
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  color TEXT DEFAULT 'blue',
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: 20260222000009_create_merchant_rules.sql
CREATE TABLE merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_pattern TEXT NOT NULL,    -- Pattern to match (e.g., "AMZN MKTP")
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies for Money Tables

All money tables use the same household-scoped pattern:

```sql
-- Apply to: households, plaid_items, accounts, transactions, budgets,
--           recurring_bills, savings_goals, categories (where household_id NOT NULL),
--           merchant_rules, household_members

ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household [table]"
  ON [table] FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert into household [table]"
  ON [table] FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE and DELETE follow same pattern
```

**System categories** (where `household_id IS NULL`) need a separate SELECT policy: `USING (household_id IS NULL OR household_id IN (...))`.

## Architectural Patterns

### Pattern 1: Household Context Resolution

**What:** Every money API route resolves the authenticated user's household_id before any data access.

**When to use:** Every money API route. Never for habits/tasks routes.

**Trade-offs:** Adds one DB query per money API call. Could cache in middleware, but the query is fast (indexed unique lookup) and caching adds complexity. Keep it simple.

```typescript
// lib/money/household-context.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getHouseholdContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ householdId: string } | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return { householdId: data.household_id };
}
```

### Pattern 2: Plaid Link Token Flow (Three-Phase)

**What:** Server creates link_token, client opens Plaid Link, client sends public_token back to server for exchange.

**When to use:** Every bank connection. No alternative for Plaid.

**Trade-offs:** Requires three API calls in sequence. Access token must be encrypted before storage.

```typescript
// Phase 1: Create link token
// app/api/plaid/link-token/route.ts
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const linkToken = await plaidClient.linkTokenCreate({
    user: { client_user_id: user.id },
    client_name: "BetterR.Me",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhooks`,
  });

  return NextResponse.json({ linkToken: linkToken.data.link_token });
}

// Phase 2: Plaid Link opens in browser (react-plaid-link handles this)

// Phase 3: Exchange public token
// app/api/plaid/exchange-token/route.ts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { publicToken } = await request.json();
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household" }, { status: 400 });

  // Exchange for permanent access token
  const exchange = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  // Encrypt before storage
  const encryptedToken = encrypt(exchange.data.access_token);

  // Store item + fetch accounts
  const plaidItemsDB = new PlaidItemsDB(supabase);
  await plaidItemsDB.createItem({
    household_id: ctx.householdId,
    plaid_item_id: exchange.data.item_id,
    access_token_encrypted: encryptedToken,
  });

  // Trigger initial sync
  await syncTransactionsForItem(supabase, exchange.data.item_id);

  return NextResponse.json({ success: true });
}
```

### Pattern 3: Cursor-Based Transaction Sync

**What:** Plaid's `/transactions/sync` uses a cursor to track sync state. Each call returns a delta (added, modified, removed).

**When to use:** On webhook notification or cron job trigger.

**Trade-offs:** Must process all three arrays (added, modified, removed). Must handle `has_more` pagination loop. Must store cursor after each successful page.

```typescript
// lib/plaid/sync.ts
export async function syncTransactionsForItem(
  supabase: SupabaseClient,
  plaidItemId: string
) {
  const itemsDB = new PlaidItemsDB(supabase);
  const item = await itemsDB.getByPlaidItemId(plaidItemId);
  if (!item) throw new Error(`Item not found: ${plaidItemId}`);

  const accessToken = decrypt(item.access_token_encrypted);
  let cursor = item.transactions_cursor || "";
  let hasMore = true;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });

    const { added, modified, removed, next_cursor, has_more } = response.data;

    // Apply changes in a single transaction
    await applyTransactionChanges(supabase, item.household_id, item.id, {
      added,
      modified,
      removed,
    });

    cursor = next_cursor;
    hasMore = has_more;
  }

  // Save cursor for next sync
  await itemsDB.updateCursor(item.id, cursor);
}
```

### Pattern 4: Calm Finance Design Tokens

**What:** Money views use a muted, forward-looking color palette that avoids anxiety-inducing red/green for financial status.

**When to use:** All money-related UI components. Does NOT replace existing category/status tokens used in habits/tasks.

```css
/* app/globals.css -- add to existing :root and .dark blocks */
:root {
  /* Calm Finance tokens (money views only) */
  --money-positive: 157 50% 45%;       /* Teal-green, not aggressive green */
  --money-negative: 20 70% 55%;        /* Warm amber, not red */
  --money-neutral: 215 15% 55%;        /* Gray-blue */
  --money-budget-track: 216 16% 91%;   /* Matches --border */
  --money-budget-fill: 157 50% 45%;    /* Matches --primary */
  --money-budget-over: 20 70% 55%;     /* Warm amber */
  --money-card-accent: 215 30% 95%;    /* Subtle blue tint for money cards */
}

.dark {
  --money-positive: 157 40% 55%;
  --money-negative: 20 60% 60%;
  --money-neutral: 215 15% 60%;
  --money-budget-track: 217 33% 17%;
  --money-budget-fill: 157 40% 55%;
  --money-budget-over: 20 60% 60%;
  --money-card-accent: 215 30% 18%;
}
```

**Rationale:** Existing tokens (--status-error, --status-success, --priority-high) use red/green. Money views deliberately avoid these to follow Calm Finance principles. Money components reference `--money-*` tokens, not `--status-*` tokens.

## New File Inventory (What Gets Created)

### Pages (app/)

| File | Purpose | Modified/New |
|------|---------|-------------|
| `app/money/layout.tsx` | SidebarShell wrapper for money section | NEW |
| `app/money/page.tsx` | Money hub/overview page | NEW |
| `app/money/accounts/page.tsx` | Connected accounts management | NEW |
| `app/money/transactions/page.tsx` | Transaction list with search + filters | NEW |
| `app/money/budgets/page.tsx` | Budget management per category | NEW |
| `app/money/bills/page.tsx` | Recurring bills & subscriptions | NEW |
| `app/money/goals/page.tsx` | Savings goals with progress | NEW |

### API Routes (app/api/)

| File | Purpose | Modified/New |
|------|---------|-------------|
| `app/api/money/accounts/route.ts` | GET household accounts | NEW |
| `app/api/money/transactions/route.ts` | GET transactions (paginated + filtered) | NEW |
| `app/api/money/transactions/[id]/route.ts` | GET/PATCH single transaction | NEW |
| `app/api/money/budgets/route.ts` | GET/POST budgets | NEW |
| `app/api/money/budgets/[id]/route.ts` | GET/PATCH/DELETE single budget | NEW |
| `app/api/money/bills/route.ts` | GET/POST bills | NEW |
| `app/api/money/goals/route.ts` | GET/POST goals | NEW |
| `app/api/money/goals/[id]/route.ts` | GET/PATCH/DELETE single goal | NEW |
| `app/api/money/categories/route.ts` | GET categories | NEW |
| `app/api/money/overview/route.ts` | GET dashboard overview (balances, upcoming) | NEW |
| `app/api/plaid/link-token/route.ts` | POST create Plaid Link token | NEW |
| `app/api/plaid/exchange-token/route.ts` | POST exchange public_token | NEW |
| `app/api/plaid/webhooks/route.ts` | POST receive Plaid webhooks | NEW |
| `app/api/cron/sync-transactions/route.ts` | GET cron-triggered sync | NEW |

### Components (components/)

| File | Purpose | Modified/New |
|------|---------|-------------|
| `components/money/money-overview.tsx` | Hub page content (balances, recent, upcoming) | NEW |
| `components/money/account-card.tsx` | Single account display | NEW |
| `components/money/account-list.tsx` | List of connected accounts | NEW |
| `components/money/plaid-link-button.tsx` | Plaid Link connection button | NEW |
| `components/money/transaction-list.tsx` | Transaction list with virtual scroll | NEW |
| `components/money/transaction-row.tsx` | Single transaction row | NEW |
| `components/money/transaction-filters.tsx` | Date range + category + search filters | NEW |
| `components/money/budget-card.tsx` | Budget with progress bar | NEW |
| `components/money/budget-list.tsx` | List of budgets by category | NEW |
| `components/money/budget-form.tsx` | Create/edit budget form | NEW |
| `components/money/bill-card.tsx` | Recurring bill display | NEW |
| `components/money/bill-list.tsx` | List of bills with due dates | NEW |
| `components/money/goal-card.tsx` | Savings goal with progress | NEW |
| `components/money/goal-form.tsx` | Create/edit goal form | NEW |
| `components/money/spending-chart.tsx` | Spending by category chart | NEW |
| `components/money/balance-summary.tsx` | Net worth / total balance summary | NEW |
| `components/money/sync-status.tsx` | Bank sync status indicator | NEW |

### Library (lib/)

| File | Purpose | Modified/New |
|------|---------|-------------|
| `lib/db/accounts.ts` | AccountsDB class | NEW |
| `lib/db/transactions.ts` | TransactionsDB class | NEW |
| `lib/db/budgets.ts` | BudgetsDB class | NEW |
| `lib/db/bills.ts` | BillsDB class (recurring bills) | NEW |
| `lib/db/goals.ts` | GoalsDB class (savings goals) | NEW |
| `lib/db/categories.ts` | CategoriesDB class | NEW |
| `lib/db/households.ts` | HouseholdsDB class | NEW |
| `lib/db/plaid-items.ts` | PlaidItemsDB class | NEW |
| `lib/db/merchant-rules.ts` | MerchantRulesDB class | NEW |
| `lib/plaid/client.ts` | Plaid Node SDK client | NEW |
| `lib/plaid/link-token.ts` | Link token creation | NEW |
| `lib/plaid/token-exchange.ts` | Public/access token exchange | NEW |
| `lib/plaid/sync.ts` | Transaction sync logic | NEW |
| `lib/plaid/webhook-verify.ts` | Webhook signature verification | NEW |
| `lib/plaid/encryption.ts` | AES-256-GCM for access tokens | NEW |
| `lib/money/arithmetic.ts` | decimal.js wrappers for money math | NEW |
| `lib/money/household-context.ts` | Household resolution helper | NEW |
| `lib/money/format.ts` | Currency formatting utilities | NEW |
| `lib/money/categorization.ts` | Auto-categorization with merchant rules | NEW |
| `lib/hooks/use-accounts.ts` | SWR hook for accounts | NEW |
| `lib/hooks/use-transactions.ts` | SWR hook for transactions (paginated) | NEW |
| `lib/hooks/use-budgets.ts` | SWR hook for budgets | NEW |
| `lib/hooks/use-bills.ts` | SWR hook for bills | NEW |
| `lib/hooks/use-goals.ts` | SWR hook for goals | NEW |
| `lib/hooks/use-money-overview.ts` | SWR hook for money hub data | NEW |
| `lib/validations/transaction.ts` | Zod schemas for transactions | NEW |
| `lib/validations/budget.ts` | Zod schemas for budgets | NEW |
| `lib/validations/goal.ts` | Zod schemas for goals | NEW |
| `lib/validations/bill.ts` | Zod schemas for bills | NEW |
| `lib/supabase/admin.ts` | Service role client for cron jobs | NEW |

### Modified Existing Files

| File | Change | Risk |
|------|--------|------|
| `components/layouts/app-sidebar.tsx` | Add "Money" to `mainNavItems` array | MINIMAL -- one array entry |
| `lib/db/index.ts` | Add barrel exports for new DB classes | MINIMAL -- append exports |
| `lib/db/types.ts` | Add money-related type definitions | MINIMAL -- append types |
| `i18n/messages/en.json` | Add `money.*` namespace | MINIMAL -- new top-level key |
| `i18n/messages/zh.json` | Add `money.*` namespace | MINIMAL -- new top-level key |
| `i18n/messages/zh-TW.json` | Add `money.*` namespace | MINIMAL -- new top-level key |
| `app/globals.css` | Add `--money-*` design tokens | MINIMAL -- append tokens |
| `lib/hooks/use-sidebar-counts.ts` | Optionally add unpaid bills count | LOW -- additive only |

## Build Order (Dependency Chain)

Components have clear dependencies that dictate build order within the existing codebase:

```
Phase 1: Database Foundation
├── households + household_members tables + RLS
├── Extend handle_new_user to create default household (or lazy creation)
├── HouseholdsDB class
├── household-context.ts helper
└── Verify: existing features unaffected (habits, tasks, projects)

Phase 2: Plaid Connection Pipeline
├── plaid_items table + accounts table + RLS
├── lib/plaid/ directory (client, encryption, link-token, token-exchange)
├── PlaidItemsDB + AccountsDB classes
├── API routes: /api/plaid/link-token, /api/plaid/exchange-token
├── PlaidLinkButton component
├── Accounts page (app/money/accounts/)
└── Verify: bank account connects and appears in list

Phase 3: Transaction Sync + Display
├── transactions table + categories table + RLS
├── lib/plaid/sync.ts (cursor-based sync)
├── lib/plaid/webhook-verify.ts
├── API route: /api/plaid/webhooks
├── TransactionsDB + CategoriesDB classes
├── API route: /api/money/transactions (paginated)
├── Transaction list + filters components
├── Transactions page (app/money/transactions/)
├── Vercel Cron setup (sync-transactions)
└── Verify: transactions appear after bank connection

Phase 4: Money Hub + Navigation
├── Sidebar nav item addition
├── Money layout (app/money/layout.tsx)
├── Money overview API + page
├── Balance summary + spending chart components
├── lib/money/arithmetic.ts + format.ts
├── i18n translations (money.* namespace, all 3 locales)
├── Calm Finance design tokens
└── Verify: navigate to /money, see overview with real data

Phase 5: Budgets
├── budgets table + RLS
├── BudgetsDB class
├── API routes: /api/money/budgets
├── Budget card, list, form components
├── Budgets page
└── Verify: create budget, see spending progress

Phase 6: Bills & Goals
├── recurring_bills + savings_goals tables + RLS
├── BillsDB + GoalsDB classes
├── API routes + components + pages
└── Verify: bills auto-detected from transactions, goals trackable

Phase 7: Household / Couples
├── Invite flow (send invite, accept, join household)
├── Shared vs individual views
├── Household settings page
└── Verify: partner sees shared transactions, existing single-user unaffected

Phase 8: AI Insights (future)
├── Contextual insights embedded in money views
├── Cash flow projections
└── Spending anomaly detection
```

**Why this order:**
1. Households first because every money table references `household_id`
2. Plaid before transactions because transactions come from Plaid
3. Transactions before budgets because budgets aggregate transactions
4. Hub/nav after transactions because the overview needs data to display
5. Bills/goals after budgets because they share the category and amount patterns
6. Couples last because single-user works first, multi-user is additive
7. AI insights last because they require historical data to be meaningful

## Anti-Patterns Specific to BetterR.Me Integration

### Anti-Pattern 1: Modifying Existing DB Classes for Money

**What people do:** Add `getHouseholdTransactions()` to the existing `TasksDB` class or add `household_id` to the `Profile` type.

**Why it's wrong:** Couples habits/tasks with money features. A bug in money code could break existing passing tests. The two domains have different access patterns (`user_id` vs `household_id`).

**Do this instead:** Create new DB classes (`AccountsDB`, `TransactionsDB`). Keep existing classes untouched. The only shared infrastructure is the Supabase client constructor pattern.

### Anti-Pattern 2: Adding household_id to Existing Tables

**What people do:** Add `household_id` to the `habits`, `tasks`, or `projects` tables "for future couples features."

**Why it's wrong:** Existing RLS policies use `user_id = auth.uid()`. Adding `household_id` requires rewriting all existing RLS policies and updating every existing DB query. Massive risk of data leakage during migration.

**Do this instead:** Habits, tasks, and projects remain individual (user_id-scoped). Only money features use household_id. If users ever want shared habits/tasks, that is a separate future milestone with its own migration.

### Anti-Pattern 3: Using SWR Mutate for Transaction Sync

**What people do:** Call `mutate()` from a webhook handler to update the transaction list in real time.

**Why it's wrong:** Webhooks run server-side. SWR cache is client-side. There is no direct connection. The webhook handler cannot reach into the user's browser SWR cache.

**Do this instead:** Webhook triggers server-side sync (writes to DB). Next time the client's SWR hook revalidates (focus, interval, or manual refresh), it picks up the new data. Add a "Refresh" button that calls `mutate()` for manual revalidation.

### Anti-Pattern 4: Storing Money as Floating-Point Numbers

**What people do:** Use `NUMERIC(10,2)` or `REAL` columns and JavaScript `number` type for amounts.

**Why it's wrong:** `0.1 + 0.2 !== 0.3` in JavaScript. Even PostgreSQL `NUMERIC` requires careful handling. The existing codebase uses plain `number` for everything (streak counts, sort orders) -- developers will naturally extend this pattern to money.

**Do this instead:** Store as integer cents (`BIGINT`). Parse user input with `decimal.js`. Format for display with `decimal.js`. The integer arithmetic path (add, subtract, compare) uses safe native JavaScript operations.

### Anti-Pattern 5: Sharing Plaid API Keys via Client-Side Code

**What people do:** Put `PLAID_SECRET` in `NEXT_PUBLIC_*` environment variables or import `lib/plaid/client.ts` in a `"use client"` component.

**Why it's wrong:** Plaid secret key in client bundle = anyone can access any user's bank data.

**Do this instead:** All Plaid API calls happen in API routes (server-only). The client only interacts with Plaid through the Plaid Link SDK (which uses the short-lived `link_token`). Never prefix Plaid keys with `NEXT_PUBLIC_`.

## Sources

- [Plaid Transactions Sync Documentation](https://plaid.com/docs/transactions/sync-migration/) -- cursor-based sync pattern (HIGH confidence -- official docs)
- [Plaid Link Web SDK](https://plaid.com/docs/link/web/) -- link token flow (HIGH confidence -- official docs)
- [Plaid Webhooks](https://plaid.com/docs/transactions/webhooks/) -- webhook handling (HIGH confidence -- official docs)
- [Plaid Webhook Verification](https://plaid.com/docs/api/webhooks/webhook-verification/) -- JWT verification (HIGH confidence -- official docs)
- [Supabase Row-Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) -- RLS patterns (HIGH confidence -- official docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) -- background sync scheduling (HIGH confidence -- official docs)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) -- household-scoped RLS (HIGH confidence -- official docs)
- Existing BetterR.Me codebase analysis (HabitsDB, TasksDB, ProjectsDB, SWR hooks, API routes) -- integration patterns (HIGH confidence -- direct code review)
- moneyy.me architecture research (`.planning/research/ARCHITECTURE.md`) -- adapted for BetterR.Me constraints (HIGH confidence -- prior research, verified against codebase)

---
*Architecture research for: Money tracking integration into BetterR.Me*
*Researched: 2026-02-21*
