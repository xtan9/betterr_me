# Calendar & Reminder Notifications — Design Spec

**Date:** 2026-03-30
**Status:** Draft

## Overview

A full calendar/scheduling domain for BetterR.Me with standalone event management, aggregated views from existing domains (tasks, habits, bills, workouts), and an app-wide reminder notification system supporting both push and email delivery.

## Goals

1. Provide a unified calendar view (Day/Week/Month) where users see their entire life on a timeline
2. Allow creating and managing standalone calendar events with recurrence
3. Aggregate tasks, habits, bills, and workouts onto the calendar with inline interaction
4. Deliver reminder notifications via Web Push and email with smart defaults per domain
5. Follow existing BetterR.Me patterns (Supabase, SWR, i18n, dark mode, design tokens)

## Architecture Approach

**Calendar-First:** Build the calendar domain and UI first, then layer the notification infrastructure on top. This delivers visible value quickly and makes the notification system app-wide (benefiting all domains, not just calendar events).

**Build order:**
1. DB schema (calendar_events, reminders, push_subscriptions, reminder_defaults)
2. Calendar UI (Month/Week/Day views)
3. Event CRUD (create, edit, delete, recurring)
4. Aggregation layers (tasks, habits, bills, workouts on calendar)
5. Notification infrastructure (Web Push + email)
6. Reminder preferences UI

## Data Model

### `calendar_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles |
| `title` | text | Required |
| `description` | text | Nullable |
| `start_date` | DATE | Required |
| `start_time` | TIME | Nullable (all-day if null) |
| `end_date` | DATE | Required, defaults to start_date |
| `end_time` | TIME | Nullable |
| `location` | text | Nullable, free-text field |
| `color` | text | Nullable, user-defined color override |
| `category_id` | UUID | FK → categories, nullable |
| `is_recurring` | boolean | Default false |
| `recurrence_rule` | JSONB | Nullable, reuses existing `RecurrenceRule` type |
| `end_type` | text | Nullable (`never` / `after_count` / `on_date`) |
| `end_date_recurrence` | DATE | Nullable |
| `end_count` | integer | Nullable |
| `recurring_event_id` | UUID | Nullable, FK → self (links exceptions to parent) |
| `original_date` | DATE | Nullable (original date before exception edit) |
| `is_exception` | boolean | Default false |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Recurrence:** Reuses the existing `RecurrenceRule` discriminated union from `lib/db/types.ts` (DailyRule, WeeklyRule, MonthlyByDateRule, MonthlyByWeekdayRule, YearlyRule). Same `interval`, `EndType`, and occurrence expansion logic as `RecurringTask`. The `recurring_event_id` + `is_exception` + `original_date` pattern handles "edit this occurrence only" — identical to the existing recurring task pattern.

### `reminders`

