# Feature Landscape

**Domain:** Calendar/scheduling domain with push + email reminder notifications added to existing BetterR.Me app (v6.0)
**Researched:** 2026-03-30
**Overall confidence:** HIGH

Research based on the design spec (`docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`), analysis of existing BetterR.Me domains (habits, tasks, journal, money, workouts), and competitive landscape of personal productivity calendar/notification features (Google Calendar, Todoist, Notion Calendar, Fantastical, Apple Calendar, Any.do, TickTick).

---

## Context: What Exists Today

BetterR.Me is a personal productivity + finance web app (77,070+ LOC TypeScript) with:

- **Habits:** Daily/weekdays/weekly/times_per_week/custom frequency tracking, heatmap calendar, streaks, milestones, `shouldTrackOnDate()` utility
- **Tasks:** Work/Personal sections, projects, 4-column kanban, recurring tasks with `RecurrenceRule` discriminated union, `due_date` + `due_time` fields
- **Journal:** Calendar view, mood tracking, entry links
- **Money:** Plaid bank connections, transactions, budgets, bill calendar with `next_due_date`, recurring bills auto-detection, savings goals, net worth
- **Workouts:** Exercise logging, routines, PRs, `created_at` timestamp per workout
- **Dashboard:** Aggregates habits, tasks, money summary into a unified view
- **Infrastructure:** Supabase (Postgres + Auth + Vault), SWR, next-intl (3 locales), dark mode, Vercel Cron, `RecurrenceRule` type system, design tokens

### Key Integration Points for Calendar + Notifications

| Existing System | How Calendar/Notifications Touch It |
|---|---|
| **Tasks (`due_date`, `due_time`)** | Tasks with due dates appear on calendar. Inline checkbox toggles `is_completed`. Reminder on task due time. |
| **Habits (`shouldTrackOnDate()`)** | Active habits scheduled for a given day appear in all-day row. Inline toggle creates/removes `HabitLog`. Daily reminder nudge. |
| **Bills (`next_due_date`, `RecurringBillsDB`)** | Bills with due dates appear in all-day row. Click marks paid/dismissed. Bill due reminder (3 days before default). |
| **Workouts (`created_at`)** | Logged workouts appear at their start time. Click navigates to workout detail. No reminder (retrospective data). |
| **Journal** | Not aggregated on calendar (journal entries are reflective, not scheduled). Could show mood dots on day cells in future. |
| **RecurrenceRule type** | Reused directly for calendar event recurrence. Same `DailyRule`, `WeeklyRule`, `MonthlyByDateRule`, `MonthlyByWeekdayRule`, `YearlyRule` discriminated union. Zero new recurrence logic needed. |
| **Recurring tasks pattern** | `recurring_event_id` + `is_exception` + `original_date` pattern for "edit this occurrence only" is identical to existing recurring task architecture. |
| **Categories table** | Calendar events use same `category_id` FK. Reuse existing user-defined categories with colors. |
| **Supabase Auth + RLS** | Calendar events and reminders scoped by `user_id`. RLS policies follow existing pattern. |
| **SWR data fetching** | Calendar feed uses SWR with date range in key. `keepPreviousData: true` for smooth navigation. |
| **Vercel Cron** | Reminder delivery cron (every minute) follows same pattern as Plaid sync cron. |
| **Design tokens** | Calendar uses existing tokens. Domain color-coding uses existing semantic colors (teal, blue, amber, red) + new purple for workouts. |
| **Sidebar navigation** | Add "Calendar" nav item. Current sidebar: Dashboard, Habits, Tasks, Projects, Journal, Workouts, Money. |
| **i18n (3 locales)** | All calendar + reminder strings in en, zh, zh-TW. |

---

## Table Stakes

