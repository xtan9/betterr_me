---
phase: 33-cross-domain-feed-aggregation
verified: 2026-04-01T08:00:00Z
status: gaps_found
score: 7/11 requirements verified
gaps:
  - truth: "Workouts show at their start time on the calendar"
    status: failed
    reason: "normalizeWorkouts sets startTime: null and allDay: true — the started_at timestamp time portion is not extracted"
    artifacts:
      - path: "lib/calendar/feed-aggregation.ts"
        issue: "normalizeWorkouts hard-codes startTime: null and allDay: true; does not extract HH:MM from started_at"
    missing:
      - "Extract time from started_at: `const time = w.started_at.split('T')[1]?.slice(0,5) ?? null` and set startTime/allDay accordingly"

  - truth: "All layer toggles are enabled by default (tasks, habits, bills, workouts visible on first load)"
    status: failed
    reason: "CalendarPageContent initializes enabledLayers as Set(['events']) only. Other 4 domains are OFF by default, so tasks/habits/bills/workouts are not visible until the user manually toggles each on."
    artifacts:
      - path: "components/calendar/calendar-page-content.tsx"
        issue: "Line 83-85: `useState<Set<string>>(new Set(['events']))` — only events layer enabled by default, contradicting Plan 03 task 03.4 which specifies all 5 layers enabled by default"
    missing:
      - "Change initialization to `new Set(['events', 'tasks', 'habits', 'bills', 'workouts'])`"

  - truth: "CalendarItemChip and CalendarItemBlock components exist with source-specific rendering"
    status: failed
    reason: "These new dedicated components were NOT created. Plan 03 specified new CalendarItemChip and CalendarItemBlock files, but the implementation reused EventChip/EventBlock with domain awareness via _domain/_completed fields on DomainCalendarEvent. While domain colors work, dedicated CalendarItemChip/Block components are absent."
    artifacts:
      - path: "components/calendar/calendar-item-chip.tsx"
        issue: "MISSING — file does not exist"
      - path: "components/calendar/calendar-item-block.tsx"
        issue: "MISSING — file does not exist"
    missing:
      - "Either create dedicated CalendarItemChip/CalendarItemBlock components, or formally document the alternative implementation approach (EventChip/EventBlock with _domain extension)"

  - truth: "CalendarItemChip and CalendarItemBlock have unit tests"
    status: failed
    reason: "tests/components/calendar/calendar-item-chip.test.tsx and calendar-item-block.test.tsx both MISSING. No dedicated tests for domain-aware chip/block rendering."
    artifacts:
      - path: "tests/components/calendar/calendar-item-chip.test.tsx"
        issue: "MISSING — file does not exist"
      - path: "tests/components/calendar/calendar-item-block.test.tsx"
        issue: "MISSING — file does not exist"
    missing:
      - "Create tests for domain-colored chip and block rendering (whether targeting the new components or the modified EventChip/EventBlock)"

  - truth: "All new UI strings exist in en, zh, and zh-TW locale files (feed, actions, domains sub-keys)"
    status: partial
    reason: "Plan 04 task 04.4 specifies adding calendar.feed, calendar.actions, and calendar.domains sub-keys to all 3 locale files. These are absent from all locales. The calendar.layers keys were added in an earlier plan but the feed/actions/domains keys from Plan 04 are missing."
    artifacts:
      - path: "i18n/messages/en.json"
        issue: "No calendar.feed, calendar.actions, or calendar.domains keys"
      - path: "i18n/messages/zh.json"
        issue: "No calendar.feed, calendar.actions, or calendar.domains keys"
      - path: "i18n/messages/zh-TW.json"
        issue: "No calendar.feed, calendar.actions, or calendar.domains keys"
    missing:
      - "Add calendar.feed.{error,loading}, calendar.actions.{markComplete,markIncomplete,toggleHabit,markHabitComplete,markHabitIncomplete,markPaid,viewWorkout,billAmount}, calendar.domains.{event,task,habit,bill,workout} to all 3 locale files"

