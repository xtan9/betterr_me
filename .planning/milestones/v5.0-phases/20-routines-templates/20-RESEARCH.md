# Phase 20: Routines & Templates - Research

**Researched:** 2026-02-24
**Domain:** Workout routine CRUD, copy-on-start template instantiation, Supabase relational data modeling
**Confidence:** HIGH

## Summary

Phase 20 builds routines on top of an already-complete database schema (tables `routines` and `routine_exercises` created in the Phase 18 migration) and a fully functional workout logging system (Phase 19). The work is primarily **CRUD + UI** with one interesting architectural concern: the "copy-on-start" semantics where starting a workout from a routine deep-copies the routine's exercise list into `workout_exercises` and `workout_sets` at the moment of creation, ensuring later routine edits never affect already-started workouts.

The second notable feature is "save workout as routine" (ROUT-04), which is the reverse operation: reading a completed workout's exercises/sets and inserting them as a new routine. Both operations are server-side bulk inserts that should be wrapped in a single DB class method for atomicity.

**Primary recommendation:** Create a `RoutinesDB` class following the established `CategoriesDB`/`WorkoutsDB` pattern, add API routes at `/api/routines` and `/api/routines/[id]`, and build a routines management UI under `/workouts/routines`. The "start from routine" action should be a server-side endpoint that atomically creates the workout + copies exercises + creates pre-filled sets, returning the full workout. The existing `workoutCreateSchema` already accepts `routine_id` which provides the link.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROUT-01 | User can create a routine with a name and an ordered list of exercises with target sets/reps/weight | DB schema already exists (`routines` + `routine_exercises` tables). Need `RoutinesDB` class, API routes, validation schemas, and routine creation UI with exercise picker |
| ROUT-02 | User can edit and delete routines | Standard CRUD pattern following `CategoriesDB`. API PATCH/DELETE on `/api/routines/[id]`, plus exercise-level CRUD on `/api/routines/[id]/exercises` |
| ROUT-03 | User can start a workout from a routine, which pre-fills exercises and targets (copy-on-start) | Server-side "start from routine" endpoint deep-copies `routine_exercises` into `workout_exercises` + creates pre-filled `workout_sets`. Uses existing `workoutCreateSchema.routine_id`. The copy must be atomic (single request) to prevent partial states |
| ROUT-04 | User can save a completed workout as a new routine template | Server-side "save as routine" endpoint reads workout exercises/sets and bulk-inserts into `routines` + `routine_exercises`. Triggered from workout detail view (Phase 21 UI, but the API can be built now) |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This phase uses the existing stack exclusively.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | existing | Database CRUD for routines/routine_exercises | Already used for all DB operations |
| Zod | existing | Validation schemas for routine API boundaries | Project convention per CLAUDE.md |
| SWR | existing | Client-side data fetching for routines list | Consistent with exercises, workouts |
| react-hook-form + zod | existing | Routine creation/edit form | Project convention for all forms |
| shadcn/ui + Radix UI | existing | Dialog, Sheet, Card, Button, Input components | Project UI primitives |
| next-intl | existing | i18n for routine UI strings (en, zh, zh-TW) | Required for all user-facing strings |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | existing | Icons (LayoutTemplate, Plus, Trash, Edit, Play) | Routine cards and action buttons |
| sonner | existing | Toast notifications for success/error feedback | After CRUD operations |

### Alternatives Considered

None. This phase is pure application-layer CRUD on an existing schema with no new technical domains.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
lib/db/routines.ts                        # RoutinesDB class (NEW)
lib/validations/routine.ts                # Zod schemas (NEW)
lib/hooks/use-routines.ts                 # SWR hook (NEW)
app/api/routines/route.ts                 # GET (list), POST (create)
app/api/routines/[id]/route.ts            # GET (detail), PATCH, DELETE
app/api/routines/[id]/exercises/route.ts  # GET, POST (add exercise)
app/api/routines/[id]/exercises/[reId]/route.ts  # PATCH, DELETE
app/api/routines/[id]/start/route.ts      # POST (start workout from routine)
app/api/workouts/[id]/save-as-routine/route.ts   # POST (save workout as routine)
app/workouts/routines/page.tsx            # Routines list page
components/fitness/routines/              # Routine UI components
  routine-card.tsx                        # Single routine display card
  routine-form.tsx                        # Create/edit form (react-hook-form)
  routine-exercise-list.tsx               # Ordered exercise list within routine
  routine-exercise-picker.tsx             # Reuse WorkoutAddExercise pattern
