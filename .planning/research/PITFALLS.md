# Pitfalls Research

**Domain:** Adding calendar views + push/email reminder notifications to an existing Next.js 16 + Supabase personal productivity app (BetterR.Me v6.0)
**Researched:** 2026-03-30
**Confidence:** HIGH (verified against existing codebase patterns, Next.js 16 service worker behavior, Vercel Cron docs, Web Push API specs, and existing SWR/timezone/recurrence architecture)

**Scope note:** This document focuses on **integration-specific pitfalls** -- mistakes that arise from adding calendar and notifications to the *existing* BetterR.Me codebase. General calendar-app pitfalls (date math, rendering libraries, etc.) are only covered where they intersect with BetterR.Me-specific concerns.

## Critical Pitfalls

### Pitfall 1: Service Worker Conflicts with Next.js App Router Routing and Caching

**What goes wrong:**
The design spec places a service worker at `public/sw.js` for push notification handling. Next.js App Router has its own fetch interception, route prefetching, and client-side navigation system. A service worker with a broad `fetch` event listener will intercept Next.js route navigations, RSC (React Server Component) payloads, and API route calls. This breaks client-side navigation, causes stale RSC payloads to be served from the SW cache, and makes API mutations silently return cached responses instead of hitting the server.

The second failure mode: Vercel's CDN edge caching and the service worker's Cache API operate on the same URLs but with different invalidation strategies. A service worker that caches `/api/calendar/feed` responses will serve stale calendar data even after Vercel's edge cache has been purged.

**Why it happens:**
Service workers operate at the network layer -- they see every HTTP request from the origin. Next.js App Router relies on fetch requests for RSC payloads (`?_rsc=...` params), route prefetch, and `router.push()` navigation. Developers building the SW for push notifications will add a fetch listener "just to handle offline fallback" or copy a PWA template that includes aggressive caching, not realizing it intercepts Next.js internals.

**How to avoid:**
1. **The service worker MUST only handle `push` and `notificationclick` events.** Do NOT add a `fetch` event listener. The SW exists solely for push notification display and click-to-navigate -- not for caching, offline support, or request interception.
2. **Set the SW scope narrowly** if possible, though `public/sw.js` will default to `/` scope. The key is simply not registering a fetch handler.
3. **Register the SW only after push permission is granted**, not on page load. This avoids the SW being active for users who never enable notifications.
4. **Add `Service-Worker-Allowed` header** in `next.config.ts` headers if scope needs adjustment.
5. **Test navigation after SW registration:** verify that `router.push()`, back/forward, and RSC streaming still work correctly with the SW active.
6. **Do NOT use `next-pwa` or `@ducanh2912/next-pwa`.** These packages add aggressive caching strategies that conflict with App Router. The push notification SW is simple enough to write manually (< 30 lines).

**Warning signs:**
- A `fetch` event listener in `sw.js`
- `next-pwa` or similar package in `package.json`
- Client-side navigation breaking after enabling notifications
- API responses returning stale data after mutations
- RSC payload errors in browser console after SW registration

**Phase to address:**
Phase 5 (Notification Infrastructure) -- when implementing the service worker. Must be validated before merging.

---

### Pitfall 2: Push Notification Permission UX -- Asking Too Early Kills Adoption

**What goes wrong:**
The app requests `Notification.requestPermission()` on first visit or dashboard load, before the user understands what notifications are for. The browser shows the permission prompt, the user reflexively clicks "Block" (the default behavior for unexpected permission requests), and the permission is permanently denied. There is no API to re-request permission once blocked -- the user must manually go into browser settings to reverse it. On mobile browsers (especially iOS Safari), the permission flow has additional restrictions (must be triggered by user gesture, not programmatic).

**Why it happens:**
Developers add the permission request in a `useEffect` or on page load to "get it out of the way." This is the #1 mistake in push notification implementation. Browser vendors have actively made permission prompts more hostile to drive-by requests -- Chrome shows a quieter prompt by default for sites with low grant rates, and Safari requires a user gesture to trigger the prompt at all.

