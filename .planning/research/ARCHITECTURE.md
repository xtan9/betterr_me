# Architecture Research: Calendar & Reminder Notifications (v6.0)

**Date:** 2026-03-30
**Status:** Research complete
**Design Spec:** `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`

---

## 1. Integration Points with Existing Code

### 1.1 Database Layer (lib/db/)

**Existing pattern to follow:**
- DB classes take `SupabaseClient` in constructor, instantiated fresh per request
- Types defined in `lib/db/types.ts` with `Interface`, `Insert`, `Update` variants
- Exported from `lib/db/index.ts`
- RLS on all tables; Admin client (`lib/supabase/admin.ts`) bypasses RLS for cron jobs

**New DB classes (4):**
| Class | File | Table |
|---|---|---|
| `CalendarEventsDB` | `lib/db/calendar-events.ts` | `calendar_events` |
| `RemindersDB` | `lib/db/reminders.ts` | `reminders` |
| `PushSubscriptionsDB` | `lib/db/push-subscriptions.ts` | `push_subscriptions` |
| `ReminderDefaultsDB` | `lib/db/reminder-defaults.ts` | `reminder_defaults` |

**Existing DB classes queried by feed aggregation:**
| Class | File | What we read |
|---|---|---|
| `TasksDB` | `lib/db/tasks.ts` | Tasks with `due_date` in range |
| `HabitsDB` + `HabitLogsDB` | `lib/db/habits.ts`, `lib/db/habit-logs.ts` | Active habits + logs for date range |
| `RecurringBillsDB` | `lib/db/recurring-bills.ts` | Bills with `next_due_date` in range |
| `WorkoutsDB` | `lib/db/workouts.ts` | Completed workouts by `started_at` date |

**Key reuse:** `RecurrenceRule` discriminated union (lines 169-174 of `lib/db/types.ts`) -- `DailyRule | WeeklyRule | MonthlyByDateRule | MonthlyByWeekdayRule | YearlyRule` -- used identically for calendar event recurrence. The recurrence expansion functions in `lib/recurring-tasks/recurrence.ts` (`getNextOccurrence`, `parseDateParts`, `toDateString`, `addDays`, `compareDates`) can be generalized or reused directly.

### 1.2 API Routes (app/api/)

**Existing pattern to follow:**
- `authenticateRequest()` from `lib/auth/api-key.ts` for auth + client creation
- Zod validation via `validateRequestBody()` from `lib/validations/api.ts`
- `try/catch` -> `log()` -> `NextResponse.json({ error }, { status })`
- Date param from client for timezone correctness (`getLocalDateString()`)

**New API routes (8):**
| Route | Purpose |
|---|---|
| `app/api/calendar/events/route.ts` | GET (list) + POST (create) calendar events |
| `app/api/calendar/events/[id]/route.ts` | GET/PATCH/DELETE single event |
| `app/api/calendar/feed/route.ts` | GET unified aggregation feed (core integration point) |
| `app/api/reminders/route.ts` | GET/POST/DELETE reminders |
| `app/api/reminders/defaults/route.ts` | GET/PUT reminder defaults per source type |
| `app/api/push/subscribe/route.ts` | POST push subscription registration |
| `app/api/push/unsubscribe/route.ts` | POST push subscription removal |
| `app/api/cron/send-reminders/route.ts` | GET cron job for reminder delivery |

**Feed aggregation route (`/api/calendar/feed`)** is the main integration point -- it queries 5 DB classes in parallel:
1. `CalendarEventsDB.getEventsInRange(userId, start, end)` -- standalone events
2. `TasksDB` -- tasks with `due_date` between start/end
3. Habits: `HabitsDB.getUserHabits()` + `shouldTrackOnDate()` from `lib/habits/format.ts` to expand which habits are scheduled for each day in range
4. `RecurringBillsDB.getHouseholdBills()` -- bills with `next_due_date` in range (requires `resolveHousehold()` from `lib/db/households.ts`)
5. `WorkoutsDB` -- completed workouts with `started_at` in range