```

### Pattern 1: RoutinesDB Class (follows CategoriesDB/WorkoutsDB pattern)

**What:** Single DB class encapsulating all routine CRUD, including the "start from routine" copy logic.
**When to use:** All routine database operations.
**Example:**

```typescript
// lib/db/routines.ts
export class RoutinesDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserRoutines(userId: string): Promise<RoutineWithExercises[]> {
    const { data, error } = await this.supabase
      .from("routines")
      .select(`
        *,
        routine_exercises (
          *,
          exercise:exercises (*)
        )
      `)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("sort_order", {
        referencedTable: "routine_exercises",
        ascending: true,
      });
    // reshape and return...
  }

  async createRoutine(userId: string, data: CreateRoutineInput): Promise<Routine> { /* ... */ }
  async updateRoutine(routineId: string, updates: RoutineUpdate): Promise<Routine> { /* ... */ }
  async deleteRoutine(routineId: string): Promise<void> { /* ... */ }
  async addExerciseToRoutine(routineId: string, data: AddRoutineExerciseInput): Promise<RoutineExercise> { /* ... */ }
  async updateRoutineExercise(exerciseId: string, updates: RoutineExerciseUpdate): Promise<RoutineExercise> { /* ... */ }
  async removeRoutineExercise(exerciseId: string): Promise<void> { /* ... */ }

  /**
   * Copy-on-start: Creates a new workout with all routine exercises pre-filled.
   * Atomically creates: workout -> workout_exercises -> workout_sets (pre-filled from targets).
   */
  async startWorkoutFromRoutine(userId: string, routineId: string): Promise<Workout> { /* ... */ }

  /**
   * Reverse operation: Creates a routine from a completed workout's exercises/sets.
   */
  async saveWorkoutAsRoutine(userId: string, workoutId: string, routineName: string): Promise<Routine> { /* ... */ }
}
```

### Pattern 2: Copy-on-Start (Deep Copy at Workout Creation)

**What:** When starting a workout from a routine, the server reads the routine's exercises and creates independent `workout_exercises` + `workout_sets` rows. The workout's `routine_id` FK serves as a back-reference (for display/history) but has no data dependency.
**When to use:** POST `/api/routines/[id]/start`
**Why:** This is the critical architectural decision. The `routine_id` on `workouts` is SET NULL on DELETE, meaning the routine can be edited or deleted without affecting the workout. The deep copy ensures the workout is self-contained.

```typescript
async startWorkoutFromRoutine(userId: string, routineId: string): Promise<Workout> {
  // 1. Fetch routine with exercises
  const routine = await this.getRoutineWithExercises(routineId);
  if (!routine) throw new Error("Routine not found");

  // 2. Create workout with routine_id reference
  const { data: workout, error: wErr } = await this.supabase
    .from("workouts")
    .insert({
      user_id: userId,
      title: routine.name,
      status: "in_progress",
      started_at: new Date().toISOString(),
      routine_id: routineId,
    })
    .select()
    .single();
  if (wErr) throw wErr;

  // 3. Copy exercises with their sort_order and rest_timer
  for (const re of routine.exercises) {
    const { data: we, error: eErr } = await this.supabase
      .from("workout_exercises")
      .insert({
        workout_id: workout.id,
        exercise_id: re.exercise_id,
        sort_order: re.sort_order,
        notes: re.notes,
        rest_timer_seconds: re.rest_timer_seconds,
      })
      .select()
      .single();
    if (eErr) throw eErr;

    // 4. Create pre-filled sets from target_sets
    const sets = [];
    for (let i = 1; i <= re.target_sets; i++) {
      sets.push({
        workout_exercise_id: we.id,
        set_number: i,
        set_type: "normal",
        weight_kg: re.target_weight_kg,
        reps: re.target_reps,
        duration_seconds: re.target_duration_seconds,
        is_completed: false,
      });
    }
    if (sets.length > 0) {
      const { error: sErr } = await this.supabase
        .from("workout_sets")
        .insert(sets);
      if (sErr) throw sErr;
    }
  }

  // 5. Update routine's last_performed_at
  await this.supabase
    .from("routines")
    .update({ last_performed_at: new Date().toISOString() })
    .eq("id", routineId);

  return workout;
}
```

### Pattern 3: Save Workout as Routine (Reverse Copy)

**What:** Read a completed workout's exercises and sets, create a new routine with corresponding `routine_exercises` entries. Uses the best completed set values as targets.
**When to use:** POST `/api/workouts/[id]/save-as-routine`

```typescript
async saveWorkoutAsRoutine(
  userId: string,
  workoutId: string,
  routineName: string
): Promise<Routine> {
  // 1. Fetch workout with exercises and sets
  const workoutsDB = new WorkoutsDB(this.supabase);
  const workout = await workoutsDB.getWorkoutWithExercises(workoutId);
  if (!workout) throw new Error("Workout not found");

  // 2. Create routine
  const { data: routine, error: rErr } = await this.supabase
    .from("routines")
    .insert({ user_id: userId, name: routineName })
    .select()
    .single();
  if (rErr) throw rErr;

  // 3. Copy exercises
  for (const we of workout.exercises) {
    const completedSets = we.sets.filter(s => s.is_completed);
    const maxWeight = Math.max(0, ...completedSets.map(s => s.weight_kg ?? 0));
    const typicalReps = completedSets.length > 0
      ? completedSets[0].reps  // use first completed set's reps as target
      : null;

    await this.supabase
      .from("routine_exercises")
      .insert({
        routine_id: routine.id,
        exercise_id: we.exercise_id,
        sort_order: we.sort_order,
        target_sets: completedSets.length || we.sets.length,
        target_reps: typicalReps,
        target_weight_kg: maxWeight > 0 ? maxWeight : null,
        target_duration_seconds: completedSets[0]?.duration_seconds ?? null,
        rest_timer_seconds: we.rest_timer_seconds,
        notes: we.notes,
      });
  }

  return routine;
}
```

### Pattern 4: Routine Exercise Ordering (Same as Workout Exercises)

**What:** Use the same `sort_order` DOUBLE PRECISION with 65536 gap pattern from workout exercises.
**When to use:** Adding exercises to routines. Enables drag-and-drop reordering later.

### Anti-Patterns to Avoid

- **Lazy-loading routine exercises on the client:** Don't make separate requests for each routine's exercises. Use Supabase's nested select (`routines.select('*, routine_exercises(...)')`) to load everything in one query.
- **Client-side copy-on-start:** Never let the client orchestrate the multi-step copy. The server must own the entire routine->workout+exercises+sets copy to prevent partial states if the user's connection drops mid-copy.
- **Shared state between routine and workout:** The workout must be completely independent after creation. The `routine_id` FK is informational only (SET NULL on DELETE). Never read from the routine to display workout data.
- **Inline routine editing during workout:** Do not allow editing the routine template while a workout is active. These are separate concerns with separate UIs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exercise picker | New exercise picker component | Reuse `WorkoutAddExercise` component (or extract its exercise search/filter into a shared component) | Identical UX: search + filter + select exercises |
| Form validation | Manual validation in API routes | Zod schemas + `validateRequestBody()` | Project convention, consistent error format |
| Optimistic updates | Custom cache management | SWR `mutate()` with optimistic data | Same pattern as `useActiveWorkout` |
| Weight unit display | Manual kg/lbs logic | Existing `displayWeight()`, `toKg()`, `formatWeight()` from `lib/fitness/units.ts` | Already handles all conversion edge cases |

**Key insight:** The routine CRUD is essentially a simpler version of the workout logging system. Routines have no real-time session state, no rest timer, no set completion tracking. They are static templates. The hard part is the copy-on-start atomicity, not the CRUD itself.

## Common Pitfalls

### Pitfall 1: Non-Atomic Copy-on-Start Creates Partial Workouts

**What goes wrong:** If the server creates the workout row but fails to copy exercises/sets (e.g., network error, constraint violation), the user ends up with an empty workout that's not connected to the routine.
**Why it happens:** Sequential INSERT operations without transactional guarantees.
**How to avoid:** Wrap the entire copy-on-start in a single API handler. If any step fails, the Supabase client will return an error, and the handler returns 500. The unique constraint on active workouts (`idx_workouts_active`) prevents duplicate attempts. For extra safety, consider using a Supabase RPC function for true transactional semantics, but the sequential INSERT approach is acceptable for v4.0 given that failures are rare and the user can simply discard and retry.
**Warning signs:** Users reporting empty workouts after starting from a routine.

### Pitfall 2: Forgetting to Handle the "Already Active Workout" Conflict

**What goes wrong:** User tries to start from a routine while they already have an active workout. The unique constraint fires and the error isn't handled gracefully.
**Why it happens:** The same constraint exists for regular workout start (already handled in Phase 19), but the routine start endpoint might forget to handle it.
**How to avoid:** Reuse the same 409 conflict handling from `POST /api/workouts`. The routine start endpoint must catch error code `23505` and return a clear message.
**Warning signs:** 500 errors when starting from routine with active workout.

### Pitfall 3: Exercise Picker State Leak Between Routine Edit and Active Workout

**What goes wrong:** The exercise picker component used in routine editing shares state with the one used in active workout logging, causing wrong exercises to appear or state conflicts.
**Why it happens:** SWR key collision or shared component state.
**How to avoid:** Either extract the exercise search/filter into a stateless presentational component, or use distinct SWR keys. The `WorkoutAddExercise` Sheet component is already self-contained with its own state, so sharing it should be safe if props are managed correctly.
**Warning signs:** Adding an exercise in routine editor affects the workout logger or vice versa.

### Pitfall 4: Routine Deletion While Workout References It

**What goes wrong:** Routine is deleted, but a completed workout still has `routine_id` pointing to it.
**Why it happens:** The FK is ON DELETE SET NULL, so this is actually handled correctly by the schema. The `routine_id` will be set to NULL.
**How to avoid:** Already handled by the schema design. On the UI side, display "Routine deleted" or simply omit the routine name when `routine_id` is NULL on a workout that was started from a routine.
**Warning signs:** None if schema is correct. But test this explicitly.

### Pitfall 5: Missing i18n Keys for All Three Locales

**What goes wrong:** New UI strings added only in `en.json`, causing fallback text or missing translations.
**Why it happens:** Forgetting the project's three-locale requirement (en, zh, zh-TW).
**How to avoid:** Add all routine-related i18n keys to all three locale files in the same plan step. Use a `routines` namespace nested under or alongside `workouts` in the message files.
**Warning signs:** Untranslated strings appearing in non-English locales.

### Pitfall 6: Pre-filled Set Values Not Respecting Exercise Type

**What goes wrong:** Copy-on-start fills `weight_kg` for bodyweight-only exercises or `reps` for duration-only exercises, confusing the user.
**Why it happens:** Blind copy of all target fields without checking exercise type.
**How to avoid:** Use `EXERCISE_FIELD_MAP` from `lib/fitness/exercise-fields.ts` to determine which fields are relevant for each exercise type. Only copy applicable target values.
**Warning signs:** Nonsensical pre-filled values in workout sets.

## Code Examples

### Routine Zod Validation Schemas

```typescript
// lib/validations/routine.ts
import { z } from "zod";

