# Architecture Patterns

**Domain:** Fitness tracking (Hevy-inspired workout logging) integration into existing BetterR.Me habit/task management app
**Researched:** 2026-02-23

## Recommended Architecture

### High-Level Integration Overview

The fitness tracking feature integrates into the established `DB class -> API route -> SWR hook -> React component` data flow. Five new Supabase tables, four new DB classes, a new top-level "Workouts" page, and a weight_unit preference extension to the existing profile system. No new architectural patterns are introduced -- every piece follows conventions already proven in the codebase.

```
                            EXISTING                                 NEW (v4.0)
                     +-------------------+                   +-------------------------+
                     |  Dashboard        |                   |  Workouts Page          |
                     |  Habits / Tasks   |                   |  Workout Logger         |
                     |  Settings         |                   |  Exercise Library       |
                     +-------------------+                   |  Routine Templates      |
                            |                                |  Progress Charts        |
                     SWR hooks (existing)                    +-------------------------+
                            |                                           |
                            v                                    SWR hooks (new)
                     +-------------------+                   useWorkouts()
                     | /api/habits       |                   useExercises()
                     | /api/tasks        |                   useRoutines()
                     | /api/dashboard    |                   useWorkoutDetail()
                     | /api/profile      |                   useExerciseHistory()
                     +-------------------+                           |
                            |                                        v
                            v                                +-------------------------+
                     +-------------------+                   | /api/workouts           |
                     | HabitsDB          |                   | /api/workouts/[id]      |
                     | TasksDB           |                   | /api/workouts/active    |
                     | ProfilesDB        |                   | /api/exercises          |
                     +-------------------+                   | /api/exercises/[id]     |
                            |                                | /api/routines           |
                            v                                | /api/routines/[id]      |
                     +-------------------+                   | /api/profile/preferences|
                     | profiles          |                   +-------------------------+
                     | habits            |                           |
                     | tasks             |                           v
                     | projects          |                   +-------------------------+
                     | categories        |                   | WorkoutsDB              |
                     +-------------------+                   | ExercisesDB             |
                                                             | WorkoutExercisesDB      |
                                                             | RoutinesDB              |
                                                             | ProfilesDB (extended)   |
                                                             +-------------------------+
                                                                    |
                                                                    v
                                                             +-------------------------+
                                                             | exercises               |
                                                             | workouts                |
                                                             | workout_exercises       |
                                                             | workout_sets            |
                                                             | routines                |
                                                             | routine_exercises       |
                                                             | profiles (+ weight_unit)|
                                                             +-------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `ExercisesDB` | CRUD for exercises table, search/filter by muscle group and equipment | Supabase client | **NEW** |
| `WorkoutsDB` | CRUD for workouts, workout_exercises, workout_sets; active session management | Supabase client | **NEW** |
| `WorkoutExercisesDB` | Manage exercises within a workout, set ordering, set CRUD | Supabase client | **NEW** |
| `RoutinesDB` | CRUD for routine templates and routine_exercises | Supabase client | **NEW** |
| `ProfilesDB` (extended) | Add weight_unit to preferences | Supabase client | **MODIFIED** |
| `/api/exercises/route.ts` | GET (list/search), POST (create custom) | ExercisesDB | **NEW** |
| `/api/exercises/[id]/route.ts` | GET/PATCH/DELETE single exercise | ExercisesDB | **NEW** |
| `/api/workouts/route.ts` | GET (list), POST (start new workout) | WorkoutsDB | **NEW** |
| `/api/workouts/[id]/route.ts` | GET/PATCH/DELETE single workout | WorkoutsDB | **NEW** |
| `/api/workouts/active/route.ts` | GET current in-progress workout | WorkoutsDB | **NEW** |
| `/api/workouts/[id]/exercises/route.ts` | POST add exercise to workout, GET exercises in workout | WorkoutExercisesDB | **NEW** |
| `/api/workouts/[id]/exercises/[exerciseId]/sets/route.ts` | POST add set, PATCH update set, DELETE remove set | WorkoutExercisesDB | **NEW** |
| `/api/routines/route.ts` | GET (list), POST (create from workout or scratch) | RoutinesDB | **NEW** |
| `/api/routines/[id]/route.ts` | GET/PATCH/DELETE single routine | RoutinesDB | **NEW** |
| `useWorkouts()` | SWR hook for workout history list | `/api/workouts` | **NEW** |
| `useWorkoutDetail()` | SWR hook for single workout with exercises and sets | `/api/workouts/[id]` | **NEW** |
| `useActiveWorkout()` | SWR hook for current in-progress workout | `/api/workouts/active` | **NEW** |
| `useExercises()` | SWR hook for exercise library with search/filter | `/api/exercises` | **NEW** |
| `useExerciseHistory()` | SWR hook for per-exercise progression data | `/api/exercises/[id]/history` | **NEW** |
| `useRoutines()` | SWR hook for routine templates list | `/api/routines` | **NEW** |
| `AppSidebar` | Add "Workouts" nav item (Dumbbell icon) | Navigation config | **MODIFIED** |
| `SettingsContent` | Add weight unit selector (kg/lbs) | Profile preferences | **MODIFIED** |

## Data Model

### Entity Relationship Diagram

```
profiles (existing)
  |-- preferences.weight_unit (NEW field: "kg" | "lbs")
  |
  |-- exercises (NEW)
  |     |-- id, user_id (NULL for preset), name, muscle_group_primary,
  |     |   muscle_groups_secondary[], equipment, exercise_type, is_custom
  |     |
  |     +-- workout_exercises (NEW, join table)
  |           |-- id, workout_id, exercise_id, sort_order, notes, rest_timer_seconds
  |           |
  |           +-- workout_sets (NEW)
  |                 |-- id, workout_exercise_id, set_number, set_type,
  |                 |   weight_kg, reps, duration_seconds, distance_meters, is_completed
  |
  |-- workouts (NEW)
  |     |-- id, user_id, title, started_at, completed_at, duration_seconds,
  |     |   status ("in_progress" | "completed"), notes, routine_id (nullable FK)
  |
  |-- routines (NEW)
  |     |-- id, user_id, name, notes, last_performed_at
  |     |
  |     +-- routine_exercises (NEW, template join table)
  |           |-- id, routine_id, exercise_id, sort_order, target_sets,
  |           |   target_reps, target_weight_kg, target_duration_seconds, rest_timer_seconds
