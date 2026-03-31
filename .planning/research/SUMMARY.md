# Project Research Summary

**Project:** BetterR.Me
**Domain:** Calendar scheduling + push/email notifications for personal productivity
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

Adding a calendar domain and notification system to BetterR.Me is architecturally well-suited to the existing codebase. The project already has recurring event logic (`RecurrenceRule`), three calendar UIs (habit heatmap, journal, bill), a cron infrastructure (Vercel Cron), and date handling utilities. The new work splits cleanly into two layers: a calendar UI/data layer (familiar patterns) and a notification delivery layer (entirely new infrastructure).

The recommended approach is Calendar-First: build the calendar domain with event CRUD and cross-domain aggregation first, then layer push + email notification delivery on top. This matches the design spec and delivers visible value early. Only 4 new npm packages are needed (all server-only, zero client bundle impact), and the calendar grid should be built custom rather than using a library — the design spec's multi-domain aggregation with inline actions doesn't fit any existing calendar library's model.

Key risks center on three areas: (1) service worker + Next.js App Router interaction (keep SW minimal — push events only, no fetch interception), (2) timezone handling for reminder `fire_at` computation (store user IANA timezone, compute in UTC), and (3) Vercel Cron reliability at 1-minute intervals (implement processing locks and retry logic).

## Key Findings

### Recommended Stack

Only 4 new packages needed — all server-only. See [STACK.md](STACK.md) for details.

**New dependencies:**
- `web-push` ^3.6.7 — server-side Web Push protocol (VAPID auth, payload encryption)
- `resend` ^6.10.0 — transactional email delivery (3,000/month free tier, better DX than SendGrid)
- `@react-email/components` + `@react-email/render` — type-safe email templates as React components

**Build custom (not a library):**
- Calendar grid — custom CSS Grid; react-big-calendar and @schedule-x/react fight Tailwind/design tokens and can't support multi-domain inline actions
- Service worker — hand-written `public/sw.js` (~20 lines); @serwist/next is overkill for push-only use

**Already in stack (no additions):**
- `date-fns@4.1.0` — all calendar date math
- `react-day-picker@8.10.1` — mini month picker
- Vercel Cron — reminder delivery scheduling
- `RecurrenceRule` type system — event recurrence

### Expected Features

See [FEATURES.md](FEATURES.md) for full analysis.

**Must have (table stakes — 15 features):**
- Month/Week/Day views with navigation
- Standalone event CRUD with recurrence
- Cross-domain aggregation feed (tasks, habits, bills, workouts)
- Color-coded domain layers with toggles
- All-day events and quick-create from time slots
- Push notifications with browser permission flow
- Reminder creation (relative + absolute) with cron delivery
- Smart reminder defaults per domain type
- Responsive layout (mobile day view default)

**Should have (differentiators — 9 features):**
- Unified life-on-a-timeline (5 domains on one calendar — unique to BetterR.Me)
- Inline cross-domain actions (toggle tasks/habits/bills from calendar)
- Email notification channel alongside push
- Quiet hours for notifications
- Click-and-drag event creation
- Keyboard shortcuts (D/W/M/T/C/N)
- Snooze and notification click-through

**Defer (out of scope):**
- Google Calendar/iCal sync, drag-and-drop rescheduling, collaborative calendars, natural language creation, time analytics, SMS notifications

### Architecture Approach

See [ARCHITECTURE.md](ARCHITECTURE.md) for full system design.

**Major components:**
1. **Calendar data layer** — `CalendarEventsDB`, `RemindersDB`, `PushSubscriptionsDB`, `ReminderDefaultsDB` (follows existing DB class pattern)
2. **Feed aggregation API** — `/api/calendar/feed` querying 5 domain DB classes in parallel, returning unified `CalendarItem[]`
3. **Calendar UI** — Custom CSS Grid views (Month/Week/Day) with sidebar, all using BetterR.Me design tokens
4. **Notification delivery** — Service worker for push, Resend for email, Vercel Cron for scheduling
5. **Shared recurrence engine** — Extract from `lib/recurring-tasks/` to `lib/recurrence/` for reuse by calendar events

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 12 pitfalls.

1. **Service worker + Next.js conflicts** — SW fetch listeners intercept RSC payloads. Prevention: SW handles only `push`/`notificationclick` events, no fetch handler.
2. **Push permission UX** — requesting on page load gets permanently blocked. Prevention: two-step in-app explainer before browser prompt, triggered only from settings page.
3. **Timezone mismatch for `fire_at`** — events store local DATE/TIME but cron runs UTC. Prevention: store user IANA timezone in profiles, compute `fire_at` as UTC TIMESTAMPTZ.
4. **Vercel Cron reliability** — no built-in retry or dedup. Prevention: `status='processing'` lock, LIMIT batching, retry_count column.
5. **Calendar rendering performance** — 5 domains can produce 300+ items/month. Prevention: server-side expansion, `sources` query param for filtering, 500-item cap.

