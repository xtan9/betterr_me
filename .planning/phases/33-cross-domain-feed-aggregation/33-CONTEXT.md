# Phase 33: Cross-Domain Feed Aggregation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

Unified feed API (`/api/calendar/feed`) that aggregates tasks, habits, bills, and workouts alongside calendar events into a single response. Calendar UI renders all domain items with domain-specific colors and inline actions (task completion, habit toggle, bill dismissal, workout navigation). Sidebar layer toggles become functional for filtering by domain. No new domain features — only aggregation and display of existing data on the calendar.

</domain>

<decisions>
## Implementation Decisions

### Unified Feed API
- **D-01:** Single API endpoint `GET /api/calendar/feed?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` returns a flat array of `CalendarItem` objects normalized from all domains.
- **D-02:** Server-side aggregation: query CalendarEventsDB, TasksDB, HabitsDB (with `shouldTrackOnDate`), RecurringBillsDB, and WorkoutsDB in parallel using `Promise.all`. Normalize each to the `CalendarItem` shape.
- **D-03:** `CalendarItem` type as defined in design spec: `{ id, source, title, start_date, start_time, end_date, end_time, color, is_all_day, meta }`. The `source` field discriminates: `"event" | "task" | "habit" | "bill" | "workout"`.
- **D-04:** The `meta` object carries source-specific data: `is_completed` (tasks), `is_logged` (habits), `is_paid` (bills), `amount_cents` (bills), `location`/`description` (events).
- **D-05:** Feed API uses the same auth pattern as other routes: `createClient()` → `getUser()` → auth check → instantiate DB classes.

### Domain Color Coding (AGGR-05)
- **D-06:** Domain colors use existing CSS variables: events=`--calendar-event` (teal), tasks=`--calendar-task` (blue), habits=`--calendar-habit` (amber), bills=`--calendar-bill` (red), workouts=`--calendar-workout` (purple). The `color` field in CalendarItem maps to these.
- **D-07:** Events with a custom color override use that color; otherwise fall back to domain default.

### Domain Placement
- **D-08:** Tasks with `due_time` render at that time on the time grid; tasks without `due_time` go in the all-day row. (AGGR-01)
- **D-09:** Habits always render in the all-day row (they have no time component). (AGGR-02)
- **D-10:** Bills always render in the all-day row (by `next_due_date`). (AGGR-03)
- **D-11:** Workouts render at their `created_at` time. (AGGR-04)

### Inline Actions
- **D-12:** Tasks show a circle checkbox. Clicking toggles `is_completed` via `PATCH /api/tasks/:id`. Optimistic SWR update on the feed cache. (AGGR-07)
- **D-13:** Habits show a square checkbox. Clicking toggles the habit log via `POST /api/habits/{id}/toggle` (existing toggle endpoint that handles both logging and unlogging). Optimistic SWR update. (AGGR-08)
- **D-14:** Bills show a click action to mark paid/dismissed via existing bills API. Optimistic SWR update. (AGGR-09)
- **D-15:** Workouts: clicking navigates to the workout detail page via `router.push`. (AGGR-10)

### Layer Toggle Integration (AGGR-06)
- **D-16:** Feed API returns ALL domain items regardless of toggle state. Client-side filtering in `CalendarPageContent` based on active layers.
- **D-17:** Layer toggle state stored in CalendarPageContent component state. Sidebar `LAYERS` array becomes functional — currently only "events" is enabled by default; now all layers are enabled by default.
- **D-18:** Toggling a layer immediately shows/hides items of that domain — no re-fetch needed.

### Data Fetching
- **D-19:** Replace the existing `/api/calendar-events` SWR call with `/api/calendar/feed` as the primary data source for the calendar. The feed includes events, so the separate events-only fetch is redundant.
- **D-20:** SWR key: `/api/calendar/feed?start_date=${startDate}&end_date=${endDate}` with `keepPreviousData: true`.
- **D-21:** Inline action mutations call domain-specific APIs (tasks, habits, bills), then revalidate the feed SWR key.

### Calendar Item Component
- **D-22:** New `CalendarItem` component that renders differently based on `source`: events use existing EventBlock/EventChip, domain items get a domain-colored block/chip with an action icon (circle checkbox for tasks, square checkbox for habits, dismiss icon for bills, arrow for workouts).
- **D-23:** On month view, domain items render as colored chips (like EventChip but with domain color and a small action icon).
- **D-24:** On week/day views, timed domain items render as positioned blocks (like EventBlock but with domain color and inline action).