```

### New Table: `exercises`

Stores both preset exercises (seeded, `user_id IS NULL`) and user-created custom exercises.

```sql
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL for preset exercises
  name TEXT NOT NULL,
  muscle_group_primary TEXT NOT NULL,  -- e.g., 'chest', 'back', 'legs'
  muscle_groups_secondary TEXT[] DEFAULT '{}',  -- e.g., '{triceps,shoulders}'
  equipment TEXT NOT NULL DEFAULT 'barbell',
  exercise_type TEXT NOT NULL DEFAULT 'weight_reps',
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraint on exercise_type
ALTER TABLE exercises ADD CONSTRAINT exercises_type_check
  CHECK (exercise_type IN (
    'weight_reps',           -- bench press, squat (weight + reps)
    'bodyweight_reps',       -- pull-ups, push-ups (reps only)
    'weighted_bodyweight',   -- weighted dips (bodyweight + added weight + reps)
    'assisted_bodyweight',   -- assisted pull-ups (bodyweight - assistance weight + reps)
    'duration',              -- plank, wall sit (time only)
    'duration_weight',       -- weighted wall sit (weight + time)
    'distance_duration',     -- rowing, running (distance + time)
    'weight_distance'        -- farmer's carry (weight + distance)
  ));

-- Constraint on equipment
ALTER TABLE exercises ADD CONSTRAINT exercises_equipment_check
  CHECK (equipment IN (
    'barbell', 'dumbbell', 'machine', 'bodyweight', 'kettlebell',
    'cable', 'band', 'other', 'none'
  ));

-- Constraint on muscle_group_primary
ALTER TABLE exercises ADD CONSTRAINT exercises_muscle_group_check
  CHECK (muscle_group_primary IN (
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
    'core', 'quadriceps', 'hamstrings', 'glutes', 'calves',
    'traps', 'lats', 'full_body', 'cardio', 'other'
  ));

-- Indexes
CREATE INDEX idx_exercises_user ON exercises (user_id) WHERE is_custom = true;
CREATE INDEX idx_exercises_muscle ON exercises (muscle_group_primary);
CREATE INDEX idx_exercises_preset ON exercises (id) WHERE user_id IS NULL;

-- RLS: Users see all presets + their own custom exercises
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view preset and own exercises"
  ON exercises FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can create custom exercises"
  ON exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can update own custom exercises"
  ON exercises FOR UPDATE
  USING (auth.uid() = user_id AND is_custom = true);

CREATE POLICY "Users can delete own custom exercises"
  ON exercises FOR DELETE
  USING (auth.uid() = user_id AND is_custom = true);
```

**Design rationale for `user_id IS NULL` for presets**: This avoids duplicating 100+ preset exercises per user. A single global set of presets with `user_id IS NULL` is readable by all users via RLS. Custom exercises have `user_id` set and `is_custom = true`.

**Confidence: HIGH** -- follows the same pattern as the `categories` table which also seeds default rows shared across users.

### Exercise Type and Field Mapping

Different exercise types display different input fields in the workout logger:

| exercise_type | Fields Shown | Primary Metric | Example |
|---------------|-------------|----------------|---------|
| `weight_reps` | weight, reps | weight x reps | Bench Press |
| `bodyweight_reps` | reps | reps | Pull-ups |
| `weighted_bodyweight` | +weight, reps | (bw + weight) x reps | Weighted Dips |
| `assisted_bodyweight` | -weight, reps | (bw - assist) x reps | Assisted Pull-ups |
| `duration` | duration | time | Plank |
| `duration_weight` | weight, duration | weight x time | Weighted Wall Sit |
| `distance_duration` | distance, duration | distance / time | Rowing |
| `weight_distance` | weight, distance | weight x distance | Farmer's Carry |

This determines which columns in `workout_sets` are displayed and which are null.

### New Table: `workouts`

Represents a single workout session.

```sql
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Workout',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,  -- NULL while in progress
  duration_seconds INTEGER,  -- computed on completion: completed_at - started_at
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  notes TEXT,
  routine_id UUID REFERENCES routines(id) ON DELETE SET NULL,  -- which routine spawned this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active workout per user at a time
CREATE UNIQUE INDEX idx_workouts_active
  ON workouts (user_id)
  WHERE status = 'in_progress';

CREATE INDEX idx_workouts_user_date ON workouts (user_id, started_at DESC);
CREATE INDEX idx_workouts_routine ON workouts (routine_id) WHERE routine_id IS NOT NULL;

-- RLS
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workouts"
  ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workouts"
  ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Critical design decision: Unique partial index on `(user_id) WHERE status = 'in_progress'`**. This enforces at the database level that a user can only have one active workout at a time. Attempting to start a second workout while one is in progress will fail with a unique constraint violation, which the API route catches and returns a 409 Conflict.

**Confidence: HIGH** -- partial unique indexes are well-supported in PostgreSQL and Supabase.

### New Table: `workout_exercises`

Join table between workouts and exercises, preserving exercise order within a workout.

```sql
CREATE TABLE workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  rest_timer_seconds INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_exercises_workout
  ON workout_exercises (workout_id, sort_order);

-- RLS: inherit from workout ownership
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exercises in own workouts"
  ON workout_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can add exercises to own workouts"
  ON workout_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can update exercises in own workouts"
  ON workout_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));

CREATE POLICY "Users can remove exercises from own workouts"
  ON workout_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id
    AND workouts.user_id = auth.uid()
  ));
```

**Why `ON DELETE RESTRICT` for `exercise_id`**: Prevents deleting an exercise that has logged workout data. The user must archive/hide the exercise instead, preserving historical records.

### New Table: `workout_sets`

Individual sets within a workout exercise. The core tracking unit.

```sql
CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,  -- 1-based ordering within this exercise
  set_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (set_type IN ('warmup', 'normal', 'drop', 'failure')),
  weight_kg NUMERIC(7,2),    -- NULL for bodyweight/duration-only exercises
  reps INTEGER,              -- NULL for duration-only exercises
  duration_seconds INTEGER,  -- NULL for weight/reps-only exercises
  distance_meters NUMERIC(10,2),  -- NULL for non-distance exercises
  is_completed BOOLEAN NOT NULL DEFAULT false,
  rpe SMALLINT CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),  -- Rate of Perceived Exertion
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sets_exercise
  ON workout_sets (workout_exercise_id, set_number);

-- RLS: inherit through workout_exercises -> workouts chain
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sets in own workouts"
  ON workout_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can add sets to own workouts"
  ON workout_sets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can update sets in own workouts"
  ON workout_sets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete sets in own workouts"
  ON workout_sets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.id = workout_sets.workout_exercise_id
    AND w.user_id = auth.uid()
  ));

CREATE TRIGGER update_workout_sets_updated_at
  BEFORE UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Why `NUMERIC(7,2)` for weight**: Supports up to 99,999.99 kg/lbs with 2 decimal places. More than sufficient for any human weight training. `NUMERIC` avoids float imprecision that would show "100.00000001 kg".

**Why all measurement columns are nullable**: Different exercise types use different columns. A plank uses only `duration_seconds`. A bench press uses only `weight_kg` and `reps`. The exercise_type on the parent exercise determines which fields are populated.

**Confidence: HIGH** -- this is the standard approach for polymorphic exercise tracking.

### New Table: `routines`

Reusable workout templates.

```sql
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  last_performed_at TIMESTAMPTZ,  -- updated when a workout using this routine is completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routines_user ON routines (user_id);

