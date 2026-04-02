# Phase 34: Push Notification Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** Web Push API, Service Worker registration, VAPID authentication
**Confidence:** HIGH

## Summary

Phase 34 wires up the client-side and API-side push notification infrastructure. The heavy lifting is already done: `public/sw.js` handles push display and notification clicks, `PushSubscriptionsDB` provides full CRUD, the `push_subscriptions` table exists with RLS policies, and `next.config.ts` serves the service worker with correct headers.

What remains is: (1) a client-side hook (`use-push-notifications.ts`) that manages the permission flow, service worker registration, and subscription lifecycle; (2) two API routes (`/api/push/subscribe` and `/api/push/unsubscribe`) following the project's established pattern; (3) a VAPID config utility (`lib/push/vapid.ts`); (4) a `NotificationSettings` component integrated into the existing settings page; and (5) i18n strings in all three locales.

**Primary recommendation:** Install `web-push` (v3.6.7) for VAPID key generation and future send functionality. Build the `use-push-notifications` hook as the single source of truth for permission state, subscription status, and registration lifecycle. Keep the settings UI simple -- toggle + explainer + test button.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Push notification toggle lives in a new "Notifications" section of the existing settings page (`app/dashboard/settings`). The toggle triggers `Notification.requestPermission()` on enable.
- **D-02:** Before the browser permission prompt, show an inline explainer within the settings card: what notifications they'll receive (reminders for events, tasks, habits, bills) and that they can disable anytime. No modal -- keep it lightweight.
- **D-03:** If permission is denied at browser level, the toggle shows a disabled state with text explaining they need to re-enable in browser settings.
- **D-04:** `public/sw.js` already exists with push and notificationclick handlers. This phase registers it from a client-side hook (`hooks/use-push-notifications.ts`) when the user enables push.
- **D-05:** After service worker registration, use `pushManager.subscribe()` with the VAPID public key to create a Web Push subscription. Extract `endpoint`, `p256dh`, and `auth` keys and send to the subscribe API.
- **D-06:** Subscription stored via `PushSubscriptionsDB.upsertSubscription()` (already exists). Per-device: the endpoint uniquely identifies the browser/device.
- **D-07:** Separate API routes: `POST /api/push/subscribe` (register/update subscription) and `POST /api/push/unsubscribe` (remove subscription).
- **D-08:** Subscribe route accepts `{ endpoint, p256dh, auth, user_agent }` body. Uses `PushSubscriptionsDB.upsertSubscription()`.
- **D-09:** Unsubscribe route accepts `{ endpoint }` body. Uses `PushSubscriptionsDB.deleteSubscription()`.
- **D-10:** Both routes follow established pattern: `createClient()` -> `getUser()` -> auth check -> DB operation.
- **D-11:** VAPID keys stored as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (exposed to client for subscription) and `VAPID_PRIVATE_KEY` (server-only for sending). Generated once during setup.
- **D-12:** Add a `lib/push/vapid.ts` utility that exports the VAPID config for use by the subscribe hook (public key) and future send logic (private key).
- **D-13:** `public/sw.js` already handles `notificationclick` by reading `data.url` from the notification payload. The URL is set at send time (Phase 36/37).
- **D-14:** URL map by source type: events -> `/calendar?date=YYYY-MM-DD`, tasks -> `/tasks`, habits -> `/habits`, bills -> `/money/bills`. This mapping lives in a shared utility.
- **D-15:** Add a `NotificationSettings` component to the existing settings page. Shows: push notification toggle, current subscription status (subscribed on N devices), and a "Test notification" button for verification.
- **D-16:** Settings component uses the `use-push-notifications` hook for all push lifecycle management.
- **D-17:** All notification settings strings added to all 3 locale files (en, zh, zh-TW).