human_verification:
  - test: "Tasks visible on calendar by default (after fixing layer defaults)"
    expected: "Opening /calendar shows task chips on dates with tasks due, without user needing to toggle any layer"
    why_human: "Requires authenticated session and real data; can't verify in unit tests"
  - test: "Clicking a task chip on calendar week/day view toggles completion"
    expected: "Circle checkbox on task chip becomes checked, optimistic update fires, PATCH /api/tasks/{id}/toggle called"
    why_human: "Integration behavior across click handler → dispatch → fetch → SWR mutate"
  - test: "Habit chip shows completion state on days where habit was logged"
    expected: "Amber chip with checkmark on logged days, open square on unlogged days"
    why_human: "Requires real habit + log data and visual rendering"
  - test: "Bill chip appears on due date and marks dismissed on click"
    expected: "Red chip on next_due_date, clicking fires PATCH /api/money/bills/{id} with user_status: dismissed"
    why_human: "Requires household + bill data"
  - test: "Clicking a workout chip navigates to /workouts/{id}"
    expected: "Client-side navigation to workout detail page"
    why_human: "Router navigation can't be tested without e2e"
---

# Phase 33: Cross-Domain Feed Aggregation Verification Report

**Phase Goal:** Unified feed API returning tasks, habits, bills, and workouts on the calendar with inline actions.
**Verified:** 2026-04-01T08:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CalendarFeedItem type exists with domain discriminated union | ✓ VERIFIED | `lib/calendar/feed-types.ts` exports `CalendarFeedItem`, `FeedDomain`, `DOMAIN_COLORS`, `FeedAction`, `DomainCalendarEvent` |
| 2 | `/api/calendar/feed` returns unified items from all 5 domains | ✓ VERIFIED | `app/api/calendar/feed/route.ts` — parallel Promise.all for events/tasks/habits/bills/workouts |
| 3 | Feed aggregation functions normalize each domain | ✓ VERIFIED | `lib/calendar/feed-aggregation.ts` exports `normalizeEvents`, `normalizeTasks`, `normalizeHabits`, `normalizeBills`, `normalizeWorkouts` |
| 4 | Calendar sidebar layer toggles are functional (no coming-soon) | ✓ VERIFIED | `calendar-sidebar.tsx` — all 5 LAYERS rendered with checkbox, no `isDisabled`/`comingSoonPhase` logic, controlled by props |
| 5 | Layer state is lifted to CalendarPageContent | ✓ VERIFIED | `calendar-page-content.tsx` line 83-97 — `enabledLayers` useState + `toggleLayer` callback, passed as props to CalendarSidebar |
| 6 | Tasks/habits/bills/workouts show on calendar with domain colors | ✓ VERIFIED (conditional) | `EventChip`/`EventBlock` detect `_domain` field and apply `DOMAIN_COLORS` CSS vars — colors work when layers are toggled on |
| 7 | All layers enabled by default (tasks/habits/bills/workouts visible on first load) | ✗ FAILED | `enabledLayers` initialized as `new Set(["events"])` — only events shows by default; feedKey is null until user enables a non-event layer |
| 8 | Workouts display at their start time | ✗ FAILED | `normalizeWorkouts` sets `startTime: null` and `allDay: true` — workout time is not extracted from `started_at` |
| 9 | CalendarItemChip and CalendarItemBlock components created | ✗ FAILED | Files `components/calendar/calendar-item-chip.tsx` and `calendar-item-block.tsx` do not exist; EventChip/EventBlock were extended instead |
| 10 | Inline actions (task/habit/bill/workout) wired and callable | ✓ VERIFIED (week/day) | `hooks/use-calendar-actions.ts` implements `toggleTask`, `toggleHabit`, `dismissBill`, `navigateWorkout`; wired in `CalendarPageContent.handleEventClick` for week/day views |
| 11 | useCalendarActions optimistic SWR updates | ✓ VERIFIED | Hook calls `onMutated?.()` callback after each fetch, CalendarPageContent revalidates both SWR keys |

