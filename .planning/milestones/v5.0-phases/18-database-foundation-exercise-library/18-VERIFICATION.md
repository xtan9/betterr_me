---
phase: 18-database-foundation-exercise-library
verified: 2026-02-23T22:30:00Z
status: passed
score: 6/6 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 2/6
  gaps_closed:
    - "User can browse ~80-120 preset exercises organized by muscle group and equipment"
    - "User can search exercises by name and filter by muscle group or equipment type"
    - "User can create a custom exercise via the Create button (entry point now accessible)"
    - "User can edit and delete their own custom exercises (entry point now accessible)"
  gaps_remaining: []
  regressions: []
---

# Phase 18: Database Foundation & Exercise Library — Verification Report

**Phase Goal:** Users can browse, search, and manage exercises — and the schema that all future phases build on is locked
**Verified:** 2026-02-23T22:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure via Plan 18-04 (commit bdf33a3)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can browse ~80-120 preset exercises organized by muscle group and equipment, visible to all authenticated users | VERIFIED | `app/workouts/exercises/page.tsx` imports and renders `<ExerciseLibrary />`. ExerciseLibrary is no longer orphaned. The /workouts landing page Card links to /workouts/exercises. |
| 2 | User can search exercises by name and filter by muscle group or equipment type without any server round-trips on each keystroke | VERIFIED | ExerciseLibrary client-side filtering (useMemo + Array.filter) is now reachable via the /workouts/exercises route. No regression in filtering logic. |
| 3 | User can create a custom exercise with a name, primary muscle group, equipment, and exercise type — and the exercise appears only for that user | VERIFIED | ExerciseLibrary (with Create Custom Exercise button) is mounted at /workouts/exercises. POST /api/exercises and ExerciseForm remain fully wired. Entry point is now accessible. |
| 4 | User can edit and delete their own custom exercises; preset exercises cannot be edited or deleted | VERIFIED | ExerciseCard edit/delete menu is rendered within ExerciseLibrary, which is now on a live page route. PATCH/DELETE /api/exercises/[id] remain implemented. RLS enforces preset protection at DB level. |
| 5 | User can select kg or lbs in Settings and all weight displays and inputs reflect the chosen unit | VERIFIED | WeightUnitSelector in settings-content.tsx saves via PATCH /api/profile/preferences. preferencesSchema includes weight_unit. units.ts exports displayWeight/toKg/formatWeight. No regression. |
| 6 | Schema that all future phases build on is locked | VERIFIED | 6 fitness tables in migration with correct RLS, constraints, indexes, triggers. 92 preset exercises seeded. TypeScript types match SQL. No regression. |

**Score:** 6/6 truths verified

---

## Required Artifacts

### Plan 18-01 Artifacts (Regression Check — Previously Verified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260224000001_create_fitness_tables.sql` | 6 fitness tables with RLS, constraints, indexes, triggers | VERIFIED | File present. No regression. |
| `supabase/migrations/20260224000002_seed_preset_exercises.sql` | ~100 preset exercises covering all muscle groups | VERIFIED | File present. No regression. |
| `lib/db/types.ts` | Exercise, Workout, WorkoutSet, Routine and related types | VERIFIED | File present. No regression. |
| `lib/fitness/units.ts` | displayWeight, toKg, formatWeight conversion functions | VERIFIED | File present. No regression. |
| `lib/fitness/exercise-fields.ts` | EXERCISE_FIELD_MAP with ExerciseFieldConfig for all 8 exercise types | VERIFIED | File present. No regression. |
| `lib/validations/exercise.ts` | exerciseFormSchema, ExerciseFormValues, exerciseUpdateSchema | VERIFIED | File present. No regression. |

