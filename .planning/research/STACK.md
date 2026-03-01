# Technology Stack: Fitness Tracking Features

**Project:** BetterR.Me v4.0 -- Fitness Tracking Milestone
**Researched:** 2026-02-23
**Scope:** Stack ADDITIONS only. Existing stack (Next.js 16, React 19, Supabase, shadcn/ui, Tailwind CSS 3, SWR, react-hook-form, zod, date-fns, next-intl, next-themes, @dnd-kit/core v6, Vitest, Playwright) is validated and unchanged.

## Recommended Stack Additions

### 1. Charting: `recharts` v2.15.x via shadcn/ui Chart Component

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `recharts` | ^2.15.4 | SVG-based charting (line charts for progression, bar charts for volume) | shadcn/ui's built-in Chart component uses Recharts under the hood. Zero new abstraction layer -- compose with existing shadcn/ui patterns. React 19 compatible. |

**Install via shadcn CLI:**

```bash
pnpm dlx shadcn@latest add chart
```

This installs `recharts` as a dependency AND copies the `chart.tsx` component into `components/ui/`. The component provides `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, and `ChartLegendContent` -- all themed with the existing CSS custom property system (dark mode support automatic).

**Why Recharts v2 (not v3):**

- shadcn/ui's Chart component was built for Recharts v2. The v3 migration is still in progress (PR #8486 open on shadcn-ui/ui). Using v2 avoids breaking the shadcn Chart wrapper.
- Recharts v3 (3.7.0) adds heavy dependencies: `@reduxjs/toolkit`, `immer`, `react-redux`, `reselect`. The v2 dependency tree is significantly lighter (`lodash`, `react-is`, `react-smooth` -- no state management libraries).
- Recharts v2.15.4 supports React 19 (`peerDependencies: react ^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`).
- When shadcn officially ships v3 support, the upgrade path is straightforward -- shadcn does not wrap Recharts, so the standard migration guide applies.

**Confidence: HIGH** -- shadcn/ui official docs confirm Recharts as the charting foundation. Recharts v2.15.4 verified on npm with React 19 peer support. Multiple 2025-2026 ecosystem surveys rank Recharts as the top React charting choice for small-to-medium projects.

**Chart types needed for fitness tracking:**

| Chart | Recharts Component | Use Case |
|-------|--------------------|----------|
| Line chart | `<LineChart>` + `<Line>` | Per-exercise weight progression over time |
| Bar chart | `<BarChart>` + `<Bar>` | Weekly volume (total sets/reps) comparison |
| Area chart | `<AreaChart>` + `<Area>` | Training frequency over time |

All three chart types are supported by shadcn/ui's Chart examples and work with `ChartContainer` for responsive sizing and `ChartTooltip` for interactive data points.

### 2. Timer/Stopwatch: Custom Hooks (NO External Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom `useStopwatch` hook | N/A | Workout duration timer (count-up) | ~30 lines of code. `setInterval` + `useRef` + `useState`. No library overhead for two simple hooks. |
| Custom `useCountdown` hook | N/A | Rest timer between sets (count-down) | ~25 lines of code. Same pattern with decrement and `onComplete` callback. |

**Why NOT `react-timer-hook` (v4.0.5):**

The library exports `useTimer`, `useStopwatch`, and `useTime` hooks -- which is exactly what we need. However:

- The combined implementation is trivially small (~55 lines for both hooks). The library adds a dependency for negligible code savings.
- `react-timer-hook` declares `react: ">=16.8.0"` as peer dep -- technically supports React 19, but the broad range signals limited React 19 testing.
- Custom hooks are fully testable with Vitest's `vi.useFakeTimers()` without mocking an external module.
- The rest timer needs tight integration with the workout UI (show in notification bar, persist across set logging, play audio cue). A custom hook gives full control over these behaviors without fighting library abstractions.

**Implementation pattern:**

```typescript
// lib/hooks/use-stopwatch.ts
export function useStopwatch() {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setIsRunning(true);
    intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const reset = useCallback(() => {
    pause();
    setSeconds(0);
  }, [pause]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { seconds, isRunning, start, pause, reset,
    formatted: formatDuration(seconds) };
}

// lib/hooks/use-countdown.ts
export function useCountdown(initialSeconds: number, onComplete?: () => void) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  // ... similar pattern with decrement, auto-stop at 0, onComplete callback
}
```

**Confidence: HIGH** -- This is standard React hook implementation. No external verification needed. The pattern is well-documented across React docs, DigitalOcean tutorials, and freeCodeCamp guides.

### 3. Audio Feedback: Web Audio API (NO External Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Web Audio API (`AudioContext`) | Browser built-in | Rest timer completion beep | Generate a short tone programmatically. No audio files to bundle. ~10 lines of code. |

**Implementation:**

```typescript
// lib/audio/beep.ts
export function playBeep(frequency = 880, duration = 200) {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.3;
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration / 1000);
}
```

No library needed. The Web Audio API is supported in all modern browsers. For users who prefer silence, gate behind the rest timer settings.

### 4. Exercise Seed Data: Self-Curated JSON (NO External API/Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom JSON seed file | N/A | Preset exercise library (~80-120 exercises) | Curate from public domain datasets. Seed via Supabase migration. No runtime API dependency. |

**Approach: Curate from `free-exercise-db` (Unlicense/public domain)**

The [free-exercise-db](https://github.com/yuhonas/free-exercise-db) dataset has 800+ exercises with: `name`, `force` (push/pull), `level` (beginner/intermediate/advanced), `mechanic` (isolation/compound), `equipment`, `primaryMuscles[]`, `secondaryMuscles[]`, `instructions[]`, `category` (strength/stretching/etc.).

**Why NOT use the full 800+ dataset:**

- Most users need 80-120 common exercises. 800+ creates overwhelming search/browse UX.
- Many exercises in the dataset are obscure variations (e.g., "Alternate Incline Dumbbell Curl" vs "Dumbbell Curl").
- Curating allows mapping to our own taxonomy (exercise types, equipment enum, muscle group enum).
- Follows the existing pattern: categories table seeds 12 defaults from `lib/categories/seed.ts`.

**Curated seed structure:**

```typescript
// lib/exercises/seed.ts
export const SEED_EXERCISES: ExerciseSeed[] = [
  {
    name: "Barbell Bench Press",
    exercise_type: "weight_reps",
    equipment: "barbell",
    primary_muscles: ["chest"],
    secondary_muscles: ["triceps", "shoulders"],
    instructions_key: "exercises.bench_press.instructions", // i18n key
  },
  // ... ~80-120 exercises
];
```

**Exercise type taxonomy (modeled after Hevy):**

| Exercise Type | Fields Per Set | Example |
|---------------|----------------|---------|
| `weight_reps` | weight + reps | Bench Press, Squat |
| `bodyweight_reps` | reps only | Pull-ups, Push-ups |
| `weighted_bodyweight` | weight + reps | Weighted Dips |
| `duration` | duration (seconds) | Plank, Wall Sit |
| `duration_weight` | weight + duration | Weighted Plank |
| `distance_duration` | distance + duration | Running, Rowing |

Start with the 3 most common types: `weight_reps`, `bodyweight_reps`, `duration`. Add the rest in a follow-up if needed. This covers 90%+ of exercises.

**Muscle group enum (14 groups):**

`chest`, `back`, `shoulders`, `biceps`, `triceps`, `forearms`, `quadriceps`, `hamstrings`, `glutes`, `calves`, `abs`, `obliques`, `traps`, `lats`

**Equipment enum (9 types):**

`barbell`, `dumbbell`, `kettlebell`, `machine`, `cable`, `bodyweight`, `band`, `plate`, `other`

**Confidence: MEDIUM-HIGH** -- The public domain dataset is verified (Unlicense). The taxonomy is modeled after Hevy's production exercise library. The seed count (80-120) is a judgment call that may need adjustment based on user feedback. The lazy-seed pattern (`ExercisesDB.seedExercises()`) is proven in the existing `CategoriesDB.seedCategories()`.

### 5. No New shadcn/ui Components Needed (Except Chart)

The existing component library covers all fitness tracking UI needs:

| Existing Component | Fitness Tracking Use |
|--------------------|---------------------|
| `Card` | Workout session card, exercise card, set row |
| `Dialog` / `Sheet` | Exercise picker modal, routine template editor |
| `Button` | Start/pause/finish workout, add set, log set |
| `Input` | Weight, reps, duration inputs |
| `Select` | Exercise type filter, muscle group filter, equipment filter |
| `Badge` | Muscle group tags, PR indicator, exercise type badge |
| `Tabs` | Workout history tabs, chart time range selector |
| `Progress` | Rest timer progress bar (circular progress via custom CSS) |
| `Table` | Workout history list, set log table |
| `Accordion` | Collapsible exercise groups within a workout |
| `Skeleton` | Loading states for charts and workout data |
| `Slider` | Rest timer duration selector (30s - 5min) |
| `Switch` | Auto-start rest timer toggle |
| `Tooltip` | Chart data point tooltips (via ChartTooltip) |
| `DropdownMenu` | Exercise options (replace, delete, reorder) |
| `ScrollArea` | Long exercise lists in picker modal |
| `Separator` | Visual dividers between exercises in a workout |

**New shadcn/ui component to add:**

```bash
pnpm dlx shadcn@latest add chart
```

This is the ONLY new shadcn component. No `NumberInput` exists in shadcn/ui -- use `<Input type="number">` with Zod validation (existing pattern).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Charting | Recharts v2 (via shadcn Chart) | Chart.js + react-chartjs-2 | Canvas-based (harder to style with Tailwind/CSS vars), no shadcn integration, heavier bundle for simple line/bar charts |
| Charting | Recharts v2 (via shadcn Chart) | Recharts v3 | shadcn Chart component not yet v3-compatible (PR #8486 open). Adds Redux/Immer deps unnecessarily. Wait for official shadcn v3 support. |
| Charting | Recharts v2 (via shadcn Chart) | Tremor | Built on Recharts anyway. Adds an abstraction layer. Better for analytics dashboards, overkill for 2-3 progression charts. |
| Charting | Recharts v2 (via shadcn Chart) | Visx (Airbnb) | More control but much more boilerplate. No shadcn integration. Better for highly custom visualizations, not standard line/bar charts. |
| Timer | Custom hooks | `react-timer-hook` v4.0.5 | Adds a dependency for ~55 lines of trivial code. Less control over audio integration, notification persistence, and Vitest testing. |
| Timer | Custom hooks | `react-countdown-circle-timer` | Visual countdown circle is nice but the rest timer needs a progress bar (shadcn Progress), not a circle. Adds bundle weight for a visual we will not use. |
| Exercise DB | Curated JSON seed | `free-exercise-db` (full 800+) | Too many exercises for UX. Many obscure variations. Requires runtime data mapping. |
| Exercise DB | Curated JSON seed | ExerciseDB API (11k+ exercises) | External API dependency. Rate limits. Overkill for a personal app. Requires network calls for data that should be local. |
| Exercise DB | Curated JSON seed | wger API | Another external dependency. Dataset quality varies. Self-hosted option is heavy (Django app). |

## Installation

```bash
# New dependency: Recharts (via shadcn Chart component)
pnpm dlx shadcn@latest add chart

