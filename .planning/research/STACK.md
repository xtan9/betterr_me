# Technology Stack: Calendar & Reminder Notifications

**Project:** BetterR.Me v6.0 Calendar & Reminder Notifications
**Researched:** 2026-03-30
**Scope:** Stack ADDITIONS only for calendar/scheduling and notification features. Existing stack (Next.js 16, React 19, Supabase auth+DB, SWR, shadcn/ui, Tailwind CSS 3, react-hook-form, zod v3, next-intl, date-fns ^4.1.0, Vercel Cron, etc.) is validated and unchanged.

---

## 1. Calendar Grid Library

### Decision: Build custom time grid (DO NOT use react-big-calendar)

| Option | Version | Verdict | Rationale |
|--------|---------|---------|-----------|
| **Custom time grid** | N/A | **CHOSEN** | Full control over design tokens, dark mode, i18n, and BetterR.Me's specific needs (aggregated multi-domain items, inline checkboxes, color-coded layers) |
| react-big-calendar | 1.19.4 | Rejected | Heavy opinionated CSS that fights Tailwind/shadcn design tokens. Requires moment.js or date-fns localizer wrapper. Custom styling is done via inline `style` objects (not CSS classes), making dark mode and design token integration painful. The library is designed for full calendar apps, not aggregated multi-domain views. |
| @schedule-x/react | 4.1.0 | Rejected | Better architecture than react-big-calendar but still brings its own CSS framework. Drag-and-drop is a paid plugin ($). The design spec explicitly puts drag-and-drop rescheduling as "Out of Scope" -- paying for a feature we will not use is wasteful. |

**Why custom is the right call for BetterR.Me:**

1. **Design token control:** BetterR.Me has 56+ CSS custom properties for colors, spacing, radii. Calendar libraries bring their own CSS that must be overridden line by line. A custom grid uses design tokens natively from the start.

2. **Dark mode:** Existing dark mode is class-based via `next-themes`. Calendar libraries use hardcoded colors or their own theming systems that do not integrate with CSS variable-based dark mode without significant overrides.

3. **Multi-domain aggregation:** The calendar shows items from 5 sources (events, tasks, habits, bills, workouts) with inline actions (checkbox toggles, mark-paid). No calendar library supports this -- custom rendering is required regardless. Using a library for the grid and then replacing all its rendering components negates the library's value.

4. **i18n:** next-intl provides translations. Calendar libraries have their own i18n systems (moment locales, date-fns locales) that conflict with or duplicate the existing approach.

5. **Complexity is manageable:** The time grid is a CSS Grid with hourly rows and day columns. The hard parts (recurrence expansion, event positioning/overlap) are algorithmic problems solved in utility functions, not UI library problems. BetterR.Me already has recurrence expansion logic from recurring tasks.

6. **No drag-and-drop rescheduling:** The design spec explicitly lists "Drag-and-drop rescheduling of events on the grid" as out of scope. The only drag interaction is click-and-drag to CREATE events (select a time range), which is a mousedown/mousemove/mouseup handler -- far simpler than full drag-and-drop reordering.

**Implementation approach:**
- `components/calendar/time-grid.tsx` — CSS Grid with `grid-template-rows` for hours, `grid-template-columns` for days
- Event positioning: absolute positioning within grid cells, calculated from `start_time` / `end_time`
- Overlap handling: column-packing algorithm (same approach as Google Calendar) -- pure function, well-documented algorithm
- Click-and-drag selection: mousedown sets start, mousemove updates preview, mouseup fires `onSelectSlot({ start, end })`
- Current time indicator: `useEffect` with 60-second interval updating a CSS `top` position

**What date-fns functions will be needed (already installed at ^4.1.0):**
- `startOfWeek`, `endOfWeek`, `eachDayOfInterval` -- week view column generation
- `startOfMonth`, `endOfMonth`, `eachWeekOfInterval` -- month view grid
- `addDays`, `addWeeks`, `addMonths`, `subDays`, `subWeeks`, `subMonths` -- navigation
- `isSameDay`, `isToday`, `isSameMonth` -- highlighting
- `format`, `parse` -- display formatting
- `getHours`, `getMinutes`, `differenceInMinutes` -- time grid positioning
- `setHours`, `setMinutes` -- creating events from time slot clicks

