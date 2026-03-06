# Phase 25: Data Management & Polish - Research

**Researched:** 2026-02-24
**Domain:** CSV export, data deletion, household membership cleanup, Plaid revocation
**Confidence:** HIGH

## Summary

Phase 25 has two well-scoped requirements: (1) CSV export of transactions with selectable date range, and (2) full money data deletion with household membership removal. Both features build directly on existing codebase patterns with no new libraries or external integrations needed.

The CSV export leverages the existing `TransactionsDB.getByHouseholdFiltered()` query with date range filters already implemented. The deletion feature leverages the PostgreSQL `ON DELETE CASCADE` chain from the `households` table, which automatically removes all related money data (accounts, transactions, budgets, bills, goals, net worth snapshots, etc.) when a household is deleted. The main complexity is the pre-deletion cleanup: revoking all Plaid access tokens, removing Vault secrets, and handling solo vs. multi-member household scenarios.

**Primary recommendation:** Use server-side CSV generation (no library -- plain string building with proper escaping), and a multi-step deletion flow that revokes Plaid tokens before cascading the household delete via adminClient.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MGMT-01 | User can export transactions as CSV with selectable date range | Server-side API endpoint generates CSV from existing `TransactionsDB.getByHouseholdFiltered()` with date filters. Client triggers download via fetch + blob. No new libraries needed -- CSV format is simple enough for hand-rolled string building with proper escaping. |
| MGMT-02 | User can delete their money data and household membership | Admin-client cascade delete of household (all money tables use `ON DELETE CASCADE` from households). Pre-delete: revoke all Plaid tokens, remove Vault secrets. Solo users delete household directly; multi-member users leave household first (existing `removeMember` pattern), then delete their new solo household. |
</phase_requirements>

## Standard Stack

### Core

No new libraries are needed. This phase uses only existing project dependencies.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js API routes | 16 | CSV generation endpoint, delete endpoint | Already in project |
| Supabase admin client | existing | Cascade delete bypassing RLS | Already in `lib/supabase/admin.ts` |
| Plaid SDK | existing | Token revocation (`itemRemove`) | Already in `lib/plaid/client.ts` |
| Zod | existing | Request validation for date range and confirmation | Already in `lib/validations/` |
| next-intl | existing | i18n for export/delete UI strings | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| decimal.js | existing | `centsToDecimal()` for CSV amount formatting | Export amounts in dollars, not cents |
| lucide-react | existing | Download/Trash icons for UI buttons | Export and delete action buttons |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled CSV | `papaparse` or `csv-stringify` | For 2 columns that need escaping (description, merchant_name), a 15-line escape function is simpler than adding a dependency. No nested objects, no complex types. |
| Server-side CSV generation | Client-side generation | Server-side is better: (1) no limit/offset pagination needed, (2) consistent encoding, (3) user does not need to load all transactions into browser memory. |
| Fetch+blob download | `<a href="/api/export">` link | Fetch+blob allows better error handling and loading states in the UI. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
app/api/money/
├── export/
│   └── route.ts              # GET - CSV export with date range query params
├── delete-data/
│   └── route.ts              # POST - Delete all money data + household
lib/
├── money/
│   └── csv-export.ts         # Pure function: Transaction[] -> CSV string
├── validations/
│   └── data-management.ts    # Zod schemas for export/delete
components/money/
├── export-transactions-dialog.tsx    # Date range picker + download button
├── delete-money-data-dialog.tsx      # Confirmation dialog with typed confirmation
i18n/messages/
├── en.json                   # money.export.* and money.deleteData.* keys
├── zh.json
└── zh-TW.json
```

### Pattern 1: Server-Side CSV Generation

**What:** API route queries all transactions for a date range, formats as CSV, returns with `Content-Type: text/csv` and `Content-Disposition: attachment` headers.

**When to use:** Whenever exporting tabular data that could exceed browser memory limits or needs consistent server-side formatting.

**Example:**
```typescript
// app/api/money/export/route.ts
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await resolveHousehold(supabase, user.id);
  const searchParams = request.nextUrl.searchParams;
  const dateFrom = searchParams.get("date_from") || undefined;
  const dateTo = searchParams.get("date_to") || undefined;

  const transactionsDB = new TransactionsDB(supabase);
  // Fetch ALL transactions in range (no limit/offset)
  const { transactions } = await transactionsDB.getByHouseholdFiltered(
    householdId, user.id, "mine",
    { dateFrom, dateTo, limit: 10000, offset: 0 }
  );

  const csv = transactionsToCsv(transactions);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${dateFrom || "all"}-${dateTo || "all"}.csv"`,
    },
  });
}
```

### Pattern 2: CSV String Building with Proper Escaping

**What:** Pure function that converts Transaction[] to a CSV string. Handles RFC 4180 escaping (double quotes around fields containing commas, quotes, or newlines).

**When to use:** When generating CSV from typed data without external dependencies.

**Example:**
```typescript
// lib/money/csv-export.ts
import { centsToDecimal } from "@/lib/money/arithmetic";
import type { Transaction } from "@/lib/db/types";

