# Phase 32: Calendar UI — Week & Day Views — Research

**Researched:** 2026-04-01
**Requirements:** VIEW-02, VIEW-03, VIEW-07, VIEW-08, VIEW-12, EVNT-07, EVNT-08, EVNT-09, EVNT-10

## 1. Current Codebase State

### Existing Components (Phase 31 outputs)

| File | Purpose | Reuse in Phase 32 |
|------|---------|-------------------|
| `components/calendar/calendar-page-content.tsx` | Main client component with URL state (`?view=`, `?date=`), SWR fetching, view routing | **Extend**: add `week` and `day` branches in view conditional (currently shows "Coming soon" placeholder) |
| `components/calendar/calendar-header.tsx` | Header with Today button, prev/next arrows, title, Day/Week/Month toggle | **Modify**: title format must change per view (month: "April 2026", week: "Mar 30 – Apr 5, 2026", day: "Wednesday, April 1, 2026"). Navigation callbacks must handle week/day increments (currently only month). |
| `components/calendar/calendar-sidebar.tsx` | Mini-cal + layer toggles + "+New Event" button (currently disabled) | **Modify**: enable "+New Event" button to open the full event dialog |
| `components/calendar/month-grid.tsx` | Month view grid | No changes |
| `components/calendar/month-day-cell.tsx` | Day cell in month grid | No changes |
| `components/calendar/event-chip.tsx` | Compact event display for month view | Reference for color logic; time-grid events need a taller "block" component |
| `lib/calendar/date-utils.ts` | `getMonthGridDates`, `getMonthDateRange`, `groupEventsByDate` | **Extend**: add `getWeekDateRange()` and `getDayDateRange()` helpers |
| `lib/calendar/recurrence.ts` | `ExpandedCalendarEvent` type, `expandEventsForRange()` | No changes needed; type is the standard event shape |

### API (Phase 30 output)