All of these are already available in `date-fns@4.1.0`. **No new date library needed.**

---

## 2. Web Push Notifications

### Recommended: `web-push` (server-side)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `web-push` | ^3.6.7 | Server-side push notification delivery | Official Web Push Protocol implementation for Node.js. Handles VAPID authentication, payload encryption (aes128gcm), and HTTP/2 delivery to push services (FCM, Mozilla, Apple). Zero browser dependencies -- server-only. 3.5M+ weekly downloads. | HIGH |

**Integration with existing stack:**

```typescript
// lib/push/send.ts
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:reminders@betterr.me",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string }
) {
  return webpush.sendNotification(
    subscription,
    JSON.stringify(payload),
    { TTL: 3600, urgency: "normal" }
  );
}
```

**VAPID key generation** (one-time setup):
```bash
npx web-push generate-vapid-keys
```
Output goes to `.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. The CLI command is included with the `web-push` package -- no separate utility needed.

**Error handling for stale subscriptions:**
- `410 Gone` or `404 Not Found` → delete subscription from `push_subscriptions` table
- `429 Too Many Requests` → retry with backoff
- Network errors → mark reminder as `failed` for retry

**Works with Vercel Cron:** The cron endpoint (`api/cron/send-reminders/route.ts`) calls `sendPushNotification()` for each due reminder. Same pattern as existing `api/cron/sync-transactions/route.ts` -- protected by `CRON_SECRET` bearer token.

---

## 3. Service Worker for Push Notifications

### Decision: Hand-written `public/sw.js` (DO NOT use Serwist/@serwist/next)

| Option | Version | Verdict | Rationale |
|--------|---------|---------|-----------|
| **Hand-written `public/sw.js`** | N/A | **CHOSEN** | Service worker only needs to handle `push` and `notificationclick` events. 20-30 lines of code. No caching strategy needed (Next.js handles its own caching). |
| @serwist/next | 9.5.7 | Rejected | Full PWA framework with precaching, runtime caching strategies, workbox integration. Massive overkill for "listen for push events and show a notification." Adds build-time complexity (webpack/Turbopack plugin), runtime overhead, and config surface area for zero benefit. |
| next-pwa | Unmaintained | Rejected | Abandoned. Serwist is its successor, but same overkill argument applies. |

**The service worker is trivial:**

```javascript
// public/sw.js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "BetterR.Me", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      const existing = windowClients.find((c) => c.url === event.notification.data.url);
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data.url);
    })
  );
});
```

**Next.js configuration for service worker headers:**

```typescript
// next.config.ts — add to existing headers()
{
  source: "/sw.js",
  headers: [
    { key: "Service-Worker-Allowed", value: "/" },
    { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  ],
},
```

**Client-side registration** (in a `useEffect` or layout component):

```typescript
// lib/push/register.ts
export async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    return navigator.serviceWorker.register("/sw.js");
  }
  return null;
}

export async function subscribeToPush(registration: ServiceWorkerRegistration) {
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    ),
  });
  // POST subscription to /api/push/subscribe
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  return subscription;
}
```

---

## 4. Email Delivery

### Recommended: `resend` + `@react-email/components`

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `resend` | ^6.10.0 | Transactional email API client | Developer-focused email API. Simple SDK (`resend.emails.send()`). React Email integration for type-safe templates. Free tier: 3,000 emails/month (ample for personal productivity app). No SMTP config. Vercel partnership for easy deployment. | HIGH |
| `@react-email/components` | ^1.0.10 | Email template components | Write email templates as React components with TypeScript. Components render to cross-client HTML. Reuses React mental model -- no separate templating language. | HIGH |
| `@react-email/render` | ^2.0.4 | Server-side email rendering | Renders React Email components to HTML string for Resend's `html` parameter. Required peer dependency. | HIGH |

**Why Resend over SendGrid:**

| Criteria | Resend | SendGrid |
|----------|--------|----------|
| DX | `resend.emails.send({ react: <Template /> })` — one function call with JSX | Template IDs, dynamic template data, separate template management |
| Free tier | 3,000 emails/month | 100 emails/day (3,000/month effective, but daily cap is annoying) |
| React Email | Native integration — pass JSX directly | Must render to HTML first, then pass as string |
| SDK size | Minimal, focused on email sending | Large SDK covering marketing, contacts, webhooks, stats |
| Setup | API key + verified domain | API key + verified domain + sender identity verification |
| Next.js | First-class support, Vercel partnership | Works but not purpose-built for Next.js |

**Integration pattern:**

```typescript
// lib/email/send-reminder.ts
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ReminderEmail } from "@/components/email/reminder-email";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendReminderEmail(
  to: string,
  reminder: { title: string; body: string; url: string; sourceType: string }
) {
  const html = await render(<ReminderEmail {...reminder} />);
  
  const { data, error } = await resend.emails.send({
    from: "BetterR.Me <reminders@betterr.me>",
    to: [to],
    subject: reminder.title,
    html,
  });

  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}