**Score:** 7/11 truths verified (6 fully verified, 1 partial/conditional, 4 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/calendar/feed-types.ts` | CalendarFeedItem type and domain color mapping | ✓ VERIFIED | Exports `CalendarFeedItem`, `FeedDomain`, `DOMAIN_COLORS`, `FeedAction`, `DomainCalendarEvent` |
| `lib/calendar/feed-aggregation.ts` | Pure aggregation functions for each domain | ✓ VERIFIED | Exports 8 functions; normalize functions for all 5 domains + helpers |
| `app/api/calendar/feed/route.ts` | GET /api/calendar/feed endpoint | ✓ VERIFIED | Auth, validation, parallel Promise.all, server-side layer filtering |
| `components/calendar/calendar-item-chip.tsx` | Domain-colored chip component | ✗ MISSING | File does not exist; Plan 03 artifact not created |
| `components/calendar/calendar-item-block.tsx` | Domain-colored block component | ✗ MISSING | File does not exist; Plan 03 artifact not created |
| `hooks/use-calendar-actions.ts` | Custom hook for inline actions with optimistic updates | ✓ VERIFIED | At `hooks/` (not `components/calendar/`); exports `dispatch`, `toggleTask`, `toggleHabit`, `dismissBill`, `navigateWorkout` |
| `tests/lib/calendar/feed-aggregation.test.ts` | Unit tests for aggregation functions | ✓ VERIFIED | 25 tests, all passing |
| `tests/app/api/calendar/feed/route.test.ts` | API route tests | ✓ VERIFIED | 7 tests, all passing |
| `tests/hooks/use-calendar-actions.test.ts` | Actions hook tests | ✓ VERIFIED | 8 tests, all passing (at `tests/hooks/` not `tests/components/calendar/`) |
| `tests/components/calendar/calendar-item-chip.test.tsx` | CalendarItemChip unit tests | ✗ MISSING | File does not exist |
| `tests/components/calendar/calendar-item-block.test.tsx` | CalendarItemBlock unit tests | ✗ MISSING | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/calendar/feed/route.ts` | `lib/calendar/feed-aggregation.ts` | imports normalizeEvents/Tasks/Habits/Bills/Workouts | ✓ WIRED | All 5 normalize functions imported and used |
| `components/calendar/calendar-page-content.tsx` | `app/api/calendar/feed` | SWR fetches `/api/calendar/feed?...&layers=...` | ✓ WIRED | `feedKey` computed and passed to `useSWR` |
| `components/calendar/calendar-page-content.tsx` | `components/calendar/calendar-sidebar.tsx` | passes `enabledLayers` and `onToggleLayer` props | ✓ WIRED | Props confirmed at line 453-455 |
| `hooks/use-calendar-actions.ts` | `app/api/tasks/[id]/toggle` | POST for task completion toggle | ✓ WIRED | `fetch(\`/api/tasks/${taskId}/toggle\`, { method: 'POST' })` |
| `hooks/use-calendar-actions.ts` | `app/api/habits/[id]/toggle` | POST for habit log toggle | ✓ WIRED | `fetch(\`/api/habits/${habitId}/toggle\`, { method: 'POST' })` |
| `hooks/use-calendar-actions.ts` | `app/api/money/bills/[id]` | PATCH for bill dismiss | ✓ WIRED | `fetch(\`/api/money/bills/${billId}\`, { method: 'PATCH', body: { user_status: 'dismissed' } })` |
| `components/calendar/calendar-page-content.tsx` | `hooks/use-calendar-actions.ts` | hook called; dispatch passed via handleEventClick | ✓ WIRED | Line 17 import, line 179 `const { dispatch } = useCalendarActions(handleFeedMutated)` |
| `app/api/calendar/feed/route.ts` | `lib/calendar/normalize.ts` | Plan 02 key link | ✗ NOT_WIRED | `lib/calendar/normalize.ts` does not exist; normalize functions live in `feed-aggregation.ts` (functional equivalent, different path) |
| `app/api/calendar/feed/route.ts` | `lib/db/tasks.ts` `TasksDB.getTasksInDateRange` | Plan 02 key link | ✗ NOT_WIRED | Route queries Supabase directly instead of using `TasksDB.getTasksInDateRange` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `app/api/calendar/feed/route.ts` | `items` (CalendarFeedItem[]) | Supabase queries for tasks/habits/bills/workouts + CalendarEventsDB | Yes — direct DB queries | ✓ FLOWING |
| `components/calendar/calendar-page-content.tsx` | `feedData.items` | SWR from `/api/calendar/feed` | Yes — but only when non-event layers enabled | ⚠️ CONDITIONAL — feedKey is null by default; data only flows after user enables a non-event layer |
| `hooks/use-calendar-actions.ts` | mutation results | `fetch()` calls to domain APIs | Yes — real API calls | ✓ FLOWING |
| `components/calendar/event-chip.tsx` | `_domain`, `_completed`, `DOMAIN_COLORS` | `feedItemsToExpandedEvents()` sets `_domain` etc. on DomainCalendarEvent | Yes — domain metadata flows | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Feed aggregation tests pass | `pnpm vitest run tests/lib/calendar/feed-aggregation.test.ts` | 25/25 pass | ✓ PASS |
| Feed API route tests pass | `pnpm vitest run tests/app/api/calendar/feed/route.test.ts` | 7/7 pass | ✓ PASS |
| Actions hook tests pass | `pnpm vitest run tests/hooks/use-calendar-actions.test.ts` | 8/8 pass | ✓ PASS |
| Feed API returns events-only by default | `grep "layersParam.*events" app/api/calendar/feed/route.ts` | Line 41: defaults to "events" | ✓ PASS (but confirms layer default gap) |
| Workouts extract time from started_at | `grep "started_at.*split\|startTime.*T" lib/calendar/feed-aggregation.ts` | Not found — normalizeWorkouts uses `allDay: true` | ✗ FAIL |

### Requirements Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| AGGR-01 | 33-01, 33-02 | Tasks with due_date appear on calendar at due_time (or all-day) | ✓ SATISFIED | `normalizeTasks` maps `due_date` → date, `due_time` → startTime; allDay when no due_time |
| AGGR-02 | 33-01, 33-02 | Active habits scheduled for each day in all-day row | ✓ SATISFIED | `normalizeHabits` generates one item per habit per applicable date using `shouldTrackOnDate`; allDay: true |
| AGGR-03 | 33-01, 33-02 | Bills with next_due_date in all-day row | ✓ SATISFIED | `normalizeBills` filters by next_due_date in range, active, non-dismissed; allDay: true |
| AGGR-04 | 33-01, 33-02 | Workouts at their start time | ✗ BLOCKED | `normalizeWorkouts` sets `startTime: null` and `allDay: true` — time not extracted from `started_at` |
| AGGR-05 | 33-01, 33-03 | Domain colors: events (teal), tasks (blue), habits (amber), bills (red), workouts (purple) | ✓ SATISFIED | CSS vars in `globals.css`; `EventChip`/`EventBlock` detect `_domain` and apply `DOMAIN_COLORS` |
| AGGR-06 | 33-01, 33-03 | User can toggle each domain via sidebar checkboxes | ? PARTIAL | Sidebar checkboxes work and are functional; but only "events" is enabled by default — other domains require manual toggle, not auto-visible |
| AGGR-07 | 33-04 | Complete/uncomplete tasks from calendar | ✓ SATISFIED | `useCalendarActions.toggleTask` → `POST /api/tasks/{id}/toggle`; wired in week/day views via handleEventClick |
| AGGR-08 | 33-04 | Toggle habit completion from calendar | ✓ SATISFIED | `useCalendarActions.toggleHabit` → `POST /api/habits/{id}/toggle`; wired via dispatch |
| AGGR-09 | 33-04 | Mark bills as paid/dismissed from calendar | ✓ SATISFIED | `useCalendarActions.dismissBill` → `PATCH /api/money/bills/{id}` with `user_status: "dismissed"` |
| AGGR-10 | 33-04 | Clicking workout navigates to detail page | ✓ SATISFIED | `useCalendarActions.navigateWorkout` → `router.push('/workouts/{id}')` |
| AGGR-11 | 33-02 | Unified feed API `/api/calendar/feed` | ✓ SATISFIED | Endpoint exists, auth + validation + parallel domain queries + layer filtering |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/calendar/feed-aggregation.ts` | 169-171 | `startTime: null, allDay: true` in normalizeWorkouts | 🛑 Blocker | Workouts never appear at their scheduled time (AGGR-04 blocked) |
| `components/calendar/calendar-page-content.tsx` | 83-85 | `new Set(["events"])` — only events layer enabled by default | 🛑 Blocker | Tasks/habits/bills/workouts invisible until user manually enables each toggle |
| `i18n/messages/en.json` | — | Missing `calendar.feed`, `calendar.actions`, `calendar.domains` keys | ⚠️ Warning | If CalendarItemChip is created and uses t("calendar.actions.markComplete"), it will fail |
| `components/calendar/month-day-cell.tsx` | 69 | `<EventChip>` has no per-chip onClick — domain items in month view can't trigger inline actions | ⚠️ Warning | Clicking a task/habit in month view navigates to day view instead of toggling the item |

### Human Verification Required

#### 1. Layer toggle UX after default fix

**Test:** Open `/calendar` after fixing the default to enable all 5 layers
**Expected:** Calendar shows tasks (blue), habits (amber), bills (red), workouts (purple) chips alongside events
**Why human:** Requires authenticated session + real data across all domains

#### 2. Task inline completion in week/day view

**Test:** Navigate to week view, click a task chip → verify completion toggle fires
**Expected:** Circle becomes checkmark, chip gets strikethrough, UI updates instantly (optimistic), task is persisted
**Why human:** Integration across EventChip → handleEventClick → dispatch → toggleTask → PATCH API → SWR revalidation

#### 3. Habit toggle from calendar

**Test:** Click a habit chip in week or day view
**Expected:** Habit logged for that date; chip state reflects logged/unlogged
**Why human:** Requires real habit data + habit log creation

#### 4. Bill dismiss from calendar

**Test:** Click a bill chip (red) in week or day view
**Expected:** Bill marked as dismissed, chip removed from calendar after revalidation
**Why human:** Requires household + bill data

#### 5. Workout navigation from calendar

**Test:** Click a workout chip in week or day view
**Expected:** Browser navigates to `/workouts/{id}`
**Why human:** Router navigation requires browser environment

### Gaps Summary

**5 gaps identified:**

1. **AGGR-04 blocked — workouts not at start time.** `normalizeWorkouts` in `lib/calendar/feed-aggregation.ts` hard-codes `startTime: null` and `allDay: true`. The `started_at` ISO timestamp has a time component that should be extracted as `HH:MM` for the `startTime` field. Fix: extract `w.started_at.split('T')[1]?.slice(0, 5)` and set `allDay: false` when time is present.

2. **AGGR-06 partially broken — layers not enabled by default.** `CalendarPageContent` initializes `enabledLayers = new Set(["events"])`, causing `feedKey` to be null and no feed data fetched until a user manually enables a layer. Plan 03 task 03.4 explicitly specified all 5 layers in the default Set. Fix: change to `new Set(["events", "tasks", "habits", "bills", "workouts"])`.

3. **Plan 03 CalendarItemChip/Block components not created.** Both components were specified in Plan 03 as new files but the implementation extended existing `EventChip`/`EventBlock` with `_domain` awareness instead. The domain colors and completion state work, but the named artifacts are absent. This may be acceptable as an equivalent implementation, but the test coverage gap (gap #4) is problematic.

4. **Missing component tests for domain-aware chips/blocks.** No tests at `tests/components/calendar/calendar-item-chip.test.tsx` or `calendar-item-block.test.tsx`. The `tests/components/calendar/event-block.test.tsx` doesn't cover domain-specific rendering. Coverage for domain color rendering and completion state toggling is absent.

5. **i18n plan 04 keys not added.** `calendar.feed`, `calendar.actions`, and `calendar.domains` sub-keys specified in Plan 04 task 04.4 are missing from all 3 locale files. Currently no components consume these keys, so it's not breaking — but it's a plan deliverable that was skipped.

---

_Verified: 2026-04-01T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
