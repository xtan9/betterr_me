# Phase 24: Dashboard & Cross-Feature Integration - Research

**Researched:** 2026-02-23
**Domain:** Dashboard integration, cross-feature linking, streak computation, SWR widget architecture
**Confidence:** HIGH

## Summary

Phase 24 weaves journal functionality into the daily workflow through four features: a dashboard journal widget, habit/task linking on journal entries, "On This Day" past reflections, and a journal streak counter. The codebase already has strong foundations from prior phases: `JournalEntriesDB` and `JournalEntryLinksDB` classes exist, the journal entry modal and editor are complete, and the dashboard content component follows a well-established pattern of SWR data fetching with server-side initial data.

The primary technical challenge is the journal streak calculation. The project already uses streak tracking for habits (`current_streak` on the habits table), but journal entries have no pre-computed streak column — it must be computed from `journal_entries` date data. The streak query should be done server-side (either in the API route or as a DB-level query) and served via a dedicated lightweight API endpoint. The "On This Day" feature is a straightforward date-arithmetic query (same calendar date in prior periods). The linking feature requires new API routes for `journal_entry_links` (the DB class exists but has no API routes), plus a searchable chip-selection UI component.

**Primary recommendation:** Build four self-contained features, each with its own SWR hook and API endpoint. The dashboard widget should NOT extend the existing `/api/dashboard` response — it should use its own `/api/journal/today` endpoint per the project decision ("Dashboard journal widget must be self-contained").

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Journal Widget (Dashboard):**
- No-entry state: Claude's discretion — mood selector + prompt, simple CTA, or text preview; pick what fits the dashboard best
- Entry-exists state: Show mood icon + first 2-3 lines of entry text, with a "View entry" link
- Placement: After the habits section on the dashboard (not top of page, not sidebar)
- Click behavior: Navigate to the full journal page — no inline editing or modals on the dashboard
- Streak counter: Lives inside the journal widget card (not in a separate stats section)

**Habit/Task Linking:**
- Selection UX: Tag-style chips — type to search, habits/tasks appear as selectable chips (like tagging in a note app)
- Scope: Can link to any habit or task, not limited to today's date
- Availability: Available in both edit mode AND from the read-only view (quick "Link habit/task" action)
- Display on entry: Colored tag chips (like GitHub labels) — habits in one color, tasks in another

**On This Day:**
- Location: Both the dashboard (as a teaser card) and the journal entry page (fuller view)
- Lookback periods: Fixed intervals — 30 days ago, 90 days ago, 1 year ago
- Dashboard preview: Mood icon + 2-3 line excerpt + time period label (e.g., "30 days ago")
- Empty state: Show an encouraging message like "Keep journaling — you'll see reflections here soon!"

**Journal Streak:**
- Placement: Inside the journal widget on the dashboard AND on the journal page (e.g., header bar)
- Streak definition: Any entry counts — even just a mood selection with no text keeps the streak alive
- Milestones: Subtle visual highlight for milestone numbers (7 days, 30 days, etc.) — rewarding without being flashy

### Claude's Discretion
- Journal widget no-entry state design (mood selector, CTA, or text preview)
- Exact milestone thresholds and their visual treatment
- On This Day card layout and animation
- How the linking chip search/filter works technically
- Loading states and error handling for all new components

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | User can write a quick journal entry from a dashboard widget | Dashboard widget with mood selector + "Write more..." link navigating to `/journal` page. SWR hook fetches today's entry from `/api/journal/today`. No inline editing per locked decision — click navigates to full journal page. |
| INTG-02 | User can optionally link a journal entry to specific habits or tasks | New API routes `POST/DELETE /api/journal/[id]/links`. `JournalEntryLinksDB` already exists. New `LinkChipSelector` component using habits/tasks search endpoint. Colored chip display on entry modal and timeline cards. |
| INTG-03 | User can see "On This Day" past reflections for today's date | New API endpoint `/api/journal/on-this-day?date=YYYY-MM-DD` querying entries at 30d, 90d, 1y offsets. Dashboard teaser card shows mood + excerpt. Journal page shows full past entries. |
| INTG-04 | User can see a journal streak counter (consecutive days with entries) | New method on `JournalEntriesDB` to compute streak from entry_date data. Served via `/api/journal/today` response alongside today's entry. Displayed inside journal widget card and on journal page header. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SWR | (existing) | Data fetching for journal widget, streak, on-this-day | Already used throughout dashboard; self-contained hooks per widget pattern |
| Supabase JS | (existing) | DB queries for streak, links, on-this-day | Already the project's DB layer |
| next-intl | (existing) | i18n for all new UI strings | Already used in all components |
| Zod | (existing) | API validation for link creation | Already validates all API boundaries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (existing) | Icons for widget UI (Flame for streak, BookOpen for journal, etc.) | All icon usage in the project |
| sonner | (existing) | Toast notifications for link add/remove | Already used for feedback in dashboard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side streak computation | SQL window function | SQL is more efficient but adds migration complexity; client-side from dates array is simpler and sufficient for streak sizes under a few hundred |
| Separate streak API | Embed in `/api/journal?date=` response | Separate endpoint is cleaner per self-contained widget principle, avoids coupling |
| cmdk for chip search | Custom filtered list | cmdk adds a dependency; a simple filtered list with Radix Popover is lighter and matches existing patterns |