**How to avoid:**
1. **Never request permission automatically.** Only call `Notification.requestPermission()` in response to a deliberate user action: clicking "Enable push notifications" in settings, or clicking a "Notify me" button on a specific event/reminder.
2. **Use a two-step flow:** First show an in-app explanation UI ("Get reminders for your tasks and events") with an "Enable" button. Only after the user clicks "Enable" does the actual browser prompt fire. This gives the user context and increases grant rates.
3. **Check `Notification.permission` state before showing the enable button.** If already `'denied'`, show a message explaining how to re-enable in browser settings instead of a broken "Enable" button.
4. **Handle iOS Safari specifically:** `PushManager` is only available in Safari 16.4+ and only when the PWA is added to the home screen. Detect this and show appropriate messaging.
5. **Store the permission state in React state** to conditionally render notification UI, not just check once on mount.
6. **The reminder preferences page (settings) is the right place for the primary enable flow**, not the calendar page or dashboard.

**Warning signs:**
- `Notification.requestPermission()` called in a top-level `useEffect`
- No in-app explanation before the browser prompt
- "Enable notifications" button shown when permission is already `'denied'`
- No iOS Safari detection or fallback messaging
- Permission request triggered on page load instead of user gesture

**Phase to address:**
Phase 5 (Notification Infrastructure) -- the permission flow must be designed as a conscious UX decision, not an afterthought.

---

### Pitfall 3: Timezone Mismatch Between Calendar Events and Reminder `fire_at` Computation

**What goes wrong:**
The design spec stores `start_date` as DATE and `start_time` as TIME (no timezone). The `fire_at` column on reminders is TIMESTAMPTZ. The cron job runs on Vercel (UTC). The user is in `America/New_York` (UTC-5). They create an event at "3:00 PM" with a 15-minute reminder. The naive computation `fire_at = start_date + start_time - 15min` produces `2026-04-01 14:45:00` -- but in what timezone? If stored as UTC, the reminder fires at 9:45 AM Eastern. If stored as the user's timezone but the cron compares with `NOW()` (which is UTC), the reminder fires 5 hours late.

This is the exact same category of bug that the existing codebase already solved for tasks (`getLocalDateString()`, client-sent date params), but the reminder system introduces a NEW dimension: server-side time comparison. The existing timezone pattern (dates are browser-local, never UTC) works for display but breaks for server-side scheduling.

**Why it happens:**
The existing BetterR.Me timezone convention is "dates are always browser-local, never UTC." This works perfectly for habit tracking, task due dates, and bill calendars because the server never needs to compare times -- it just stores and returns dates that the client interprets. Reminders fundamentally change this: the SERVER must decide "is it time to send this notification?" by comparing `fire_at` with the server's current time (UTC on Vercel). This requires an absolute timestamp, not a local date/time pair.

**How to avoid:**
1. **Store the user's IANA timezone in `profiles`** (e.g., `America/New_York`). Add a `timezone` column to the profiles table. Populate from `Intl.DateTimeFormat().resolvedOptions().timeZone` on the client.
2. **Compute `fire_at` as UTC TIMESTAMPTZ on the server** when creating/updating a reminder. The computation is: take the event's `start_date` + `start_time`, interpret it in the user's timezone, convert to UTC, then subtract `relative_minutes`. This produces a UTC timestamp that the cron job can compare directly with `NOW()`.
3. **Recompute `fire_at` when the user changes their timezone** (rare but possible for travelers). The `PATCH /api/profile` endpoint should trigger recomputation of all pending `fire_at` values.
4. **The cron job query is simple:** `WHERE fire_at <= NOW() AND status = 'pending'` -- both sides are UTC, no timezone conversion needed at query time.
5. **For all-day events** (no `start_time`), use the user's timezone default morning time (e.g., 8:00 AM in their timezone, converted to UTC) as the base for relative reminders.
6. **Test with multiple timezones** including UTC+13 (Samoa), UTC-12 (Baker Island), and timezones with DST transitions. DST is the sneakiest source of bugs: a reminder set for "3:00 PM EDT" may need to fire at a different UTC offset after a DST change.

