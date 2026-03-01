# Phase 18: Database Foundation & Household Schema - Research

**Researched:** 2026-02-21
**Domain:** Supabase schema design (household-scoped RLS), money arithmetic, UI foundation (design tokens, sidebar, i18n)
**Confidence:** HIGH

## Summary

Phase 18 is the infrastructure foundation for all money features (Phases 19-25). It creates four technical layers: (1) Supabase database schema with household-scoped RLS for multi-tenant data isolation, (2) money arithmetic library using decimal.js with integer-cents storage, (3) UI foundation with Calm Finance design tokens and sidebar navigation, and (4) i18n money namespace across all three locales.

The codebase already has well-established patterns for every concern: DB classes (`lib/db/*.ts`), RLS migrations (`supabase/migrations/`), sidebar navigation (`components/layouts/app-sidebar.tsx`), CSS custom properties (`app/globals.css`), API route patterns (`app/api/*/route.ts`), Zod validation (`lib/validations/`), and i18n (`i18n/messages/*.json`). Phase 18 follows these patterns exactly — no new paradigms needed.

**Primary recommendation:** Follow existing project patterns precisely. The household schema uses Supabase's `IN`-subquery RLS pattern (not joins) for performance. Money amounts are BIGINT cents in Postgres, converted via decimal.js at the API boundary. The admin client (`lib/supabase/admin.ts`) uses `SUPABASE_SERVICE_ROLE_KEY` and must never be imported in client code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Calm Finance visual identity**: Primary palette is soft sage/seafoam — very desaturated, almost grey-green. Calming, minimal, spa-like feel
- **Negative amounts**: muted amber/warm tone. Amber for expenses, teal/sage for income. Gentle contrast, no red/green
- **No aggressive colors** anywhere in money views
- **Sidebar position**: after Projects (Dashboard > Habits > Projects > Money) — NOTE: current sidebar has Dashboard > Habits > Tasks; Projects not yet in sidebar. Money goes after Tasks in current sidebar order
- **Sub-navigation**: single "Money" link to `/money` for Phase 18. Sub-items added as feature phases ship
- **Visibility**: visible to all users immediately, no feature flag. Household auto-creates on first visit
- **Empty state**: welcome message with connect-bank prompt. Calm, friendly tone (e.g., "Your calm financial picture starts here")
- **Interim state** (Phase 18, before Plaid ships in Phase 19): CTA says "Bank connection coming soon" — honest about current state
- **Amount display**: always full precision ($1,234.56, $0.07, $10.00), always two decimal places, always USD ($), negative = minus prefix (-$1,234.56), standard comma grouping

