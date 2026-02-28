# Phase 18: Database Foundation & Exercise Library - Research

**Researched:** 2026-02-23
**Domain:** Supabase schema design, exercise library CRUD, weight unit preference, sidebar navigation
**Confidence:** HIGH

## Summary

Phase 18 delivers the foundational database schema and exercise library that all subsequent v4.0 fitness tracking phases (19-21) build upon. The scope is: (1) create 6 Supabase tables with RLS policies, (2) seed ~80-120 preset exercises via migration SQL, (3) build ExercisesDB class and exercise CRUD API, (4) build exercise library UI with client-side search/filter, (5) add weight unit preference (kg/lbs) to settings, and (6) add "Workouts" nav item to the sidebar. No new npm dependencies are needed for this phase -- recharts is only needed in Phase 21.

The prior v4.0 project research (`.planning/research/`) has already defined the complete SQL schema, TypeScript types, validation schemas, API routes, SWR hooks, and component structure. This phase-specific research focuses on implementation details, execution order, codebase integration points, and Phase 18-specific pitfalls.

**Primary recommendation:** Create all 6 database tables in Phase 18 (not just `exercises`) to lock the schema before any UI work begins. This prevents schema changes after workout data exists in later phases.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXER-01 | User can browse a preset exercise library of 80-120 common exercises organized by muscle group and equipment | Migration seeds ~100 preset exercises with `user_id IS NULL` visible via RLS to all authenticated users. ExercisesDB class loads all exercises in single query. Client-side grouping by `muscle_group_primary`. |
| EXER-02 | User can search exercises by name and filter by muscle group and equipment type | Load-all-then-filter-client-side pattern. `Array.filter()` with `.ilike()` on name, `.eq()` on muscle_group, `.eq()` on equipment. No server round-trips on keystroke. SWR caches full exercise list with long `dedupingInterval`. |
| EXER-03 | User can create custom exercises with name, primary muscle group, equipment, and exercise type | `POST /api/exercises` with Zod validation. ExercisesDB creates row with `user_id = auth.uid()` and `is_custom = true`. Custom exercises visible only to creating user via RLS. |
| EXER-04 | User can edit and delete their custom exercises | `PATCH /api/exercises/[id]` and `DELETE /api/exercises/[id]`. RLS policies enforce `auth.uid() = user_id AND is_custom = true` for UPDATE/DELETE. Preset exercises (`user_id IS NULL`) cannot be modified. DELETE uses `ON DELETE RESTRICT` on `workout_exercises.exercise_id` FK -- fails if exercise has logged workout data (future phases). |
| EXER-05 | Each exercise has an exercise type that determines tracking fields (weight+reps, bodyweight+reps, or duration) | `exercise_type` column with CHECK constraint. Three primary types for MVP: `weight_reps`, `bodyweight_reps`, `duration`. Full 8-type enum in schema for future use. `lib/fitness/exercise-fields.ts` maps type to displayed input fields. |
| SETT-01 | User can select weight unit preference (kg or lbs) in settings | Extend `ProfilePreferences` interface with `weight_unit: "kg" \| "lbs"`. Extend preferences Zod schema. Add WeightUnitSelector component to SettingsContent (follows WeekStartSelector pattern). No DB migration needed (JSONB column). |
| SETT-02 | All weight displays and inputs respect the user's unit preference (stored as kg internally) | `lib/fitness/units.ts` with `displayWeight()`, `toKg()`, `formatWeight()` utilities. All DB columns store `weight_kg` (canonical kg, `NUMERIC(7,2)`). Display conversion at UI boundary only. |
| SETT-03 | Workouts page appears as a top-level sidebar nav item with Dumbbell icon | Add entry to `mainNavItems` array in `components/layouts/app-sidebar.tsx`. Dumbbell icon from lucide-react (v0.511.0, already installed). Add "workouts" i18n key to all 3 locale files. Create minimal `/workouts` page (placeholder for Phase 19). |
</phase_requirements>

## Standard Stack

