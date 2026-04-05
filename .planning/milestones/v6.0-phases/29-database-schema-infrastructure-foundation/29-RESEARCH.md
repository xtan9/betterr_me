# Phase 29: Database Schema & Infrastructure Foundation -- Research

## Executive Summary

Phase 29 lays the groundwork for the entire v6.0 Calendar & Reminders milestone by creating four new database tables (`calendar_events`, `reminders`, `reminder_defaults`, `push_subscriptions`), adding timezone support to profiles, building DB classes and Zod schemas following existing patterns, and placing a minimal service worker at `public/sw.js`. The project has well-established patterns for all of these -- the main design decisions are around the calendar event recurrence/exception model (which mirrors the existing recurring tasks pattern) and the source-agnostic reminder architecture.

## Existing Patterns

### DB Class Pattern

All DB classes live in `lib/db/` and follow a consistent structure:

- **Constructor:** `constructor(private supabase: SupabaseClient) {}`
- **Imports:** `SupabaseClient` from `@supabase/supabase-js`, types from `./types`
- **CRUD methods:** Each method does `this.supabase.from('table').select/insert/update/delete()` with `.eq('user_id', userId)` for auth scoping
- **Error handling:** `if (error) throw error;` -- errors bubble to API route `try/catch` blocks
- **Not-found handling:** Check for `error.code === 'PGRST116'` and return `null` instead of throwing
- **Client singleton:** Each file exports a client-side singleton at the bottom: `export const fooDB = new FooDB(createClient());`
- **Barrel export:** All DB classes are re-exported from `lib/db/index.ts`
- **Return patterns:** Insert/update use `.select().single()` to return the created/updated row

Reference files: `lib/db/habits.ts`, `lib/db/profiles.ts`, `lib/db/recurring-tasks.ts`

### Zod Schema Pattern

Validation schemas live in `lib/validations/` and follow:

- **Create schema:** `z.object({...})` with all required fields, `.trim().min(1)` for titles, `.max(N)` for length limits
- **Update schema:** `createSchema.partial().extend({...extra fields}).refine(data => Object.keys(data).length > 0, { message: "At least one field must be provided" })`
- **Date validation:** `z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")`
- **UUID references:** `z.string().uuid().nullable().optional()`
- **Discriminated unions:** Used for recurrence rules (see `lib/validations/recurring-task.ts`)
- **Exported types:** Both schema and `z.infer<typeof schema>` type are exported

Reference files: `lib/validations/habit.ts`, `lib/validations/task.ts`, `lib/validations/recurring-task.ts`, `lib/validations/profile.ts`

### Migration Pattern

Migrations live in `supabase/migrations/` with naming convention `YYYYMMDDNNNNNN_description.sql`:

- **Table creation:** `CREATE TABLE` with `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- **RLS:** Always `ALTER TABLE ENABLE ROW LEVEL SECURITY;` with four policies (SELECT/INSERT/UPDATE/DELETE) using `auth.uid() = user_id`
- **Indexes:** `CREATE INDEX idx_tablename_column ON tablename(column);` -- composite indexes for common queries, partial indexes for hot paths (e.g., `WHERE status = 'active'`)
- **Triggers:** `CREATE TRIGGER update_X_updated_at BEFORE UPDATE ON X FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();` (function already exists from initial migration)
- **CHECK constraints:** Inline or via `ALTER TABLE ADD CONSTRAINT`
- **JSONB:** Used for flexible structured data (habits.frequency, recurring_tasks.recurrence_rule)
- **Comments:** `COMMENT ON TABLE/COLUMN` for documentation

Reference files: `20260129_initial_schema.sql`, `20260203_001_create_habits_table.sql`, `20260217000001_create_recurring_tasks.sql`, `20260222100001_create_journal_entries.sql`, `20260224000001_create_fitness_tables.sql`

### Profile Table

Current schema (from `20260129_initial_schema.sql`):

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{"date_format":"MM/DD/YYYY","week_start_day":1,"theme":"system"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

TypeScript type (`lib/db/types.ts`):

```ts
interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs";
}
```

**Timezone addition options:**

1. **Add `timezone` column directly to profiles** -- simple ALTER TABLE, nullable with default null meaning "not yet detected"
2. **Add to preferences JSONB** -- keeps it with other settings but harder to query in SQL for cron jobs

**Recommendation:** Add `timezone TEXT` as a top-level column on `profiles` (not inside preferences JSONB). The cron job needs to join `reminders` with `profiles.timezone` for fire_at computation -- a top-level column is far more efficient for SQL queries than extracting from JSONB. The `ProfilePreferences` type should also gain a `quiet_hours_start` and `quiet_hours_end` field (or those can live in `reminder_defaults`).

## Schema Design

### calendar_events

Following the design spec exactly, reusing the `RecurrenceRule` JSONB pattern from `recurring_tasks`:

```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  start_time TIME,               -- NULL = all-day event
  end_date DATE NOT NULL,         -- defaults to start_date in application layer
  end_time TIME,
  location TEXT,
  color TEXT,                     -- user color override, nullable
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule JSONB,          -- reuses RecurrenceRule type
  end_type TEXT CHECK (end_type IN ('never', 'after_count', 'on_date')),
  end_date_recurrence DATE,
  end_count INTEGER,
  recurring_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  original_date DATE,             -- for exception instances
  is_exception BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key indexes:**