# That's it. No other new packages needed.
```

**Verify after install:**

```bash
# Confirm recharts was added to package.json
grep recharts package.json

# Confirm chart.tsx was created
ls components/ui/chart.tsx
```

No new dev dependencies are needed -- existing Vitest + Testing Library + Playwright cover all testing needs.

## What NOT to Add

| Do NOT Add | Why |
|------------|-----|
| `recharts` v3 | shadcn Chart component not v3-compatible yet. v3 adds Redux/Immer deps. Wait for official shadcn support. |
| `react-timer-hook` | Trivial to build custom. Two hooks, ~55 lines total. Better testability and integration control. |
| `react-countdown-circle-timer` | Rest timer uses a progress bar, not a circle. Adds bundle for unused visual. |
| `chart.js` / `react-chartjs-2` | Canvas-based. No shadcn integration. Harder to theme with CSS custom properties. |
| `framer-motion` | No animation needs beyond CSS transitions. Tailwind `transition-*` classes handle workout card animations. |
| `zustand` / `jotai` / `redux` | SWR handles server state. React `useState` handles workout session state. Active workout state is local to the session component -- no global store needed. |
| `react-beautiful-dnd` / `@hello-pangea/dnd` | No drag-and-drop needed for fitness features. Existing @dnd-kit is only for kanban. |
| External exercise API (ExerciseDB, wger) | Runtime API dependency for data that should be seeded locally. Network failures would break exercise browsing. |
| `howler.js` / audio library | Web Audio API handles the rest timer beep in ~10 lines. No library needed for a single tone. |
| `react-query` / `tanstack-query` | Already using SWR. No reason to add a second data fetching library. |

## Key Integration Points

### Recharts + shadcn/ui Theme System

The shadcn Chart component uses CSS custom properties for colors, automatically supporting dark mode:

```typescript
// Define chart config with theme-aware colors
const chartConfig = {
  weight: {
    label: t("workouts.weight"),
    color: "hsl(var(--chart-1))", // Uses existing CSS variable
  },
  volume: {
    label: t("workouts.volume"),
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;
```

The `--chart-1` through `--chart-5` CSS variables are already defined in the shadcn theme system. Add more if needed in `globals.css`.

### Workout Session State + SWR

Active workout sessions are ephemeral -- they exist only while the user is logging. Use React `useState`/`useReducer` for the in-progress workout. Persist to Supabase (via SWR `mutate`) only on "Finish Workout":

```typescript
// Pattern: local state during workout, SWR on save
const [workout, dispatch] = useReducer(workoutReducer, initialWorkoutState);
// User adds sets, changes weights, etc. -- all local state

const handleFinishWorkout = async () => {
  await fetch("/api/workouts", { method: "POST", body: JSON.stringify(workout) });
  mutate("/api/workouts"); // Revalidate workout history
  router.push("/workouts"); // Navigate to history
};
```

This avoids unnecessary API calls during active logging and matches the established SWR pattern.

### Exercise Seed Pattern (Following Categories Pattern)

The exercise library uses the same lazy-seed pattern as `CategoriesDB.seedCategories()`:

```typescript
// lib/db/exercises.ts
export class ExercisesDB {
  constructor(private supabase: SupabaseClient) {}

  async seedExercises(userId: string): Promise<Exercise[]> {
    const existing = await this.getUserExercises(userId);
    if (existing.length > 0) return existing;

    const { SEED_EXERCISES } = await import("@/lib/exercises/seed");
    // Insert preset exercises for this user
    // ...
  }
}
```

Each user gets their own copy of the exercise library (allows customization, deletion, reordering without affecting other users). This is the same per-user seeding approach used for categories.

### Weight Unit Preference (Extending ProfilePreferences)

Add `weight_unit: "kg" | "lbs"` to the existing `ProfilePreferences` interface:

```typescript
// lib/db/types.ts -- extend existing interface
export interface ProfilePreferences {
  date_format: string;
  week_start_day: number;
  theme: "system" | "light" | "dark";
  weight_unit: "kg" | "lbs"; // NEW
}

// lib/validations/preferences.ts -- extend existing schema
export const preferencesSchema = z.object({
  date_format: z.string().optional(),
  week_start_day: z.number().int().min(0).max(6).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  weight_unit: z.enum(["kg", "lbs"]).optional(), // NEW
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one preference must be provided",
});
```

No new API route needed -- the existing `PATCH /api/profile/preferences` handles this. Supabase stores preferences as JSONB, so no migration needed to add the field (it is schema-on-write). Default to `"kg"` when the field is absent.

### i18n for Exercises

Exercise names need translation in all 3 locales. Two approaches:

**Approach A (recommended): i18n keys in exercise seed, translated in locale files.**

```typescript
// Seed data uses i18n keys
{ name_key: "exercises.bench_press", ... }

// messages/en.json
{ "exercises": { "bench_press": "Barbell Bench Press" } }
// messages/zh.json
{ "exercises": { "bench_press": "杠铃卧推" } }
// messages/zh-TW.json
{ "exercises": { "bench_press": "槓鈴臥推" } }
```

**Approach B: Store translated names directly in the database.**

Approach A is recommended because it follows the existing i18n pattern and allows fallback to English if a translation is missing. Exercise instructions (longer text) should also use i18n keys.

## Database Additions (Supabase)

No new libraries -- use the existing Supabase client. New tables required:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `exercises` | Exercise library (per-user, seeded with defaults) | `id`, `user_id`, `name_key`, `exercise_type`, `equipment`, `primary_muscles[]`, `secondary_muscles[]`, `is_preset`, `sort_order` |
| `workouts` | Completed workout sessions | `id`, `user_id`, `name`, `started_at`, `finished_at`, `duration_seconds`, `notes` |
| `workout_exercises` | Exercises within a workout (ordered) | `id`, `workout_id`, `exercise_id`, `sort_order`, `notes`, `rest_timer_seconds` |
| `workout_sets` | Individual sets within a workout exercise | `id`, `workout_exercise_id`, `set_number`, `set_type` (normal/warmup/dropset), `weight`, `reps`, `duration_seconds`, `distance_meters`, `is_completed` |
| `routines` | Saved workout templates | `id`, `user_id`, `name`, `exercises[]` (JSONB array of exercise configs) |
| `personal_records` | Cached PRs per exercise | `id`, `user_id`, `exercise_id`, `pr_type` (max_weight/max_reps/max_volume), `value`, `achieved_at`, `workout_id` |

**Existing table changes:**

| Table | Change | Purpose |
|-------|--------|---------|
| `profiles.preferences` | Add `weight_unit: "kg" \| "lbs"` | No migration needed (JSONB) |

All new tables follow existing RLS patterns (user_id = auth.uid() policy). New DB classes follow the `SupabaseClient` constructor injection pattern.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Chart docs](https://ui.shadcn.com/docs/components/radix/chart) -- Official chart component, confirmed Recharts under the hood
- [Recharts v2.15.4 on npm](https://www.npmjs.com/package/recharts) -- Version, peer deps (React 19 supported), dependencies
- [Recharts v3.7.0 on npm](https://www.npmjs.com/package/recharts) -- Version, heavy deps (Redux, Immer) -- reason to avoid
- [shadcn/ui Recharts v3 issue #7669](https://github.com/shadcn-ui/ui/issues/7669) -- v3 migration in progress, PR #8486 open
- [react-timer-hook on npm](https://www.npmjs.com/package/react-timer-hook) -- v4.0.5, evaluated and rejected (trivial to build custom)

### Secondary (MEDIUM confidence)
- [free-exercise-db on GitHub](https://github.com/yuhonas/free-exercise-db) -- 800+ exercises, Unlicense, JSON format with primaryMuscles/secondaryMuscles/equipment fields
- [exercises.json on GitHub](https://github.com/wrkout/exercises.json) -- Alternative exercise dataset, Unlicense
- [Hevy custom exercises](https://www.hevyapp.com/features/custom-exercises/) -- Exercise type taxonomy: weight_reps, bodyweight_reps, duration, etc.
- [Hevy exercise library](https://www.hevyapp.com/features/exercise-library/) -- 400+ exercises, muscle group + equipment categorization
- [Best React chart libraries 2025 (LogRocket)](https://blog.logrocket.com/best-react-chart-libraries-2025/) -- Ecosystem comparison
- [React countdown timer implementation (DigitalOcean)](https://www.digitalocean.com/community/tutorials/react-countdown-timer-react-hooks) -- Custom hook pattern reference

### Tertiary (LOW confidence)
- [Workout tracking database schema (Dittofi)](https://www.dittofi.com/learn/how-to-design-a-data-model-for-a-workout-tracking-app) -- General schema patterns
- [Fitness tracking DB schema (GeeksforGeeks)](https://www.geeksforgeeks.org/dbms/how-to-design-a-database-for-health-and-fitness-tracking-applications/) -- General schema patterns

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