### Claude's Discretion
- Exact sage/seafoam and amber shade selection (CSS custom properties)
- Dark mode palette adjustments
- Visual zone treatment (tinted vs subtle separation)
- Sidebar icon choice (Lucide)
- Branded header text for /money page
- Loading skeleton design
- Error state handling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUN-01 | Household schema with `households` and `household_members` tables, RLS policies gating all money tables through `household_id` | Supabase IN-subquery RLS pattern (verified via Context7 official docs), migration pattern matching existing codebase (`supabase/migrations/`), detailed schema design below |
| FOUN-02 | All money amounts stored as integer cents (BIGINT), with `lib/money/arithmetic.ts` for cents-to-display conversion using decimal.js | decimal.js API verified (toFixed, ROUND_HALF_UP), BIGINT Postgres column type, conversion functions documented in Code Examples |
| FOUN-03 | Service-role Supabase admin client (`lib/supabase/admin.ts`) for cron jobs and webhook handlers that bypass RLS | Supabase admin client pattern verified via Context7 — createClient with SERVICE_ROLE_KEY, disables auth persistence, bypasses RLS inherently |
| FOUN-04 | `resolveHousehold()` helper derives household_id server-side from authenticated user — never from client input | Pattern follows existing `ensureProfile()` in `lib/db/ensure-profile.ts` — check-then-insert with race condition handling (23505 unique_violation) |
| FOUN-05 | Sidebar navigation includes "Money" top-level item with sub-navigation to money pages | Existing `mainNavItems` array in `app-sidebar.tsx` — add new entry with Lucide icon, `href: "/money"`, path matching |
| FOUN-06 | Calm Finance design tokens (`--money-*` CSS variables) for money views — muted teal/amber palette | Existing CSS custom property pattern in `app/globals.css` with `:root` and `.dark` variants, already has 100+ tokens as reference |
| FOUN-07 | i18n `money.*` namespace with all money UI strings in en, zh, zh-TW | Existing pattern: `i18n/messages/{en,zh,zh-TW}.json` with nested namespaces, `useTranslations("money")` / `getTranslations("money")` |
| FOUN-08 | Default household auto-created for each user on first money feature access (lazy creation) | `resolveHousehold()` implementation — same as FOUN-04, called in API routes and/or money page server components |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.95.2 | DB client (browser, server, admin) | Already in project, official Supabase client |
| @supabase/ssr | ^0.8.0 | Server-side Supabase with cookie handling | Already in project for Next.js SSR |
| decimal.js | latest | Money arithmetic (cents ↔ display) | Decision from STATE.md; arbitrary precision, no floating-point errors |
| lucide-react | ^0.511.0 | Sidebar icon for money | Already in project, used throughout sidebar |
| next-intl | ^4.8.2 | i18n for money strings | Already in project for all locales |
| zod | ^3.25.46 | Validation schemas at API boundaries | Already in project for all API routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwind-merge | ^3.3.0 | CSS class merging | Combining money-specific classes with existing |
| class-variance-authority | ^0.7.1 | Component variants | If money components need variants |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| decimal.js | dinero.js | dinero.js is money-specific but adds another dependency; decimal.js is simpler and was explicitly chosen in STATE.md decisions |
| decimal.js | Native BigInt | BigInt cannot do division/display formatting — still need decimal.js for cents→display |
| BIGINT cents | NUMERIC(19,4) | STATE.md explicitly warns: "Supabase `numeric` type causes silent float precision loss — use BIGINT cents only" |

**Installation:**
```bash
pnpm add decimal.js
```

No other new packages needed — everything else is already in the project.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── supabase/
│   ├── client.ts          # Browser client (existing)
│   ├── server.ts          # Server client with cookies (existing)
│   ├── proxy.ts           # Middleware client (existing)
│   └── admin.ts           # NEW: Service-role client (bypasses RLS)
├── db/
│   ├── types.ts           # Add Household, HouseholdMember types
│   ├── households.ts      # NEW: HouseholdsDB class
│   └── index.ts           # Re-export new modules
├── money/
│   └── arithmetic.ts      # NEW: cents ↔ display conversion, formatting
├── validations/
│   └── money.ts           # NEW: Zod schemas for money amounts
└── hooks/
    └── use-household.ts   # NEW: SWR hook for resolveHousehold (if needed)

supabase/migrations/
├── 20260221000001_create_households.sql       # households + household_members
├── 20260221000002_create_money_tables.sql     # accounts, transactions, categories (stubs)
└── 20260221000003_add_money_rls_policies.sql  # RLS with household_id IN-subquery

app/
├── money/
│   ├── layout.tsx         # Money layout with Calm Finance tokens
│   └── page.tsx           # Money page shell (empty state)
├── api/money/
│   └── household/route.ts # resolveHousehold endpoint

components/
└── money/
    └── money-page-shell.tsx  # Empty state with "coming soon" messaging

i18n/messages/
├── en.json    # Add "money" namespace
├── zh.json    # Add "money" namespace
└── zh-TW.json # Add "money" namespace
```

### Pattern 1: Household-Scoped RLS (IN-Subquery)
**What:** All money tables use `household_id` FK. RLS policies check membership via IN-subquery (NOT joins) for performance.
**When to use:** Every money table SELECT/INSERT/UPDATE/DELETE policy.
**Example:**
```sql
-- Source: Context7 /supabase/supabase - RLS best practices
-- Performance: IN-subquery is 99.78% faster than join-based RLS