### 1.3 Cron Infrastructure

**Existing pattern:** `app/api/cron/sync-transactions/route.ts`
- Verifies `CRON_SECRET` bearer token
- Uses `createAdminClient()` (bypasses RLS)
- Iterates through records, processes each, handles errors individually
- Returns summary JSON `{ synced, errors }`

**New cron:** `app/api/cron/send-reminders/route.ts`
- Same auth pattern (CRON_SECRET)
- Query: `SELECT * FROM reminders WHERE fire_at <= NOW() AND status = 'pending'`
- Process each: send push/email, update status
- Must run **every 1 minute** (vs current 6h for transactions) -- add to `vercel.json` crons config

**Note:** `vercel.json` is currently `{}` (empty). The transaction sync cron may be configured via Vercel dashboard. New reminder cron needs to be added explicitly.

### 1.4 SWR Data Fetching (Client Side)

**Existing pattern to follow:**
- SWR keys include date for midnight refresh: `['/api/endpoint', date]`
- `keepPreviousData: true` when key contains a date
- 34 existing hooks in `lib/hooks/`

**New hooks (3-4):**
| Hook | SWR Key | Notes |
|---|---|---|
| `useCalendarFeed` | `['/api/calendar/feed', startDate, endDate]` | Date-range keyed, `keepPreviousData: true` |
| `useCalendarEvents` | `['/api/calendar/events']` | For event CRUD mutations |
| `useReminderDefaults` | `['/api/reminders/defaults']` | Static key (no date dependency) |
| `usePushSubscription` | `['/api/push/status']` | Check if user has active push subscription |

**Inline mutations from calendar:** Toggling task completion, habit logging, and bill payment from the calendar view will call existing domain APIs (`/api/tasks/[id]`, `/api/habits/logs`, `/api/money/bills/[id]`) and then `mutate()` the calendar feed SWR key for optimistic update.

### 1.5 Recurrence Expansion

**Existing code to reuse/generalize:**
- `lib/recurring-tasks/recurrence.ts` -- `getNextOccurrence()`, date math utilities
- `lib/recurring-tasks/instance-generator.ts` -- `ensureRecurringInstances()` pattern

**Difference for calendar events:** Recurring tasks create concrete task instances in DB. Calendar events should **expand occurrences on the fly** in the feed API (no instance table), using `recurring_event_id` + `is_exception` for edited individual occurrences. This is a read-time expansion vs write-time materialization.

**Recommended:** Extract shared recurrence math into `lib/recurrence/` (new directory) used by both recurring tasks and calendar events. Keep instance generation separate since the strategies differ.

### 1.6 Navigation & Layout

**File to modify:** `components/layouts/app-sidebar.tsx`
- Add calendar nav item to `mainNavItems` array (between Dashboard and Habits)
- Icon: `Calendar` from `lucide-react`
- `labelKey: "calendar"`, `match: (p) => p.startsWith("/calendar")`

**File to modify:** `lib/supabase/proxy.ts`
- `/calendar` is a protected route -- already handled by the generic "unauthenticated protected routes -> `/auth/login`" redirect (no explicit allowlist to update)

### 1.7 i18n

**Files to modify:** `i18n/messages/en.json`, `i18n/messages/zh.json`, `i18n/messages/zh-TW.json`
- Add `calendar` namespace for all calendar UI strings
- Add `reminders` namespace for notification/reminder strings
- Add `common.nav.calendar` for sidebar label

### 1.8 Validation Schemas

**Existing pattern:** `lib/validations/` with Zod schemas per domain
- `taskFormSchema` in `lib/validations/task.ts`
- `recurringTaskSchema` in `lib/validations/recurring-task.ts`

**New validation files:**
| File | Schemas |
|---|---|
| `lib/validations/calendar-events.ts` | `calendarEventCreateSchema`, `calendarEventUpdateSchema` |
| `lib/validations/reminders.ts` | `reminderCreateSchema`, `reminderDefaultsSchema` |

