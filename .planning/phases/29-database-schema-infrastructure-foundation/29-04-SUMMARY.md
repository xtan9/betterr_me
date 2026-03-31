---
phase: 29-database-schema-infrastructure-foundation
plan: 04
status: complete
started: "2026-03-31"
completed: "2026-03-31"
duration: ~5min
requirements_satisfied: [INFR-05, INFR-08]
---

# Plan 04 Summary: Service Worker & Timezone Detection Infrastructure

## What Was Done

### Task 1: Service Worker and next.config.ts Headers
- Created `public/sw.js` with `push` and `notificationclick` event handlers
- No `fetch` event listener (per INFR-08 — no fetch interception)
- Push handler shows notifications with title, body, icon, tag, and URL data
- Notificationclick handler focuses existing window or opens new one
- Updated `next.config.ts` with `/sw.js` route headers: `Service-Worker-Allowed: /` and `Cache-Control: no-cache, no-store, must-revalidate`
- Existing security headers for `"/(.*)"` preserved

### Task 2: Timezone Detection Hook and Profile Validation
- Created `lib/hooks/use-timezone-detection.ts` with `useTimezoneDetection` hook
- Hook detects browser IANA timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Skips if `profileTimezone` is already set or localStorage flag exists
- Patches `/api/profile` with detected timezone, sets localStorage flag on success
- Silent failure — non-critical, retries on next page load
- Added `timezone: z.string().min(1).max(100).optional().nullable()` to `profileUpdateSchema` in `lib/validations/profile.ts`

## Verification

- `public/sw.js` exists with push/notificationclick handlers, no fetch handler: PASS
- `next.config.ts` has `/sw.js` headers with Service-Worker-Allowed and Cache-Control: PASS
- `lib/hooks/use-timezone-detection.ts` exports `useTimezoneDetection`: PASS
- `lib/validations/profile.ts` has timezone field in profileUpdateSchema: PASS
- ESLint: 0 errors (11 pre-existing warnings)
- Vitest: 2735 tests passed (2 pre-existing failures unrelated to changes)

## Commits

1. `34b7821` — feat: add push notification service worker and next.config.ts headers
2. `af6ea3a` — feat: add timezone detection hook and profile validation timezone field

## Files Changed

- `public/sw.js` (new, 28 lines)
- `next.config.ts` (modified, +7 lines)
- `lib/hooks/use-timezone-detection.ts` (new, 43 lines)
- `lib/validations/profile.ts` (modified, +1 line)
