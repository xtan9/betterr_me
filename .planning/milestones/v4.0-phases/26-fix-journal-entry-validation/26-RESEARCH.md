# Phase 26: Fix Journal Entry Validation - Research

**Researched:** 2026-02-23
**Domain:** Zod validation schema / Next.js API route data flow / autosave integration
**Confidence:** HIGH

## Summary

Phase 26 addresses two critical Zod validation bugs that prevent all journal entry creation and editing. Through code investigation, the exact root causes are identified in `lib/validations/journal.ts` and the data flow between `journal-entry-modal.tsx`, `use-journal-autosave.ts`, and the API routes.

**Bug 1 (title required but never sent):** The `journalEntryFormSchema` defines `title` as `z.string().trim().min(1, "Title is required")`, but the autosave hook never includes a `title` field in the POST body. The `scheduleSave()` calls in `journal-entry-modal.tsx` pass `{ content, mood, word_count, prompt_key }` -- no title. Every initial POST fails with a 400 validation error.

**Bug 2 (mood null rejected):** The mood field is `z.number().int().min(1).max(5).default(3)`. When the user deselects a mood, the component passes `null` (a deliberate design decision per STATE.md: "Mood onChange passes null (not 0) for deselect"). However, Zod's `.default()` only activates on `undefined`, not `null`. When `mood: null` hits the schema, it fails because `null` is not a `number`. This affects both POST (create) and PATCH (update) routes.

**Primary recommendation:** Fix the Zod schema to make title optional with a default, and make mood accept null. Also update the DB types and column constraints to match the nullable mood design. Update existing tests that assert the old validation behavior.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTR-01 | User can create a journal entry for a specific date with rich text (Tiptap editor) | Schema fix for title default + mood nullable unblocks POST /api/journal |
| ENTR-02 | User can edit and update an existing journal entry | Schema fix for mood nullable in update schema unblocks PATCH /api/journal/[id] |
| ENTR-04 | User can select a mood emoji (5-point scale) for each entry | Mood schema must accept null for deselect; DB column must allow NULL |
| ENTR-05 | User sees one entry per day (upsert model) | Upsert POST works once validation is fixed; no changes needed to upsert logic itself |
</phase_requirements>

## Standard Stack

### Core (already in project -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.46 | Schema validation at API boundaries | Already in use project-wide |
| next | 16 | App Router API routes | Project framework |
| vitest | (project ver) | Unit testing | Project test runner |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | (project ver) | Hook/component testing | Autosave hook tests |

**Installation:** No new packages needed. This is a schema/type fix only.

## Architecture Patterns

### Relevant File Map
```
lib/validations/journal.ts          # Zod schemas (PRIMARY FIX)
lib/db/types.ts                     # TypeScript types for JournalEntry (UPDATE mood to nullable)
app/api/journal/route.ts            # POST handler (UPDATE default fallback logic)
app/api/journal/[id]/route.ts       # PATCH handler (no code changes needed if schema is fixed)
components/journal/journal-entry-modal.tsx  # Sends autosave data (no changes needed)
lib/hooks/use-journal-autosave.ts   # Autosave hook (no changes needed)
supabase/migrations/                # May need mood column ALTER (DB migration)
tests/app/api/journal/route.test.ts # Tests asserting old validation (UPDATE)
tests/app/api/journal/[id]/route.test.ts  # Tests for PATCH (UPDATE)
tests/lib/hooks/use-journal-autosave.test.ts  # Hook tests (VERIFY still pass)
```

### Pattern: Zod Schema with Optional/Nullable Fields
**What:** Use `.optional().default()` for fields with server-side defaults, and `.nullable()` for fields that legitimately hold null.
**When to use:** When the client may not send a field (title during autosave) or explicitly sends null (mood deselect).
**Example:**
```typescript
// CURRENT (broken):
title: z.string().trim().min(1, "Title is required"),
mood: z.number().int().min(1).max(5).default(3),

// FIXED:
title: z.string().trim().max(200, "Title must be 200 characters or less").default(""),
mood: z.number().int().min(1).max(5).nullable().default(null),
```

### Pattern: Zod .nullable() vs .optional() vs .default()
**What:** Understanding Zod's nullability chain is critical to this fix.
**Key facts (verified against Zod 3.25 source):**
- `.default(val)` -- replaces `undefined` with `val` during parse. Does NOT replace `null`.
- `.optional()` -- allows `undefined` to pass through (type becomes `T | undefined`).
- `.nullable()` -- allows `null` to pass through (type becomes `T | null`).
- `.nullish()` -- allows both `null` and `undefined`.
- Order matters: `z.number().nullable().default(null)` means: if undefined, use null; if null, pass through; if number, validate.

### Anti-Patterns to Avoid
- **Using .default() to handle null:** `.default()` only intercepts `undefined`, not `null`. This is the root cause of Bug 2.
- **Requiring fields the client never sends:** Title is required in the schema but the autosave flow intentionally omits it (journal entries are content-first, title is optional UX).
- **Mismatched DB constraints and Zod schema:** The DB has `mood INTEGER NOT NULL DEFAULT 3`, but the app sends `null`. Either the DB column or the API layer must handle the mismatch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Null-to-default conversion | Manual null checks in API route | Zod `.nullable().transform()` or `.nullable().default()` | Centralizes logic in schema, tested once |
| Title defaulting | Hardcoding `title: body.title \|\| ""` in route | Zod `.default("")` in schema | Schema is the single source of truth for validation |

