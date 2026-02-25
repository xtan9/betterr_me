# Phase 23: Journal Page & Navigation - Research

**Researched:** 2026-02-23
**Domain:** Calendar UI, timeline/infinite scroll, sidebar navigation
**Confidence:** HIGH

## Summary

Phase 23 replaces the current empty-state placeholder on `/journal` with two interactive views -- a calendar showing mood-colored dot indicators on days with entries, and a reverse-chronological timeline feed -- plus adds a "Journal" item to the sidebar navigation. The backend infrastructure is already complete: the calendar API (`GET /api/journal/calendar?year=N&month=N`), timeline API (`GET /api/journal?mode=timeline`), SWR hooks (`useJournalCalendar`, `useJournalTimeline`), and the journal page route with server-component auth + client-component content pattern.

The primary work is purely frontend: (1) a `JournalCalendar` component wrapping the existing shadcn/ui Calendar (react-day-picker v8.10.1) with custom `DayContent` rendering for mood dots, (2) a `JournalTimeline` component with a "Load More" button consuming `useJournalTimeline`, (3) Tabs to switch between calendar and timeline views, (4) wiring calendar day clicks to open `JournalEntryModal` with the selected date, and (5) adding a `journal` nav item to `mainNavItems` in `app-sidebar.tsx` with the `BookOpen` icon.

**Primary recommendation:** Build all new UI as client components in `components/journal/`, reuse the existing SWR hooks and `JournalEntryModal` as-is, and keep the "Load More" pattern manual (button, not infinite scroll) to avoid adding IntersectionObserver complexity.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRWS-01 | User can view a calendar showing which days have journal entries (dot indicators) | Calendar component using react-day-picker v8 `modifiers` + custom `DayContent` with mood-colored dots. `useJournalCalendar` hook and `/api/journal/calendar` route already exist. |
| BRWS-02 | User can click a calendar day to view or create that day's entry | `onDayClick` handler on DayPicker. Days with entries: open `JournalEntryModal` for that date (edit mode). Days without: open modal for that date (create mode). Modal already handles both via upsert. |
| BRWS-03 | User can scroll a timeline feed of past entries chronologically | Timeline component consuming `useJournalTimeline` hook. Cursor-based pagination via "Load More" button. Each card shows mood emoji, date, title, and content preview (using `getPreviewText` from `lib/journal/utils.ts`). |
| BRWS-04 | User can access journal via a sidebar navigation entry | Add `{ href: "/journal", icon: BookOpen, labelKey: "journal", match: (p) => p.startsWith("/journal") }` to `mainNavItems` in `app-sidebar.tsx`. Add `"journal": "Journal"` to `common.nav` in all 3 locale files. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-day-picker | 8.10.1 | Calendar UI | Already installed; shadcn/ui Calendar wraps it |
| shadcn/ui Calendar | n/a | Styled calendar wrapper | Already in `components/ui/calendar.tsx` |
| shadcn/ui Tabs | n/a | Calendar/Timeline view switcher | Already used in habit-list, prompt-browser |
| SWR | (existing) | Data fetching for calendar + timeline | Project standard; hooks already exist |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.511.0 | `BookOpen` icon for sidebar, `CalendarDays`/`List` icons for tabs | Already installed |
| next-intl | (existing) | i18n strings for new UI | All user-facing strings |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-day-picker v8 | react-day-picker v9 | v9 has different component API (Day vs DayContent), would require rewriting shadcn Calendar component. Stay on v8. |
| Manual "Load More" | useSWRInfinite + IntersectionObserver | Adds complexity for infinite scroll. Not needed for an initial timeline view. Can be added later. |
| Full-page calendar (react-big-calendar) | react-day-picker | The mini calendar is the right scale for a journal; big-calendar is overkill |

**Installation:**
```bash
# No new packages needed - everything is already installed
```

## Architecture Patterns