- `GET /api/calendar-events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — returns `{ events: ExpandedCalendarEvent[] }` with recurrence expansion. Works for any date range, so week/day views just pass different params.
- `POST /api/calendar-events` — creates events. Validates via `calendarEventCreateSchema` (Zod). Supports all fields needed for quick-create and full dialog.
- `PATCH /api/calendar-events/[id]` — updates events. Partial update schema.
- `DELETE /api/calendar-events/[id]` — deletes events.

### Data Model Key Points

- **All-day detection**: `start_time === null` means all-day. There is no `is_all_day` boolean column.
- **Time format**: `start_time` / `end_time` are stored as `HH:MM:SS` strings (Postgres TIME type).
- **Event colors**: `event.color` is an optional hex string override. Default uses CSS variable `--calendar-event` (teal).
- **Multi-day events**: `start_date !== end_date` — must span multiple columns in week view.

### URL State Pattern

```
/calendar?view=week&date=2026-04-01
/calendar?view=day&date=2026-04-01
```

`CalendarPageContent` already reads `view` and `date` from `useSearchParams()`. The view conditional at line 172-185 is the insertion point.

### SWR Pattern

SWR key includes the date range: `/api/calendar-events?start_date=...&end_date=...` with `keepPreviousData: true`. Week/day views use the same pattern with different date ranges.

### i18n

All calendar strings live under `calendar` namespace in `i18n/messages/{en,zh,zh-TW}.json`. Current keys: `title`, `views.*`, `navigation.*`, `layers.*`, `overflow.more`, `sidebar.*`, `comingSoon`, `noEvents`, `error`. Phase 32 needs ~30+ new keys.

### CSS Variables Available

Light/dark mode variables for all domain colors exist in `globals.css`:
- `--calendar-event` / `--calendar-event-muted` (teal — primary event color)
- Task, habit, bill, workout colors (for future Phase 33, but available now)

### Test Pattern

`tests/components/calendar/month-grid.test.tsx` shows the established pattern:
- Mock `next-intl` with `vi.mock`
- `makeEvent()` helper for creating test `ExpandedCalendarEvent` objects
- Render with `@testing-library/react`, assert with `screen` queries

## 2. New Components to Build

### 2.1 TimeGrid (`components/calendar/time-grid.tsx`)

**Shared component** used by both week and day views.

**Layout structure:**
```
┌─────────────────────────────────────────────┐
│ All-day row (sticky)                        │
├──────┬──────────────────────────────────────┤
│ Time │ Day columns (1 for day, 7 for week)  │
│ gutter│                                     │
│ 12 AM│                                      │
│  1 AM│                                      │
│ ...  │                                      │
│ 11 PM│                                      │
└──────┴──────────────────────────────────────┘
```

**Key implementation details:**
- **48px per hour** slot height (D-01) = 1152px total grid height (24 hours)
- Half-hour dashed sub-grid lines at 30-min marks (D-02)
- **Scroll to 8:00 AM** on initial load = scroll to `8 * 48 = 384px`
- Sticky day column headers + sticky all-day row (D-04)
- Time gutter column on the left showing hour labels (12 AM, 1 AM, ..., 11 PM)
- Columns: `columns` prop (1 or 7) determines day column count

**Event positioning algorithm:**
- Top offset: `(hour * 60 + minutes) / 60 * 48` pixels from grid top
- Height: `durationMinutes / 60 * 48` pixels
- For overlapping events: detect time conflicts, assign side-by-side columns (Google Calendar style — D-03)

**Overlap detection algorithm:**
1. Sort events by start_time
2. For each event, find overlapping group (events whose time ranges intersect)
3. Within an overlap group, assign column indices (0, 1, 2, ...)
4. Each event width = `100% / totalColumnsInGroup`, left offset = `columnIndex * width`

### 2.2 WeekView (`components/calendar/week-view.tsx`)

Props: `currentDate`, `weekStartDay`, `events` (Map by date), `today`
- Computes 7 dates for the week containing `currentDate`, starting from `weekStartDay`
- Renders column headers with day name + date number
- Passes 7 columns to `TimeGrid`
- Header title: date range (e.g., "Mar 30 – Apr 5, 2026")

### 2.3 DayView (`components/calendar/day-view.tsx`)

Props: `currentDate`, `events` (Map by date), `today`
- Single column layout
- Passes 1 column to `TimeGrid`
- Mobile-optimized (no sidebar — handled by existing responsive layout)

### 2.4 EventBlock (`components/calendar/event-block.tsx`)

The time-grid equivalent of `EventChip`. Renders as a positioned absolute div inside a day column.

- Left border accent (2px, event color or teal default)
- Background: 12% opacity of the event color
- Shows title + time range
- Height proportional to duration
- Click to open event details/edit
- Truncates content if block is too small

### 2.5 AllDayRow (`components/calendar/all-day-row.tsx`)

- Filters events where `start_time === null`
- Shows up to 3 per day, then "+N more" chip (D-12, D-13)
- Clicking "+N more" expands row with collapse button
- Sticky at top of time grid

### 2.6 CurrentTimeIndicator (`components/calendar/current-time-indicator.tsx`)

- Teal horizontal line with circle dot on left edge (D-10)
- Position: calculated from current time, same formula as event positioning
- Updates every minute via `setInterval` (D-10)
- Only visible on today's column in week view, or when viewing today in day view (D-11)

### 2.7 EventQuickCreate (`components/calendar/event-quick-create.tsx`)

Quick-create popover for click and click-and-drag interactions.

- Uses Shadcn `Popover` component
- Contents: title input (auto-focused), pre-filled date/time display, "More options" link
- Enter key saves immediately via `POST /api/calendar-events`
- "More options" opens full `EventDialog` with fields pre-filled
- Positioned at click position, shifts to stay in viewport (D-15)

### 2.8 EventDialog (`components/calendar/event-dialog.tsx`)

Full event creation/edit dialog.

- Uses Shadcn `Dialog` component
- Fields: title, date, start/end time, location, description, category, color, recurrence, reminders
- Opened via: "+New Event" button, `N` key, "More options" from quick-create
- Can be pre-filled from quick-create context (D-20)
- Uses `react-hook-form` + `calendarEventCreateSchema` for validation
- Submits via `POST /api/calendar-events` (create) or `PATCH /api/calendar-events/[id]` (edit)
- After save: SWR `mutate()` to refresh events

### 2.9 useKeyboardShortcuts hook (`hooks/use-keyboard-shortcuts.ts`)

- Global `keydown` listener on the calendar page
- Suppressed when focus is in text inputs, textareas, or contenteditable (D-22)
- Only `Esc` works when popover/dialog is open (D-22)

| Key | Action | Implementation |
|-----|--------|----------------|
| `D` | Day view | `setView("day")` |
| `W` | Week view | `setView("week")` |
| `M` | Month view | `setView("month")` |
| `T` | Today | `goToToday()` |
| `ArrowLeft` | Previous period | `goToPrev()` |
| `ArrowRight` | Next period | `goToNext()` |
| `C` | Quick-create at current time | Open quick-create popover at current time |
| `N` | New event dialog | Open `EventDialog` |
| `/` | Focus search | Focus search input (if exists) |
| `Esc` | Close | Close popover or dialog |

## 3. Modifications to Existing Code

### 3.1 CalendarPageContent

Major refactoring needed:

1. **Navigation**: Currently only has `goToPrevMonth` / `goToNextMonth`. Need generic `goToPrev` / `goToNext` that respect current view:
   - Month: prev/next month (existing)
   - Week: prev/next 7 days
   - Day: prev/next 1 day

2. **Date range computation**: Currently computes month range. Need conditional:
   - `view === "month"`: `getMonthDateRange(year, month, weekStartDay)`
   - `view === "week"`: `getWeekDateRange(currentDate, weekStartDay)`
   - `view === "day"`: `getDayDateRange(currentDate)`

3. **SWR key**: Must include view type so refetch triggers on view change (D-25).

4. **View routing**: Add `week` and `day` branches in the conditional render.

5. **Default view detection**: Detect screen width, redirect to week (desktop) or day (mobile) when no `?view=` param (D-23 / VIEW-11).

6. **State for popover/dialog**: Need state to control quick-create popover and event dialog open/close.

### 3.2 CalendarHeader

1. **Title format**: Must vary by view:
   - Month: "April 2026" (existing)
   - Week: "Mar 30 – Apr 5, 2026" (D-06)
   - Day: "Wednesday, April 1, 2026"

2. **Props**: `onPrev` / `onNext` callbacks are view-agnostic (parent passes the right function).

3. **New Event button**: Add "+ New Event" button to header (or keep in sidebar only).

### 3.3 CalendarSidebar

- Enable the "+New Event" button (currently disabled) to open `EventDialog`.

### 3.4 date-utils.ts

Add two new functions:

```ts
function getWeekDateRange(date: Date, weekStartDay: number): { startDate: string; endDate: string }
function getDayDateRange(date: Date): { startDate: string; endDate: string }
function getWeekDates(date: Date, weekStartDay: number): Date[]  // 7 dates for the week
```

## 4. Click-and-Drag Interaction (EVNT-08)

Most complex UI interaction in this phase. Implementation approach:

1. **Mouse events on time grid**: `onMouseDown`, `onMouseMove`, `onMouseUp`
2. **State tracking**: `isDragging`, `dragStart` (row/time), `dragEnd` (row/time)
3. **Visual feedback**: Highlight the selected time range with a semi-transparent overlay
4. **Threshold**: Minimum ~15 minutes drag (D-18) to distinguish from a click
5. **On mouse-up**: If drag exceeds threshold, show quick-create popover with pre-filled duration
6. **Touch support**: Consider `onTouchStart` / `onTouchMove` / `onTouchEnd` for mobile

**Time calculation from mouse position:**
- Convert `event.clientY` to offset within the scrollable grid container
- `minutes = (offsetY / 48) * 60`
- Snap to nearest 15-minute interval for UX

## 5. i18n Strings Needed

New keys under `calendar` namespace (all 3 locales):

```json
{
  "calendar": {
    "timeGrid": {
      "allDay": "All day",
      "allDayMore": "+{count} more",
      "collapseAllDay": "Collapse"
    },
    "quickCreate": {
      "titlePlaceholder": "Add title",
      "moreOptions": "More options",
      "saving": "Saving..."
    },
    "eventDialog": {
      "newEvent": "New Event",
      "editEvent": "Edit Event",
      "title": "Title",
      "date": "Date",
      "startTime": "Start time",
      "endTime": "End time",
      "allDay": "All day",
      "location": "Location",
      "description": "Description",
      "category": "Category",
      "color": "Color",
      "recurrence": "Repeat",
      "reminders": "Reminders",
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "deleteConfirm": "Are you sure you want to delete this event?"
    },
    "shortcuts": {
      "dayView": "Day view (D)",
      "weekView": "Week view (W)",
      "monthView": "Month view (M)",
      "today": "Today (T)",
      "navigate": "Navigate (← →)",
      "quickCreate": "Quick create (C)",
      "newEvent": "New event (N)",
      "search": "Search (/)",
      "close": "Close (Esc)"
    },
    "timeLabels": {
      "am": "AM",
      "pm": "PM"
    }
  }
}
```

## 6. Testing Strategy

### Unit Tests

| Test File | What to Test |
|-----------|-------------|
| `tests/lib/calendar/date-utils.test.ts` | `getWeekDateRange`, `getDayDateRange`, `getWeekDates` with various weekStartDay values |
| `tests/components/calendar/time-grid.test.tsx` | Renders 24 hour rows, sticky headers, hour labels, correct column count |
| `tests/components/calendar/week-view.test.tsx` | Renders 7 day columns, correct date headers, passes events to time grid |
| `tests/components/calendar/day-view.test.tsx` | Renders single column, passes events correctly |
| `tests/components/calendar/event-block.test.tsx` | Correct positioning (top/height), color rendering, title/time display, truncation |
| `tests/components/calendar/all-day-row.test.tsx` | Shows up to 3 events, "+N more" overflow, expand/collapse |
| `tests/components/calendar/current-time-indicator.test.tsx` | Correct positioning, only shows on today |
| `tests/components/calendar/event-quick-create.test.tsx` | Title input focus, Enter to save, "More options" opens dialog, pre-filled time |
| `tests/components/calendar/event-dialog.test.tsx` | All fields render, validation, submit calls API, pre-fill from quick-create |
| `tests/hooks/use-keyboard-shortcuts.test.ts` | All shortcuts fire correct callbacks, suppressed in inputs, Esc closes |

### Key Test Scenarios

1. **Overlap detection**: 3 events at same time slot render side-by-side with correct widths
2. **All-day row overflow**: 5 all-day events show 3 + "+2 more"
3. **Click-and-drag**: Simulating mousedown + mousemove + mouseup opens quick-create with correct duration
4. **Keyboard shortcuts**: Pressing `W` when not in input changes view to week
5. **Current time indicator**: Mock `Date.now()` and verify line position
6. **View-dependent navigation**: Pressing right arrow navigates by correct period per view

## 7. Complexity Assessment

| Component | Complexity | Notes |
|-----------|-----------|-------|
| TimeGrid | **High** | Core shared component; scroll management, sticky positioning, event layout algorithm |
| Click-and-drag | **High** | Mouse event tracking, time calculation, threshold detection, visual feedback |
| Overlap algorithm | **Medium** | Column assignment for overlapping events |
| EventDialog | **Medium** | Large form with many fields; react-hook-form + zod validation |
| EventQuickCreate | **Medium** | Popover positioning, auto-focus, Enter-to-save, transition to dialog |
| Keyboard shortcuts | **Low-Medium** | Global listener with focus detection |
| WeekView/DayView | **Low** | Thin wrappers around TimeGrid |
| CurrentTimeIndicator | **Low** | Simple positioned line with 1-minute interval |
| AllDayRow | **Low** | Overflow logic similar to month day cell |
| Date utils | **Low** | Simple date arithmetic |

## 8. Risks and Edge Cases

1. **Performance**: 24-hour grid * 7 days = many DOM nodes. Avoid re-rendering the entire grid on every state change. Memoize event blocks.
2. **Scrollable container + sticky headers**: CSS `position: sticky` inside `overflow: auto` containers can be tricky. May need nested scroll containers.
3. **Multi-day timed events**: An event starting at 10 PM on Monday ending at 2 AM Tuesday needs to render across two columns in week view. Consider splitting into two visual blocks.
4. **Timezone consistency**: All dates are browser-local per project convention. Use `getLocalDateString()` consistently.
5. **Popover positioning near edges**: Quick-create popover near the bottom/right edge of the viewport needs shift logic. Shadcn Popover (Radix) has built-in collision detection.
6. **Touch events for mobile drag**: Click-and-drag interaction needs touch equivalents for mobile day view.
7. **SWR cache invalidation**: After creating/editing an event via quick-create or dialog, must `mutate` the correct SWR key to refresh the grid.
8. **Default view redirect loop**: VIEW-11 requires detecting screen width and redirecting. Must avoid redirect loops — only redirect when no `?view=` param is present.

## 9. Dependencies

- **No new npm packages needed.** All UI primitives exist (Popover, Dialog, Button, Input, ToggleGroup from shadcn/ui). Time grid is custom CSS Grid/Flexbox.
- `react-hook-form` + `zod` already in project for form handling.
- `swr` already in project for data fetching.
- `lucide-react` for icons (already installed).

## 10. Suggested Plan Structure

### Wave 1: Foundation (no UI dependencies)
- Date utils: `getWeekDateRange`, `getDayDateRange`, `getWeekDates`
- `useKeyboardShortcuts` hook
- i18n strings for all 3 locales

### Wave 2: Core Grid
- `TimeGrid` component (shared, the most complex piece)
- `EventBlock` component
- `AllDayRow` component
- `CurrentTimeIndicator` component

### Wave 3: Views + Integration
- `WeekView` wrapper
- `DayView` wrapper
- Update `CalendarPageContent` (view routing, navigation, date range computation)
- Update `CalendarHeader` (view-dependent title)
- Default view detection (VIEW-11)

### Wave 4: Event Creation
- `EventQuickCreate` popover (click + click-and-drag)
- `EventDialog` (full creation/edit form)
- Enable sidebar "+New Event" button
- Wire click-and-drag interaction into TimeGrid

### Wave 5: Tests
- Unit tests for all new components and utilities
- Integration tests for keyboard shortcuts and event creation flow

---

*Phase: 32-calendar-ui-week-day-views*
*Research completed: 2026-04-01*
