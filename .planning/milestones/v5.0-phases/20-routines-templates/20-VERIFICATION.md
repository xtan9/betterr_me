---
phase: 20-routines-templates
verified: 2026-02-24T20:00:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
---

# Phase 20: Routines & Templates Verification Report

**Phase Goal:** Users can create reusable workout templates and start workouts from them
**Verified:** 2026-02-24T20:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Phase Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a routine with a name and an ordered list of exercises with target sets, reps, and weight | VERIFIED | `RoutinesDB.createRoutine` + `addExerciseToRoutine` with sort_order gap pattern; `RoutineForm` dialog with `routineCreateSchema` validation; `POST /api/routines` + `POST /api/routines/[id]/exercises` routes |
| 2 | User can edit and delete existing routines | VERIFIED | `PATCH /api/routines/[id]` + `DELETE /api/routines/[id]` routes; `RoutineForm` dialog in edit mode; `RoutinesPageContent` with delete AlertDialog + confirm flow; `RoutineExerciseList` with inline blur-commit editable targets |
| 3 | User can start a workout from a routine and exercises and targets are pre-filled; editing the routine afterwards does not change the already-started workout | VERIFIED | `POST /api/routines/[id]/start` deep-copies all exercises and pre-fills `workout_sets` rows with target values at start time (copy-on-start pattern); `EXERCISE_FIELD_MAP` filters inapplicable fields per exercise type; 409 returned on active workout conflict (error code 23505); `WorkoutsPageRoutines` and `RoutinesPageContent` both call `/api/routines/[id]/start` and navigate to `/workouts/active` |
| 4 | User can save a completed workout as a new routine template from the workout detail view | VERIFIED | `POST /api/workouts/[id]/save-as-routine` creates a routine from completed workout's exercise data (max weight, first completed reps/duration as targets); guards against in-progress workout with 400; `WorkoutFinishDialog` has expandable "Save as Routine" section with name input pre-filled from workout title, calls the API, shows success toast |

**Score:** 4/4 truths verified

---

### Required Artifacts (All Three Levels)