### Core

No new dependencies for Phase 18. All work uses the existing stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase (existing) | `@supabase/ssr` | Database tables, RLS policies, migrations | Already used for all existing tables |
| Zod (existing) | ^3.x | API input validation | Already used for all existing validation schemas |
| SWR (existing) | ^2.x | Client-side data fetching for exercise library | Already used for categories, projects, habits |
| lucide-react (existing) | 0.511.0 | Dumbbell icon for sidebar | Already installed, used for all sidebar icons |
| next-intl (existing) | ^4.x | i18n for exercise library and settings UI | Already used for all UI strings |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/fitness/units.ts` (NEW) | N/A | kg/lbs conversion utilities | Any weight display or input |
| `lib/fitness/exercise-fields.ts` (NEW) | N/A | Map exercise_type to input field config | Exercise form, workout set input (Phase 19) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Migration SQL seed | Lazy-seed in app code (like categories) | Categories seeds 12 rows (fast). Exercises seeds 80-120 rows (5+ second latency on first call). Migration SQL is correct for this volume. |
| Client-side filtering | Server-side search with `tsvector` | 80-120 exercises fit in browser memory (~200KB). Client-side `Array.filter()` is instant. Server search adds unnecessary API complexity and keystroke latency. |
| Single `exercises` table (preset + custom) | Separate `preset_exercises` and `user_exercises` tables | Single table with `user_id IS NULL` for presets is simpler. RLS handles visibility. One query returns all exercises. Two tables would require UNION queries. |

**Installation:**

```bash
# No new packages needed for Phase 18
# Recharts (via shadcn chart) is Phase 21 only
```

## Architecture Patterns

### Recommended Project Structure

```
New files:
supabase/migrations/
  20260224000001_create_fitness_tables.sql    # All 6 tables + RLS + constraints + indexes
  20260224000002_seed_preset_exercises.sql    # ~100 preset exercise INSERT statements

lib/db/
  exercises.ts                               # ExercisesDB class
  (index.ts — add export)

lib/fitness/
  units.ts                                   # kg/lbs conversion: displayWeight, toKg, formatWeight
  exercise-fields.ts                         # ExerciseType -> input field mapping

lib/validations/
  exercise.ts                                # exerciseFormSchema, exerciseUpdateSchema

lib/hooks/
  use-exercises.ts                           # useExercises() SWR hook

app/api/exercises/
  route.ts                                   # GET (list all), POST (create custom)
app/api/exercises/[id]/
  route.ts                                   # GET, PATCH, DELETE single exercise

app/workouts/
  page.tsx                                   # Placeholder page (Workouts landing)
  layout.tsx                                 # Shared layout for /workouts/*

components/fitness/exercise-library/
  exercise-library.tsx                       # Browseable/searchable exercise list
  exercise-card.tsx                          # Exercise display card
  exercise-filter-bar.tsx                    # Muscle group + equipment filters
  exercise-form.tsx                          # Create/edit custom exercise form

components/settings/
  weight-unit-selector.tsx                   # kg/lbs toggle

Modified files:
  lib/db/types.ts                            # Add Exercise, ExerciseType, MuscleGroup, Equipment types + future workout types
  lib/db/index.ts                            # Export exercises module
  lib/validations/preferences.ts             # Add weight_unit field
  components/layouts/app-sidebar.tsx          # Add Workouts nav item
  components/settings/settings-content.tsx    # Add weight unit card
  i18n/messages/en.json                      # Add workouts, exercises, settings.weightUnit strings
  i18n/messages/zh.json                      # Chinese translations
  i18n/messages/zh-TW.json                   # Traditional Chinese translations
```

### Pattern 1: Preset + Custom Exercises via RLS

**What:** Global preset exercises (`user_id IS NULL`) and per-user custom exercises (`user_id = auth.uid()`) in the same table, with RLS enforcing visibility.

**When to use:** Exercise library queries.

**Example:**

```sql
-- RLS policy: Users see all presets + their own custom exercises
CREATE POLICY "Users can view preset and own exercises"
  ON exercises FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

