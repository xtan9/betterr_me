# Architecture Research

**Domain:** Journal/diary feature integration into existing habit tracking app
**Researched:** 2026-02-22
**Confidence:** HIGH (based on direct codebase analysis -- all patterns verified from source)

## System Overview

```
                         JOURNAL INTEGRATION MAP
                   (new components marked with [NEW])

  +--------------------- Sidebar Navigation ----------------------+
  |  Dashboard  |  Habits  |  Tasks  |  [NEW] Journal            |
  +--------------+---------+---------+---+------------------------+
                 |                       |
  +--------------v--------------+  +-----v---------------------------+
  |   Dashboard Page            |  |  [NEW] Journal Page             |
  | +-------------------------+ |  | +--------------------------+    |
  | | [NEW] Journal Widget    | |  | | Calendar View (entries)  |    |
  | | (quick entry card)      | |  | |  - dot indicators        |    |
  | +-------------------------+ |  | |  - month navigation      |    |
  | + existing habit/task cards |  | +--------------------------+    |
  +-----------------------------+  | +--------------------------+    |
                                   | | Timeline Feed            |    |
                                   | |  - chronological entries  |    |
                                   | |  - mood + linked items    |    |
                                   | +--------------------------+    |
                                   | +--------------------------+    |
                                   | | Entry Editor (new/edit)  |    |
                                   | |  - textarea body         |    |
                                   | |  - mood selector         |    |
                                   | |  - writing prompts       |    |
                                   | |  - habit/task linker     |    |
                                   | +--------------------------+    |
                                   +---------------------------------+

  +---------------------- API Layer ---------------------------------+
  |  [NEW] /api/journal             GET (list), POST (create)       |
  |  [NEW] /api/journal/[id]        GET, PATCH, DELETE              |
  |  [NEW] /api/journal/calendar    GET (entries-by-month dots)     |
  |  [MOD] /api/dashboard           + journal_today field           |
  +-----------------------------+-----------------------------------+
                                |
  +-----------------------------v-----------------------------------+
  |  DB Layer                                                       |
  |  [NEW] lib/db/journal-entries.ts   JournalEntriesDB class       |
  |  [MOD] lib/db/types.ts            + JournalEntry types          |
  |  [MOD] lib/db/index.ts            + export JournalEntriesDB     |
  +-----------------------------+-----------------------------------+
                                |
  +-----------------------------v-----------------------------------+
  |  Supabase                                                       |
  |  [NEW] journal_entries table                                    |
  |  [NEW] journal_entry_links junction table                       |
  |  [NEW] RLS policies per user                                    |
  +----------------------------------------------------------------+
```

## Component Responsibilities

### New Files

| Component | Responsibility | Pattern Source |
|-----------|----------------|---------------|
| `JournalEntriesDB` | CRUD for journal entries + linked items | Follows `TasksDB`, `HabitsDB` pattern |
| `journal-entries.ts` (DB) | Supabase queries, date-range fetching, calendar aggregation | Same constructor(supabase) pattern |
| `/api/journal/route.ts` | GET list + POST create journal entries | Mirrors `/api/tasks/route.ts` |
| `/api/journal/[id]/route.ts` | GET/PATCH/DELETE single entry | Mirrors `/api/tasks/[id]/route.ts` |
| `/api/journal/calendar/route.ts` | GET entries for a month (date + mood only, lightweight) | New but follows sidebar/counts pattern |
| `lib/validations/journal.ts` | Zod schemas for create + update | Mirrors `lib/validations/task.ts` |
| `lib/hooks/use-journal.ts` | SWR hooks for journal data | Mirrors `lib/hooks/use-habits.ts` |
| `components/journal/` | All journal UI components | New directory alongside `components/habits/` |
| `app/journal/` | Journal pages (list, new, [id], [id]/edit) | Mirrors `app/habits/` structure |

### Modified Files