| Artifact | Exists | Substantive | Wired | Status | Notes |
|----------|--------|-------------|-------|--------|-------|
| `lib/db/routines.ts` | Yes | Yes — 8 real CRUD methods with Supabase queries, sort_order computation, log.error calls | Imported by 3 API routes | VERIFIED | RoutinesDB class with getUserRoutines, getRoutine, createRoutine, updateRoutine, deleteRoutine, addExerciseToRoutine, updateRoutineExercise, removeRoutineExercise |
| `lib/validations/routine.ts` | Yes | Yes — 5 Zod schemas with type exports; routineCreateSchema, routineUpdateSchema, routineExerciseAddSchema, routineExerciseUpdateSchema, saveAsRoutineSchema | Imported by 4 API routes and RoutineForm | VERIFIED | All schemas have proper constraints and .refine() guards |
| `app/api/routines/route.ts` | Yes | Yes — real GET (auth + RoutinesDB.getUserRoutines) + POST (auth + validation + RoutinesDB.createRoutine + 201) | Called by useRoutines SWR hook and RoutineForm | VERIFIED | |
| `app/api/routines/[id]/route.ts` | Yes | Yes — GET + PATCH + DELETE with auth, validation, PGRST116 404 handling | Called by RoutineForm (PATCH) and RoutinesPageContent (DELETE) | VERIFIED | |
| `app/api/routines/[id]/exercises/route.ts` | Yes | Yes — GET + POST with auth, RoutineExerciseAddSchema validation, 201 status | Called by RoutineForm handleAddExercise | VERIFIED | |
| `app/api/routines/[id]/exercises/[reId]/route.ts` | Yes | Yes — PATCH + DELETE with auth and validation | Called by RoutineForm handleUpdateExercise and handleRemoveExercise | VERIFIED | |
| `app/api/routines/[id]/start/route.ts` | Yes | Yes — Full copy-on-start: fetches routine, inserts workout with routine_id, iterates exercises to insert workout_exercises + pre-filled workout_sets using EXERCISE_FIELD_MAP, updates last_performed_at, handles 409 via 23505 error code | Called by WorkoutsPageRoutines and RoutinesPageContent | VERIFIED | |
| `app/api/workouts/[id]/save-as-routine/route.ts` | Yes | Yes — Fetches workout with exercises+sets, guards in-progress status (400), creates routine, inserts routine_exercises with best-set values extracted from completedSets | Called by WorkoutFinishDialog | VERIFIED | |
| `lib/hooks/use-routines.ts` | Yes | Yes — useSWR with /api/routines, 30s dedup, returns routines/error/isLoading/mutate | Used by WorkoutsPageRoutines, RoutinesPageContent, RoutineForm | VERIFIED | |
| `components/fitness/routines/routine-card.tsx` | Yes | Yes — Renders Card with name, exercise count, last performed date, first 5 exercises with target summary (3x10 / 3x30s), Start button, DropdownMenu with Edit/Delete | Used by WorkoutsPageRoutines and RoutinesPageContent | VERIFIED | |
| `components/fitness/routines/routine-form.tsx` | Yes | Yes — Dialog with react-hook-form + zodResolver, create/edit modes, exercise management via WorkoutAddExercise picker, fetch to POST/PATCH, toast feedback, mutate | Used by RoutinesPageContent | VERIFIED | |
| `components/fitness/routines/routine-exercise-list.tsx` | Yes | Yes — Inline editable exercise rows with EXERCISE_FIELD_MAP-aware field visibility (weight/reps/duration), blur-commit pattern with toKg/displayWeight unit conversion, remove button | Used by RoutineForm (edit mode) | VERIFIED | |
| `components/fitness/routines/routines-page-content.tsx` | Yes | Yes — Client component with grid, empty state, delete AlertDialog, RoutineForm dialog, start/edit/delete handlers | Used by /workouts/routines page | VERIFIED | |
| `app/workouts/routines/page.tsx` | Yes | Yes — Server component using getTranslations + PageHeader + RoutinesPageContent | Route accessible at /workouts/routines | VERIFIED | |
| `components/fitness/workouts-page-routines.tsx` | Yes | Yes — useRoutines hook, up to 3 RoutineCard components, loading skeleton, empty state with dashed border link, Manage Routines link, handleStart calling /api/routines/[id]/start | Rendered in app/workouts/page.tsx | VERIFIED | |
| `components/fitness/workout-logger/workout-finish-dialog.tsx` | Yes | Yes — Save as Routine expandable section with LayoutTemplate icon, name input (pre-filled from workout.title), Save button calling /api/workouts/[id]/save-as-routine, success/error toasts, only shown when workout has exercises | Used by active workout logger | VERIFIED | |
| `i18n/messages/en.json` | Yes | Yes — 67-key routines namespace + workouts.routinesSection + workouts.manageRoutines | Used via useTranslations("routines") | VERIFIED | |
| `i18n/messages/zh.json` | Yes | Yes — 67-key routines namespace (Simplified Chinese) + workouts section keys | Used via locale switching | VERIFIED | |
| `i18n/messages/zh-TW.json` | Yes | Yes — 67-key routines namespace (Traditional Chinese) + workouts section keys | Used via locale switching | VERIFIED | |

---

### Key Link Verification

| From | To | Via | Status | Detail |
|------|----|-----|--------|--------|
| `app/api/routines/route.ts` | `lib/db/routines.ts` | `new RoutinesDB(supabase)` | WIRED | Line 23: `const routinesDB = new RoutinesDB(supabase)` |
| `app/api/routines/route.ts` | `lib/validations/routine.ts` | `validateRequestBody(body, routineCreateSchema)` | WIRED | Lines 4-5, 52 |
| `app/api/routines/[id]/start/route.ts` | `lib/db/routines.ts` | `RoutinesDB.getRoutine + workout_exercises insert` | WIRED | Lines 3, 30-31, 71-80 |
| `app/api/routines/[id]/start/route.ts` | `lib/fitness/exercise-fields` | `EXERCISE_FIELD_MAP` field filtering | WIRED | Lines 4, 90, 98-101 |
| `lib/hooks/use-routines.ts` | `app/api/routines/route.ts` | `useSWR("/api/routines", fetcher)` | WIRED | Line 12 |
| `components/fitness/routines/routine-form.tsx` | `app/api/routines/route.ts` | `fetch("/api/routines", { method: "POST/PATCH" })` | WIRED | Lines 147-150 |
| `app/workouts/page.tsx` | `lib/hooks/use-routines.ts` | `WorkoutsPageRoutines` (which uses `useRoutines`) | WIRED | Line 15, 29 |
| `components/fitness/workout-logger/workout-finish-dialog.tsx` | `app/api/workouts/[id]/save-as-routine/route.ts` | `fetch("/api/workouts/${workout.id}/save-as-routine", POST)` | WIRED | Line 94 |
| `components/fitness/workouts-page-routines.tsx` | `app/api/routines/[id]/start/route.ts` | `fetch("/api/routines/${routineId}/start", POST)` | WIRED | Line 26 |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ROUT-01 | 20-01, 20-02, 20-03 | User can create a routine with a name and an ordered list of exercises with target sets/reps/weight | SATISFIED | RoutinesDB.createRoutine + addExerciseToRoutine; RoutineForm dialog; /api/routines POST; RoutineExerciseList with target fields; all three locale files have creation strings |
| ROUT-02 | 20-01, 20-02, 20-03 | User can edit and delete routines | SATISFIED | PATCH/DELETE /api/routines/[id]; RoutineForm edit mode; inline exercise editing via RoutineExerciseList; delete AlertDialog in RoutinesPageContent |
| ROUT-03 | 20-02, 20-03 | User can start a workout from a routine, which pre-fills exercises and targets (copy-on-start) | SATISFIED | POST /api/routines/[id]/start creates workout + deep-copies exercises + pre-fills sets with target values via EXERCISE_FIELD_MAP; WorkoutsPageRoutines + RoutinesPageContent both implement the start flow |
| ROUT-04 | 20-02, 20-03 | User can save a completed workout as a new routine template | SATISFIED | POST /api/workouts/[id]/save-as-routine; WorkoutFinishDialog "Save as Routine" expandable section with name input and API integration |

