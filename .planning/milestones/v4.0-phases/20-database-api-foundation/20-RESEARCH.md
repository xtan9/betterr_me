# Phase 20: Database & API Foundation - Research

**Researched:** 2026-02-22
**Domain:** Supabase schema, Next.js API routes, SWR data fetching for journal entries
**Confidence:** HIGH

## Summary

This phase creates the complete data layer for journal entries: database schema (two tables with RLS), a DB class, three API route files, Zod validation schemas, and three SWR hooks. The project already has mature, well-established patterns for every single layer -- DB classes (`HabitsDB`, `ProjectsDB`), API routes (`/api/projects`, `/api/dashboard`), SWR hooks (`useDashboard`, `useProjects`), validations (`lib/validations/project.ts`), and migrations. Phase 20 follows these patterns exactly with no new libraries or paradigms.

The key technical challenge is the upsert model: Supabase's `.upsert()` method with `onConflict: 'user_id,entry_date'` handles the one-entry-per-day constraint cleanly. The composite UNIQUE constraint on `(user_id, entry_date)` enforces this at the database level, and the API POST route calls upsert instead of insert. Content is stored as JSONB (Tiptap JSON), tags as `text[]`, and mood as `integer CHECK (mood BETWEEN 1 AND 5)`.

**Primary recommendation:** Follow the existing ProjectsDB/projects API/useProjects pattern exactly. The only novel elements are: (1) upsert instead of insert for create, (2) JSONB content column, (3) text array tags column, and (4) a calendar endpoint that returns lightweight date+mood+title data scoped to a single month.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Entries have a **title field** (required) plus rich-text content body
- **Word count** stored as a persisted column (enables stats like average entry length, streak gating)
- **Tags** stored as a text array column on the entry (user-defined labels like 'work', 'travel', 'gratitude')
- **Prompt reference** stored as a column (prompt_key or prompt_id) linking back to the prompt library -- enables "entries inspired by this prompt" browsing in Phase 22
- Core fields: user_id, entry_date, title, content (Tiptap JSON), mood, word_count, tags, prompt_key, timestamps
- UNIQUE constraint on (user_id, entry_date) -- upsert model
- **Mood scale**: Simple valence 1-5 integer (1=awful, 5=great), default neutral (3), hardcoded emojis
- Links support **habits, tasks, AND projects** (extends INTG-02 to include projects)
- **Simple references** only -- just an association, no status snapshot at link time
- **One polymorphic table** (`journal_entry_links`) with `link_type` ('habit'/'task'/'project') + `link_id`
- **Soft limit of ~10 links** per entry to keep UI clean
- Calendar endpoint returns **date + mood + title** per entry day
- Calendar endpoint scoped to **single month** (e.g., ?year=2026&month=2)
- Timeline endpoint uses **cursor-based pagination** (last entry's date as cursor)
- Timeline returns **preview only** (~first 100 chars of content), not full body

### Claude's Discretion
- Tiptap content storage format (JSON vs HTML)
- Exact RLS policy design
- SWR cache key structure and revalidation strategy
- API error response shapes
- Preview text extraction logic (plain text from Tiptap JSON)

### Deferred Ideas (OUT OF SCOPE)
- Configurable mood emoji sets -- future enhancement if users want personalization
- Full-text search across entries (ANLT-03) -- tracked in future requirements
- Entry attachments/images (MEDA-01) -- out of scope per requirements
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTR-05 | User sees one entry per day (upsert model -- creating for a date with an existing entry opens edit) | Supabase `.upsert()` with `onConflict: 'user_id,entry_date'` on UNIQUE(user_id, entry_date) constraint. API POST uses upsert instead of insert. DB class `createOrUpdateEntry()` method. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | (existing) | Database CRUD, upsert, RLS-enforced queries | Already in project, all DB classes use it |
| zod | (existing) | API request validation at boundaries | Already in `lib/validations/`, all API routes use it |
| swr | (existing) | Client-side data fetching with caching | Already in `lib/hooks/`, all data hooks use it |
| next | (existing) | API routes (App Router route handlers) | Already in project, all API routes follow this pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | - | - | No new libraries required for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB for content | TEXT (HTML string) | JSONB enables server-side content queries later (search, preview extraction); TEXT is simpler but loses structure. **Decision: Use JSONB** -- Tiptap's native format is JSON, and the STATE.md already records "Tiptap JSONB storage over TEXT" as a project decision. |
| text[] for tags | Separate junction table | text[] is simpler for small cardinality, no JOINs needed. Separate table is better for tag analytics/autocomplete but overkill here. **Decision: Use text[]** -- locked in CONTEXT.md. |
| Polymorphic links table | Separate tables per link type | One table is simpler. Separate tables have stronger FK constraints but triple the migration/API work. **Decision: Polymorphic** -- locked in CONTEXT.md. |

**Installation:**
```bash
# No new packages needed -- all dependencies already in project
```

## Architecture Patterns

### Recommended Project Structure
```
lib/db/
├── journal-entries.ts          # JournalEntriesDB class (CRUD + upsert + calendar/timeline queries)
├── journal-entry-links.ts      # JournalEntryLinksDB class (link CRUD)
├── types.ts                    # Add JournalEntry, JournalEntryLink types
├── index.ts                    # Add exports for new DB classes

lib/validations/
├── journal.ts                  # Zod schemas: journalEntryFormSchema, journalEntryUpdateSchema

lib/hooks/
├── use-journal-entry.ts        # useJournalEntry(date) -- single entry by date
├── use-journal-calendar.ts     # useJournalCalendar(year, month) -- month overview
├── use-journal-timeline.ts     # useJournalTimeline(cursor?) -- paginated feed

app/api/journal/
├── route.ts                    # GET (by date query), POST (upsert)
├── [id]/
│   └── route.ts                # GET, PATCH, DELETE by entry ID
├── calendar/
│   └── route.ts                # GET with ?year=&month= params

supabase/migrations/
├── 20260222100001_create_journal_entries.sql
├── 20260222100002_create_journal_entry_links.sql

tests/lib/db/
├── journal-entries.test.ts
├── journal-entry-links.test.ts
tests/app/api/journal/
├── route.test.ts
├── [id]/route.test.ts
├── calendar/route.test.ts
```

### Pattern 1: DB Class with Upsert (JournalEntriesDB)
**What:** A DB class that follows the ProjectsDB pattern but uses `upsert` for create operations
**When to use:** When the UNIQUE(user_id, entry_date) constraint means creating an entry for an existing date should update rather than fail
**Example:**
```typescript
// Source: Supabase JS docs (Context7) + existing ProjectsDB pattern
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry, JournalEntryInsert, JournalEntryUpdate } from './types';

export class JournalEntriesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create or update a journal entry for a given date.
   * Uses upsert on the UNIQUE(user_id, entry_date) constraint.
   */
  async upsertEntry(entry: JournalEntryInsert): Promise<JournalEntry> {
    const { data, error } = await this.supabase
      .from('journal_entries')
      .upsert(entry, { onConflict: 'user_id,entry_date' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /** Get entry by date for a user (the primary access pattern) */
  async getEntryByDate(userId: string, date: string): Promise<JournalEntry | null> {
    const { data, error } = await this.supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('entry_date', date)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /** Get entry by ID (for /api/journal/[id] routes) */
  async getEntry(entryId: string, userId: string): Promise<JournalEntry | null> {
    const { data, error } = await this.supabase
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /** Calendar data: lightweight query returning date + mood + title for a month */
  async getCalendarMonth(
    userId: string,
    year: number,
    month: number
  ): Promise<{ entry_date: string; mood: number; title: string }[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`; // Supabase handles > month end gracefully
    const { data, error } = await this.supabase
      .from('journal_entries')
      .select('entry_date, mood, title')
      .eq('user_id', userId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .order('entry_date', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /** Timeline: paginated entries for infinite scroll, returns preview not full content */
  async getTimeline(
    userId: string,
    limit: number = 10,
    cursor?: string // entry_date of last item (cursor-based pagination)
  ): Promise<JournalEntry[]> {
    let query = this.supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('entry_date', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('entry_date', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
```

### Pattern 2: Composite onConflict for Upsert
**What:** Supabase `.upsert()` with composite unique constraint columns
**When to use:** When the unique constraint spans multiple columns (user_id + entry_date)
**Example:**
```typescript
// Source: PostgREST JS docs (Context7) -- onConflict accepts comma-separated columns
const { data, error } = await supabase
  .from('journal_entries')
  .upsert(
    {
      user_id: userId,
      entry_date: date,
      title: 'My Entry',
      content: tiptapJson,
      mood: 4,
      word_count: 150,
      tags: ['gratitude', 'work'],
    },
    { onConflict: 'user_id,entry_date' }
  )
  .select()
  .single();
```

### Pattern 3: Date-Keyed SWR Hooks
**What:** SWR hooks that include the date in the cache key for automatic refresh at midnight
**When to use:** Journal entry hook (fetches by date), calendar hook (fetches by month)
**Example:**
```typescript
// Source: existing useDashboard pattern + SWR docs (Context7)
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import type { JournalEntry } from '@/lib/db/types';

export function useJournalEntry(date: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ entry: JournalEntry | null }>(
    date ? `/api/journal?date=${date}` : null, // null key = no fetch
    fetcher,
    { keepPreviousData: true } // smooth transitions when date changes
  );

  return {
    entry: data?.entry ?? null,
    error,
    isLoading,
    mutate,
  };
}

export function useJournalCalendar(year: number | null, month: number | null) {
  const key = year && month
    ? `/api/journal/calendar?year=${year}&month=${month}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<{
    entries: { entry_date: string; mood: number; title: string }[];
  }>(key, fetcher, { keepPreviousData: true });

  return {
    entries: data?.entries ?? [],
    error,
    isLoading,
    mutate,
  };
}
```

### Pattern 4: Preview Text Extraction from Tiptap JSON
**What:** Extract plain text preview from Tiptap JSON content for timeline display
**When to use:** Timeline endpoint needs ~100 char preview without sending full JSON
**Example:**
```typescript
// Tiptap JSON structure: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '...' }] }] }
// Recursively extract text nodes
function extractPlainText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractPlainText).join('');
  }
  return '';
}

export function getPreviewText(tiptapJson: any, maxLength: number = 100): string {
  const fullText = extractPlainText(tiptapJson).trim();
  if (fullText.length <= maxLength) return fullText;
  return fullText.slice(0, maxLength).trimEnd() + '...';
}
```

### Pattern 5: API Route with Upsert (POST /api/journal)
**What:** POST route that creates-or-updates using the DB upsert method
**When to use:** Journal entry creation -- calling POST for the same date updates instead of 409
**Example:**
```typescript
// Source: existing POST /api/projects pattern
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { JournalEntriesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { journalEntryFormSchema } from '@/lib/validations/journal';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, journalEntryFormSchema);
    if (!validation.success) return validation.response;

    await ensureProfile(supabase, user);

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.upsertEntry({
      user_id: user.id,
      entry_date: validation.data.entry_date,
      title: validation.data.title.trim(),
      content: validation.data.content,
      mood: validation.data.mood ?? 3,
      word_count: validation.data.word_count ?? 0,
      tags: validation.data.tags ?? [],
      prompt_key: validation.data.prompt_key ?? null,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    log.error('POST /api/journal error', error);
    return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 });
  }
}
```

### Anti-Patterns to Avoid
- **Never use `new Date().toISOString().split("T")[0]` for dates** -- use `getLocalDateString()` from `lib/utils.ts` (project convention for timezone safety)
- **Never store mood as string** -- store as integer 1-5, map to emojis in app code
- **Never load full content for calendar queries** -- select only `entry_date, mood, title` for performance
- **Never create a client-side DB singleton for API routes** -- always `const supabase = await createClient(); const db = new JournalEntriesDB(supabase);`
- **Never use `.single()` for getEntryByDate** -- use `.maybeSingle()` since the entry may not exist yet (no entry for a date is normal, not an error)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert logic | Manual check-then-insert/update race condition | Supabase `.upsert()` with `onConflict` | Atomic operation at database level, handles concurrency |
| Request validation | Manual type checking in routes | Zod schemas via `validateRequestBody()` | Existing pattern, returns structured 400 errors |
| Cache invalidation | Manual fetch tracking | SWR `mutate()` after mutations | Existing pattern, handles revalidation automatically |
| Preview extraction | Regex on HTML string | Recursive Tiptap JSON text extraction | Tiptap JSON is structured; regex on HTML is fragile |
| Date validation | Custom regex | Zod `.regex(/^\d{4}-\d{2}-\d{2}$/)` | Existing validation pipeline |

**Key insight:** Every layer of this phase has a direct precedent in the codebase. The journal DB class mirrors ProjectsDB, the API routes mirror /api/projects, the hooks mirror useProjects, and the validations mirror project.ts. The only new element is `upsert` replacing `insert`.

## Common Pitfalls

### Pitfall 1: Upsert Without Including Unique Constraint Columns
**What goes wrong:** If you call `.upsert()` without including `user_id` and `entry_date` in the data object, PostgREST cannot match the unique constraint and will always insert (or error).
**Why it happens:** Forgetting that upsert needs the conflict columns in the data payload, not just in the onConflict option.
**How to avoid:** Always include both `user_id` and `entry_date` in the data passed to `.upsert()`. The `onConflict: 'user_id,entry_date'` tells PostgREST which constraint to check, but the values must be in the row data.
**Warning signs:** Duplicate entries appearing despite UNIQUE constraint, or 409 conflict errors.

### Pitfall 2: JSONB Column with Invalid JSON
**What goes wrong:** If the Tiptap JSON content is malformed or null when it shouldn't be, the insert fails with a cryptic Postgres error.
**Why it happens:** Client sends empty content before Tiptap initializes, or sends HTML string instead of JSON object.
**How to avoid:** Zod validation should enforce `content` as a valid object (use `z.record(z.unknown())` or a Tiptap-specific shape). Default to `{ type: 'doc', content: [] }` for empty entries.
**Warning signs:** 500 errors on save with "invalid input syntax for type json" in logs.

### Pitfall 3: RLS Policy Blocks Upsert
**What goes wrong:** Supabase upsert requires both INSERT and UPDATE RLS policies. Missing either one causes silent failures or permission errors.
**Why it happens:** Developer creates INSERT policy but forgets UPDATE policy (or vice versa) because upsert straddles both operations.
**How to avoid:** Create all four standard RLS policies (SELECT, INSERT, UPDATE, DELETE) in the migration, same as existing tables. The project's standard pattern is `auth.uid() = user_id` for all four.
**Warning signs:** Upsert works for new entries but fails for updates (or vice versa).

### Pitfall 4: Calendar Endpoint Returns Full Content
**What goes wrong:** Calendar endpoint becomes slow because it returns the full JSONB content body for every entry in a month.
**Why it happens:** Using `select('*')` instead of `select('entry_date, mood, title')`.
**How to avoid:** Calendar query must select only the three needed columns. The DB method signature should return a typed subset, not the full JournalEntry.
**Warning signs:** Calendar page loads slowly, large network payloads.

### Pitfall 5: Timeline Cursor Off-By-One
**What goes wrong:** Cursor-based pagination either shows duplicate entries or skips entries when two entries share the same cursor date.
**Why it happens:** UNIQUE(user_id, entry_date) guarantees one entry per date per user, so this cannot actually happen here. But if using a non-unique cursor (like created_at), duplicates can occur.
**How to avoid:** Use `entry_date` as the cursor, which is unique per user. The query is `WHERE entry_date < cursor ORDER BY entry_date DESC LIMIT N`.
**Warning signs:** Entries appearing twice in infinite scroll, or entries being skipped.

### Pitfall 6: Forgetting to Export from lib/db/index.ts
**What goes wrong:** API routes import from `@/lib/db` but the new DB classes aren't found.
**Why it happens:** Creating the DB class file but forgetting to add `export * from "./journal-entries"` to `lib/db/index.ts`.
**How to avoid:** Always update `lib/db/index.ts` when adding new DB class files.
**Warning signs:** TypeScript compilation errors or runtime import failures.

### Pitfall 7: Polymorphic Links Without FK Validation
**What goes wrong:** `journal_entry_links.link_id` references a UUID that may not exist in the target table because there's no FK constraint (polymorphic tables can't have FKs to multiple tables).
**Why it happens:** One `link_id` column references habits, tasks, or projects -- Postgres can't enforce this with a single FK.
**How to avoid:** Validate link_id existence in the API route before inserting. The DB class should have a method that checks the target table based on link_type. This is acceptable because links are a convenience feature, not a data integrity requirement -- orphaned links are harmless (just show "deleted item").
**Warning signs:** Links pointing to deleted items. Handle gracefully in UI (Phase 24).

## Code Examples

Verified patterns from the existing codebase and official sources:

### Migration: journal_entries Table
```sql
-- Source: Existing project migration pattern (20260219000001_create_projects_table.sql)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}',
  mood INTEGER NOT NULL DEFAULT 3 CHECK (mood BETWEEN 1 AND 5),
  word_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  prompt_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, entry_date)
);

-- Indexes
CREATE INDEX idx_journal_entries_user_date ON journal_entries (user_id, entry_date DESC);
CREATE INDEX idx_journal_entries_user_mood ON journal_entries (user_id, mood);

-- RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own journal entries"
  ON journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own journal entries"
  ON journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
  ON journal_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
  ON journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse existing updated_at trigger function
CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration: journal_entry_links Table
```sql
-- Source: Existing polymorphic pattern decision from CONTEXT.md
CREATE TABLE journal_entry_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('habit', 'task', 'project')),
  link_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One link per entry+type+target combination
  UNIQUE (entry_id, link_type, link_id)
);

-- Indexes
CREATE INDEX idx_journal_entry_links_entry ON journal_entry_links (entry_id);
CREATE INDEX idx_journal_entry_links_target ON journal_entry_links (link_type, link_id);

-- RLS (use entry ownership via join to journal_entries)
ALTER TABLE journal_entry_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view links for their own entries"
  ON journal_entry_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create links for their own entries"
  ON journal_entry_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete links for their own entries"
  ON journal_entry_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );
```

### TypeScript Types (lib/db/types.ts additions)
```typescript
// Source: Existing type patterns in lib/db/types.ts

// =============================================================================
// JOURNAL ENTRIES
// =============================================================================

export interface JournalEntry {
  id: string;           // UUID
  user_id: string;      // UUID
  entry_date: string;   // DATE (YYYY-MM-DD)
  title: string;
  content: Record<string, unknown>;  // Tiptap JSON
  mood: number;         // 1-5
  word_count: number;
  tags: string[];       // text[]
  prompt_key: string | null;
  created_at: string;
  updated_at: string;
}

export type JournalEntryInsert = Omit<
  JournalEntry,
  'id' | 'created_at' | 'updated_at'
> & {
  id?: string;
};

export type JournalEntryUpdate = Partial<
  Omit<JournalEntry, 'id' | 'user_id' | 'entry_date' | 'created_at' | 'updated_at'>
>;

/** Lightweight calendar view data */
export interface JournalCalendarDay {
  entry_date: string;
  mood: number;
  title: string;
}

// =============================================================================
// JOURNAL ENTRY LINKS
// =============================================================================

export type JournalLinkType = 'habit' | 'task' | 'project';

export interface JournalEntryLink {
  id: string;           // UUID
  entry_id: string;     // UUID
  link_type: JournalLinkType;
  link_id: string;      // UUID
  created_at: string;
}

export type JournalEntryLinkInsert = Omit<
  JournalEntryLink,
  'id' | 'created_at'
> & {
  id?: string;
};
```

### Zod Validation Schema (lib/validations/journal.ts)
```typescript
// Source: Existing lib/validations/project.ts pattern
import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const journalEntryFormSchema = z.object({
  entry_date: z.string().regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  content: z.record(z.unknown()).default({ type: 'doc', content: [] }),
  mood: z.number().int().min(1).max(5).default(3),
  word_count: z.number().int().min(0).default(0),
  tags: z.array(z.string().max(50)).max(20).default([]),
  prompt_key: z.string().max(100).nullable().optional(),
});

export type JournalEntryFormValues = z.infer<typeof journalEntryFormSchema>;

export const journalEntryUpdateSchema = journalEntryFormSchema
  .partial()
  .omit({ entry_date: true })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type JournalEntryUpdateValues = z.infer<typeof journalEntryUpdateSchema>;

export const journalLinkSchema = z.object({
  link_type: z.enum(['habit', 'task', 'project']),
  link_id: z.string().uuid('Invalid link ID'),
});

export type JournalLinkValues = z.infer<typeof journalLinkSchema>;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.insert()` + manual conflict check | `.upsert()` with `onConflict` | Supabase JS v2 | Atomic upsert, no race conditions |
| `params: { id: string }` (sync) | `params: Promise<{ id: string }>` (async) | Next.js 15+ | Must `await params` in dynamic route handlers |
| `content: TEXT` column | `content: JSONB` column | Project decision (STATE.md) | Enables structured queries, preview extraction |

**Deprecated/outdated:**
- Sync `params` in route handlers: Next.js 15+ requires `await params`. The project already uses this pattern (see `/api/projects/[id]/route.ts`).

## Open Questions

1. **Timeline preview: server-side vs client-side extraction?**
   - What we know: Timeline needs ~100 chars of plain text preview from Tiptap JSON
   - What's unclear: Whether to extract on server (in API route/DB view) or send full content and truncate on client
   - Recommendation: **Server-side extraction in the API route** -- reduces payload size, timeline may show 10+ entries. Create a utility function `getPreviewText(content, maxLength)` in `lib/journal/utils.ts`. The DB query still returns full content (no Postgres function needed), but the API route maps it to preview before responding.

2. **Should the upsert return 200 or 201?**
   - What we know: Standard REST says 201 for create, 200 for update. Upsert does both.
   - What's unclear: Client needs to know if this was a create or update (for UI messaging)
   - Recommendation: **Always return 201** (matching existing project POST pattern). The client already has the date, so it knows whether it was creating or editing. If needed later, add an `isNew` boolean to the response.

3. **Links table: include user_id column or not?**
   - What we know: Links are always accessed via journal_entries (which has user_id). Adding user_id to links is denormalization.
   - What's unclear: Whether RLS via subquery (EXISTS on journal_entries) is performant enough
   - Recommendation: **No user_id on links table** -- use EXISTS subquery in RLS. The subquery is simple and the FK index on entry_id makes it fast. This avoids data duplication. If performance becomes an issue (unlikely at this scale), add user_id later.

## Sources

### Primary (HIGH confidence)
- `/supabase/supabase-js` (Context7) -- upsert API, onConflict parameter, JSONB operations, select queries
- `/supabase/postgrest-js` (Context7) -- upsert with onConflict composite columns, query builder API
- `/vercel/swr-site` (Context7) -- keepPreviousData, conditional fetching, mutate API
- `/supabase/supabase` (Context7) -- RLS policies, text array columns, index best practices
- Existing codebase: `lib/db/projects.ts`, `app/api/projects/route.ts`, `lib/hooks/use-projects.ts`, `lib/validations/project.ts`, `supabase/migrations/20260219000001_create_projects_table.sql` -- verified working patterns

### Secondary (MEDIUM confidence)
- Tiptap JSON format: Based on project decision in STATE.md ("Research recommends Tiptap JSONB storage over TEXT") and standard Tiptap output format

### Tertiary (LOW confidence)
- None -- all findings verified with Context7 or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries, all patterns exist in codebase
- Architecture: HIGH -- Direct extension of ProjectsDB/projects API patterns
- Pitfalls: HIGH -- Identified from Supabase docs and existing migration patterns
- Upsert composite key: HIGH -- Verified via PostgREST docs that onConflict accepts comma-separated columns

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable patterns, no moving targets)
