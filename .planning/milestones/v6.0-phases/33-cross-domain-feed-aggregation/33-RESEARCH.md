# Phase 33: Cross-Domain Feed Aggregation - Research

**Researched:** 2026-04-01
**Question:** What do I need to know to PLAN this phase well?

## 1. Current Architecture Snapshot

### Calendar Data Flow (today)
1. `CalendarPageContent` computes `startDate`/`endDate` based on view (month/week/day)
2. SWR fetches `GET /api/calendar-events?start_date=X&end_date=Y`
3. API returns `{ events: ExpandedCalendarEvent[] }` (recurrence-expanded)
4. `groupEventsByDate()` creates `Map<string, ExpandedCalendarEvent[]>`
5. Map is passed to `MonthGrid`, `WeekView`, or `DayView`
6. Views render via `EventBlock` (time grid) and `EventChip` (month/all-day)

### Key Types
- `ExpandedCalendarEvent = CalendarEvent & { is_virtual: boolean }` — the current item type flowing through all calendar components
- Every component (`TimeGrid`, `AllDayRow`, `MonthDayCell`, `WeekView`, `DayView`, `EventBlock`, `EventChip`) is typed to `ExpandedCalendarEvent`

### Sidebar Layer State
- `CalendarSidebar` has a `LAYERS` const with 5 entries (events, tasks, habits, bills, workouts)
- Currently only `events` has `enabled: true`; others are disabled with tooltip "Coming in a future phase"
- `enabledLayers` is local state in `CalendarSidebar` (a `Set<string>`) — **not** lifted to `CalendarPageContent`
- No `onLayerToggle` callback is passed to the parent

## 2. New API: `/api/calendar/feed`

### Route Structure
- **File:** `app/api/calendar/feed/route.ts`
- **Method:** `GET /api/calendar/feed?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
- **Auth:** `createClient()` -> `getUser()` (standard pattern)

### Data Sources to Query (in parallel via `Promise.all`)

| Domain | DB Class | Method | Notes |
|--------|----------|--------|-------|
| Events | `CalendarEventsDB` | `getUserEvents(userId, startDate, endDate)` + `expandEventsForRange()` | Existing, works as-is |
| Tasks | `TasksDB` | `getUserTasks(userId, filters)` | **Gap:** `TaskFilters.due_date` only supports exact match, not range. Need to add `due_date_start`/`due_date_end` range filters OR query with raw Supabase `.gte().lte()` |
| Habits | `HabitsDB` + `HabitLogsDB` | `getActiveHabits(userId)` + `getHabitLogs(userId, startDate, endDate)` | Must call `shouldTrackOnDate()` per habit per date to determine which habits appear. Logs tell us which are completed. |
| Bills | `RecurringBillsDB` | `getByHousehold(householdId)` | **Complexity:** Bills are household-scoped, not user-scoped. Need `resolveHousehold()` first. Filter by `next_due_date` in range + `user_status !== 'dismissed'` client-side or with query filter. |
| Workouts | `WorkoutsDB` | `getWorkouts(userId)` | **Gap:** No date range filter. Current `getWorkouts` only takes `limit`. Need to add `.gte('started_at', startDate).lte('started_at', endDate+1)` or similar. |

### Critical Implementation Details

**Tasks date range:** `TasksDB.getUserTasks` only supports `due_date` exact match. Options:
1. Add `due_date_start`/`due_date_end` to `TaskFilters` and update `getUserTasks` — cleanest
2. Add a new method `getTasksInDateRange(userId, startDate, endDate)` — minimal change to existing code
3. Query directly in the feed API route with raw Supabase — breaks DB class pattern

**Recommendation:** Option 2 — add `getTasksInDateRange` method to `TasksDB`.

**Habits aggregation:** This is the most complex domain. For each date in the range, we need to:
1. Get all active habits
2. For each habit, check `shouldTrackOnDate(habit.frequency, date)` 
3. Cross-reference with habit logs to determine `is_logged` status
4. This can produce many items (e.g., 10 habits x 31 days = 310 items for month view)

**Server-side approach:** Fetch active habits + all habit logs in date range, then iterate dates in range to build CalendarItems. This avoids N+1 queries.

**Bills household scoping:** Must call `resolveHousehold(supabase, userId)` before querying bills. Then filter `next_due_date` within range. Only include bills where `user_status !== 'dismissed'` and `is_active === true`.

**Workouts date filter:** Need a new method or inline query. `WorkoutsDB.getWorkouts` doesn't filter by date. Add `getWorkoutsByDateRange(userId, startDate, endDate)` filtering on `started_at`.

### CalendarItem Type

```ts
// lib/calendar/types.ts (new file)
type CalendarItemSource = "event" | "task" | "habit" | "bill" | "workout";