-- RLS
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routines"
  ON routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own routines"
  ON routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### New Table: `routine_exercises`

Template exercises within a routine, with target values.

```sql
CREATE TABLE routine_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  target_sets INTEGER DEFAULT 3,
  target_reps INTEGER,
  target_weight_kg NUMERIC(7,2),
  target_duration_seconds INTEGER,
  rest_timer_seconds INTEGER DEFAULT 90,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routine_exercises_routine
  ON routine_exercises (routine_id, sort_order);

-- RLS: inherit from routine ownership
ALTER TABLE routine_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view exercises in own routines"
  ON routine_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can add exercises to own routines"
  ON routine_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can update exercises in own routines"
  ON routine_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete exercises from own routines"
  ON routine_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM routines WHERE routines.id = routine_exercises.routine_id
    AND routines.user_id = auth.uid()
  ));
```

### Modified: `profiles.preferences` (add weight_unit)

```sql
-- No schema change needed -- preferences is a JSONB column.
-- The application code adds weight_unit to the JSON object.
-- Default value is 'kg' when not present (handled in application code).
```

The `ProfilePreferences` TypeScript interface gets extended:

```typescript
export interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs";  // NEW -- defaults to "kg" if missing
}
```

The preferences Zod schema gets extended:

```typescript
export const preferencesSchema = z
  .object({
    date_format: z.string().optional(),
    week_start_day: z.number().int().min(0).max(6).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    weight_unit: z.enum(["kg", "lbs"]).optional(),  // NEW
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one preference must be provided",
  });
```

**Confidence: HIGH** -- the preferences column is already JSONB, so adding a new field requires zero database migration. Application code handles the default.

### Weight Unit Conversion Strategy

All weights are stored in `weight_kg` (kilograms) in the database. Display conversion happens in the UI layer:

```typescript
// lib/fitness/units.ts
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

export function displayWeight(kg: number, unit: "kg" | "lbs"): number {
  if (unit === "lbs") return Math.round(kg * KG_TO_LBS * 100) / 100;
  return kg;
}

export function toKg(value: number, unit: "kg" | "lbs"): number {
  if (unit === "lbs") return Math.round(value * LBS_TO_KG * 100) / 100;
  return value;
}

export function formatWeight(kg: number, unit: "kg" | "lbs"): string {
  const display = displayWeight(kg, unit);
  return `${display} ${unit}`;
}
```

**Why store as kg, not user-preferred unit**: Prevents data corruption if the user switches units. All comparisons, progression charts, and personal records use the canonical `weight_kg` value. Display conversion is cheap and deterministic.

**Confidence: HIGH** -- this is the standard approach used by Hevy, Strong, and every serious fitness app.

## New Type Definitions

Add to `lib/db/types.ts`:

```typescript
// =============================================================================
// FITNESS: EXERCISES
// =============================================================================

export type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight"
  | "duration"
  | "duration_weight"
  | "distance_duration"
  | "weight_distance";

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms"
  | "core" | "quadriceps" | "hamstrings" | "glutes" | "calves"
  | "traps" | "lats" | "full_body" | "cardio" | "other";

export type Equipment =
  | "barbell" | "dumbbell" | "machine" | "bodyweight" | "kettlebell"
  | "cable" | "band" | "other" | "none";

export interface Exercise {
  id: string;
  user_id: string | null;  // NULL for preset exercises
  name: string;
  muscle_group_primary: MuscleGroup;
  muscle_groups_secondary: MuscleGroup[];
  equipment: Equipment;
  exercise_type: ExerciseType;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export type ExerciseInsert = Omit<Exercise, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type ExerciseUpdate = Partial<
  Omit<Exercise, "id" | "user_id" | "created_at" | "updated_at" | "is_custom">
>;

export interface ExerciseFilters {
  muscle_group?: MuscleGroup;
  equipment?: Equipment;
  exercise_type?: ExerciseType;
  is_custom?: boolean;
  search?: string;  // text search on name
}

// =============================================================================
// FITNESS: WORKOUTS
// =============================================================================

export type WorkoutStatus = "in_progress" | "completed";

export interface Workout {
  id: string;
  user_id: string;
  title: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: WorkoutStatus;
  notes: string | null;
  routine_id: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkoutInsert = Omit<
  Workout,
  "id" | "created_at" | "updated_at" | "completed_at" | "duration_seconds"
> & {
  id?: string;
  completed_at?: string | null;
  duration_seconds?: number | null;
};

export type WorkoutUpdate = Partial<
  Omit<Workout, "id" | "user_id" | "created_at" | "updated_at">
>;

// =============================================================================
// FITNESS: WORKOUT EXERCISES
// =============================================================================

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  sort_order: number;
  notes: string | null;
  rest_timer_seconds: number;
  created_at: string;
}

export type WorkoutExerciseInsert = Omit<WorkoutExercise, "id" | "created_at"> & {
  id?: string;
};

// Joined type for display
export interface WorkoutExerciseWithDetails extends WorkoutExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
}

// =============================================================================
// FITNESS: WORKOUT SETS
// =============================================================================

export type SetType = "warmup" | "normal" | "drop" | "failure";

export interface WorkoutSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  is_completed: boolean;
  rpe: number | null;  // 1-10
  created_at: string;
  updated_at: string;
}

export type WorkoutSetInsert = Omit<WorkoutSet, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type WorkoutSetUpdate = Partial<
  Omit<WorkoutSet, "id" | "workout_exercise_id" | "created_at" | "updated_at">
>;

// =============================================================================
// FITNESS: ROUTINES
// =============================================================================

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  last_performed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RoutineInsert = Omit<Routine, "id" | "created_at" | "updated_at" | "last_performed_at"> & {
  id?: string;
  last_performed_at?: string | null;
};

export type RoutineUpdate = Partial<
  Omit<Routine, "id" | "user_id" | "created_at" | "updated_at">
>;

export interface RoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  sort_order: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_seconds: number | null;
  rest_timer_seconds: number;
  notes: string | null;
  created_at: string;
}

export type RoutineExerciseInsert = Omit<RoutineExercise, "id" | "created_at"> & {
  id?: string;
};

// Joined type for display
export interface RoutineWithExercises extends Routine {
  exercises: (RoutineExercise & { exercise: Exercise })[];
}

// =============================================================================
// FITNESS: AGGREGATED TYPES
// =============================================================================

/** Full workout with nested exercises and sets, used by workout detail view */
export interface WorkoutWithExercises extends Workout {
  exercises: WorkoutExerciseWithDetails[];
}

/** Personal record for a specific exercise */
export interface PersonalRecord {
  exercise_id: string;
  best_weight_kg: number | null;
  best_reps: number | null;
  best_volume: number | null;  // weight * reps
  best_duration_seconds: number | null;
  achieved_at: string;
}

/** Exercise history entry for progression charts */
export interface ExerciseHistoryEntry {
  date: string;  // workout started_at date
  workout_id: string;
  best_set_weight_kg: number | null;
  best_set_reps: number | null;
  total_volume: number | null;  // sum(weight * reps) across all sets
  total_sets: number;
}

/** Weight unit type extension */
export type WeightUnit = "kg" | "lbs";
```

