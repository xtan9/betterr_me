# Phase 31: Calendar UI — Month View & Navigation — Research

## Executive Summary

Phase 31 delivers the first visible calendar page at `app/calendar/page.tsx` with a month grid, sidebar (mini-cal + layer toggles), and navigation header (today/prev/next/view switcher). The codebase has strong, consistent patterns for page structure, SWR data fetching, i18n, sidebar layout, and responsive design. The Phase 30 API (`GET /api/calendar-events?start_date=...&end_date=...`) is already built and returns `ExpandedCalendarEvent[]` with recurrence expansion. The shadcn `Calendar` component (react-day-picker 8.10.1) and `ToggleGroup` are available for reuse. No domain color CSS variables exist yet for the calendar-specific palette (teal/events, blue/tasks, amber/habits, red/bills, purple/workouts) — these need to be added to `globals.css`. The `week_start_day` user preference is available via `GET /api/profile` and is already used in other components.

## Existing Page Structure Pattern

All domain pages follow the same structure:

1. **Layout** (`app/<domain>/layout.tsx`): Wraps children in `<SidebarShell>` — a server component that reads the `sidebar_pinned` cookie and passes it to `<SidebarLayout>`.
2. **Page** (`app/<domain>/page.tsx`): Server component that authenticates via `createClient()`, fetches initial data, and passes it as props to a client component.
3. **Content Component** (`components/<domain>/<domain>-page-content.tsx`): `"use client"` component that uses SWR with `fallbackData` from the server-side initial fetch.

**Calendar page plan:**
- `app/calendar/layout.tsx` — `<SidebarShell>{children}</SidebarShell>` (identical to habits/tasks)
- `app/calendar/page.tsx` — Server component, auth check, redirect if not logged in. Unlike habits/dashboard which fetch initial data server-side, the calendar's date range depends on URL params (`?view=month&date=2026-04-01`), so server-side prefetch may be skipped in favor of pure SWR client-side fetching.
- `components/calendar/calendar-page-content.tsx` — Main `"use client"` component managing view state, date navigation, and SWR fetching.

**Key files:**
- `/home/xingdi/code/betterr_me/components/layouts/sidebar-shell.tsx` — Server component reading cookie
- `/home/xingdi/code/betterr_me/components/layouts/sidebar-layout.tsx` — Client layout with pin/hover state
- `/home/xingdi/code/betterr_me/components/layouts/page-header.tsx` — Reusable page header (title + actions)

## Sidebar & Navigation

**Current sidebar** (`components/layouts/app-sidebar.tsx`):
- Uses shadcn `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` primitives
- Nav items defined as a static array `mainNavItems` with `{ href, icon, labelKey, match }` shape
- Uses `useTranslations("common.nav")` for labels and `usePathname()` for active state
- Badges (habit/task counts) via `useSidebarCounts()` hook
- Icon from `lucide-react` — Calendar icon available as `Calendar` from lucide

**To add Calendar link:**
1. Import `CalendarDays` (or `Calendar`) from `lucide-react`
2. Add entry to `mainNavItems` array: `{ href: "/calendar", icon: CalendarDays, labelKey: "calendar", match: (p) => p.startsWith("/calendar") }`
3. Add `"calendar": "Calendar"` to `common.nav` in all 3 locale files

**Calendar's own sidebar content (mini-cal + layers):**
The app sidebar is global. The calendar-specific sidebar content (mini calendar picker, layer toggles, "+ New Event" button) is NOT part of the app sidebar. It should be a separate panel within the calendar page content area, similar to how Google Calendar has a left panel. This can be implemented as:
- A `<CalendarSidebar>` component rendered inside the calendar page content
- On desktop: visible as a left column (`flex` layout)
- On mobile: hidden or available via a sheet/drawer

## Shadcn Calendar Component

**File:** `/home/xingdi/code/betterr_me/components/ui/calendar.tsx`
- Wraps `react-day-picker` v8.10.1 `<DayPicker>`
- Already styled with BetterR.Me design tokens (primary, accent, muted-foreground)
- Supports `showOutsideDays` (default true), custom `classNames`, `mode` (single/range)
- Size: compact (8x8px cells) — suitable for sidebar mini calendar
- Navigation arrows (ChevronLeft/ChevronRight) included
- Supports `onSelect` callback for date selection
- Supports `weekStartsOn` prop (0=Sunday through 6=Saturday) — maps directly to `week_start_day` from profile

**Usage for mini calendar:** Pass `selected={currentDate}` and `onSelect={(date) => navigateToDate(date)}` plus `weekStartsOn={weekStartDay}`.

## Design Tokens & Color System

**File:** `/home/xingdi/code/betterr_me/app/globals.css`