**Installation:**
No new packages required — all features use existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
app/api/journal/
├── route.ts              # Existing: GET (single/timeline), POST (upsert)
├── today/
│   └── route.ts          # NEW: GET today's entry + streak + on-this-day
├── [id]/
│   ├── route.ts          # Existing: GET, PATCH, DELETE
│   └── links/
│       └── route.ts      # NEW: GET links, POST add link, DELETE remove link
├── calendar/
│   └── route.ts          # Existing: GET calendar month data
└── on-this-day/
    └── route.ts          # NEW: GET reflections for specific date

components/journal/
├── journal-widget.tsx         # NEW: Dashboard journal widget card
├── journal-streak-badge.tsx   # NEW: Streak counter with milestone highlights
├── journal-on-this-day.tsx    # NEW: On This Day card (dashboard teaser)
├── journal-on-this-day-full.tsx # NEW: Full On This Day view (journal page)
├── journal-link-chips.tsx     # NEW: Display linked habits/tasks as colored chips
├── journal-link-selector.tsx  # NEW: Search + add chip selector for linking
└── (existing files...)

lib/hooks/
├── use-journal-widget.ts      # NEW: SWR hook for dashboard widget data
├── use-journal-links.ts       # NEW: SWR hook for entry links
└── (existing files...)
```

### Pattern 1: Self-Contained Dashboard Widget with Own SWR Hook
**What:** Each dashboard section fetches its own data independently via a dedicated SWR hook, not piggybacking on the main `/api/dashboard` response.
**When to use:** When adding new widgets to the dashboard that have independent data lifecycles.
**Why:** Project decision from STATE.md — "Dashboard journal widget must be self-contained (own SWR hook, not added to DashboardData)."

```typescript
// lib/hooks/use-journal-widget.ts
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getLocalDateString } from "@/lib/utils";