Features users expect once BetterR.Me claims to offer a calendar. Missing any of these makes the calendar feel broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies on Existing App | Notes |
|---------|--------------|------------|------------------------------|-------|
| **Month view with day cells** | The mental model of "calendar" starts with a month grid. Every calendar app has this. Users need the big picture. | MEDIUM | None new. Render `CalendarItem[]` from feed API into day cells. | Max 3-4 visible items per cell with "+N more" overflow. Click day drills into Day view. Week numbers optional. |
| **Week view with time grid** | The primary working view for scheduling. Google Calendar, Outlook, Fantastical all default to week view on desktop. Where events get placed on a timeline. | HIGH | None new. Time grid renders timed events as positioned blocks. All-day row for untimed items. | 7-column grid with hourly rows. Current time indicator (teal line). Event blocks with left border accent. This is the most complex UI component. |
| **Day view** | Mobile-first view. Single column time grid. Essential for detailed daily planning. | MEDIUM | Shares time grid component with week view. | Default on mobile. Full-width events. Swipe navigation on touch devices. |
| **Standalone event CRUD** | Users need to create events that are not tasks, habits, or bills. Meetings, appointments, personal plans. Without this, it is just an aggregation viewer. | MEDIUM | Reuses `categories` table for `category_id`. New `calendar_events` table + `CalendarEventsDB`. New Zod validation schema. | Title, date/time, location, description, category, color override, recurrence. Same API route pattern as all other domains. |
| **Event recurrence** | Repeating events (weekly meeting, monthly dinner) are fundamental. Every calendar app supports this. | LOW | Reuses existing `RecurrenceRule` discriminated union from `lib/db/types.ts`. Same expansion logic as recurring tasks. | Same `is_recurring` + `recurrence_rule` JSONB + `end_type` pattern. Same "edit this / edit all" exception handling. Near-zero new logic. |
| **Cross-domain aggregation** | The entire value proposition of a calendar in BetterR.Me. Users already track tasks, habits, bills, and workouts. Showing them on a timeline is the minimum justification for building a calendar. | MEDIUM | Depends on existing DB classes: `TasksDB`, `HabitsDB`/`HabitLogsDB`, `RecurringBillsDB`, `WorkoutsDB`. Unified feed API queries all in parallel. | Feed endpoint: `GET /api/calendar/feed?start=YYYY-MM-DD&end=YYYY-MM-DD`. Returns `CalendarItem[]` with `source` discriminator. Each domain maps to a color. |
| **Domain color coding** | Users need to visually distinguish what type of item they are looking at. Google Calendar uses calendar colors. BetterR.Me needs domain colors. | LOW | Reuses existing design tokens (teal=events, blue=tasks, amber=habits, red=bills, purple=workouts). | Consistent dot + background fill pattern. Matches existing color language from other views. |
| **Layer toggles (show/hide domains)** | Users may want to see only tasks, or only events, without the noise of habits and bills. Every multi-calendar app has this. | LOW | Client-side filter on the SWR-fetched `CalendarItem[]`. No API change needed. | Sidebar checkboxes (desktop) or dropdown filters (mobile). State persisted in localStorage or user preferences. |
| **Navigation (prev/next, today button)** | Users must move through time. "Today" button is expected. Arrow navigation is expected. Every calendar has this. | LOW | None. Pure UI state management (current date + view type). | Keyboard shortcuts: `T` for today, arrows for prev/next. View switcher: `D`/`W`/`M` keys. |
| **All-day events** | Events without a specific time (birthdays, deadlines, habits). Rendered in a separate row above the time grid. | LOW | Habits and bills are inherently all-day. Tasks without `due_time` are all-day. Events with `start_time: null` are all-day. | All-day row at top of day/week view. Compact chip rendering. |
| **Quick-create from time slot click** | Clicking an empty time slot to create an event is the most intuitive creation pattern. Google Calendar, Outlook, Fantastical all do this. | MEDIUM | Depends on event CRUD being built. Pre-fills date/time from click position. | Popover with title input, pre-filled time, Enter to save. "More options" expands to full dialog. |
| **Push notification for reminders** | The core reason notifications exist. Users set a reminder, they expect to be notified. Web Push is the web-native approach. | HIGH | New infrastructure: service worker (`public/sw.js`), VAPID keys, `push_subscriptions` table, `PushSubscriptionsDB`. Browser permission flow. | Web Push API + service worker. Works on desktop browsers and Android Chrome. Does NOT work on iOS Safari without PWA installation (platform limitation). |
| **Reminder creation per event/task/bill** | Users must be able to set "remind me 15 minutes before" on individual items. This is the basic reminder UX. | MEDIUM | New `reminders` table + `RemindersDB`. `fire_at` pre-computation for efficient cron queries. | Multiple reminders per item. Relative (15 min before, 1 hour before) or absolute (specific time). Default channel: push. |
| **Cron-based reminder delivery** | Reminders must actually fire at the right time. Vercel Cron running every minute checks `WHERE fire_at <= NOW() AND status = 'pending'`. | MEDIUM | Follows existing Vercel Cron pattern from Plaid sync. New `api/cron/send-reminders/route.ts`. | Must handle: multiple reminders due at once, multiple push subscriptions per user, failure/retry logic. |
| **Reminder defaults per domain** | Users should not have to set reminders manually for every task and habit. Smart defaults (15 min before events, 1 hour before tasks, etc.) reduce friction. | LOW | New `reminder_defaults` table + `ReminderDefaultsDB`. System defaults as fallback. | Per source type: calendar_event (15 min), task (1 hour), habit (8 AM), bill (3 days). User can override in settings. |
| **Responsive layout** | Calendar must work on mobile. Day view default on small screens. No sidebar on mobile. | MEDIUM | Follows existing responsive patterns (sidebar collapses to icon-rail on tablet, hidden on mobile). | Desktop: sidebar + full week grid. Tablet: icon-rail + 5-day week. Mobile: no sidebar, day view, FAB for new event, swipe navigation. |