-- RLS policy: Users can only modify their own custom exercises
CREATE POLICY "Users can update own custom exercises"
  ON exercises FOR UPDATE
  USING (auth.uid() = user_id AND is_custom = true);
```

```typescript
// Source: Supabase JS client .or() filter
// ExercisesDB.getAllExercises() — RLS handles visibility, no explicit filter needed
const { data, error } = await this.supabase
  .from("exercises")
  .select("*")
  .order("name", { ascending: true });
// RLS automatically returns: preset (user_id IS NULL) + user's custom exercises
```

**Key insight:** Because RLS applies the `user_id IS NULL OR auth.uid() = user_id` filter at the database level, the DB class does NOT need to explicitly filter by user_id for SELECT queries. The Supabase client automatically includes the auth context. Only INSERT/UPDATE/DELETE operations need explicit `user_id` in the application code.

Source: [Supabase .or() filter](https://supabase.com/docs/reference/javascript/or) -- `.or('user_id.is.null,user_id.eq.{uuid}')` for explicit client-side filtering if needed.

### Pattern 2: Exercise Seeding via Migration SQL (Not Application Code)

**What:** Seed ~100 preset exercises as INSERT statements in a Supabase migration file. Exercises have `user_id = NULL` and `is_custom = false`.

**When to use:** Phase 18 setup.

**Why not lazy-seed like categories:** The existing `CategoriesDB.seedCategories()` inserts 12 rows on first API call. Exercise seeding inserts 80-120 rows with enum columns -- this would cause 5+ second latency on first exercise library access. Migration SQL runs once at deploy time.

**Example:**

```sql
-- supabase/migrations/20260224000002_seed_preset_exercises.sql
INSERT INTO exercises (name, muscle_group_primary, muscle_groups_secondary, equipment, exercise_type, is_custom)
VALUES
  ('Barbell Bench Press', 'chest', '{triceps,shoulders}', 'barbell', 'weight_reps', false),
  ('Incline Dumbbell Press', 'chest', '{triceps,shoulders}', 'dumbbell', 'weight_reps', false),
  ('Pull-up', 'back', '{biceps,forearms}', 'bodyweight', 'bodyweight_reps', false),
  ('Barbell Squat', 'quadriceps', '{glutes,hamstrings,core}', 'barbell', 'weight_reps', false),
  ('Deadlift', 'back', '{hamstrings,glutes,core,forearms}', 'barbell', 'weight_reps', false),
  ('Plank', 'core', '{}', 'bodyweight', 'duration', false)
  -- ... ~95 more exercises
  ;
```

### Pattern 3: Client-Side Exercise Filtering

**What:** Load all exercises in one SWR fetch, filter in browser with `Array.filter()`.

**When to use:** Exercise library search, exercise picker during workout.

**Why:** 80-120 exercises = ~200KB JSON. Instant client-side filtering vs. 50-200ms API round-trip per keystroke.

**Example:**

```typescript
// useExercises hook — fetches all exercises once
export function useExercises() {
  const { data, error, isLoading, mutate } = useSWR<{ exercises: Exercise[] }>(
    "/api/exercises",
    fetcher,
    { dedupingInterval: 600000 } // 10 min cache — exercises rarely change
  );
  return { exercises: data?.exercises ?? [], error, isLoading, mutate };
}

// Client-side filtering in component
const filtered = exercises.filter((e) => {
  if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
  if (muscleGroup && e.muscle_group_primary !== muscleGroup) return false;
  if (equipment && e.equipment !== equipment) return false;
  return true;
});
```

### Pattern 4: Weight Unit in ProfilePreferences (JSONB Extension)

**What:** Add `weight_unit: "kg" | "lbs"` to the existing `preferences` JSONB column on profiles. No DB migration needed.

**When to use:** Phase 18 settings UI.

**Example:**

```typescript
// lib/db/types.ts — extend existing interface
export interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs";  // NEW — defaults to "kg" if missing
}