```

**Email templates needed (React components):**

| Template | Source Type | Subject Pattern |
|----------|-----------|-----------------|
| `event-reminder.tsx` | calendar_event | "Reminder: {event title} in {time}" |
| `task-due.tsx` | task | "Task due: {task title}" |
| `habit-nudge.tsx` | habit | "Time for: {habit title}" |
| `bill-due.tsx` | bill | "Bill due in {days}: {bill name} — ${amount}" |

**Unsubscribe handling:** Every email includes an unsubscribe link pointing to `/settings/notifications` where users can toggle email notifications per source type. Resend supports `List-Unsubscribe` headers for one-click unsubscribe in email clients.

---

## 5. No New Date/Time Libraries Needed

`date-fns@4.1.0` is already installed and used across 18+ source files. It covers every date manipulation need for the calendar:

| Need | date-fns Function | Already Used? |
|------|-------------------|---------------|
| Week boundaries | `startOfWeek`, `endOfWeek` | New usage |
| Month boundaries | `startOfMonth`, `endOfMonth` | Yes (money/bill-calendar) |
| Day iteration | `eachDayOfInterval` | New usage |
| Navigation | `addDays`, `addWeeks`, `addMonths`, `subDays` | Yes (money features) |
| Comparisons | `isSameDay`, `isToday`, `isSameMonth` | Yes (heatmap, bill-calendar) |
| Formatting | `format` | Yes (18+ files) |
| Time math | `differenceInMinutes`, `getHours`, `getMinutes` | New usage |
| Parsing | `parseISO`, `parse` | Yes (money features) |

**DO NOT add:** `dayjs`, `luxon`, `moment`, `temporal-polyfill`. date-fns is tree-shakeable, already optimized in `next.config.ts` (`optimizePackageImports`), and sufficient for all calendar operations.

---

## 6. Vercel Cron for Reminder Delivery

**Already available** -- the existing `api/cron/sync-transactions/route.ts` proves the pattern works. The reminder cron needs to run more frequently.

**Configuration change in `vercel.json`:**

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-transactions",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/send-reminders",
      "schedule": "* * * * *"
    }
  ]
}
```

**Note on Vercel Cron frequency:**
- Hobby plan: minimum 1-minute interval (sufficient for reminders)
- Pro plan: same minimum, but with guaranteed execution
- The cron endpoint processes all reminders with `fire_at <= NOW() AND status = 'pending'` in a single batch
- Execution limit: 10s on Hobby, 60s on Pro. Batch processing must be fast -- query pending reminders, fan out push/email sends in parallel, update statuses

**No new library needed** for the cron infrastructure itself.

---

## Recommended Stack Additions — Summary

| Technology | Version | Purpose | Bundle Impact |
|------------|---------|---------|--------------|
| `web-push` | ^3.6.7 | Server-side push notification delivery | **Server-only** — zero client bundle impact |
| `resend` | ^6.10.0 | Transactional email API | **Server-only** — zero client bundle impact |
| `@react-email/components` | ^1.0.10 | Email template components | **Server-only** — zero client bundle impact |
| `@react-email/render` | ^2.0.4 | Render React Email to HTML | **Server-only** — zero client bundle impact |