---

## Differentiators

Features that set BetterR.Me's calendar apart from standalone calendar apps. Not expected in a basic calendar, but high-value given the app's multi-domain nature.

| Feature | Value Proposition | Complexity | Dependencies on Existing App | Notes |
|---------|-------------------|------------|------------------------------|-------|
| **Unified life-on-a-timeline view** | No other app shows habits, tasks, bills, workouts, AND calendar events on a single timeline. Google Calendar shows only events. Todoist shows only tasks. BetterR.Me uniquely has all five domains. This is the signature feature. | MEDIUM | All existing domain DB classes must expose date-range queries. The feed API orchestrates parallel queries. | The aggregation itself is moderate complexity. The value is the data already existing in the app -- users get this "for free" by having used BetterR.Me's other features. |
| **Inline cross-domain actions** | Toggle a task complete, log a habit, mark a bill paid -- directly from the calendar without navigating away. Transforms the calendar from a viewer into a command center. | MEDIUM | Depends on existing mutation APIs: `PATCH /api/tasks/[id]`, `POST /api/habits/logs`, bill payment toggle. SWR optimistic updates on the calendar feed. | Each inline action calls the existing domain API and optimistically updates the calendar SWR cache. No new backend logic -- only new UI interaction handlers. |
| **Email notification channel** | Push alone is insufficient -- users miss push notifications, browsers get closed, devices go silent. Email is the reliable fallback for important reminders (bill due in 3 days). | MEDIUM | New dependency: Resend or SendGrid for transactional email. Email templates per source type. Unsubscribe link compliance. | Bill reminders default to push + email. Event reminders default to push only. User can configure per-reminder. Sender: `reminders@betterr.me`. |
| **Quiet hours** | Respect that users do not want push notifications at 2 AM. Configurable quiet window (e.g., 10 PM - 7 AM). Reminders during quiet hours are held until quiet hours end. | LOW | Extends `ProfilePreferences` with `quiet_hours_start` and `quiet_hours_end`. Cron checks quiet hours before sending. | Simple time-range check in the delivery pipeline. Deferred reminders get a new `fire_at` at quiet-hours-end. |
| **Click-and-drag event creation** | Drag across a time range to create an event with duration pre-filled. Power user feature from Google Calendar and Fantastical. | HIGH | Depends on time grid being interactive. Mouse/touch event handling for drag selection. | Desktop-only (touch drag conflicts with scroll on mobile). Pre-fills start time and end time from the drag range. Opens quick-create popover. |
| **Keyboard shortcuts** | `D`/`W`/`M` for views, `T` for today, arrows for navigation, `N` for new event, `C` for quick-create, `/` for search, `Esc` to close. Power user productivity. | LOW | Pure client-side key handler. No backend changes. | Follow existing app pattern (if any keyboard shortcuts exist). Use `useHotkeys` or similar. Ensure no conflicts with browser shortcuts. |
| **Mini month picker in sidebar** | Quick date navigation without leaving the current view. Click any day in the mini calendar to jump there. Standard in Outlook and Google Calendar. | LOW | Pure UI component. Updates the calendar's current date state. | Small month grid in the left sidebar. Highlights current day and selected date range. Arrows to navigate months. |
| **Snooze reminders** | When a push notification fires, "Snooze 10 min" action. Creates a new reminder with adjusted `fire_at`. Useful for "not right now but don't forget." | LOW | Extends reminder `status` to include `snoozed`. Service worker notification action button. New snooze API endpoint. | Snooze durations: 5 min, 10 min, 1 hour. Creates a new pending reminder row. Original marked `snoozed`. |
| **Notification click-through navigation** | Clicking a push notification navigates to the relevant item: calendar event opens calendar at that date, task opens task detail, bill opens money/bills. | LOW | Service worker `notificationclick` handler with action URL. Each reminder stores a `click_url` or computes it from `source_type` + `source_id`. | Standard Web Push pattern. URL mapping: `event` -> `/calendar?date=YYYY-MM-DD`, `task` -> `/tasks?id=UUID`, `habit` -> `/habits`, `bill` -> `/money/bills`. |