**Reuse:** The recurrence rule validation from `lib/validations/recurring-task.ts` can be shared.

### 1.9 Design Tokens & Theming

**No new tokens needed.** The design spec maps to existing tokens:
- Primary (teal) for events -- existing `--primary`
- Section-work (blue) for tasks -- existing
- Category-productivity (amber) for habits -- existing
- Priority-high (red) for bills -- existing
- Only **purple for workouts** may need a new CSS variable if not already defined

**Dark mode:** Fully handled by existing CSS variable system in `globals.css`.

### 1.10 Service Worker & Web Push

**Entirely new infrastructure.** No existing service worker or PWA support. No `public/` directory exists yet.

**New files:**
- `public/sw.js` -- service worker (plain JS, not bundled by Next.js)
- Service worker registration utility in `lib/push/register.ts`
- Web Push sending utility in `lib/push/send.ts` (server-side, uses `web-push` npm package)

**Config changes:**
- `next.config.ts` -- add header for service worker scope (`Service-Worker-Allowed: /`)
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### 1.11 Email Delivery

**Entirely new infrastructure.**

**New files:**
- `lib/email/send.ts` -- email sending utility (Resend SDK)
- `lib/email/templates/` -- email templates per source type (event, task, habit, bill)

**New env vars:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

**No existing email infrastructure** -- this is the first email feature in the app.

---

## 2. New vs Modified Components

### 2.1 New Files (~35-40 files)

**Database & Types (6 files):**
- `lib/db/calendar-events.ts` -- CalendarEventsDB class
- `lib/db/reminders.ts` -- RemindersDB class
- `lib/db/push-subscriptions.ts` -- PushSubscriptionsDB class
- `lib/db/reminder-defaults.ts` -- ReminderDefaultsDB class
- Types added to `lib/db/types.ts` (modification, not new file)
- `supabase/migrations/YYYYMMDD_calendar_reminders.sql` -- new migration

**API Routes (8 files):**
- `app/api/calendar/events/route.ts`
- `app/api/calendar/events/[id]/route.ts`
- `app/api/calendar/feed/route.ts`
- `app/api/reminders/route.ts`
- `app/api/reminders/defaults/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/push/unsubscribe/route.ts`
- `app/api/cron/send-reminders/route.ts`

**Page Route (2 files):**
- `app/calendar/page.tsx` -- server component shell
- `app/calendar/loading.tsx` -- skeleton

**Components (11 files):**
- `components/calendar/calendar-page-content.tsx` -- main orchestrator
- `components/calendar/week-view.tsx`
- `components/calendar/day-view.tsx`
- `components/calendar/month-view.tsx`
- `components/calendar/calendar-sidebar.tsx` -- mini-cal + layer toggles
- `components/calendar/event-popover.tsx` -- quick-create
- `components/calendar/event-dialog.tsx` -- full create/edit dialog
- `components/calendar/calendar-item.tsx` -- rendered event block
- `components/calendar/view-switcher.tsx` -- Day/Week/Month toggle
- `components/calendar/time-grid.tsx` -- shared hourly grid
- `components/settings/reminder-preferences.tsx` -- settings panel

**Hooks (3-4 files):**
- `lib/hooks/use-calendar-feed.ts`
- `lib/hooks/use-calendar-events.ts`
- `lib/hooks/use-reminder-defaults.ts`
- `lib/hooks/use-push-subscription.ts`

**Validation (2 files):**
- `lib/validations/calendar-events.ts`
- `lib/validations/reminders.ts`

**Notification Infrastructure (4-5 files):**
- `public/sw.js` -- service worker
- `lib/push/register.ts` -- client-side registration
- `lib/push/send.ts` -- server-side Web Push
- `lib/email/send.ts` -- Resend integration
- `lib/email/templates/reminder.tsx` -- email template

**Shared Recurrence (1-2 files):**
- `lib/recurrence/expand.ts` -- shared occurrence expansion for calendar feed
- Possibly `lib/recurrence/index.ts` re-exporting from existing `lib/recurring-tasks/recurrence.ts`

