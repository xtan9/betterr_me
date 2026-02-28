---
phase: 18-database-foundation-exercise-library
plan: 02
subsystem: api, ui
tags: [supabase, exercise-crud, swr, react-hook-form, zod, client-side-filter, shadcn]

# Dependency graph
requires:
  - phase: 18-01
    provides: Exercise TypeScript types, Zod validation schemas, exercise-fields mapping, 92 seeded preset exercises
provides:
  - ExercisesDB class with 5 CRUD methods
  - Exercise API routes (GET list, POST create, GET/PATCH/DELETE single)
  - useExercises SWR hook with 10-min dedup
  - Exercise library UI (browsing, search, filter, create/edit/delete custom)
affects: [18-03, 19-workout-session-ui, 20-exercise-library-routines]

# Tech tracking
tech-stack:
  added: []
  patterns: [rls-visibility-no-explicit-filter, client-side-exercise-filtering, exercise-form-dialog]

key-files:
  created:
    - lib/db/exercises.ts
    - app/api/exercises/route.ts
    - app/api/exercises/[id]/route.ts
    - lib/hooks/use-exercises.ts
    - components/fitness/exercise-library/exercise-library.tsx
    - components/fitness/exercise-library/exercise-card.tsx
    - components/fitness/exercise-library/exercise-filter-bar.tsx
    - components/fitness/exercise-library/exercise-form.tsx
  modified:
    - lib/db/index.ts
    - lib/validations/exercise.ts

key-decisions:
  - "ExercisesDB relies entirely on RLS for visibility — no explicit user_id filter in SELECT queries"
  - "Fixed exerciseFormSchema to use plain required array instead of .default([]) to resolve zodResolver input/output type mismatch"
  - "CreateExerciseInput interface defined separately from ExerciseInsert to decouple Zod output from DB types"

patterns-established:
  - "Exercise CRUD: RLS handles preset visibility (user_id IS NULL OR auth.uid()) — DB class just selects all"
  - "Client-side filtering: load all exercises via SWR, filter in useMemo with Array.filter()"
  - "Exercise form in dialog: react-hook-form + zodResolver + shadcn Dialog for create/edit"

requirements-completed: [EXER-01, EXER-02, EXER-03, EXER-04, EXER-05]

# Metrics
duration: 12min
completed: 2026-02-23
---

# Phase 18 Plan 02: Exercise Library CRUD & UI Summary

**ExercisesDB class, exercise API routes with RLS-based preset protection, SWR hook, and 4-component exercise library UI with instant client-side search and filtering**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-23T21:36:52Z
- **Completed:** 2026-02-23T21:49:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- ExercisesDB class with 5 CRUD methods (getAllExercises, getExercise, createExercise, updateExercise, deleteExercise) following existing DB class pattern
- Exercise API routes: GET/POST /api/exercises and GET/PATCH/DELETE /api/exercises/[id] with Zod validation, RLS error handling (403 for preset modification), and FK violation handling (409 for exercises used in workouts)
- useExercises SWR hook with 10-minute dedup interval for efficient client-side caching
- Exercise library UI: browsable list grouped by muscle group, instant client-side search and filtering (no server round-trips per EXER-02), create/edit dialog form, delete with confirmation, preset exercises read-only

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExercisesDB class, API routes, and SWR hook** - `e695fbb` (feat)
2. **Task 2: Build exercise library UI components** - `15cefa1` (feat)

## Files Created/Modified
- `lib/db/exercises.ts` - ExercisesDB class with 5 CRUD methods, CreateExerciseInput interface
- `lib/db/index.ts` - Added ExercisesDB barrel export
- `app/api/exercises/route.ts` - GET (list all) and POST (create custom) endpoints
- `app/api/exercises/[id]/route.ts` - GET, PATCH, DELETE single exercise with RLS error handling
- `lib/hooks/use-exercises.ts` - useExercises SWR hook with 10-min dedup
- `components/fitness/exercise-library/exercise-library.tsx` - Main browsing component with client-side filtering
- `components/fitness/exercise-library/exercise-card.tsx` - Exercise display card with badges and action menu
- `components/fitness/exercise-library/exercise-filter-bar.tsx` - Search input, muscle group and equipment dropdowns
- `components/fitness/exercise-library/exercise-form.tsx` - Create/edit dialog form with react-hook-form + Zod
- `lib/validations/exercise.ts` - Fixed muscle_groups_secondary schema (plain required array)

## Decisions Made
- ExercisesDB relies entirely on Supabase RLS for visibility filtering — the SELECT query has no explicit user_id condition, because the RLS policy handles `user_id IS NULL OR auth.uid() = user_id` automatically
- Created a separate `CreateExerciseInput` interface for the createExercise method parameter, decoupling it from `ExerciseInsert` to avoid Zod input/output type conflicts
- Fixed `exerciseFormSchema` to use plain required `MuscleGroup[]` instead of `.default([])` which caused a type mismatch between zodResolver's input type and react-hook-form's output type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod schema input/output type mismatch with zodResolver**
- **Found during:** Task 2 (Exercise form component)
- **Issue:** `exerciseFormSchema` used `.default([])` for `muscle_groups_secondary`, which creates different input/output types. `zodResolver` uses the input type (optional), but `useForm<ExerciseFormValues>` expects the output type (required array), causing TypeScript build failure.
- **Fix:** Changed from `.array().default([])` to plain `.array()` (required). Form `defaultValues` provides `[]`.
- **Files modified:** `lib/validations/exercise.ts`
- **Verification:** `pnpm build` succeeds, all 1311 tests pass
- **Committed in:** 15cefa1 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added zh-TW exercise i18n translations**
- **Found during:** Task 2 (before creating UI components)
- **Issue:** `zh-TW.json` was missing the entire exercises and workouts i18n namespace (zh and en already had them from 18-01/18-03)
- **Fix:** Already resolved by concurrent plan 18-03 execution (detected on re-read that linter had synced the file)
- **Files modified:** None additional (already handled)
- **Verification:** All three locale files contain complete exercises namespace

---

**Total deviations:** 1 auto-fixed (1 bug fix). 1 detected but already resolved.
**Impact on plan:** Bug fix was necessary for build success. No scope creep.

## Issues Encountered
- The `ExerciseInsert` type from `Omit<Exercise, ...>` and the Zod schema output type were not directly assignable due to `muscle_groups_secondary` being optional in Zod's `.default()` input type. Resolved by creating a dedicated `CreateExerciseInput` interface for the DB class and simplifying the Zod schema.

## User Setup Required

None - no external service configuration required. Database migrations must be applied to Supabase before features work in production (pre-existing blocker tracked in STATE.md).

## Next Phase Readiness
- Exercise library fully functional: browse, search, filter, create, edit, delete
- ExercisesDB and useExercises hook ready for workout session exercise picker (Phase 19)
- Exercise card component reusable for exercise selection in workout context
- All existing tests pass (98 files, 1311 tests, 0 regressions)

## Self-Check: PASSED

- All 10 files verified as existing on disk
- All 2 task commits verified in git log (e695fbb, 15cefa1)

---
*Phase: 18-database-foundation-exercise-library*
*Completed: 2026-02-23*