## New Validation Schemas

### `lib/validations/exercise.ts`

```typescript
import { z } from "zod";

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscle_group_primary: z.enum([
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "core", "quadriceps", "hamstrings", "glutes", "calves",
    "traps", "lats", "full_body", "cardio", "other",
  ]),
  muscle_groups_secondary: z.array(z.enum([
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "core", "quadriceps", "hamstrings", "glutes", "calves",
    "traps", "lats", "full_body", "cardio", "other",
  ])).default([]),
  equipment: z.enum([
    "barbell", "dumbbell", "machine", "bodyweight", "kettlebell",
    "cable", "band", "other", "none",
  ]),
  exercise_type: z.enum([
    "weight_reps", "bodyweight_reps", "weighted_bodyweight",
    "assisted_bodyweight", "duration", "duration_weight",
    "distance_duration", "weight_distance",
  ]),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
```

### `lib/validations/workout.ts`

```typescript
import { z } from "zod";

export const workoutCreateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  routine_id: z.string().uuid().nullable().optional(),
});

export const workoutUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["in_progress", "completed"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

export const workoutSetSchema = z.object({
  set_type: z.enum(["warmup", "normal", "drop", "failure"]).optional(),
  weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  reps: z.number().int().min(0).max(9999).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  distance_meters: z.number().min(0).max(999999.99).nullable().optional(),
  is_completed: z.boolean().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
});

export const workoutSetUpdateSchema = workoutSetSchema.refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" }
);

export type WorkoutSetValues = z.infer<typeof workoutSetSchema>;
```

### `lib/validations/routine.ts`

```typescript
import { z } from "zod";

export const routineFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  notes: z.string().max(1000).nullable().optional(),
});

export const routineExerciseSchema = z.object({
  exercise_id: z.string().uuid(),
  sort_order: z.number(),
  target_sets: z.number().int().min(1).max(20).default(3),
  target_reps: z.number().int().min(1).max(100).nullable().optional(),
  target_weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  target_duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  rest_timer_seconds: z.number().int().min(0).max(600).default(90),
  notes: z.string().max(500).nullable().optional(),
});

export type RoutineFormValues = z.infer<typeof routineFormSchema>;
export type RoutineExerciseValues = z.infer<typeof routineExerciseSchema>;
```

## New API Routes

### Exercises API

```
GET  /api/exercises                           -> List/search exercises (presets + user custom)
     ?muscle_group=chest&equipment=barbell&search=bench
POST /api/exercises                           -> Create custom exercise

GET    /api/exercises/[id]                    -> Get single exercise
PATCH  /api/exercises/[id]                    -> Update custom exercise
DELETE /api/exercises/[id]                    -> Delete custom exercise (fails if used in workouts)

GET    /api/exercises/[id]/history            -> Get per-exercise progression data
       ?limit=30                               (last N workouts containing this exercise)
```

### Workouts API

```
GET  /api/workouts                            -> List completed workouts (paginated)
     ?limit=20&offset=0
POST /api/workouts                            -> Start new workout (from scratch or routine)
     { title?, routine_id? }

GET  /api/workouts/active                     -> Get current in-progress workout (404 if none)

GET    /api/workouts/[id]                     -> Get workout with exercises and sets
PATCH  /api/workouts/[id]                     -> Update workout (title, notes, complete it)
DELETE /api/workouts/[id]                     -> Delete workout and all sets

POST   /api/workouts/[id]/exercises           -> Add exercise to workout
       { exercise_id, rest_timer_seconds? }

PATCH  /api/workouts/[id]/exercises/[weId]    -> Update workout exercise (notes, reorder, rest timer)
DELETE /api/workouts/[id]/exercises/[weId]    -> Remove exercise from workout

POST   /api/workouts/[id]/exercises/[weId]/sets     -> Add set to exercise
       { set_type?, weight_kg?, reps?, duration_seconds?, ... }
PATCH  /api/workouts/[id]/exercises/[weId]/sets/[setId]  -> Update set
DELETE /api/workouts/[id]/exercises/[weId]/sets/[setId]  -> Delete set
```

### Routines API

```
GET  /api/routines                            -> List user's routines
POST /api/routines                            -> Create routine (from scratch)

GET    /api/routines/[id]                     -> Get routine with exercises
PATCH  /api/routines/[id]                     -> Update routine
DELETE /api/routines/[id]                     -> Delete routine

POST   /api/routines/[id]/exercises           -> Add exercise to routine
PATCH  /api/routines/[id]/exercises/[reId]    -> Update routine exercise
DELETE /api/routines/[id]/exercises/[reId]    -> Remove exercise from routine

POST   /api/routines/from-workout/[workoutId] -> Create routine from completed workout
```

### Modified: Preferences API

```
PATCH /api/profile/preferences                -> Extended with weight_unit field
      { weight_unit: "kg" | "lbs" }
```

## New SWR Hooks

### `lib/hooks/use-exercises.ts`

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Exercise, ExerciseFilters } from "@/lib/db/types";