Existing relevant tokens (light/dark pairs):
- **Primary (teal):** `--primary: 157 63% 45%` / `160 45% 55%` — maps to calendar events
- **Section-work (blue):** `--section-work: 215 75% 55%` / `215 60% 60%` — maps to tasks
- **Category-productivity (amber):** `--category-productivity: 40 85% 55%` / `40 70% 60%` — maps to habits
- **Priority-high (red):** `--priority-high: 0 72% 55%` / `0 60% 55%` — maps to bills
- **Stat-icon-purple:** `--stat-icon-purple: 270 60% 50%` — close to workout purple

**Missing tokens to add:**
New calendar-specific domain color variables for consistency:
```css
/* Calendar domain colors */
--calendar-event: var(--primary);
--calendar-event-muted: /* 12% opacity fill */;
--calendar-task: var(--section-work);
--calendar-task-muted: var(--section-work-muted);
--calendar-habit: var(--category-productivity);
--calendar-habit-muted: var(--category-productivity-muted);
--calendar-bill: var(--priority-high);
--calendar-bill-muted: /* new */;
--calendar-workout: 270 60% 55%;
--calendar-workout-muted: /* new */;
```

**Other design tokens available:**
- `--radius: 0.75rem` (matches `rounded-xl`)
- Typography: `--font-size-page-title`, `--font-size-section-heading`, `--font-size-caption`
- Spacing: `--spacing-card-padding: 1.5rem`, `--spacing-page-padding: 2rem`
- Content: `--content-max-width: 1400px`
- Sidebar: Full set of sidebar-specific tokens for bg, hover, active, border, ring

## SWR Data Fetching Pattern

**Established pattern** (from habits-page-content.tsx):
```tsx
const today = getLocalDateString();
const { data, error, isLoading, mutate } = useSWR<HabitWithTodayStatus[]>(
  `/api/habits?with_today=true&date=${today}`,
  fetcher,
  {
    fallbackData: initialHabits,
    revalidateOnFocus: true,
    keepPreviousData: true,
  },
);
```

**Calendar SWR key pattern:**
```tsx
const { startDate, endDate } = getMonthDateRange(currentDate, weekStartDay);
const { data, error, isLoading } = useSWR(
  `/api/calendar-events?start_date=${startDate}&end_date=${endDate}`,
  fetcher,
  { keepPreviousData: true },
);
```

Key considerations:
- SWR key changes when navigating months (startDate/endDate change) -> triggers refetch
- `keepPreviousData: true` prevents flashing skeleton during navigation
- The API returns `{ events: ExpandedCalendarEvent[] }`
- `lib/fetcher.ts` provides a generic fetcher that returns `res.json()`
- Profile/preferences fetched via `useSWR("/api/profile")` for `week_start_day`

## i18n Pattern

**Established pattern:**
- Client components: `const t = useTranslations("domain");`
- Namespace per domain: `"habits"`, `"tasks"`, `"dashboard"`, etc.
- New namespace needed: `"calendar"` in all 3 locale files

**Locale files:**
- `/home/xingdi/code/betterr_me/i18n/messages/en.json`
- `/home/xingdi/code/betterr_me/i18n/messages/zh.json`
- `/home/xingdi/code/betterr_me/i18n/messages/zh-TW.json`

**Nav translation** already under `common.nav` — add `"calendar": "Calendar"` / `"calendar": "日历"` / `"calendar": "日曆"`

**Calendar-specific strings needed:**
- Month names (may use `Intl.DateTimeFormat` with user locale instead of manual translation)
- Day abbreviations (Sun/Mon/Tue... — also via `Intl.DateTimeFormat`)
- "Today", "Month", "Week", "Day" view labels
- Layer names: "Events", "Tasks", "Habits", "Bills", "Workouts"
- "+N more" overflow text
- "Coming soon" placeholder for Day/Week views
- "+ New Event" button label

## Calendar API & Types

