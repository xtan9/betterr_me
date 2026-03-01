# Phase 19: Workout Logging Core Loop - Research

**Researched:** 2026-02-23
**Domain:** Active workout session management, set logging, rest timer, session persistence, previous workout reference
**Confidence:** HIGH

## Summary

Phase 19 implements the core workout logging loop: start a workout, add exercises from the library, log sets (weight+reps, reps-only, or duration depending on exercise type), use a rest timer between sets, and finish or discard -- with session state surviving browser refresh. This is the most complex phase in the v4.0 milestone because it combines real-time UI state management (elapsed timer, rest countdown), dual-write persistence (server + localStorage), optimistic SWR updates, and a multi-table data flow (workouts -> workout_exercises -> workout_sets).

The database schema is already in place from Phase 18 (6 fitness tables with RLS). The TypeScript types, weight conversion utilities (`lib/fitness/units.ts`), and exercise field configuration (`lib/fitness/exercise-fields.ts`) are also implemented. The exercise library UI with search/filter is complete. Phase 19 builds on all of this to deliver the workout logger, the workouts API layer, the active session hooks, and the rest timer.

One schema gap exists: the CONTEXT.md specifies "Discard: soft delete -- workout marked as discarded in DB" but the current schema has `CHECK (status IN ('in_progress', 'completed'))`. A migration is needed to add `'discarded'` to the status check constraint.

