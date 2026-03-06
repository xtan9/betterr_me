# Phase 26: CSV Import & Integration Polish - Research

**Researched:** 2026-02-24
**Domain:** CSV file parsing, column mapping UI, transaction deduplication, net worth snapshot wiring
**Confidence:** HIGH

## Summary

Phase 26 is the final phase of v4.0 Money Tracking. It addresses three distinct deliverables: (1) CSV transaction import with column mapping and duplicate detection (TXNS-07), (2) wiring manual asset creation/update to trigger `NetWorthSnapshotsDB.upsert()` so non-Plaid users have current net worth history, and (3) creating the missing Phase 20 VERIFICATION.md. All three are well-scoped with clear boundaries.

The CSV import is the largest deliverable. The project already has CSV *export* infrastructure (`lib/money/csv-export.ts`) using RFC 4180 escaping, so the import should mirror those conventions. PapaParse is the standard library for browser-based CSV parsing -- it handles auto-delimiter detection, header parsing, streaming, and error reporting. The column mapping UI is a common pattern: parse the CSV client-side, let the user map detected headers to transaction fields, preview rows, then POST the mapped data to an API endpoint for server-side validation and insertion.

**Primary recommendation:** Use PapaParse for client-side CSV parsing, a multi-step wizard dialog (upload -> map columns -> preview -> import), and batch insert via `TransactionsDB.create()` in a loop with deduplication based on (date + amount + description) hash.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TXNS-07 | User can import transactions via CSV file upload with column mapping and duplicate detection | PapaParse for parsing; column mapping UI pattern; deduplication via composite hash of date+amount+description; batch POST to /api/money/transactions/import |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | 5.x | Browser-side CSV parsing | 2.3M weekly downloads, RFC 4180 compliant, auto-delimiter detection, TypeScript types via @types/papaparse, handles streaming/errors. Used by every major CSV import implementation in the JS ecosystem. |
| @types/papaparse | 5.5.x | TypeScript definitions for papaparse | DefinitelyTyped maintained, 2.3M weekly downloads |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | existing | Validate mapped CSV rows server-side | API boundary validation for imported transaction data |
| decimal.js | existing | Convert CSV dollar amounts to integer cents | `toCents()` from `lib/money/arithmetic.ts` |
| react-hook-form | existing | Multi-step form state if needed | Column mapping form management |
| sonner | existing | Toast notifications for import results | Success/error feedback during import |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PapaParse (client-side) | csv-parse (server-side, Node stream) | Server-side would prevent preview UI; client-side parsing enables instant preview and column mapping before network round-trip |
| PapaParse | d3-dsv | d3-dsv is smaller but lacks auto-delimiter detection, error reporting, and BOM handling that PapaParse provides out of the box |
| Custom hash dedup | Database UNIQUE constraint | Composite unique constraint on (household_id, date, amount, description) would block all "real" duplicates but also legitimate same-day same-amount purchases; hash-based client-side + server-side check is safer |

**Installation:**
```bash
pnpm add papaparse
pnpm add -D @types/papaparse
```

## Architecture Patterns

### Recommended Project Structure
```
lib/money/csv-import.ts          # Pure functions: parseCsvFile, detectDuplicates, mapRowToTransaction
lib/validations/csv-import.ts    # Zod schemas for import payload
app/api/money/transactions/import/route.ts  # POST endpoint for batch import
components/money/csv-import-dialog.tsx       # Multi-step wizard dialog
```

### Pattern 1: Client-Side Parse, Server-Side Insert
**What:** Parse CSV entirely in the browser using PapaParse. User maps columns via UI. Preview rows client-side. Then POST the mapped and validated data to the server for insertion.
**When to use:** Always for this feature -- enables instant preview without uploading the raw file to the server.
**Example:**
```typescript
// Source: PapaParse official docs + Context7
import Papa from "papaparse";

interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: Papa.ParseError[];
  rowCount: number;
}

export function parseCsvFile(file: File): Promise<ParsedCsvResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      // Remove BOM if present (our export adds BOM)
      beforeFirstChunk: (chunk) => chunk.replace(/^\uFEFF/, ""),
      complete: (results) => {
        resolve({
          headers: results.meta.fields || [],
          rows: results.data as Record<string, string>[],
          errors: results.errors,
          rowCount: results.data.length,
        });
      },
      error: (error) => reject(error),
    });
  });
}
```