// lib/validations/preferences.ts — extend existing schema
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

The existing `PATCH /api/profile/preferences` route already uses `preferencesSchema` -- extending the schema is the only code change needed on the API side. The `ProfilesDB.updatePreferences()` method merges the new field into the existing JSONB value.

### Pattern 5: Sidebar Nav Item Addition

**What:** Add "Workouts" as the 4th flat nav item in the sidebar.

**When to use:** Phase 18 sidebar modification.

**Example:**

```typescript
// components/layouts/app-sidebar.tsx
import { Dumbbell } from "lucide-react";

const mainNavItems = [
  { href: "/dashboard", icon: Home,          labelKey: "dashboard", match: (p: string) => p === "/dashboard" },
  { href: "/habits",    icon: ClipboardList,  labelKey: "habits",    match: (p: string) => p.startsWith("/habits") },
  { href: "/tasks",     icon: ListChecks,     labelKey: "tasks",     match: (p: string) => p.startsWith("/tasks") },
  { href: "/workouts",  icon: Dumbbell,       labelKey: "workouts",  match: (p: string) => p.startsWith("/workouts") },  // NEW
];
```

The existing nav rendering code handles the array generically -- no other changes needed.

### Anti-Patterns to Avoid

- **Lazy-seeding 100+ exercises in application code:** Use migration SQL, not `seedExercises()`. The categories lazy-seed pattern (12 rows) does not scale to 80-120 rows.
- **Server-side search/pagination for exercise library:** 80-120 exercises fit in memory. `tsvector`, GIN indexes, and pagination endpoints are overengineering.
- **Storing weights in user-preferred units:** Store ALL weights as `weight_kg` (canonical kg). Convert on display. Prevents data corruption on unit preference changes.
- **Separate tables per exercise type:** Use single `exercises` table with `exercise_type` enum. Separate tables would require UNION queries and make the exercise picker complex.
- **Creating only the `exercises` table in Phase 18:** Create ALL 6 fitness tables now. Future phases (19-21) need FK references across tables. Schema migrations are cheap; retroactive changes after data exists are expensive.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exercise data source | Scraping exercise databases at runtime | Curated seed SQL from `free-exercise-db` (Unlicense) | Static data. Network dependency for reference data is fragile. |
| Weight conversion | Inline `* 2.20462` everywhere | `lib/fitness/units.ts` centralized utilities | Single source of truth for conversion constants. Easy to update rounding strategy. |
| Exercise type field mapping | Per-component `if (type === 'weight_reps')` checks | `lib/fitness/exercise-fields.ts` lookup table | Centralized definition prevents UI/validation/chart logic from diverging. |
| API validation | Manual request body checks | Zod schemas in `lib/validations/exercise.ts` | Existing pattern. Type-safe. Automatic error messages. |

**Key insight:** The exercise library is a REFERENCE DATASET, not a dynamic service. Treat it like a lookup table with client-side filtering, not like a product catalog with server-side search.

## Common Pitfalls

### Pitfall 1: RLS Policy Blocks Preset Exercise Visibility

**What goes wrong:** Preset exercises have `user_id IS NULL`. A naive RLS policy `USING (auth.uid() = user_id)` fails because `auth.uid()` (a UUID) never equals NULL.

**Why it happens:** Copy-pasting RLS patterns from user-owned tables (habits, tasks, categories) that always have `user_id = auth.uid()`.

**How to avoid:** The SELECT policy MUST use `USING (user_id IS NULL OR auth.uid() = user_id)`. The OR condition makes presets visible to all authenticated users.

**Warning signs:** Exercise library shows 0 preset exercises. Custom exercises appear but presets don't.

### Pitfall 2: Migration SQL INSERT Fails on Enum Constraint

**What goes wrong:** A typo in the seed data (e.g., `'barbel'` instead of `'barbell'`) causes the entire migration to fail because of the CHECK constraint on the `equipment` column.

**Why it happens:** 100+ INSERT rows with hand-typed enum values.