export function useExercises(filters?: ExerciseFilters) {
  const params = new URLSearchParams();
  if (filters?.muscle_group) params.set("muscle_group", filters.muscle_group);
  if (filters?.equipment) params.set("equipment", filters.equipment);
  if (filters?.search) params.set("search", filters.search);

  const { data, error, isLoading, mutate } = useSWR<{ exercises: Exercise[] }>(
    `/api/exercises?${params}`,
    fetcher
  );

  return { exercises: data?.exercises ?? [], error, isLoading, mutate };
}
```

### `lib/hooks/use-workouts.ts`

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Workout, WorkoutWithExercises } from "@/lib/db/types";

export function useWorkouts(limit = 20, offset = 0) {
  const { data, error, isLoading, mutate } = useSWR<{ workouts: Workout[]; total: number }>(
    `/api/workouts?limit=${limit}&offset=${offset}`,
    fetcher
  );

  return { workouts: data?.workouts ?? [], total: data?.total ?? 0, error, isLoading, mutate };
}

export function useWorkoutDetail(workoutId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ workout: WorkoutWithExercises }>(
    workoutId ? `/api/workouts/${workoutId}` : null,
    fetcher
  );

  return { workout: data?.workout ?? null, error, isLoading, mutate };
}

export function useActiveWorkout() {
  const { data, error, isLoading, mutate } = useSWR<{ workout: WorkoutWithExercises | null }>(
    "/api/workouts/active",
    fetcher,
    { refreshInterval: 0 }  // Don't auto-refresh -- manual mutate on set changes
  );

  return { workout: data?.workout ?? null, error, isLoading, mutate };
}
```

### `lib/hooks/use-routines.ts`

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Routine, RoutineWithExercises } from "@/lib/db/types";

export function useRoutines() {
  const { data, error, isLoading, mutate } = useSWR<{ routines: Routine[] }>(
    "/api/routines",
    fetcher
  );

  return { routines: data?.routines ?? [], error, isLoading, mutate };
}

export function useRoutineDetail(routineId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ routine: RoutineWithExercises }>(
    routineId ? `/api/routines/${routineId}` : null,
    fetcher
  );

  return { routine: data?.routine ?? null, error, isLoading, mutate };
}
```

### `lib/hooks/use-exercise-history.ts`

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { ExerciseHistoryEntry, PersonalRecord } from "@/lib/db/types";

export function useExerciseHistory(exerciseId: string | null, limit = 30) {
  const { data, error, isLoading } = useSWR<{
    history: ExerciseHistoryEntry[];
    personal_records: PersonalRecord;
  }>(
    exerciseId ? `/api/exercises/${exerciseId}/history?limit=${limit}` : null,
    fetcher
  );

  return {
    history: data?.history ?? [],
    personalRecords: data?.personal_records ?? null,
    error,
    isLoading,
  };
}
```

## New Component Files

```
components/
  fitness/
    workout-logger/
      workout-logger.tsx              # Main active workout UI (real-time session)
      workout-header.tsx              # Timer, title, finish/discard buttons
      workout-exercise-card.tsx       # Single exercise block with set rows
      workout-set-row.tsx             # Individual set input row (weight, reps, etc)
      workout-set-input.tsx           # Numeric input adapted per exercise_type
      workout-add-exercise.tsx        # Exercise picker dialog/sheet
      workout-rest-timer.tsx          # Countdown timer between sets
      workout-finish-dialog.tsx       # Confirmation dialog to finish workout
    exercise-library/
      exercise-library.tsx            # Browseable/searchable exercise list
      exercise-card.tsx               # Exercise display card (name, muscles, equipment)
      exercise-filter-bar.tsx         # Muscle group + equipment filters
      exercise-form.tsx               # Create/edit custom exercise form
      exercise-detail.tsx             # Exercise detail with history and PR
    routines/
      routines-list.tsx               # List of saved routines
      routine-card.tsx                # Routine summary card
      routine-form.tsx                # Create/edit routine
      routine-exercise-row.tsx        # Exercise row within routine editor
      routine-detail.tsx              # Routine detail with exercise list + "Start Workout" button
    workout-history/
      workout-history-list.tsx        # Paginated list of completed workouts
      workout-history-card.tsx        # Summary card (date, title, exercise count, volume)
      workout-detail-view.tsx         # Full workout review (read-only)
    progress/
      exercise-progress-chart.tsx     # Per-exercise progression line chart
      personal-records-card.tsx       # PR display for an exercise
      muscle-group-volume.tsx         # Weekly volume per muscle group (stretch goal)
  settings/
    weight-unit-selector.tsx          # kg/lbs toggle (NEW)
```

### New Route Pages

```
app/
  workouts/
    page.tsx                          # Workouts landing: history + "Start Workout" button
    layout.tsx                        # Shared layout for workouts section
    loading.tsx                       # Loading skeleton
    active/
      page.tsx                        # Active workout logger (redirects to /workouts if none)
    [id]/
      page.tsx                        # Workout detail/review
    exercises/
      page.tsx                        # Exercise library
      [id]/
        page.tsx                      # Exercise detail with history
      new/
        page.tsx                      # Create custom exercise
    routines/
      page.tsx                        # Routines list
      [id]/
        page.tsx                      # Routine detail
        edit/
          page.tsx                    # Edit routine
      new/
        page.tsx                      # Create routine
```

## Data Flow

### Starting a Workout (from routine)

```
1. User navigates to /workouts/routines/[id]
   |
   v
2. RoutineDetail shows exercises, "Start Workout" button
   |
   v
3. User clicks "Start Workout"
   - POST /api/workouts { title: routine.name, routine_id: routine.id }
   - API creates workout row (status: 'in_progress')
   - API copies routine_exercises -> workout_exercises
   - API creates empty workout_sets for each exercise (target_sets count)
   - Returns workout with exercises
   |
   v
4. Redirect to /workouts/active
   - useActiveWorkout() fetches the in-progress workout
   - WorkoutLogger renders with pre-populated exercises
   |
   v
5. User logs sets:
   - Tap set row -> enter weight/reps -> tap checkmark
   - PATCH /api/workouts/[id]/exercises/[weId]/sets/[setId]
     { weight_kg: 80, reps: 8, is_completed: true }
   - SWR optimistic update: mark set as completed in cache
   |
   v
6. User adds another exercise mid-workout:
   - Open exercise picker (search/filter)
   - POST /api/workouts/[id]/exercises { exercise_id: uuid }
   - SWR optimistic update: append exercise to workout
   |
   v
7. User finishes workout:
   - Click "Finish Workout" -> confirmation dialog
   - PATCH /api/workouts/[id] { status: "completed" }
   - API computes duration_seconds = completed_at - started_at
   - API updates routine.last_performed_at
   - Redirect to /workouts/[id] (completed view)
```

### Real-Time Workout Timer

The workout timer runs client-side only. It does NOT poll the server.

```typescript
// components/fitness/workout-logger/workout-header.tsx
function WorkoutTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span>{formatDuration(elapsed)}</span>;
}
```

The server computes `duration_seconds` only on workout completion:

```typescript
// In PATCH /api/workouts/[id] when status changes to "completed"
if (updates.status === "completed" && workout.status === "in_progress") {
  updates.completed_at = new Date().toISOString();
  updates.duration_seconds = Math.floor(
    (new Date(updates.completed_at).getTime() -
     new Date(workout.started_at).getTime()) / 1000
  );
}
```

### Rest Timer Between Sets

The rest timer is a client-side countdown that auto-starts when a set is marked completed.

```typescript
// components/fitness/workout-logger/workout-rest-timer.tsx
function useRestTimer(durationSeconds: number) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const start = useCallback(() => {
    setRemaining(durationSeconds);
    setIsActive(true);
  }, [durationSeconds]);

  useEffect(() => {
    if (!isActive || remaining === null || remaining <= 0) {
      if (remaining === 0) setIsActive(false);
      return;
    }
    const timeout = setTimeout(() => setRemaining(r => (r ?? 0) - 1), 1000);
    return () => clearTimeout(timeout);
  }, [isActive, remaining]);

  return { remaining, isActive, start, skip: () => setIsActive(false) };
}
```

The rest timer is purely presentational -- it does not save state to the server. The `rest_timer_seconds` on `workout_exercises` configures the default duration.

### Exercise Progression Query

Personal records and history are computed server-side with a single efficient query:

```sql
-- Get exercise history for progression chart
SELECT
  w.started_at::date AS date,
  w.id AS workout_id,
  MAX(ws.weight_kg) AS best_set_weight_kg,
  MAX(ws.reps) AS best_set_reps,
  SUM(COALESCE(ws.weight_kg, 0) * COALESCE(ws.reps, 0)) AS total_volume,
  COUNT(ws.id) FILTER (WHERE ws.is_completed AND ws.set_type = 'normal') AS total_sets
FROM workouts w
JOIN workout_exercises we ON we.workout_id = w.id
JOIN workout_sets ws ON ws.workout_exercise_id = we.id
WHERE w.user_id = $1
  AND we.exercise_id = $2
  AND w.status = 'completed'
  AND ws.is_completed = true
GROUP BY w.id, w.started_at
ORDER BY w.started_at DESC
LIMIT $3;
```

**Note**: Supabase JS client cannot express this query natively. Use `supabase.rpc()` with a PostgreSQL function or compute it in application code with two simpler queries (workouts containing the exercise + their sets). For v4.0 MVP, the application-code approach is fine. If it becomes slow (>500 workouts per exercise), add a PostgreSQL function.

**Confidence: MEDIUM** -- the query is correct, but the choice between `supabase.rpc()` and application code depends on performance testing with real data.

### "Previous" Values Display (Hevy-style)

When logging a set, show what the user did last time for the same exercise:

```
1. WorkoutSetRow renders for exercise "Bench Press", set #1
   |
   v
2. Lookup previous workout containing this exercise_id:
   - Already fetched by useActiveWorkout() which includes exercise history
   - OR: separate lightweight query cached by SWR

3. Display "PREVIOUS: 80kg x 8" next to the input fields
```

This is a read-only display. The simplest approach is to add a `previous_sets` field to the workout detail API response:

```typescript
// In GET /api/workouts/[id] response enrichment
interface WorkoutExerciseWithPrevious extends WorkoutExerciseWithDetails {
  previous_sets: WorkoutSet[];  // sets from most recent prior workout with this exercise
}
```

## Patterns to Follow

### Pattern 1: DB Class Per Entity
**What:** Each database entity gets its own DB class.
**When:** Always.
**Applied:** `ExercisesDB`, `WorkoutsDB`, `WorkoutExercisesDB`, `RoutinesDB`.

### Pattern 2: SWR Hook Per View
**What:** Each distinct data view gets its own SWR hook with typed response.
**When:** Any component fetching data.
**Applied:** `useWorkouts()`, `useActiveWorkout()`, `useWorkoutDetail()`, `useExercises()`, `useRoutines()`, `useExerciseHistory()`.

### Pattern 3: Optimistic Updates for Mutations
**What:** Use SWR's `mutate()` with `optimisticData` for user-facing mutations.
**When:** Marking sets complete, adding exercises to workout.
**Applied:** Set completion toggles, exercise additions during active workout.

### Pattern 4: Zod Validation at API Boundaries
**What:** Every API route validates input with Zod.
**When:** Every POST/PATCH.
**Applied:** All fitness API routes use the new validation schemas.

### Pattern 5: Canonical Storage Unit with Display Conversion
**What:** Store all weights in kg. Convert to user preference in the UI.
**When:** Any weight display or input.
**Applied:** `lib/fitness/units.ts` handles kg/lbs conversion.

### Pattern 6: Exercise Seeding (like Categories)
**What:** Preset exercises are seeded once on first access (or via migration), not per-user.
**When:** Exercise library access.
**Applied:** Seed ~100 common exercises with `user_id IS NULL` via migration. Custom exercises have `user_id` set.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Weight in User-Preferred Units
**What:** Saving "180" with unit "lbs" in the database.
**Why bad:** If user switches to kg, all historical data needs conversion. Rounding errors accumulate. PR comparisons across unit switches are broken.
**Instead:** Always store `weight_kg`. Convert on display.

### Anti-Pattern 2: Polling Active Workout State
**What:** Using `refreshInterval` on `useActiveWorkout()` to keep the workout logger in sync.
**Why bad:** The workout logger is the sole writer. No external process modifies the active workout. Polling wastes bandwidth and causes flickering.
**Instead:** Use manual `mutate()` after each set update. The client is the source of truth during an active workout.

### Anti-Pattern 3: Separate Tables for Each Exercise Type
**What:** Creating `weight_reps_sets`, `duration_sets`, `bodyweight_sets` tables.
**Why bad:** Explosion of tables. Queries across exercise types require UNION. Adding a new exercise type requires a new table and migration.
**Instead:** Single `workout_sets` table with nullable columns. The exercise_type determines which columns are populated.

### Anti-Pattern 4: Computing Personal Records on Every Page Load
**What:** Running an aggregate query across all historical sets to find PRs on every workout detail view.
**Why bad:** Gets slower as workout history grows. Same PR is recomputed thousands of times.
**Instead:** For v4.0 MVP, compute on-demand (acceptable for personal app with <500 workouts). For v5.0 if needed, add a `personal_records` materialized view or cache table.

### Anti-Pattern 5: Deeply Nested API Routes
**What:** `/api/workouts/[id]/exercises/[weId]/sets/[setId]/complete` with 4 levels of dynamic params.
**Why bad:** Next.js dynamic route segments become unwieldy. Error handling for each ID validation is verbose.
**Instead:** Keep route nesting to max 3 levels. For set operations, use `/api/workouts/[id]/exercises/[weId]/sets/route.ts` with the set ID in the body for PATCH/DELETE or as a query param.

