# Requirements — v6.0 Calendar & Reminder Notifications

**Defined:** 2026-03-30
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable
**Design Spec:** `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`

## Calendar Views

- [x] **VIEW-01**: User can see a monthly calendar grid with day cells showing compact event chips and "+N more" overflow
- [x] **VIEW-02**: User can see a weekly time grid with 7 day columns, hourly rows, and events rendered as colored blocks
- [x] **VIEW-03**: User can see a daily time grid with single-column full-width events
- [x] **VIEW-04**: User can switch between Day, Week, and Month views via header toggle
- [x] **VIEW-05**: User can navigate to previous/next period (day, week, or month) with arrow buttons
- [x] **VIEW-06**: User can jump to today with a "Today" button
- [x] **VIEW-07**: User can see a current time indicator (teal line) on Week and Day views
- [x] **VIEW-08**: User can see all-day events in a dedicated all-day row above the time grid
- [x] **VIEW-09**: Calendar page has a left sidebar with mini month picker for quick date navigation
- [x] **VIEW-10**: Calendar uses BetterR.Me design tokens (teal primary, rounded-xl, sidebar tokens, dark mode)
- [ ] **VIEW-11**: Calendar defaults to Week view on desktop and Day view on mobile (sm breakpoint)
- [x] **VIEW-12**: User can use keyboard shortcuts: D (day), W (week), M (month), T (today), ← → (navigate), C (quick-create), N (new event dialog), / (search), Esc (close)

## Event Management

- [x] **EVNT-01**: User can create a calendar event with title, date, start/end time, location, description, category, and color
- [x] **EVNT-02**: User can create all-day events (no start/end time)
- [x] **EVNT-03**: User can edit and delete calendar events
- [x] **EVNT-04**: User can create recurring events using the existing RecurrenceRule system (daily, weekly, monthly, yearly with interval)
- [x] **EVNT-05**: User can edit a single occurrence of a recurring event ("edit this event only") creating an exception record
- [x] **EVNT-06**: User can edit all occurrences of a recurring event ("edit all events")
- [x] **EVNT-07**: User can quick-create an event by clicking a time slot (popover with title, pre-filled time, Enter to save)
- [x] **EVNT-08**: User can create an event by click-and-dragging on the time grid (duration pre-filled from drag range)
- [x] **EVNT-09**: User can open a full event creation dialog via "+ New Event" button or N key
- [x] **EVNT-10**: Full event dialog has a "More options" expansion from quick-create for location, description, recurrence, reminders

## Cross-Domain Aggregation

- [ ] **AGGR-01**: Calendar shows tasks with due_date at their due_time (or in the all-day row if no time)
- [ ] **AGGR-02**: Calendar shows active habits scheduled for each day in the all-day row
- [ ] **AGGR-03**: Calendar shows bills with next_due_date in the all-day row
- [ ] **AGGR-04**: Calendar shows logged workouts at their start time
- [ ] **AGGR-05**: Each domain has a distinct color: events (teal/primary), tasks (blue), habits (amber), bills (red), workouts (purple)
- [ ] **AGGR-06**: User can toggle visibility of each domain via sidebar layer checkboxes
- [ ] **AGGR-07**: User can complete/uncomplete tasks directly from the calendar (circle checkbox)
- [ ] **AGGR-08**: User can toggle habit completion directly from the calendar (square checkbox)
- [ ] **AGGR-09**: User can mark bills as paid/dismissed directly from the calendar
- [ ] **AGGR-10**: Clicking a workout on the calendar navigates to the workout detail page
- [ ] **AGGR-11**: Unified feed API (`/api/calendar/feed`) returns all domain items for a date range in a single request

## Push Notifications

- [ ] **PUSH-01**: User can enable push notifications from settings with browser permission flow
- [ ] **PUSH-02**: Service worker handles push events and displays native browser notifications
- [ ] **PUSH-03**: Clicking a push notification navigates to the relevant item (event, task, habit, or bill)
- [ ] **PUSH-04**: Push subscriptions stored per-device in push_subscriptions table
- [ ] **PUSH-05**: VAPID keys stored as environment variables, generated once during setup

## Email Notifications

- [ ] **MAIL-01**: User can enable email notifications from settings
- [ ] **MAIL-02**: Email reminders sent via Resend with React Email templates per source type
- [ ] **MAIL-03**: Every reminder email includes an unsubscribe link
- [ ] **MAIL-04**: Email templates exist for: event reminder, task due, habit nudge, bill due

## Reminders

