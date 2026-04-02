# Phase 34: Push Notification Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

Web Push API integration with service worker registration, VAPID key configuration, subscription management API, browser permission flow with in-app explainer, and notification settings UI. This phase delivers the infrastructure for sending push notifications — the actual reminder dispatch (cron job) and reminder CRUD are in later phases (36/37). No email notifications — that's Phase 35.

</domain>

<decisions>
## Implementation Decisions

### Permission UX Flow (PUSH-01)
- **D-01:** Push notification toggle lives in a new "Notifications" section of the existing settings page (`app/dashboard/settings`). The toggle triggers `Notification.requestPermission()` on enable.
- **D-02:** Before the browser permission prompt, show an inline explainer within the settings card: what notifications they'll receive (reminders for events, tasks, habits, bills) and that they can disable anytime. No modal — keep it lightweight.
- **D-03:** If permission is denied at browser level, the toggle shows a disabled state with text explaining they need to re-enable in browser settings.

### Service Worker & Subscription (PUSH-02, PUSH-04)
- **D-04:** `public/sw.js` already exists with push and notificationclick handlers. This phase registers it from a client-side hook (`hooks/use-push-notifications.ts`) when the user enables push.
- **D-05:** After service worker registration, use `pushManager.subscribe()` with the VAPID public key to create a Web Push subscription. Extract `endpoint`, `p256dh`, and `auth` keys and send to the subscribe API.
- **D-06:** Subscription stored via `PushSubscriptionsDB.upsertSubscription()` (already exists). Per-device: the endpoint uniquely identifies the browser/device.

### Subscription API (PUSH-04)
- **D-07:** Separate API routes: `POST /api/push/subscribe` (register/update subscription) and `POST /api/push/unsubscribe` (remove subscription). Follows design spec route plan.
- **D-08:** Subscribe route accepts `{ endpoint, p256dh, auth, user_agent }` body. Uses `PushSubscriptionsDB.upsertSubscription()`.
- **D-09:** Unsubscribe route accepts `{ endpoint }` body. Uses `PushSubscriptionsDB.deleteSubscription()`.
- **D-10:** Both routes follow established pattern: `createClient()` → `getUser()` → auth check → DB operation.

### VAPID Keys (PUSH-05)
- **D-11:** VAPID keys stored as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (exposed to client for subscription) and `VAPID_PRIVATE_KEY` (server-only for sending). Generated once during setup.
- **D-12:** Add a `lib/push/vapid.ts` utility that exports the VAPID config for use by the subscribe hook (public key) and future send logic (private key).

### Notification Click Navigation (PUSH-03)
- **D-13:** `public/sw.js` already handles `notificationclick` by reading `data.url` from the notification payload. The URL is set at send time (Phase 36/37).
- **D-14:** URL map by source type: events → `/calendar?date=YYYY-MM-DD`, tasks → `/tasks`, habits → `/habits`, bills → `/money/bills`. This mapping lives in a shared utility so both the send logic and service worker can reference consistent paths.

### Settings Integration
- **D-15:** Add a `NotificationSettings` component to the existing settings page. Shows: push notification toggle, current subscription status (subscribed on N devices), and a "Test notification" button for verification.
- **D-16:** Settings component uses the `use-push-notifications` hook for all push lifecycle management (register, subscribe, unsubscribe, permission state).

### i18n
- **D-17:** All notification settings strings added to all 3 locale files (en, zh, zh-TW).

### Claude's Discretion
- Internal structure of the `use-push-notifications` hook (state management approach)
- Whether to add `user_agent` detection for device labeling in subscriptions
- Test notification payload format and behavior

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Full design spec. "Notification System" section (lines ~244-284) defines push setup flow, service worker behavior, VAPID config, and delivery pipeline.

### Existing Infrastructure (already built)
- `public/sw.js` — Service worker with push and notificationclick handlers (complete, do not modify)
- `lib/db/push-subscriptions.ts` — `PushSubscriptionsDB` class with upsert/delete/getAll operations
- `lib/db/types.ts` — `PushSubscription` and `PushSubscriptionInsert` type definitions
- `tests/lib/db/push-subscriptions.test.ts` — Existing DB class tests
- `lib/validations/reminders.ts` — Zod schemas for reminders (reference for validation patterns)
- `next.config.ts` — Already serves `/sw.js` with Service-Worker-Allowed header

### Existing Patterns (API routes)
- `app/api/habits/route.ts` — Reference pattern for API route structure
- `app/api/calendar/feed/route.ts` — Recent API route example

### Settings Page
- `app/dashboard/settings/page.tsx` — Server component shell for settings
- `components/settings/settings-content.tsx` — Client component with settings UI

### Database
- `supabase/migrations/20260331000001_create_calendar_events.sql` — Contains `push_subscriptions` table definition with RLS policies

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PushSubscriptionsDB` class: Full CRUD for push subscriptions — upsert, delete, getAll per user
- `public/sw.js`: Service worker already handles push display and notification click navigation
- `next.config.ts`: Already configured to serve sw.js with correct headers
- `lib/validations/reminders.ts`: Zod validation pattern to follow for push subscription validation

### Established Patterns
- API routes: `createClient()` → `getUser()` → auth check → instantiate DB → operate → return JSON
- Client hooks: Custom hooks in `hooks/` directory for domain-specific logic
- Settings: `SettingsContent` component in `components/settings/` with profile data
- SWR: Client-side data fetching with cache keys from `lib/cache.ts`

### Integration Points
- Settings page (`components/settings/settings-content.tsx`): Add notification section
- API routes directory (`app/api/`): Add `push/subscribe/route.ts` and `push/unsubscribe/route.ts`
- Hooks directory (`hooks/`): Add `use-push-notifications.ts`
- Lib directory (`lib/push/`): Add VAPID config utility
- Environment variables: Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The design spec is comprehensive and all infrastructure pieces (DB, service worker, types) are already in place from Phase 29.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-push-notification-infrastructure*
*Context gathered: 2026-04-02*