export function useJournalWidget() {
  const today = getLocalDateString();
  const { data, error, isLoading } = useSWR(
    `/api/journal/today?date=${today}`,
    fetcher,
    { keepPreviousData: true }
  );

  return {
    entry: data?.entry ?? null,
    streak: data?.streak ?? 0,
    onThisDay: data?.on_this_day ?? [],
    error,
    isLoading,
  };
}
```

### Pattern 2: Streak Computation from Date Array
**What:** Compute the consecutive-day streak by sorting entry dates and counting backwards from today.
**When to use:** When the number of entries is manageable (typical for a personal journal — hundreds, not millions).
**Why:** Avoids complex SQL window functions; computed server-side in the API route from a lightweight date-only query.

```typescript
// In the API route handler:
export function computeStreak(entryDates: string[], today: string): number {
  const dateSet = new Set(entryDates);
  let streak = 0;
  let current = today;

  while (dateSet.has(current)) {
    streak++;
    // Move to previous day
    const [y, m, d] = current.split("-").map(Number);
    const prev = new Date(y, m - 1, d - 1);
    current = [
      prev.getFullYear(),
      String(prev.getMonth() + 1).padStart(2, "0"),
      String(prev.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return streak;
}
```

### Pattern 3: On This Day Date Arithmetic
**What:** Query entries at fixed date offsets (30d, 90d, 1y) from the requested date.
**When to use:** For the "On This Day" reflections feature.

```typescript
// Compute lookback dates
function getLookbackDates(date: string): { label: string; date: string }[] {
  const [y, m, d] = date.split("-").map(Number);
  return [
    { label: "30_days_ago", date: formatDate(new Date(y, m - 1, d - 30)) },
    { label: "90_days_ago", date: formatDate(new Date(y, m - 1, d - 90)) },
    { label: "1_year_ago", date: formatDate(new Date(y - 1, m - 1, d)) },
  ];
}

// DB query: fetch entries for specific dates in one query
async getEntriesForDates(userId: string, dates: string[]): Promise<JournalEntry[]> {
  const { data, error } = await this.supabase
    .from("journal_entries")
    .select("id, entry_date, mood, title, content")
    .eq("user_id", userId)
    .in("entry_date", dates)
    .order("entry_date", { ascending: false });

  if (error) throw error;
  return data || [];
}
```

### Pattern 4: Link API Routes Following Existing Conventions
**What:** Nested routes under `/api/journal/[id]/links` with the same auth/validation pattern as existing journal routes.
**When to use:** For CRUD operations on journal entry links.

```typescript
// app/api/journal/[id]/links/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ... auth check ...
  // Validate with journalLinkSchema (already exists in lib/validations/journal.ts)
  const validation = validateRequestBody(body, journalLinkSchema);
  if (!validation.success) return validation.response;

  const linksDB = new JournalEntryLinksDB(supabase);
  const link = await linksDB.addLink({
    entry_id: id,
    link_type: validation.data.link_type,
    link_id: validation.data.link_id,
  });
  return NextResponse.json({ link }, { status: 201 });
}
```

### Pattern 5: Colored Chip Display (GitHub Label Style)
**What:** Tag-style chips with distinct colors for habits vs tasks, displayed inline on journal entries.
**When to use:** Displaying linked items on journal entry views.

```typescript
// Habit chips: teal/cyan family (matches project's habit color scheme)
// Task chips: blue/indigo family (matches project's task color scheme)
const LINK_COLORS: Record<JournalLinkType, { bg: string; text: string }> = {
  habit: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-200" },
  task: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200" },
  project: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-200" },
};
```

### Anti-Patterns to Avoid
- **Extending DashboardData type:** Do NOT add journal data to the existing `DashboardData` interface or `/api/dashboard` route. The journal widget is self-contained.
- **Client-side streak from full entries:** Do NOT fetch full journal entry content just to count dates. Use a lightweight date-only query.
- **Inline editing on dashboard:** Per locked decision, dashboard widget clicks navigate to journal page. No modals or inline editors on the dashboard.
- **Coupling On This Day to calendar endpoint:** The calendar endpoint returns a single month; On This Day needs specific dates across years. Use a separate query.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chip/tag selection UI | Custom dropdown + input combo | Radix Popover + Command pattern (simple filtered list) | Keyboard navigation, accessibility, focus management |
| Date arithmetic | Manual string parsing | `new Date()` constructor with numeric args | Handles month/year boundaries correctly |
| Streak persistence | Denormalized `streak` column on journal_entries | Compute on-read from entry dates | Avoids sync bugs when entries are deleted/backdated |
| Entry link validation | Manual FK checks | Zod schema (`journalLinkSchema` already exists) | Schema already validates link_type enum and UUID format |

**Key insight:** The journal entry links DB class and Zod validation schema both already exist from Phase 20. This phase only needs to build the API routes and UI components that use them.

## Common Pitfalls

### Pitfall 1: Streak Off-By-One with "Today"
**What goes wrong:** Streak counts today's entry but the user hasn't written yet, showing 0 when they had a streak yesterday.
**Why it happens:** If today has no entry yet, a naive implementation starts counting from today and immediately finds no entry.
**How to avoid:** If today has no entry, start the streak count from yesterday. If yesterday has no entry either, streak is 0. If today has an entry, include it.
**Warning signs:** Streak shows 0 in the morning for a user who wrote every day last week.

### Pitfall 2: On This Day Missing Entries Due to Timezone
**What goes wrong:** Querying for "30 days ago" using UTC yields wrong dates for users in different timezones.
**Why it happens:** The project stores `entry_date` as DATE (no timezone), but date arithmetic might inadvertently use UTC.
**How to avoid:** Compute lookback dates from the client-provided `date` parameter (already a YYYY-MM-DD string in local time). Never use `new Date().toISOString()` for date arithmetic — use the project's `getLocalDateString()` pattern.
**Warning signs:** On This Day shows entries from adjacent dates.

### Pitfall 3: N+1 Queries for Link Display Names
**What goes wrong:** Fetching linked items (habit names, task titles) one-by-one for each link.
**Why it happens:** The `journal_entry_links` table stores only the UUID reference, not the name.
**How to avoid:** When fetching links for an entry, batch-fetch the linked items. Options: (a) Join in Supabase (if FK exists), (b) Collect all link_ids by type and do 2 queries (one for habits, one for tasks), or (c) Return links with their names from a dedicated endpoint that does the join.
**Warning signs:** Slow load times on entries with many linked items.

### Pitfall 4: Stale Widget Data After Journal Write
**What goes wrong:** User writes a journal entry on the journal page, returns to dashboard, widget still shows "no entry for today."
**Why it happens:** The journal widget SWR cache isn't invalidated when the journal page saves.
**How to avoid:** Use SWR's `revalidateOnFocus: true` so the widget refreshes when the user navigates back to the dashboard tab/page. This is already the pattern used by the existing dashboard SWR hook.
**Warning signs:** Widget shows stale data after page navigation.

### Pitfall 5: Link Selector Showing Archived/Completed Items
**What goes wrong:** The search for linkable habits/tasks returns archived habits or completed tasks from months ago.
**Why it happens:** Unfiltered query returns all items.
**How to avoid:** Filter to active habits and recent/incomplete tasks by default. The habits search should use `status: 'active'`; tasks should default to incomplete or recent.
**Warning signs:** Long list of irrelevant items in the link selector.

### Pitfall 6: Streak Counter Not Including Mood-Only Entries
**What goes wrong:** User selects only a mood (no text), but the streak doesn't count it.
**Why it happens:** Filtering entries by `word_count > 0` or requiring content.
**How to avoid:** Per locked decision: "Any entry counts — even just a mood selection with no text keeps the streak alive." The streak query should check for entry existence only (`entry_date` exists in table), not content quality.
**Warning signs:** Streak resets after a mood-only day.

## Code Examples

### Journal Widget Component Structure
```typescript
// components/journal/journal-widget.tsx
"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BookOpen, Flame } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { JournalMoodSelector, MOODS } from "./journal-mood-selector";
import { JournalStreakBadge } from "./journal-streak-badge";
import { getPreviewText } from "@/lib/journal/utils";
import { useJournalWidget } from "@/lib/hooks/use-journal-widget";

export function JournalWidget() {
  const t = useTranslations("dashboard.journal");
  const router = useRouter();
  const { entry, streak, isLoading } = useJournalWidget();

  const handleNavigate = () => router.push("/journal");

  // ... render no-entry state or entry-exists state
}
```

### Streak Badge with Milestone Highlights
```typescript
// components/journal/journal-streak-badge.tsx
const MILESTONES = [7, 14, 30, 60, 90, 180, 365];

function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak);
}