**Key insight:** All validation fixes belong in the Zod schema, not scattered across API route handlers. The `validateRequestBody()` helper already handles the schema-to-response flow correctly.

## Common Pitfalls

### Pitfall 1: Zod .default() Does Not Handle null
**What goes wrong:** `z.number().default(3)` still rejects `null` -- it only replaces `undefined`.
**Why it happens:** Common misconception that `.default()` is a catch-all fallback.
**How to avoid:** Use `.nullable()` before `.default()` for fields that receive null: `z.number().int().min(1).max(5).nullable().default(null)`. Or use `.transform()` to convert null to a default.
**Warning signs:** Validation errors on fields that "should have a default".

### Pitfall 2: DB NOT NULL vs App-Level Null
**What goes wrong:** If the Zod schema now passes `mood: null` through to the DB, but the DB column is `INTEGER NOT NULL DEFAULT 3`, the INSERT/UPDATE will fail at the DB level.
**Why it happens:** Schema fix without corresponding DB migration.
**How to avoid:** Two strategies:
  1. **Make DB column nullable:** `ALTER TABLE journal_entries ALTER COLUMN mood DROP NOT NULL; ALTER TABLE journal_entries ALTER COLUMN mood SET DEFAULT NULL;` -- then update TypeScript types.
  2. **Transform null to default in Zod:** `z.number().int().min(1).max(5).nullable().transform(v => v ?? 3).default(3)` -- DB stays NOT NULL, nulls become 3 before reaching DB.
**Recommendation:** Strategy 1 (make DB nullable) aligns with the stated design decision: "Mood onChange passes null (not 0) for deselect -- cleaner API matching nullable DB column." The decision explicitly says "nullable DB column", so the DB should be nullable.

### Pitfall 3: Partial Schema Inherits Parent Issues
**What goes wrong:** `journalEntryUpdateSchema = journalEntryFormSchema.partial()` inherits the broken mood definition. Fixing the form schema automatically fixes the update schema.
**Why it happens:** The update schema is derived from the form schema.
**How to avoid:** Fix the base schema; verify the derived schema behaves correctly with a test.

### Pitfall 4: Test Assertions on Old Validation Behavior
**What goes wrong:** Existing test "should return 400 for invalid body (missing title)" asserts that missing title is a validation error. After the fix, missing title should succeed (defaulting to "").
**Why it happens:** Tests were written to match the original (broken) schema.
**How to avoid:** Update the test to either: (a) remove the "missing title returns 400" assertion, or (b) change it to verify that missing title succeeds with an empty-string default.

### Pitfall 5: TypeScript Type Mismatch After Schema Change
**What goes wrong:** The `JournalEntry` interface in `lib/db/types.ts` has `mood: number` (not nullable). After making mood nullable, TypeScript will error on any code that assumes mood is always a number.
**Why it happens:** Types must match the actual data shape.
**How to avoid:** Update `mood: number` to `mood: number | null` in `JournalEntry`, `JournalEntryInsert`, `JournalEntryUpdate`, and `JournalCalendarDay` types. Then fix any downstream TypeScript errors (e.g., mood comparisons, mood display).

### Pitfall 6: Autosave POST Body Still Needs entry_date
**What goes wrong:** The autosave hook correctly adds `entry_date` for POST calls. Don't accidentally break this while fixing the schema.
**Why it happens:** Over-eager refactoring.
**How to avoid:** The hook's `save()` function already handles this correctly. No changes needed in the hook.

## Code Examples

### Fix 1: Updated journalEntryFormSchema
```typescript
// lib/validations/journal.ts
export const journalEntryFormSchema = z.object({
  entry_date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  title: z
    .string()
    .trim()
    .max(200, "Title must be 200 characters or less")
    .default(""),
  content: z.record(z.unknown()).default({ type: "doc", content: [] }),
  mood: z.number().int().min(1).max(5).nullable().default(null),
  word_count: z.number().int().min(0).default(0),
  tags: z.array(z.string().max(50)).max(20).default([]),
  prompt_key: z.string().max(100).nullable().optional(),
});
```

### Fix 2: Updated POST route handler (mood default removal)
```typescript
// app/api/journal/route.ts -- POST handler
// BEFORE (manual null coalescing that hides the real issue):
mood: validation.data.mood ?? 3,

// AFTER (schema handles defaults, use validated data directly):
mood: validation.data.mood,
// or keep ?? 3 as defense-in-depth if DB is NOT NULL
```

### Fix 3: Updated TypeScript types
```typescript
// lib/db/types.ts
export interface JournalEntry {
  // ...
  mood: number | null;  // was: mood: number
  // ...
}

export interface JournalCalendarDay {
  entry_date: string;
  mood: number | null;  // was: mood: number
  title: string;
}
```