### Recommended Component Structure
```
components/journal/
├── journal-calendar.tsx        # Calendar with mood dots + day click handler
├── journal-timeline.tsx        # Timeline feed with load-more
├── journal-timeline-card.tsx   # Single timeline entry card
├── journal-mood-dot.tsx        # Tiny mood-colored dot indicator (reusable)
app/journal/
├── journal-page-content.tsx    # Updated: Tabs switching calendar/timeline + modal
```

### Pattern 1: Custom DayContent in react-day-picker v8
**What:** Override the `DayContent` component to render a mood-colored dot below the day number.
**When to use:** When days with entries need visual indicators beyond simple styling.
**Example:**
```typescript
// react-day-picker v8 custom DayContent
import { DayContent, DayContentProps } from "react-day-picker";

interface JournalDayContentProps extends DayContentProps {
  entryMap: Map<string, { mood: number }>;
}

function JournalDayContent(props: JournalDayContentProps) {
  const dateStr = getLocalDateString(props.date);
  const entry = props.entryMap.get(dateStr);

  return (
    <div className="relative flex flex-col items-center">
      <DayContent {...props} />
      {entry && (
        <div
          className={cn("absolute -bottom-1 size-1.5 rounded-full", moodColor(entry.mood))}
        />
      )}
    </div>
  );
}
```

**Key v8 API note:** In react-day-picker v8, the `components` prop accepts `DayContent` (not `Day` or `DayButton` which are v9 concepts). The shadcn Calendar component already forwards `...props` to DayPicker, so custom `components` can be passed through.

### Pattern 2: Mood-to-Color Mapping
**What:** Map mood values (1-5) to Tailwind dot colors.
**When to use:** Calendar dots and timeline cards.
**Example:**
```typescript
// Mood 1-5 mapped to dot colors
const MOOD_COLORS: Record<number, string> = {
  5: "bg-green-500",   // Amazing
  4: "bg-emerald-400", // Good
  3: "bg-yellow-400",  // Okay
  2: "bg-orange-400",  // Not great
  1: "bg-red-400",     // Awful
};

export function moodDotColor(mood: number): string {
  return MOOD_COLORS[mood] ?? "bg-muted-foreground";
}
```

### Pattern 3: Calendar Month Navigation with SWR
**What:** Track `currentMonth` (Date) state; extract year/month and pass to `useJournalCalendar`.
**When to use:** When the user navigates to prev/next month on the calendar.
**Example:**
```typescript
const [currentMonth, setCurrentMonth] = useState(() => new Date());
const year = currentMonth.getFullYear();
const month = currentMonth.getMonth() + 1; // 1-indexed

const { entries } = useJournalCalendar(year, month);

// Build lookup map for O(1) access in DayContent
const entryMap = useMemo(() => {
  const map = new Map<string, JournalCalendarDay>();
  entries.forEach(e => map.set(e.entry_date, e));
  return map;
}, [entries]);

<Calendar
  month={currentMonth}
  onMonthChange={setCurrentMonth}
  onDayClick={handleDayClick}
  components={{ DayContent: (props) => <JournalDayContent {...props} entryMap={entryMap} /> }}
/>
```

### Pattern 4: Manual Cursor-Based Timeline Pagination
**What:** Use the existing `useJournalTimeline` hook with manual cursor management.
**When to use:** Timeline feed with "Load More" button.
**Example:**
```typescript
const [allEntries, setAllEntries] = useState<JournalEntry[]>([]);
const [cursor, setCursor] = useState<string | null>(null);
const { entries, hasMore, isLoading } = useJournalTimeline(cursor);

// Append new entries when data loads
useEffect(() => {
  if (entries.length > 0) {
    setAllEntries(prev => {
      const existingDates = new Set(prev.map(e => e.entry_date));
      const newEntries = entries.filter(e => !existingDates.has(e.entry_date));
      return [...prev, ...newEntries];
    });
  }
}, [entries]);

const loadMore = () => {
  if (allEntries.length > 0) {
    setCursor(allEntries[allEntries.length - 1].entry_date);
  }
};
```