---

## Anti-Features

Features to explicitly NOT build. Either premature, wrong for BetterR.Me's context, or scope creep that would delay the core calendar/notification value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Google Calendar / iCal sync** | Massive complexity: OAuth for Google, iCal parsing, two-way sync conflict resolution, real-time webhook subscriptions. This is a product in itself. Users will ask for it but it can wait. | Build a standalone calendar that is great on its own. Add import/sync in a future milestone once the core calendar is validated. Design spec already lists this as out of scope. |
| **Drag-and-drop rescheduling on the grid** | Dragging an event to a new time slot requires complex hit-testing, snap-to-grid logic, recurring event handling ("move this or all?"), and undo support. High effort for a nice-to-have. | Edit event via click -> dialog -> change time. Functional and clear. Design spec already defers this. |
| **Collaborative calendars / sharing** | BetterR.Me is a personal productivity app. Shared calendars require invitation flows, permission models, real-time sync, and conflict resolution. The money domain has household sharing, but calendar sharing is a different beast. | Personal calendar only. Household members see their own calendars. No shared event editing. |
| **Natural language event creation** | "Lunch with Sarah tomorrow at noon" parsing requires NLP, timezone inference, and ambiguity resolution. Fun demo, hard to make reliable. | Structured form with pre-filled defaults from click context. Quick-create popover is fast enough. |
| **Time analytics / "how I spent my week"** | Requires time tracking (start/end for every activity), which the calendar does not enforce. Events have durations, but habits and tasks do not. Incomplete data produces misleading analytics. | Show event count per domain as a simple stat. Full time analytics requires a dedicated time-tracking feature (future milestone). |
| **Custom notification sounds** | Web Push API does not support custom sounds on most platforms. Browser-level limitation. Attempting to work around it adds complexity for no benefit. | Use the system default notification sound. |
| **In-app notification center / inbox** | A bell icon with a feed of past notifications adds a persistent UI element, read/unread state, pagination, and cleanup logic. Overengineered for a personal app where push + email suffice. | Reminders fire via push and email. No in-app feed. If a user misses a notification, the item is still visible on the calendar. |
| **SMS notifications** | Requires Twilio or similar, per-message cost, phone number verification, compliance with SMS regulations (opt-in, STOP handling). Expensive and complex for minimal benefit over push + email. | Push (instant, free) + email (reliable, free via Resend free tier). |
| **Calendar event attachments** | File upload, storage, preview -- significant scope for a feature that most personal calendars do not need. Google Calendar only recently added this. | Text description field and location field cover most use cases. Link to external files via URL in description. |
| **Multi-day event spanning** | Events spanning multiple days (3-day conference) require complex rendering across day cells, split rendering in week view, and special handling in the all-day row. | Support multi-day via `start_date` != `end_date` in the data model (design spec includes `end_date`), but render as a single chip on the start date with a date range label. Full visual spanning is a future enhancement. |
| **Recurring event bulk delete** | "Delete all future occurrences" requires cascading logic, exception cleanup, and careful UX. Edge cases multiply. | Support "delete this event" (single occurrence -> exception) and "delete all events" (delete parent + all exceptions). "Delete future only" deferred. |

---

## Feature Dependencies