CREATE POLICY "Users can view household transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    household_id IN (
      SELECT household_id
      FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert household transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id IN (
      SELECT household_id
      FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  );
```

### Pattern 2: Service-Role Admin Client
**What:** A server-only Supabase client using `SUPABASE_SERVICE_ROLE_KEY` that bypasses RLS entirely.
**When to use:** Cron jobs, webhook handlers, and any server operation that needs to access data without user context.
**Example:**
```typescript
// lib/supabase/admin.ts
// Source: Context7 /supabase/supabase - admin client pattern
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

**CRITICAL:** This key must NEVER appear in client-side code. The env var `SUPABASE_SERVICE_ROLE_KEY` (without `NEXT_PUBLIC_` prefix) ensures Next.js does not bundle it for the browser.

### Pattern 3: Lazy Household Creation (resolveHousehold)
**What:** On first money access, auto-create a household for the user. Same check-then-insert pattern as `ensureProfile()`.
**When to use:** Every API route in `/api/money/*` calls `resolveHousehold()` to get `household_id`.
**Example:**
```typescript
// lib/db/households.ts — follows ensureProfile pattern
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // 1. Check for existing membership
  const { data: membership, error: selectError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single();

  if (membership) return membership.household_id;

  // PGRST116 = not found — expected for first-time users
  if (selectError && selectError.code !== "PGRST116") {
    throw selectError;
  }

  // 2. Create household + membership in sequence
  const { data: household, error: insertError } = await supabase
    .from("households")
    .insert({ name: "My Household" })
    .select("id")
    .single();

  if (insertError) throw insertError;

  const { error: memberError } = await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });

  if (memberError) {
    // 23505 = unique_violation — race condition, another request created it
    if (memberError.code === "23505") {
      const { data: retry } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .single();
      if (retry) return retry.household_id;
    }
    throw memberError;
  }

  return household.id;
}
```

### Pattern 4: Money Arithmetic (Integer Cents)
**What:** Store all amounts as BIGINT cents in Postgres. Convert at API boundary using decimal.js.
**When to use:** Every money amount in the system.
**Example:**
```typescript
// lib/money/arithmetic.ts
import Decimal from "decimal.js";

// Configure for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Convert dollar amount to integer cents. $10.33 → 1033 */
export function toCents(dollars: number | string): number {
  return new Decimal(dollars).times(100).round().toNumber();
}

/** Convert integer cents to dollar string. 1033 → "$10.33" */
export function formatMoney(cents: number): string {
  const dollars = new Decimal(cents).dividedBy(100).toFixed(2);
  const isNegative = cents < 0;
  const absValue = Math.abs(parseFloat(dollars));
  const formatted = absValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-$${formatted}` : `$${formatted}`;
}

/** Convert integer cents to raw dollar number. 1033 → 10.33 */
export function centsToDecimal(cents: number): string {
  return new Decimal(cents).dividedBy(100).toFixed(2);
}

/** Add two cent amounts safely */
export function addCents(a: number, b: number): number {
  return a + b; // Integer addition — no precision issues
}