### Anti-Pattern 6: Client-Side Duration Calculation for Completed Workouts
**What:** Computing workout duration from `started_at` in the browser for completed workouts.
**Why bad:** If the user's clock is wrong, duration is wrong. If they close the browser and reopen, the timer "resets" visually.
**Instead:** Server computes `duration_seconds` once on completion. Client timer is cosmetic during active workout only.

## Scalability Considerations

| Concern | At 50 workouts | At 500 workouts | At 5000 workouts |
|---------|---------------|-----------------|-------------------|
| Workout list | Single query, instant | Paginate (limit 20) | Paginate, add date index |
| Set count per workout | ~50-100 sets, fine | Same | Same (single workout) |
| Exercise history query | Fast | Fast | May need `supabase.rpc()` |
| Personal records | Compute on-demand | Compute on-demand | Add materialized view |
| Exercise library search | Simple ILIKE | Simple ILIKE | Add `pg_trgm` index |

BetterR.Me is a personal fitness app. A dedicated user logs ~4-5 workouts per week, or ~250/year. Even after 5 years, 1,250 workouts is trivially queryable in PostgreSQL. The architecture does not over-engineer for scale.

## Migration Strategy

### Exercise Seeding

Seed ~100 common exercises via a migration SQL file. These are global (user_id IS NULL) and shared by all users:

```sql
-- supabase/migrations/YYYYMMDD_seed_exercises.sql
INSERT INTO exercises (name, muscle_group_primary, muscle_groups_secondary, equipment, exercise_type, is_custom)
VALUES
  ('Barbell Bench Press', 'chest', '{triceps,shoulders}', 'barbell', 'weight_reps', false),
  ('Incline Dumbbell Press', 'chest', '{triceps,shoulders}', 'dumbbell', 'weight_reps', false),
  ('Pull-up', 'back', '{biceps,forearms}', 'bodyweight', 'bodyweight_reps', false),
  ('Barbell Squat', 'quadriceps', '{glutes,hamstrings,core}', 'barbell', 'weight_reps', false),
  ('Deadlift', 'back', '{hamstrings,glutes,core,forearms}', 'barbell', 'weight_reps', false),
  ('Plank', 'core', '{}', 'bodyweight', 'duration', false),
  -- ... ~95 more exercises
  ;
```

The full exercise seed list should cover the same muscle groups Hevy covers: chest, back, shoulders, biceps, triceps, forearms, core, quadriceps, hamstrings, glutes, calves, traps, lats.

### Sidebar Update

Add "Workouts" to `mainNavItems` in `components/layouts/app-sidebar.tsx`:

```typescript
import { Dumbbell } from "lucide-react";

const mainNavItems = [
  { href: "/dashboard", icon: Home, labelKey: "dashboard", match: (p: string) => p === "/dashboard" },
  { href: "/habits",    icon: ClipboardList, labelKey: "habits", match: (p: string) => p.startsWith("/habits") },
  { href: "/tasks",     icon: ListChecks, labelKey: "tasks", match: (p: string) => p.startsWith("/tasks") },
  { href: "/workouts",  icon: Dumbbell, labelKey: "workouts", match: (p: string) => p.startsWith("/workouts") },  // NEW
];
```

### Settings Weight Unit

Add a `WeightUnitSelector` to `SettingsContent`, following the exact same pattern as `WeekStartSelector`:

```typescript
// In settings-content.tsx
const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");

// Initialize from profile
useEffect(() => {
  if (data?.profile?.preferences) {
    setWeightUnit(data.profile.preferences.weight_unit ?? "kg");
  }
}, [data]);

// Save alongside week_start_day
const handleSave = async () => {
  await fetch("/api/profile/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week_start_day: weekStartDay, weight_unit: weightUnit }),
  });
};
```

### Dashboard Integration (Future)

The dashboard does not need immediate changes for v4.0. A future enhancement could add a "Today's Workout" section showing the most recent or scheduled workout. This is intentionally deferred to keep the v4.0 scope focused on the core workout logging flow.

## Files Summary: New vs Modified

