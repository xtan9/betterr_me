---
phase: 29-database-schema-infrastructure-foundation
plan: 02
status: complete
started: "2026-03-31"
completed: "2026-03-31"
duration: ~5min
requirements_satisfied: [INFR-06]
---

# Plan 02 Summary: DB Classes with Unit Tests

## What Was Done

### Task 1: CalendarEventsDB and RemindersDB
Created `lib/db/calendar-events.ts` with CalendarEventsDB class:
- `getUserEvents(userId, startDate, endDate)` — date range query with dual ordering
- `getEvent(eventId, userId)` — single event with PGRST116 null handling
- `createEvent(userId, data)` — insert with user scoping
- `updateEvent(eventId, userId, updates)` — update with user scoping
- `deleteEvent(eventId, userId)` — delete with user scoping
- `getRecurringEvents(userId)` — filter by `is_recurring=true`
- `getExceptions(recurringEventId)` — filter by `is_exception=true` and parent ID

Created `lib/db/reminders.ts` with RemindersDB class:
- `createReminder(userId, data)` — insert with user scoping
- `getRemindersBySource(userId, sourceType, sourceId)` — query by polymorphic source
- `getPendingReminders(beforeTime)` — cron-ready query for pending reminders
- `updateReminderStatus(reminderId, status, sentAt?)` — status transition with optional sent timestamp
- `deleteRemindersBySource(userId, sourceType, sourceId)` — bulk delete by source

Tests: 29 passing (16 calendar-events, 13 reminders)

### Task 2: PushSubscriptionsDB, ReminderDefaultsDB, and Barrel Export
Created `lib/db/push-subscriptions.ts` with PushSubscriptionsDB class:
- `getSubscriptions(userId)` — list all subscriptions
- `upsertSubscription(userId, data)` — upsert on `(user_id, endpoint)` conflict
- `deleteSubscription(userId, endpoint)` — delete specific subscription
- `deleteAllSubscriptions(userId)` — delete all for user

Created `lib/db/reminder-defaults.ts` with ReminderDefaultsDB class:
- `getDefaults(userId)` — list all defaults
- `getDefault(userId, sourceType)` — single default with PGRST116 null handling
- `upsertDefault(userId, data)` — upsert on `(user_id, source_type)` conflict
- `deleteDefault(userId, sourceType)` — delete specific default

Updated `lib/db/index.ts` with barrel exports for all 4 new classes and singletons.

Tests: 19 passing (9 push-subscriptions, 10 reminder-defaults)

## Verification

- All 48 tests pass across 4 test files
- ESLint: 0 errors (pre-existing warnings only)
- All 4 classes exported from `lib/db/index.ts`

## Commits

1. `262188e` — feat: add CalendarEventsDB and RemindersDB classes with unit tests
2. `998592c` — feat: add PushSubscriptionsDB and ReminderDefaultsDB classes with tests

## Files Changed

- `lib/db/calendar-events.ts` (new, 90 lines)
- `lib/db/reminders.ts` (new, 66 lines)
- `lib/db/push-subscriptions.ts` (new, 47 lines)
- `lib/db/reminder-defaults.ts` (new, 51 lines)
- `lib/db/index.ts` (modified, +6 lines)
- `tests/lib/db/calendar-events.test.ts` (new, 195 lines)
- `tests/lib/db/reminders.test.ts` (new, 160 lines)
- `tests/lib/db/push-subscriptions.test.ts` (new, 118 lines)
- `tests/lib/db/reminder-defaults.test.ts` (new, 119 lines)