### Fix 4: DB Migration (if making mood nullable)
```sql
-- supabase/migrations/20260223XXXXXX_make_mood_nullable.sql
ALTER TABLE journal_entries ALTER COLUMN mood DROP NOT NULL;
ALTER TABLE journal_entries ALTER COLUMN mood SET DEFAULT NULL;
```

### Fix 5: Updated test for title validation
```typescript
// tests/app/api/journal/route.test.ts
// CHANGE: "should return 400 for invalid body (missing title)"
// TO: "should succeed with default empty title when title omitted"
it('should succeed with default empty title when title omitted', async () => {
  mockJournalDB.upsertEntry.mockResolvedValue(mockEntry);

  const request = new NextRequest('http://localhost:3000/api/journal', {
    method: 'POST',
    body: JSON.stringify({
      entry_date: '2026-02-22',
    }),
  });

  const response = await POST(request);
  expect(response.status).toBe(201);
  expect(mockJournalDB.upsertEntry).toHaveBeenCalledWith(
    expect.objectContaining({ title: '' })
  );
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `z.number().default(3)` | `z.number().nullable().default(null)` | This fix | Allows null mood values through schema |
| `title: z.string().min(1)` (required) | `title: z.string().default("")` (optional) | This fix | Autosave works without title |
| `mood: number` (TS type) | `mood: number \| null` (TS type) | This fix | Types match nullable DB column |
| DB `mood NOT NULL DEFAULT 3` | DB `mood NULL DEFAULT NULL` | This fix (migration) | DB accepts null mood |

## Analysis: Complete Data Flow

### Current (broken) flow -- creating a new entry:
1. User opens modal, starts typing in Tiptap editor
2. `handleEditorUpdate` fires with `{ content, mood: null, word_count, prompt_key: null }`
3. `scheduleSave({ content, mood: null, word_count, prompt_key: null })` -- **no title**
4. After 2s debounce, `save()` fires POST to `/api/journal` with body: `{ content, mood: null, word_count, prompt_key: null, entry_date }`
5. `validateRequestBody(body, journalEntryFormSchema)` fails:
   - `title` is missing and required (min 1) -- **FAIL**
   - `mood` is null but schema expects number -- **FAIL**
6. API returns 400, autosave shows error status

### Fixed flow:
1-3. Same as above
4. Same POST body (no title, mood: null)
5. `validateRequestBody(body, journalEntryFormSchema)` succeeds:
   - `title` defaults to `""` (via `.default("")`)
   - `mood` passes through as `null` (via `.nullable().default(null)`)
6. API returns 201, entry persists, autosave shows saved status

### Current (broken) flow -- editing with mood deselect:
1. User clicks selected mood to deselect
2. `handleMoodChange(null)` fires
3. `scheduleSave({ content, mood: null, word_count, prompt_key })` via PATCH
4. `validateRequestBody(body, journalEntryUpdateSchema)` -- update schema is `.partial()` of form schema
5. `mood` is null but `.partial()` only makes it `number | undefined`, not `number | null` -- **FAIL**
6. API returns 400

### Fixed flow:
5. `mood` is null and schema allows `.nullable()` -- passes
6. API returns 200

## Open Questions

1. **DB migration strategy: nullable vs transform?**
   - What we know: STATE.md says "nullable DB column" was the design decision. The DB currently has `NOT NULL DEFAULT 3`.
   - What's unclear: Whether a migration has been applied to production yet.
   - Recommendation: Create the migration to make mood nullable. If production migration is uncertain, the Zod transform approach (`v => v ?? 3`) is a safe fallback that requires no DB change. Given STATE.md explicitly says "nullable DB column", go with the migration.

2. **Should title allow empty string in DB?**
   - What we know: DB has `title TEXT NOT NULL`. Empty string `""` satisfies NOT NULL.
   - What's unclear: Whether there are any downstream displays that look bad with empty titles.
   - Recommendation: Allow empty string. The calendar and timeline views already show entry_date and mood as primary identifiers. An empty title is acceptable UX for autosaved entries.

## Sources

### Primary (HIGH confidence)
- **Direct code inspection** -- `lib/validations/journal.ts`, `app/api/journal/route.ts`, `app/api/journal/[id]/route.ts`, `components/journal/journal-entry-modal.tsx`, `lib/hooks/use-journal-autosave.ts`, `lib/db/types.ts`, `supabase/migrations/20260222100001_create_journal_entries.sql`
- **Project STATE.md** -- Design decisions: "Mood onChange passes null (not 0) for deselect -- cleaner API matching nullable DB column"
- **Zod 3.25.46** -- `.default()` only replaces undefined, `.nullable()` allows null (verified against installed version)

### Secondary (MEDIUM confidence)
- **Zod documentation** -- `.nullable()`, `.default()`, `.transform()` behavior confirmed via project's installed Zod version behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, just fixing existing schemas
- Architecture: HIGH - direct code inspection, all files read and traced end-to-end
- Pitfalls: HIGH - bugs are deterministic and reproducible from code analysis
- DB migration: MEDIUM - depends on whether production DB already has the NOT NULL constraint

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable -- schema patterns don't change rapidly)