**Note:** The current `useJournalTimeline` hook is a simple SWR call, not `useSWRInfinite`. For the "Load More" pattern, we need to accumulate entries client-side. Alternatively, the hook could be refactored to use `useSWRInfinite`, but that's more complexity than needed for an initial implementation.

### Pattern 5: Sidebar Nav Item Addition
**What:** Add journal to `mainNavItems` array in `app-sidebar.tsx`.
**When to use:** Adding new top-level pages to sidebar navigation.
**Example:**
```typescript
import { BookOpen } from "lucide-react";

const mainNavItems = [
  // ...existing items...
  {
    href: "/journal",
    icon: BookOpen,
    labelKey: "journal",
    match: (p: string) => p.startsWith("/journal"),
  },
];
```

### Anti-Patterns to Avoid
- **Don't fetch full content in calendar view:** The calendar API already only selects `entry_date, mood, title` -- never pass `content` to calendar components.
- **Don't use UTC dates for calendar display:** Always use `getLocalDateString()` to convert Date objects to YYYY-MM-DD strings for comparison with `entry_date` values.
- **Don't create a separate route for timeline:** The API already supports `?mode=timeline` on `GET /api/journal`. Don't create `/api/journal/timeline`.
- **Don't modify `components/ui/calendar.tsx`:** It's shadcn-managed. Pass customizations via the `components`, `modifiers`, and `classNames` props instead.
- **Don't use `new Date(entry_date)` directly for comparison:** Parsing `"2026-02-23"` with `new Date()` gives a UTC midnight date which may be off by a day in certain timezones. Instead, compare strings directly or parse with `new Date(year, month-1, day)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar UI | Custom grid of days | shadcn/ui Calendar + react-day-picker v8 | Month navigation, accessibility, keyboard nav, outside days, locale support |
| Day indicator dots | Absolute-positioned divs in each cell | DayContent component override via `components` prop | react-day-picker's component injection handles cell layout correctly |
| Tiptap content preview | Custom JSON tree walker | `getPreviewText()` from `lib/journal/utils.ts` | Already handles recursive node extraction + truncation |
| Timeline pagination | Custom fetch + state | `useJournalTimeline` SWR hook | Already implements cursor-based pagination with `keepPreviousData` |
| Mood emoji lookup | Inline emoji strings | `MOODS` array from `journal-mood-selector.tsx` | Single source of truth for mood value/emoji mapping |

**Key insight:** Almost all the infrastructure for Phase 23 already exists (API routes, DB queries, SWR hooks, types, utility functions). The work is pure UI composition.

## Common Pitfalls

### Pitfall 1: Timezone Mismatch in Calendar Day Matching
**What goes wrong:** Calendar's `onDayClick` passes a JavaScript `Date` object. Converting it with `.toISOString().split("T")[0]` gives the UTC date, not the local date. In timezones west of UTC, this can be off by one day.
**Why it happens:** JavaScript Date objects represent UTC instants; string conversion depends on the method used.
**How to avoid:** Always use `getLocalDateString(date)` from `lib/utils.ts` to convert the clicked date to a YYYY-MM-DD string for API calls and map lookups.
**Warning signs:** Entries appearing on the wrong calendar day; clicking a day opens the wrong date's entry.

### Pitfall 2: DayContent Component Re-rendering
**What goes wrong:** Passing an inline arrow function as `components={{ DayContent: (props) => ... }}` creates a new component identity on every render, causing react-day-picker to unmount/remount all day cells on every state change.
**Why it happens:** React treats each new function reference as a new component type.
**How to avoid:** Either: (a) define the component outside the render using a closure over the entryMap via React context or a ref, or (b) use `useMemo` to stabilize the component reference when the entryMap changes. The simplest approach is to define a standalone component that receives the map as a prop.
**Warning signs:** Calendar flickering on hover, mood data requests firing on every interaction.

