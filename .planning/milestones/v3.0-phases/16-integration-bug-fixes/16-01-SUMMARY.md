---
phase: 16-integration-bug-fixes
plan: 01
subsystem: api
tags: [task-api, typescript, field-forwarding, project-insert, zod]

# Dependency graph
requires:
  - phase: 13-task-management
    provides: Task API routes (POST/PATCH handlers)
  - phase: 14-project-section-layout
    provides: section/project_id fields in Zod schemas and TaskInsert type
provides:
  - POST /api/tasks correctly forwards section and project_id to DB layer
  - PATCH /api/tasks/[id] correctly forwards project_id to DB layer
  - ProjectInsert type with truly optional status and sort_order
  - Unit tests proving field forwarding works
affects: [15-kanban-board, 14-project-section-layout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit field mapping from Zod validation to DB insert/update objects"
    - "Omit-then-re-add pattern for truly optional TypeScript intersection fields"

key-files:
  created: []
  modified:
    - app/api/tasks/route.ts
    - app/api/tasks/[id]/route.ts
    - lib/db/types.ts
    - tests/app/api/tasks/route.test.ts
    - tests/app/api/tasks/[id]/route.test.ts

key-decisions:
  - "Fix ProjectInsert at type level (Omit+re-add) rather than handler level (add status:'active') to prevent same bug in future callers"

patterns-established:
  - "When adding fields to Zod schema, grep ALL handlers using that schema and update field forwarding"

requirements-completed: [FORM-01, FORM-02, PROJ-01, PROJ-03, PAGE-01, PAGE-02]

# Metrics
duration: 1min
completed: 2026-02-21
---

# Phase 16 Plan 01: Forward section/project_id in Task API and Fix ProjectInsert Type Summary

**Fixed POST/PATCH task API field forwarding for section and project_id, and made ProjectInsert status/sort_order truly optional using Omit-then-re-add pattern**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-21T05:55:33Z
- **Completed:** 2026-02-21T05:57:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- POST /api/tasks now correctly forwards `section` and `project_id` from validated request body to TaskInsert object
- PATCH /api/tasks/[id] now correctly forwards `project_id` from validated request body to updates object
- ProjectInsert type makes `status` and `sort_order` truly optional by adding them to the Omit list and re-adding as optional (fixes TypeScript build error)
- 5 new unit tests prove field forwarding works for section, project_id in POST and project_id in PATCH

## Task Commits

Each task was committed atomically:

1. **Task 1: Forward section and project_id in POST/PATCH, fix ProjectInsert type** - `b3310ff` (fix)
2. **Task 2: Add unit tests for section and project_id field forwarding** - `b8d407b` (test)

## Files Created/Modified
- `app/api/tasks/route.ts` - Added section and project_id to taskData object in POST handler
- `app/api/tasks/[id]/route.ts` - Added project_id forwarding in PATCH handler
- `lib/db/types.ts` - Fixed ProjectInsert type to Omit status and sort_order, re-add as optional
- `tests/app/api/tasks/route.test.ts` - Added 3 tests for section/project_id forwarding in POST
- `tests/app/api/tasks/[id]/route.test.ts` - Added 2 tests for project_id forwarding in PATCH

## Decisions Made
- Fixed ProjectInsert at the type level (Omit+re-add) rather than adding `status: 'active' as const` in each handler, preventing the same bug in future callers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 16-02 (kanban SWR cache fix and archived projects navigation)
- All task API field forwarding bugs resolved
- Full test suite passes (1207 tests, 0 failures)
- Build succeeds with zero TypeScript errors

## Self-Check: PASSED

All files exist on disk, all commits verified in git log.

---
*Phase: 16-integration-bug-fixes*
*Completed: 2026-02-21*