| File | Change | Reason |
|------|--------|--------|
| `components/layouts/app-sidebar.tsx` | Add "Journal" nav item with `BookOpen` icon | New top-level section |
| `components/dashboard/dashboard-content.tsx` | Add `JournalWidget` in content area | Quick daily entry from dashboard |
| `app/api/dashboard/route.ts` | Add `journal_today` field (boolean: has entry today?) | Dashboard widget needs to know |
| `app/dashboard/page.tsx` | Pass `journal_today` through `initialData` | Server-side prefetch for widget |
| `lib/db/types.ts` | Add `JournalEntry`, `JournalEntryLink`, insert/update types, extend `DashboardData` | Type definitions |
| `lib/db/index.ts` | Export `JournalEntriesDB` | Standard barrel export |
| `i18n/messages/en.json` | Add `journal` namespace | New strings |
| `i18n/messages/zh.json` | Add `journal` namespace | New strings |
| `i18n/messages/zh-TW.json` | Add `journal` namespace | New strings |

## New File Structure

```
lib/
+-- db/
|   +-- journal-entries.ts        # JournalEntriesDB class
|   +-- types.ts                  # + JournalEntry, JournalEntryLink types
|   +-- index.ts                  # + export
+-- validations/
|   +-- journal.ts                # Zod schemas
+-- hooks/
|   +-- use-journal.ts            # SWR hooks
+-- journal/
    +-- prompts.ts                # Writing prompt definitions (static data)
    +-- moods.ts                  # Mood definitions (key -> emoji + label i18n key)

components/
+-- journal/
    +-- journal-entry-form.tsx     # Shared form (create + edit)
    +-- journal-entry-card.tsx     # Single entry in timeline
    +-- journal-calendar.tsx       # Calendar with entry dot indicators
    +-- journal-timeline.tsx       # Scrollable list of entries
    +-- journal-widget.tsx         # Dashboard quick-entry card
    +-- mood-selector.tsx          # Emoji/icon mood picker
    +-- prompt-selector.tsx        # Writing prompt display + selection
    +-- link-selector.tsx          # Habit/task linking UI

app/
+-- journal/
|   +-- layout.tsx                # SidebarShell wrapper
|   +-- loading.tsx               # Skeleton loading state
|   +-- page.tsx                  # Main journal page (calendar + timeline)
|   +-- new/
|   |   +-- page.tsx              # New entry page
|   +-- [id]/
|       +-- page.tsx              # View single entry
|       +-- edit/
|           +-- page.tsx          # Edit entry page
+-- api/
    +-- journal/
        +-- route.ts              # GET (list), POST (create)
        +-- [id]/
        |   +-- route.ts          # GET, PATCH, DELETE
        +-- calendar/
            +-- route.ts          # GET entries-per-day for month

supabase/
+-- migrations/
    +-- 2026MMDD000001_create_journal_entries.sql
```

### Structure Rationale

- **`components/journal/`**: Follows existing pattern of `components/habits/`, `components/tasks/`, `components/kanban/`. Domain-specific components grouped together.
- **`lib/journal/prompts.ts`**: Static prompt data does not need the DB -- simple TypeScript arrays with i18n keys. Mirrors how milestone thresholds are defined in `lib/habits/milestones.ts`.
- **`lib/journal/moods.ts`**: Static mood definitions (key, emoji, i18n label key). Keeps mood rendering consistent between the selector, cards, and calendar dots.
- **`app/journal/` route structure**: Mirrors `app/habits/` (list, new, [id], [id]/edit) for consistency. Uses the same `SidebarShell` layout.
- **`/api/journal/calendar/`**: Separate lightweight endpoint that returns only `{entry_date, mood}[]` for an entire month, avoiding transferring kilobytes of journal content just to render dots on a calendar.

## Database Schema

### `journal_entries` Table