**Warning signs:**
- No `timezone` column on profiles table
- `fire_at` computed with `new Date()` instead of timezone-aware library
- Reminder tests only using UTC or a single timezone
- All-day event reminders firing at midnight UTC instead of morning local time
- Reminders off by exactly 1 hour during DST transition weeks

**Phase to address:**
Phase 1 (Database Schema) -- the `timezone` column on profiles must be in the first migration. Phase 5 (Notification Infrastructure) -- `fire_at` computation logic must handle timezone conversion correctly.

---

### Pitfall 4: Vercel Cron Job Reliability -- Cold Starts, 1-Minute Floor, and Missed Windows

**What goes wrong:**
The design spec calls for a cron job running every minute to check for due reminders. Vercel Cron has a minimum interval of 1 minute (Hobby plan: 1/day, Pro plan: 1/minute). The cron endpoint is a serverless function with cold start latency (200-800ms for Node.js). If the function takes longer than 1 minute to process all due reminders (many users, many reminders), the next invocation overlaps or is skipped. Additionally, Vercel Cron is "at most once" -- if the function fails, there is no automatic retry.

The existing `sync-transactions` cron runs every 6 hours as a "safety net" -- it tolerates missed runs because Plaid webhooks are the primary sync mechanism. Reminders have no such fallback: if the cron misses a run, the notification is simply late.

**Why it happens:**
Developers assume cron = reliable scheduler. Vercel Cron is a convenience trigger for serverless functions, not a job queue. It does not guarantee delivery, does not retry on failure, and does not prevent overlapping executions. A 1-minute cron that takes 90 seconds to complete will have overlapping runs, potentially sending duplicate notifications.

**How to avoid:**
1. **Use `status` as a processing lock.** Before sending, UPDATE the reminder status from `'pending'` to `'processing'` with a `WHERE status = 'pending'` condition. This prevents duplicate sends from overlapping cron runs. If the function crashes, a separate cleanup query resets `'processing'` reminders older than 5 minutes back to `'pending'`.
2. **Batch processing with LIMIT.** Query `SELECT ... WHERE fire_at <= NOW() AND status = 'pending' ORDER BY fire_at LIMIT 100` to keep execution time bounded. If there are more, the next cron invocation picks them up.
3. **Add a `retry_count` column** to reminders. On failure, increment retry_count and set status back to `'pending'`. After 3 retries, mark as `'failed'` permanently.
4. **Log every cron execution** with timing metrics. The existing `log.info("Cron sync completed", { synced, errors })` pattern from `sync-transactions` is the right model.
5. **Accept up to 2-minute latency** for reminders. A "15 minutes before" reminder arriving at 14 or 13 minutes before is acceptable for a personal productivity app. Do not over-engineer for sub-second precision.
6. **Consider Vercel plan limits.** Hobby plan only allows 1 cron job per day. If deploying to Hobby, the reminder cron needs a different approach (e.g., check on API request, or use Supabase `pg_cron` extension instead).
7. **The existing `CRON_SECRET` bearer token pattern** from `sync-transactions/route.ts` must be reused for the reminder cron. Do not create a second auth pattern.

**Warning signs:**
- No deduplication logic (dual-send when cron overlaps)
- No LIMIT on the reminder query (unbounded execution time)
- No retry mechanism for failed sends
- Testing only with 1-2 reminders, not with 100+ due simultaneously
- Deploying to Hobby plan without realizing the 1/day cron limit

**Phase to address:**
Phase 5 (Notification Infrastructure) -- the cron job implementation. The `processing` lock pattern must be part of the initial implementation, not added after duplicate sends are discovered in production.

---

### Pitfall 5: Email Deliverability -- SPF/DKIM Misconfiguration Sends All Emails to Spam