### New Files (create)

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_create_exercises_table.sql` | Exercises table + RLS + constraints |
| `supabase/migrations/YYYYMMDD_create_workouts_tables.sql` | Workouts, workout_exercises, workout_sets tables + RLS |
| `supabase/migrations/YYYYMMDD_create_routines_tables.sql` | Routines, routine_exercises tables + RLS |
| `supabase/migrations/YYYYMMDD_seed_exercises.sql` | ~100 preset exercises |
| `lib/db/exercises.ts` | ExercisesDB class |
| `lib/db/workouts.ts` | WorkoutsDB class |
| `lib/db/workout-exercises.ts` | WorkoutExercisesDB class (sets management) |
| `lib/db/routines.ts` | RoutinesDB class |
| `lib/fitness/units.ts` | kg/lbs conversion utilities |
| `lib/fitness/exercise-fields.ts` | Map exercise_type to which input fields to show |
| `lib/validations/exercise.ts` | Exercise Zod schemas |
| `lib/validations/workout.ts` | Workout + set Zod schemas |
| `lib/validations/routine.ts` | Routine Zod schemas |
| `lib/hooks/use-exercises.ts` | SWR hook for exercise library |
| `lib/hooks/use-workouts.ts` | SWR hooks for workouts |
| `lib/hooks/use-routines.ts` | SWR hooks for routines |
| `lib/hooks/use-exercise-history.ts` | SWR hook for exercise progression |
| `app/api/exercises/route.ts` | Exercise list/create API |
| `app/api/exercises/[id]/route.ts` | Exercise CRUD API |
| `app/api/exercises/[id]/history/route.ts` | Exercise progression API |
| `app/api/workouts/route.ts` | Workout list/create API |
| `app/api/workouts/active/route.ts` | Active workout API |
| `app/api/workouts/[id]/route.ts` | Workout CRUD API |
| `app/api/workouts/[id]/exercises/route.ts` | Workout exercises API |
| `app/api/workouts/[id]/exercises/[weId]/sets/route.ts` | Set CRUD API |
| `app/api/routines/route.ts` | Routine list/create API |
| `app/api/routines/[id]/route.ts` | Routine CRUD API |
| `app/api/routines/[id]/exercises/route.ts` | Routine exercises API |
| `app/api/routines/from-workout/[workoutId]/route.ts` | Create routine from workout |
| `app/workouts/page.tsx` | Workouts landing page |
| `app/workouts/layout.tsx` | Workouts layout |
| `app/workouts/loading.tsx` | Workouts loading skeleton |
| `app/workouts/active/page.tsx` | Active workout logger page |
| `app/workouts/[id]/page.tsx` | Workout detail page |
| `app/workouts/exercises/page.tsx` | Exercise library page |
| `app/workouts/exercises/[id]/page.tsx` | Exercise detail page |
| `app/workouts/exercises/new/page.tsx` | Create custom exercise page |
| `app/workouts/routines/page.tsx` | Routines list page |
| `app/workouts/routines/[id]/page.tsx` | Routine detail page |
| `app/workouts/routines/[id]/edit/page.tsx` | Edit routine page |
| `app/workouts/routines/new/page.tsx` | Create routine page |
| `components/fitness/workout-logger/workout-logger.tsx` | Main workout session UI |
| `components/fitness/workout-logger/workout-header.tsx` | Timer + controls |
| `components/fitness/workout-logger/workout-exercise-card.tsx` | Exercise block |
| `components/fitness/workout-logger/workout-set-row.tsx` | Set input row |
| `components/fitness/workout-logger/workout-set-input.tsx` | Numeric input per type |
| `components/fitness/workout-logger/workout-add-exercise.tsx` | Exercise picker |
| `components/fitness/workout-logger/workout-rest-timer.tsx` | Rest countdown |
| `components/fitness/workout-logger/workout-finish-dialog.tsx` | Finish confirmation |
| `components/fitness/exercise-library/exercise-library.tsx` | Exercise browser |
| `components/fitness/exercise-library/exercise-card.tsx` | Exercise card |
| `components/fitness/exercise-library/exercise-filter-bar.tsx` | Filters |
| `components/fitness/exercise-library/exercise-form.tsx` | Custom exercise form |
| `components/fitness/exercise-library/exercise-detail.tsx` | Exercise detail + history |
| `components/fitness/routines/routines-list.tsx` | Routine list |
| `components/fitness/routines/routine-card.tsx` | Routine card |
| `components/fitness/routines/routine-form.tsx` | Routine create/edit |
| `components/fitness/routines/routine-exercise-row.tsx` | Exercise row in routine |
| `components/fitness/routines/routine-detail.tsx` | Routine detail |
| `components/fitness/workout-history/workout-history-list.tsx` | Workout list |
| `components/fitness/workout-history/workout-history-card.tsx` | Workout summary card |
| `components/fitness/workout-history/workout-detail-view.tsx` | Completed workout view |
| `components/fitness/progress/exercise-progress-chart.tsx` | Progression chart |
| `components/fitness/progress/personal-records-card.tsx` | PR display |
| `components/settings/weight-unit-selector.tsx` | kg/lbs toggle |

### Modified Files (edit)

| File | What Changes |
|------|-------------|
| `lib/db/types.ts` | Add all fitness types (Exercise, Workout, WorkoutSet, Routine, etc) |
| `lib/db/index.ts` | Export new DB classes |
| `lib/validations/preferences.ts` | Add `weight_unit` field |
| `lib/constants.ts` | Add fitness constants (MAX_EXERCISES_PER_USER, DEFAULT_REST_TIMER, etc) |
| `components/layouts/app-sidebar.tsx` | Add "Workouts" nav item with Dumbbell icon |
| `components/settings/settings-content.tsx` | Add weight unit selector card |
| `i18n/messages/en.json` | Add all fitness i18n strings |
| `i18n/messages/zh.json` | Add Chinese translations |
| `i18n/messages/zh-TW.json` | Add Traditional Chinese translations |

## Suggested Build Order

Based on dependencies -- each phase builds on the previous:

1. **Database migrations** (exercises, workouts, workout_exercises, workout_sets, routines, routine_exercises) -- everything depends on schema
2. **Type definitions** (`lib/db/types.ts` additions) -- everything depends on types
3. **Fitness utilities** (`lib/fitness/units.ts`, `lib/fitness/exercise-fields.ts`) -- components need these
4. **DB classes** (ExercisesDB, WorkoutsDB, WorkoutExercisesDB, RoutinesDB) -- API routes depend on these
5. **Validation schemas** (exercise, workout, routine) -- API routes depend on these
6. **Exercise seed migration** (~100 preset exercises) -- exercise library depends on data
7. **Weight unit preference** (extend preferences schema + settings UI) -- workout logger depends on this
8. **Exercises API** + `useExercises()` hook -- workout logger needs exercise picker
9. **Exercise library UI** (browse, search, filter, create custom) -- standalone, useful early
10. **Workouts API** (CRUD + active workout) + SWR hooks -- workout logger depends on these
11. **Workout logger UI** (start workout, add exercises, log sets, rest timer, finish) -- the core feature
12. **Routines API** + SWR hooks -- depends on workouts being functional
13. **Routines UI** (create, edit, start workout from routine) -- depends on routines API
14. **Workout history UI** (list, detail view) -- depends on workouts API
15. **Exercise progression** (history API, charts, PRs) -- depends on workout history
16. **Sidebar update** (add Workouts nav item) -- cosmetic, do once pages exist
17. **i18n strings** -- add alongside each component (not as separate step)

**Phase ordering rationale:**
- Database and types first because everything depends on them
- Exercise library before workout logger because the workout logger needs an exercise picker
- Weight unit before workout logger because set inputs need to know kg/lbs
- Workouts before routines because routines create workouts
- History and progression last because they read from completed workout data

## Sources

- Existing codebase analysis: `lib/db/`, `app/api/`, `components/`, `lib/hooks/`, `lib/validations/` -- **HIGH confidence**
- [Hevy Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/) -- exercise types and set types -- **HIGH confidence**
- [Hevy Custom Exercises](https://www.hevyapp.com/features/custom-exercises/) -- exercise fields (equipment, muscle targets, exercise type) -- **HIGH confidence**
- [Hevy Exercise Library](https://www.hevyapp.com/exercises/) -- muscle groups and equipment categories -- **HIGH confidence**
- [Hevy Gym Performance Tracking](https://www.hevyapp.com/features/gym-performance/) -- progression metrics -- **HIGH confidence**
- [Hevy Track Workouts](https://www.hevyapp.com/features/track-workouts/) -- workout logging UX -- **HIGH confidence**
- [Hevy Sets Per Muscle Group](https://www.hevyapp.com/features/sets-per-muscle-group-per-week/) -- volume tracking -- **MEDIUM confidence**
- [Back4App Fitness Database Schema](https://www.back4app.com/tutorials/how-to-build-a-database-schema-for-a-fitness-tracking-application) -- general schema patterns -- **MEDIUM confidence**
- Supabase PostgreSQL partial unique indexes -- **HIGH confidence** (standard PostgreSQL feature)

---

*Architecture analysis: 2026-02-23*