const CSV_HEADERS = [
  "Date", "Description", "Merchant", "Amount", "Category", "Account", "Source", "Notes"
];

function escapeCsvField(value: string | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // RFC 4180: if field contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const tx of transactions) {
    rows.push([
      tx.transaction_date,
      escapeCsvField(tx.description),
      escapeCsvField(tx.merchant_name),
      centsToDecimal(tx.amount_cents),
      escapeCsvField(tx.category),
      tx.account_id, // Could be enriched with account name via join
      tx.source,
      escapeCsvField(tx.notes),
    ].join(","));
  }
  return rows.join("\n");
}
```

### Pattern 3: Cascade Delete with Pre-Cleanup

**What:** Before deleting the household (which cascades to all money tables), revoke all Plaid access tokens and remove Vault secrets. Uses adminClient for cross-table operations.

**When to use:** When deleting a top-level entity that has external integrations (Plaid tokens in Vault) that CASCADE won't clean up.

**Example:**
```typescript
// Deletion flow for solo user (only member of household):
// 1. Revoke all Plaid tokens (itemRemove for each bank_connection)
// 2. Remove all Vault secrets
// 3. Delete household (CASCADE removes all money tables)
// 4. Create new empty household (user still needs one for future use)

// For multi-member user:
// 1. Leave household (existing removeMember creates new solo household)
// 2. Then delete the new solo household as above
// OR: Only delete their owned data within the household
```

### Pattern 4: Typed Confirmation for Destructive Actions

**What:** Require user to type a specific word (e.g., "DELETE") in a dialog before executing the deletion. This is a standard UX pattern for irreversible destructive actions.

**When to use:** Any action that permanently deletes data with no undo.

**Example:**
```typescript
// Zod schema for delete confirmation
export const deleteMoneyDataSchema = z.object({
  confirmation: z.literal("DELETE"),
});
```

### Anti-Patterns to Avoid

- **Client-side CSV generation from paginated data:** Don't try to page through all transactions on the client and build CSV in the browser. This wastes bandwidth and may hit memory limits. Generate CSV server-side where you have direct DB access.
- **Deleting tables one by one manually:** Don't write delete statements for each money table. The schema uses `ON DELETE CASCADE` from `households` -- deleting the household handles all child tables automatically.
- **Soft delete for GDPR-style data removal:** The requirement says "delete", not "archive". Use hard delete. The CASCADE chain ensures no orphaned records.
- **Forgetting to revoke Plaid tokens before delete:** If you delete the household first, the `bank_connections` rows (and their `vault_secret_name`) are gone, and you can't retrieve the access tokens to revoke them. Always revoke BEFORE cascade delete.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping | Full CSV parser | Simple `escapeCsvField()` function (15 lines) | Transaction CSV has only string/number fields -- no nested objects, no binary data, no multi-line cell content beyond merchant names. A simple RFC 4180 escape function is sufficient. |
| Date range picker | Custom date inputs | Use existing shadcn/ui `Calendar` + `Popover` components | Already in the project's UI toolkit, consistent with existing date pickers in filter panels. |
| Confirmation dialog | Custom modal | Extend existing shadcn/ui `AlertDialog` | Consistent with existing delete confirmation patterns in the app. |

**Key insight:** Both features in this phase are straightforward compositions of existing patterns (DB queries, admin client operations, UI dialogs). The risk is not technical complexity but ensuring the deletion flow handles edge cases (Plaid cleanup, multi-member households) correctly.

## Common Pitfalls

### Pitfall 1: Forgetting Plaid Token Revocation Before Household Delete

**What goes wrong:** Household is deleted (cascade removes bank_connections), but Plaid still has active tokens that will continue to generate webhooks and potentially charge API fees.

**Why it happens:** The `ON DELETE CASCADE` chain is so convenient that developers forget about external system cleanup.

**How to avoid:** The delete endpoint MUST: (1) fetch all bank_connections for the household, (2) revoke each Plaid token via `itemRemove`, (3) remove each Vault secret, (4) THEN delete the household. Use try/catch per connection (same pattern as existing disconnect route) -- a single failed revocation should not block the overall deletion.

**Warning signs:** Plaid webhook errors after user deletion, continued Plaid API billing.

### Pitfall 2: Export Timeout for Large Transaction Sets

**What goes wrong:** User with 2+ years of transactions exports all data, the API route times out on Vercel (30s default for serverless functions).

**Why it happens:** No limit on the date range, and the query returns tens of thousands of rows.

**How to avoid:** Set a reasonable upper limit (e.g., 10,000 transactions per export). If the user has more, suggest narrowing the date range. The Vercel function timeout is 30s for Hobby, 60s for Pro -- a 10K row query + CSV generation should complete well within this.

**Warning signs:** Slow export responses, 504 Gateway Timeout errors.

### Pitfall 3: Multi-Member Household Delete Edge Case

**What goes wrong:** User in a multi-member household tries to "delete all money data" -- should this delete the entire shared household's data, or just their portion?

**Why it happens:** Ambiguity in the requirement "delete their money data and household membership."

**How to avoid:** For multi-member households: the user LEAVES the household (existing `removeMember` pattern moves their owned accounts/data to a new solo household). Then the new solo household is deleted. This preserves the partner's data. For solo users: delete the household directly (all data is theirs). The UI should clearly communicate what will happen.

**Warning signs:** Partner loses data when one person deletes their account.

### Pitfall 4: CSV Encoding Issues for Non-ASCII Characters

**What goes wrong:** Merchant names with accented characters (e.g., "Cafe Crepe") or CJK characters display as garbled text when opened in Excel.

**Why it happens:** Excel defaults to local encoding, not UTF-8, when opening CSV files.

**How to avoid:** Prepend a UTF-8 BOM (`\uFEFF`) at the start of the CSV content. This signals to Excel and other spreadsheet applications that the file is UTF-8 encoded. This is the standard approach for CSV files that may be opened in Excel.

**Warning signs:** Garbled characters in Excel, works fine in Google Sheets (which always assumes UTF-8).

### Pitfall 5: Race Condition Between Export and Concurrent Mutations

**What goes wrong:** User exports transactions while a Plaid sync is in progress, resulting in incomplete or inconsistent data.

**Why it happens:** No transactional isolation between the export query and ongoing sync operations.

**How to avoid:** This is acceptable behavior -- document it as a snapshot-in-time export. The CSV reflects transactions at the moment the query executes. No special handling needed, but the UI should note "Export reflects current data."

## Code Examples

### CSV Export API Route (Full Pattern)

```typescript
// app/api/money/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB } from "@/lib/db";
import { transactionsToCsv } from "@/lib/money/csv-export";
import { log } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from") || undefined;
    const dateTo = searchParams.get("date_to") || undefined;

    const transactionsDB = new TransactionsDB(supabase);
    const { transactions } = await transactionsDB.getByHouseholdFiltered(
      householdId, user.id, "mine",
      { dateFrom, dateTo, limit: 10000, offset: 0 }
    );

    const csv = transactionsToCsv(transactions);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="betterrme-transactions-${dateFrom || "all"}-to-${dateTo || "all"}.csv"`,
      },
    });
  } catch (error) {
    log.error("GET /api/money/export error", error);
    return NextResponse.json(
      { error: "Failed to export transactions" },
      { status: 500 }
    );
  }
}
```