### Plan 18-02 Artifacts (Regression Check — Previously Verified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/db/exercises.ts` | ExercisesDB class with 5 CRUD methods | VERIFIED | File present. No regression. |
| `lib/db/index.ts` | Barrel export including ExercisesDB | VERIFIED | File present. No regression. |
| `app/api/exercises/route.ts` | GET list and POST create exercise endpoints | VERIFIED | File present. No regression. |
| `app/api/exercises/[id]/route.ts` | GET, PATCH, DELETE single exercise endpoints | VERIFIED | File present. No regression. |
| `lib/hooks/use-exercises.ts` | useExercises SWR hook | VERIFIED | File present. No regression. |
| `components/fitness/exercise-library/exercise-library.tsx` | Main exercise library browsing component | VERIFIED | Fully implemented. Now imported and rendered by `app/workouts/exercises/page.tsx` (line 3, line 11). No longer orphaned. |
| `components/fitness/exercise-library/exercise-card.tsx` | Individual exercise display card | VERIFIED | Imported by exercise-library.tsx. Transitively reachable via the new page route. |
| `components/fitness/exercise-library/exercise-filter-bar.tsx` | Muscle group and equipment filter controls | VERIFIED | Imported by exercise-library.tsx. Transitively reachable via the new page route. |
| `components/fitness/exercise-library/exercise-form.tsx` | Create and edit custom exercise form | VERIFIED | Imported by exercise-library.tsx. Transitively reachable via the new page route. |

### Plan 18-03 Artifacts (Regression Check — Previously Verified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/settings/weight-unit-selector.tsx` | kg/lbs toggle component for settings page | VERIFIED | File present. No regression. |
| `components/settings/settings-content.tsx` | Settings page with WeightUnitSelector added | VERIFIED | File present. No regression. |
| `components/layouts/app-sidebar.tsx` | Sidebar with Workouts nav item using Dumbbell icon | VERIFIED | Dumbbell icon at lines 10 and 58. No regression. |
| `app/workouts/page.tsx` | Updated workouts landing page with exercise library card and link | VERIFIED | Now a substantive Card-based navigation page with Library icon, exerciseLibrary/exerciseLibraryDescription/browse i18n keys, and a Link to /workouts/exercises (line 37). |
| `app/workouts/layout.tsx` | Layout wrapper for workouts section | VERIFIED | File present. No regression. |
| `i18n/messages/en.json` | workouts nav, exercises namespace, settings.weightUnit | VERIFIED | New keys exerciseLibrary, exerciseLibraryDescription, browse present at lines 894-896. |
| `i18n/messages/zh.json` | Simplified Chinese translations | VERIFIED | New keys present at lines 894-896 with Chinese translations. |
| `i18n/messages/zh-TW.json` | Traditional Chinese translations | VERIFIED | New keys present at lines 894-896 with Traditional Chinese translations. |
| `lib/validations/preferences.ts` | weight_unit added to preferencesSchema | VERIFIED | File present. No regression. |