### Pattern 2: Column Mapping with Smart Defaults
**What:** Auto-detect common column names and pre-fill the mapping. User can override any mapping.
**When to use:** Always -- reduces friction for common CSV formats (bank exports, our own export format).
**Example:**
```typescript
// Smart default column mapping
const COLUMN_ALIASES: Record<string, string[]> = {
  transaction_date: ["date", "transaction date", "trans date", "posting date", "posted date"],
  amount: ["amount", "debit", "credit", "transaction amount", "sum"],
  description: ["description", "memo", "details", "narrative", "payee", "name"],
  merchant_name: ["merchant", "merchant name", "payee"],
  category: ["category", "type", "classification"],
};

export function autoMapColumns(
  csvHeaders: string[],
  targetFields: string[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const normalizedHeaders = csvHeaders.map((h) => h.toLowerCase().trim());

  for (const field of targetFields) {
    const aliases = COLUMN_ALIASES[field] || [field];
    const matchIdx = normalizedHeaders.findIndex((h) =>
      aliases.some((alias) => h === alias || h.includes(alias))
    );
    mapping[field] = matchIdx >= 0 ? csvHeaders[matchIdx] : null;
  }

  return mapping;
}
```

### Pattern 3: Composite Hash Duplicate Detection
**What:** Generate a deterministic hash from (date + amount_cents + description) for each row. Check against existing transactions in the household before inserting.
**When to use:** Always -- prevents double-imports without blocking legitimate same-day same-amount purchases from different merchants.
**Example:**
```typescript
/**
 * Generate a duplicate detection key for a transaction.
 * Uses date + amount + normalized description to identify likely duplicates.
 */
export function transactionDuplicateKey(
  date: string,
  amountCents: number,
  description: string
): string {
  const normalized = description.toLowerCase().trim();
  return `${date}|${amountCents}|${normalized}`;
}
```

### Pattern 4: Net Worth Snapshot After Manual Asset Mutation
**What:** After creating or updating a manual asset, recompute net worth and call `NetWorthSnapshotsDB.upsert()`. Same pattern as the Plaid sync post-hook in `lib/plaid/sync.ts` lines 280-326.
**When to use:** In the POST and PATCH handlers of `/api/money/manual-assets`.
**Example:**
```typescript
// Non-blocking net worth snapshot after manual asset mutation
// (same pattern as lib/plaid/sync.ts lines 280-326)
try {
  const accountsDB = new MoneyAccountsDB(supabase);
  const manualAssetsDB = new ManualAssetsDB(supabase);
  const snapshotsDB = new NetWorthSnapshotsDB(supabase);

  const [allAccounts, manualAssets] = await Promise.all([
    accountsDB.getByHousehold(householdId),
    manualAssetsDB.getByHousehold(householdId),
  ]);

  let assetsCents = 0;
  let liabilitiesCents = 0;

  for (const account of allAccounts) {
    if (account.balance_cents >= 0) assetsCents += account.balance_cents;
    else liabilitiesCents += Math.abs(account.balance_cents);
  }

  for (const asset of manualAssets) {
    assetsCents += asset.value_cents;
  }

  await snapshotsDB.upsert(
    householdId,
    getLocalDateString(),
    assetsCents - liabilitiesCents,
    assetsCents,
    liabilitiesCents
  );
} catch (snapshotError) {
  log.warn("Net worth snapshot failed (non-blocking)", { error: snapshotError });
}
```

### Anti-Patterns to Avoid
- **Server-side file upload for CSV:** Do NOT upload the raw file to the server. Parse in the browser so the user can preview and map columns before any network call. Server only receives structured JSON.
- **UNIQUE constraint for dedup:** Do NOT add a database UNIQUE constraint on (date+amount+description). Legitimate duplicates exist (e.g., two $5.00 purchases at the same store on the same day). Use advisory dedup with user override.
- **Blocking import for large files:** Do NOT try to insert thousands of rows in a single API call. Batch into chunks of 100-200 rows per request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom regex/split parser | PapaParse | CSV is deceptively complex: quoted fields, embedded newlines, BOM handling, delimiter detection, encoding issues. PapaParse handles all edge cases. |
| RFC 4180 compliance | Custom escape logic | PapaParse's built-in parser | Already proven in the export side (`lib/money/csv-export.ts`); PapaParse reads what we write. |
| Auto-delimiter detection | Manual delimiter guessing | PapaParse `delimitersToGuess` | Supports comma, tab, pipe, semicolon out of the box |