export function JournalStreakBadge({ streak }: { streak: number }) {
  const t = useTranslations("dashboard.journal.streak");

  if (streak === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-1 text-sm",
      isMilestone(streak) ? "text-orange-500 font-semibold" : "text-muted-foreground"
    )}>
      <Flame className={cn("size-4", isMilestone(streak) && "text-orange-500")} />
      {t("count", { count: streak })}
    </div>
  );
}
```

### Aggregated Today Endpoint
```typescript
// app/api/journal/today/route.ts
// Returns: { entry, streak, on_this_day }
// Single request for the dashboard widget to avoid multiple fetches.
export async function GET(request: NextRequest) {
  // ... auth ...
  const date = searchParams.get("date") || getLocalDateString();
  const journalDB = new JournalEntriesDB(supabase);

  const [entry, recentDates, onThisDayEntries] = await Promise.all([
    journalDB.getEntryByDate(user.id, date),
    journalDB.getRecentEntryDates(user.id, date, 400), // last 400 days of dates
    journalDB.getEntriesForDates(user.id, getLookbackDates(date).map(d => d.date)),
  ]);

  const streak = computeStreak(recentDates, date);

  return NextResponse.json({
    entry: entry ? {
      id: entry.id,
      mood: entry.mood,
      title: entry.title,
      content: entry.content,
      word_count: entry.word_count,
    } : null,
    streak,
    on_this_day: onThisDayEntries.map(e => ({
      ...e,
      period: getLookbackLabel(date, e.entry_date),
    })),
  });
}
```

### New DB Method: Get Recent Entry Dates (Lightweight)
```typescript
// Added to JournalEntriesDB class
async getRecentEntryDates(
  userId: string,
  beforeDate: string,
  limit = 400
): Promise<string[]> {
  const { data, error } = await this.supabase
    .from("journal_entries")
    .select("entry_date")
    .eq("user_id", userId)
    .lte("entry_date", beforeDate)
    .order("entry_date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(d => d.entry_date);
}
```

### Link Chip Selector with Search
```typescript
// components/journal/journal-link-selector.tsx
// Uses Popover + filtered list pattern (similar to existing category selectors)
// Fetches habits and tasks, filters by search text, displays as colored chips

export function JournalLinkSelector({
  entryId,
  existingLinks,
  onLinkAdded,
  onLinkRemoved,
}: JournalLinkSelectorProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { habits } = useHabits();  // Existing hook
  const { data: tasks } = useSWR("/api/tasks?is_completed=false", fetcher);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    const habitItems = (habits || [])
      .filter(h => h.status === "active" && h.name.toLowerCase().includes(q))
      .map(h => ({ type: "habit" as const, id: h.id, name: h.name }));
    const taskItems = (tasks?.tasks || [])
      .filter(t => t.title.toLowerCase().includes(q))
      .map(t => ({ type: "task" as const, id: t.id, name: t.title }));
    return [...habitItems, ...taskItems];
  }, [habits, tasks, search]);

  // ... Popover with input + scrollable list of chips
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQL window functions for streaks | Application-level date iteration | N/A — project pattern | Simpler, no migration, sufficient for personal journal scale |
| Embedded sub-resource data in parent response | Dedicated sub-resource endpoints | REST best practice | Cleaner cache invalidation, independent lifecycle |
| Single monolithic dashboard API | Self-contained widget hooks | Project decision (STATE.md) | Each widget owns its data, avoids bloating DashboardData |