- [ ] **REMN-01**: User can add multiple reminders per calendar event (relative or absolute)
- [ ] **REMN-02**: Relative reminders support: 5 min, 15 min, 30 min, 1 hour, 1 day before, and custom minutes
- [ ] **REMN-03**: Absolute reminders support a specific date + time
- [ ] **REMN-04**: Each reminder can target push, email, or both channels
- [ ] **REMN-05**: Smart defaults auto-apply reminders based on source type (event: 15min/push, task: 1hr/push, habit: 8am/push, bill: 3days/push+email)
- [ ] **REMN-06**: User can customize default reminders per source type in settings
- [ ] **REMN-07**: User can set quiet hours (no push between configurable start/end times)
- [ ] **REMN-08**: Vercel Cron job runs every minute to dispatch pending reminders
- [ ] **REMN-09**: Reminders have fire_at pre-computed and recomputed on event reschedule
- [ ] **REMN-10**: Failed reminder deliveries are logged with status='failed' for retry

## Database & Infrastructure

- [x] **INFR-01**: calendar_events table with all fields from design spec (title, dates, times, location, recurrence, exceptions)
- [x] **INFR-02**: reminders table (source-agnostic: calendar_event/task/habit/bill) with fire_at index
- [x] **INFR-03**: reminder_defaults table for per-user smart defaults by source type
- [x] **INFR-04**: push_subscriptions table for Web Push API subscriptions
- [x] **INFR-05**: User's IANA timezone stored in profiles table for fire_at UTC computation
- [x] **INFR-06**: CalendarEventsDB, RemindersDB, PushSubscriptionsDB, ReminderDefaultsDB classes following existing patterns
- [x] **INFR-07**: Zod validation schemas for event CRUD and reminder CRUD at API boundaries
- [x] **INFR-08**: Service worker at public/sw.js handles push and notificationclick events only (no fetch interception)

## Internationalization

- [ ] **I18N-01**: All calendar and reminder UI strings translated in en, zh, and zh-TW

## Responsive & Accessibility

- [ ] **RESP-01**: On mobile (sm), sidebar collapses; layer toggles move to header filter dropdown
- [ ] **RESP-02**: On mobile, default view is Day with swipe left/right to navigate
- [ ] **RESP-03**: "+ New Event" becomes a floating action button on mobile

## Future Requirements (deferred)

- Google Calendar / iCal import/sync
- Drag-and-drop rescheduling of events on the grid
- Collaborative calendars / sharing
- Natural language event creation
- Time analytics ("how I spent my week")
- SMS notification channel
- Notification snooze

## Out of Scope

- **Google Calendar sync** — complex OAuth + bidirectional sync, separate milestone
- **Drag-and-drop rescheduling** — high complexity for marginal value in personal use
- **Collaborative calendars** — single-user focus for now
- **Natural language creation** — nice-to-have, not essential for launch
- **Time analytics** — requires usage data, better as future enhancement
- **SMS notifications** — cost per message, push + email sufficient
- **Custom notification sounds** — browser API limitations, minimal user value
- **In-app notification center** — toast notifications (sonner) sufficient for now

## Traceability

| Phase | Requirements |
|-------|-------------|
| 29 — Database Schema & Infrastructure Foundation | INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06, INFR-07, INFR-08 |
| 30 — Calendar Event CRUD API | EVNT-01, EVNT-02, EVNT-03, EVNT-04, EVNT-05, EVNT-06 |
| 31 — Calendar UI — Month View & Navigation | VIEW-01, VIEW-04, VIEW-05, VIEW-06, VIEW-09, VIEW-10, VIEW-11 |
| 32 — Calendar UI — Week & Day Views | VIEW-02, VIEW-03, VIEW-07, VIEW-08, VIEW-12, EVNT-07, EVNT-08, EVNT-09, EVNT-10 |
| 33 — Cross-Domain Feed Aggregation | AGGR-01, AGGR-02, AGGR-03, AGGR-04, AGGR-05, AGGR-06, AGGR-07, AGGR-08, AGGR-09, AGGR-10, AGGR-11 |
| 34 — Push Notification Infrastructure | PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05 |
| 35 — Email Notification Infrastructure | MAIL-01, MAIL-02, MAIL-03, MAIL-04 |
| 36 — Reminder Cron, Preferences & Polish | REMN-01, REMN-02, REMN-03, REMN-04, REMN-05, REMN-06, REMN-07, REMN-08, REMN-09, REMN-10, I18N-01, RESP-01, RESP-02, RESP-03 | |

---
*v6.0 Calendar & Reminder Notifications*
*57 requirements across 9 categories*