All 4 requirements fully satisfied. No orphaned requirements detected.

---

### Anti-Patterns Found

None. The scan of all 14+ phase files found no TODO/FIXME/placeholder comments, no empty implementations (`return null`, `return {}`, `return []`), no console.log-only handlers. The `return null` on line 78 of `lib/db/routines.ts` is a legitimate PGRST116 (not-found) guard, not a stub.

---

### Human Verification Required

The following behaviors cannot be verified programmatically and should be validated manually:

#### 1. Create Routine -> Add Exercises -> Start Workout End-to-End Flow

**Test:** Log in, navigate to /workouts/routines. Click "Create Routine", enter a name, submit. Click Edit on the new routine, add 2-3 exercises (e.g., one strength, one bodyweight). Set target sets/reps/weight. Go to /workouts, click "Start" on the routine card.
**Expected:** Active workout opens at /workouts/active with the exercises pre-added and sets pre-filled with the target values from the routine.
**Why human:** Copy-on-start creates database rows at the Supabase level; verifying the workout logger UI displays the pre-filled sets requires a real authenticated session.

#### 2. Editing Routine Does Not Affect In-Progress Workout

**Test:** Start a workout from a routine (creates a copy). Go back to /workouts/routines, edit the routine and change target reps. Return to the active workout.
**Expected:** The active workout's sets are unchanged — they show the original targets captured at start time, not the updated routine values.
**Why human:** Requires two database states (workout snapshot vs updated routine) that need a live session to verify the UI correctly shows the original values.

#### 3. Save as Routine from Finish Dialog

**Test:** Complete a workout (log some sets). Click "Finish Workout". Click "Save as Routine" in the dialog, enter a name, click Save.
**Expected:** Toast shows "Workout saved as routine". Navigate to /workouts/routines and see the new routine with exercises matching the workout, with target values derived from the best completed sets.
**Why human:** Requires a completed workout with logged set data to test best-set extraction logic in the UI context.

#### 4. 409 Active Workout Conflict Toast

**Test:** Have an active workout in progress. Navigate to /workouts, click "Start" on any routine card.
**Expected:** Toast appears saying the user already has an active workout (not a crash or navigation).
**Why human:** Requires a real active workout state in the database to trigger the 409 response path.

#### 5. i18n Locale Switching for Routine UI

**Test:** Switch locale to zh (Simplified Chinese) or zh-TW (Traditional Chinese). Navigate to /workouts and /workouts/routines.
**Expected:** All routine UI strings appear in the correct language (routine title, empty state, button labels, target field labels).
**Why human:** Requires the i18n cookie/locale switching mechanism active in a browser session.

---

## Gaps Summary

No gaps. All 4 success criteria are verified against the actual codebase.

All 19 artifacts exist with substantive implementations (no stubs detected). All 9 key links are wired (imports and calls confirmed). All 4 requirement IDs are satisfied. All 7 documented commits exist in git history. Three locale files each have 67 routine translation keys plus workouts-namespace section keys.

The copy-on-start implementation correctly:
- Deep-copies exercises and sets at start time (future routine edits cannot affect the copy)
- Uses EXERCISE_FIELD_MAP to null out inapplicable fields per exercise type
- Returns 409 via Postgres unique constraint error code 23505 when an active workout already exists
- Updates `last_performed_at` on the routine after a successful start

The save-as-routine implementation correctly:
- Guards against saving in-progress workouts (400 status)
- Extracts best-set values (max weight, first completed reps/duration) as targets
- Computes sort_order with sequential 65536 gaps

---

_Verified: 2026-02-24T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
