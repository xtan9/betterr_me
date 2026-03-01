# Phase 21: History, Personal Records & Progression - Research

**Researched:** 2026-02-24
**Domain:** Workout history display, personal records detection, exercise progression charting, dashboard integration
**Confidence:** HIGH

## Summary

Phase 21 is the "payoff" phase of the v4.0 fitness tracking milestone. It delivers read-only views of completed workout data (history list, workout detail), automatic personal record detection with mid-workout celebration banners, per-exercise progression charts, and dashboard fitness widget integration. All upstream data (exercises, workouts, sets, routines) was created in Phases 18-20 and is fully functional.

The core technical challenges are: (1) installing and configuring Recharts v2 via shadcn's chart component for progression charts with dark mode support, (2) designing the exercise history aggregation query (3-table JOIN across RLS tables) that may need `supabase.rpc()` if client-side Supabase JS proves too slow, (3) implementing personal record detection that compares completed sets against stored bests on workout completion, and (4) extending the existing dashboard API to include workout stats without degrading response time.

**Primary recommendation:** Use on-demand PR computation (compute best values from workout_sets at query time) for v4.0 MVP since a personal app with <500 workouts doesn't need incremental caching. Install `recharts` via `pnpm dlx shadcn@latest add chart` to get the shadcn ChartContainer wrapper with automatic dark mode theming. Use application-code aggregation for exercise history unless performance testing shows >100ms latency.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HIST-01 | User can view a reverse-chronological list of past workouts with summary info (date, title, exercises, volume, duration) | WorkoutsDB.getWorkouts() already returns completed workouts; needs enrichment with exercise count and total volume via getWorkoutWithExercises() or a new summary query |
| HIST-02 | User can view a completed workout detail showing all exercises, sets, PRs achieved, and duration | WorkoutsDB.getWorkoutWithExercises() exists and returns full nested data; needs read-only detail view component and PR badge overlays per set |
| HIST-03 | User can view per-exercise progression charts showing weight/volume over time with date range selector (1m/3m/6m/all) | Requires new exercise history API, Recharts LineChart via shadcn chart component, date range filtering, ExerciseHistoryEntry type already defined in types.ts |
| HIST-04 | Personal records (max weight, best set volume) are automatically detected and stored per exercise | On-demand computation from workout_sets using MAX/SUM aggregation; PersonalRecord type already in types.ts; compare completed normal sets per exercise |
| HIST-05 | User sees a congratulatory PR banner mid-workout when a new personal record is set | Hook into completeSet flow in useActiveWorkout; fetch current PR for exercise, compare set values, show inline toast/banner on new PR |
| HIST-06 | Dashboard shows last workout date and current week's workout count | Extend GET /api/dashboard to query workouts table for most recent completed_at and count WHERE started_at within current week |
| I18N-01 | All fitness tracking UI strings are translated in en, zh, and zh-TW | New i18n keys for history, detail view, progression chart, PR banner, dashboard workout widget across all 3 locale files |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.15 (v2.x) | Line charts for exercise progression | shadcn chart component wraps Recharts v2; v3 not yet supported by shadcn (issue #7669). Recharts v2 supports React 19. |
| shadcn chart | N/A (component) | ChartContainer, ChartTooltip, ChartTooltipContent wrappers | Provides dark mode via CSS custom properties, consistent theming with existing shadcn UI, typed ChartConfig |
| swr | ^2.4.0 (installed) | Data fetching for history list, workout detail, exercise history | Existing pattern; useExerciseHistory(), useWorkouts() hooks follow established convention |
| date-fns | ^4.1.0 (installed) | Date range computation, formatting for chart axis labels | Already used in project; provides subMonths, startOfWeek, format for date range selector |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.511 (installed) | Icons for trophy/medal (PR badge), calendar, clock, chart | PR banner, history list, dashboard widget icons |
| sonner | ^2.0 (installed) | Toast notifications for PR celebration | Mid-workout PR detection could use toast for non-blocking notification |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts v2 | Recharts v3 | v3 adds Redux/Immer deps (heavy), not yet supported by shadcn chart wrapper |
| On-demand PR computation | Incremental personal_records table | Table adds complexity (migration, update triggers, consistency); unnecessary for <500 workouts. Can add later if needed. |
| Application-code aggregation | supabase.rpc() PostgreSQL function | RPC is faster for large datasets but adds migration/deployment complexity; benchmark first |

**Installation:**
```bash
pnpm dlx shadcn@latest add chart
```
This installs `recharts` as a dependency and generates `components/ui/chart.tsx` with ChartContainer, ChartTooltip, ChartTooltipContent, and ChartConfig type.

## Architecture Patterns

### Recommended Project Structure
```
components/
  fitness/
    workout-history/
      workout-history-list.tsx        # Reverse-chronological list of past workouts
      workout-history-card.tsx        # Summary card (date, title, exercise count, volume, duration)
      workout-detail-view.tsx         # Full completed workout read-only view
    progress/
      exercise-progress-chart.tsx     # Recharts LineChart with date range selector
      personal-records-card.tsx       # PR display for an exercise (max weight, best volume)
      pr-banner.tsx                   # Congratulatory inline banner for mid-workout PR
  dashboard/
    workout-stats-widget.tsx          # Dashboard widget showing last workout + week count

lib/
  hooks/
    use-workouts.ts                   # SWR hook: useWorkouts() for history list (NEW)
    use-exercise-history.ts           # SWR hook: useExerciseHistory() for progression (NEW)
  fitness/
    personal-records.ts               # PR computation logic (compare sets, determine new PRs)

app/
  workouts/
    history/
      page.tsx                        # Workout history list page
    [id]/
      page.tsx                        # Completed workout detail page
  api/
    exercises/
      [id]/
        history/
          route.ts                    # GET: exercise progression data
    workouts/
      route.ts                        # GET: extend with summary enrichment
```

### Pattern 1: Workout History Summary Enrichment
**What:** The existing `WorkoutsDB.getWorkouts()` returns flat Workout objects without exercise counts or volume. History list needs summary data.
**When to use:** Workout history list page (HIST-01).
**Approach:** Two options:
1. **Option A (Simple):** Fetch workout list, then for each workout call `getWorkoutWithExercises()` and compute summary client-side. Works for <50 workouts per page but is N+1.
2. **Option B (Efficient):** New `getWorkoutsWithSummary()` method that fetches workouts with nested exercise/set counts using Supabase's nested select + aggregation in app code.

**Recommended:** Option B. Use a single query with `select('*, workout_exercises(*, sets:workout_sets(*)))')` to get all nested data in one request, then compute exercise count, total volume, and set count in application code.

```typescript
// In WorkoutsDB
async getWorkoutsWithSummary(userId: string, options?: { limit?: number; offset?: number }) {
  const { data, error } = await this.supabase
    .from("workouts")
    .select(`
      *,
      workout_exercises (
        id,
        exercise:exercises (name),
        sets:workout_sets (weight_kg, reps, is_completed, set_type)
      )
    `)
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Reshape: compute exerciseCount, totalVolume, totalSets per workout
  return data.map(w => ({
    ...w,
    exerciseCount: w.workout_exercises.length,
    exerciseNames: w.workout_exercises.map(we => we.exercise?.name).filter(Boolean),
    totalVolume: w.workout_exercises.reduce((sum, we) =>
      sum + we.sets.filter(s => s.is_completed)
        .reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0), 0),
    totalSets: w.workout_exercises.reduce((sum, we) =>
      sum + we.sets.filter(s => s.is_completed).length, 0),
  }));
}
```

### Pattern 2: Exercise History Aggregation
**What:** Compute per-workout aggregated stats for a specific exercise across all completed workouts.
**When to use:** Progression chart (HIST-03), personal records (HIST-04).
**Approach:** Application-code aggregation using Supabase's nested select.

```typescript
// In a new method on WorkoutsDB or a new ExerciseHistoryDB
async getExerciseHistory(exerciseId: string, options?: {
  since?: string; // ISO date string for date range filtering
  limit?: number;
}): Promise<ExerciseHistoryEntry[]> {
  let query = this.supabase
    .from("workout_exercises")
    .select(`
      workout_id,
      sets:workout_sets (weight_kg, reps, is_completed, set_type),
      workout:workouts!inner (id, started_at, status)
    `)
    .eq("exercise_id", exerciseId)
    .eq("workout.status", "completed");

  if (options?.since) {
    query = query.gte("workout.started_at", options.since);
  }

  const { data, error } = await query.limit(options?.limit ?? 100);

  // Group by workout, compute aggregates per workout
  return data
    .map(row => {
      const completedSets = row.sets.filter(
        (s: WorkoutSet) => s.is_completed && s.set_type === "normal"
      );
      return {
        date: row.workout.started_at.split("T")[0],
        workout_id: row.workout.id,
        best_set_weight_kg: Math.max(...completedSets.map(s => s.weight_kg ?? 0)) || null,
        best_set_reps: Math.max(...completedSets.map(s => s.reps ?? 0)) || null,
        total_volume: completedSets.reduce(
          (sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0
        ) || null,
        total_sets: completedSets.length,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // Ascending for chart
}
```

### Pattern 3: On-Demand Personal Record Computation
**What:** Compute personal records from existing workout_sets data without a separate table.
**When to use:** HIST-04, HIST-05 (PR detection).
**Approach:** Query all completed normal sets for an exercise, compute MAX values.

```typescript
// lib/fitness/personal-records.ts
import type { WorkoutSet, PersonalRecord } from "@/lib/db/types";

export function computePersonalRecords(
  exerciseId: string,
  allSets: Array<WorkoutSet & { workout_started_at: string }>
): PersonalRecord {
  const completedNormal = allSets.filter(
    s => s.is_completed && s.set_type === "normal"
  );

  let bestWeight: { value: number; date: string } | null = null;
  let bestVolume: { value: number; date: string } | null = null;
  let bestReps: { value: number; date: string } | null = null;
  let bestDuration: { value: number; date: string } | null = null;

  for (const set of completedNormal) {
    if (set.weight_kg != null && (!bestWeight || set.weight_kg > bestWeight.value)) {
      bestWeight = { value: set.weight_kg, date: set.workout_started_at };
    }
    const volume = (set.weight_kg ?? 0) * (set.reps ?? 0);
    if (volume > 0 && (!bestVolume || volume > bestVolume.value)) {
      bestVolume = { value: volume, date: set.workout_started_at };
    }
    if (set.reps != null && (!bestReps || set.reps > bestReps.value)) {
      bestReps = { value: set.reps, date: set.workout_started_at };
    }
    if (set.duration_seconds != null && (!bestDuration || set.duration_seconds > bestDuration.value)) {
      bestDuration = { value: set.duration_seconds, date: set.workout_started_at };
    }
  }

  return {
    exercise_id: exerciseId,
    best_weight_kg: bestWeight?.value ?? null,
    best_reps: bestReps?.value ?? null,
    best_volume: bestVolume?.value ?? null,
    best_duration_seconds: bestDuration?.value ?? null,
    achieved_at: bestWeight?.date ?? bestVolume?.date ?? bestReps?.date ?? bestDuration?.date ?? "",
  };
}

/** Check if a set beats any existing PR */
export function isNewPR(
  set: WorkoutSet,
  currentPR: PersonalRecord | null
): { isWeightPR: boolean; isVolumePR: boolean } {
  if (!currentPR) return { isWeightPR: true, isVolumePR: true };

  const isWeightPR = set.weight_kg != null &&
    (currentPR.best_weight_kg == null || set.weight_kg > currentPR.best_weight_kg);

  const volume = (set.weight_kg ?? 0) * (set.reps ?? 0);
  const isVolumePR = volume > 0 &&
    (currentPR.best_volume == null || volume > currentPR.best_volume);

  return { isWeightPR, isVolumePR };
}
```

### Pattern 4: Mid-Workout PR Detection (HIST-05)
**What:** When a set is marked complete during an active workout, compare against the exercise's stored best values and show a congratulatory banner.
**When to use:** In completeSet flow within useActiveWorkout hook.
**Approach:**
1. On workout start or exercise add, fetch the exercise's current PR from the exercise history API (cached by SWR).
2. On set completion, run `isNewPR()` client-side comparison.
3. If PR detected, show a toast notification or inline banner.

The PR check is client-side and instant (comparing two numbers). The PR data is fetched once per exercise and cached. This avoids any server-side mid-workout overhead.

```typescript
// In the workout logger component, when a set is completed:
const handleSetComplete = async (workoutExerciseId: string, setId: string) => {
  const shouldStartTimer = await actions.completeSet(workoutExerciseId, setId);

  // Check for PR
  const exercise = workout.exercises.find(e => e.id === workoutExerciseId);
  const completedSet = exercise?.sets.find(s => s.id === setId);
  if (completedSet && exercisePRs[exercise.exercise_id]) {
    const { isWeightPR, isVolumePR } = isNewPR(completedSet, exercisePRs[exercise.exercise_id]);
    if (isWeightPR || isVolumePR) {
      // Show PR celebration
    }
  }

  if (shouldStartTimer) startRestTimer(/* ... */);
};
```

### Pattern 5: Progression Chart with Date Range Selector
**What:** LineChart showing max weight and/or total volume per workout over time, with 1m/3m/6m/all toggle.
**When to use:** Exercise detail page (HIST-03).
**Approach:** Use shadcn ChartContainer + Recharts LineChart with date-based X axis.

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  weight: { label: "Max Weight", color: "hsl(var(--chart-1))" },
  volume: { label: "Total Volume", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

// Date range filtering via SWR key:
const since = useMemo(() => {
  if (range === "1m") return subMonths(new Date(), 1).toISOString();
  if (range === "3m") return subMonths(new Date(), 3).toISOString();
  if (range === "6m") return subMonths(new Date(), 6).toISOString();
  return undefined; // "all"
}, [range]);

// SWR hook passes since as query param
const { history } = useExerciseHistory(exerciseId, { since });
```

### Pattern 6: Dashboard Workout Widget (HIST-06)
**What:** Extend the dashboard API to include last workout date and current week workout count.
**When to use:** Dashboard page alongside existing habits/tasks widgets.
**Approach:** Add two additional queries to the existing `GET /api/dashboard` handler using `Promise.all()`.

```typescript
// In GET /api/dashboard, add to the Promise.all:
const [lastWorkout, weekWorkoutCount] = await Promise.all([
  supabase
    .from("workouts")
    .select("completed_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single()
    .then(r => r.data?.completed_at ?? null)
    .catch(() => null),

  supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("started_at", weekStartDate)
    .then(r => r.count ?? 0)
    .catch(() => 0),
]);
```

### Anti-Patterns to Avoid
- **Computing PRs on every page load with full-table scan:** Use the on-demand approach with exercise-specific queries, not scanning all sets in the database. The exercise history API already filters by exercise_id, which is bounded.
- **Fetching full nested workout data for the history list:** The list only needs summary info. Don't call `getWorkoutWithExercises()` N times. Use a single query with nested select and app-code aggregation.
- **Polling for PR changes during active workout:** PRs are detected client-side by comparing the just-completed set against the cached exercise best. No server round-trip needed.
- **Storing the progression chart data in a separate cache table:** Unnecessary for a personal app. The 3-table JOIN is fast for <500 workouts per exercise. If needed later, add `supabase.rpc()`.
- **Using Recharts v3:** shadcn chart does not support v3 yet. Recharts v3 adds heavy deps (Redux, Immer). Stick with v2.x.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas charts | Recharts v2 via shadcn ChartContainer | Axes, tooltips, responsiveness, dark mode, accessibility are hard. Recharts handles all of it. |
| Chart dark mode theming | Manual color switching based on theme | shadcn ChartConfig + CSS custom properties | ChartContainer auto-applies theme-aware colors via `--chart-1`, `--chart-2` CSS vars |
| Date range computation | Manual date math | date-fns `subMonths`, `startOfWeek`, `format` | Already in the project. Handles edge cases (month boundaries, leap years) |
| Responsive chart sizing | Fixed width/height | Recharts `ResponsiveContainer` (auto via ChartContainer) | ChartContainer wraps ResponsiveContainer automatically |

**Key insight:** The shadcn chart component wraps Recharts with theme-aware defaults and typed config. Using it directly (instead of raw Recharts) saves ~50 lines of boilerplate per chart and ensures dark mode works without extra effort.

## Common Pitfalls

### Pitfall 1: Exercise History Query Performance on RLS Tables
**What goes wrong:** The 3-table JOIN (workouts -> workout_exercises -> workout_sets) traverses RLS policies on each table. Supabase's PostgREST translates this to subqueries which can be slow.
**Why it happens:** RLS policies use `EXISTS (SELECT 1 FROM ...)` subqueries. JOINing across multiple RLS-protected tables multiplies these checks.
**How to avoid:** Start with the Supabase JS nested select approach (Pattern 2 above). Benchmark with realistic data (50+ workouts). If >100ms, implement a `supabase.rpc()` PostgreSQL function that runs inside the security context (avoiding per-row RLS checks).
**Warning signs:** API response time for `/api/exercises/[id]/history` exceeds 200ms. Chart data takes noticeably long to load.

### Pitfall 2: SWR Key Explosion for Date-Ranged Queries
**What goes wrong:** Different date range selections create different SWR cache keys, causing refetches when toggling between 1m/3m/6m/all.
**Why it happens:** SWR caches by key. If the key includes the date range, each range is a separate cache entry.
**How to avoid:** Fetch "all" data once and filter client-side. For exercise history, even 250 data points (5 years of weekly workouts) is trivially small. Use `keepPreviousData: true` to prevent skeleton flash during transitions.
**Warning signs:** Flash of loading state when switching date ranges.

### Pitfall 3: PR Detection Race Condition
**What goes wrong:** User completes a set that is a new PR, but the PR banner shows for the wrong exercise or doesn't show at all.
**Why it happens:** The completeSet flow is async. By the time the comparison runs, the workout state may have changed (another set completed).
**How to avoid:** Capture the set data and exercise PR snapshot BEFORE the async mutation. Run the comparison synchronously with captured values, then trigger the banner. Don't re-read from SWR cache for the comparison.
**Warning signs:** PR banner appears after a delay, or appears for the wrong exercise.

### Pitfall 4: Dashboard API Regression
**What goes wrong:** Adding workout queries to the dashboard API degrades response time for all users, including those who don't use workouts.
**Why it happens:** Two additional Supabase queries added to the critical path.
**How to avoid:** Add the workout queries to the existing `Promise.all()` with `.catch(() => fallbackValue)` pattern (matching the supplementary queries pattern used for habit logs). If the queries fail, the dashboard still works with null workout stats.
**Warning signs:** Dashboard load time increases by >50ms after adding workout queries.

### Pitfall 5: Volume Calculation Inconsistency
**What goes wrong:** Volume displayed in history list doesn't match volume in workout detail view.
**Why it happens:** Different code paths compute volume differently (e.g., including warmup sets in one but not the other, or computing from weight_kg directly vs. after unit conversion).
**How to avoid:** Create a single `computeVolume(sets: WorkoutSet[])` utility in `lib/fitness/units.ts` and use it everywhere. Always compute from `weight_kg` (canonical unit), never from displayed values. Only include `is_completed = true` sets in volume calculations.
**Warning signs:** Numbers don't match across views.

### Pitfall 6: Missing PR Data for Bodyweight/Duration Exercises
**What goes wrong:** PR detection only works for weight-based exercises, ignoring bodyweight exercises (max reps) and duration exercises (max time).
**Why it happens:** PR logic only checks `best_weight_kg` and `best_volume`, which are null for non-weight exercises.
**How to avoid:** Use `EXERCISE_FIELD_MAP` to determine which PR types are relevant per exercise type. For `bodyweight_reps`: track max reps. For `duration`: track max duration_seconds. The `isNewPR()` function should check the relevant fields based on exercise type.
**Warning signs:** No PRs ever show for Pull-ups or Plank.

## Code Examples

### shadcn Chart Setup (after `pnpm dlx shadcn@latest add chart`)

```tsx
// components/fitness/progress/exercise-progress-chart.tsx
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExerciseHistoryEntry, WeightUnit } from "@/lib/db/types";
import { displayWeight } from "@/lib/fitness/units";

interface ExerciseProgressChartProps {
  history: ExerciseHistoryEntry[];
  weightUnit: WeightUnit;
}

const chartConfig = {
  weight: {
    label: "Max Weight",
    color: "hsl(var(--chart-1))",
  },
  volume: {
    label: "Total Volume",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

type DateRange = "1m" | "3m" | "6m" | "all";

export function ExerciseProgressChart({
  history,
  weightUnit,
}: ExerciseProgressChartProps) {
  const t = useTranslations("workouts");
  const [range, setRange] = useState<DateRange>("3m");

  const filteredData = useMemo(() => {
    if (range === "all") return history;
    const months = range === "1m" ? 1 : range === "3m" ? 3 : 6;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return history.filter((entry) => entry.date >= cutoffStr);
  }, [history, range]);

  const chartData = useMemo(
    () =>
      filteredData.map((entry) => ({
        date: entry.date,
        weight: entry.best_set_weight_kg
          ? displayWeight(entry.best_set_weight_kg, weightUnit)
          : null,
        volume: entry.total_volume
          ? displayWeight(entry.total_volume, weightUnit)
          : null,
      })),
    [filteredData, weightUnit]
  );

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={(v) => v && setRange(v as DateRange)}
        className="justify-start"
      >
        <ToggleGroupItem value="1m">1M</ToggleGroupItem>
        <ToggleGroupItem value="3m">3M</ToggleGroupItem>
        <ToggleGroupItem value="6m">6M</ToggleGroupItem>
        <ToggleGroupItem value="all">{t("all")}</ToggleGroupItem>
      </ToggleGroup>

      <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <LineChart data={chartData} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
          />
          <YAxis tickLine={false} axisLine={false} width={50} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--color-weight)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="var(--color-volume)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
```

### Workout History Card

```tsx
// components/fitness/workout-history/workout-history-card.tsx
interface WorkoutSummary {
  id: string;
  title: string;
  started_at: string;
  duration_seconds: number | null;
  exerciseCount: number;
  exerciseNames: string[];
  totalVolume: number;
  totalSets: number;
}

function WorkoutHistoryCard({ workout, weightUnit }: { workout: WorkoutSummary; weightUnit: WeightUnit }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{workout.title}</h3>
            <p className="text-sm text-muted-foreground">
              {new Date(workout.started_at).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right text-sm">
            {workout.duration_seconds && (
              <p>{formatDuration(workout.duration_seconds)}</p>
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span>{workout.exerciseCount} exercises</span>
          <span>{workout.totalSets} sets</span>
          {workout.totalVolume > 0 && (
            <span>{formatWeight(workout.totalVolume, weightUnit)}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {workout.exerciseNames.join(", ")}
        </p>
      </CardContent>
    </Card>
  );
}
```

### Dashboard Workout Stats Widget

```tsx
// Extend DashboardData type in lib/db/types.ts
interface DashboardData {
  // ... existing fields ...
  stats: {
    // ... existing fields ...
    last_workout_at: string | null;
    week_workout_count: number;
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts v3 (Redux-based) | Recharts v2.x (lightweight) | shadcn issue #7669 (2024-ongoing) | Must use v2 until shadcn adds v3 support. v2 is stable and performant. |
| Separate personal_records table | On-demand computation from workout_sets | ARCHITECTURE.md Anti-Pattern 4 (v4.0 design) | Simpler, no migration needed, acceptable for <500 workouts per exercise |
| Server-side SQL aggregation (supabase.rpc) | App-code aggregation with Supabase nested select | v4.0 design decision | Simpler initially; upgrade to rpc() if performance demands |

**Deprecated/outdated:**
- The original v4.0 research (STACK.md) recommended a `personal_records` table be created in Phase 18. It was NOT created. The ARCHITECTURE.md (more recent) notes on-demand computation is fine for v4.0 MVP. The types.ts `PersonalRecord` interface exists and is suitable for both on-demand and cached approaches.

## Open Questions

1. **Exercise history query performance with RLS**
   - What we know: The 3-table JOIN (workouts -> workout_exercises -> workout_sets) with RLS policies creates nested subqueries. The ARCHITECTURE.md flagged this as MEDIUM confidence and recommended benchmarking.
   - What's unclear: Whether the Supabase JS nested select approach will be fast enough, or whether `supabase.rpc()` is needed from the start.
   - Recommendation: Start with application-code aggregation (Pattern 2). Add console.time logging in the API route. If response time exceeds 200ms with 50+ workouts, create a PostgreSQL function via migration and use `supabase.rpc()`. This is an implementation-time decision, not a planning blocker.

2. **PR banner UX during active workout**
   - What we know: HIST-05 requires a "congratulatory PR banner mid-workout." The requirements say the banner should appear when a set "exceeds their stored personal record."
   - What's unclear: Whether it should be a toast (Sonner, auto-dismisses), an inline banner within the exercise card, or a full-screen celebration. No CONTEXT.md decisions constrain this.
   - Recommendation: Use a themed inline banner within the exercise card (similar to AbsenceCard pattern on dashboard) that appears for 5 seconds after a PR set is completed. This is less intrusive than a full-screen celebration and more visible than a toast. Keep it simple: "New PR! Bench Press: 100kg" with a trophy icon.

3. **Workout history page location**
   - What we know: The workouts page (`/workouts/page.tsx`) currently shows a StartWorkoutButton, WorkoutResumeBanner, routines section, and exercise library link. History list could go on this page or a dedicated `/workouts/history` page.
   - What's unclear: Best UX — integrated vs. dedicated page.
   - Recommendation: Add the history list directly to the workouts landing page (below routines section), since it's the primary read-only view users want. If it gets too long, paginate with "Show More" rather than a separate page. This follows Hevy's pattern where the main workouts tab shows the history feed.

4. **Workout detail page route**
   - What we know: ARCHITECTURE.md planned `/workouts/[id]/page.tsx`. This route doesn't exist yet (only `/workouts/active/page.tsx`).
   - What's unclear: Nothing — this is straightforward.
   - Recommendation: Create `/workouts/[id]/page.tsx` as a read-only detail view for completed workouts. Reuse `WorkoutWithExercises` data shape from `getWorkoutWithExercises()`.

## Sources

### Primary (HIGH confidence)
- `/recharts/recharts` via Context7 - LineChart API, ResponsiveContainer, XAxis/YAxis configuration, dual axis patterns
- `/shadcn-ui/ui` via Context7 - ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig type definition, installation pattern
- Codebase: `lib/db/types.ts` - ExerciseHistoryEntry, PersonalRecord types already defined
- Codebase: `lib/db/workouts.ts` - WorkoutsDB.getWorkouts(), getWorkoutWithExercises(), getPreviousSets() patterns
- Codebase: `lib/fitness/units.ts` - displayWeight(), toKg(), formatWeight() weight conversion utilities
- Codebase: `lib/fitness/exercise-fields.ts` - EXERCISE_FIELD_MAP for exercise-type-aware PR detection
- Codebase: `lib/hooks/use-active-workout.ts` - completeSet flow, SWR mutation pattern, dual-write pattern
- Codebase: `app/api/dashboard/route.ts` - Dashboard API pattern with Promise.all and graceful fallback
- Codebase: `components/dashboard/dashboard-content.tsx` - Dashboard widget pattern, SWR usage

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` - Exercise progression SQL query, component file structure, API routes, data flow
- `.planning/research/SUMMARY.md` - Phase 4 description, deliverables, verification criteria
- `.planning/research/PITFALLS.md` - Pitfall 14 (incremental PR computation), Pitfall 9 (slow chart queries)
- `.planning/research/STACK.md` - Recharts v2 vs v3 analysis, shadcn chart recommendation, database schema design

### Tertiary (LOW confidence)
- shadcn issue #7669 (Recharts v3 migration) — referenced in STACK.md research, not independently verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Recharts v2 via shadcn chart is well-documented, verified via Context7. SWR and Supabase patterns are established in the codebase.
- Architecture: HIGH - Patterns directly extend existing codebase conventions (WorkoutsDB methods, SWR hooks, dashboard API). Types already exist.
- Pitfalls: HIGH - Performance concern (RLS JOINs) has a clear mitigation path (app-code first, rpc() fallback). Other pitfalls are straightforward to avoid.

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days - stable domain, no fast-moving dependencies)