- `idx_calendar_events_user_date ON calendar_events(user_id, start_date)` -- primary query for feed
- `idx_calendar_events_user_range ON calendar_events(user_id, start_date, end_date)` -- range queries
- `idx_calendar_events_recurring ON calendar_events(recurring_event_id) WHERE is_exception = true` -- exception lookup
- Partial index: `WHERE is_recurring = true` for recurrence expansion queries

**Constraints:**
- `CHECK (start_time IS NOT NULL OR (start_time IS NULL AND end_time IS NULL))` -- if no start_time, must be all-day (no end_time either)
- Self-referential FK for `recurring_event_id` with CASCADE delete (deleting parent deletes exceptions)

### reminders

Source-agnostic, serving calendar events, tasks, habits, and bills:

```sql
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('calendar_event', 'task', 'habit', 'bill')),
  source_id UUID NOT NULL,        -- polymorphic FK (no DB-level FK constraint)
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('relative', 'absolute')),
  relative_minutes INTEGER,       -- negative = before (e.g., -15)
  absolute_time TIMESTAMPTZ,
  channels TEXT[] NOT NULL DEFAULT '{push}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'snoozed')) DEFAULT 'pending',
  fire_at TIMESTAMPTZ NOT NULL,   -- pre-computed, indexed for cron
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key indexes:**
- `idx_reminders_fire_at ON reminders(fire_at) WHERE status = 'pending'` -- the critical cron query index
- `idx_reminders_user_source ON reminders(user_id, source_type, source_id)` -- lookup by source entity
- `idx_reminders_user ON reminders(user_id)` -- general user queries

**Design note on `source_id`:** This is a polymorphic FK -- it references different tables depending on `source_type`. Adding a real FK constraint would require 4 separate nullable FK columns. The polymorphic approach is simpler and matches common patterns. Application-level referential integrity is sufficient since reminders are non-critical data.

**No `updated_at`:** Reminders are created, fired, and done. No meaningful updates. Status transitions are the only changes and `sent_at` tracks when that happened.

### reminder_defaults

Per-user smart defaults by source type:

```sql
CREATE TABLE reminder_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('calendar_event', 'task', 'habit', 'bill')),
  relative_minutes INTEGER NOT NULL,  -- e.g., -15 for 15 min before
  channels TEXT[] NOT NULL DEFAULT '{push}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, source_type)
);
```

**Key constraints:**
- `UNIQUE (user_id, source_type)` -- one default per source type per user
- No `updated_at` needed (simple config row, rarely changes)

**System defaults** (hardcoded in application layer, not in DB):
- Calendar event: -15 minutes, push
- Task due: -60 minutes, push
- Habit: -480 minutes (8 hours = 8am same day, approximate), push
- Bill due: -4320 minutes (3 days), push + email

### push_subscriptions

Web Push API subscription storage:

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, endpoint)    -- one subscription per device per user
);
```

**Key constraints:**
- `UNIQUE (user_id, endpoint)` -- prevents duplicate subscriptions for same device
- No `updated_at` -- subscriptions are created and deleted, not updated

**Key index:**
- `idx_push_subscriptions_user ON push_subscriptions(user_id)` -- lookup all devices for a user

## RLS Policies

All four new tables follow the standard user-owned pattern:

```sql
ALTER TABLE X ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own X" ON X FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own X" ON X FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own X" ON X FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own X" ON X FOR DELETE USING (auth.uid() = user_id);
```

**Special case for `push_subscriptions`:** No UPDATE policy needed (subscriptions are replaced, not updated). However, including it does no harm and follows the standard pattern.

**Special case for `reminder_defaults`:** The UPSERT pattern (insert or update on conflict) requires both INSERT and UPDATE policies. Standard pattern covers this.

## Timezone Infrastructure

### Storage

Add `timezone TEXT` column to `profiles`:

```sql
ALTER TABLE profiles ADD COLUMN timezone TEXT;
COMMENT ON COLUMN profiles.timezone IS 'IANA timezone identifier (e.g., America/New_York). NULL = not yet detected.';
```

Update `ProfilePreferences` type to also include quiet hours:

```ts
interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs";
  quiet_hours_start?: string | null;  // HH:MM format, e.g., "22:00"
  quiet_hours_end?: string | null;    // HH:MM format, e.g., "07:00"
}
```

Also update the `Profile` interface to include `timezone`:

```ts
interface Profile {
  // ...existing fields...
  timezone: string | null;
}
```

### Detection