### Plan 18-04 Artifacts (Gap Closure)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/workouts/exercises/page.tsx` | Server component page rendering ExerciseLibrary | VERIFIED | File exists. 14 lines. Imports ExerciseLibrary from correct path, calls `getTranslations("exercises")`, renders `<PageHeader title={t("title")} />` and `<ExerciseLibrary />`. No stub patterns. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/workouts/exercises/page.tsx` | `components/fitness/exercise-library/exercise-library.tsx` | import and render ExerciseLibrary | WIRED | import line 3; `<ExerciseLibrary />` line 11. Grep confirms: only match in `app/` is this import and render. |
| `app/workouts/page.tsx` | `app/workouts/exercises/page.tsx` | Link href="/workouts/exercises" | WIRED | `<Link href="/workouts/exercises">` at line 37. |
| `components/fitness/exercise-library/exercise-library.tsx` | `lib/hooks/use-exercises.ts` | useExercises() hook call | WIRED | Previously verified. No regression. |
| `lib/hooks/use-exercises.ts` | `app/api/exercises/route.ts` | SWR fetch to /api/exercises | WIRED | Previously verified. No regression. |
| `app/api/exercises/route.ts` | `lib/db/exercises.ts` | new ExercisesDB instantiation | WIRED | Previously verified. No regression. |
| `components/settings/settings-content.tsx` | `components/settings/weight-unit-selector.tsx` | imports and renders WeightUnitSelector | WIRED | Previously verified. No regression. |
| `components/layouts/app-sidebar.tsx` | `app/workouts/page.tsx` | href='/workouts' in mainNavItems | WIRED | Previously verified. No regression. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| EXER-01 | 18-01, 18-02, 18-04 | User can browse a preset exercise library of 80-120 common exercises organized by muscle group and equipment | SATISFIED | 92 exercises seeded. ExerciseLibrary (with muscle group grouping) is now mounted at /workouts/exercises. Workouts landing page provides a Browse link. |
| EXER-02 | 18-02, 18-04 | User can search exercises by name and filter by muscle group and equipment type | SATISFIED | ExerciseFilterBar with client-side useMemo filtering is reachable at /workouts/exercises. |
| EXER-03 | 18-02, 18-04 | User can create custom exercises with name, primary muscle group, equipment, and exercise type | SATISFIED | ExerciseForm + POST /api/exercises fully wired. Create button inside ExerciseLibrary is now accessible at /workouts/exercises. |
| EXER-04 | 18-02, 18-04 | User can edit and delete their custom exercises | SATISFIED | ExerciseCard edit/delete menu + PATCH/DELETE /api/exercises/[id] implemented. RLS enforces preset protection. Accessible at /workouts/exercises. |
| EXER-05 | 18-01, 18-02 | Each exercise has an exercise type that determines tracking fields | SATISFIED | exercise_type column with 8-value CHECK constraint. EXERCISE_FIELD_MAP covers all 8 types. ExerciseCard displays tracking fields. |
| SETT-01 | 18-03 | User can select weight unit preference (kg or lbs) in settings | SATISFIED | WeightUnitSelector in settings, saves via /api/profile/preferences. |
| SETT-02 | 18-01, 18-03 | All weight displays and inputs respect the user's unit preference (stored as kg internally) | SATISFIED (infrastructure) | preferencesSchema includes weight_unit. units.ts provides displayWeight/toKg/formatWeight. Workout weight UIs are Phase 19 scope. |
| SETT-03 | 18-03 | Workouts page appears as a top-level sidebar nav item with Dumbbell icon | SATISFIED | Dumbbell icon, /workouts href, "workouts" labelKey confirmed in app-sidebar.tsx. |

All 8 requirements satisfied. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `app/workouts/page.tsx` | "comingSoon" section for workout logging | Info | Intentional — workout logging is Phase 19 scope. The exercise library card is substantive and functional. |

No blocker anti-patterns in any gap-closure files.

---

## Human Verification Required

### 1. Weight Unit Preference Persistence

**Test:** Log in, go to Settings, change weight unit from kg to lbs, save, then refresh the page.
**Expected:** Weight unit selector shows "lbs" after refresh.
**Why human:** Requires live Supabase session with actual database writes/reads.

### 2. Exercise Library End-to-End Browse Flow

**Test:** Navigate to /workouts via sidebar. Click the Browse button on the Exercise Library card. Verify the exercise library page loads with exercises grouped by muscle group.
**Expected:** Exercise list shows ~92 preset exercises, filter controls work, Create Custom Exercise button is visible.
**Why human:** Requires a live Supabase session with seeded data and network request to /api/exercises.

### 3. Preset Exercise Read-Only Enforcement

**Test:** As a logged-in user, attempt to PATCH or DELETE any preset exercise (user_id IS NULL) via the API.
**Expected:** Returns 403 "Cannot modify preset exercises" / "Cannot delete preset exercises".
**Why human:** Requires a live Supabase instance with RLS active.

---

## Re-verification Summary

**Previous status:** gaps_found (2/6 truths verified)
**Root cause of all 4 gaps:** `app/workouts/exercises/page.tsx` was never created in Plans 18-01 through 18-03.
**Fix applied:** Plan 18-04 (commit bdf33a3) created the page file and updated the workouts landing page with a discovery card.

**All 4 gaps are closed:**

1. `app/workouts/exercises/page.tsx` exists (14 lines, substantive, no stubs).
2. It imports `ExerciseLibrary` from the correct path and renders it — the component is no longer orphaned.
3. `app/workouts/page.tsx` now contains a Card with a `<Link href="/workouts/exercises">` making the library discoverable.
4. All three locale files (en, zh, zh-TW) have the 3 new i18n keys required by the landing page.

**No regressions found** in any of the 20 previously-verified artifacts.

---

_Verified: 2026-02-23T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
