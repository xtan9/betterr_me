# Phase 32: Calendar UI — Week & Day Views - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

Time grid views (Week and Day) with hourly rows, all-day events row, quick-create interactions (click and click-and-drag), current time indicator, and keyboard shortcuts. This phase builds on Phase 31's month view and navigation infrastructure. No cross-domain aggregation in this phase (that's Phase 33).

</domain>

<decisions>
## Implementation Decisions

### Time Grid Layout
- **D-01:** Standard 48px per hour slot height with 24-hour visible grid. Grid scrolls to 8:00 AM on initial load.
- **D-02:** Half-hour sub-grid lines shown as light dashed lines at 30-minute marks for visual reference.
- **D-03:** Overlapping events handled with side-by-side equal-width columns within the same time slot (Google Calendar style).
- **D-04:** Scrollable container with sticky day column headers and sticky all-day row at top.

### Week View
- **D-05:** 7 day columns respecting user's `week_start_day` preference (consistent with month view D-04 from Phase 31).
- **D-06:** Header shows date range title (e.g., "Mar 30 – Apr 5, 2026"). Each column header shows day name + date number.
- **D-07:** Events rendered as colored blocks with left border accent, positioned based on start_time/end_time. Block height = duration proportional to 48px/hour.

### Day View
- **D-08:** Single column full-width event layout. Same time grid component as week view but with 1 column instead of 7.
- **D-09:** Mobile-optimized: no sidebar by default (same responsive behavior as Phase 31 D-17).

### Current Time Indicator
- **D-10:** Teal horizontal line with a small circle dot on the left edge, positioned at the current time on the time grid. Updates every minute.
- **D-11:** Only visible on today's column in week view, or when viewing today in day view.

### All-Day Row
- **D-12:** Dedicated row above the time grid for all-day events (`is_all_day: true`).
- **D-13:** Show up to 3 items per day, then "+N more" chip. Clicking "+N more" expands the row to show all items with a collapse button.

### Quick-Create (Click Time Slot)
- **D-14:** Clicking a time slot shows a minimal popover at click position with: title input (auto-focused), pre-filled date/time from clicked slot, Enter to save.
- **D-15:** Popover shifts to stay within viewport bounds.
- **D-16:** "More options" link in popover opens the full event creation dialog with fields pre-filled from the popover.

### Quick-Create (Click-and-Drag)
- **D-17:** Click-and-drag across time slots creates a selection highlight. On mouse-up, the quick-create popover appears with duration pre-filled from drag range.
- **D-18:** Minimum drag threshold of ~15 minutes to distinguish from a simple click.

### Event Dialog
- **D-19:** Full event creation/edit dialog opened via "+ New Event" button, `N` key, or "More options" from quick-create. Contains: title, date, start/end time, location, description, category, color, recurrence, and reminders fields.
- **D-20:** Dialog can be pre-filled from quick-create context (date, time, duration).

### Keyboard Shortcuts
- **D-21:** Global keydown listener on the calendar page. Single-key shortcuts: D (day view), W (week view), M (month view), T (today), ← → (navigate prev/next period), C (quick-create at current time), N (new event dialog), / (focus search), Esc (close popover/dialog).
- **D-22:** Shortcuts suppressed when focus is inside text inputs, textareas, or contenteditable elements. Only Esc works when a popover/dialog is open.

### Default View Routing
- **D-23:** Implement VIEW-11: Calendar defaults to Week view on desktop (≥md breakpoint) and Day view on mobile (<md breakpoint). When no `?view=` param is present, detect screen width and redirect.

### Data Fetching
- **D-24:** Reuse SWR fetching pattern from Phase 31. Adjust date range query: week view fetches the displayed week range, day view fetches the single day.
- **D-25:** SWR key includes view type + date range for automatic refetch on navigation/view change.

### i18n
- **D-26:** All new UI strings (time labels, "All day", keyboard shortcut labels, quick-create placeholders, dialog field labels) added to all 3 locale files (en, zh, zh-TW).