### 2.2 Modified Files (~8-10 files)

| File | Change |
|---|---|
| `lib/db/types.ts` | Add `CalendarEvent`, `Reminder`, `PushSubscription`, `ReminderDefault` types |
| `lib/db/index.ts` | Export new DB classes |
| `components/layouts/app-sidebar.tsx` | Add Calendar nav item to `mainNavItems` array |
| `next.config.ts` | Add service worker headers, possibly `public/sw.js` serving config |
| `i18n/messages/en.json` | Add `calendar` and `reminders` namespaces |
| `i18n/messages/zh.json` | Add `calendar` and `reminders` namespaces |
| `i18n/messages/zh-TW.json` | Add `calendar` and `reminders` namespaces |
| `components/settings/settings-content.tsx` | Add reminder preferences section |
| `vercel.json` | Add cron schedule for `send-reminders` (every 1 min) |
| `package.json` | Add `web-push` and `resend` dependencies |

---

## 3. Data Flow for Notifications

### 3.1 Reminder Creation Flow

```
User creates/edits event (or task with due date, etc.)
  |
  v
API route (e.g., POST /api/calendar/events)
  |
  v
CalendarEventsDB.create() -- saves event
  |
  v
RemindersDB.createForSource() -- creates reminder row(s)
  - Reads user's reminder_defaults for source_type
  - Computes fire_at = event_start - relative_minutes
  - Sets status = 'pending'
  - Sets channels from defaults or explicit user choice
  |
  v
Row in `reminders` table with pre-computed `fire_at`
```

### 3.2 Reminder Delivery Flow (Cron)

```
Vercel Cron (every 1 min) -> GET /api/cron/send-reminders
  |
  v
Verify CRON_SECRET bearer token
  |
  v
Admin client: SELECT * FROM reminders
  WHERE fire_at <= NOW() AND status = 'pending'
  |
  v
For each reminder:
  |
  +-- Check quiet hours (user preferences) -- skip if in quiet hours, leave pending
  |
  +-- If 'push' in channels:
  |     Query push_subscriptions for user_id
  |     For each subscription: web-push send (title, body, click URL)
  |     Handle 410 Gone -> delete stale subscription
  |
  +-- If 'email' in channels:
  |     Query profiles for user email
  |     Resend API: send templated email (source_type determines template)
  |
  +-- On success: UPDATE status = 'sent', sent_at = NOW()
  +-- On failure: UPDATE status = 'failed', log error
  |
  v
Return { processed, sent, failed, skipped_quiet_hours }
```

### 3.3 Push Subscription Flow

```
User clicks "Enable push notifications" in settings
  |
  v
Browser: Notification.requestPermission()
  |
  +-- 'denied' -> show message, stop
  +-- 'granted':
        |
        v
      navigator.serviceWorker.register('/sw.js')
        |
        v
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY
      })
        |
        v
      POST /api/push/subscribe { endpoint, p256dh, auth, user_agent }
        |
        v
      PushSubscriptionsDB.create() -> stored in DB
```

### 3.4 Event Reschedule -> Reminder Recomputation

```
User edits event start_time via PATCH /api/calendar/events/[id]
  |
  v
CalendarEventsDB.update() -- saves new start_time
  |
  v
RemindersDB.recomputeFireAt(source_type='calendar_event', source_id=eventId)
  - SELECT all reminders WHERE source_id = eventId AND status = 'pending'
  - For each: fire_at = new_start_time - relative_minutes
  - Bulk UPDATE
```

### 3.5 Calendar Feed Aggregation Flow