**Total new runtime dependencies: 4** (all server-only)
**Total new dev dependencies: 0**
**Client bundle increase: 0 bytes**

The calendar UI, service worker, and VAPID key generation require no new packages.

---

## Installation

```bash
# Push notifications (server-side only)
pnpm add web-push

# Email delivery
pnpm add resend @react-email/components @react-email/render

# VAPID key generation (one-time, using web-push CLI)
npx web-push generate-vapid-keys
# Copy output to .env.local:
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
#   VAPID_PRIVATE_KEY=...

# Add to .env.local:
#   RESEND_API_KEY=re_...
```

No `pnpm add` needed for:
- Calendar grid (custom-built)
- Service worker (hand-written `public/sw.js`)
- Date manipulation (`date-fns` already installed)
- Cron jobs (Vercel Cron already configured)
- VAPID keys (CLI included with `web-push`)

---

## What NOT to Add

| Do NOT Add | Why | What to Use Instead |
|------------|-----|---------------------|
| react-big-calendar | Opinionated CSS fights design tokens. Inline style overrides for dark mode. Does not support multi-domain aggregation with inline actions. | Custom CSS Grid time grid with BetterR.Me design tokens |
| @schedule-x/react | Drag-and-drop is paid. Calendar drag rescheduling is out of scope. Own CSS system conflicts with Tailwind. | Custom CSS Grid time grid |
| @serwist/next (or next-pwa) | Full PWA framework with precaching/caching strategies. We only need push event handling (20 lines of JS). Massive overkill. | Hand-written `public/sw.js` |
| SendGrid (@sendgrid/mail) | Larger SDK, daily sending caps on free tier, no React Email native integration, worse DX for simple transactional email. | Resend |
| dayjs / luxon / moment | date-fns ^4.1.0 already installed, tree-shakeable, covers all needs. Adding a second date library is waste. | date-fns (existing) |
| FullCalendar | Commercial license required for premium features. Even the open-source version has its own DOM rendering and CSS. | Custom CSS Grid time grid |
| node-cron / bull / bullmq | Server-side job scheduling libraries for long-running Node processes. Vercel is serverless -- these do not work. | Vercel Cron (existing pattern) |
| firebase-admin (FCM) | Web Push API + VAPID is the standard. FCM is Google-specific and requires Firebase project setup. web-push sends to ALL push services (FCM, Mozilla, Apple) via the standard protocol. | web-push |
| OneSignal / Pusher | Third-party notification services. Unnecessary abstraction when Web Push API + web-push library gives full control. Adds vendor dependency and costs. | web-push + custom service worker |
| temporal-polyfill | TC39 Temporal API is not yet stable in all runtimes. date-fns is the existing, working solution. | date-fns (existing) |
| react-email (CLI/dev server) | The CLI and dev server are development tools for previewing email templates. Not needed in production. Templates can be previewed with Storybook or a dedicated dev route. | `@react-email/components` + `@react-email/render` (the actual libraries) |

---

## Version Compatibility Matrix

| New Package | React 19 | Next.js 16 | Node.js 24 | TypeScript 5 | Notes |
|-------------|----------|------------|------------|--------------|-------|
| web-push ^3.6.7 | N/A (server) | Yes | Yes (>=16) | `@types/web-push` included | Server-only, no React dependency |
| resend ^6.10.0 | N/A (server) | Yes | Yes (>=20) | Types included | Server-only, optional `@react-email/render` peer dep |
| @react-email/components ^1.0.10 | Yes | Yes | Yes | Types included | React components for email templates |
| @react-email/render ^2.0.4 | Yes | Yes | Yes | Types included | Renders React to HTML string |

All packages are compatible with: Next.js 16.1.6, React 19, TypeScript 5, Node.js 24, pnpm 10.11.

---

## Environment Variables to Add

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `.env.local` + Vercel | Public VAPID key for browser push subscription (client-exposed) |
| `VAPID_PRIVATE_KEY` | `.env.local` + Vercel | Private VAPID key for signing push messages (server-only) |
| `RESEND_API_KEY` | `.env.local` + Vercel | Resend API key for sending emails (server-only) |