export const routineCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(2000).nullable().optional(),
});

export const routineUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const routineExerciseAddSchema = z.object({
  exercise_id: z.string().uuid(),
  target_sets: z.number().int().min(1).max(20).default(3),
  target_reps: z.number().int().min(0).max(9999).nullable().optional(),
  target_weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  target_duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  rest_timer_seconds: z.number().int().min(0).max(600).default(90),
  notes: z.string().max(2000).nullable().optional(),
});

export const routineExerciseUpdateSchema = z
  .object({
    target_sets: z.number().int().min(1).max(20).optional(),
    target_reps: z.number().int().min(0).max(9999).nullable().optional(),
    target_weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
    target_duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
    rest_timer_seconds: z.number().int().min(0).max(600).optional(),
    notes: z.string().max(2000).nullable().optional(),
    sort_order: z.number().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const saveAsRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
```

### SWR Hook for Routines

```typescript
// lib/hooks/use-routines.ts
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { RoutineWithExercises } from "@/lib/db/types";

export function useRoutines() {
  const { data, error, isLoading, mutate } = useSWR<{
    routines: RoutineWithExercises[];
  }>("/api/routines", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    routines: data?.routines ?? [],
    error,
    isLoading,
    mutate,
  };
}
```

### API Route Pattern (GET + POST Routines)

```typescript
// app/api/routines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoutinesDB } from "@/lib/db/routines";
import { validateRequestBody } from "@/lib/validations/api";
import { routineCreateSchema } from "@/lib/validations/routine";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const routinesDB = new RoutinesDB(supabase);
    const routines = await routinesDB.getUserRoutines(user.id);
    return NextResponse.json({ routines });
  } catch (error) {
    log.error("GET /api/routines error", error);
    return NextResponse.json({ error: "Failed to fetch routines" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const validation = validateRequestBody(body, routineCreateSchema);
    if (!validation.success) return validation.response;

    const routinesDB = new RoutinesDB(supabase);
    const routine = await routinesDB.createRoutine(user.id, validation.data);
    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    log.error("POST /api/routines error", error);
    return NextResponse.json({ error: "Failed to create routine" }, { status: 500 });
  }
}
```

### Routine Card Component Pattern

```typescript
// components/fitness/routines/routine-card.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, MoreHorizontal } from "lucide-react";
import type { RoutineWithExercises } from "@/lib/db/types";

interface RoutineCardProps {
  routine: RoutineWithExercises;
  onStart: (routineId: string) => void;
  onEdit: (routineId: string) => void;
  onDelete: (routineId: string) => void;
}

export function RoutineCard({ routine, onStart, onEdit, onDelete }: RoutineCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{routine.name}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onStart(routine.id)}>
            <Play className="mr-1 h-3 w-3" /> Start
          </Button>
          {/* DropdownMenu with edit/delete options */}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {routine.exercises.length} exercises
        </p>
        {/* Exercise summary list */}
      </CardContent>
    </Card>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side template instantiation | Server-side copy-on-start | Standard practice in workout apps (Hevy, Strong, etc.) | Prevents partial state, ensures atomicity |
| Shared data between template and workout | Deep copy with informational FK back-reference | Schema design decision (Phase 18) | Routine edits never affect existing workouts |

**Deprecated/outdated:**
- None applicable. This is application-layer CRUD with no external library dependencies to version.

## Open Questions

1. **Routine exercise reordering UX**
   - What we know: The `sort_order` column supports reordering. The 65536 gap pattern is used in workout exercises.
   - What's unclear: Whether drag-and-drop reordering should be included in Phase 20 or deferred.
   - Recommendation: Defer drag-and-drop UI to a future phase. For now, exercises are added in order and can be removed/re-added. This keeps Phase 20 scope manageable.

2. **Routine exercise inline editing vs. separate form**
   - What we know: The routine exercise has target_sets, target_reps, target_weight_kg, target_duration_seconds, rest_timer_seconds, and notes fields.
   - What's unclear: Whether each exercise's targets should be editable inline (like workout set rows) or via a dedicated form/dialog.
   - Recommendation: Use inline editable fields in the routine exercise list, similar to how workout set rows work. This provides a faster editing experience. Use `EXERCISE_FIELD_MAP` to show only relevant target fields per exercise type.

3. **Where to mount "Save as Routine" button**
   - What we know: ROUT-04 says "from the workout detail view", which is a Phase 21 feature (HIST-02).
   - What's unclear: Whether to build just the API endpoint in Phase 20 and defer the UI to Phase 21, or build a minimal workout detail view.
   - Recommendation: Build the API endpoint (`POST /api/workouts/[id]/save-as-routine`) in Phase 20. For the UI, add a "Save as Routine" button to the `WorkoutFinishDialog` so users can save immediately after completing a workout. The full workout detail view in Phase 21 can also offer this action.

4. **Routine list placement on workouts page**
   - What we know: The workouts page currently has a "Start Workout" button, a resume banner, and an exercise library card.
   - What's unclear: Whether routines should appear as a separate page (`/workouts/routines`) or inline on the main workouts page.
   - Recommendation: Show routine cards directly on the workouts landing page (`/workouts/page.tsx`) below the existing exercise library card. Each routine card has a "Start" button. A separate `/workouts/routines` page can house the full routine management (create/edit/delete) UI.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `supabase/migrations/20260224000001_create_fitness_tables.sql` - Confirmed `routines` and `routine_exercises` tables already exist with full RLS policies
- Codebase analysis: `lib/db/types.ts` - Confirmed TypeScript types `Routine`, `RoutineExercise`, `RoutineInsert`, `RoutineUpdate`, `RoutineExerciseInsert`, `RoutineWithExercises` already defined
- Codebase analysis: `lib/db/workouts.ts` - Confirmed `startWorkout()` already accepts `routine_id` parameter
- Codebase analysis: `lib/validations/workout.ts` - Confirmed `workoutCreateSchema` already includes `routine_id` field
- Codebase analysis: `lib/db/workout-exercises.ts` - Confirmed workout exercise and set CRUD patterns
- Codebase analysis: `lib/db/categories.ts` - Reference for standard CRUD DB class pattern
- Codebase analysis: `lib/fitness/exercise-fields.ts` - Exercise type to field mapping for target field display

### Secondary (MEDIUM confidence)
- None needed. All research is based on direct codebase analysis.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, pure application-layer CRUD on existing schema
- Architecture: HIGH - Schema, types, and FK relationships already designed and implemented in Phase 18
- Pitfalls: HIGH - Based on direct analysis of existing patterns and constraint behavior

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable — no external dependencies to version)