**Deprecated/outdated:**
- None — all patterns used are current with the project's stack.

## Open Questions

1. **Streak computation scope — how far back to query?**
   - What we know: A daily journal streak for a personal user is unlikely to exceed 365 days. Querying 400 recent dates is sufficient.
   - What's unclear: Whether to cap the backward query or let it go unbounded.
   - Recommendation: Use LIMIT 400 on the date query. If a user has a 400+ day streak, showing "400+" is acceptable. Can be increased later if needed.

2. **Should "On This Day" entries be returned from the same endpoint as today's entry?**
   - What we know: Both are needed for the dashboard widget. Bundling reduces HTTP requests.
   - What's unclear: Whether the journal page also needs this data (it does, per CONTEXT.md).
   - Recommendation: Use the bundled `/api/journal/today` endpoint for the dashboard, and a separate `/api/journal/on-this-day` endpoint for the journal page (where it needs to show full content, not just teasers).

3. **Link names enrichment — where to resolve habit/task names?**
   - What we know: `journal_entry_links` stores only UUIDs. Display needs human-readable names.
   - What's unclear: Whether to use Supabase joins or application-level resolution.
   - Recommendation: Application-level resolution in the API route. Fetch links, collect IDs by type, batch-query habits and tasks tables, merge names. This avoids complex cross-table joins and keeps the DB layer simple.

## Sources

### Primary (HIGH confidence)
- Project codebase: `components/dashboard/dashboard-content.tsx` — established dashboard widget pattern
- Project codebase: `lib/db/journal-entries.ts` — existing JournalEntriesDB methods
- Project codebase: `lib/db/journal-entry-links.ts` — existing JournalEntryLinksDB class (DB layer ready)
- Project codebase: `lib/validations/journal.ts` — existing `journalLinkSchema` Zod validator
- Project codebase: `lib/hooks/use-journal-entry.ts` — established SWR pattern for journal data
- Project codebase: `supabase/migrations/20260222100002_create_journal_entry_links.sql` — schema confirmed
- Context7 `/vercel/swr-site` — SWR conditional fetching, keepPreviousData patterns
- Project STATE.md — "Dashboard journal widget must be self-contained (own SWR hook, not added to DashboardData)"

### Secondary (MEDIUM confidence)
- Context7 `/supabase/supabase` — date range queries, gap detection patterns
- Standard SQL streak computation pattern (iterative date comparison) — widely documented

### Tertiary (LOW confidence)
- None — all findings verified against codebase and official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns directly observed in codebase, project decisions documented
- Pitfalls: HIGH — derived from existing codebase patterns and timezone/streak edge cases
- Code examples: HIGH — based on existing project code and verified SWR patterns

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable — no moving parts, all existing stack)