### Claude's Discretion
- Shared `TimeGrid` component design (reused by both week and day views)
- Event block sizing algorithm for overlap detection
- Drag selection visual feedback style
- Popover animation and positioning library choice
- Auto-scroll behavior when current time indicator is off-screen

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Full design spec. Key sections: "Week view", "Day view", "Event Creation" (quick-create, click-and-drag, full dialog), "Keyboard shortcuts", "Responsive Behavior", "Components" file structure.

### Phase 31 Outputs (Foundation)
- `app/calendar/page.tsx` — Calendar route (server component)
- `app/calendar/layout.tsx` — Calendar layout
- `components/calendar/calendar-page-content.tsx` — Main client component with URL state, SWR fetching, view routing
- `components/calendar/calendar-header.tsx` — Header with view switcher (Day/Week/Month toggle already exists)
- `components/calendar/calendar-sidebar.tsx` — Sidebar with mini-cal and layer toggles
- `components/calendar/month-grid.tsx` — Month view grid (reference for grid patterns)
- `components/calendar/event-chip.tsx` — Event chip component (reference for event rendering)
- `lib/calendar/date-utils.ts` — Date utilities (getMonthDateRange, getMonthGridDates, groupEventsByDate)

### Phase 30 Outputs (API)
- `app/api/calendar-events/route.ts` — GET endpoint with date range params + recurrence expansion
- `lib/calendar/recurrence.ts` — `ExpandedCalendarEvent` type (what the API returns)
- `lib/db/calendar-events.ts` — CalendarEventsDB class

### UI Components
- `components/ui/popover.tsx` — Shadcn popover (for quick-create)
- `components/ui/dialog.tsx` — Shadcn dialog (for full event dialog)
- `components/ui/toggle-group.tsx` — View switcher toggle (already used in header)

### i18n
- `i18n/messages/en.json` — English locale
- `i18n/messages/zh.json` — Chinese simplified locale
- `i18n/messages/zh-TW.json` — Chinese traditional locale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CalendarPageContent` — Already handles URL state (`?view=` and `?date=`), SWR fetching, and view routing. Week/Day views plug into the existing view conditional.
- `CalendarHeader` — Already has Day/Week/Month toggle group. No changes needed for navigation.
- `CalendarSidebar` — Mini-cal and layer toggles ready. No changes needed.
- `getMonthDateRange` / `groupEventsByDate` — Date utils in `lib/calendar/date-utils.ts`. May need week/day range equivalents.
- `EventChip` — Existing event rendering component for month view. Time grid events will need a different "block" component.
- `ExpandedCalendarEvent` type — Standard event shape from API.
- Shadcn `Popover`, `Dialog`, `Button`, `Input` — UI primitives for quick-create and event dialog.

### Established Patterns
- URL-driven state with `useSearchParams` + `useRouter` (Phase 31)
- SWR with date-based keys including `keepPreviousData: true`
- `useTranslations("calendar")` for all calendar strings
- Design tokens in `globals.css` (teal primary, dark mode variables)
- Responsive: sidebar hidden on mobile, Tailwind `md:` breakpoints

### Integration Points
- `CalendarPageContent` view conditional — add `week` and `day` branches
- `lib/calendar/date-utils.ts` — add `getWeekDateRange()` and `getDayDateRange()` helpers
- New components: `components/calendar/week-view.tsx`, `components/calendar/day-view.tsx`, `components/calendar/time-grid.tsx`, `components/calendar/event-block.tsx`, `components/calendar/event-popover.tsx`, `components/calendar/event-dialog.tsx`
- `useKeyboardShortcuts` hook — new, calendar-specific

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the design spec — follow the existing Phase 31 patterns and BetterR.Me design tokens. The time grid should feel consistent with Google Calendar's time grid UX (side-by-side overlapping events, scrollable grid, sticky headers).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-calendar-ui-week-day-views*
*Context gathered: 2026-04-01 via --auto mode*
