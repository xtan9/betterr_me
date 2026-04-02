# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- ✅ **v3.0 Projects & Kanban** — Phases 13-17 (shipped 2026-02-21)
- ✅ **v4.0 Money Tracking** — Phases 18-26 (shipped 2026-02-28)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

1 phase, 1 plan, 3 requirements. See `.planning/milestones/v1.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases, 21 plans, 28 requirements. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.1 UI Polish & Refinement (Phases 10-12) — SHIPPED 2026-02-18</summary>

3 phases, 6 plans, 8 requirements. See `.planning/milestones/v2.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v3.0 Projects & Kanban (Phases 13-17) — SHIPPED 2026-02-21</summary>

5 phases, 12 plans, 17 requirements. See `.planning/milestones/v3.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v4.0 Money Tracking (Phases 18-26) — SHIPPED 2026-02-28</summary>

9 phases, 38 plans, 66 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for details.

- [x] Phase 18: Database Foundation & Household Schema (2/2 plans) — completed 2026-02-21
- [x] Phase 19: Plaid Bank Connection Pipeline (6/6 plans) — completed 2026-02-22
- [x] Phase 20: Transaction Management & Categorization (5/5 plans) — completed 2026-02-23
- [x] Phase 21: Budgets & Spending Analytics (5/5 plans) — completed 2026-02-23
- [x] Phase 22: Bills, Goals & Net Worth (6/6 plans) — completed 2026-02-24
- [x] Phase 23: Household & Couples (4/4 plans) — completed 2026-02-24
- [x] Phase 24: Future-First Dashboard & AI Insights (5/5 plans) — completed 2026-02-24
- [x] Phase 25: Data Management & Polish (2/2 plans) — completed 2026-02-24
- [x] Phase 26: CSV Import & Integration Polish (3/3 plans) — completed 2026-02-28

</details>

## v6.0 Calendar & Reminder Notifications (Phases 29-36)

**Goal:** Full calendar/scheduling domain with unified Day/Week/Month views, standalone event management, cross-domain aggregation, and push + email reminder notifications with smart defaults.

**Design spec:** `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md`

### Phase 29: Database Schema & Infrastructure Foundation

**Goal:** Create all database tables, DB classes, Zod schemas, and timezone infrastructure needed by every subsequent phase.

**Requirements:** INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06, INFR-07, INFR-08

**Success criteria:**
1. User's IANA timezone is stored in profiles and auto-detected on first visit
2. All 4 new tables (calendar_events, reminders, reminder_defaults, push_subscriptions) exist with RLS policies
3. CalendarEventsDB, RemindersDB, PushSubscriptionsDB, ReminderDefaultsDB classes pass unit tests
4. Zod validation schemas reject invalid event and reminder payloads
5. Service worker file exists at public/sw.js and registers without errors

### Phase 30: Calendar Event CRUD API

**Goal:** Full event create/read/update/delete API with recurrence support, testable independently before any UI.

**Requirements:** EVNT-01, EVNT-02, EVNT-03, EVNT-04, EVNT-05, EVNT-06

**Success criteria:**
1. User can create an event with title, dates, times, location, description, category, and color via API
2. User can create all-day events (no start/end time) via API
3. User can edit and delete events via API
4. Recurring events expand correctly for a date range query (daily, weekly, monthly, yearly with interval)
5. Single-occurrence edits create exception records without affecting other occurrences

### Phase 31: Calendar UI — Month View & Navigation

**Goal:** First visible calendar page with month grid, sidebar with mini-cal and layer toggles, and core navigation.

**Requirements:** VIEW-01, VIEW-04, VIEW-05, VIEW-06, VIEW-09, VIEW-10

**Success criteria:**
1. User can see a monthly calendar grid with day cells showing event chips and "+N more" overflow
2. User can switch between Day/Week/Month views via header toggle
3. User can navigate previous/next month and jump to today
4. Left sidebar shows mini month picker for quick date navigation
5. Calendar uses BetterR.Me design tokens (teal primary, rounded-xl, dark mode)

**Plans:** 2/2 plans complete
- [x] 31-01-PLAN.md — Calendar route foundation (layout, page, sidebar nav, design tokens, i18n)
- [x] 31-02-PLAN.md — Month view UI (header, grid, sidebar, event chips, date utils, tests)

### Phase 32: Calendar UI — Week & Day Views

**Goal:** Time grid views with hourly rows, quick-create interactions, current time indicator, and keyboard shortcuts.

**Requirements:** VIEW-02, VIEW-03, VIEW-07, VIEW-08, VIEW-12, EVNT-07, EVNT-08, EVNT-09, EVNT-10

**Success criteria:**
1. User can see a weekly time grid with 7 day columns and hourly rows with events as colored blocks
2. User can see a daily time grid with full-width events and a current time indicator (teal line)
3. All-day events render in a dedicated row above the time grid
4. User can quick-create events by clicking a time slot or click-and-dragging a range
5. Keyboard shortcuts work: D/W/M (views), T (today), arrows (navigate), C (quick-create), N (new event), / (search), Esc (close)

**Plans:** 2/4 plans complete
- [x] 32-01-PLAN.md — Foundation: date utilities, keyboard shortcuts hook, i18n strings
- [x] 32-02-PLAN.md — Time grid infrastructure: TimeGrid, EventBlock, AllDayRow, CurrentTimeIndicator
- [ ] 32-02-PLAN.md — (pending)
- [ ] 32-03-PLAN.md — (pending)
- [ ] 32-04-PLAN.md — (pending)

### Phase 33: Cross-Domain Feed Aggregation

**Goal:** Unified feed API returning tasks, habits, bills, and workouts on the calendar with inline actions.

**Requirements:** AGGR-01, AGGR-02, AGGR-03, AGGR-04, AGGR-05, AGGR-06, AGGR-07, AGGR-08, AGGR-09, AGGR-10, AGGR-11

**Success criteria:**
1. `/api/calendar/feed` returns all domain items (events, tasks, habits, bills, workouts) for a date range
2. Each domain renders with its distinct color (teal/blue/amber/red/purple) and user can toggle visibility per domain
3. User can complete/uncomplete tasks and toggle habit completion directly from the calendar
4. User can mark bills as paid/dismissed and clicking a workout navigates to its detail page

### Phase 34: Push Notification Infrastructure

**Goal:** Web Push API integration with service worker, VAPID keys, subscription management, and browser permission flow.

**Requirements:** PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05

**Success criteria:**
1. User can enable push notifications from settings and sees a browser permission prompt with in-app explainer
2. Service worker receives push events and displays native browser notifications
3. Clicking a notification navigates to the relevant item (event, task, habit, or bill)
4. Push subscriptions are stored per-device and VAPID keys are configured via environment variables

### Phase 35: Email Notification Infrastructure

**Goal:** Resend integration with React Email templates for all reminder types, with unsubscribe support.

**Requirements:** MAIL-01, MAIL-02, MAIL-03, MAIL-04

**Success criteria:**
1. User can enable email notifications from settings
2. Email reminders are sent via Resend with distinct React Email templates per source type
3. Every reminder email includes a working unsubscribe link
4. Templates exist for event reminder, task due, habit nudge, and bill due

### Phase 36: Reminder Cron, Preferences & Polish

**Goal:** Cron-based reminder dispatch, smart defaults, quiet hours, user preferences, responsive mobile layout, and i18n.

**Requirements:** REMN-01, REMN-02, REMN-03, REMN-04, REMN-05, REMN-06, REMN-07, REMN-08, REMN-09, REMN-10, I18N-01, RESP-01, RESP-02, RESP-03

**Success criteria:**
1. User can add multiple reminders per event with relative (5m/15m/30m/1h/1d) or absolute timing, targeting push, email, or both
2. Smart defaults auto-apply per source type and user can customize defaults in settings
3. Quiet hours prevent push notifications during configured sleep window
4. Vercel Cron dispatches pending reminders every minute with fire_at recomputation on reschedule
5. All calendar/reminder strings are translated in en, zh, zh-TW; mobile layout has collapsed sidebar, day-view default with swipe, and floating action button

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 3/3 | Complete | 2026-02-18 |
| 11. Sidebar Polish | v2.1 | 2/2 | Complete | 2026-02-18 |
| 12. Component Fixes | v2.1 | 1/1 | Complete | 2026-02-18 |
| 13. Data Foundation & Migration | v3.0 | 2/2 | Complete | 2026-02-19 |
| 14. Projects & Sections | v3.0 | 3/3 | Complete | 2026-02-20 |
| 15. Kanban Board | v3.0 | 4/4 | Complete | 2026-02-20 |
| 16. Integration Bug Fixes | v3.0 | 2/2 | Complete | 2026-02-21 |
| 17. Fix Archive/Restore Validation | v3.0 | 1/1 | Complete | 2026-02-21 |
| 18. Database Foundation | v4.0 | 2/2 | Complete | 2026-02-21 |
| 19. Plaid Bank Connection | v4.0 | 6/6 | Complete | 2026-02-22 |
| 20. Transactions & Categorization | v4.0 | 5/5 | Complete | 2026-02-23 |
| 21. Budgets & Spending | v4.0 | 5/5 | Complete | 2026-02-23 |
| 22. Bills, Goals & Net Worth | v4.0 | 6/6 | Complete | 2026-02-24 |
| 23. Household & Couples | v4.0 | 4/4 | Complete | 2026-02-24 |
| 24. Dashboard & AI Insights | v4.0 | 5/5 | Complete | 2026-02-24 |
| 25. Data Management | v4.0 | 2/2 | Complete | 2026-02-24 |
| 26. CSV Import & Polish | v4.0 | 3/3 | Complete | 2026-02-28 |
| 27. Data Layer & Sync | v5.1 | 1/3 | Complete    | 2026-03-30 |
| 28. Thumbnails in Existing UI | v5.1 | 1/2 | Executing | — |
| 29. Database Schema & Infrastructure | v6.0 | 3/4 | Complete    | 2026-03-31 |
| 30. Calendar Event CRUD API | v6.0 | 3/3 | Complete    | 2026-03-31 |
| 31. Calendar UI — Month View | v6.0 | 2/2 | Complete    | 2026-04-01 |
| 32. Calendar UI — Week & Day Views | v6.0 | 2/4 | Executing | — |
| 33. Cross-Domain Feed Aggregation | v6.0 | 0/? | Not started | — |
| 34. Push Notification Infrastructure | v6.0 | 0/? | Not started | — |
| 35. Email Notification Infrastructure | v6.0 | 0/? | Not started | — |
| 36. Reminder Cron & Preferences | v6.0 | 0/? | Not started | — |