### Claude's Discretion
- Internal structure of the `use-push-notifications` hook (state management approach)
- Whether to add `user_agent` detection for device labeling in subscriptions
- Test notification payload format and behavior

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | User can enable push notifications from settings with browser permission flow | Hook manages `Notification.requestPermission()`, settings UI with toggle + explainer (D-01, D-02, D-03, D-15) |
| PUSH-02 | Service worker handles push events and displays native browser notifications | `sw.js` already complete (D-04); hook registers it via `navigator.serviceWorker.register('/sw.js')` |
| PUSH-03 | Clicking a push notification navigates to the relevant item | `sw.js` already handles `notificationclick` with `data.url` (D-13); shared URL map utility (D-14) |
| PUSH-04 | Push subscriptions stored per-device in push_subscriptions table | API routes use `PushSubscriptionsDB` (D-06, D-07, D-08, D-09); Zod validation at boundaries |
| PUSH-05 | VAPID keys stored as environment variables, generated once during setup | `web-push` generateVAPIDKeys (D-11, D-12); `lib/push/vapid.ts` utility |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Testing:** ALWAYS add tests when creating a PR. Vitest + Testing Library + vitest-axe.
- **i18n:** All new strings must be added to all three locale files (en, zh, zh-TW).
- **API pattern:** `createClient()` -> `getUser()` -> auth check -> DB operation -> NextResponse.json.
- **Validation:** Zod schemas at API boundaries (`lib/validations/`).
- **Files:** kebab-case. Components: PascalCase. DB classes: PascalCase + DB suffix.
- **Path alias:** `@/` maps to project root.
- **Client components:** `"use client"` only when needed.
- **Lint:** Run lint and fix lint errors after code changes.
- **Git:** Create feature branch, open PR. Never push directly to main.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| web-push | 3.6.7 | VAPID key generation, push notification sending (server-side) | De facto Node.js library for Web Push protocol; handles VAPID auth and message encryption |
| Web Push API (browser) | Built-in | Client-side subscription via `PushManager.subscribe()` | W3C standard, supported in all modern browsers |
| Service Worker API (browser) | Built-in | Register SW, manage push subscription lifecycle | W3C standard, required for Web Push |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | (already installed) | Validate subscribe/unsubscribe request bodies | API route validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| web-push | Manual VAPID/encryption implementation | web-push handles all encryption, VAPID signing, and protocol details -- no reason to hand-roll |

**Installation:**
```bash
pnpm add web-push
pnpm add -D @types/web-push
```

**Version verification:** `web-push` latest is 3.6.7 (verified via `npm view web-push version`). Node.js 24.13.0 is installed and compatible.

## Architecture Patterns

### Recommended Project Structure
```
hooks/
  use-push-notifications.ts     # Client hook: permission, registration, subscribe/unsubscribe
lib/push/
  vapid.ts                      # VAPID config (public key for client, private key for server)
  notification-urls.ts          # Shared URL map by source type (D-14)
lib/validations/
  push.ts                       # Zod schemas for subscribe/unsubscribe
app/api/push/
  subscribe/route.ts            # POST: register/update push subscription
  unsubscribe/route.ts          # POST: remove push subscription
components/settings/
  notification-settings.tsx     # Push notification toggle, status, test button
i18n/messages/
  en.json                       # settings.notifications.* keys
  zh.json
  zh-TW.json
```

### Pattern 1: use-push-notifications Hook
**What:** Custom React hook encapsulating the entire push notification lifecycle.
**When to use:** Any component that needs push notification controls.
**Key states:**
- `permission`: `'default' | 'granted' | 'denied'` -- mirrors `Notification.permission`
- `isSubscribed`: boolean -- whether current browser has an active subscription
- `isLoading`: boolean -- for async operations
- `subscribe()`: requests permission -> registers SW -> creates subscription -> POSTs to API
- `unsubscribe()`: removes subscription from push manager -> POSTs to API
- `sendTestNotification()`: triggers a test push via API or local SW showNotification

**Example:**
```typescript
// hooks/use-push-notifications.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface UsePushNotificationsReturn {
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTest: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: check current permission and existing subscription
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setIsLoading(false);
      return;
    }
    setPermission(Notification.permission);
    checkExistingSubscription().then((sub) => {
      setIsSubscribed(!!sub);
      setIsLoading(false);
    });
  }, []);

  // ... subscribe, unsubscribe, sendTest implementations
}

async function checkExistingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}
```