/** Subtract cent amounts safely */
export function subtractCents(a: number, b: number): number {
  return a - b;
}
```

### Pattern 5: Sidebar Navigation Extension
**What:** Add "Money" to the existing `mainNavItems` array in `app-sidebar.tsx`.
**When to use:** One-time addition in Phase 18.
**Example:**
```typescript
// In components/layouts/app-sidebar.tsx
// Add to mainNavItems array, after tasks:
{
  href: "/money",
  icon: Wallet, // from lucide-react — calm, simple
  labelKey: "money",
  match: (p: string) => p.startsWith("/money"),
},
```

### Anti-Patterns to Avoid
- **NEVER use `numeric`/`decimal` Postgres types for money:** Per STATE.md: "Supabase `numeric` type causes silent float precision loss — use BIGINT cents only"
- **NEVER pass `household_id` from client:** Always derive server-side from authenticated user via `resolveHousehold()`
- **NEVER use join-based RLS policies:** Use `IN`-subquery pattern — 99.78% faster per Supabase docs
- **NEVER import admin client in browser code:** `SUPABASE_SERVICE_ROLE_KEY` bypasses ALL RLS
- **NEVER use floating point for money display:** Always use `decimal.js` for cents → display conversion
- **NEVER mix household creation with feature logic:** `resolveHousehold()` is called in API routes, not in components

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal arithmetic | Manual float math | decimal.js | Floating point causes $0.1 + $0.2 = $0.30000000000000004 |
| Money formatting | Template literals | `formatMoney()` via decimal.js | Locale-aware comma grouping, sign handling, always 2 decimals |
| RLS policy patterns | Custom auth middleware | Supabase RLS with IN-subquery | Database-level security, cannot be bypassed by app bugs |
| Admin operations | Manual token injection | Service-role admin client | Supabase provides proper bypass, no RLS policy hacks needed |
| Race condition handling | Locks or mutexes | Postgres unique_violation catch (23505) | Database handles concurrency; app just retries on conflict |

**Key insight:** Every money-related operation has well-established patterns in Supabase + decimal.js. The codebase already demonstrates the exact patterns needed (see `ensureProfile()`, existing RLS policies, existing CSS tokens). The work is applying known patterns to new tables — not inventing new patterns.

## Common Pitfalls

### Pitfall 1: Float Precision in Money Amounts
**What goes wrong:** Using JavaScript `number` or Postgres `numeric` causes silent rounding errors: `0.1 + 0.2 !== 0.3`
**Why it happens:** IEEE 754 floating-point representation cannot exactly represent most decimal fractions
**How to avoid:** Store as BIGINT cents in Postgres, use decimal.js for all conversions, never multiply/divide native JS numbers for money
**Warning signs:** Tests pass with round numbers ($10.00) but fail with edge cases ($0.07, $19.99)

### Pitfall 2: RLS Policy Performance with Joins
**What goes wrong:** Naive RLS policy that joins `household_members` to target table is 450x slower than IN-subquery
**Why it happens:** Postgres query planner treats join-based RLS differently; it scans the full joined table before applying the filter
**How to avoid:** Always use `household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid()))` pattern
**Warning signs:** Money pages load slowly under normal usage (>500ms for simple queries)

### Pitfall 3: Service-Role Key Exposure
**What goes wrong:** If `SUPABASE_SERVICE_ROLE_KEY` is prefixed with `NEXT_PUBLIC_`, it gets bundled into client JavaScript
**Why it happens:** Next.js convention: `NEXT_PUBLIC_*` vars are inlined at build time for the browser
**How to avoid:** Use `SUPABASE_SERVICE_ROLE_KEY` (no prefix). Only import `admin.ts` in server-side code (API routes, server components). Throw if the key is missing rather than silently failing
**Warning signs:** Build output includes the service role key (check bundle analysis)

### Pitfall 4: Household Race Conditions
**What goes wrong:** Two simultaneous requests from the same user both try to create a household, causing duplicate entries or errors
**Why it happens:** No row exists on first check, both requests proceed to insert
**How to avoid:** Use the same pattern as `ensureProfile()`: catch Postgres error code 23505 (unique_violation) and re-query. Add `UNIQUE(user_id)` constraint on `household_members` to ensure one membership per user per household
**Warning signs:** Duplicate households appearing in database, intermittent 500 errors on first money page visit

### Pitfall 5: Missing Dark Mode Tokens
**What goes wrong:** Money pages look fine in light mode but broken in dark mode — wrong contrast, invisible text
**Why it happens:** Adding CSS custom properties to `:root` but forgetting the `.dark` variants
**How to avoid:** For every `--money-*` token added to `:root`, add a corresponding dark mode version in `.dark`. Test both modes during development
**Warning signs:** Visual regression tests pass in light mode only

### Pitfall 6: i18n Key Mismatch Across Locales
**What goes wrong:** Money page renders key strings like "money.pageTitle" instead of translated text
**Why it happens:** Adding keys to en.json but forgetting zh.json or zh-TW.json
**How to avoid:** Add all money keys to all three locale files simultaneously. Consider creating a test that verifies key parity across locales
**Warning signs:** Pages show raw translation keys, errors in console about missing translations

## Code Examples

Verified patterns from the existing codebase:

### Supabase Migration Pattern (from existing codebase)
```sql
-- Follows pattern from 20260219000001_create_projects_table.sql
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- Index for the RLS IN-subquery pattern
CREATE INDEX idx_household_members_user_id ON household_members(user_id);
CREATE INDEX idx_household_members_household_id ON household_members(household_id);

-- RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their households"
  ON households FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can view their memberships"
  ON household_members FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Reuse existing trigger
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Money Table Stubs (minimal for Phase 18)
```sql
-- Phase 18 only creates the schema structure.
-- These tables will be populated by Phase 19+ but need to exist
-- so the RLS pattern and types are established from day one.

CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- Phase 19 fills in Plaid-specific columns
  provider TEXT NOT NULL DEFAULT 'plaid',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'checking',
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  description TEXT NOT NULL,
  merchant_name TEXT,
  category TEXT,
  transaction_date DATE NOT NULL,
  is_pending BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE, -- NULL = system default
  name TEXT NOT NULL,
  icon TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bank_connections_household ON bank_connections(household_id);
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(household_id, transaction_date);
CREATE INDEX idx_categories_household ON categories(household_id);

-- RLS for all money tables (same pattern)
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Template policy (apply to each table):
CREATE POLICY "Household members can view bank_connections"
  ON bank_connections FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));
-- ... INSERT, UPDATE, DELETE policies follow same pattern
```

### API Route Pattern (from existing codebase)
```typescript
// app/api/money/household/route.ts
// Follows pattern from app/api/projects/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    return NextResponse.json({ household_id: householdId });
  } catch (error) {
    log.error("GET /api/money/household error", error);
    return NextResponse.json(
      { error: "Failed to resolve household" },
      { status: 500 }
    );
  }
}
```

### CSS Design Token Pattern (from existing globals.css)
```css
/* In app/globals.css — :root section */
/* === Calm Finance tokens === */
--money-sage: 155 25% 55%;          /* primary sage/seafoam */
--money-sage-light: 155 20% 92%;    /* sage background tint */
--money-sage-foreground: 155 30% 25%; /* sage text */
--money-amber: 35 60% 55%;          /* expense/negative */
--money-amber-light: 35 40% 92%;    /* amber background tint */
--money-amber-foreground: 35 50% 30%; /* amber text */
--money-surface: 155 10% 98%;       /* money page surface tint */
--money-border: 155 15% 88%;        /* money card borders */

/* In .dark section */
--money-sage: 155 20% 50%;
--money-sage-light: 155 15% 16%;
--money-sage-foreground: 155 25% 75%;
--money-amber: 35 50% 55%;
--money-amber-light: 35 30% 16%;
--money-amber-foreground: 35 40% 70%;
--money-surface: 155 8% 15%;
--money-border: 155 10% 22%;
```

### Test Pattern for API Routes (from existing codebase)
```typescript
// tests/app/api/money/household/route.test.ts
// Follows pattern from tests/app/api/projects/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/money/household/route";

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
}));

describe("GET /api/money/household", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("should return household_id for authenticated user", async () => {
    mockResolveHousehold.mockResolvedValue("household-abc");
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.household_id).toBe("household-abc");
  });
});
```