### Delete Money Data API Route (Full Pattern)

```typescript
// app/api/money/delete-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHousehold } from "@/lib/db/households";
import { HouseholdsDB, BankConnectionsDB } from "@/lib/db";
import { createPlaidClient } from "@/lib/plaid/client";
import { getAccessToken, removeAccessToken } from "@/lib/plaid/token-exchange";
import { deleteMoneyDataSchema } from "@/lib/validations/data-management";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteMoneyDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const householdId = await resolveHousehold(supabase, user.id);
    const householdsDB = new HouseholdsDB(supabase);

    // Check if multi-member household
    const memberCount = await householdsDB.getMemberCount(householdId);

    if (memberCount > 1) {
      // Leave household first (creates new solo household, moves owned data)
      await householdsDB.removeMember(householdId, user.id, adminClient);

      // Get the new solo household
      const newHouseholdId = await resolveHousehold(adminClient, user.id);

      // Revoke Plaid tokens for connections in new household
      await revokeAllPlaidTokens(newHouseholdId, adminClient);

      // Delete the new solo household (CASCADE cleans up moved data)
      await adminClient.from("households").delete().eq("id", newHouseholdId);

      // Remove the membership too
      await adminClient.from("household_members").delete().eq("user_id", user.id);
    } else {
      // Solo user: revoke tokens, then delete household
      await revokeAllPlaidTokens(householdId, adminClient);
      await adminClient.from("household_members").delete().eq("household_id", householdId);
      await adminClient.from("households").delete().eq("id", householdId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/money/delete-data error", error);
    return NextResponse.json(
      { error: "Failed to delete money data" },
      { status: 500 }
    );
  }
}

async function revokeAllPlaidTokens(householdId: string, adminClient: SupabaseClient) {
  const { data: connections } = await adminClient
    .from("bank_connections")
    .select("id, vault_secret_name")
    .eq("household_id", householdId)
    .neq("status", "disconnected");

  if (!connections || connections.length === 0) return;

  const plaidClient = createPlaidClient();

  for (const conn of connections) {
    try {
      const accessToken = await getAccessToken(conn.id, adminClient);
      await plaidClient.itemRemove({ access_token: accessToken });
    } catch (error) {
      log.warn("Failed to revoke Plaid token during data deletion", {
        bank_connection_id: conn.id,
        error: String(error),
      });
    }

    try {
      await removeAccessToken(conn.id, adminClient);
    } catch (error) {
      log.warn("Failed to remove Vault secret during data deletion", {
        bank_connection_id: conn.id,
        error: String(error),
      });
    }
  }
}
```