```
Client: useCalendarFeed(startDate, endDate)
  -> SWR key: ['/api/calendar/feed', startDate, endDate]
  |
  v
GET /api/calendar/feed?start=2026-03-01&end=2026-03-31
  |
  v
authenticateRequest() -> userId, supabase
  |
  v
Parallel queries (Promise.all):
  1. CalendarEventsDB.getEventsInRange(userId, start, end)
     - Includes expanding recurring events on the fly
     - Excludes dates with is_exception entries
  2. TasksDB: tasks WHERE due_date BETWEEN start AND end
  3. Habits: getUserHabits() -> for each day in range, shouldTrackOnDate()
     + HabitLogsDB: logs in range for is_logged status
  4. RecurringBillsDB: bills WHERE next_due_date BETWEEN start AND end
     (requires resolveHousehold() for household_id)
  5. WorkoutsDB: completed workouts WHERE started_at::date BETWEEN start AND end
  |
  v
Map each to CalendarItem { id, source, title, start_date, ... , meta }
  |
  v
Return unified array sorted by start_date, start_time
```

---

## 4. Suggested Build Order

The build order follows the design spec's recommendation (calendar-first, then notifications) with phases sized for one-PR-each.

### Phase 1: Database Schema & Types
**Dependencies:** None
**Deliverables:**
- Supabase migration: `calendar_events`, `reminders`, `reminder_defaults`, `push_subscriptions` tables with RLS policies
- TypeScript types in `lib/db/types.ts`
- 4 new DB classes (`CalendarEventsDB`, `RemindersDB`, `PushSubscriptionsDB`, `ReminderDefaultsDB`)
- Export from `lib/db/index.ts`
- Zod validation schemas in `lib/validations/calendar-events.ts` and `lib/validations/reminders.ts`
- Unit tests for all DB classes

**Why first:** Everything else depends on the data layer.

### Phase 2: Calendar Event CRUD API
**Dependencies:** Phase 1
**Deliverables:**
- `app/api/calendar/events/route.ts` (GET list, POST create)
- `app/api/calendar/events/[id]/route.ts` (GET, PATCH, DELETE)
- Recurrence support -- extract shared expansion logic into `lib/recurrence/`
- Recurring event exception handling (edit this occurrence / edit all)
- Reminder auto-creation on event create (using `ReminderDefaultsDB`)
- Reminder `fire_at` recomputation on event reschedule
- API route tests

**Why second:** CRUD is needed before the UI can display anything.

### Phase 3: Calendar UI -- Month View & Navigation
**Dependencies:** Phase 2
**Deliverables:**
- `app/calendar/page.tsx` + `loading.tsx`
- `components/calendar/calendar-page-content.tsx` (orchestrator)
- `components/calendar/month-view.tsx` (simplest view to start)
- `components/calendar/view-switcher.tsx`
- `components/calendar/calendar-sidebar.tsx` (mini-cal, domain layer toggles)
- `lib/hooks/use-calendar-events.ts` (SWR hook for event CRUD)
- Sidebar nav item added to `app-sidebar.tsx` (Calendar icon)
- i18n strings for all three locales
- Component tests

**Why third:** Month view is the simplest to implement and validates the full vertical slice (DB -> API -> UI). Sidebar nav makes the feature discoverable.

### Phase 4: Calendar UI -- Week & Day Views
**Dependencies:** Phase 3
**Deliverables:**
- `components/calendar/week-view.tsx` with time grid
- `components/calendar/day-view.tsx` with time grid
- `components/calendar/time-grid.tsx` (shared hourly grid)
- `components/calendar/calendar-item.tsx` (event block rendering)
- Current time indicator (teal line)
- Quick-create popover (`event-popover.tsx`) on time slot click
- Full event dialog (`event-dialog.tsx`) with all fields
- Keyboard shortcuts (D/W/M/T/arrows/N/C/Esc)
- Responsive behavior (sidebar collapse on tablet, day-view default on mobile)
- Component tests

**Why fourth:** Builds on month view foundation with more complex time-based rendering.

### Phase 5: Cross-Domain Feed Aggregation
**Dependencies:** Phase 4 (for UI), Phase 1 (for DB)
**Deliverables:**
- `app/api/calendar/feed/route.ts` -- unified aggregation endpoint
- `lib/hooks/use-calendar-feed.ts` -- SWR hook with date-range key
- Integration with `shouldTrackOnDate()` for habits
- Integration with `RecurringBillsDB` for bills (via `resolveHousehold()`)
- Integration with `WorkoutsDB` for workouts
- Integration with `TasksDB` for tasks with due dates
- Domain color coding in calendar views
- Layer toggle filtering (hide/show per domain)
- Inline actions: task checkbox toggle, habit log toggle, bill mark-paid
- API tests + component tests for aggregated view