**What goes wrong:**
The design spec sends from `reminders@betterr.me`. Without proper DNS configuration (SPF, DKIM, DMARC), emails from this address will be flagged as spam by Gmail, Outlook, and Yahoo. Gmail in particular started enforcing DKIM and SPF for bulk senders in February 2024. Even with correct DNS, transactional emails that look like marketing (generic subject lines, no prior engagement) get filtered.

**Why it happens:**
Developers sign up for Resend/SendGrid, get an API key, and start sending emails. The emails work in development (Resend's sandbox delivers to verified addresses) but fail silently in production because DNS records are not configured. SPF tells receiving servers "Resend is authorized to send on behalf of betterr.me." Without it, the email fails authentication and goes to spam or is rejected.

**How to avoid:**
1. **Configure DNS records BEFORE writing any email code:**
   - SPF: `v=spf1 include:resend.com ~all` (or SendGrid equivalent)
   - DKIM: Add the TXT record provided by Resend/SendGrid
   - DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@betterr.me` (start with `p=none` to monitor)
2. **Verify the sending domain** in Resend/SendGrid dashboard. Do not send from an unverified domain.
3. **Use descriptive, personalized subject lines:** "Reminder: Team meeting in 15 minutes" not "BetterR.Me Notification."
4. **Include an unsubscribe link** in every email (required by CAN-SPAM and Gmail's February 2024 requirements). Use the `List-Unsubscribe` header for one-click unsubscribe.
5. **Send a test email to Gmail, Outlook, and Yahoo** before going live. Check that the email lands in Inbox, not Spam. Use `mail-tester.com` to score the email.
6. **Start with low volume.** New sending domains have no reputation. Sending 1000 emails on day one will trigger spam filters. Ramp up gradually.
7. **Consider push-only for MVP** and add email as a Phase 6+ enhancement. Push notifications have no deliverability issues and cover the primary use case (timely reminders).

**Warning signs:**
- No SPF/DKIM/DMARC DNS records for betterr.me
- Emails landing in spam during manual testing
- No `List-Unsubscribe` header in outgoing emails
- Email templates with no personalization (generic "You have a reminder")
- No monitoring for bounce/complaint rates

**Phase to address:**
Phase 5 (Notification Infrastructure) for email implementation. DNS configuration must happen before the first production email is sent. Consider making email delivery a separate sub-phase after push is working.

---

## High-Risk Integration Pitfalls

### Pitfall 6: Calendar Rendering Performance with Aggregated Multi-Domain Data

**What goes wrong:**
The unified feed API (`/api/calendar/feed`) queries 5 domain DB classes in parallel (events, tasks, habits, bills, workouts) and merges results. For a Month view, this means querying ~30 days of data across 5 tables. A user with 10 daily habits, 20 tasks with due dates, 5 recurring bills, and 10 calendar events generates 300+ habit items + 20 tasks + 5 bills + 10 events = 335+ items for one month. Each domain also needs to expand recurring items (habits via `shouldTrackOnDate()`, recurring tasks via `getOccurrencesInRange()`, recurring events via the same).

The rendering side is equally dangerous: 335+ items rendered on a Month view grid means potentially 50+ React components per day cell, with 30-42 visible day cells. If each item is a full React component with hover states, click handlers, and tooltips, that is 1500+ mounted components.

**Why it happens:**
Each domain works fine in isolation. The habits page renders 10 habits. The tasks page renders 20 tasks. But the calendar aggregates ALL domains onto one view. Developers test with small data sets (3 habits, 2 tasks) and do not see the performance cliff that occurs with realistic data volumes.

**How to avoid:**
1. **Virtualize the time grid.** Only render items for visible day cells. For Month view, only render the "+N more" overflow chip when a day has > 3 items, not all 15 items hidden behind it.
2. **The feed API should accept a `sources` query param** to filter by domain. When a user toggles off "Habits" in the sidebar, the API should not query the habits table at all -- not query it and filter client-side.
3. **Expand recurring items on the server, not the client.** The `getOccurrencesInRange()` function should run in the API route, returning pre-expanded dates. Do not send recurrence rules to the client and expand there.
4. **For habits, use a batch query** instead of calling `shouldTrackOnDate()` per habit per day. Query all active habits once, then expand their schedules for the date range using existing frequency logic.
5. **SWR key should include the visible date range** (as the design spec already specifies). When switching from Month to Week view, the SWR key changes and a smaller dataset is fetched. Use `keepPreviousData: true` for smooth transitions (matching existing SWR pattern).
6. **Cap the API response** at a reasonable limit (e.g., 500 items per request). If exceeded, return a `truncated: true` flag and let the UI show a warning.
7. **Memoize calendar item components** with `React.memo` keyed on `id + source + is_completed/is_logged`. Prevent re-renders when navigating between views.

**Warning signs:**
- Feed API response > 500 items for a single month
- Visible jank when switching between Month/Week/Day views
- Feed API latency > 500ms for a single month query
- All 5 domain queries running even when a domain layer is toggled off
- Recurring expansion happening on the client

**Phase to address:**
Phase 2 (Calendar UI) for rendering performance. Phase 4 (Aggregation) for API query optimization. Performance testing should be part of each phase's verification with realistic data volumes.

---

### Pitfall 7: Recurring Event Expansion -- Infinite Series and Exception Handling

**What goes wrong:**
The design spec reuses the existing `RecurrenceRule` type and `getOccurrencesInRange()` function from recurring tasks. This function is designed for bounded date ranges and works correctly. However, calendar events introduce two new complexities that recurring tasks do not have:

1. **Exception handling (`is_exception` + `recurring_event_id` + `original_date`):** When a user edits "this occurrence only," an exception record is created. The expansion logic must exclude the original occurrence date from the parent's expansion AND include the exception record. The existing `getOccurrencesInRange()` has no concept of exceptions -- it simply expands the rule. Adding exception filtering requires post-processing the expansion results.

2. **"Edit all future events" creates a chain split:** User changes recurrence from weekly to daily starting from April 15. The parent rule must have its `end_date_recurrence` set to April 14, and a new event with a daily rule starting April 15 must be created. If this split is not handled atomically, the user sees duplicate events or a gap.

**Why it happens:**
Recurring tasks in BetterR.Me do not have "edit this occurrence" or "edit all future" -- they are simpler. The RecurrenceRule expansion works for the simpler case. Calendar events import the Google Calendar / Outlook model of occurrence editing, which is significantly more complex. Developers will reuse `getOccurrencesInRange()` without adding exception filtering and get duplicate events (both the parent's expanded occurrence AND the exception record for the same date).

**How to avoid:**
1. **Create a wrapper function** `expandCalendarEventsInRange(parentEvents, exceptions, rangeStart, rangeEnd)` that:
   - Expands each parent event using `getOccurrencesInRange()`
   - Removes dates that have a matching exception record (by `recurring_event_id` + `original_date`)
   - Adds the exception records at their actual dates
   - Returns the merged, deduplicated list
2. **"Edit all future events" must be a database transaction:** UPDATE parent's `end_date_recurrence`, INSERT new event with new rule, all in one request. The API route should use Supabase's `.rpc()` for a server-side function or at minimum ensure both operations succeed/fail together.
3. **"Delete this occurrence" should create a tombstone exception** (an exception record with no title/times, marked as deleted) rather than trying to add the date to an exclusion list on the parent. This is the pattern Google Calendar uses and it scales better.
4. **Test the expansion with edge cases:**
   - Exception on the first occurrence of a series
   - Exception on the last occurrence before `end_date_recurrence`
   - Multiple exceptions in the same week
   - "Edit all future" in the middle of a long series
   - Deleting a single occurrence, then editing "all events" (do deleted exceptions get resurrected?)
5. **The existing recurrence.ts tests should be extended,** not replaced. Add a new test file for the calendar-specific expansion wrapper.

**Warning signs:**
- Direct calls to `getOccurrencesInRange()` without exception filtering in calendar code
- "Edit this occurrence" creating an exception but the parent still generating that date
- No transaction/atomicity for "edit all future events" split
- Recurring event tests that do not include any exception scenarios
- Duplicate events appearing on the calendar for edited occurrences

**Phase to address:**
Phase 3 (Event CRUD) -- recurring event management must handle exceptions from the start. Do not defer exception handling to a later phase; it is core to the recurring event feature.

---

### Pitfall 8: SWR Cache Coherence When Multiple Domains Feed the Calendar

**What goes wrong:**
The calendar feed aggregates data from tasks, habits, bills, workouts, and events. Each domain also has its own SWR cache (e.g., `useWorkouts()`, `useBills()`, the task kanban board). When a user completes a task on the Tasks page, the tasks SWR cache is updated, but the calendar feed SWR cache still shows the task as incomplete. The user navigates to the calendar and sees stale data until the feed cache revalidates.

Worse: inline mutations on the calendar (e.g., toggling a habit checkbox) must update BOTH the calendar feed cache AND the habits domain cache. If only one is updated, the user sees inconsistent state depending on which page they visit next.

**Why it happens:**
SWR caches are keyed by URL. `/api/calendar/feed?start=...&end=...` and `/api/habits` are different cache entries with independent lifecycle. The existing BetterR.Me codebase uses SWR `mutate()` to update domain-specific caches after mutations, but there is no mechanism to also invalidate the calendar feed cache. The calendar feed is a new cross-cutting concern that did not exist before.

**How to avoid:**
1. **After any domain mutation, also call `mutate()` on the calendar feed key.** Create a `useCalendarMutate()` hook that exposes `invalidateCalendarFeed()`. Domain mutation hooks (task complete, habit toggle, bill paid) must call this after their primary mutation.
2. **Use SWR's `mutate(key => ...)` pattern** (global mutate with key filter) to invalidate all calendar feed keys regardless of the date range. This handles the case where the calendar is viewing a different date range than what was mutated.
3. **For inline calendar mutations** (toggle habit, complete task), optimistically update the calendar feed cache locally, then call the domain API, then revalidate both caches. The pattern:
   ```
   mutate(calendarFeedKey, optimisticData, false)  // optimistic update
   await fetch('/api/habits/[id]/toggle', ...)      // actual mutation
   mutate(calendarFeedKey)                           // revalidate feed
   mutate(habitsKey)                                 // revalidate domain
   ```
4. **Consider a lightweight event bus** (a simple React context with a `Set<() => void>` of revalidation callbacks) that domain hooks register with. When ANY domain mutates, the event bus fires and all registered caches revalidate. This is simpler than manually wiring every mutation to every cache.
5. **Test cross-page cache coherence:** Complete a task on the Tasks page, navigate to Calendar, verify it shows as complete WITHOUT a manual refresh.

**Warning signs:**
- Calendar showing stale data after mutations on other pages
- Inline calendar mutations not updating the source domain's cache
- Only the calendar feed being mutated, not the domain cache (or vice versa)
- `useSWR` calls for calendar feed without `revalidateOnFocus: true` (default is true, but if set to false for performance, stale data persists longer)
- No global mutate usage -- only key-specific mutate

**Phase to address:**
Phase 4 (Aggregation) -- when building inline interactions. The cache coherence strategy must be designed before implementing inline toggles. Phase 2 (Calendar UI) should establish the SWR key pattern and the `useCalendarMutate()` hook.

---

## Moderate-Risk Pitfalls

### Pitfall 9: Permissions-Policy Header Blocks Notification API

**What goes wrong:**
The existing `next.config.ts` sets `Permissions-Policy: camera=(), microphone=(), geolocation=()`. This is a security hardening header that disables unused browser APIs. If `notifications=()` is added to this policy (by a developer following the pattern of "disable everything unused"), the Notification API and Push API will be blocked by the browser. The permission prompt will never appear, and `Notification.requestPermission()` will silently return `'denied'`.

**Why it happens:**
The existing pattern in `next.config.ts` is to disable unused browser APIs for security. A developer adding `notifications=()` or `push=()` to the list would be following the existing convention but breaking the notification feature. This is particularly insidious because `Permissions-Policy` violations are silent -- no console error, no exception, just a permanently denied permission.

**How to avoid:**
1. **Do NOT add `notifications` or `push` to the Permissions-Policy header.** The current header already does not block them (they are not listed), so no change is needed.
2. **Add a comment in `next.config.ts`** above the Permissions-Policy header: `// NOTE: Do not add 'notifications' or 'push' -- required for reminder notifications (v6.0)`
3. **Add a startup check** (in the settings/notification preferences component) that verifies `'Notification' in window` before showing the enable button.

**Warning signs:**
- `Notification.requestPermission()` returning `'denied'` immediately without showing a prompt
- Permissions-Policy header containing `notifications=()` or `push=()`
- Push subscription failing silently

**Phase to address:**
Phase 5 (Notification Infrastructure) -- verify during implementation that the existing headers do not conflict.

---

### Pitfall 10: Existing `getLocalDateString()` Convention vs Calendar Time-Slot Precision

**What goes wrong:**
The entire BetterR.Me codebase uses `getLocalDateString()` (returns `YYYY-MM-DD`) for all date handling. The calendar introduces TIME-based operations: clicking a 2:30 PM time slot, dragging from 2:00 to 3:30 PM, displaying events at specific hours. The existing date utility has no time handling. Developers will either (a) use `new Date()` methods (reintroducing the timezone bugs that `getLocalDateString()` was created to avoid) or (b) try to extend `getLocalDateString()` in ways that break existing callers.

**Why it happens:**
The codebase has a strong convention: all dates flow through `getLocalDateString()`. Calendar time slots require both date AND time in the user's local timezone. There is no existing utility for "get the user's current local time as HH:MM" or "combine a date string with a time string into a display timestamp." Developers will reach for `date-fns` or raw `Date` methods without considering the timezone implications.

**How to avoid:**
1. **Add new time utilities alongside `getLocalDateString()`, do not modify it.** Create `getLocalTimeString()` returning `HH:MM` and `combineDateAndTime(date: string, time: string)` returning a display-ready string.
2. **All new time utilities must use the same local-timezone principle:** `Intl.DateTimeFormat` with the user's locale and timezone, or manual `getHours()`/`getMinutes()` (which are already local).
3. **For the time grid, use CSS `grid-template-rows` with fixed heights** rather than computing pixel positions from timestamps. This avoids Date math for layout entirely.
4. **Date-fns is already in the codebase** (optimized imports in next.config.ts). Use it for time formatting (`format(date, 'HH:mm')`) but always pass Date objects constructed from local components, not from ISO strings.
5. **Never use `new Date('2026-04-01T14:30:00')` without a timezone suffix.** In some browsers, this is parsed as UTC; in others, as local time. Always use `new Date(2026, 3, 1, 14, 30)` (component constructor is always local) or `date-fns/parse`.

**Warning signs:**
- `new Date(isoString)` without explicit timezone handling in calendar code
- `getLocalDateString()` being modified to also return time
- Time display showing wrong hour (off by timezone offset)
- Time grid slots not aligning with event blocks

**Phase to address:**
Phase 2 (Calendar UI) -- time utilities must be established before building the time grid.

---

### Pitfall 11: `fire_at` Not Recomputed When Events Are Rescheduled

**What goes wrong:**
The design spec mentions: "When an event's start time changes, all associated pending reminders must have their fire_at recalculated." In practice, this recomputation is forgotten in at least one of these code paths:
- Drag-and-drop rescheduling (future feature, but the API should already handle it)
- "Edit all future events" (changes start_time on the parent, all future reminders need recomputation)
- Recurring event exception editing (the exception has different times, its reminders need independent fire_at)
- Timezone change in user profile (all pending reminders shift)

**Why it happens:**
The `CalendarEventsDB.update()` method is the obvious place for recomputation, but not all reschedule paths go through it. Batch operations, recurring event splits, and profile updates are separate code paths that also affect reminder timing.

**How to avoid:**
1. **Create a `recomputeFireAt(sourceId: string, sourceType: string)` function** in the reminders DB class. This queries all `pending` reminders for the source, recomputes `fire_at` based on the current event/task time, and updates in batch.
2. **Call `recomputeFireAt()` in EVERY code path that changes an event's time:** single event update, recurring event exception, "edit all future," and profile timezone change.
3. **Write a test that creates an event with a reminder, updates the event time, and verifies `fire_at` changed.** This test catches regressions when new reschedule paths are added.
4. **For "edit all future events," recompute fire_at for all reminders on the new child event** (which inherits the parent's reminders for future occurrences).

**Warning signs:**
- Reminders firing at the old time after an event is rescheduled
- `recomputeFireAt()` only called in one code path
- No test for fire_at recomputation after event update
- Timezone change not triggering reminder recomputation

**Phase to address:**
Phase 3 (Event CRUD) for event-level recomputation. Phase 5 (Notification Infrastructure) for the general `recomputeFireAt()` utility. Phase 6 (Reminder Preferences) for timezone-change recomputation.

---

### Pitfall 12: Keyboard Shortcuts Conflicting with Existing App and Form Inputs

**What goes wrong:**
The design spec defines keyboard shortcuts (D, W, M, T, N, C, /, arrows). These are single-key shortcuts without modifiers. When the user is typing in a form field (event title, search box, description textarea), pressing "D" should type the letter "d," not switch to Day view. If shortcuts are registered globally without checking `document.activeElement`, they will hijack text input.

Additionally, the existing BetterR.Me app may already have keyboard listeners (the kanban board, task quick-add, etc.) that could conflict.

**Why it happens:**
Keyboard shortcuts are typically registered as `document.addEventListener('keydown', ...)`. Without filtering by active element, every keypress triggers the handler regardless of context. This is the most common keyboard shortcut bug in web apps.

**How to avoid:**
1. **Check `activeElement` before processing shortcuts.** If the active element is an `<input>`, `<textarea>`, or element with `contentEditable`, ignore the shortcut.
2. **Scope shortcuts to the calendar page only.** Use a `useEffect` that adds/removes the listener when the calendar component mounts/unmounts. Do not register global shortcuts.
3. **Use a hook like `useCalendarShortcuts()` with a `disabled` flag** that is set when any dialog/popover is open.
4. **Test: open the event creation dialog, type "D" in the title field, verify it types "D" and does not switch to Day view.**

**Warning signs:**
- Typing in a form field triggers view switches
- Shortcuts firing when a dialog is open
- Shortcuts working on non-calendar pages

**Phase to address:**
Phase 2 (Calendar UI) -- keyboard shortcuts should be implemented with input filtering from the start.

---

## Summary: Phase-by-Phase Pitfall Map

| Phase | Pitfalls to Address |
|---|---|
| Phase 1 (DB Schema) | #3 (timezone column on profiles), #7 (exception schema design) |
| Phase 2 (Calendar UI) | #6 (rendering performance), #8 (SWR key pattern), #10 (time utilities), #12 (keyboard shortcuts) |
| Phase 3 (Event CRUD) | #7 (recurring expansion + exceptions), #11 (fire_at recomputation) |
| Phase 4 (Aggregation) | #6 (API query optimization), #8 (cross-domain cache coherence) |
| Phase 5 (Notification Infrastructure) | #1 (service worker), #2 (permission UX), #3 (fire_at timezone computation), #4 (cron reliability), #5 (email deliverability), #9 (Permissions-Policy header) |
| Phase 6 (Reminder Preferences) | #11 (timezone-change recomputation) |