Source-agnostic table serving all domains.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles |
| `source_type` | text | `calendar_event` / `task` / `habit` / `bill` |
| `source_id` | UUID | FK to source entity |
| `reminder_type` | text | `relative` / `absolute` |
| `relative_minutes` | integer | Nullable (negative = before, e.g., -15 = 15 min before) |
| `absolute_time` | TIMESTAMPTZ | Nullable (exact fire time for flexible reminders) |
| `channels` | text[] | `['push']`, `['email']`, or `['push', 'email']` |
| `status` | text | `pending` / `sent` / `failed` / `snoozed` |
| `fire_at` | TIMESTAMPTZ | Pre-computed fire time for efficient cron queries |
| `sent_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | |

**`fire_at` computation:** For relative reminders, computed as `event_start - relative_minutes` at creation time. For absolute reminders, equals `absolute_time`. Indexed for the cron query `WHERE fire_at <= NOW() AND status = 'pending'`.

**Recomputation on reschedule:** When an event's start time changes, all associated `pending` reminders must have their `fire_at` recalculated. The `CalendarEventsDB.update()` method triggers this recomputation. Already-sent reminders (`status = 'sent'`) are not affected.

### `reminder_defaults`

Per-user smart defaults by source type.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles |
| `source_type` | text | `calendar_event` / `task` / `habit` / `bill` |
| `relative_minutes` | integer | e.g., -15 |
| `channels` | text[] | `['push', 'email']` |

**System defaults** (applied when no user override exists):

| Source Type | Default Reminder | Default Channel |
|---|---|---|
| Calendar event | 15 min before | push |
| Task due | 1 hour before | push |
| Habit (daily) | 8:00 AM same day | push |
| Bill due | 3 days before | push + email |

### `push_subscriptions`

Web Push API subscription storage.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles |
| `endpoint` | text | Push API endpoint URL |
| `p256dh` | text | Public key |
| `auth` | text | Auth secret |
| `user_agent` | text | Nullable (device identification) |
| `created_at` | TIMESTAMPTZ | |

## Calendar UI

### Views

Three views: **Day**, **Week**, **Month**.

**Week view** (default on desktop):
- Left sidebar: mini month picker for quick navigation, toggleable color-coded domain layers, "+ New Event" button
- Header bar: "Today" button, prev/next arrows, date range title, Day/Week/Month view switcher (pill toggle)
- All-day row for all-day events, habits, and bill due dates
- Time grid: 7 columns (days) with hourly rows, events rendered as colored blocks with left border accent
- Current time indicator: teal horizontal line with circle dot

**Day view** (default on mobile):
- Same layout without sidebar; layer toggles in header filter dropdown
- Single column time grid with full-width events
- Swipe left/right to navigate days

**Month view:**
- Standard month grid with day cells
- Events shown as compact colored chips (max 3 visible per day, "+N more" overflow)
- Click a day to drill into Day view

### Design System Alignment

All colors, typography, spacing, and border radii use existing BetterR.Me design tokens:

- **Primary (teal):** Calendar events — `hsl(157 63% 45%)` light / `hsl(160 45% 55%)` dark
- **Section-work (blue):** Tasks — `hsl(215 75% 55%)`
- **Category-productivity (amber):** Habits — `hsl(40 85% 55%)`
- **Priority-high (red):** Bills — `hsl(0 72% 55%)`
- **Custom purple:** Workouts — `hsl(270 60% 55%)`
- **Border radius:** `rounded-xl` (0.75rem) for cards/popovers, `rounded-lg` for buttons
- **Typography:** `text-section-heading` for calendar title, `text-caption` for time labels
- **Sidebar:** Uses `--sidebar-background`, `--sidebar-hover-bg`, `--sidebar-border` tokens
- **Dark mode:** Full support via existing CSS variable system

### Domain Color Coding

| Domain | Color | Dot | Background |
|---|---|---|---|
| Calendar events | Teal (primary) | Solid | 12% opacity fill |
| Tasks | Blue | Solid | 12% opacity fill |
| Habits | Amber | Solid | 12% opacity fill |
| Bills | Red | Solid | 12% opacity fill |
| Workouts | Purple | Solid | 12% opacity fill |

Each domain is a toggleable layer in the sidebar. Toggling off hides all items from that domain.

## Event Creation

### Three entry points

1. **Click time slot** → quick-create popover (title input, time pre-filled, chips for location/reminder, Enter to save)
2. **Click-and-drag** on time grid → quick-create with duration pre-filled from drag range
3. **"+ New Event" button** or `N` key → full creation dialog

### Quick-create popover

Minimal form: title input (auto-focused), pre-filled date/time chips, optional "+ Location" and "+ Reminder" chips. Enter saves immediately. "More options" link expands to full dialog.

### Full event dialog

Fields:
- Title (required)
- Date + start time / end time (with computed duration display)
- All-day toggle
- Location (text field)
- Description (optional textarea)
- Category (dropdown, reuses existing `categories` table)
- Color override (optional color picker)
- Recurrence picker (reuses same UI component as recurring tasks)
- Reminders section:
  - Add multiple reminders per event
  - Each reminder: relative ("15 min before", "1 hour before", "1 day before", custom minutes) or absolute (specific date + time)
  - Channel per reminder: push, email, or both

### Editing recurring events

When editing an occurrence of a recurring event, prompt: "Edit this event only" or "Edit all events". "This event only" creates an exception record (`is_exception: true`, `recurring_event_id` points to parent, `original_date` stores the original date).

## Aggregation

### Unified feed API

`GET /api/calendar/feed?start=YYYY-MM-DD&end=YYYY-MM-DD`

Returns a unified array of `CalendarItem` objects:

```ts
type CalendarItem = {
  id: string;
  source: "event" | "task" | "habit" | "bill" | "workout";
  title: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  color: string;
  is_all_day: boolean;
  meta: {
    is_completed?: boolean;   // tasks
    is_logged?: boolean;      // habits
    is_paid?: boolean;        // bills
    amount_cents?: number;    // bills
    location?: string;        // events
    description?: string;     // events
  };
};
```

The endpoint queries each domain's DB class in parallel and merges results into the unified format.

### Domain mapping

| Domain | Shows on calendar | Placement | Inline action |
|---|---|---|---|
| Tasks | Tasks with `due_date` | At `due_time` if set, otherwise all-day row | Circle checkbox → toggle `is_completed` |
| Habits | Active habits scheduled for that day (via `shouldTrackOnDate()`) | All-day row | Square checkbox → toggle `HabitLog` |
| Bills | Bills with `next_due_date` in range | All-day row | Click → mark paid/dismissed |
| Workouts | Logged workouts by `created_at` date | At workout start time | Click → navigate to workout detail |

### SWR pattern

SWR key includes the visible date range: `['/api/calendar/feed', startDate, endDate]`. Uses `keepPreviousData: true` for smooth transitions when navigating. Inline mutations (toggling tasks/habits) call existing domain APIs and optimistically update the SWR cache.

## Notification System

### Push notifications

**Setup flow:**
1. User enables push in settings → browser `Notification.requestPermission()` prompt
2. On grant, register a service worker (`public/sw.js`)
3. Create a Web Push subscription using VAPID keys
4. Store subscription in `push_subscriptions` table
5. Service worker listens for push events and displays native notifications

**Service worker** (`public/sw.js`):
- Listens for `push` events, displays notification with title, body, icon, and click action URL
- Click action navigates to the relevant item (e.g., `/calendar` for events, `/tasks` for tasks)

**VAPID keys:** Stored as environment variables (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Generated once during setup.

### Email notifications

- Use Resend (or SendGrid) for transactional email delivery
- Email templates for each source type (event reminder, task due, habit nudge, bill due)
- Sender: `reminders@betterr.me` (or configurable)
- Unsubscribe link in every email

### Delivery pipeline

1. Event/reminder created → `fire_at` computed and stored in `reminders` table
2. Vercel Cron job runs every minute: `SELECT * FROM reminders WHERE fire_at <= NOW() AND status = 'pending'`
3. For each due reminder:
   - If `'push'` in channels → send via Web Push API to all user's `push_subscriptions`
   - If `'email'` in channels → send via Resend/SendGrid
4. Update `status` to `sent` with `sent_at` timestamp
5. On failure: set `status = 'failed'`, log error for retry

### Reminder preferences (settings page)

- Toggle push notifications on/off (with browser permission flow)
- Toggle email notifications on/off
- Edit default reminders per source type (calendar event, task, habit, bill)
- Quiet hours: no push between configurable times (e.g., 10 PM – 7 AM)

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `D` | Switch to Day view |
| `W` | Switch to Week view |
| `M` | Switch to Month view |
| `T` | Jump to today |
| `←` / `→` | Navigate prev/next period |
| `C` | Open quick-create at current time |
| `N` | Open full new event dialog |
| `/` | Focus event search |
| `Esc` | Close popover/dialog |

## Responsive Behavior

| Breakpoint | Layout |
|---|---|
| Desktop (lg+) | Sidebar + full week grid |
| Tablet (md) | Sidebar collapses to icon-rail (matches existing app pattern). Week shows 5 days |
| Mobile (sm) | No sidebar — layer toggles in header filter dropdown. Default Day view. Swipe to navigate. FAB for new event |

## New Files & Routes

### Routes
- `app/calendar/page.tsx` — Calendar page (server component shell)
- `app/calendar/loading.tsx` — Skeleton loading state
- `api/calendar/events/route.ts` — CRUD for calendar events
- `api/calendar/events/[id]/route.ts` — Single event operations
- `api/calendar/feed/route.ts` — Unified aggregation feed
- `api/reminders/route.ts` — Reminder CRUD
- `api/reminders/defaults/route.ts` — Reminder defaults CRUD
- `api/push/subscribe/route.ts` — Push subscription registration
- `api/push/unsubscribe/route.ts` — Push subscription removal
- `api/cron/send-reminders/route.ts` — Cron job for reminder delivery

### DB Classes
- `lib/db/calendar-events.ts` — `CalendarEventsDB`
- `lib/db/reminders.ts` — `RemindersDB`
- `lib/db/push-subscriptions.ts` — `PushSubscriptionsDB`
- `lib/db/reminder-defaults.ts` — `ReminderDefaultsDB`

### Components
- `components/calendar/calendar-page-content.tsx` — Main calendar component
- `components/calendar/week-view.tsx` — Week view grid
- `components/calendar/day-view.tsx` — Day view grid
- `components/calendar/month-view.tsx` — Month view grid
- `components/calendar/calendar-sidebar.tsx` — Sidebar with mini-cal + layers
- `components/calendar/event-popover.tsx` — Quick-create popover
- `components/calendar/event-dialog.tsx` — Full event creation/edit dialog
- `components/calendar/calendar-item.tsx` — Rendered event block on grid
- `components/calendar/view-switcher.tsx` — Day/Week/Month toggle
- `components/calendar/time-grid.tsx` — Shared time grid component
- `components/settings/reminder-preferences.tsx` — Reminder settings panel

### Service Worker & PWA
- `public/sw.js` — Service worker for push notifications
- Update `next.config.ts` with service worker headers if needed

### Validations
- `lib/validations/calendar-events.ts` — Zod schemas for event CRUD
- `lib/validations/reminders.ts` — Zod schemas for reminder CRUD

### i18n
- Add calendar and reminder strings to all three locale files (en, zh, zh-TW)

## Testing Strategy

- **Unit tests:** DB classes, aggregation logic, recurrence expansion, reminder fire_at computation
- **Component tests:** Calendar views render correctly, inline interactions work, popover behavior
- **API route tests:** CRUD operations, feed aggregation, reminder creation
- **E2E (Playwright):** Create event flow, navigate views, toggle domain layers, receive notifications (mock push)

## Out of Scope

- Google Calendar / iCal import/sync (future enhancement)
- Drag-and-drop rescheduling of events on the grid (future enhancement)
- Collaborative calendars / sharing (future enhancement)
- Natural language event creation (future enhancement)
- Time analytics / "how I spent my week" (future enhancement)