### Pattern 2: API Route (subscribe)
**What:** POST route following established project pattern.
**Example:**
```typescript
// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { validateRequestBody } from "@/lib/validations/api";
import { pushSubscribeSchema } from "@/lib/validations/push";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, pushSubscribeSchema);
    if (!validation.success) return validation.response;

    const db = new PushSubscriptionsDB(supabase);
    const subscription = await db.upsertSubscription(user.id, {
      endpoint: validation.data.endpoint,
      p256dh: validation.data.p256dh,
      auth: validation.data.auth,
      user_agent: validation.data.user_agent ?? null,
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    log.error("POST /api/push/subscribe error", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
```

### Pattern 3: VAPID Configuration
**What:** Centralized VAPID config utility.
**Example:**
```typescript
// lib/push/vapid.ts

/** Public key for client-side PushManager.subscribe() */
export function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
  return key;
}

/** Server-only: full VAPID details for web-push sendNotification */
export function getVapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  return {
    subject: "mailto:notifications@betterr.me",
    publicKey,
    privateKey,
  };
}
```

### Pattern 4: Converting VAPID Key for PushManager
**What:** The VAPID public key must be converted from URL-safe base64 to a Uint8Array for `pushManager.subscribe()`.
**Example:**
```typescript
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Usage in subscribe flow:
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
});
```

### Pattern 5: Notification URL Map
**What:** Shared mapping from source type to navigation URL (D-14).
**Example:**
```typescript
// lib/push/notification-urls.ts
export function getNotificationUrl(
  sourceType: "calendar_event" | "task" | "habit" | "bill",
  context?: { date?: string }
): string {
  switch (sourceType) {
    case "calendar_event":
      return context?.date ? `/calendar?date=${context.date}` : "/calendar";
    case "task":
      return "/tasks";
    case "habit":
      return "/habits";
    case "bill":
      return "/money/bills";
    default:
      return "/dashboard";
  }
}
```