### Pitfall 3: SWR Key Changes on Month Navigation
**What goes wrong:** When the user navigates to a new month, the SWR key changes, causing a flash of empty state before data loads.
**Why it happens:** SWR fetches new data when the key changes; without `keepPreviousData`, data becomes `undefined` during the fetch.
**How to avoid:** The `useJournalCalendar` hook already uses `keepPreviousData: true`. Ensure the calendar component doesn't show an empty state while `isLoading` is true but entries from the previous month are still present.
**Warning signs:** Dots disappearing briefly when switching months.

### Pitfall 4: Timeline Entry Deduplication
**What goes wrong:** When entries are created/edited via the modal, the timeline data becomes stale. Re-fetching can introduce duplicates if the cursor hasn't moved.
**Why it happens:** Cursor-based pagination with client-side accumulation can lead to overlapping windows.
**How to avoid:** After modal close (entry created/edited/deleted), call `mutate` on both the calendar and timeline hooks, and reset the accumulated entries.
**Warning signs:** Same entry appearing twice in the timeline.

### Pitfall 5: Calendar Not Disabling Future Dates
**What goes wrong:** Users can click on future dates to create entries, which doesn't make sense for a reflective journal.
**Why it happens:** react-day-picker allows clicking all visible days by default.
**How to avoid:** Pass `disabled={{ after: new Date() }}` to the Calendar component to prevent selecting future dates.
**Warning signs:** Users creating entries for dates that haven't happened yet.

### Pitfall 6: Missing i18n Keys in All Three Locales
**What goes wrong:** New UI strings added only to `en.json` cause runtime errors or missing text in zh/zh-TW.
**Why it happens:** Forgetting to update all three locale files simultaneously.
**How to avoid:** Every task that adds i18n keys must add them to `en.json`, `zh.json`, and `zh-TW.json`.
**Warning signs:** Build warnings about missing translation keys; blank strings in non-English locales.

## Code Examples

Verified patterns from the existing codebase:

### Sidebar Nav Item (from app-sidebar.tsx)
```typescript
// Source: components/layouts/app-sidebar.tsx, lines 36-55
const mainNavItems = [
  {
    href: "/dashboard",
    icon: Home,
    labelKey: "dashboard",
    match: (p: string) => p === "/dashboard",
  },
  {
    href: "/habits",
    icon: ClipboardList,
    labelKey: "habits",
    match: (p: string) => p.startsWith("/habits"),
  },
  {
    href: "/tasks",
    icon: ListChecks,
    labelKey: "tasks",
    match: (p: string) => p.startsWith("/tasks"),
  },
  // ADD:
  {
    href: "/journal",
    icon: BookOpen,
    labelKey: "journal",
    match: (p: string) => p.startsWith("/journal"),
  },
];
```

### Calendar Hook Usage (existing hook)
```typescript
// Source: lib/hooks/use-journal-calendar.ts
const { entries, isLoading, mutate } = useJournalCalendar(year, month);
// entries: JournalCalendarDay[] = [{ entry_date, mood, title }]
```

### Timeline Hook Usage (existing hook)
```typescript
// Source: lib/hooks/use-journal-timeline.ts
const { entries, hasMore, isLoading, mutate } = useJournalTimeline(cursor);
// entries: JournalEntry[] (full objects)
// hasMore: boolean (entries.length === limit)
```

### Content Preview (existing utility)
```typescript
// Source: lib/journal/utils.ts
import { getPreviewText } from "@/lib/journal/utils";
const preview = getPreviewText(entry.content, 120); // "First 120 chars..."
```

### Mood Emoji Lookup (existing constant)
```typescript
// Source: components/journal/journal-mood-selector.tsx
import { MOODS } from "@/components/journal/journal-mood-selector";
const emoji = MOODS.find(m => m.value === entry.mood)?.emoji ?? "";
```