```sql
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,                    -- one entry per day
  body TEXT NOT NULL DEFAULT '',                -- free-form text content
  mood TEXT,                                   -- mood key (nullable)
  prompt_key TEXT,                             -- writing prompt i18n key used (nullable)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Enforce one entry per user per day
  CONSTRAINT journal_entries_user_date_unique UNIQUE (user_id, entry_date)
);

-- Indexes
CREATE INDEX idx_journal_entries_user_date
  ON journal_entries(user_id, entry_date DESC);

-- RLS (mirrors existing pattern from categories, projects)
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own journal entries"
  ON journal_entries FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own journal entries"
  ON journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
  ON journal_entries FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
  ON journal_entries FOR DELETE USING (auth.uid() = user_id);

-- Reuse existing updated_at trigger
CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### `journal_entry_links` Junction Table

```sql
CREATE TABLE journal_entry_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL
    REFERENCES journal_entries(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('habit', 'task')),
  link_id UUID NOT NULL,           -- habit.id or task.id (soft reference)
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One link per entry+type+target
  CONSTRAINT journal_entry_links_unique
    UNIQUE (journal_entry_id, link_type, link_id)
);

CREATE INDEX idx_journal_entry_links_entry
  ON journal_entry_links(journal_entry_id);

-- RLS through parent join (user scoping via journal_entries)
ALTER TABLE journal_entry_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own journal entry links"
  ON journal_entry_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.journal_entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own journal entry links"
  ON journal_entry_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.journal_entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own journal entry links"
  ON journal_entry_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_entry_links.journal_entry_id
      AND journal_entries.user_id = auth.uid()
    )
  );
```

### Schema Design Decisions

| Decision | Rationale |
|----------|-----------|
| One entry per user per day (UNIQUE) | Journal is a daily reflection tool, not a multi-post-per-day blog. Simplifies calendar view and dashboard widget ("did you write today?"). |
| `entry_date` is DATE, not TIMESTAMPTZ | Follows existing timezone convention: dates are browser-local. Matches `habit_logs.logged_date` and task `due_date` patterns. |
| `body` is plain TEXT, not JSONB | Rich text editing is out of scope. Plain text with optional markdown rendering later. Avoids complexity of tiptap/draft.js state serialization. |
| `mood` is TEXT key, not emoji directly | Decouples display emoji from storage. Keys like `"good"`, `"neutral"`, `"bad"` map to emojis in the UI layer. Enables i18n-friendly mood labels. |
| `prompt_key` stores i18n key, not prompt text | Prompts are defined in code (`lib/journal/prompts.ts`). Storing the key allows prompt text to be translated and updated without migrating DB data. |
| Soft references in `journal_entry_links` (no FK to habits/tasks) | Habits and tasks can be deleted independently. Hard FK would require complex multi-target cascade logic. Soft reference with `link_type` discriminator is simpler and matches the "light tags" requirement from PROJECT.md. |
| No `category_id` on journal entries | Journal entries are daily reflections, not categorized items. The mood field serves the tagging purpose. Adding categories would create unnecessary UI complexity for a free-form feature. |
| `user_id` references `profiles(id)`, not `auth.users(id)` | Matches existing convention (projects table uses same pattern). The `profiles` table is the canonical user reference within the app schema. |

## TypeScript Types

```typescript
// In lib/db/types.ts

// =============================================================================
// JOURNAL ENTRIES
// =============================================================================

export type MoodKey =
  | "amazing"
  | "good"
  | "neutral"
  | "bad"
  | "terrible";

export interface JournalEntry {
  id: string;                    // UUID
  user_id: string;               // UUID
  entry_date: string;            // DATE (YYYY-MM-DD)
  body: string;                  // free-form text
  mood: MoodKey | null;          // mood key
  prompt_key: string | null;     // i18n prompt key
  created_at: string;            // TIMESTAMPTZ
  updated_at: string;            // TIMESTAMPTZ
}

export type JournalEntryInsert = Omit<
  JournalEntry,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type JournalEntryUpdate = Partial<
  Omit<JournalEntry, "id" | "user_id" | "created_at" | "updated_at">
>;

export type JournalLinkType = "habit" | "task";

export interface JournalEntryLink {
  id: string;
  journal_entry_id: string;
  link_type: JournalLinkType;
  link_id: string;               // habit or task UUID
  created_at: string;
}

export interface JournalEntryWithLinks extends JournalEntry {
  links: JournalEntryLink[];
}