**How to avoid:** Define the seed data in a TypeScript file (`lib/fitness/exercise-seed.ts`) that imports the enum types. Generate the SQL from the typed data. Or at minimum, enumerate all valid values as comments at the top of the seed migration file.

**Warning signs:** Migration fails with `new row violates check constraint`.

### Pitfall 3: Weight Unit Preference Not Defaulting for Existing Users

**What goes wrong:** Existing users have a `preferences` JSONB object that does NOT contain `weight_unit`. The UI reads `profile.preferences.weight_unit` and gets `undefined`, causing the weight unit selector to render without a selection or throwing a runtime error.

**Why it happens:** JSONB is schema-on-write. Existing profiles were created before `weight_unit` was added.

**How to avoid:** Always use `profile.preferences.weight_unit ?? "kg"` (nullish coalescing) when reading the preference. The TypeScript interface says `weight_unit: "kg" | "lbs"` but the runtime value may be `undefined` for existing users. The settings UI initializes from `data.profile.preferences.weight_unit ?? "kg"`.

**Warning signs:** Existing users see the weight unit selector with no option selected. TypeScript compiles fine but runtime crashes on `undefined.toUpperCase()`.

### Pitfall 4: Exercise DELETE Succeeds When Exercise Has Workout Data (Future)

**What goes wrong:** User creates a custom exercise in Phase 18, logs workouts with it in Phase 19, then tries to delete it. If the `workout_exercises.exercise_id` FK uses `ON DELETE CASCADE`, deleting the exercise silently destroys historical workout data.

**Why it happens:** Using `CASCADE` by default without considering future FK references.

**How to avoid:** Use `ON DELETE RESTRICT` for the `exercise_id` FK on `workout_exercises`. This prevents deleting an exercise that has been used in any workout. The API should catch the FK violation error and return a user-friendly message ("This exercise has been used in workouts and cannot be deleted").

**Warning signs:** Deleting an exercise also deletes all workout sets that reference it. Workout history suddenly shows fewer exercises.

### Pitfall 5: Sidebar Counts API Extended for Workouts

**What goes wrong:** Adding a workout query to the existing `/api/sidebar/counts` endpoint slows it down (third parallel Supabase query) and introduces a workout badge count that clutters the sidebar.

**Why it happens:** Following the existing pattern where habits and tasks have badge counts.

**How to avoid:** Do NOT add workout counts to the sidebar counts endpoint in Phase 18. The sidebar Workouts nav item gets no badge initially. In Phase 19, an "active workout" dot indicator can be driven from client-side state (localStorage flag), not from the API.

**Warning signs:** Sidebar counts endpoint response time increases by 50%+. Workouts badge shows a number that is unclear in meaning.

## Code Examples

Verified patterns from the existing codebase and Supabase documentation.

### ExercisesDB Class (Following Existing DB Class Pattern)

```typescript
// lib/db/exercises.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise, ExerciseInsert, ExerciseUpdate } from "./types";

export class ExercisesDB {
  constructor(private supabase: SupabaseClient) {}

  /** Get all exercises visible to the user (presets + custom). RLS handles visibility. */
  async getAllExercises(): Promise<Exercise[]> {
    const { data, error } = await this.supabase
      .from("exercises")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Get a single exercise by id. Returns null if not found or not visible. */
  async getExercise(id: string): Promise<Exercise | null> {
    const { data, error } = await this.supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /** Create a custom exercise. Sets user_id and is_custom = true. */
  async createExercise(userId: string, exercise: Omit<ExerciseInsert, "user_id" | "is_custom">): Promise<Exercise> {
    const { data, error } = await this.supabase
      .from("exercises")
      .insert({ ...exercise, user_id: userId, is_custom: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Update a custom exercise. RLS enforces ownership + is_custom. */
  async updateExercise(id: string, updates: ExerciseUpdate): Promise<Exercise> {
    const { data, error } = await this.supabase
      .from("exercises")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Delete a custom exercise. Fails with FK error if used in workouts (RESTRICT). */
  async deleteExercise(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("exercises")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}
```