```
[Existing infrastructure (Auth, Supabase, SWR, Cron, Design Tokens, i18n)]
    |
    +--> [DB schema: calendar_events, reminders, push_subscriptions, reminder_defaults]
    |       |
    |       +--> [CalendarEventsDB + Zod validations]
    |       |       |
    |       |       +--> [Event CRUD API routes]
    |       |       |       |
    |       |       |       +--> [Event creation UI (quick-create + full dialog)]
    |       |       |       +--> [Event recurrence (reuses RecurrenceRule)]
    |       |       |       +--> [Recurring event exceptions ("edit this only")]
    |       |       |
    |       |       +--> [Calendar feed API] (also depends on existing domain DB classes)
    |       |               |
    |       |               +--> [Calendar UI views (Month, Week, Day)]
    |       |               |       |
    |       |               |       +--> [Domain color coding + layer toggles]
    |       |               |       +--> [Inline cross-domain actions]
    |       |               |       +--> [Navigation + keyboard shortcuts]
    |       |               |       +--> [Responsive layout (desktop/tablet/mobile)]
    |       |               |
    |       |               +--> [Mini month picker in sidebar]
    |       |
    |       +--> [RemindersDB + fire_at computation]
    |       |       |
    |       |       +--> [Reminder creation UI (per event/task/bill)]
    |       |       +--> [Reminder defaults per domain]
    |       |       +--> [Cron job: send-reminders (every minute)]
    |       |               |
    |       |               +--> [Push delivery] (depends on push_subscriptions)
    |       |               +--> [Email delivery] (depends on Resend/SendGrid)
    |       |               +--> [Quiet hours enforcement]
    |       |
    |       +--> [PushSubscriptionsDB + VAPID keys + service worker]
    |       |       |
    |       |       +--> [Browser permission flow UI]
    |       |       +--> [Push subscription registration]
    |       |       +--> [Notification click-through navigation]
    |       |       +--> [Snooze action on notifications]
    |       |
    |       +--> [ReminderDefaultsDB]
    |               |
    |               +--> [Reminder preferences settings page]
    |
    +--> [Existing DB classes queried by feed API]
            |
            +--> TasksDB.getTasksByDateRange() -- tasks with due_date in range
            +--> HabitsDB + shouldTrackOnDate() -- habits active on each day
            +--> HabitLogsDB -- check if habits are logged for inline status
            +--> RecurringBillsDB -- bills with next_due_date in range
            +--> WorkoutsDB -- workouts by created_at date
```

### Dependency Notes

1. **RecurrenceRule reuse is the biggest win.** The existing `RecurrenceRule` discriminated union (`DailyRule`, `WeeklyRule`, `MonthlyByDateRule`, `MonthlyByWeekdayRule`, `YearlyRule`) with `EndType` and the `recurring_event_id` + `is_exception` + `original_date` exception pattern is directly reusable. This eliminates the highest-risk part of calendar event recurrence (the logic is already tested in recurring tasks).

2. **The feed API is the integration linchpin.** It must query 5 domain DB classes in parallel and merge into a unified `CalendarItem[]`. Performance matters here -- querying a month of data across 5 tables must stay under ~200ms. Existing DB classes already support date-range queries for most domains.

3. **Push notifications are a new infrastructure concern.** BetterR.Me has no service worker today. Adding one requires: VAPID key generation, `public/sw.js`, service worker registration in the app shell, `push_subscriptions` table, and the Web Push API send logic. This is the most "greenfield" part of the project.

4. **Email delivery is a new external dependency.** Resend (or SendGrid) adds an API key, email templates, sender domain verification, and unsubscribe compliance. The Vercel Cron pattern for delivery is familiar (same as Plaid sync), but email-specific concerns (bounce handling, deliverability) are new.

5. **Cron frequency matters.** The design spec calls for every-minute cron for reminder delivery. Vercel Cron's minimum interval is 1 minute, which works. But this means ~1440 cron invocations/day even when no reminders are pending. The query `WHERE fire_at <= NOW() AND status = 'pending'` must be indexed on `(fire_at, status)` for performance.

6. **iOS Safari limitation.** Web Push does NOT work on iOS Safari unless the app is installed as a PWA (Add to Home Screen). This is a platform limitation, not a bug. Users on iOS Safari will only receive email reminders. This should be documented in the UI.

7. **Habit reminders need special handling.** Habits do not have a "start time" -- they are tracked as daily completions. The reminder for habits is a nudge at a fixed time (default 8 AM) rather than a "15 minutes before" relative reminder. The `fire_at` computation differs from events/tasks.

8. **Existing domain queries may need extension.** `TasksDB` needs a `getTasksByDateRange(userId, start, end)` method if one does not exist. `WorkoutsDB` may need a similar range query. These are minor additions to existing DB classes.

---

## Complexity Assessment