On first visit (or when timezone is null), detect via `Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser and send to the API. This should be a client-side effect that runs once and calls `PATCH /api/profile` with the detected timezone.

**Implementation approach:**
1. A React hook or effect in the root layout client component
2. Check if profile.timezone is null
3. If null, call `Intl.DateTimeFormat().resolvedOptions().timeZone`
4. PATCH to `/api/profile` to save it
5. Only run once (SWR cache or localStorage flag prevents repeated calls)

### Usage

The timezone is used for:
1. Computing `fire_at` for relative reminders: convert local event time to UTC using the user's IANA timezone
2. Respecting quiet hours: check if current time in user's timezone falls within quiet hours before sending push
3. Displaying times in the user's timezone in email notifications

## Service Worker

### Current State

No `public/` directory exists at the project root. Next.js serves static files from `public/`, so this directory needs to be created. No existing service worker or PWA configuration exists.

### What's Needed

Create `public/sw.js` -- a minimal service worker that:
1. Listens for `push` events and displays notifications
2. Listens for `notificationclick` events and navigates to the relevant URL
3. Does NOT intercept fetch events (no offline caching -- explicit design decision from INFR-08)

```js
// public/sw.js -- Push notification service worker
// No fetch interception (INFR-08)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const { title, body, icon, url } = data;
  event.waitUntil(
    self.registration.showNotification(title || 'BetterR.Me', {
      body: body || '',
      icon: icon || '/icon-192.png',
      data: { url: url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
```

### Registration

Service worker registration happens client-side, typically in a settings page or a root-level effect when the user has granted notification permission. The registration code would be:

```ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### next.config Changes

May need to add a header for the service worker scope:

```ts
{
  source: "/sw.js",
  headers: [
    { key: "Service-Worker-Allowed", value: "/" },
    { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  ],
}
```

## Validation Architecture

### Event Validation (`lib/validations/calendar-events.ts`)

```ts
// Create schema
const calendarEventCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  location: z.string().max(500).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  category_id: z.string().uuid().nullable().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: recurrenceRuleSchema.optional().nullable(),
  end_type: z.enum(['never', 'after_count', 'on_date']).optional().nullable(),
  end_date_recurrence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_count: z.number().int().min(1).optional().nullable(),
}).refine(/* cross-field: if is_recurring, recurrence_rule required */);

// Update schema: partial + refine(at least one field)
```

**Reuse:** The `recurrenceRuleSchema` from `lib/validations/recurring-task.ts` can be imported directly -- no duplication needed.

### Reminder Validation (`lib/validations/reminders.ts`)

```ts
const reminderCreateSchema = z.object({
  source_type: z.enum(['calendar_event', 'task', 'habit', 'bill']),
  source_id: z.string().uuid(),
  reminder_type: z.enum(['relative', 'absolute']),
  relative_minutes: z.number().int().optional().nullable(),
  absolute_time: z.string().datetime().optional().nullable(),
  channels: z.array(z.enum(['push', 'email'])).min(1),
}).refine(/* if relative, relative_minutes required; if absolute, absolute_time required */);
```

## Dependencies & Risks

### Dependencies

1. **Recurrence rule reuse:** The `RecurrenceRule` type and `recurrenceRuleSchema` already exist in `lib/db/types.ts` and `lib/validations/recurring-task.ts`. Calendar events should reuse these exactly.
2. **Categories table FK:** `calendar_events.category_id` references the existing `categories` table -- no new table needed.
3. **VAPID keys:** Not needed for Phase 29 (just the schema and SW file). VAPID key generation and storage is Phase 34 (Push Notification Infrastructure).
4. **`public/` directory:** Does not exist yet -- needs to be created. This is unusual but straightforward.

### Risks

1. **Polymorphic `source_id` in reminders:** No DB-level FK constraint means orphaned reminders are possible if a source entity is deleted without cleanup. Mitigation: add application-level cascade delete in each domain's delete method, or accept that orphaned pending reminders will simply fail silently when the cron job tries to send them.

2. **Timezone null handling:** New users will have `timezone = NULL` until the client-side detection runs. Any code computing `fire_at` must handle null timezone gracefully (fall back to UTC or skip reminder creation until timezone is set).

3. **fire_at recomputation:** When an event's time changes, all pending reminders for that event must have their `fire_at` recalculated. This is a cross-table update that needs to be reliable. The `CalendarEventsDB.update()` method should handle this atomically.

4. **Migration ordering:** The migration must create tables in dependency order: profiles ALTER first (timezone column), then `calendar_events` (references categories), then `reminders` (references nothing with FK due to polymorphic design), then `reminder_defaults`, then `push_subscriptions`. All can be in one migration file.

5. **Service worker caching by browsers:** Browsers aggressively cache service workers. The `Cache-Control: no-cache` header on `sw.js` is important to ensure updates are picked up. Also, service workers require HTTPS in production (localhost is exempted for development).

6. **Quiet hours in preferences JSONB:** Adding new fields to the `preferences` JSONB column is backward-compatible (existing rows just lack the field, which defaults to undefined/null in TypeScript). No migration needed for the JSONB shape -- only the TypeScript type needs updating.

7. **No `updated_at` on reminders:** This is intentional but worth noting. If debugging requires knowing when a reminder's status changed, `sent_at` covers the main case. Failed reminders could log the failure timestamp separately if needed in the future.

## RESEARCH COMPLETE