### i18n
- **D-25:** All new UI strings (domain labels, action labels, feed error messages) added to all 3 locale files.

### Claude's Discretion
- CalendarItem component internal structure (single component vs per-domain variants)
- Optimistic update implementation details for each domain's inline action
- How `shouldTrackOnDate` is called server-side for habits (may need profile preferences)
- Feed API response sorting order
- Workout time extraction from `created_at` timestamp

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Key sections: "Aggregation" (CalendarItem type, domain mapping table, SWR pattern), "Domain Color Coding" table

### Phase 31-32 Outputs (Calendar UI)
- `components/calendar/calendar-page-content.tsx` — Main calendar client component (SWR fetching, view routing, event state)
- `components/calendar/calendar-sidebar.tsx` — Sidebar with LAYERS const and toggle checkboxes (currently only events functional)
- `components/calendar/time-grid.tsx` — Shared time grid with EventBlock rendering
- `components/calendar/event-block.tsx` — Event block component (reference for domain item blocks)
- `components/calendar/event-chip.tsx` — Event chip for month view (reference for domain item chips)
- `components/calendar/all-day-row.tsx` — All-day events row (needs to accept domain items too)
- `components/calendar/month-grid.tsx` — Month grid with day cells
- `lib/calendar/date-utils.ts` — groupEventsByDate (may need to handle CalendarItem)

### Phase 30 Outputs (Event API)
- `app/api/calendar-events/route.ts` — Existing events-only API (reference for feed API pattern)
- `lib/calendar/recurrence.ts` — ExpandedCalendarEvent type and recurrence expansion

### Domain DB Classes
- `lib/db/tasks.ts` — TasksDB (getUserTasks with due_date filtering)
- `lib/db/habits.ts` — HabitsDB (getUserHabits)
- `lib/db/habit-logs.ts` — HabitLogsDB (getHabitLogs for date range)
- `lib/db/recurring-bills.ts` — RecurringBillsDB (bills with next_due_date)
- `lib/db/workouts.ts` — WorkoutsDB (getWorkouts with date filtering)
- `lib/habits/format.ts` — shouldTrackOnDate function

### Domain APIs (for inline actions)
- `app/api/tasks/[id]/route.ts` — PATCH for task completion toggle
- `app/api/habits/[id]/logs/route.ts` — GET for habit log queries (no POST/DELETE)
- `app/api/habits/[id]/toggle/route.ts` — POST to toggle habit log (creates or removes via HabitLogsDB.toggleLog)
- `app/api/money/bills/[id]/route.ts` — PATCH for bill paid/dismissed

### i18n
- `i18n/messages/en.json` — English locale
- `i18n/messages/zh.json` — Chinese simplified locale
- `i18n/messages/zh-TW.json` — Chinese traditional locale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CalendarSidebar` LAYERS const — domain list with CSS var references, already renders toggles (just needs functional callbacks)
- `EventBlock` — positioned event rendering, can be extended or wrapped for domain items
- `EventChip` — month view chip, can be extended for domain items
- `AllDayRow` — all-day display with overflow, needs to accept CalendarItem instead of just events
- `groupEventsByDate` — date grouping utility, needs to work with CalendarItem type
- `shouldTrackOnDate` from `lib/habits/format.ts` — determines if a habit is active on a given date
- All domain DB classes with existing query methods

### Established Patterns
- SWR with date-based keys and `keepPreviousData: true`
- `createClient()` → auth check → DB class pattern for API routes
- Optimistic SWR updates via `mutate` with updated data
- `useTranslations("calendar")` for all calendar strings

### Integration Points
- `CalendarPageContent` — switch from events-only SWR to feed SWR, add layer state + filtering
- `CalendarSidebar` — layer toggles become functional (need `onLayerToggle` callback)
- `TimeGrid` / `MonthGrid` / `WeekView` / `DayView` — pass CalendarItem[] instead of ExpandedCalendarEvent[]
- New API route: `app/api/calendar/feed/route.ts`
- New type: `CalendarItem` in `lib/calendar/types.ts`
- New component: `CalendarItemBlock` / `CalendarItemChip` for domain-specific rendering

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the design spec — follow the CalendarItem type and domain mapping table exactly as defined. Inline actions should feel instant (optimistic updates) and match the existing task/habit interaction patterns from their respective pages.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-cross-domain-feed-aggregation*
*Context gathered: 2026-04-02 via --auto mode*