**Primary recommendation:** Build the WorkoutsDB class and API routes first, then the `useActiveWorkout` hook with localStorage dual-write, then the workout logger UI components. The rest timer is a self-contained feature that can be built in parallel with set logging.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Active workout screen layout**: Stacked cards -- each exercise is a separate card with its set rows inside, scrollable vertically. Sticky top bar always visible showing elapsed timer, workout title, and Finish button. "Add Exercise" button at bottom opens sheet/modal with exercise library search & filter.
- **Set logging interaction**: Row per set structure: [Set#] [Previous] [Weight] [Reps] [checkmark]. Previous workout values shown as dedicated read-only inline reference column (e.g., "60kg x 10"). Set type labeling via short-press on set number to open menu (warmup, normal, drop set, failure). "+ Add Set" button below last row; swipe-left or trash icon to remove a set.
- **Rest timer behavior**: Always auto-starts when any set is marked complete -- user can skip/dismiss. Per-exercise default rest times, configurable. +15s/-15s adjustment buttons during countdown. Timer end: audio beep via Web Audio API + visual flash, then auto-dismisses after a few seconds.
- **Session persistence & lifecycle**: Dual-write to server + localStorage for crash resilience. Resume banner on workouts page (not blocking modal) with Resume and Discard buttons. Finish flow: confirmation dialog with workout summary. Discard: soft delete (workout marked as discarded in DB, not permanently removed). Multiple start entry points: workouts page, exercise detail, dashboard quick-action.
- **Navigation behavior during active workout**: Claude's discretion based on existing app patterns.
- **Rest timer display placement**: Claude's discretion.
- **Exact card styling, spacing, typography**: Claude's discretion.
- **Error state handling and loading states**: Claude's discretion.
- **Exercise reordering within the workout**: Claude's discretion.

### Claude's Discretion
- Navigation mode during active workout (full-screen takeover vs keeping sidebar/bottom nav)
- Rest timer display placement (overlay banner, inline, or in header)
- Exact card styling, spacing, and typography
- Error state handling and loading states
- Exercise reordering within the workout (if any)

### Deferred Ideas (OUT OF SCOPE)
- None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WLOG-01 | User can start an empty workout session with elapsed time tracking | `POST /api/workouts` creates row with `status: 'in_progress'`, `started_at: NOW()`. Client-side elapsed timer uses `Date.now() - new Date(started_at).getTime()` pattern (timestamp-based, not tick-counting). Unique partial index enforces one active workout per user. |
| WLOG-02 | User can add exercises to an active workout from the exercise library picker | `POST /api/workouts/[id]/exercises` with `exercise_id`. Exercise picker reuses existing `ExerciseFilterBar` + `ExerciseCard` from Phase 18 in a Sheet/Dialog. SWR `mutate()` appends exercise optimistically. |
| WLOG-03 | User can log sets with weight and reps for weight-based exercises | `POST/PATCH /api/workouts/[id]/exercises/[weId]/sets` with `weight_kg`, `reps`. `EXERCISE_FIELD_MAP['weight_reps']` determines shown fields. Weight stored as kg, converted via `toKg()`/`displayWeight()` from `lib/fitness/units.ts`. |
| WLOG-04 | User can log sets with reps only for bodyweight exercises (optional added weight) | Same API as WLOG-03. `EXERCISE_FIELD_MAP['bodyweight_reps']` shows reps only. `weighted_bodyweight` shows weight + reps. Weight field hidden or shown based on exercise type config. |
| WLOG-05 | User can log sets with duration for timed exercises | Same API. `EXERCISE_FIELD_MAP['duration']` shows duration input. Duration stored as `duration_seconds` integer. |
| WLOG-06 | User can mark individual sets as complete with a checkbox | `PATCH .../sets/[setId]` with `{ is_completed: true }`. Triggers rest timer auto-start. Optimistic SWR update toggles checkbox immediately. |
| WLOG-07 | User can finish or discard an active workout session | Finish: `PATCH /api/workouts/[id]` with `{ status: 'completed' }`, server computes `completed_at` and `duration_seconds`. Discard: `PATCH` with `{ status: 'discarded' }` (requires schema migration to add `'discarded'` to status CHECK). Both clear localStorage. |
| WLOG-08 | Active workout persists across page refresh (dual-write to server + localStorage) | Every mutation writes to server (debounced PATCH) AND synchronous `localStorage.setItem()`. On mount, check localStorage first (instant), then fetch from `/api/workouts/active`. Resume banner if active workout found. |
| WLOG-09 | User sees previous workout values for same exercise auto-filled alongside set inputs | API enriches workout detail response with `previous_sets` per exercise. Query: most recent completed workout containing same `exercise_id`, return its sets. Displayed as read-only "60kg x 10" column in set row. |
| WLOG-10 | User can label sets as warmup, normal, drop set, or failure | Short-press on set number opens a popover/dropdown with set type options. `PATCH .../sets/[setId]` with `{ set_type: 'warmup' | 'normal' | 'drop' | 'failure' }`. Visual indicator on set row (color-coded badge or letter prefix). |
| WLOG-11 | User can add a title and freeform notes to a workout | `PATCH /api/workouts/[id]` with `{ title, notes }`. Title editable in sticky header. Notes in a collapsible section or modal. |
| WLOG-12 | User can add notes to individual exercises within a workout | `PATCH /api/workouts/[id]/exercises/[weId]` with `{ notes }`. Notes field below exercise name in the exercise card, collapsible. |
| REST-01 | Rest timer countdown auto-starts when a set is marked complete | `onSetComplete` callback triggers `startRestTimer(exercise.rest_timer_seconds)`. Timer uses absolute timestamps: `endTime = Date.now() + durationMs`. |
| REST-02 | User can configure default rest timer duration (default 90s) | `workout_exercises.rest_timer_seconds` column (default 90). Editable per-exercise in the workout via settings icon on exercise card. Stored server-side. |
| REST-03 | User can adjust rest timer with +15s/-15s buttons during countdown | Buttons modify `endTime` by +/-15000ms. Clamp minimum to 0. UI updates instantly from recalculated remaining time. |
| REST-04 | Rest timer plays an audio beep on completion via Web Audio API | `AudioContext.createOscillator()` plays a short tone (440Hz, 200ms). Requires user gesture to unlock AudioContext (set completion click satisfies this). Fallback: no sound if AudioContext unavailable. |
| REST-05 | Rest timer shows correct remaining time after switching browser tabs | Timestamp-based calculation: `remaining = Math.max(0, endTime - Date.now())`. `visibilitychange` event listener recalculates on tab focus. No dependency on `setInterval` tick count. |
</phase_requirements>

## Standard Stack

### Core

No new dependencies needed. All work uses the existing stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase (existing) | `@supabase/ssr` | Workout/set CRUD, nested joins | Already used for all existing tables |
| SWR (existing) | ^2.x | `useActiveWorkout()` hook, optimistic mutations | Already used for exercises, dashboard, habits |
| Zod (existing) | ^3.x | Workout/set API input validation | Already used in `lib/validations/` |
| next-intl (existing) | ^4.x | Workout logger i18n strings | Already used for all UI strings |
| lucide-react (existing) | 0.511.0 | Icons (Play, Pause, SkipForward, Timer, Plus, Trash2, Check) | Already installed |
| sonner (existing) | via shadcn | Toast notifications for workout actions | Already used in exercise library |
| Web Audio API (browser) | N/A | Rest timer completion beep | Browser-native, no dependency |
| localStorage (browser) | N/A | Active workout state persistence | Browser-native, synchronous writes |

### Supporting (New Files)

| File | Purpose | When to Use |
|------|---------|-------------|
| `lib/db/workouts.ts` (NEW) | WorkoutsDB class -- workout CRUD, active workout queries | All workout API routes |
| `lib/db/workout-exercises.ts` (NEW) | WorkoutExercisesDB class -- exercise + set CRUD within a workout | Workout exercise/set API routes |
| `lib/validations/workout.ts` (NEW) | Zod schemas for workout create/update/set operations | All workout API routes |
| `lib/hooks/use-active-workout.ts` (NEW) | SWR hook + localStorage dual-write for active session | Workout logger, resume banner |
| `lib/fitness/rest-timer.ts` (NEW) | `useRestTimer` hook -- timestamp-based countdown, audio beep | Rest timer component |
| `lib/fitness/workout-session.ts` (NEW) | localStorage read/write helpers for active workout state | Session persistence |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage for session persistence | IndexedDB | IndexedDB is async -- cannot reliably write in `beforeunload`. localStorage is synchronous and survives page refresh. IndexedDB is better for large data, but workout state is <50KB. |
| `useReducer` for active workout state | Zustand / Jotai | Extra dependency for state that is already well-served by `useReducer` + SWR `mutate()`. The existing codebase has no global state library. |
| Web Audio API for beep | `<audio>` element with MP3 | `<audio>` requires an asset file. Web Audio API generates tones programmatically with zero assets. Both work; Web Audio is lighter. |
| Debounced PATCH for server sync | Real-time Supabase channels | Supabase realtime adds complexity. The workout logger has a single writer (the user). Debounced PATCH is simpler and sufficient. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure (New Files)

```
lib/
  db/
    workouts.ts                    # WorkoutsDB class
    workout-exercises.ts           # WorkoutExercisesDB class (exercises + sets)
  fitness/
    rest-timer.ts                  # useRestTimer hook
    workout-session.ts             # localStorage session helpers
  hooks/
    use-active-workout.ts          # SWR hook for active workout
  validations/
    workout.ts                     # Zod schemas

app/
  api/
    workouts/
      route.ts                    # GET (list), POST (start)
      active/
        route.ts                  # GET active workout (with nested exercises/sets + previous values)
      [id]/
        route.ts                  # GET/PATCH/DELETE workout
        exercises/
          route.ts                # POST add exercise
          [weId]/
            route.ts              # PATCH/DELETE workout exercise
            sets/
              route.ts            # POST add set, PATCH update set, DELETE remove set
  workouts/
    page.tsx                      # Landing page (+ resume banner)
    active/
      page.tsx                    # Active workout logger

components/
  fitness/
    workout-logger/
      workout-logger.tsx          # Main active workout UI
      workout-header.tsx          # Sticky header: elapsed timer, title, finish button
      workout-exercise-card.tsx   # Exercise card with set rows
      workout-set-row.tsx         # Individual set input row
      workout-add-exercise.tsx    # Exercise picker sheet
      workout-rest-timer.tsx      # Countdown timer display
      workout-finish-dialog.tsx   # Finish confirmation dialog
      workout-discard-dialog.tsx  # Discard confirmation dialog
    workout-resume-banner.tsx     # "Active workout" resume banner
```

### Pattern 1: Dual-Write Session Persistence

**What:** Every workout mutation writes to both the server (via API) and localStorage synchronously.
**When to use:** All active workout state changes (add exercise, log set, update set, mark complete).
**Confidence:** HIGH -- matches Pitfall 2 prevention from prior research.

```typescript
// lib/fitness/workout-session.ts
const STORAGE_KEY = 'betterrme_active_workout';

export function saveWorkoutToStorage(workout: WorkoutWithExercises): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workout));
  } catch {
    // localStorage full or unavailable -- silent fail, server is source of truth
  }
}

export function loadWorkoutFromStorage(): WorkoutWithExercises | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearWorkoutStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silent fail
  }
}
```

### Pattern 2: Timestamp-Based Timer (Elapsed + Rest Countdown)

**What:** All timers use absolute timestamps, not tick-counting. Immune to browser tab throttling.
**When to use:** Workout elapsed timer and rest timer countdown.
**Confidence:** HIGH -- verified against Pitfall 6 from prior research.

```typescript
// Elapsed timer (counts up from started_at)
function useStopwatch(startedAt: string) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick(); // immediate
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

// Rest timer (counts down from endTime)
function useRestTimer() {
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const start = useCallback((durationSeconds: number) => {
    setEndTime(Date.now() + durationSeconds * 1000);
  }, []);

  useEffect(() => {
    if (endTime === null) return;
    const tick = () => {
      const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) { playBeep(); setEndTime(null); }
    };
    tick();
    const id = setInterval(tick, 200); // 200ms for smooth display
    return () => clearInterval(id);
  }, [endTime]);

  const adjust = useCallback((deltaSeconds: number) => {
    setEndTime(prev => prev ? Math.max(Date.now(), prev + deltaSeconds * 1000) : null);
  }, []);

  const skip = useCallback(() => setEndTime(null), []);

  return { remaining, isActive: endTime !== null, start, adjust, skip };
}
```

### Pattern 3: Coarse-Grained SWR Key for Active Workout

**What:** One SWR key (`/api/workouts/active`) returns the full workout with nested exercises, sets, and previous values. No separate SWR keys for child entities.
**When to use:** Active workout logger. Mutations use optimistic updates via `mutate()`.
**Confidence:** HIGH -- matches Pitfall 4 prevention.

```typescript
// lib/hooks/use-active-workout.ts
export function useActiveWorkout() {
  const { data, error, isLoading, mutate } = useSWR<{
    workout: WorkoutWithExercises | null;
  }>("/api/workouts/active", fetcher, {
    revalidateOnFocus: false,   // Don't refetch on tab focus (client is source of truth)
    dedupingInterval: 60000,    // 1 min dedup
  });

  return {
    workout: data?.workout ?? null,
    error,
    isLoading,
    mutate,
  };
}
```

### Pattern 4: Supabase Nested Select for Workout Detail

**What:** Single query returns workout with exercises and sets using Supabase's foreign key join syntax.
**When to use:** `GET /api/workouts/active` and `GET /api/workouts/[id]`.
**Confidence:** HIGH -- verified with Context7 Supabase docs.

```typescript
// In WorkoutsDB class
async getWorkoutWithExercises(workoutId: string): Promise<WorkoutWithExercises | null> {
  const { data, error } = await this.supabase
    .from("workouts")
    .select(`
      *,
      workout_exercises (
        *,
        exercise:exercises (*),
        sets:workout_sets (*)
      )
    `)
    .eq("id", workoutId)
    .order("sort_order", { referencedTable: "workout_exercises", ascending: true })
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  // Rename nested fields to match TypeScript types
  return {
    ...data,
    exercises: data.workout_exercises.map((we: any) => ({
      ...we,
      exercise: we.exercise,
      sets: we.sets.sort((a: any, b: any) => a.set_number - b.set_number),
    })),
  };
}
```

### Pattern 5: Web Audio API Beep

**What:** Generate a short audio tone programmatically when rest timer reaches zero.
**When to use:** REST-04 implementation.
**Confidence:** HIGH -- Web Audio API is well-supported across modern browsers.

```typescript
// lib/fitness/rest-timer.ts
let audioContext: AudioContext | null = null;

export function playBeep(frequency = 440, durationMs = 200): void {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    // Resume if suspended (required after user gesture)
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3; // Not too loud

    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationMs / 1000);
  } catch {
    // Audio not available -- silent fail
  }
}
```

### Pattern 6: Previous Workout Values Query

**What:** For each exercise in the active workout, find the most recent completed workout containing the same exercise and return its sets.
**When to use:** WLOG-09 implementation, enriching the active workout API response.
**Confidence:** MEDIUM -- requires testing for performance with multiple exercises.

```typescript
// In WorkoutsDB or WorkoutExercisesDB
async getPreviousSets(userId: string, exerciseId: string): Promise<WorkoutSet[]> {
  // Find the most recent completed workout containing this exercise
  const { data, error } = await this.supabase
    .from("workout_exercises")
    .select(`
      workout_id,
      sets:workout_sets (*),
      workout:workouts!inner (started_at, status)
    `)
    .eq("exercise_id", exerciseId)
    .eq("workout.status", "completed")
    // Supabase doesn't support ordering by referenced table in this context,
    // so fetch recent ones and sort in app code
    .limit(5);

  if (error || !data || data.length === 0) return [];

  // Sort by workout started_at descending, take the most recent
  const sorted = data.sort((a: any, b: any) =>
    new Date(b.workout.started_at).getTime() - new Date(a.workout.started_at).getTime()
  );

  return sorted[0].sets.sort((a: any, b: any) => a.set_number - b.set_number);
}
```

### Anti-Patterns to Avoid

- **Tick-counting timers:** Never use `remaining--` in setInterval. Always compute from `Date.now() - startTime` or `endTime - Date.now()`.
- **SWR key per set/exercise:** Do NOT create separate SWR keys for each workout exercise or set. One key for the whole active workout.
- **Server-only persistence:** Do NOT rely solely on API calls for active workout state. localStorage provides instant recovery on refresh. Server is source of truth; localStorage is the fast path.
- **Blocking modals for resume:** Use a non-blocking banner per CONTEXT.md, not a modal that prevents page interaction.
- **Polling active workout:** Do NOT use `refreshInterval` on `useActiveWorkout`. The client is the sole writer during an active session. Use manual `mutate()` after each mutation.
- **AudioContext in module scope:** Do NOT create AudioContext at module load time. It must be created after a user gesture (click). Lazy-initialize on first beep.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio notification | MP3 file + `<audio>` element | Web Audio API `OscillatorNode` | Zero assets, programmatic tone, no network request |
| Weight conversion | Manual math in components | `lib/fitness/units.ts` (existing) | Already built with proper 2-decimal rounding |
| Exercise field visibility | `if/else` chains per exercise type | `EXERCISE_FIELD_MAP` (existing) | Already maps exercise type to input field config |
| Form validation | Manual if-checks in API | Zod schemas via `validateRequestBody()` | Existing pattern, consistent error format |
| Toast notifications | Custom notification system | `sonner` toast (existing) | Already integrated via shadcn |
| Bottom sheet for exercise picker | Custom modal | shadcn Sheet component | Already available in `components/ui/sheet.tsx` |

**Key insight:** Phase 18 already built the foundational utilities (`units.ts`, `exercise-fields.ts`, `ExercisesDB`, exercise library UI components). Phase 19 should reuse these extensively rather than duplicating logic.

## Common Pitfalls

### Pitfall 1: Schema Gap -- Missing 'discarded' Status

**What goes wrong:** The CONTEXT.md specifies "Discard: soft delete -- workout marked as discarded in DB" but the current schema has `CHECK (status IN ('in_progress', 'completed'))`. Attempting to set `status = 'discarded'` will fail with a constraint violation.
**Why it happens:** The Phase 18 schema was designed before the discard decision was finalized.
**How to avoid:** Create a migration that alters the CHECK constraint to add `'discarded'`. This MUST happen before any workout API code that handles discards.
**Warning signs:** Discard button in UI throws 500 error from API.

```sql
-- Migration: alter workouts status check
ALTER TABLE workouts DROP CONSTRAINT workouts_status_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_status_check
  CHECK (status IN ('in_progress', 'completed', 'discarded'));
```

Also update `WorkoutStatus` type in `lib/db/types.ts`:
```typescript
export type WorkoutStatus = "in_progress" | "completed" | "discarded";
```

### Pitfall 2: AudioContext Blocked Without User Gesture

**What goes wrong:** Creating `new AudioContext()` before any user interaction causes browsers to block it with "The AudioContext was not allowed to start" warning. The beep never plays.
**Why it happens:** Modern browsers require a user gesture (click, tap) before allowing audio playback.
**How to avoid:** Lazy-create AudioContext on the first set completion click (which IS a user gesture). Store the context for reuse. Call `audioContext.resume()` if it enters suspended state.
**Warning signs:** Console warning about AudioContext, rest timer completes silently.

### Pitfall 3: localStorage Quota Exceeded

**What goes wrong:** Writing the full workout state to localStorage on every mutation. If the workout has many exercises with many sets, the JSON payload grows. Combined with other localStorage usage, it could exceed the ~5MB browser limit.
**Why it happens:** Aggressive dual-write strategy without size awareness.
**How to avoid:** A typical workout has 5-10 exercises with 3-5 sets each -- roughly 5-20KB of JSON. This is well within limits. But add a try-catch around `localStorage.setItem()` and fail silently. The server is the source of truth; localStorage is a convenience cache.
**Warning signs:** Console error about localStorage quota.

### Pitfall 4: Race Conditions Between Optimistic Updates and Server Responses

**What goes wrong:** User rapidly marks sets complete. Optimistic update 1 modifies the SWR cache. Before the server responds, optimistic update 2 modifies the same cache. Server response from update 1 arrives and reverts update 2's optimistic change.
**Why it happens:** SWR's `mutate()` with `optimisticData` can conflict when mutations overlap.
**How to avoid:** Use `mutate(key, updater, { revalidate: false })` for set completions. Do NOT revalidate after each individual set change. Batch revalidation on workout finish. The client state is authoritative during an active session.
**Warning signs:** Set checkbox flickers between checked and unchecked.

### Pitfall 5: Unique Index Conflict on Start

**What goes wrong:** User clicks "Start Workout" while they already have an active workout. The `idx_workouts_active` unique partial index causes a constraint violation (PostgreSQL error 23505).
**Why it happens:** The partial unique index `ON workouts (user_id) WHERE status = 'in_progress'` correctly prevents multiple active workouts. But the API must handle this gracefully.
**How to avoid:** In `POST /api/workouts`, catch error code `23505` and return 409 Conflict with a message like "You already have an active workout." The UI should check for active workouts before showing the start button and show the resume banner instead.
**Warning signs:** Unhandled 500 error when starting a workout.

### Pitfall 6: Profile Weight Unit Not Available in Workout Logger

**What goes wrong:** The workout set input needs to display weight in the user's preferred unit (kg or lbs), but the weight unit preference lives in the profile API (`/api/profile`), not in the workout data.
**Why it happens:** The workout and profile are separate data domains. The workout logger needs to read from both.
**How to avoid:** Fetch the profile preferences alongside the active workout. Either pass `weight_unit` as a prop from the page layout (which already has access to profile data via server component), or use a dedicated `useProfile()` hook. The existing `SettingsContent` component already fetches profile via SWR at `/api/profile` -- reuse this pattern.
**Warning signs:** Weight displays default to kg even when user preference is lbs.

## Code Examples

### Workout API Route: POST /api/workouts (Start a Workout)

```typescript
// app/api/workouts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsDB } from "@/lib/db/workouts";
import { validateRequestBody } from "@/lib/validations/api";
import { workoutCreateSchema } from "@/lib/validations/workout";
import { log } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const validation = validateRequestBody(body, workoutCreateSchema);
    if (!validation.success) return validation.response;

    const workoutsDB = new WorkoutsDB(supabase);
    const workout = await workoutsDB.startWorkout(user.id, validation.data);

    return NextResponse.json({ workout }, { status: 201 });
  } catch (error: unknown) {
    log.error("POST /api/workouts error", error);

    // Handle unique constraint violation (active workout exists)
    const code = error && typeof error === "object" && "code" in error
      ? (error as { code: string }).code : undefined;
    if (code === "23505") {
      return NextResponse.json(
        { error: "You already have an active workout" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to start workout" }, { status: 500 });
  }
}
```

### Workout Finish Flow

```typescript
// In PATCH /api/workouts/[id] handler
if (updates.status === "completed" && currentWorkout.status === "in_progress") {
  const completedAt = new Date().toISOString();
  const durationSeconds = Math.floor(
    (new Date(completedAt).getTime() - new Date(currentWorkout.started_at).getTime()) / 1000
  );
  finalUpdates = {
    ...updates,
    completed_at: completedAt,
    duration_seconds: durationSeconds,
    status: "completed",
  };
}
```

### Zod Validation Schemas for Workout

```typescript
// lib/validations/workout.ts
import { z } from "zod";

export const workoutCreateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  routine_id: z.string().uuid().nullable().optional(),
});

export const workoutUpdateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["in_progress", "completed", "discarded"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

export const addExerciseToWorkoutSchema = z.object({
  exercise_id: z.string().uuid(),
  rest_timer_seconds: z.number().int().min(0).max(600).optional(),
});

export const workoutSetCreateSchema = z.object({
  set_type: z.enum(["warmup", "normal", "drop", "failure"]).default("normal"),
  weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  reps: z.number().int().min(0).max(9999).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  distance_meters: z.number().min(0).max(999999.99).nullable().optional(),
  is_completed: z.boolean().default(false),
});

export const workoutSetUpdateSchema = z.object({
  set_type: z.enum(["warmup", "normal", "drop", "failure"]).optional(),
  weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  reps: z.number().int().min(0).max(9999).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  distance_meters: z.number().min(0).max(999999.99).nullable().optional(),
  is_completed: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});
```

### Set Row Component Structure

```typescript
// components/fitness/workout-logger/workout-set-row.tsx
interface WorkoutSetRowProps {
  set: WorkoutSet;
  setNumber: number;
  exerciseType: ExerciseType;
  previousSet: WorkoutSet | null;  // from WLOG-09
  weightUnit: WeightUnit;
  onUpdate: (setId: string, updates: Partial<WorkoutSet>) => void;
  onComplete: (setId: string) => void;
  onDelete: (setId: string) => void;
  onSetTypeChange: (setId: string, setType: SetType) => void;
}

// Layout: [SetType Badge] [Previous] [Weight Input?] [Reps/Duration Input?] [Complete Checkbox]
// Weight/Reps/Duration shown based on EXERCISE_FIELD_MAP[exerciseType]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setInterval` tick-counting for timers | Timestamp-based `Date.now() - start` | Always (browser throttling) | Timer accuracy in background tabs |
| `<audio src="beep.mp3">` | Web Audio API `OscillatorNode` | 2020+ (better browser support) | Zero-asset audio, no network request |
| Server-only workout state | Dual-write (server + localStorage) | Industry standard for gym apps | Crash resilience, instant recovery |
| Fine-grained SWR keys per entity | Coarse-grained key with nested data | SWR v2 (populateCache, optimistic) | Fewer cache invalidation bugs |

## Open Questions

1. **API route nesting depth for sets**
   - What we know: The set CRUD operations need workout_id, workout_exercise_id, and set_id. The architecture doc suggests `/api/workouts/[id]/exercises/[weId]/sets` (3 levels of nesting).
   - What's unclear: Next.js deeply nested dynamic routes work but can be verbose. Alternative: flatten to `/api/workout-sets` with workout_exercise_id in the body.
   - Recommendation: Use the nested route structure as planned in the architecture doc. It follows RESTful conventions and the RLS inheritance chain. Keep set ID in the body for PATCH/DELETE operations within the sets route, or add a `[setId]` segment. The existing codebase already handles 3-level nesting (e.g., `/api/habits/[id]/logs`).

2. **Exercise reordering during active workout**
   - What we know: The `sort_order` column on `workout_exercises` is `DOUBLE PRECISION`, supporting fractional ordering (insert between existing items).
   - What's unclear: Whether to build drag-to-reorder UI in Phase 19 or defer.
   - Recommendation: Defer drag-to-reorder to a later phase. For Phase 19, exercises are ordered by insertion order (ascending `sort_order`). Simpler scope, can be added later.

3. **Weight unit access in the workout logger**
   - What we know: Weight unit is stored in `profiles.preferences.weight_unit`. The workout logger needs it for display and input conversion.
   - What's unclear: Best way to propagate it -- prop drilling from server component, or client-side fetch.
   - Recommendation: Create a small `useWeightUnit()` hook that reads from the existing `/api/profile` SWR cache (or fetches it). Share it across workout components. Alternatively, the workouts page server component can read the profile and pass `weightUnit` as a prop to the client workout logger.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supabase/migrations/20260224000001_create_fitness_tables.sql` -- complete schema
- Existing codebase: `lib/db/types.ts` -- all TypeScript types including WorkoutWithExercises
- Existing codebase: `lib/fitness/units.ts` -- weight conversion utilities
- Existing codebase: `lib/fitness/exercise-fields.ts` -- exercise type to field mapping
- Existing codebase: `lib/db/exercises.ts` -- DB class pattern
- Existing codebase: `app/api/exercises/route.ts` -- API route pattern
- Existing codebase: `lib/hooks/use-exercises.ts` -- SWR hook pattern
- `.planning/research/ARCHITECTURE.md` -- full API design, data flow, component structure
- `.planning/research/PITFALLS.md` -- session persistence (P2), timer drift (P6), SWR cache (P4)
- Context7 `/vercel/swr-site` -- SWR mutation and optimistic update patterns
- Context7 `/supabase/supabase-js` -- nested select with foreign key joins

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` -- phased build order and verification criteria
- Web Audio API MDN docs (from training data) -- OscillatorNode, AudioContext lifecycle

### Tertiary (LOW confidence)
- Previous workout values query performance with multiple exercises -- needs testing with real data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns exist in codebase
- Architecture: HIGH -- schema exists, types exist, API/component patterns are established
- Pitfalls: HIGH -- prior research catalogued all relevant pitfalls with mitigations
- Schema gap (discarded status): HIGH -- clearly identified, migration path known
- Previous values query: MEDIUM -- query approach is sound but performance untested

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain, no external dependency changes expected)