### Exercises API Route (Following Existing Category Route Pattern)

```typescript
// app/api/exercises/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ExercisesDB } from "@/lib/db/exercises";
import { validateRequestBody } from "@/lib/validations/api";
import { exerciseFormSchema } from "@/lib/validations/exercise";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const exercisesDB = new ExercisesDB(supabase);
    const exercises = await exercisesDB.getAllExercises();
    return NextResponse.json({ exercises });
  } catch (error) {
    log.error("GET /api/exercises error", error);
    return NextResponse.json({ error: "Failed to fetch exercises" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const validation = validateRequestBody(body, exerciseFormSchema);
    if (!validation.success) return validation.response;

    const exercisesDB = new ExercisesDB(supabase);
    const exercise = await exercisesDB.createExercise(user.id, validation.data);
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    log.error("POST /api/exercises error", error);
    return NextResponse.json({ error: "Failed to create exercise" }, { status: 500 });
  }
}
```

### Weight Unit Conversion Utilities

```typescript
// lib/fitness/units.ts
export type WeightUnit = "kg" | "lbs";

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

/** Convert kg to display unit. Rounds to 2 decimal places. */
export function displayWeight(kg: number, unit: WeightUnit): number {
  if (unit === "lbs") return Math.round(kg * KG_TO_LBS * 100) / 100;
  return kg;
}

/** Convert user input to kg for storage. */
export function toKg(value: number, unit: WeightUnit): number {
  if (unit === "lbs") return Math.round(value * LBS_TO_KG * 100) / 100;
  return value;
}

/** Format weight with unit suffix for display. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const display = displayWeight(kg, unit);
  return `${display} ${unit}`;
}
```

### Exercise Type to Input Field Mapping

