---
phase: 29-database-schema-infrastructure-foundation
plan: 01
status: complete
started: "2026-03-31"
completed: "2026-03-31"
duration: ~5min
requirements_satisfied: [INFR-01, INFR-02, INFR-03, INFR-04, INFR-05]
---

# Plan 01 Summary: Database Migration & TypeScript Types

## What Was Done

### Task 1: Database Migration
Created `supabase/migrations/20260331000001_create_calendar_events.sql` with:
- **ALTER profiles**: Added `timezone TEXT` column for IANA timezone storage
- **calendar_events**: Full event table with recurrence support, self-referential FK for exceptions, `chk_allday_consistency` constraint, 4 indexes
- **reminders**: Source-agnostic reminder table with polymorphic `source_type`/`source_id`, `fire_at` partial index for cron queries
- **reminder_defaults**: Per-user defaults with `UNIQUE(user_id, source_type)` constraint
- **push_subscriptions**: Web Push subscription storage with `UNIQUE(user_id, endpoint)` constraint
- All 4 tables have RLS enabled with standard SELECT/INSERT/UPDATE/DELETE policies
- `calendar_events` has `updated_at` trigger using existing `update_updated_at_column()` function
- Table comments added for documentation

### Task 2: TypeScript Types
Updated `lib/db/types.ts` with:
- **Profile**: Added `timezone: string | null` field
- **ProfilePreferences**: Added optional `quiet_hours_start` and `quiet_hours_end` fields (HH:MM format)
- **CalendarEvent**: Full interface with `RecurrenceRule` reuse, plus `CalendarEventInsert` and `CalendarEventUpdate` types
- **Reminder**: Interface with `ReminderSourceType`, `ReminderType`, `ReminderChannel`, `ReminderStatus` union types, plus Insert/Update types
- **ReminderDefault**: Interface reusing `ReminderSourceType` and `ReminderChannel`, plus Insert/Update types
- **PushSubscription**: Interface plus Insert type

## Verification

- Migration has 4 CREATE TABLE statements: PASS
- Migration has 4 ENABLE ROW LEVEL SECURITY statements: PASS
- Migration has ALTER TABLE profiles ADD COLUMN: PASS
- types.ts has all 4 new interfaces: PASS
- Profile has timezone field: PASS
- ESLint: 0 errors (11 pre-existing warnings)
- Vitest: 2683 tests passed (2 pre-existing failures unrelated to changes)

## Commits

1. `ad6c553` — feat: add database migration for calendar events, reminders, and push subscriptions
2. `d126a5d` — feat: add TypeScript types for calendar events, reminders, and push subscriptions

## Files Changed

- `supabase/migrations/20260331000001_create_calendar_events.sql` (new, 139 lines)
- `lib/db/types.ts` (modified, +108 lines)