**Key insight:** CSV looks simple but has numerous edge cases (quoted fields containing newlines, BOM markers, encoding issues, inconsistent delimiters). PapaParse has handled these for 10+ years with 40k+ GitHub stars.

## Common Pitfalls

### Pitfall 1: Sign Convention Mismatch
**What goes wrong:** Imported CSV amounts may use opposite sign convention from the project (Plaid uses positive=outflow; our DB uses negative=outflow).
**Why it happens:** Different banks/tools export CSV with different sign conventions. Our export uses our internal convention (negative=outflow).
**How to avoid:** Provide a "flip sign" toggle in the column mapping UI. Default to assuming the CSV uses the same convention as our export (which it will if re-importing our own CSV). Let user preview and verify before import.
**Warning signs:** All imported transactions show wrong direction (income appears as spending).

### Pitfall 2: Encoding Issues
**What goes wrong:** CSV files from Excel or international banks may use different encodings (Windows-1252, Shift-JIS, etc.) instead of UTF-8.
**Why it happens:** Excel on Windows defaults to locale-specific encoding for CSV.
**How to avoid:** PapaParse handles UTF-8 with BOM natively. For our own exports (which include BOM), this is a non-issue. For external CSVs, PapaParse's `beforeFirstChunk` can strip BOM. If garbled text appears, show a warning.
**Warning signs:** Merchant names with accented characters appear garbled.

### Pitfall 3: Duplicate Detection False Positives
**What goes wrong:** Legitimate duplicate transactions (same date, same amount, similar description) get flagged as duplicates.
**Why it happens:** Using too-broad matching criteria.
**How to avoid:** Show detected duplicates as warnings, not blockers. Let user review and override. Use exact (date + amount_cents + normalized_description) match rather than fuzzy matching.
**Warning signs:** User reports "some transactions aren't being imported."

### Pitfall 4: Large File Memory Issues
**What goes wrong:** User uploads a 50k+ row CSV, browser tab freezes or crashes.
**Why it happens:** Parsing the entire file into memory + rendering all preview rows.
**How to avoid:** Use PapaParse's `preview` option to limit parsed rows for preview display (e.g., first 100). For full import, parse fully but POST in batches. Show row count immediately so user knows what to expect.
**Warning signs:** Browser tab becomes unresponsive after file selection.

### Pitfall 5: Forgotten Account Assignment
**What goes wrong:** Imported transactions have no `account_id`, violating the DB constraint.
**Why it happens:** CSV files from external sources don't include our internal account IDs.
**How to avoid:** Require user to select a target account in step 1 of the import wizard (before column mapping). Default to "Cash" account if available.
**Warning signs:** 500 errors on import with foreign key violation.

## Code Examples

Verified patterns from official sources and existing project code:

### PapaParse File Parsing
```typescript
// Source: Context7 /mholt/papaparse + PapaParse official docs
import Papa from "papaparse";

Papa.parse(file, {
  header: true,
  dynamicTyping: false, // Keep as strings; we convert amounts ourselves via toCents()
  skipEmptyLines: "greedy",
  beforeFirstChunk: (chunk) => chunk.replace(/^\uFEFF/, ""), // Strip BOM
  complete: (results) => {
    // results.meta.fields -> string[] of detected column headers
    // results.data -> Record<string, string>[] of parsed rows
    // results.errors -> ParseError[] with row numbers
    // results.meta.delimiter -> detected delimiter
  },
  error: (error) => {
    // File-level error (e.g., file not readable)
  },
});
```

### Batch Import API Endpoint
```typescript
// Existing project pattern: POST /api/money/transactions (manual entry)
// Extended for batch import
const transactionsDB = new TransactionsDB(supabase);

for (const row of validatedRows) {
  await transactionsDB.create({
    household_id: householdId,
    account_id: targetAccountId,
    amount_cents: toCents(row.amount),
    description: row.description,
    merchant_name: row.merchant_name || null,
    category: row.category || null,
    category_id: null,
    notes: null,
    transaction_date: row.transaction_date,
    is_pending: false,
    plaid_transaction_id: null,
    plaid_category_primary: null,
    plaid_category_detailed: null,
    source: "manual", // CSV imports are "manual" source
  });
}
```