```typescript
// lib/fitness/exercise-fields.ts
import type { ExerciseType } from "@/lib/db/types";

export interface ExerciseFieldConfig {
  showWeight: boolean;
  showReps: boolean;
  showDuration: boolean;
  showDistance: boolean;
  primaryMetric: "weight" | "reps" | "duration" | "distance";
}

export const EXERCISE_FIELD_MAP: Record<ExerciseType, ExerciseFieldConfig> = {
  weight_reps:          { showWeight: true,  showReps: true,  showDuration: false, showDistance: false, primaryMetric: "weight" },
  bodyweight_reps:      { showWeight: false, showReps: true,  showDuration: false, showDistance: false, primaryMetric: "reps" },
  weighted_bodyweight:  { showWeight: true,  showReps: true,  showDuration: false, showDistance: false, primaryMetric: "weight" },
  assisted_bodyweight:  { showWeight: true,  showReps: true,  showDuration: false, showDistance: false, primaryMetric: "weight" },
  duration:             { showWeight: false, showReps: false, showDuration: true,  showDistance: false, primaryMetric: "duration" },
  duration_weight:      { showWeight: true,  showReps: false, showDuration: true,  showDistance: false, primaryMetric: "duration" },
  distance_duration:    { showWeight: false, showReps: false, showDuration: true,  showDistance: true,  primaryMetric: "distance" },
  weight_distance:      { showWeight: true,  showReps: false, showDuration: false, showDistance: true,  primaryMetric: "weight" },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lazy-seed exercises per user (like categories) | Seed via migration SQL with `user_id IS NULL` | v4.0 design decision | Avoids 5s+ latency on first exercise library load. Preset exercises shared globally. |
| Store weight in user-preferred unit | Store as canonical `weight_kg` always | v4.0 design decision (STATE.md) | Prevents data corruption on unit switches. Industry standard (Hevy, Strong, FitNotes). |
| Compute PRs on-demand from all workout data | Incremental `personal_records` table | v4.0 design decision (STATE.md) | Create table in Phase 18 schema. Populate in Phase 21. O(1) PR lookups. |
| Separate tables per exercise type | Single `workout_sets` table with nullable columns | v4.0 design decision | `exercise_type` on parent exercise determines valid fields. Simpler queries, no UNIONs. |

**Deprecated/outdated:**
- Category-style lazy seeding should NOT be used for exercises (wrong scale)
- Per-set `weight_unit` column was considered in PITFALLS.md but rejected in favor of canonical `weight_kg` storage (STATE.md decision)

## Open Questions

1. **Exercise seed data completeness**
   - What we know: Need ~80-120 exercises covering all 14 muscle groups and 9 equipment types. `free-exercise-db` (Unlicense) has 800+ exercises to curate from.
   - What's unclear: The exact list of exercises to include. Should be curated during implementation.
   - Recommendation: Start with Hevy's most common exercises. Aim for 8-10 exercises per major muscle group. Ensure all 3 MVP exercise types (`weight_reps`, `bodyweight_reps`, `duration`) are well-represented.

2. **Exercise name i18n strategy**
   - What we know: Exercise names need translation in en, zh, zh-TW. The REQUIREMENTS deferred complete exercise name translations (DFRD-05).
   - What's unclear: Whether to store exercise names as i18n keys in the DB or as English strings with runtime translation lookup.
   - Recommendation: Store English names directly in the DB `name` column. For i18n, create `exercises.names.*` keys in locale files for the ~50 most common exercises. Use the DB `name` as fallback when no translation exists. This keeps the seed migration simple and supports incremental translation.

3. **All 6 tables vs. exercises-only in Phase 18**
   - What we know: STATE.md says "lock schema". ARCHITECTURE.md defines all 6 tables. Only `exercises` is directly used in Phase 18 UI.
   - What's unclear: Whether to create tables that won't have UI until Phase 19-21.
   - Recommendation: Create ALL 6 tables in Phase 18 migration. Reasons: (1) schema is the hardest thing to change after data exists, (2) FK references across tables need all tables present, (3) running one migration is cheaper than running 4 separate ones, (4) the personal_records table should exist from the start per STATE.md decision.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `lib/db/categories.ts` (DB class pattern), `app/api/categories/route.ts` (API route pattern), `lib/validations/category.ts` (Zod schema pattern), `components/settings/settings-content.tsx` (settings UI pattern), `components/layouts/app-sidebar.tsx` (sidebar nav pattern)
- `.planning/research/ARCHITECTURE.md` -- complete SQL schema, type definitions, validation schemas, API routes, component structure
- `.planning/research/STACK.md` -- stack additions analysis (no new deps for Phase 18)
- `.planning/research/PITFALLS.md` -- 14 pitfalls with prevention strategies
- `.planning/STATE.md` -- locked decisions (weight_kg canonical storage, migration SQL seeding, incremental personal_records table)
- [Supabase JS .or() filter](https://supabase.com/docs/reference/javascript/or) -- PostgREST syntax for combining NULL and equality checks
- [Supabase RLS documentation](https://supabase.com/docs/guides/auth/row-level-security) -- policy syntax for preset rows

### Secondary (MEDIUM confidence)
- [Supabase .or() filter with NULL discussion #4861](https://github.com/orgs/supabase/discussions/4861) -- confirmed `.or('user_id.is.null,user_id.eq.{uuid}')` syntax
- [free-exercise-db (GitHub)](https://github.com/yuhonas/free-exercise-db) -- 800+ exercises, Unlicense, JSON format (source for curated seed)
- `.planning/research/SUMMARY.md` -- phase ordering rationale and research gaps

### Tertiary (LOW confidence)
- None. All Phase 18 patterns are verified against existing codebase or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All patterns exist in codebase.
- Architecture: HIGH - Direct extension of existing DB class + API route + SWR hook pattern. SQL schema pre-designed in ARCHITECTURE.md.
- Pitfalls: HIGH - Verified against existing codebase patterns. RLS preset visibility, migration seed failures, and weight unit defaulting are concrete risks with proven solutions.

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain, no external dependency updates expected)