### i18n Pattern (from existing en.json structure)
```json
{
  "money": {
    "nav": {
      "money": "Money"
    },
    "page": {
      "title": "Your Financial Picture",
      "subtitle": "A calm view of your finances"
    },
    "emptyState": {
      "heading": "Your calm financial picture starts here",
      "description": "Connect your bank accounts to see your complete financial overview in one peaceful place.",
      "comingSoon": "Bank connection coming soon",
      "comingSoonDescription": "We're building a seamless way to connect your accounts. Stay tuned."
    },
    "format": {
      "currency": "USD"
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Join-based RLS policies | IN-subquery RLS policies | Supabase docs 2024+ | 450x performance improvement for multi-tenant queries |
| `numeric`/`decimal` Postgres types for money | BIGINT cents + app-layer conversion | Industry standard | Eliminates silent precision loss |
| Custom auth middleware for tenant isolation | Supabase RLS at database level | Supabase standard | Security is at Postgres level, cannot be bypassed by app bugs |
| `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (no prefix) | Next.js standard | Prevents key from being bundled into client JS |

**Deprecated/outdated:**
- `supabaseAdmin` using anon key + `auth.setAuth()` — use service-role key directly instead
- Postgres `MONEY` type — non-standard, locale-dependent, avoid entirely

## Open Questions

1. **How many stub tables to create in Phase 18?**
   - What we know: Households + household_members definitely needed. Accounts, transactions, categories are referenced by later phases.
   - What's unclear: Whether to create ALL money table stubs now (including budgets, goals, bills from Phases 21-22) or only the tables immediately needed for Phase 19 (Plaid).
   - Recommendation: Create only households, household_members, bank_connections, accounts, transactions, and categories. These are the foundation that Phase 19 builds on. Later phases can add their own tables. Creating all stubs risks premature schema decisions.

2. **Should `resolveHousehold()` be called in the money layout (server component) or per-API-route?**
   - What we know: API routes are the standard auth check point. Server components can also call Supabase.
   - What's unclear: Whether to resolve household eagerly in the layout or lazily in each API route.
   - Recommendation: Call in API routes (consistent with existing pattern). The money page shell (empty state) doesn't need household_id — it just displays static content. Household resolution happens on first API call that needs data.

3. **Exact Lucide icon for Money sidebar item**
   - What we know: Available options include `Wallet`, `Wallet2`, `Landmark`, `PiggyBank`, `CircleDollarSign`, `HandCoins`, `Banknote`
   - What's unclear: Which best fits the "calm" aesthetic without being too playful or corporate
   - Recommendation: `Wallet` — simple, recognizable, clean lines, matches the minimal style of existing icons (Home, ClipboardList, ListChecks). Alternatively `Landmark` for a more abstract/institutional feel.

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/supabase` — RLS IN-subquery pattern, admin client creation, Vault secret storage
- Context7 `/mikemcl/decimal.js` — toFixed, rounding modes, decimal arithmetic API
- Existing codebase `supabase/migrations/` — 17 migration files demonstrating established patterns
- Existing codebase `lib/db/` — 11 files demonstrating DB class pattern with SupabaseClient DI
- Existing codebase `lib/db/ensure-profile.ts` — race condition handling pattern for lazy creation
- Existing codebase `components/layouts/app-sidebar.tsx` — sidebar navigation pattern
- Existing codebase `app/globals.css` — CSS custom property pattern (100+ tokens, light + dark)
- Existing codebase `i18n/messages/en.json` + `i18n/request.ts` — i18n setup with next-intl

### Secondary (MEDIUM confidence)
- Supabase docs on IN-subquery performance (99.78% improvement claim from official documentation via Context7)
- Supabase Vault blog post (2022-08-19) — `vault.create_secret()` API for encrypted storage

### Tertiary (LOW confidence)
- None — all findings verified through Context7 or codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project or explicitly chosen in STATE.md decisions
- Architecture: HIGH — every pattern maps directly to existing codebase patterns (migrations, DB classes, RLS, API routes, sidebar, CSS, i18n)
- Pitfalls: HIGH — identified from Supabase official docs (RLS performance), STATE.md warnings (numeric precision), and common money-handling gotchas

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable foundation — patterns unlikely to change)