| Component | Complexity | Rationale |
|-----------|------------|-----------|
| **Week view time grid** | HIGH | Most complex UI component. 7-column grid with hourly rows, positioned event blocks, current time indicator, all-day row, overlapping event handling, click-to-create interaction. |
| **Push notification infrastructure** | HIGH | New territory: service worker, VAPID keys, browser permission flow, subscription storage, Web Push send API. Multiple failure modes (permission denied, subscription expired, browser closed). |
| **Feed aggregation API** | MEDIUM | 5 parallel DB queries, type-safe merge into `CalendarItem[]`, habit schedule expansion via `shouldTrackOnDate()`, date range handling. Performance-sensitive. |
| **Event CRUD + recurrence** | LOW-MEDIUM | Recurrence logic is reused. CRUD follows existing patterns. Exception handling is a known pattern. The "low" is the logic; the "medium" is the UI for the full event dialog. |
| **Email delivery pipeline** | MEDIUM | External service integration (Resend/SendGrid), email templates per source type, unsubscribe handling, bounce/failure tracking. |
| **Cron reminder delivery** | MEDIUM | Query pending reminders, fan out to push + email channels, handle failures, update status. Follows existing Plaid sync cron pattern but with two delivery channels. |
| **Month view** | MEDIUM | Standard month grid, but rendering compact chips per day, overflow handling ("+N more"), and drill-down to day view adds interaction complexity. |
| **Day view** | LOW-MEDIUM | Single-column time grid. Shares components with week view. Simpler than week view but needs swipe navigation on mobile. |
| **Reminder preferences UI** | LOW | Settings page with toggles and dropdowns. Per-domain default editing. Quiet hours time picker. Standard form. |
| **Sidebar mini calendar + layer toggles** | LOW | Small month grid component, checkbox list for domain layers. Standard UI patterns. |
| **Keyboard shortcuts** | LOW | Client-side key handler. Map keys to actions. No backend involvement. |
| **Responsive layout** | MEDIUM | Three breakpoints (desktop/tablet/mobile) with different layouts. Mobile needs swipe, FAB, no sidebar. Tablet needs icon-rail. Following existing patterns helps. |

**Overall estimate:** This milestone is comparable in scope to v4.0 Money Tracking. The calendar UI (especially the week view time grid) is the most complex single component. The notification infrastructure is the most "new" (no precedent in the codebase). But the aggregation layer benefits enormously from existing domain data and patterns.

---

## Integration with Existing BetterR.Me Features

### Navigation Structure

Current sidebar: Dashboard | Habits | Tasks | Projects | Journal | Workouts | Money

Recommended addition:
```
Dashboard    (existing -- unchanged)
Calendar     (NEW -- between Dashboard and Habits for prominence)
Habits       (existing -- unchanged)
Tasks        (existing -- unchanged)
Projects     (existing -- unchanged)
Journal      (existing -- unchanged)
Workouts     (existing -- unchanged)
Money        (existing -- unchanged)
Settings     (existing -- add Reminder Preferences section)
```

Calendar should be high in the nav hierarchy because it is the unified view of all domains -- a natural "second home" after the dashboard.

### Dashboard Integration

The dashboard already aggregates habits and tasks. Calendar does NOT replace the dashboard -- it complements it:

- **Dashboard** = "What do I need to do today?" (habit checklist, task list, money summary)
- **Calendar** = "What does my week/month look like?" (timeline view of all domains)

No changes to the existing dashboard are needed for v6.0. The calendar is an additional view, not a replacement.

### Shared UI Patterns

| Pattern | Existing Usage | Calendar Usage |
|---|---|---|
| SWR + keepPreviousData | Habit/task data with date in key | Calendar feed with date range in key |
| Zod validation | All POST/PATCH routes | Event CRUD, reminder CRUD |
| DB class pattern | HabitsDB, TasksDB, etc. | CalendarEventsDB, RemindersDB, PushSubscriptionsDB, ReminderDefaultsDB |
| RecurrenceRule type | RecurringTasksDB | CalendarEventsDB (same type, same expansion logic) |
| Exception pattern | `recurring_task_id` + `is_exception` | `recurring_event_id` + `is_exception` (identical) |
| Design tokens | All existing views | Calendar views + domain color tokens |
| Vercel Cron | Plaid sync cron job | Reminder delivery cron job |
| i18n message keys | habits.*, tasks.*, money.* | calendar.*, reminders.* namespaces |