**API endpoint:** `GET /api/calendar-events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- Returns `{ events: ExpandedCalendarEvent[] }`
- Already handles auth, date validation, recurrence expansion
- File: `/home/xingdi/code/betterr_me/app/api/calendar-events/route.ts`

**Core type** (`lib/calendar/recurrence.ts`):
```ts
export type ExpandedCalendarEvent = CalendarEvent & { is_virtual: boolean };
```

**CalendarEvent fields** (from `lib/db/types.ts`):
- `id`, `user_id`, `title`, `description`, `start_date`, `start_time`, `end_date`, `end_time`
- `location`, `color`, `category_id`
- `is_recurring`, `recurrence_rule`, `end_type`, `end_date_recurrence`, `end_count`
- `recurring_event_id`, `original_date`, `is_exception`
- `created_at`, `updated_at`

**For month view rendering, the key fields are:**
- `start_date` — which day cell to place the event in
- `start_time` — for sorting within a day (null = all-day, sorts first)
- `title` — chip label text
- `color` — user-defined color override (null = use domain default teal)
- `is_virtual` — useful for distinguishing recurring instances (may need different click behavior later)

## Responsive Patterns

**Existing pattern** (from sidebar-layout.tsx):
- Mobile header (`md:hidden`): hamburger trigger + "BetterR.me" branding in a `h-14` bar
- Desktop: sidebar always visible (pin/hover controlled)
- Content area: `<div className="w-full px-4 py-6 sm:px-6 md:px-8 md:pt-10">`
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px)

**Calendar responsive plan:**
- **Desktop (lg+):** Calendar sidebar (mini-cal + layers) visible as left column, full 7-column month grid
- **Tablet (md):** Calendar sidebar collapses or hides, month grid fills width
- **Mobile (sm):** No calendar sidebar, compact month grid cells, view defaults to Month (Day/Week views are stubs)
- Per D-17: sidebar hidden on mobile (use Sheet or collapsible)
- Per D-18/VIEW-11: default view routing is Month for now (Week default on desktop and Day on mobile are stubs)

**Page header pattern** from `page-header.tsx`:
```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
```
Calendar header should follow similar responsive stacking.

## Month Grid Implementation Approach

**Grid structure:**
1. **Header row:** 7 day-of-week labels (respecting `week_start_day`)
2. **Grid body:** 5-6 rows of 7 day cells
3. Each cell: date number + up to 3 event chips + "+N more" pill

**Date range calculation:**
- Given `currentMonth` (e.g., April 2026) and `weekStartDay` (0=Sun):
  - First day of month: April 1 (Wednesday)
  - Grid starts: March 29 (preceding Sunday)
  - Last day of month: April 30
  - Grid ends: May 3 (following Saturday)
- This range is what gets passed to the API as `start_date` and `end_date`

**Event grouping:**
- Group `ExpandedCalendarEvent[]` by `start_date` into a `Map<string, ExpandedCalendarEvent[]>`
- For multi-day events (`start_date !== end_date`): need to show in each day cell within range
- Each day cell renders first 3 events as chips, then "+N more" if overflow

**Event chip design:**
- Small rounded pill with domain color (teal for events, fallback to `event.color` if set)
- Compact: just title text, truncated with ellipsis
- Per D-20: left border or background using domain color at 12% opacity

**Today highlight:**
- Compare each cell's date with `getLocalDateString()` result
- Apply teal ring/background (D-07)

**Outside month days:**
- Dates before month start and after month end: rendered with `text-muted-foreground` (D-08)

**Day click:**
- D-06: clicking a day navigates to Day view — update URL to `?view=day&date=YYYY-MM-DD`
- Since Day view is a stub in this phase, show a "Coming soon" state

**URL state management:**
- D-11: `?view=month&date=2026-04-01`
- Use `useSearchParams()` + `useRouter()` (already used in tasks)
- `view` param: `"day" | "week" | "month"` — defaults to `"month"` for this phase
- `date` param: YYYY-MM-DD — defaults to today

## Dependencies & Risks

**Dependencies:**
1. **Phase 30 complete** — Calendar events API must be working. Confirmed: `app/api/calendar-events/route.ts` exists with GET + POST endpoints.
2. **react-day-picker 8.10.1** — Pinned version, shadcn Calendar component wraps it. The `Calendar` UI component is v8 API (not v9). Ensure `weekStartsOn` prop works correctly.
3. **Profile API** — `GET /api/profile` must return `preferences.week_start_day`. Already used by habit-detail-content.

**Risks:**
1. **Calendar sidebar vs app sidebar confusion** — The calendar's left panel (mini-cal + layers) is separate from the app-wide sidebar. Must be implemented as page-level content, not by modifying the global sidebar. This is a UI layout concern, not a blocker.
2. **Multi-day event rendering in month grid** — Events spanning multiple days need to appear in each day cell. This adds complexity to the grouping logic. Consider a helper function `getEventDaysInRange(event, gridStart, gridEnd) -> string[]`.
3. **No existing calendar domain CSS variables** — Need to introduce domain color tokens in `globals.css` (light + dark mode). Existing tokens can be reused/aliased but the spec calls for specific domain colors.
4. **react-day-picker v8 locale support** — Day/month names should use browser locale via `Intl.DateTimeFormat` rather than relying on react-day-picker's locale prop, ensuring consistency with the app's next-intl locale detection.
5. **Performance** — Month view with many recurring events could return a large array. The recurrence engine already caps at 500 occurrences per event (`MAX_OCCURRENCES_PER_EVENT`), and a month range is ~35 days, so this is unlikely to be an issue.
6. **No event creation UI** — Per phase boundary, no event form in this phase. The "+ New Event" button is a placeholder. Users can only view events created via API/tests.

## RESEARCH COMPLETE