`CRON_SECRET` already exists (used by `sync-transactions` cron).

---

## Existing Stack Serving Calendar & Notification Features

These technologies are already installed and require NO additions:

| Existing Technology | How It Serves Calendar/Notification Features |
|---------------------|----------------------------------------------|
| **date-fns ^4.1.0** | All date math: week/month boundaries, navigation, formatting, time grid positioning. Already used in 18+ files. Already in `optimizePackageImports`. |
| **react-day-picker 8.10.1** | Mini month picker in calendar sidebar (same component used in journal). Already installed and working. |
| **Supabase (auth + DB)** | `calendar_events`, `reminders`, `push_subscriptions`, `reminder_defaults` tables with RLS policies. Same DB class pattern as all other domains. |
| **SWR** | Calendar feed fetching with `keepPreviousData: true` for smooth navigation. Optimistic updates for inline task/habit toggling. Date-range-keyed SWR keys. |
| **react-hook-form + zod** | Event creation/edit forms. Reminder preferences form. Reuses existing form patterns and Zod validation at API boundaries. |
| **shadcn/ui + Radix UI** | Dialog (event creation), Popover (quick-create), Select (view switcher), Button, Badge, Checkbox (inline actions), Sheet (mobile sidebar), Tooltip. |
| **next-intl** | Calendar/reminder UI strings in en, zh, zh-TW. Date formatting localization. |
| **next-themes** | Dark mode for all calendar views via existing CSS variable system. |
| **lucide-react** | Calendar, Clock, Bell, BellRing, ChevronLeft, ChevronRight, Plus, Filter, Eye/EyeOff icons. |
| **sonner** | Toast notifications for event CRUD confirmations, reminder creation feedback. |
| **Vercel Cron** | `api/cron/send-reminders` endpoint. Same `CRON_SECRET` auth pattern as existing `sync-transactions` cron. |
| **Tailwind CSS 3** | Calendar grid layout, responsive breakpoints, dark mode classes, design token usage. |
| **Vitest + Playwright** | Unit tests for recurrence expansion, fire_at computation, event overlap algorithm. E2E tests for event creation flow, view navigation. |

---

## Sources

### Package Versions (verified via npm registry, 2026-03-30)
- [web-push npm v3.6.7](https://www.npmjs.com/package/web-push) — Node.js >=16, includes VAPID key generator CLI
- [resend npm v6.10.0](https://www.npmjs.com/package/resend) — Node.js >=20, optional `@react-email/render` peer dep
- [@react-email/components npm v1.0.10](https://www.npmjs.com/package/@react-email/components) — React 18-19 compatible
- [@react-email/render npm v2.0.4](https://www.npmjs.com/package/@react-email/render) — Server-side HTML rendering
- [react-big-calendar npm v1.19.4](https://www.npmjs.com/package/react-big-calendar) — React 16-19 (evaluated, rejected)
- [@schedule-x/react npm v4.1.0](https://www.npmjs.com/package/@schedule-x/react) — React 16-19 (evaluated, rejected)
- [@serwist/next npm v9.5.7](https://www.npmjs.com/package/@serwist/next) — Next.js >=14 (evaluated, rejected)

### Integration Patterns (Context7 + official docs)
- [web-push library docs](https://github.com/web-push-libs/web-push) — VAPID setup, sendNotification API, error handling
- [Resend Next.js integration](https://resend.com/docs/send-with-nextjs) — SDK usage in API routes
- [React Email docs](https://react.email) — Component-based email templates
- [Web Push API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) — Browser push subscription, service worker events
- [Service Worker API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) — Registration, push event handling

### Architecture Decisions (project-specific reasoning)
- Design spec: `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`
- Existing cron pattern: `app/api/cron/sync-transactions/route.ts`
- Existing recurrence logic: `lib/db/types.ts` (RecurrenceRule discriminated union)
- Existing design tokens: `tailwind.config.ts` (56+ CSS custom properties)

---
*Stack research for: BetterR.Me v6.0 Calendar & Reminder Notifications*
*Researched: 2026-03-30*
*Scope: Additions only -- existing stack unchanged*