### Notification System is App-Wide

The reminder/notification system is NOT calendar-specific. It serves all domains:

- Calendar events -> "Meeting in 15 minutes"
- Tasks -> "Report due in 1 hour"
- Habits -> "Time to meditate" (daily nudge)
- Bills -> "Electric bill due in 3 days"

This means the notification infrastructure (push subscriptions, cron delivery, email templates, preferences) benefits the entire app, not just the calendar feature. It is a horizontal platform capability.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| DB schema (calendar_events, reminders, push_subscriptions, reminder_defaults) | Foundation | MEDIUM | P0 | 1 |
| CalendarEventsDB + Zod validations | Foundation | LOW | P0 | 1 |
| Event CRUD API routes | Foundation | LOW | P0 | 1 |
| Calendar feed aggregation API | HIGH | MEDIUM | P0 | 1 |
| Month view | HIGH | MEDIUM | P1 | 2 |
| Week view with time grid | HIGH | HIGH | P1 | 2 |
| Day view | HIGH | LOW-MEDIUM | P1 | 2 |
| View switcher + navigation | HIGH | LOW | P1 | 2 |
| Domain color coding | MEDIUM | LOW | P1 | 2 |
| Event quick-create (click time slot) | HIGH | MEDIUM | P1 | 3 |
| Full event creation/edit dialog | HIGH | MEDIUM | P1 | 3 |
| Event recurrence (reuse RecurrenceRule) | MEDIUM | LOW | P1 | 3 |
| Recurring event exceptions | MEDIUM | LOW | P1 | 3 |
| Layer toggles (show/hide domains) | MEDIUM | LOW | P1 | 2 |
| Inline cross-domain actions | HIGH | MEDIUM | P2 | 4 |
| Mini month picker in sidebar | MEDIUM | LOW | P2 | 2 |
| Responsive layout | HIGH | MEDIUM | P1 | 2 |
| Keyboard shortcuts | LOW | LOW | P2 | 2 |
| Service worker + VAPID + push subscriptions | Foundation | HIGH | P0 | 5 |
| Push notification delivery | HIGH | HIGH | P1 | 5 |
| Reminder creation per item | HIGH | MEDIUM | P1 | 5 |
| Reminder defaults per domain | MEDIUM | LOW | P1 | 5 |
| Cron-based reminder delivery | HIGH | MEDIUM | P1 | 5 |
| Email notification delivery (Resend) | MEDIUM | MEDIUM | P2 | 5 |
| Quiet hours | LOW | LOW | P2 | 6 |
| Reminder preferences settings page | MEDIUM | LOW | P2 | 6 |
| Snooze reminders | LOW | LOW | P3 | 6 |
| Click-and-drag event creation | LOW | HIGH | P3 | Defer |
| Sidebar + calendar navigation item | Foundation | LOW | P0 | 1 |
| i18n calendar + reminder strings | Foundation | LOW | P0 | All |
| All-day events | MEDIUM | LOW | P1 | 2 |

**Priority key:**
- P0: Foundation -- everything else depends on it
- P1: Must have for the calendar + notifications to feel complete
- P2: Should have, adds significant value
- P3: Nice-to-have, defer if timeline is tight

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Week view time grid complexity** | HIGH | HIGH | Build incrementally: static render first, then click-to-create, then overlapping events. Consider existing open-source time grid components for reference. |
| **iOS Safari push limitation** | CERTAIN | MEDIUM | Document in UI. Ensure email channel works well as fallback. Show "Install as app for push notifications" prompt on iOS. |
| **Cron cost on Vercel** | LOW | LOW | Every-minute cron is within Vercel Pro limits. The query is indexed and fast when no reminders are pending. |
| **Push subscription expiry** | MEDIUM | MEDIUM | Web Push subscriptions can expire silently. Handle `410 Gone` responses by removing stale subscriptions. Re-prompt on next visit if no active subscription. |
| **Feed API performance** | MEDIUM | HIGH | 5 parallel DB queries must complete fast. Add database indexes on date columns. Consider caching strategy for month-view queries. Monitor with Vercel analytics. |
| **Email deliverability** | LOW | MEDIUM | Use Resend with verified domain. Keep email volume low (personal app, not marketing). Include unsubscribe link. |

---

*Feature research for: BetterR.Me v6.0 Calendar & Reminder Notifications*
*Researched: 2026-03-30*
