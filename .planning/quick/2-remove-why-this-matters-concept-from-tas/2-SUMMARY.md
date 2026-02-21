---
phase: quick
plan: 2
subsystem: tasks
tags: [typescript, zod, react-hook-form, i18n, supabase-migration]

requires: []
provides:
  - "Clean task model without intention/why-this-matters field"
  - "DB migration to drop intention column from tasks and recurring_tasks"
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - "supabase/migrations/20260221000001_drop_task_intention.sql"
  modified:
    - "lib/db/types.ts"
    - "lib/validations/task.ts"
    - "lib/validations/recurring-task.ts"
    - "app/api/tasks/route.ts"
    - "app/api/tasks/[id]/route.ts"
    - "app/api/recurring-tasks/route.ts"
    - "lib/recurring-tasks/instance-generator.ts"
    - "lib/db/recurring-tasks.ts"
    - "components/tasks/task-form.tsx"
    - "components/tasks/task-detail-content.tsx"
    - "components/tasks/create-task-content.tsx"
    - "components/dashboard/tasks-today.tsx"
    - "i18n/messages/en.json"
    - "i18n/messages/zh.json"
    - "i18n/messages/zh-TW.json"

key-decisions:
  - "Updated qualifiesForReflection to only check priority === 3 (was priority === 3 || !!intention)"

patterns-established: []

requirements-completed: [QUICK-2]

duration: 8min
completed: 2026-02-21
---

# Quick Task 2: Remove Why This Matters (intention) Summary

**Stripped the intention field from all types, validations, API routes, UI components, i18n strings, and 14 test files with DB migration to drop the column**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-21T18:53:39Z
- **Completed:** 2026-02-21T19:01:47Z
- **Tasks:** 3
- **Files modified:** 30

## Accomplishments
- Removed `intention` from Task, TaskInsert, RecurringTask types and all Zod validation schemas
- Removed intention handling from POST/PATCH task API routes and recurring task logic
- Removed intention form field, "Your Why" detail section, and intention display from dashboard
- Removed intentionLabel, intentionPlaceholder, yourWhy from all 3 locale files (en, zh, zh-TW)
- Updated 14 test files removing intention from mock data, assertions, and intention-specific test cases
- Created DB migration to drop intention column from tasks and recurring_tasks tables
- Zero references to `intention` remain in source code

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove intention from types, validations, API routes, and recurring task logic** - `206ee4c` (feat)
2. **Task 2: Remove intention from UI components and i18n strings** - `a4744e3` (feat)
3. **Task 3: Update all tests and run full test suite** - `33e612c` (test)

## Files Created/Modified
- `lib/db/types.ts` - Removed intention from Task, TaskInsert, RecurringTask interfaces
- `lib/validations/task.ts` - Removed intention from taskFormSchema
- `lib/validations/recurring-task.ts` - Removed intention from create/update schemas
- `app/api/tasks/route.ts` - Removed intention from POST handler taskData
- `app/api/tasks/[id]/route.ts` - Removed intention handling from PATCH handler
- `app/api/recurring-tasks/route.ts` - Removed intention from POST handler
- `lib/recurring-tasks/instance-generator.ts` - Removed intention from instance creation
- `lib/db/recurring-tasks.ts` - Removed intention from scope update template mapping
- `components/tasks/task-form.tsx` - Removed intention FormField, defaultValues, submit
- `components/tasks/task-detail-content.tsx` - Removed "Your Why" section
- `components/tasks/create-task-content.tsx` - Removed intention from recurring task payload
- `components/dashboard/tasks-today.tsx` - Updated qualifiesForReflection, removed intention display
- `i18n/messages/en.json` - Removed 3 intention-related keys
- `i18n/messages/zh.json` - Removed 3 intention-related keys
- `i18n/messages/zh-TW.json` - Removed 3 intention-related keys
- `supabase/migrations/20260221000001_drop_task_intention.sql` - Drop column migration
- 14 test files updated (removed intention from mocks, assertions, and intention-specific tests)

## Decisions Made
- Updated `qualifiesForReflection` to only check `priority === 3` since `intention` no longer exists
- Removed intention from `create-task-content.tsx` recurring task payload (not in plan but caused TS error - Rule 3 auto-fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed create-task-content.tsx intention reference**
- **Found during:** Task 2 (UI component updates)
- **Issue:** `create-task-content.tsx` was not listed in Task 2 files but referenced `data.intention` causing TS error
- **Fix:** Removed `intention: data.intention || null` from the recurring task API payload
- **Files modified:** `components/tasks/create-task-content.tsx`
- **Verification:** `pnpm build` passes
- **Committed in:** a4744e3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary to resolve TypeScript compilation error. No scope creep.

## Issues Encountered
None

## User Setup Required
Migration `20260221000001_drop_task_intention.sql` must be applied to Supabase before deploying.

## Next Phase Readiness
- Codebase is clean with zero intention references
- All tests pass (1319 tests, 98 files)
- Build and lint clean
- Migration ready for deployment

---
## Self-Check: PASSED

- Migration file: FOUND
- SUMMARY.md: FOUND
- Commit 206ee4c (Task 1): FOUND
- Commit a4744e3 (Task 2): FOUND
- Commit 33e612c (Task 3): FOUND
- Intention references in source: 0

---
*Quick Task: 2*
*Completed: 2026-02-21*