### Net Worth Snapshot Trigger (Existing Pattern)
```typescript
// Source: lib/plaid/sync.ts lines 280-326
// This exact pattern should be replicated in manual-assets POST and PATCH
const accountsDB = new MoneyAccountsDB(supabaseAdmin);
const manualAssetsDB = new ManualAssetsDB(supabaseAdmin);
const snapshotsDB = new NetWorthSnapshotsDB(supabaseAdmin);

const allAccounts = await accountsDB.getByHousehold(householdId);
const manualAssets = await manualAssetsDB.getByHousehold(householdId);

let assetsCents = 0;
let liabilitiesCents = 0;

for (const account of allAccounts) {
  if (account.balance_cents >= 0) assetsCents += account.balance_cents;
  else liabilitiesCents += Math.abs(account.balance_cents);
}

for (const asset of manualAssets) {
  assetsCents += asset.value_cents;
}

const totalCents = assetsCents - liabilitiesCents;
await snapshotsDB.upsert(householdId, getLocalDateString(), totalCents, assetsCents, liabilitiesCents);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side file upload + parse | Client-side parse + server-side insert | ~2020 | Better UX (instant preview), no file upload needed, lower server load |
| Simple row matching for dedup | Composite key hash with user review | Standard practice | Fewer false positives, user retains control |
| Raw file POST to API | Structured JSON POST after client-side validation | Standard practice | Type-safe, validated data reaches the server |

**Deprecated/outdated:**
- csv-parse (Node.js only, no browser support): Not applicable for client-side preview
- FileReader.readAsText manually: PapaParse wraps this with proper encoding and error handling

## Open Questions

1. **Batch size for import API**
   - What we know: Supabase supports bulk inserts via `.insert([...])`, but the existing `TransactionsDB.create()` only handles single inserts. The Plaid sync uses `.upsert()` for batches.
   - What's unclear: Whether to add a `TransactionsDB.createBatch()` method or loop single creates. Batch is more efficient but single creates give per-row error handling.
   - Recommendation: Add a `createBatch()` method for efficiency but validate all rows before inserting. If one row fails validation, reject the entire batch (fail-fast).

2. **Maximum import size**
   - What we know: The export caps at 10,000 transactions. Browser memory can handle ~50k rows in PapaParse.
   - What's unclear: What practical limit to set for imports.
   - Recommendation: Cap at 5,000 rows per import (generous for typical bank statement exports which are 1-3 months). Show count warning for large files.

3. **Re-importing our own export**
   - What we know: Our CSV export format has 8 columns (Date, Description, Merchant, Amount, Category, Account, Source, Notes). Column auto-mapping should detect these.
   - What's unclear: Should we detect "this looks like our own export" and auto-configure everything?
   - Recommendation: The auto-mapping aliases already handle this. No special case needed -- "Date" maps to transaction_date, "Amount" to amount, etc.

## Sources

### Primary (HIGH confidence)
- Context7 `/mholt/papaparse` - File parsing API, configuration options, error handling, delimiter detection
- Existing project code: `lib/plaid/sync.ts` lines 280-326 (net worth snapshot pattern)
- Existing project code: `lib/money/csv-export.ts` (CSV format conventions)
- Existing project code: `app/api/money/transactions/route.ts` (manual transaction creation pattern)
- Existing project code: `app/api/money/manual-assets/route.ts` and `[id]/route.ts` (manual asset CRUD, missing snapshot trigger)
- Existing project code: `.planning/v4.0-MILESTONE-AUDIT.md` (gap identification)

### Secondary (MEDIUM confidence)
- [PapaParse npm](https://www.npmjs.com/package/papaparse) - Version 5.x, 40k+ GitHub stars
- [@types/papaparse npm](https://www.npmjs.com/package/@types/papaparse) - TypeScript definitions v5.5.x, 2.3M weekly downloads

### Tertiary (LOW confidence)
- None. All findings are well-supported by existing project code and Context7 documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PapaParse is the undisputed standard for browser CSV parsing, verified via Context7
- Architecture: HIGH - All patterns are direct extensions of existing project code (manual transaction creation, Plaid sync snapshot, export dialog)
- Pitfalls: HIGH - Derived from project-specific sign conventions and existing patterns; CSV pitfalls are well-documented in PapaParse ecosystem

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable domain, no rapidly changing APIs)