### Anti-Patterns to Avoid
- **Registering SW on every page load:** Only register when user explicitly enables push (not on app init). Avoids unnecessary permission prompts and SW overhead.
- **Storing VAPID private key in client code:** `VAPID_PRIVATE_KEY` must NEVER have the `NEXT_PUBLIC_` prefix. Only `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is exposed to the browser.
- **Not checking `navigator.serviceWorker` / `Notification` availability:** These APIs are not available in SSR, some browsers, or incognito mode. Always guard with feature detection.
- **Using the browser's native `PushSubscription` type name:** The project already has a `PushSubscription` interface in `lib/db/types.ts`. Avoid name collisions by using the full browser type (`globalThis.PushSubscription`) or aliasing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID key generation | Custom EC key generation | `web-push.generateVAPIDKeys()` | Handles URL-safe base64 encoding, correct curve params |
| Push message encryption | Manual aesgcm/aes128gcm encryption | `web-push.sendNotification()` | Complex crypto, multiple encoding standards |
| Base64 URL to Uint8Array conversion | Custom decoder | `urlBase64ToUint8Array()` utility function | Standard pattern, well-tested, needed for `applicationServerKey` |

**Key insight:** The Web Push protocol involves multiple encryption layers and authentication steps. The `web-push` library abstracts all of this. The only custom code needed is the client-side hook, API routes, and UI.

## Common Pitfalls

### Pitfall 1: VAPID Key Format Mismatch
**What goes wrong:** `pushManager.subscribe()` fails with `InvalidAccessError` or `DOMException`.
**Why it happens:** The browser expects `applicationServerKey` as a `Uint8Array`, but `web-push.generateVAPIDKeys()` produces URL-safe base64 strings.
**How to avoid:** Always convert with `urlBase64ToUint8Array()` before passing to `pushManager.subscribe()`.
**Warning signs:** `DOMException: Failed to execute 'subscribe' on 'PushManager'`.

### Pitfall 2: Service Worker Scope Issues
**What goes wrong:** SW registration succeeds but `pushManager` is null or subscription fails.
**Why it happens:** SW scope doesn't match the page origin, or SW file isn't served with correct headers.
**How to avoid:** `next.config.ts` already serves `/sw.js` with `Service-Worker-Allowed: /` and `Cache-Control: no-cache`. Register with explicit scope: `navigator.serviceWorker.register('/sw.js', { scope: '/' })`.
**Warning signs:** `pushManager` is undefined on the registration object.

### Pitfall 3: Permission State Desync
**What goes wrong:** UI shows "enabled" but browser permission is actually denied (or vice versa).
**Why it happens:** User changes browser notification permissions outside of the app, or clears site data.
**How to avoid:** Always read `Notification.permission` on component mount and before subscribe attempts. Check `pushManager.getSubscription()` to verify actual subscription state rather than relying solely on local state.
**Warning signs:** Toggle shows "on" but no notifications arrive.

### Pitfall 4: SSR Crashes from Browser APIs
**What goes wrong:** `ReferenceError: navigator is not defined` during server-side rendering.
**Why it happens:** `navigator`, `Notification`, and `window` don't exist in Node.js.
**How to avoid:** Guard all browser API access with `typeof window !== "undefined"` or use only inside `useEffect`. The hook should return safe defaults during SSR.
**Warning signs:** Build errors or hydration mismatches.

### Pitfall 5: Subscription Expiry / Invalid Endpoints
**What goes wrong:** Sending to a stale subscription returns 404/410 from the push service.
**Why it happens:** User clears browser data, uninstalls browser, or push service rotates endpoints.
**How to avoid:** When sending (Phase 36/37), handle 404/410 by deleting the stale subscription from DB. For this phase, ensure `upsertSubscription` uses the endpoint as the uniqueness key (already implemented via `onConflict: 'user_id,endpoint'`).
**Warning signs:** `WebPushError` with status 404 or 410.

### Pitfall 6: PushSubscription Type Name Collision
**What goes wrong:** TypeScript confusion between browser's `PushSubscription` and `lib/db/types.ts` `PushSubscription`.
**Why it happens:** Both types exist in the same compilation context.
**How to avoid:** Import the DB type explicitly: `import type { PushSubscription as DBPushSubscription } from '@/lib/db/types'`. Or reference the browser type as the return of `pushManager.getSubscription()` without importing it.
**Warning signs:** Type errors when passing subscription data between client and API.

## Code Examples

### VAPID Key Generation (one-time setup)
```bash
# Run once to generate keys, then add to .env.local
node -e "const wp = require('web-push'); const keys = wp.generateVAPIDKeys(); console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey); console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);"
```

### Zod Validation Schemas
```typescript
// lib/validations/push.ts
import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
  p256dh: z.string().min(1, "p256dh is required"),
  auth: z.string().min(1, "auth is required"),
  user_agent: z.string().nullable().optional(),
});

export type PushSubscribeValues = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
});