**Why fifth:** This is the core value proposition -- seeing everything in one place. Requires all calendar UI to be in place.

### Phase 6: Push Notification Infrastructure
**Dependencies:** Phase 1 (for push_subscriptions table), Phase 2 (for reminders table)
**Deliverables:**
- `public/sw.js` -- service worker
- `lib/push/register.ts` -- client-side registration utility
- `lib/push/send.ts` -- server-side Web Push sending (add `web-push` npm dep)
- `app/api/push/subscribe/route.ts`
- `app/api/push/unsubscribe/route.ts`
- `next.config.ts` updates for service worker headers
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Integration tests (mock push API)

**Why sixth:** Notification delivery is independent from calendar UI. Can be built and tested in isolation.

### Phase 7: Email Notification Infrastructure
**Dependencies:** Phase 6 (shares delivery pipeline)
**Deliverables:**
- `lib/email/send.ts` -- Resend SDK integration (add `resend` npm dep)
- `lib/email/templates/reminder.tsx` -- templated emails per source type
- New env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Integration tests (mock Resend API)

**Why seventh:** Email is a second delivery channel -- simpler to add after push is working.

### Phase 8: Reminder Delivery Cron & Preferences UI
**Dependencies:** Phase 6, Phase 7
**Deliverables:**
- `app/api/cron/send-reminders/route.ts` -- cron job (follows existing sync-transactions pattern)
- `vercel.json` cron config (every 1 minute)
- `components/settings/reminder-preferences.tsx` -- push toggle, email toggle, defaults per source type, quiet hours
- Modify `components/settings/settings-content.tsx` to include reminder section
- `lib/hooks/use-reminder-defaults.ts`
- `lib/hooks/use-push-subscription.ts`
- End-to-end tests for reminder delivery pipeline

**Why last:** Ties everything together -- needs both push and email working, plus the settings UI.

---

## 5. Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vercel Cron minimum interval is 1 min on Pro plan (not available on Hobby) | Reminders delayed up to 1 min on Pro, unavailable on Hobby | Document plan requirement; consider Supabase `pg_cron` as alternative |
| Recurring event expansion on read can be slow for large date ranges | Slow feed API for month+ views | Cap expansion to 90-day window; paginate by visible range |
| Service worker + Next.js App Router interaction | SW may interfere with client-side navigation | Scope SW to push events only; do not cache routes |
| `shouldTrackOnDate()` called per-habit-per-day in range | N habits x 31 days = 31N calls for month view | Pure function, fast; profile if > 100 habits |
| Bills require household resolution | Extra DB query per feed request | Cache household_id in SWR; single resolveHousehold() call per request |
| Push subscription cleanup for uninstalled browsers | Stale subscriptions accumulate | Handle 410 Gone from web-push; periodic cleanup |
| Email deliverability (new domain) | Emails land in spam | Configure SPF/DKIM/DMARC for betterr.me; warm up sender reputation |
| No `public/` directory exists yet | Service worker file needs this directory | Create `public/` directory in Phase 6 |

---

## 6. New Dependencies

| Package | Purpose | Size Impact |
|---|---|---|
| `web-push` | Server-side Web Push API (VAPID, encryption) | ~50KB (server only) |
| `resend` | Email delivery SDK | ~15KB (server only) |

Both are server-only -- zero client bundle impact.

---

## 7. Environment Variables Required

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client + Server | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Server only | Web Push VAPID private key |
| `VAPID_SUBJECT` | Server only | VAPID subject (mailto: or URL) |
| `RESEND_API_KEY` | Server only | Resend email API key |
| `RESEND_FROM_EMAIL` | Server only | Sender email address |

---

_Last updated: 2026-03-30_