### Client-Side Download Trigger

```typescript
// Pattern for triggering CSV download from a client component
async function handleExport(dateFrom: string, dateTo: string) {
  setIsExporting(true);
  try {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    const response = await fetch(`/api/money/export?${params.toString()}`);
    if (!response.ok) throw new Error("Export failed");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(t("export.error"));
  } finally {
    setIsExporting(false);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side CSV with `new Blob()` | Server-side CSV generation returned as Response | Current best practice | Avoids loading all data into browser memory, better for large datasets |
| Manual delete of each table | `ON DELETE CASCADE` from parent table | PostgreSQL native feature | Single DELETE statement cascades to all child tables, no orphaned records |
| Soft delete (mark as deleted) | Hard delete for data removal features | GDPR-era best practice | When user explicitly requests deletion, truly delete the data |

**Deprecated/outdated:**
- None relevant to this phase. CSV generation and cascade delete are stable patterns.

## Open Questions

1. **Account names in CSV export**
   - What we know: The `Transaction` type includes `account_id` but not the account name. Including the account name makes the CSV more useful.
   - What's unclear: Whether to do a join in the DB query or a separate accounts lookup.
   - Recommendation: Fetch accounts list separately (small query, already cached in most flows), build a name lookup map, and use it during CSV generation. This avoids modifying the existing `TransactionsDB.getByHouseholdFiltered()` method.

2. **Export row limit**
   - What we know: Vercel serverless functions have 30s (Hobby) or 60s (Pro) timeout. A 10K row CSV should generate in <5s.
   - What's unclear: The actual maximum transaction count for heavy users.
   - Recommendation: Set limit at 10,000 rows. If total exceeds this, return a header or error suggesting the user narrow the date range. Can be revisited if users hit the limit.

3. **Post-deletion user state**
   - What we know: After deleting all money data, the user should still be able to use the rest of the app (habits, tasks). The money section should show the empty/onboarding state.
   - What's unclear: Whether to auto-create a new household immediately or lazily on next money feature access.
   - Recommendation: Lazy creation (existing `resolveHousehold()` pattern) -- it already creates a household on first access. After deletion, the next visit to any money page will trigger household creation via `resolveHousehold()`.

## Sources

### Primary (HIGH confidence)

- **Codebase analysis** - Direct examination of:
  - `supabase/migrations/20260221000001_create_households.sql` - CASCADE delete chain from households
  - `supabase/migrations/20260221000002_create_money_tables.sql` - All money tables reference households ON DELETE CASCADE
  - `supabase/migrations/20260222000001_add_categories_and_splits.sql` - merchant_rules, splits, hidden_categories all CASCADE
  - `supabase/migrations/20260223000001_create_budgets.sql` - budgets, budget_categories CASCADE
  - `supabase/migrations/20260223000002_create_bills_goals_net_worth.sql` - bills, goals, net_worth CASCADE
  - `supabase/migrations/20260224_dashboard_insights.sql` - dismissed_insights, income_patterns CASCADE
  - `lib/db/transactions.ts` - `TransactionsDB.getByHouseholdFiltered()` with date range support
  - `lib/db/households.ts` - `HouseholdsDB.removeMember()` for multi-member scenarios
  - `lib/plaid/token-exchange.ts` - `getAccessToken()` and `removeAccessToken()` patterns
  - `app/api/money/accounts/[id]/disconnect/route.ts` - Plaid revocation + Vault cleanup pattern
  - `lib/money/arithmetic.ts` - `centsToDecimal()` for amount formatting

### Secondary (MEDIUM confidence)

- **RFC 4180** - CSV format specification (standard, well-known)
- **UTF-8 BOM for Excel compatibility** - Standard practice documented across multiple sources

### Tertiary (LOW confidence)

- None. All findings verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, all patterns exist in codebase
- Architecture: HIGH - Direct extension of existing API route, DB class, and UI patterns
- Pitfalls: HIGH - Identified from direct analysis of CASCADE chain and Plaid integration code

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable domain, no fast-moving dependencies)