## Implications for Roadmap

Based on research, suggested 8-phase structure (continuing from Phase 29):

### Phase 29: Database Schema & Types
**Rationale:** Foundation layer with zero dependencies — everything else needs this
**Delivers:** 4 new Supabase tables, TypeScript types, DB classes, Zod validations
**Avoids:** Pitfall #3 (timezone) — add IANA timezone to profiles table here

### Phase 30: Calendar Event CRUD API
**Rationale:** API layer before UI, testable independently
**Delivers:** Event create/read/update/delete API routes, recurring event expansion
**Uses:** RecurrenceRule reuse from existing recurring tasks

### Phase 31: Calendar UI — Month View
**Rationale:** First visible value; month view is simplest, validates the CSS Grid approach
**Delivers:** Calendar page, month grid, sidebar with mini-cal + layer toggles, event rendering

### Phase 32: Calendar UI — Week & Day Views
**Rationale:** Week view is the core experience; Day view is mobile default
**Delivers:** Time grid with hourly rows, click-to-create, current time indicator, keyboard shortcuts

### Phase 33: Cross-Domain Feed Aggregation
**Rationale:** Core differentiator — needs all views working first
**Delivers:** `/api/calendar/feed` endpoint, inline task/habit/bill actions, SWR integration
**Avoids:** Pitfall #6 (performance), #8 (SWR coherence)

### Phase 34: Push Notification Infrastructure
**Rationale:** New infra — needs careful isolation from existing app
**Delivers:** Service worker, VAPID keys, push subscription flow, browser permission UX
**Avoids:** Pitfall #1 (SW conflicts), #2 (permission UX)

### Phase 35: Email Notification Infrastructure
**Rationale:** Depends on push infra for shared reminder model
**Delivers:** Resend integration, email templates, domain verification
**Uses:** resend, @react-email/components

### Phase 36: Reminder Cron & Preferences
**Rationale:** Ties everything together — needs both push + email working
**Delivers:** Cron job, reminder preferences UI, quiet hours, smart defaults
**Avoids:** Pitfall #4 (cron reliability), #11 (fire_at recomputation)

### Phase Ordering Rationale

- Schema first (29) because every other phase needs the tables
- API before UI (30 before 31-32) because components need data to render
- Month view before Week/Day (31 before 32) because it's simpler and validates CSS Grid
- Aggregation after all views (33) because inline actions need the calendar working
- Push before Email (34 before 35) because push is primary channel and email shares the reminder model
- Cron last (36) because it integrates push + email delivery

### Research Flags

Phases needing deeper research during planning:
- **Phase 34:** Service worker + Next.js 16 interaction needs careful testing
- **Phase 35:** Resend domain verification and DNS setup is environment-specific

Phases with standard patterns (skip research-phase):
- **Phase 29:** Standard Supabase migration + DB class pattern
- **Phase 30:** Standard API route pattern with Zod validation
- **Phase 31-32:** Custom CSS Grid, well-understood approach

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 4 packages, all well-established, versions verified |
| Features | HIGH | Based on competitor analysis + existing design spec |
| Architecture | HIGH | Follows established codebase patterns, clear integration points |
| Pitfalls | HIGH | Domain-specific risks well-documented, prevention strategies concrete |

**Overall confidence:** HIGH

### Gaps to Address

- **Vercel Pro plan requirement:** 1-minute cron intervals may require Vercel Pro. Verify pricing before Phase 36 planning.
- **iOS Safari Web Push:** Requires iOS 16.4+ and user must add to Home Screen. Document this limitation in notification preferences UI.
- **Resend free tier limits:** 3,000 emails/month. Monitor usage and plan upgrade path if needed.
- **User timezone storage:** The profiles table currently has no timezone field. Must add in Phase 29 migration.

## Sources

### Primary (HIGH confidence)
- web-push npm — VAPID auth, push protocol implementation
- Resend docs — email delivery API, React Email integration
- Existing codebase — RecurrenceRule, Vercel Cron, DB class patterns
- Design spec — `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`

### Secondary (MEDIUM confidence)
- Calendar app UX research (Google Calendar, Fantastical, Notion Calendar, Amie)
- Web Push API browser compatibility (caniuse.com)

---
*Research completed: 2026-03-30*
*Ready for roadmap: yes*
