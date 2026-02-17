---
phase: 06-dashboard-task-data-flow
plan: 01
status: complete
started: 2026-02-16
completed: 2026-02-16
---

## Summary

Fixed three dashboard task display bugs sharing the same root cause: `getTodayTasks` used server-local `getLocalDateString()` instead of the client-sent date parameter, and filtered out completed tasks.

## Changes

### Task 1: Fix getTodayTasks to accept client date and return completed tasks

**lib/db/tasks.ts** — Changed `getTodayTasks(userId)` to `getTodayTasks(userId, date)`. Removed internal `getLocalDateString()` call and `is_completed: false` filter. Method now returns both completed and incomplete tasks for today.

**app/api/dashboard/route.ts** — Updated to pass client `date` to `getTodayTasks`. Computes `tasks_completed_today` from returned array instead of separate DB call.

**app/dashboard/page.tsx** — Updated SSR page to pass `date` to `getTodayTasks`. Computes completed count from returned array.

**app/api/tasks/route.ts** — Updated `getTodayTasks` call to pass date parameter.

### Task 2: Update tests

**tests/lib/db/tasks.test.ts** — Updated `getTodayTasks` tests for new 2-arg signature. Added tests for date parameter passthrough and completed task inclusion.

**tests/app/api/dashboard/route.test.ts** — Updated dashboard route tests. Added tests verifying date is passed to `getTodayTasks`, completed tasks are included in response, and stats are correctly derived.

## Key Files

### Created
(none)

### Modified
- lib/db/tasks.ts
- app/api/dashboard/route.ts
- app/dashboard/page.tsx
- app/api/tasks/route.ts
- tests/lib/db/tasks.test.ts
- tests/app/api/dashboard/route.test.ts
- tests/app/api/tasks/special-routes.test.ts

## Self-Check: PASSED

- [x] getTodayTasks uses client-sent date parameter
- [x] getTodayTasks returns both completed and incomplete tasks
- [x] Dashboard stats derive from returned array (no extra DB call)
- [x] Both callers (API route + SSR page) pass date
- [x] Tests updated and passing
- [x] Build succeeds

## Deviations

- Also updated `app/api/tasks/route.ts` and `tests/app/api/tasks/special-routes.test.ts` — these called `getTodayTasks` and needed the new signature.