interface CalendarItem {
  id: string;
  source: CalendarItemSource;
  title: string;
  start_date: string;           // YYYY-MM-DD
  start_time: string | null;    // HH:MM:SS or null (all-day)
  end_date: string;             // YYYY-MM-DD
  end_time: string | null;
  color: string;                // CSS variable name like "calendar-event"
  is_all_day: boolean;
  meta: CalendarItemMeta;
}

interface CalendarItemMeta {
  // Events
  location?: string;
  description?: string;
  is_virtual?: boolean;         // For recurring events
  // Tasks
  is_completed?: boolean;
  priority?: number;
  task_id?: string;             // Original task ID for inline actions
  // Habits
  is_logged?: boolean;
  habit_id?: string;            // Original habit ID for log toggle
  habit_log_date?: string;      // Date for the log entry
  // Bills
  is_paid?: boolean;
  amount_cents?: number;
  bill_id?: string;             // Original bill ID for mark paid
  // Workouts
  workout_id?: string;          // For navigation
  duration_seconds?: number;
}
```

### Domain Normalization

| Domain | `id` | `start_date` | `start_time` | `is_all_day` | `color` |
|--------|------|-------------|-------------|-------------|---------|
| Events | event.id (+ virtual suffix) | event.start_date | event.start_time | `!start_time` | `"calendar-event"` (or custom) |
| Tasks | task.id | task.due_date | task.due_time | `!due_time` | `"calendar-task"` |
| Habits | `habit-{habitId}-{date}` | date | null | true | `"calendar-habit"` |
| Bills | bill.id | bill.next_due_date | null | true | `"calendar-bill"` |
| Workouts | workout.id | date from started_at | time from started_at | false | `"calendar-workout"` |

**Habit ID format:** Habits generate one CalendarItem per tracked date, so the ID must be unique per habit+date combination. Format: `habit-{habitId}-{YYYY-MM-DD}`.

**Workout time extraction:** Parse `started_at` (ISO timestamp) to extract local date and time. Must handle timezone — the API runs server-side, but dates should be in user's local timezone. Since the project convention is "dates are browser-local", the client already sends the date range in local time. Workouts store `started_at` as TIMESTAMPTZ. We need to extract the date/time in the context of the user's display timezone (profile.timezone or default).

## 3. Component Changes

### Type Migration Strategy

The biggest architectural question: should we replace `ExpandedCalendarEvent` with `CalendarItem` everywhere, or keep both?

**Recommendation:** Use `CalendarItem` as the universal type throughout the calendar. The feed API normalizes all domains (including events) into this shape. This means:

1. `groupEventsByDate` becomes `groupItemsByDate` — works with `CalendarItem[]`
2. `EventBlock` → `CalendarItemBlock` — renders based on `source` field
3. `EventChip` → `CalendarItemChip` — renders based on `source` field
4. `AllDayRow` accepts `CalendarItem[]` instead of `ExpandedCalendarEvent[]`
5. `TimeGrid` accepts `CalendarItem[]`
6. `MonthDayCell` accepts `CalendarItem[]`

**Alternative (lower risk):** Keep `ExpandedCalendarEvent` for event-specific rendering and create a union type `CalendarDisplayItem = CalendarItem`. Split events out in each component. This is messier but less risky.

**Recommendation:** Full migration to `CalendarItem`. The type is a strict superset — events just have `source: "event"` and event-specific fields in `meta`. This keeps the code clean.

### New Components Needed

1. **`CalendarItemChip`** — Month view / all-day row chip. Renders domain-colored chip with:
   - Events: existing EventChip appearance (time + title)
   - Tasks: circle checkbox icon + title
   - Habits: square checkbox icon + title
   - Bills: dollar icon + title + amount
   - Workouts: dumbbell icon + title

2. **`CalendarItemBlock`** — Week/day time grid block. Renders domain-colored block with:
   - Events: existing EventBlock appearance
   - Tasks: circle checkbox + title + time range
   - Workouts: title + duration

3. **`InlineAction`** (or built into chip/block) — Click handlers:
   - Tasks: `PATCH /api/tasks/:id` with `{ is_completed: !current }`
   - Habits: `POST /api/habits/:id/logs` (to log) or `DELETE` (to unlog)
   - Bills: `PATCH /api/money/bills/:id` with `{ user_status: 'confirmed' }`
   - Workouts: `router.push('/workouts/:id')`

### CalendarPageContent Changes

1. **Replace SWR key:** `/api/calendar-events?...` -> `/api/calendar/feed?...`
2. **Response type:** `{ items: CalendarItem[] }` instead of `{ events: ExpandedCalendarEvent[] }`
3. **Lift layer state:** Move `enabledLayers` from `CalendarSidebar` to `CalendarPageContent`
4. **Client-side filtering:** Filter `items` by `enabledLayers` before passing to views
5. **Add inline action handlers:** `handleToggleTask`, `handleToggleHabit`, `handleMarkBillPaid`, passed down to views
6. **Optimistic updates:** On inline action, mutate SWR cache optimistically, then revalidate

### CalendarSidebar Changes

1. Remove `LAYERS` `enabled` property (all enabled)
2. Accept `enabledLayers` and `onLayerToggle` as props (lifted state)
3. Remove disabled tooltip
4. Keep CSS variable references for color dots

### AllDayRow Changes

1. Accept `CalendarItem[]` instead of `ExpandedCalendarEvent[]`
2. Render `CalendarItemChip` instead of `EventChip`
3. Pass inline action callbacks

### TimeGrid Changes

1. Accept `CalendarItem[]` instead of `ExpandedCalendarEvent[]`
2. Render `CalendarItemBlock` instead of `EventBlock` for timed items
3. Pass inline action callbacks

### MonthDayCell Changes

1. Accept `CalendarItem[]` instead of `ExpandedCalendarEvent[]`
2. Render `CalendarItemChip` instead of `EventChip`

## 4. Data Fetching & Mutations

### SWR Key Change
```
Old: /api/calendar-events?start_date=${startDate}&end_date=${endDate}
New: /api/calendar/feed?start_date=${startDate}&end_date=${endDate}
```

With `keepPreviousData: true` (existing behavior).

### Inline Action Mutation Pattern

Each inline action:
1. Call domain-specific API (e.g., `PATCH /api/tasks/:id`)
2. Optimistically update the feed SWR cache (modify the matching CalendarItem in the cached data)
3. On success, optionally revalidate to ensure server consistency
4. On error, rollback optimistic update

**SWR optimistic update approach:**
```ts
mutate(
  feedKey,
  (current) => ({
    items: current.items.map(item => 
      item.id === targetId ? { ...item, meta: { ...item.meta, is_completed: true } } : item
    )
  }),
  { revalidate: true }
);
```

### Habit Log Toggle Specifics

Habit log toggling is more complex than task toggling:
- **Log (mark complete):** `POST /api/habits/:habitId/logs` with `{ date: "YYYY-MM-DD", completed: true }`
- **Unlog (mark incomplete):** Need to check if there's an existing log and delete it, or set `completed: false`
- The habit log API endpoint at `app/api/habits/[id]/logs/route.ts` currently supports GET. Need to verify POST exists.

Let me note: there's also likely a POST endpoint for creating logs. The existing habit UI uses this for check/uncheck.

### Bill Paid/Dismissed Toggle

Bills use `PATCH /api/money/bills/:id` with `{ user_status: 'confirmed' }` to mark paid. To dismiss: `{ user_status: 'dismissed' }`. The UI should offer "Mark as paid" as the primary action.

**Complication:** Bills are household-scoped. The PATCH API already handles household verification, so this should work seamlessly.

## 5. Gap Analysis

### DB Layer Gaps (methods to add)

| File | Method to Add | Purpose |
|------|---------------|---------|
| `lib/db/tasks.ts` | `getTasksInDateRange(userId, startDate, endDate)` | Fetch tasks with `due_date` between start and end |
| `lib/db/workouts.ts` | `getWorkoutsByDateRange(userId, startDate, endDate)` | Fetch completed workouts with `started_at` in range |
| `lib/db/habit-logs.ts` | `getUserLogsByDateRange(userId, startDate, endDate)` | Fetch all habit logs for a user (not per-habit) across date range |

`HabitLogsDB.getLogsByDateRange` exists but is per-habit. We need a method that fetches ALL habit logs for a user in a date range (across all habits) for the feed API.

### New Files

| File | Purpose |
|------|---------|
| `app/api/calendar/feed/route.ts` | Unified feed API endpoint |
| `lib/calendar/types.ts` | `CalendarItem`, `CalendarItemSource`, `CalendarItemMeta` types |
| `lib/calendar/normalize.ts` | Functions to convert domain records to `CalendarItem` |
| `components/calendar/calendar-item-chip.tsx` | Domain-colored chip for month/all-day |
| `components/calendar/calendar-item-block.tsx` | Domain-colored block for time grid |

### Files to Modify

| File | Changes |
|------|---------|
| `lib/db/tasks.ts` | Add `getTasksInDateRange` method |
| `lib/db/workouts.ts` | Add `getWorkoutsByDateRange` method |
| `lib/db/habit-logs.ts` | Add `getUserLogsByDateRange` method |
| `lib/calendar/date-utils.ts` | Update `groupEventsByDate` -> `groupItemsByDate` for `CalendarItem` type |
| `components/calendar/calendar-page-content.tsx` | Replace events SWR with feed SWR, lift layer state, add inline action handlers |
| `components/calendar/calendar-sidebar.tsx` | Accept layer props, enable all layers, remove disabled state |
| `components/calendar/time-grid.tsx` | Accept `CalendarItem[]`, render `CalendarItemBlock` |
| `components/calendar/all-day-row.tsx` | Accept `CalendarItem[]`, render `CalendarItemChip` |
| `components/calendar/month-grid.tsx` | Pass `CalendarItem[]` to `MonthDayCell` |
| `components/calendar/month-day-cell.tsx` | Accept `CalendarItem[]`, render `CalendarItemChip` |
| `components/calendar/week-view.tsx` | Update type from `ExpandedCalendarEvent` to `CalendarItem` |
| `components/calendar/day-view.tsx` | Update type from `ExpandedCalendarEvent` to `CalendarItem` |
| `i18n/messages/en.json` | Add feed/action strings under `calendar` namespace |
| `i18n/messages/zh.json` | Same |
| `i18n/messages/zh-TW.json` | Same |

### Backward Compatibility Note

The `EventDialog` and `EventQuickCreate` components still deal with actual calendar events (create/edit). They should continue using `ExpandedCalendarEvent` or `CalendarEvent` type. The `handleEventClick` in `CalendarPageContent` needs to be adapted: when a `CalendarItem` with `source: "event"` is clicked, extract the event data and pass to `EventDialog`. For non-event items, inline actions fire instead.

## 6. Performance Considerations

### Feed API Response Size
For a month view, the feed could return:
- ~50 events (recurring expanded)
- ~60 tasks (with due dates in range)
- ~300 habit items (10 habits x 31 days)
- ~10 bills
- ~15 workouts

Total: ~435 items. This is manageable. For week view (~100 items) and day view (~20 items), even less.

### Optimization Options (if needed)
1. Add `source` query param to feed API for fetching only specific domains
2. Cache habit `shouldTrackOnDate` results
3. Limit habits to only those truly active (not paused/archived) — already done via `getActiveHabits`

### Habit Expansion Warning
`shouldTrackOnDate` is called per habit per date in range. For month view (42 grid dates) with 20 active habits = 840 calls. The function is pure computation (no DB), so this is fast, but worth noting.

## 7. Testing Strategy

### API Route Tests
- Feed returns events, tasks, habits, bills, workouts for date range
- Feed returns empty when no data
- Feed respects auth (401 for unauthenticated)
- Each domain normalizes correctly to CalendarItem format
- Habits only appear on tracked dates
- Bills only include active, non-dismissed
- Workouts extract correct date/time from started_at

### Component Tests
- CalendarItemChip renders different icons/styles per source
- CalendarItemBlock renders different styles per source
- Inline action click handlers fire correct API calls
- Layer toggle hides/shows items by source
- Optimistic updates work correctly

### Integration Considerations
- Event dialog still works after type migration
- Quick-create still works
- Keyboard shortcuts still work
- Navigation between views preserves feed data

## 8. i18n Strings Needed

```
calendar.feed.error: "Failed to load calendar items"
calendar.actions.markComplete: "Mark complete"
calendar.actions.markIncomplete: "Mark incomplete"
calendar.actions.toggleHabit: "Toggle habit"
calendar.actions.markPaid: "Mark as paid"
calendar.actions.viewWorkout: "View workout"
calendar.actions.billAmount: "{amount}"
```

All three locales (en, zh, zh-TW).

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Type migration breaks existing event rendering | High | Keep `ExpandedCalendarEvent` for `EventDialog`/`EventQuickCreate`; only views use `CalendarItem` |
| Habit expansion performance for large date ranges | Medium | Pure computation, fast; add early return for paused habits |
| Bills household resolution adds latency | Low | Runs in `Promise.all` with other queries; single extra DB call |
| Workout timezone extraction edge cases | Medium | Use `started_at` date portion; document timezone assumptions |
| Optimistic update race conditions | Low | SWR handles with revalidation after mutation |

## 10. Suggested Plan Structure

### Wave 1: Types & DB Layer
- Define `CalendarItem` type in `lib/calendar/types.ts`
- Add `getTasksInDateRange` to `TasksDB`
- Add `getWorkoutsByDateRange` to `WorkoutsDB`
- Add `getUserLogsByDateRange` to `HabitLogsDB`
- Create `lib/calendar/normalize.ts` with domain-to-CalendarItem converters

### Wave 2: Feed API
- Create `app/api/calendar/feed/route.ts`
- Query all domains in parallel
- Normalize and return unified response
- Add API route tests

### Wave 3: UI Components
- Create `CalendarItemChip` and `CalendarItemBlock`
- Update `groupEventsByDate` -> `groupItemsByDate`
- Update `CalendarPageContent` to use feed API
- Lift layer state from sidebar to page content
- Update `CalendarSidebar` to accept layer props

### Wave 4: Type Migration & Inline Actions
- Update `TimeGrid`, `AllDayRow`, `MonthGrid`, `MonthDayCell`, `WeekView`, `DayView` to use `CalendarItem`
- Add inline action handlers (task toggle, habit toggle, bill paid, workout nav)
- Add optimistic SWR updates
- Add i18n strings

### Wave 5: Polish & Tests
- Component tests for chips/blocks
- Integration tests for inline actions
- Remove "coming soon" tooltip from sidebar
- Verify event dialog and quick-create still work

---

*Phase: 33-cross-domain-feed-aggregation*
*Research completed: 2026-04-01*