// Calendar view: lightweight shape for dot indicators
export interface JournalCalendarDay {
  entry_date: string;            // YYYY-MM-DD
  mood: MoodKey | null;
}
```

### DashboardData Extension

```typescript
// Extend existing DashboardData interface
export interface DashboardData {
  habits: HabitWithAbsence[];
  tasks_today: Task[];
  tasks_tomorrow: Task[];
  milestones_today: HabitMilestone[];
  stats: {
    total_habits: number;
    completed_today: number;
    current_best_streak: number;
    total_tasks: number;
    tasks_due_today: number;
    tasks_completed_today: number;
  };
  _warnings?: string[];
  journal_today: boolean;  // NEW: whether user has a journal entry for today
}
```

## Architectural Patterns

### Pattern 1: One-Entry-Per-Day Upsert

**What:** The journal enforces one entry per day per user. Creating a second entry for the same day updates the existing one via Supabase upsert.
**When to use:** Always when creating entries from the dashboard widget or journal page.
**Trade-offs:** Simpler UX (user never sees "entry already exists" errors), but requires `ON CONFLICT` handling and the UNIQUE constraint.

```typescript
// In JournalEntriesDB
async upsertEntry(entry: JournalEntryInsert): Promise<JournalEntry> {
  const { data, error } = await this.supabase
    .from("journal_entries")
    .upsert(entry, { onConflict: "user_id,entry_date" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### Pattern 2: SWR with Date-Keyed Cache

**What:** SWR keys include the local date to ensure midnight cache refresh. Matches existing dashboard and sidebar-counts patterns.
**When to use:** All journal data fetching on the client.
**Trade-offs:** Guarantees fresh data when date changes, but creates new cache entries at midnight.

```typescript
// In lib/hooks/use-journal.ts
export function useJournalEntry(date: string) {
  const { data, error, isLoading, mutate } = useSWR<{
    entry: JournalEntryWithLinks | null;
  }>(
    `/api/journal?date=${date}`,
    fetcher,
    { keepPreviousData: true }
  );

  return {
    entry: data?.entry ?? null,
    error,
    isLoading,
    mutate,
  };
}

export function useJournalCalendar(yearMonth: string) {
  // yearMonth = "2026-02"
  const { data, error, isLoading } = useSWR<{
    days: JournalCalendarDay[];
  }>(
    `/api/journal/calendar?month=${yearMonth}`,
    fetcher,
    { keepPreviousData: true }
  );

  return {
    days: data?.days ?? [],
    error,
    isLoading,
  };
}
```

### Pattern 3: Lightweight Calendar Endpoint

**What:** Separate `/api/journal/calendar` endpoint returns only `{entry_date, mood}[]` for an entire month. No body text transferred.
**When to use:** Calendar view component fetches this, not the full entry list.
**Trade-offs:** Extra endpoint, but much better performance for the calendar view. A month returns at most 31 tiny rows vs. potentially 31 entries with multi-paragraph bodies.

```typescript
// In /api/journal/calendar/route.ts
export async function GET(request: NextRequest) {
  // ...auth check...
  const month = searchParams.get("month"); // "2026-02"
  const startDate = `${month}-01`;
  // Use last-day-of-month calculation to avoid date overflow
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("journal_entries")
    .select("entry_date, mood")
    .eq("user_id", user.id)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: true });

  return NextResponse.json({ days: data ?? [] });
}
```

### Pattern 4: Links as Post-Save Sync

**What:** Journal entry links are managed as a separate step after the entry itself is saved. The form collects selected habit/task IDs, then the API route syncs the links table (delete removed, insert added).
**When to use:** When creating or updating a journal entry with linked habits/tasks.
**Trade-offs:** Two-step save (entry + links) adds slight complexity but avoids nested transaction logic. Links are optional and lightweight.

```typescript
// In JournalEntriesDB
async syncLinks(
  entryId: string,
  links: { link_type: JournalLinkType; link_id: string }[]
): Promise<void> {
  // Delete existing links for this entry
  await this.supabase
    .from("journal_entry_links")
    .delete()
    .eq("journal_entry_id", entryId);

  // Insert new links (if any)
  if (links.length > 0) {
    const inserts = links.map((l) => ({
      journal_entry_id: entryId,
      link_type: l.link_type,
      link_id: l.link_id,
    }));
    const { error } = await this.supabase
      .from("journal_entry_links")
      .insert(inserts);
    if (error) throw error;
  }
}
```

### Pattern 5: Dashboard HEAD-Only Query

**What:** The dashboard only needs to know whether a journal entry exists for today (boolean), not the entry content. Use a count query with `head: true` to avoid transferring any row data.
**When to use:** Dashboard data fetching in `/api/dashboard/route.ts`.
**Trade-offs:** Adds one query to the existing `Promise.all`, but it is extremely cheap (HEAD-only).

```typescript
// In JournalEntriesDB
async hasEntryForDate(userId: string, date: string): Promise<boolean> {
  const { count, error } = await this.supabase
    .from("journal_entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entry_date", date);

  if (error) throw error;
  return (count ?? 0) > 0;
}
```

This follows the existing pattern in `TasksDB.getTaskCount()`.

## Data Flow

### Create/Edit Journal Entry Flow

```
User opens journal (dashboard widget or /journal/new)
    |
    v
[JournalEntryForm] --- mood selector, textarea, prompt, link selector
    |
    v  (submit)
[react-hook-form + zod validation]  (journalFormSchema)
    |
    v
fetch POST /api/journal  (or PATCH /api/journal/[id])
    |
    v
[API route]
    |-- createClient() (fresh server client, per existing convention)
    |-- auth.getUser() (verify authenticated)
    |-- validateRequestBody(body, journalFormSchema)
    |-- ensureProfile(supabase, user)
    |-- journalDB.upsertEntry({ user_id, entry_date, body, mood, prompt_key })
    |-- journalDB.syncLinks(entryId, links)  (if links provided)
    |
    v
Return { entry } with 201 (create) or 200 (update)
    |
    v
[SWR mutate] --- revalidate journal entry + calendar + dashboard caches
    |
    v
toast.success() + optionally navigate to /journal
```

### Dashboard Journal Widget Flow

```
[DashboardContent] mounts
    |
    v
useSWR("/api/dashboard?date=YYYY-MM-DD")
    |-- response now includes journal_today: boolean
    |
    v
[JournalWidget] renders in dashboard grid
    |-- if journal_today === true:
    |       Show "View today's entry" link -> /journal?date=YYYY-MM-DD
    |-- if journal_today === false:
    |       Show quick textarea + mood selector
    |       |
    |       v  (submit)
    |   POST /api/journal (upsert for today's date)
    |       |
    |       v
    |   mutate("/api/dashboard?date=...")  -- refresh widget state
    |
    v
Positioned in dashboard grid alongside HabitChecklist + TasksToday
```

### Calendar Browse Flow

```
User navigates to /journal
    |
    v
[JournalPage] (server component)
    |-- Renders JournalCalendar + JournalTimeline side by side
    |   (or stacked on mobile)
    |
    v
[JournalCalendar] (client component)
    |-- useJournalCalendar("2026-02")
    |-- GET /api/journal/calendar?month=2026-02
    |       returns [{entry_date: "2026-02-01", mood: "good"}, ...]
    |
    v
react-day-picker renders with custom modifiers:
    |-- days with entries get mood-colored dots (from existing Calendar UI)
    |-- clicking a day:
    |     if entry exists -> navigate to /journal/[id]
    |     if no entry -> navigate to /journal/new?date=YYYY-MM-DD
    |
    v
[JournalTimeline] (client component)
    |-- useSWR for entries in current month or selected range
    |-- chronological list of JournalEntryCard components
    |-- each card shows: date header, mood emoji, body preview, linked item badges
    |-- click card -> navigate to /journal/[id]
```

### State Management

```
No new global state needed. Follows existing SWR-only pattern:

SWR Cache Keys:
  /api/journal?date=YYYY-MM-DD          -- single entry for a date
  /api/journal?from=YYYY-MM-DD&to=...   -- entries in range (timeline)
  /api/journal/calendar?month=YYYY-MM    -- calendar dots for month
  /api/dashboard?date=YYYY-MM-DD         -- existing key, + journal_today

Cross-cache revalidation after journal upsert:
  1. mutate("/api/journal?date=YYYY-MM-DD")     -- refresh entry
  2. mutate("/api/journal/calendar?month=...")   -- refresh calendar dots
  3. mutate("/api/dashboard?date=...")           -- refresh dashboard widget
```

## Integration Points

### Sidebar Navigation (Modified)

Add to `mainNavItems` array in `components/layouts/app-sidebar.tsx`:

```typescript
import { BookOpen } from "lucide-react";

// Add after tasks item:
{
  href: "/journal",
  icon: BookOpen,
  labelKey: "journal",
  match: (p: string) => p.startsWith("/journal"),
}
```

Add `"journal": "Journal"` to `common.nav` in all three locale files. No badge needed for journal (unlike habits/tasks, journal has no "incomplete" concept that needs a count badge).

### Dashboard API (Modified)

In `/api/dashboard/route.ts`, add to the `Promise.all`:

```typescript
const journalDB = new JournalEntriesDB(supabase);

const [/* ...existing 5 queries... */, hasJournalToday] = await Promise.all([
  habitsDB.getHabitsWithTodayStatus(user.id, date),
  tasksDB.getTodayTasks(user.id, date),
  tasksDB.getTaskCount(user.id),
  tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
  milestonesDB.getTodaysMilestones(user.id, date).catch(/* ... */),
  // NEW: lightweight HEAD-only check
  journalDB.hasEntryForDate(user.id, date).catch((err) => {
    log.error("Failed to check journal entry", err, { userId: user.id, date });
    return false; // Degrade gracefully -- widget shows "write" state
  }),
]);
```

### Dashboard Server Page (Modified)

In `app/dashboard/page.tsx`, add `journal_today` to `initialData`:

```typescript
const initialData: DashboardData = {
  // ...existing fields...
  journal_today: hasJournalToday,
};
```

### Dashboard Content Component (Modified)

In `components/dashboard/dashboard-content.tsx`, add the journal widget to the render tree. Position it below the main content grid or as a third column element:

```typescript
const JournalWidget = dynamic(() =>
  import("@/components/journal/journal-widget").then(
    (m) => ({ default: m.JournalWidget })
  ),
);

// In the JSX, after the main grid:
<JournalWidget
  hasEntry={data.journal_today}
  date={today}
  onSaved={() => {
    mutate();  // Revalidate dashboard data
  }}
/>
```

### Existing Calendar Component (Reused)

The existing `components/ui/calendar.tsx` wraps `react-day-picker`. The journal calendar view uses this directly with custom `modifiers` and `modifiersClassNames` props to render mood-colored dots on days that have entries. No new calendar library needed.

```typescript
// In components/journal/journal-calendar.tsx
const entryDates = days.reduce<Record<string, MoodKey | null>>((acc, d) => {
  acc[d.entry_date] = d.mood;
  return acc;
}, {});

const modifiers = {
  hasEntry: (date: Date) => {
    const key = getLocalDateString(date);
    return key in entryDates;
  },
};
```

### Link Selector (Reads Existing Data)

The habit/task link selector fetches existing data from existing hooks:
- `useHabits({ status: "active" })` from `lib/hooks/use-habits.ts` (already exists)
- SWR fetch of `/api/tasks` (already exists)
- Renders as a multi-select with checkboxes or tag-style chips

No modification to habit or task APIs needed -- read-only consumption of existing endpoints.

## Anti-Patterns

### Anti-Pattern 1: Rich Text Editor for V1

**What people do:** Reach for tiptap, slate, or draft.js to build a "rich text area."
**Why it's wrong:** Massive bundle size increase (tiptap core alone is 100kb+ gzipped), complex serialization format decisions (HTML? JSON? ProseMirror doc?), and the PRD says "rich text area" meaning a large textarea, not a WYSIWYG editor.
**Do this instead:** Use the existing shadcn `<Textarea>` component with auto-grow styling. If markdown preview is desired later, add it as a view-only feature (render body with `react-markdown`) in a future milestone.

### Anti-Pattern 2: Multiple Entries Per Day

**What people do:** Allow unlimited journal entries per day, like a micro-blog.
**Why it's wrong:** Complicates the calendar view (which entry to show?), the dashboard widget (which is "today's"?), and the mental model. Journal is for daily reflection, not continuous logging.
**Do this instead:** One entry per day with a `UNIQUE(user_id, entry_date)` constraint. Dashboard widget always targets today's entry (create or update). Calendar shows one dot per day. This matches the Day One daily journal paradigm.

### Anti-Pattern 3: Hard FK on Links to Habits/Tasks

**What people do:** Add `REFERENCES habits(id)` or `REFERENCES tasks(id)` on the links table.
**Why it's wrong:** Postgres does not support conditional foreign keys where the target table depends on a discriminator column. You would need separate columns (`habit_id` + `task_id`) or a polymorphic pattern, both adding schema complexity. Deleting a habit would cascade to journal links, which is unexpected behavior.
**Do this instead:** Soft references with `link_type` + `link_id`. If the linked item is deleted, the link becomes an orphan. The UI can show "Deleted item" or silently filter orphaned links.

### Anti-Pattern 4: Storing Full Prompt Text in DB

**What people do:** Save the entire writing prompt text alongside the journal entry.
**Why it's wrong:** Prompts need i18n (three locales). If prompt text changes, stored copies are stale. Wastes storage.
**Do this instead:** Store only the prompt key (e.g., `"gratitude_3things"`). The UI resolves the key to localized text via `useTranslations("journal.prompts")`.

### Anti-Pattern 5: Loading All Entry Bodies for Calendar View

**What people do:** Fetch full journal entries to render the calendar, then discard the bodies.
**Why it's wrong:** Transfers potentially kilobytes of text per entry just to show dot indicators. With a year of daily entries, that is 365 full entries when the UI only needs 31 dates + moods for the current month.
**Do this instead:** Dedicated `/api/journal/calendar` endpoint that selects only `entry_date` and `mood` columns. Maximum 31 rows, each under 50 bytes.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-100 users (current) | Single `journal_entries` table, composite index on `(user_id, entry_date DESC)`. Calendar query scans at most 31 rows per month per user. Zero concern. |
| 100-10K users | Same architecture holds. RLS policies scale linearly. Consider adding `entry_date` range indexes if timeline pagination becomes slow for users with years of entries. |
| 10K+ users | If bodies become very large (>10KB each, unlikely for journaling), consider moving `body` to a separate `journal_entry_bodies` table to keep the main table lean for calendar/list queries. Not needed for V1. |

### Performance Notes

- **Calendar endpoint returns max 31 rows** per request (one month). Cost is negligible.
- **Timeline pagination:** For users with years of entries, add `?limit=20&offset=0` to the timeline endpoint. Likely not needed for V1 (users start with zero entries), but the API should support `limit` and `offset` params from the start so no breaking changes later.
- **Dashboard overhead:** One additional HEAD-only query (`hasEntryForDate`) adds negligible latency to the existing 5-query `Promise.all`. The `.catch()` wrapper ensures it degrades gracefully.
- **Link resolution:** When rendering a journal entry with links, the UI can batch-resolve linked habit/task names. This is a client-side concern (fetch habits and tasks that user already has cached via SWR). No extra API needed.

## Suggested Build Order

Build order based on dependency analysis: each phase depends only on previously completed phases.

### Phase 1: Database + Types + DB Class

**Depends on:** Nothing (foundation layer)
**Delivers:** Migration file, TypeScript types, `JournalEntriesDB` class with full CRUD + calendar + upsert
**Why first:** Every other piece depends on the data layer.

Files:
- `supabase/migrations/2026MMDD000001_create_journal_entries.sql`
- `lib/db/types.ts` (add journal types)
- `lib/db/journal-entries.ts` (new)
- `lib/db/index.ts` (add export)
- `lib/validations/journal.ts` (Zod schemas)
- `lib/journal/moods.ts` (mood key -> emoji + label mapping)
- `lib/journal/prompts.ts` (prompt definitions with i18n keys)

### Phase 2: API Routes

**Depends on:** Phase 1 (DB class + types + validation)
**Delivers:** Full CRUD + calendar API for journal entries
**Why second:** UI components need API endpoints to fetch from and submit to.

Files:
- `app/api/journal/route.ts` (GET list + POST create/upsert)
- `app/api/journal/[id]/route.ts` (GET + PATCH + DELETE)
- `app/api/journal/calendar/route.ts` (GET calendar data)

### Phase 3: SWR Hooks

**Depends on:** Phase 2 (API routes must exist for hooks to call)
**Delivers:** Client-side data hooks for all journal views

Files:
- `lib/hooks/use-journal.ts`

### Phase 4: Core UI Components

**Depends on:** Phase 3 (hooks for data), Phase 1 (moods + prompts definitions)
**Delivers:** Reusable journal UI building blocks

Files:
- `components/journal/mood-selector.tsx`
- `components/journal/prompt-selector.tsx`
- `components/journal/link-selector.tsx`
- `components/journal/journal-entry-form.tsx`
- `components/journal/journal-entry-card.tsx`

### Phase 5: Journal Page + Sidebar Nav

**Depends on:** Phase 4 (UI components)
**Delivers:** Full journal page with calendar + timeline + CRUD, sidebar navigation entry

Files:
- `app/journal/layout.tsx`
- `app/journal/loading.tsx`
- `app/journal/page.tsx`
- `app/journal/new/page.tsx`
- `app/journal/[id]/page.tsx`
- `app/journal/[id]/edit/page.tsx`
- `components/journal/journal-calendar.tsx`
- `components/journal/journal-timeline.tsx`
- `components/layouts/app-sidebar.tsx` (modify: add journal nav item)

### Phase 6: Dashboard Integration

**Depends on:** Phase 2 (journal API), Phase 4 (journal-entry-form reuse)
**Delivers:** Dashboard widget for quick daily journal entry, `journal_today` field

Files:
- `components/journal/journal-widget.tsx` (new)
- `components/dashboard/dashboard-content.tsx` (modify: add widget)
- `app/api/dashboard/route.ts` (modify: add hasEntryForDate query)
- `app/dashboard/page.tsx` (modify: prefetch journal_today)
- `lib/db/types.ts` (modify: extend DashboardData with journal_today)

### Phase 7: i18n + Polish

**Depends on:** All previous phases (need to know all strings)
**Delivers:** Full translation coverage in en, zh, zh-TW + dark mode verification

Files:
- `i18n/messages/en.json` (add `journal` namespace + `common.nav.journal`)
- `i18n/messages/zh.json` (same)
- `i18n/messages/zh-TW.json` (same)

**Note:** i18n keys should be added incrementally during each phase. Phase 7 is a final audit pass to ensure nothing was missed and all three locales are complete.

## Sources

- Direct codebase analysis of `/home/xingdi/code/betterr_me/` -- all patterns verified from source files (HIGH confidence)
- Existing migration patterns: `supabase/migrations/20260222000001_create_categories_table.sql`, `20260219000001_create_projects_table.sql` (HIGH confidence)
- Existing DB class patterns: `lib/db/tasks.ts`, `lib/db/habits.ts`, `lib/db/categories.ts`, `lib/db/projects.ts` (HIGH confidence)
- Existing API route patterns: `app/api/tasks/route.ts`, `app/api/dashboard/route.ts`, `app/api/sidebar/counts/route.ts` (HIGH confidence)
- Existing SWR hook patterns: `lib/hooks/use-habits.ts`, `lib/hooks/use-sidebar-counts.ts` (HIGH confidence)
- Existing validation patterns: `lib/validations/task.ts`, `lib/validations/api.ts` (HIGH confidence)
- Existing sidebar pattern: `components/layouts/app-sidebar.tsx` (HIGH confidence)
- Existing dashboard pattern: `components/dashboard/dashboard-content.tsx`, `app/dashboard/page.tsx` (HIGH confidence)
- Existing Calendar UI component: `components/ui/calendar.tsx` (react-day-picker wrapper) (HIGH confidence)
- Project requirements: `.planning/PROJECT.md` v4.0 Journal milestone definition (HIGH confidence)

---
*Architecture research for: Journal feature integration into BetterR.Me*
*Researched: 2026-02-22*