export type PushUnsubscribeValues = z.infer<typeof pushUnsubscribeSchema>;
```

### Test Notification (local, no server round-trip)
```typescript
// Inside use-push-notifications hook
async function sendTest(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  await reg.showNotification("BetterR.Me", {
    body: "Push notifications are working!",
    icon: "/icon-192.png",
    data: { url: "/dashboard/settings" },
  });
}
```

### Extracting Keys from Browser PushSubscription
```typescript
// After pushManager.subscribe() returns a PushSubscription
function extractSubscriptionKeys(sub: globalThis.PushSubscription) {
  const key = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  return {
    endpoint: sub.endpoint,
    p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : "",
    auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
  };
}
```

Note: `getKey()` returns `ArrayBuffer | null`. Convert to base64 for storage and API transmission.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GCM API Key required | VAPID-only (no GCM key needed) | Chrome 52+ (2016) | `setGCMAPIKey()` is no longer required for modern browsers |
| `aesgcm` content encoding | `aes128gcm` (default in web-push 3.x) | Web Push RFC 8291 | web-push handles encoding automatically |
| Manual SW registration on page load | Register only when push is enabled | Best practice | Avoids unnecessary permission prompts |

**Deprecated/outdated:**
- `GCMAPIKey`: Not needed with VAPID. `web-push.setGCMAPIKey()` is legacy.
- `aesgcm` encoding: Superseded by `aes128gcm`. web-push 3.x defaults to the modern encoding.

## Discretion Recommendations

### Hook State Management
**Recommendation:** Use `useState` + `useEffect` (not useReducer or external state). The state is simple (3 values: permission, isSubscribed, isLoading) and the hook is local to the settings page. No need for SWR or global state since push subscription status is only relevant in settings.

### User Agent Detection
**Recommendation:** Include `navigator.userAgent` when subscribing. It's zero-cost, already a column in the DB schema (`user_agent: string | null`), and enables the settings UI to show "Chrome on Windows" vs "Safari on iPhone" in the subscription list. Parse with a simple regex or leave raw -- the value is informational only.

### Test Notification Format
**Recommendation:** Use `ServiceWorkerRegistration.showNotification()` directly (no server round-trip needed). Payload: `{ title: "BetterR.Me", body: t("notifications.testBody"), icon: "/icon-192.png", data: { url: "/dashboard/settings" } }`. This verifies the full path: SW registration -> notification display -> click navigation.

## Open Questions

1. **VAPID mailto subject**
   - What we know: `web-push.setVapidDetails()` requires a `mailto:` or `https:` URI as the subject.
   - What's unclear: The exact email address to use (e.g., `mailto:notifications@betterr.me`).
   - Recommendation: Use a noreply or notifications address. Can be changed later without affecting subscriptions. Hardcode in `lib/push/vapid.ts` for now.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | web-push, API routes | Yes | 24.13.0 | -- |
| web-push (npm) | VAPID key generation, future sending | No (not installed) | 3.6.7 (latest) | Install: `pnpm add web-push` |
| Service Worker API | Push subscription | Yes (browser) | -- | Feature detection guard |
| Push API | Subscription management | Yes (browser) | -- | Feature detection guard |
| Notification API | Permission flow | Yes (browser) | -- | Feature detection guard |

**Missing dependencies with no fallback:**
- `web-push` npm package -- must be installed (used for VAPID key generation and future send)

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + Testing Library |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test:run --reporter=verbose` |
| Full suite command | `pnpm test:run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | Settings UI shows toggle, handles permission states | unit | `pnpm test:run tests/components/settings/notification-settings.test.tsx` | No -- Wave 0 |
| PUSH-02 | Hook registers SW and manages subscription | unit | `pnpm test:run tests/hooks/use-push-notifications.test.ts` | No -- Wave 0 |
| PUSH-03 | Notification URL map returns correct paths | unit | `pnpm test:run tests/lib/push/notification-urls.test.ts` | No -- Wave 0 |
| PUSH-04 | Subscribe/unsubscribe API routes validate and persist | unit | `pnpm test:run tests/app/api/push/` | No -- Wave 0 |
| PUSH-05 | VAPID config utility reads env vars correctly | unit | `pnpm test:run tests/lib/push/vapid.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test:run --reporter=verbose`
- **Per wave merge:** `pnpm test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/components/settings/notification-settings.test.tsx` -- covers PUSH-01
- [ ] `tests/hooks/use-push-notifications.test.ts` -- covers PUSH-02
- [ ] `tests/lib/push/notification-urls.test.ts` -- covers PUSH-03
- [ ] `tests/app/api/push/subscribe.test.ts` -- covers PUSH-04 (subscribe)
- [ ] `tests/app/api/push/unsubscribe.test.ts` -- covers PUSH-04 (unsubscribe)
- [ ] `tests/lib/push/vapid.test.ts` -- covers PUSH-05

## Sources

### Primary (HIGH confidence)
- Context7 `/web-push-libs/web-push` -- VAPID key generation, setVapidDetails, sendNotification API, subscription format
- Project codebase: `public/sw.js`, `lib/db/push-subscriptions.ts`, `lib/db/types.ts`, `next.config.ts`, `components/settings/settings-content.tsx`

### Secondary (MEDIUM confidence)
- npm registry: `web-push` version 3.6.7 (verified via `npm view web-push version`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- web-push is the de facto Node.js library, verified via Context7
- Architecture: HIGH -- all patterns follow existing project conventions; infrastructure already built in Phase 29
- Pitfalls: HIGH -- well-known Web Push API gotchas, verified against official docs and project code

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, Web Push API and web-push library are mature)