### Tabs Pattern (from existing components)
```typescript
// Source: components/habits/habit-list.tsx pattern
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs defaultValue="calendar">
  <TabsList>
    <TabsTrigger value="calendar">
      <CalendarDays className="size-4 mr-2" />
      {t("calendar")}
    </TabsTrigger>
    <TabsTrigger value="timeline">
      <List className="size-4 mr-2" />
      {t("timeline")}
    </TabsTrigger>
  </TabsList>
  <TabsContent value="calendar">
    <JournalCalendar ... />
  </TabsContent>
  <TabsContent value="timeline">
    <JournalTimeline ... />
  </TabsContent>
</Tabs>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-day-picker v8 `DayContent` component | react-day-picker v9 `Day`/`DayButton` components | v9 (2024) | Project stays on v8 -- use `DayContent` override, not v9 patterns |
| Full infinite scroll (IntersectionObserver) | Manual "Load More" for simple feeds | Current best practice for small datasets | Simpler implementation, no observer complexity |

**Deprecated/outdated:**
- react-day-picker v9 `Day` component: Not applicable to this project (v8.10.1 installed)
- `useDayPicker` hook from v9: Not available in v8; use `DayContent` component injection instead

## Open Questions

1. **Mood dot colors for dark mode**
   - What we know: Tailwind color classes like `bg-green-500` work in both modes, but may need opacity/shade adjustments for dark backgrounds.
   - What's unclear: Whether the exact green/yellow/red palette looks good against both light and dark calendar cells.
   - Recommendation: Use Tailwind's standard palette (green-500, emerald-400, yellow-400, orange-400, red-400) and test visually. These have enough contrast in both modes. Can fine-tune later.

2. **Timeline entry refresh after modal edits**
   - What we know: The modal's `onOpenChange` callback can trigger data refetch. Both calendar and timeline hooks expose `mutate()`.
   - What's unclear: Whether to reset the entire accumulated timeline or just mutate the current page.
   - Recommendation: On modal close, call `mutate()` on the timeline hook and reset accumulated entries. This gives a clean, up-to-date list at the cost of losing the "loaded more" position. Acceptable trade-off for correctness.

3. **Calendar locale (day names, start of week)**
   - What we know: react-day-picker supports `locale` prop for localized day names. The project has en/zh/zh-TW.
   - What's unclear: Whether Chinese locale should start weeks on Monday (ISO) or Sunday (traditional).
   - Recommendation: Defer locale-specific calendar customization to Phase 25 (i18n & Polish). For now, use the browser default locale which react-day-picker picks up automatically.

## Sources

### Primary (HIGH confidence)
- Project codebase: `components/ui/calendar.tsx` -- shadcn/ui Calendar wrapping react-day-picker v8.10.1
- Project codebase: `lib/hooks/use-journal-calendar.ts`, `lib/hooks/use-journal-timeline.ts` -- existing SWR hooks
- Project codebase: `app/api/journal/calendar/route.ts`, `app/api/journal/route.ts` -- existing API routes
- Project codebase: `components/layouts/app-sidebar.tsx` -- sidebar navigation pattern
- Project codebase: `components/journal/journal-mood-selector.tsx` -- MOODS constant
- Project codebase: `lib/journal/utils.ts` -- `getPreviewText()` utility
- Context7 `/gpbl/react-day-picker` -- v8 modifiers, modifiersClassNames, DayContent component override, onDayClick

### Secondary (MEDIUM confidence)
- Context7 `/shadcn-ui/ui` -- Calendar component customization patterns (v4 docs showing DayButton locale passing)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and used in the project
- Architecture: HIGH - Patterns directly observed in existing codebase (app-sidebar, habit-list tabs, journal hooks)
- Pitfalls: HIGH - Timezone handling and SWR patterns are well-documented project conventions (CLAUDE.md)

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable -- no library upgrades expected)
