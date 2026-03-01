# Phase 20: Transaction Management & Categorization - Research

**Researched:** 2026-02-22
**Domain:** Transaction list UI, search/filter, auto-categorization, merchant rules, category management
**Confidence:** HIGH

## Summary

Phase 20 builds the transaction browsing, search/filter, and categorization layer on top of the Phase 19 Plaid pipeline. The existing codebase already has a `transactions` table with Plaid PFCv2 category columns (`plaid_category_primary`, `plaid_category_detailed`), a `categories` table (system defaults with `household_id IS NULL`, custom with household scope), a `TransactionsDB` class with basic query/filter support, and a `GET /api/money/transactions` endpoint. The primary work is: (1) extending the DB layer for cursor-based pagination, keyword search (ilike across description/merchant_name), amount range, and total count; (2) building new DB tables for merchant category rules and transaction splits; (3) building the transaction list UI with date grouping, sticky headers, and detail interaction; (4) building filter bar with URL-persisted state; (5) implementing the merchant rule engine for category overrides.

The tech stack is well-established from Phase 18/19: Supabase (PostgREST ilike + or filter for search), SWR `useSWRInfinite` for paginated data fetching, `useSearchParams` for URL filter persistence, react-hook-form + zod for forms, and the existing Calm Finance design tokens. No new dependencies are needed except potentially `nuqs` for type-safe URL search params (Claude's discretion).

**Primary recommendation:** Use offset-based pagination (not cursor-based) with Supabase `select('*', { count: 'exact' })` + `.range()` for the API layer, and `useSWRInfinite` with a "Load More" button pattern on the client. Keyword search uses Supabase `.or('description.ilike.%term%,merchant_name.ilike.%term%')`. Persist all filters in URL query params. Add `merchant_category_rules` and `transaction_splits` tables via new migration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Transaction list layout: Claude's discretion on layout style (compact table vs card rows) -- research competitor patterns (Mint, Monarch, Copilot, Lunch Money) and pick what fits Calm Finance design system
- Transactions grouped by date with sticky date headers (Today, Yesterday, Jan 15, etc.)
- Amounts show both color and sign: green +$500 for income, red -$42.50 for spending
- Transaction detail view: Claude's discretion on detail interaction pattern (inline expand vs side panel vs bottom sheet) -- research competitor patterns and pick best fit
- Detail view should support category override, notes, split info, and account info
- Top horizontal filter bar above the transaction list, always visible
- Active filters displayed as removable chips below the filter bar with a "Clear all" button
- Search is instant with ~300ms debounce -- filters results as user types
- All filters persist in URL query params (?category=food&dateFrom=2026-01-01) -- bookmarkable, survives refresh
- Filters: date range, amount range, category, account, keyword search
- Categories have emoji/icon + color dot for visual identification
- When user overrides a transaction's category, a toast/popover asks: "Always categorize [merchant] as [category]?" -- user confirms to create merchant rule, or skips
- Create/assign categories inline from transaction detail view
- Manage categories (hide defaults, view merchant rules) in a lightweight money settings section
- Custom categories are household-scoped (shared between partners)
- Transaction splitting: Claude's discretion on split UI pattern -- pick simplest effective approach
- Split amounts must total the original transaction amount

### Claude's Discretion
- Transaction list layout style (research competitors first)
- Transaction detail interaction pattern (research competitors first)
- Transaction split UI design
- Loading skeletons and empty states
- Exact spacing, typography, and Calm Finance token usage
- Pagination UX (cursor-based, load-more vs infinite scroll)
- Mobile-specific adaptations

### Deferred Ideas (OUT OF SCOPE)
- CSV import (TXNS-07) -- deferred to a future phase
- Manual transaction entry (TXNS-08) -- already exists from Phase 19
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TXNS-01 | User can view a cursor-paginated list of all transactions across accounts | Supabase `.select('*', { count: 'exact' }).range()` + `useSWRInfinite` for progressive loading; date-grouped layout with sticky headers |
| TXNS-02 | User can search transactions by keyword, date range, amount range, and category | Supabase `.or('description.ilike.%term%,merchant_name.ilike.%term%')` for keyword, `.gte/.lte` for date/amount ranges, `.eq` for category; URL-persisted filters |
| TXNS-03 | User can filter transactions by account | Supabase `.eq('account_id', id)` filter; existing `TransactionQueryOptions.accountId` already supports this |
| TXNS-04 | User can manually override the category of any transaction | `PATCH /api/money/transactions/[id]` endpoint; merchant rule prompt on override; `merchant_category_rules` table |
| TXNS-05 | User can create custom categories (household-scoped) | `categories` table already exists with `household_id` FK; new API endpoints for CRUD; emoji/icon + color dot fields |
| TXNS-06 | User can split a transaction across multiple categories | `transaction_splits` table; split UI in detail view; validation that splits sum to original amount |
| TXNS-07 | CSV import (DEFERRED) | Out of scope per user decision |
| TXNS-08 | Manual transaction entry (ALREADY EXISTS) | Phase 19 `ManualTransactionDialog` already implements this |
| CATG-01 | Transactions auto-categorized using Plaid PFCv2 on sync | Already implemented in `lib/plaid/sync.ts` -- maps `personal_finance_category.primary` to `category` column; need to map PFCv2 primary names to our system category names |
| CATG-02 | Merchant-name rule engine: user corrections auto-apply to future transactions | `merchant_category_rules` table (household_id, merchant_name, category_id); check rules during sync and on transaction insert |
| CATG-03 | System default categories cannot be deleted, only hidden; custom categories are household-scoped | `categories.is_system` flag exists; add `is_hidden` column per household; custom categories use `household_id` FK |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | ^2.x | DB queries, ilike search, or filter, pagination | Already used throughout; PostgREST provides `.ilike()`, `.or()`, `.range()`, `{ count: 'exact' }` |
| SWR | ^2.x | Client data fetching with `useSWRInfinite` | Already used; `useSWRInfinite` handles paginated/infinite loading natively |
| react-hook-form | ^7.x | Category create form, split form | Already used in `ManualTransactionDialog` |
| zod | ^3.x | API boundary validation | Already used in `lib/validations/` |
| next-intl | ^4.x | i18n for all new UI strings | Already used; must add to en, zh, zh-TW |
| decimal.js | ^10.x | Money arithmetic (cents conversion) | Already used in `lib/money/arithmetic.ts` |
| Tailwind CSS 3 | ^3.x | Styling with Calm Finance tokens | Already configured with `--money-*` CSS variables |
| lucide-react | ^0.x | Icons for categories, filters, actions | Already used throughout |

### Supporting (May Add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nuqs | ^2.x | Type-safe URL search params state management | If `useSearchParams` + manual serialization proves too verbose; provides `useQueryState` with built-in parsers for numbers, dates, strings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nuqs | Plain useSearchParams + URLSearchParams | nuqs adds type safety and throttled updates; plain approach is zero-dependency but more boilerplate |
| Supabase ilike | PostgreSQL full-text search (tsvector) | FTS is better for large datasets but requires GIN index + migration; ilike is simpler and sufficient for transaction keyword search at typical personal finance scale (<50k rows per household) |
| useSWRInfinite | TanStack Query useInfiniteQuery | SWR already in project; no reason to add TanStack Query |

**Installation (if nuqs chosen):**
```bash
pnpm add nuqs
```

## Architecture Patterns

### Recommended New Files/Modules

```
lib/db/
├── transactions.ts           # Extended: add search, cursor pagination, count, update
├── categories-db.ts          # NEW: CategoriesDB class (CRUD, hide/show, household-scoped)
├── merchant-rules.ts         # NEW: MerchantRulesDB class (rule lookup, create, list)
├── transaction-splits.ts     # NEW: TransactionSplitsDB class (CRUD for splits)
├── types.ts                  # Extended: Category, MerchantRule, TransactionSplit types

lib/validations/
├── money.ts                  # Extended: category, merchant rule, split schemas
├── transactions.ts           # NEW: transaction search/filter query schema

app/api/money/
├── transactions/
│   ├── route.ts              # Extended: enhanced GET with search/filter, total count
│   └── [id]/
│       ├── route.ts          # NEW: GET (detail), PATCH (category override, notes)
│       └── splits/
│           └── route.ts      # NEW: GET/POST/DELETE for transaction splits
├── categories/
│   ├── route.ts              # NEW: GET (list), POST (create custom)
│   └── [id]/
│       └── route.ts          # NEW: PATCH (update), DELETE (delete custom only)
├── merchant-rules/
│   └── route.ts              # NEW: GET (list rules), POST (create rule)
│   └── [id]/
│       └── route.ts          # NEW: DELETE (remove rule)

app/money/
├── transactions/
│   ├── page.tsx              # NEW: Transactions page (server page + client list)
│   └── layout.tsx            # NEW: Layout (if needed)

components/money/
├── transaction-list.tsx       # NEW: Main transaction list with date grouping
├── transaction-row.tsx        # NEW: Single transaction row (compact card)
├── transaction-detail.tsx     # NEW: Detail panel (inline expand or side panel)
├── transaction-filter-bar.tsx # NEW: Horizontal filter bar with chips
├── transaction-search.tsx     # NEW: Search input with debounce
├── category-badge.tsx         # NEW: Emoji + color dot category display
├── category-override.tsx      # NEW: Category change + merchant rule prompt
├── category-split-form.tsx    # NEW: Split transaction UI
├── category-manager.tsx       # NEW: Category settings (hide/show, merchant rules)

lib/hooks/
├── use-transactions.ts        # NEW: useSWRInfinite hook for paginated transactions
├── use-categories.ts          # NEW: SWR hook for categories list
├── use-transaction-filters.ts # NEW: URL search params management for filters
```

### Pattern 1: Offset Pagination with Count via Supabase

**What:** Use Supabase `select('*', { count: 'exact' })` with `.range(offset, offset + limit - 1)` for server-side pagination with total count. The API returns `{ transactions, total, hasMore }`.

**When to use:** Transaction list endpoint -- enables "Load More" button with accurate total display.

**Example:**
```typescript
// In TransactionsDB.getByHousehold (extended)
async getByHousehold(
  householdId: string,
  options?: TransactionQueryOptions
): Promise<{ transactions: Transaction[]; total: number }> {
  let query = this.supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("household_id", householdId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Apply filters...
  if (options?.search) {
    query = query.or(
      `description.ilike.%${options.search}%,merchant_name.ilike.%${options.search}%`
    );
  }
  if (options?.amountMin !== undefined) {
    query = query.gte("amount_cents", options.amountMin);
  }
  if (options?.amountMax !== undefined) {
    query = query.lte("amount_cents", options.amountMax);
  }

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { transactions: data || [], total: count ?? 0 };
}
```

### Pattern 2: useSWRInfinite for "Load More" Pagination

**What:** Use SWR's `useSWRInfinite` hook with offset-based `getKey` function. Each page fetches the next batch. A "Load More" button increments the page size.

**When to use:** Transaction list client component.

**Example:**
```typescript
// Source: Context7 /vercel/swr-site -- useSWRInfinite cursor-based pagination
import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/fetcher";

const PAGE_SIZE = 50;

function useTransactions(filters: TransactionFilters) {
  const searchParams = new URLSearchParams();
  if (filters.search) searchParams.set("search", filters.search);
  if (filters.category) searchParams.set("category", filters.category);
  if (filters.accountId) searchParams.set("account_id", filters.accountId);
  if (filters.dateFrom) searchParams.set("date_from", filters.dateFrom);
  if (filters.dateTo) searchParams.set("date_to", filters.dateTo);
  searchParams.set("limit", String(PAGE_SIZE));

  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && !previousPageData.hasMore) return null;
    searchParams.set("offset", String(pageIndex * PAGE_SIZE));
    return `/api/money/transactions?${searchParams.toString()}`;
  };

  const { data, error, size, setSize, isLoading, isValidating } =
    useSWRInfinite(getKey, fetcher, { keepPreviousData: true });

  const transactions = data ? data.flatMap((page) => page.transactions) : [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = transactions.length < total;

  return {
    transactions,
    total,
    hasMore,
    isLoading,
    isLoadingMore: isValidating && size > 1,
    loadMore: () => setSize(size + 1),
    mutate: () => {/* from useSWRInfinite */},
  };
}
```

### Pattern 3: URL Filter Persistence with useSearchParams

**What:** Store all active filters in URL query params using Next.js `useSearchParams` + `useRouter`. Filters are bookmarkable and survive page refresh.

**When to use:** Transaction filter bar component.

**Example:**
```typescript
"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

function useTransactionFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = {
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    accountId: searchParams.get("account_id") || "",
    dateFrom: searchParams.get("date_from") || "",
    dateTo: searchParams.get("date_to") || "",
    amountMin: searchParams.get("amount_min") || "",
    amountMax: searchParams.get("amount_max") || "",
  };

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const clearAll = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  return { filters, setFilter, clearAll };
}
```

### Pattern 4: Merchant Category Rule Engine

**What:** When a user overrides a transaction's category, prompt to create a merchant rule. On future Plaid syncs, check rules before defaulting to Plaid's category.

**When to use:** Category override flow + sync pipeline.

**Example (rule application during sync):**
```typescript
// In sync.ts, after mapping Plaid transactions
// Check merchant rules before inserting
async function applyMerchantRules(
  transactions: TransactionInsert[],
  householdId: string,
  supabase: SupabaseClient
): Promise<TransactionInsert[]> {
  const merchantNames = [...new Set(
    transactions.map(t => t.merchant_name).filter(Boolean)
  )] as string[];

  if (merchantNames.length === 0) return transactions;

  const { data: rules } = await supabase
    .from("merchant_category_rules")
    .select("merchant_name, category_id, categories(name)")
    .eq("household_id", householdId)
    .in("merchant_name_lower", merchantNames.map(n => n.toLowerCase()));

  if (!rules?.length) return transactions;

  const ruleMap = new Map(rules.map(r => [r.merchant_name_lower, r]));

  return transactions.map(txn => {
    if (txn.merchant_name) {
      const rule = ruleMap.get(txn.merchant_name.toLowerCase());
      if (rule) {
        return { ...txn, category: rule.categories.name };
      }
    }
    return txn;
  });
}
```

### Pattern 5: Transaction Splitting

**What:** A `transaction_splits` table stores split entries. Each split has `transaction_id`, `category_id`, `amount_cents`, and optional `notes`. Splits must sum to the original transaction's `amount_cents`.

**When to use:** Transaction detail view when user clicks "Split".

**DB Schema:**
```sql
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_splits_transaction ON transaction_splits(transaction_id);
```

### Anti-Patterns to Avoid

- **Client-side filtering of full dataset:** Never fetch all transactions and filter in JS. Always filter server-side via Supabase query params.
- **Silent merchant rules:** Never auto-create merchant rules without user confirmation. The user decided rules should be prompted via toast/popover.
- **Full-text search (tsvector) for keyword search:** Overkill for personal finance transaction search. ilike across description + merchant_name is sufficient and simpler.
- **Cursor-based pagination with opaque cursors:** Supabase's PostgREST doesn't natively support opaque cursors. Use offset-based `.range()` with `{ count: 'exact' }` instead -- this is the standard Supabase pattern.
- **Storing category as free text:** The existing `category` column is `TEXT`. For Phase 20, link to `categories.id` via a proper FK, or at minimum keep a `category_id UUID` alongside the text for consistency. The migration must handle the transition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL search param sync | Custom serialization/deserialization | `useSearchParams` + `URLSearchParams` (or `nuqs`) | Edge cases with encoding, browser history, and SSR hydration |
| Debounced search | Custom debounce hook | Existing `lib/hooks/use-debounce.ts` | Already exists in codebase, tested |
| Money formatting | Custom string formatter | Existing `formatMoney()` from `lib/money/arithmetic.ts` | Handles negatives, commas, cents conversion correctly |
| Pagination data fetching | Custom page state management | `useSWRInfinite` from `swr/infinite` | Handles cache, dedup, revalidation, page management automatically |
| Form validation | Custom field validators | `react-hook-form` + `zod` schemas | Already the project pattern; handles nested validation, error messages |

**Key insight:** The existing codebase has mature patterns for SWR data fetching, form validation, money formatting, and debouncing. The new work is in wiring these together for the transaction list UI and building the category/merchant-rule DB layer.

## Common Pitfalls

### Pitfall 1: Category Column Text vs FK Mismatch
**What goes wrong:** The existing `transactions.category` is a `TEXT` column storing Plaid PFCv2 primary names like "FOOD_AND_DRINK". The `categories` table has UUIDs. Joining or filtering by category requires mapping between these.
**Why it happens:** Phase 18 created a stub `category TEXT` column; Phase 19 populated it with Plaid's raw primary category string.
**How to avoid:** Add a `category_id UUID REFERENCES categories(id)` column to transactions. Keep the `category` TEXT column for display/search but add the FK for proper relational queries. Seed system categories matching Plaid PFCv2 primary names. Migration must populate `category_id` from existing `category` text values.
**Warning signs:** Filters returning wrong results; categories not matching between transactions and category management UI.

### Pitfall 2: Search Injection via ilike
**What goes wrong:** User search input containing `%` or `_` characters could create unintended SQL patterns.
**Why it happens:** Supabase's `.ilike()` passes the pattern directly to PostgreSQL ILIKE.
**How to avoid:** Escape special characters in search input before passing to `.or()`. Replace `%` with `\%` and `_` with `\_`.
**Warning signs:** Search for "100%" returning unexpected results.

### Pitfall 3: Split Amount Validation Off by Cents
**What goes wrong:** Split amounts don't sum to the original transaction due to floating-point rounding.
**Why it happens:** If amounts are entered as dollars and converted to cents independently, rounding errors can create a mismatch.
**How to avoid:** Validate split amounts in cents (BIGINT) and enforce exact sum match server-side. Use `decimal.js` for conversion. The last split gets the remainder.
**Warning signs:** "Splits must equal total" error appearing intermittently.

### Pitfall 4: useSWRInfinite Key Instability
**What goes wrong:** Changing filters causes `useSWRInfinite` to not reset properly, showing stale data from previous filter state.
**Why it happens:** The `getKey` function captures filter values in closure; SWR caches by key.
**How to avoid:** Include all filter values in the SWR key. When filters change, reset `size` back to 1. Use `keepPreviousData: true` for smooth transitions.
**Warning signs:** Old transactions appearing when switching filters; stale count values.

### Pitfall 5: Merchant Name Normalization
**What goes wrong:** Merchant rules don't match because "Starbucks" vs "STARBUCKS" vs "Starbucks #1234" are treated as different merchants.
**Why it happens:** Plaid merchant names vary in casing and may include location identifiers.
**How to avoid:** Store `merchant_name_lower` (lowercased) in the rules table. Match using lowercased comparison. Consider stripping trailing `#\d+` patterns for better matching.
**Warning signs:** User creates a rule for "Starbucks" but transactions from "STARBUCKS #12345" are not matched.

### Pitfall 6: Category Hide State is Per-Household, Not Global
**What goes wrong:** Hiding a system default category affects all users if stored on the category row itself.
**Why it happens:** System categories have `household_id IS NULL` -- they're shared globally.
**How to avoid:** Create a `hidden_categories` junction table (`household_id`, `category_id`) or add a JSONB array of hidden category IDs to a household preferences table. Never modify the shared system category rows.
**Warning signs:** One household hiding "Entertainment" hides it for all households.

## Code Examples

### Supabase ilike OR Search
```typescript
// Source: Context7 /supabase/supabase-js -- .or() filter with ilike
const { data, error, count } = await supabase
  .from("transactions")
  .select("*", { count: "exact" })
  .eq("household_id", householdId)
  .or(`description.ilike.%${escapedSearch}%,merchant_name.ilike.%${escapedSearch}%`)
  .order("transaction_date", { ascending: false })
  .range(0, 49);
```

### Escape ilike Special Characters
```typescript
function escapeIlike(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
```

### useSWRInfinite with Filters
```typescript
// Source: Context7 /vercel/swr-site -- useSWRInfinite
import useSWRInfinite from "swr/infinite";

const PAGE_SIZE = 50;

function getKey(
  filters: Record<string, string>,
  pageIndex: number,
  previousPageData: { transactions: any[]; total: number; hasMore: boolean } | null
) {
  if (previousPageData && !previousPageData.hasMore) return null;
  const params = new URLSearchParams(filters);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(pageIndex * PAGE_SIZE));
  return `/api/money/transactions?${params.toString()}`;
}
```

### Date Grouping for Transaction List
```typescript
interface DateGroup {
  label: string; // "Today", "Yesterday", "Feb 20", "Jan 15, 2025"
  date: string;  // YYYY-MM-DD
  transactions: Transaction[];
}

function groupByDate(transactions: Transaction[], today: string): DateGroup[] {
  const groups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    const existing = groups.get(txn.transaction_date) || [];
    existing.push(txn);
    groups.set(txn.transaction_date, existing);
  }

  return Array.from(groups.entries()).map(([date, txns]) => ({
    label: formatDateLabel(date, today),
    date,
    transactions: txns,
  }));
}

function formatDateLabel(date: string, today: string): string {
  if (date === today) return "Today";
  // Calculate yesterday from today...
  // Otherwise format as "Feb 20" (same year) or "Feb 20, 2025" (different year)
}
```

### Plaid PFCv2 Primary Categories to Seed
```typescript
// Source: Plaid PFCv2 taxonomy CSV (https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv)
const PLAID_PFC_PRIMARY_CATEGORIES = [
  { name: "INCOME",                icon: "💰", color: "#4CAF50" },
  { name: "TRANSFER_IN",           icon: "📥", color: "#2196F3" },
  { name: "TRANSFER_OUT",          icon: "📤", color: "#FF9800" },
  { name: "LOAN_PAYMENTS",         icon: "🏦", color: "#795548" },
  { name: "BANK_FEES",             icon: "🏛️", color: "#9E9E9E" },
  { name: "ENTERTAINMENT",         icon: "🎬", color: "#E91E63" },
  { name: "FOOD_AND_DRINK",        icon: "🍔", color: "#FF5722" },
  { name: "GENERAL_MERCHANDISE",   icon: "🛍️", color: "#9C27B0" },
  { name: "HOME_IMPROVEMENT",      icon: "🏠", color: "#3F51B5" },
  { name: "MEDICAL",               icon: "🏥", color: "#F44336" },
  { name: "PERSONAL_CARE",         icon: "💅", color: "#FF4081" },
  { name: "GENERAL_SERVICES",      icon: "🔧", color: "#607D8B" },
  { name: "GOVERNMENT_AND_NON_PROFIT", icon: "🏛️", color: "#455A64" },
  { name: "TRANSPORTATION",        icon: "🚗", color: "#00BCD4" },
  { name: "TRAVEL",                icon: "✈️", color: "#009688" },
  { name: "RENT_AND_UTILITIES",    icon: "🏠", color: "#8BC34A" },
] as const;
```

## Discretion Recommendations

### Transaction List Layout: Compact Card Rows (Recommended)
**Research finding:** Monarch Money, Copilot, and Lunch Money all use a compact card-row pattern rather than a traditional data table. Each row shows: merchant/description (primary text), category badge (icon + label), date (secondary text), and amount (right-aligned, color-coded). This pattern works well on both desktop and mobile without needing a responsive table strategy.

**Recommendation for Calm Finance:** Use compact card rows with left-aligned icon + text and right-aligned amount. Each row is ~48-56px tall. Date group headers are sticky `<div>` elements with semi-transparent background. This fits the Calm Finance muted aesthetic better than a data table (which feels clinical/anxious).

### Transaction Detail: Inline Expand (Recommended)
**Research finding:** Copilot uses a side panel (right drawer). Monarch uses an inline expand. Lunch Money uses a modal. For Calm Finance, inline expand is the least disruptive option -- the row expands to show category override, notes, split info, and account info. No navigation away from the list context.

**Recommendation:** Inline expand pattern. Clicking a transaction row expands it to ~200px, showing: category selector (with override prompt), notes field, split button, account name, Plaid category info (if available). Clicking again or pressing Escape collapses it.

### Pagination UX: "Load More" Button (Recommended)
**Research finding:** Infinite scroll causes issues with footer visibility, back-button behavior, and a11y. "Load More" is explicit, preservable in URL state, and works well with `useSWRInfinite`.

**Recommendation:** Show 50 transactions initially, with a "Load More" button at the bottom showing "Showing X of Y transactions". The button calls `setSize(size + 1)`.

### Split UI: Inline Split Form (Recommended)
**Recommendation:** In the expanded transaction detail, a "Split" button opens an inline form within the expanded area. The form shows the original amount and lets the user add split rows (category selector + amount input). A running "remaining" amount shows what's unallocated. The last split auto-fills the remainder. Simple, no modal needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plaid legacy categories (hierarchical string arrays) | PFCv2 (primary + detailed enum) | Dec 2025 | Cleaner primary categories, confidence_level field; existing code already uses PFCv2 format |
| Client-side transaction filtering | Server-side Supabase query with URL-persisted filters | Industry standard 2024+ | Better performance, bookmarkable URLs, no large client-side dataset |
| Modal-based transaction detail | Inline expand / side panel | 2024+ trend in finance apps | Less context-switching, faster interaction |

**Deprecated/outdated:**
- Plaid legacy category hierarchy (string arrays like `["Food and Drink", "Restaurants"]`) -- replaced by PFCv2's `personal_finance_category.primary` + `.detailed` enum. The project already uses PFCv2.

## New Database Schema Required

### Migration: Add category_id, merchant rules, splits, hidden categories

```sql
-- 1. Add category_id FK to transactions
ALTER TABLE transactions
  ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_category ON transactions(category_id);

-- 2. Add color and display_name to categories (for emoji/icon + color dot)
ALTER TABLE categories
  ADD COLUMN color TEXT,
  ADD COLUMN display_name TEXT;

-- 3. Merchant category rules table
CREATE TABLE merchant_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  merchant_name_lower TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, merchant_name_lower)
);

CREATE INDEX idx_merchant_rules_household ON merchant_category_rules(household_id);
CREATE INDEX idx_merchant_rules_lookup ON merchant_category_rules(household_id, merchant_name_lower);

-- 4. Transaction splits table
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_splits_transaction ON transaction_splits(transaction_id);

-- 5. Hidden categories junction table
CREATE TABLE hidden_categories (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, category_id)
);

-- 6. Add notes column to transactions
ALTER TABLE transactions ADD COLUMN notes TEXT;

-- 7. RLS for new tables
ALTER TABLE merchant_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_categories ENABLE ROW LEVEL SECURITY;

-- Standard household RLS pattern (IN-subquery, same as existing money tables)
CREATE POLICY "Household members can view merchant_category_rules"
  ON merchant_category_rules FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));
-- ... INSERT, UPDATE, DELETE policies follow same pattern

CREATE POLICY "Household members can view transaction_splits"
  ON transaction_splits FOR SELECT TO authenticated
  USING (transaction_id IN (
    SELECT id FROM transactions WHERE household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = (SELECT auth.uid())
    )
  ));
-- ... INSERT, UPDATE, DELETE policies follow same pattern

CREATE POLICY "Household members can view hidden_categories"
  ON hidden_categories FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid())
  ));
-- ... INSERT, DELETE policies follow same pattern

-- 8. Seed system default categories from Plaid PFCv2 primary taxonomy
INSERT INTO categories (household_id, name, icon, is_system, color, display_name) VALUES
  (NULL, 'INCOME', '💰', true, '#4CAF50', 'Income'),
  (NULL, 'TRANSFER_IN', '📥', true, '#2196F3', 'Transfer In'),
  (NULL, 'TRANSFER_OUT', '📤', true, '#FF9800', 'Transfer Out'),
  (NULL, 'LOAN_PAYMENTS', '🏦', true, '#795548', 'Loan Payments'),
  (NULL, 'BANK_FEES', '🏛️', true, '#9E9E9E', 'Bank Fees'),
  (NULL, 'ENTERTAINMENT', '🎬', true, '#E91E63', 'Entertainment'),
  (NULL, 'FOOD_AND_DRINK', '🍔', true, '#FF5722', 'Food & Drink'),
  (NULL, 'GENERAL_MERCHANDISE', '🛍️', true, '#9C27B0', 'Shopping'),
  (NULL, 'HOME_IMPROVEMENT', '🏠', true, '#3F51B5', 'Home Improvement'),
  (NULL, 'MEDICAL', '🏥', true, '#F44336', 'Medical'),
  (NULL, 'PERSONAL_CARE', '💅', true, '#FF4081', 'Personal Care'),
  (NULL, 'GENERAL_SERVICES', '🔧', true, '#607D8B', 'Services'),
  (NULL, 'GOVERNMENT_AND_NON_PROFIT', '🏛️', true, '#455A64', 'Government'),
  (NULL, 'TRANSPORTATION', '🚗', true, '#00BCD4', 'Transportation'),
  (NULL, 'TRAVEL', '✈️', true, '#009688', 'Travel'),
  (NULL, 'RENT_AND_UTILITIES', '🏠', true, '#8BC34A', 'Rent & Utilities')
ON CONFLICT DO NOTHING;

-- 9. Triggers
CREATE TRIGGER update_merchant_rules_updated_at
  BEFORE UPDATE ON merchant_category_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Open Questions

1. **Category ID backfill for existing transactions**
   - What we know: Existing Plaid-synced transactions have `category TEXT` with values like "FOOD_AND_DRINK". The migration seeds system categories with matching `name` values.
   - What's unclear: Should the migration include an UPDATE to backfill `category_id` from the text `category` column, or should this be done lazily?
   - Recommendation: Include a backfill UPDATE in the migration: `UPDATE transactions SET category_id = c.id FROM categories c WHERE c.name = transactions.category AND c.is_system = true`. This ensures existing transactions are properly linked.

2. **Amount sign convention for search/display**
   - What we know: Our DB uses positive = income, negative = expense (inverted from Plaid). User wants green +$500 for income, red -$42.50 for spending.
   - What's unclear: Should the amount range filter work on absolute values or signed values? E.g., searching "$10-$50" -- does this mean spending of $10-$50 (negative in DB) or income?
   - Recommendation: Filter by absolute value by default. The filter bar shows "Amount: $10 - $50" which matches transactions where `ABS(amount_cents) BETWEEN 1000 AND 5000`. Add a "type" filter (income/expense) separately.

3. **Merchant rule matching granularity**
   - What we know: Plaid merchant names can vary (e.g., "STARBUCKS #12345" vs "Starbucks"). User wants rules to "stick".
   - What's unclear: Should rules match exact merchant name or use fuzzy/prefix matching?
   - Recommendation: Start with exact case-insensitive match on `merchant_name_lower`. If insufficient, consider stripping trailing `#\d+` and location suffixes in a follow-up. Keep it simple for v1.

## Sources

### Primary (HIGH confidence)
- Context7 `/vercel/swr-site` -- useSWRInfinite API, cursor-based pagination getKey pattern
- Context7 `/supabase/supabase-js` -- ilike, or filter, range, count, select API
- Plaid PFCv2 taxonomy CSV (https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv)
- Existing codebase: `lib/db/transactions.ts`, `lib/plaid/sync.ts`, `lib/money/arithmetic.ts`, `lib/hooks/use-debounce.ts`

### Secondary (MEDIUM confidence)
- Plaid PFCv2 migration guide (https://plaid.com/docs/transactions/pfc-migration/) -- PFCv2 category structure and opt-in
- Supabase full text search docs (https://supabase.com/docs/guides/database/full-text-search) -- ilike vs FTS comparison
- Supabase discussion #6778 (https://github.com/orgs/supabase/discussions/6778) -- multi-column ilike or pattern
- nuqs documentation (https://nuqs.dev/) -- type-safe URL search params
- Next.js useSearchParams docs (https://nextjs.org/docs/app/api-reference/functions/use-search-params)

### Tertiary (LOW confidence)
- Competitor UX research (Monarch, Copilot, Lunch Money) -- based on WebSearch summaries and marketing descriptions, not direct UI inspection. Layout and interaction recommendations are informed by general finance app UX best practices rather than verified implementation details.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, patterns well-documented in Context7
- Architecture: HIGH -- extends existing patterns (DB class, API route, SWR hook, component) with well-understood additions
- Pitfalls: HIGH -- based on direct codebase analysis (category TEXT vs FK mismatch, ilike escaping, merchant name normalization)
- UX/Layout recommendations: MEDIUM -- based on general research and competitor summaries, not direct UI verification

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable domain, no fast-moving dependencies)
