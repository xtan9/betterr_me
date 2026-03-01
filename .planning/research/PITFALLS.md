# Domain Pitfalls

**Domain:** Adding Hevy-inspired workout/fitness tracking to an existing habit/task management app (BetterR.Me v4.0)
**Researched:** 2026-02-23
**Confidence:** HIGH (verified against existing codebase patterns, Hevy API reference, and community post-mortems)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or major user-facing failures.

### Pitfall 1: Flat Set Schema That Cannot Represent Multiple Exercise Types

**What goes wrong:**
Developers design a single `sets` table with columns for `weight_kg`, `reps`, `duration_seconds`, and `distance_meters` -- then store `NULL` in whichever columns don't apply to the current exercise type. A bench press set stores weight+reps but NULLs for duration and distance. A plank stores duration but NULLs for weight and reps. A treadmill stores duration+distance but NULLs for weight and reps.

This seems fine at first. Then you add features:
- Volume calculation (`weight * reps * sets`) breaks when `weight_kg` is NULL for bodyweight exercises
- Progression charts need to know which field to plot, requiring per-exercise-type logic everywhere
- Validation becomes exercise-type-dependent (reps must be > 0 for weight exercises, duration must be > 0 for timed exercises)
- UI forms must show/hide fields dynamically, with the schema providing no guidance on which fields are valid

**Why it happens:**
The "one table to rule them all" approach avoids the complexity of discriminated union types in the database. It looks simpler on day one.

**Consequences:**
- Every feature that touches sets needs a switch statement on exercise type
- NULLable columns cannot be validated at the DB level (no CHECK constraint can say "weight_kg is required when exercise type is weight-based")
- Aggregate queries become littered with COALESCE and CASE WHEN
- Personal records logic must be duplicated per exercise type

**Prevention:**
Follow Hevy's model: store ALL possible fields on each set row (weight_kg, reps, duration_seconds, distance_meters, rpe) and let them be nullable. But critically, define an `exercise_type` enum on the exercise template that determines which fields are meaningful. The exercise template declares its type (e.g., `weight_reps`, `bodyweight_reps`, `duration`, `distance_duration`), and the application layer uses this to:
1. Render the correct input fields in the UI
2. Validate that the required fields for that type are non-null
3. Choose the correct progression metric for charts
4. Calculate volume appropriately

Define the exercise type enum in the Zod validation schema, not just in the database. The existing codebase already uses discriminated unions for `HabitFrequency` -- apply the same pattern to `ExerciseType`.

**Detection:**
- Progression chart code has `if (exercise.type === 'weight') ... else if (exercise.type === 'duration') ...` scattered across multiple files instead of centralized
- Volume calculation produces NaN or 0 for bodyweight exercises
- Form shows weight input for plank exercises

**Phase to address:**
Phase 1 (Data Model / Schema Design). The exercise type enum and set field semantics must be locked down before any UI is built. Define Zod schemas with discriminated unions first; derive the DB schema from those.

---

### Pitfall 2: In-Progress Workout State Lost on Browser Refresh/Close

**What goes wrong:**
A user is mid-workout (10 minutes in, 4 exercises logged, 12 sets recorded). They accidentally refresh the page, their phone switches apps, or the browser tab crashes. All in-progress data is gone. This is the single most rage-inducing failure in a workout tracking app because the user is physically in a gym with sweaty hands, possibly frustrated, and cannot reconstruct which sets they did.

**Why it happens:**
The natural approach with SWR/React state is to keep workout data in component state during the session and POST to the API only when the user taps "Finish Workout." This means 20-60 minutes of data exists only in volatile browser memory.

**Consequences:**
- Users lose partially completed workouts (the most painful UX failure in this domain)
- Users stop trusting the app and switch to pen-and-paper or a native app
- Support complaints spike for an issue that is architecturally difficult to fix after the fact

**Prevention:**
Implement a **dual-write strategy** from day one:

1. **Server-side**: Create the workout row in the database when the user starts a workout (status: `in_progress`). Every set addition/modification triggers a debounced PATCH to the server (300ms debounce). The workout has `started_at` but no `completed_at` until the user finishes.

2. **Client-side**: Mirror the current workout state to `localStorage` on every mutation (localStorage.setItem is synchronous and survives page refreshes). Use a `beforeunload` event listener as a last-resort save. Do NOT use IndexedDB for this -- IndexedDB is async and browsers do not guarantee it completes during page teardown.

3. **Recovery**: On mount, check for an `in_progress` workout in both localStorage and the API. If found, restore it and show a "Resume workout?" banner. The server is the source of truth; localStorage is the fast recovery path.

**Important:** Do NOT use IndexedDB in the `beforeunload` handler. IndexedDB is asynchronous and Chrome/Firefox may tear down the page before the write completes. localStorage is synchronous and reliable in this context.

**Detection:**
- No `beforeunload` handler in the workout logging component
- Workout data only exists in React state (useState/useReducer) with no persistence layer
- No "in_progress" status on the workouts table
- Refreshing the page during a workout loses all data

**Phase to address:**
Phase 2 (Workout Logging / Real-Time Session). This must be built into the workout logging flow from the start, not retrofitted. The `WorkoutSession` component should persist state on every mutation.

---

### Pitfall 3: Weight Unit Conversion Loses Precision and Corrupts Historical Data

**What goes wrong:**
User logs 135 lbs for bench press. System converts to kg (61.2349...) and stores 61.23 kg. User switches display back to lbs. System shows 135.01 lbs (or 134.99 lbs depending on rounding). Over many conversions, weights drift. Worse: if the user changes their unit preference and the system retroactively converts historical data, previously clean numbers become ugly decimals.

**Why it happens:**
The 1 lb = 0.453592 kg conversion is irrational -- no finite decimal representation exists. Rounding on store, then rounding again on display, compounds errors. Some implementations convert ALL historical data when the user switches preferences, destroying the original logged values.

**Consequences:**
- Personal records show wrong weights after unit switching
- Progression charts have "phantom" weight changes from rounding
- Users who log in lbs see 135.01 or 134.99 instead of clean 135
- If historical data is retroactively converted, the original values are permanently lost

**Prevention:**
Store weight in the **unit the user logged it in**, plus a `weight_unit` column on each set:

```sql
weight_value NUMERIC(7,2),  -- stores what user typed (e.g., 135.00)
weight_unit TEXT NOT NULL DEFAULT 'kg'  -- 'kg' or 'lbs'
```

Display in the user's current preference unit, converting on read with proper rounding (round to nearest 0.5 for lbs, nearest 0.25 for kg). Never modify the stored value. The user preference (`kg` or `lbs` in profile preferences) controls display only.

This matches how Hevy handles it: the API exposes both `weight_kg` and `weight_lb` as computed fields, but the source of truth is a single stored value.

The existing `ProfilePreferences` type in `lib/db/types.ts` should be extended with `weight_unit: 'kg' | 'lbs'`.

**Detection:**
- Stored weight values have more than 2 decimal places
- Switching unit preference changes historical workout display numbers by small amounts
- Personal record for bench press shows 61.23 kg instead of a clean 135 lbs
- No `weight_unit` column on the sets table

**Phase to address:**
Phase 1 (Data Model / Schema Design). The unit storage strategy must be decided before any set data is written. Retrofitting after users have logged workouts in the wrong format requires a data migration.

---

### Pitfall 4: SWR Cache Explosion from Fine-Grained Workout Data

**What goes wrong:**
The existing codebase uses SWR with URL-based cache keys (e.g., `/api/dashboard?date=2026-02-23`, `/api/habits`). Workout tracking introduces deeply nested data: a single workout contains multiple exercises, each containing multiple sets. If each entity gets its own SWR key, the cache grows explosively:

- `/api/workouts` (list)
- `/api/workouts/123` (detail)
- `/api/workouts/123/exercises` (exercises within workout)
- `/api/exercises/456/sets` (sets within exercise)
- `/api/exercises/bench-press/history` (progression data)
- `/api/exercises/bench-press/personal-records` (PRs)

Mutations cascade: adding a set must invalidate the workout detail, the workout list (volume changed), the exercise history, and possibly the personal records. Forgetting one invalidation = stale data visible to the user.

**Why it happens:**
The habit/task domain has flat data structures (one habit = one toggle per day). Workout data is hierarchical (workout -> exercises -> sets) and cross-referenced (exercise history spans multiple workouts). The SWR cache patterns that work for flat entities break down for nested ones.

**Consequences:**
- Stale data after mutations (user adds a set but the workout volume doesn't update)
- Over-fetching due to aggressive revalidation (every set change refetches the entire workout list)
- Memory bloat from caching every permutation of exercise history queries
- Race conditions between optimistic updates on nested entities

**Prevention:**
Use a **coarse-grained cache strategy** for workout data:

1. **One SWR key per workout session**: `/api/workouts/123` returns the FULL workout including all exercises and sets (joined query). No separate SWR keys for exercises or sets within a workout.

2. **Optimistic local state during active workout**: While a workout is in progress, manage exercises/sets in `useReducer` state (persisted to localStorage per Pitfall 2). Only use SWR for the workout list and historical data.

3. **Targeted invalidation helper**: Create a `revalidateWorkoutData()` function (similar to the existing `revalidateSidebarCounts()`) that invalidates the specific keys affected: workout list, exercise history for affected exercises, and personal records.

4. **Keep date-based keys for history**: Exercise progression data should use SWR keys like `/api/exercises/bench-press/history?period=3m` with `keepPreviousData: true` (matching the existing pattern).

**Detection:**
- Adding a set triggers 5+ network requests
- Workout volume in the list view doesn't match the detail view after editing
- Memory profiler shows thousands of SWR cache entries after a few weeks of use
- `mutate()` calls scattered across multiple components without a centralized invalidation strategy

**Phase to address:**
Phase 2 (Workout Logging) for active session state management. Phase 4 (Progression Charts) for historical data caching. Define the API response shapes and SWR key strategy in Phase 1.

---

### Pitfall 5: Overengineering the Exercise Library as a Separate Searchable Service

**What goes wrong:**
Developers treat the exercise library like a product catalog and build full-text search with PostgreSQL `tsvector`, autocomplete with debounced API calls, and virtualized infinite-scroll lists. For 400-600 exercises, this is massive overengineering. The entire Hevy library is ~400 exercises. With muscle group tags, that's maybe 200KB of JSON. It fits in a single SWR cache entry and can be filtered client-side with `Array.filter()` faster than any API roundtrip.

**Why it happens:**
Engineers extrapolate from e-commerce search patterns (millions of products) to fitness domains (hundreds of exercises). They also conflate the exercise LIBRARY (static reference data) with exercise HISTORY (time-series data that does need server queries).

**Consequences:**
- Unnecessary API complexity (search endpoint, pagination, filtering)
- Latency on exercise selection during workout logging (network roundtrip vs. instant client filter)
- Over-indexing the exercises table (tsvector column, GIN index) for a dataset that fits in browser memory
- Complex autocomplete component when a simple filtered list suffices

**Prevention:**
Load the entire exercise library (preset + user custom) in a single API call. Cache it in SWR with a long `dedupingInterval` (10+ minutes). Filter client-side by name, muscle group, and equipment. Only fetch from the server on initial load and after the user creates a custom exercise.

The exercise library endpoint should be: `GET /api/exercises` returning all exercises (preset + user's custom). No pagination, no search parameters. The client does all filtering.

Reserve server-side queries for exercise HISTORY (which exercises were performed on which dates with what weights) -- that data grows over time and genuinely needs server-side aggregation.

**Detection:**
- Exercise search makes API calls on every keystroke
- Exercise list endpoint has pagination parameters
- PostgreSQL migration includes `tsvector` or `GIN` index on exercise names
- Exercise selection during workout has noticeable latency

**Phase to address:**
Phase 1 (Data Model + Exercise Library). Design the exercise library as a static reference dataset, not a searchable service.

---

## Moderate Pitfalls

Mistakes that cause significant rework or degraded UX but don't require full rewrites.

### Pitfall 6: Rest Timer Stops or Drifts in Background Tabs

**What goes wrong:**
The rest timer between sets uses `setInterval` to count down. User switches to a different browser tab or locks their phone screen. Chrome throttles `setInterval` in background tabs to once per minute maximum. The timer UI freezes. When the user returns, it shows 58 seconds remaining even though 90 seconds have actually passed.

**Why it happens:**
Browser vendors throttle timers in background tabs to save battery and CPU. `setInterval` with a 1-second callback gets throttled to 1-minute intervals (or paused entirely) in inactive tabs. `requestAnimationFrame` is completely paused in background tabs.

**Consequences:**
- Timer shows wrong remaining time when user returns to the tab
- Timer notification (if any) fires at the wrong time
- User loses trust in the timer and uses their phone's native timer instead
- Audio notification fires late or not at all

**Prevention:**
Use **timestamp-based elapsed time**, not tick-counting:

```typescript
const startTime = Date.now();
const durationMs = restSeconds * 1000;

// On each tick (setInterval or requestAnimationFrame):
const elapsed = Date.now() - startTime;
const remaining = Math.max(0, durationMs - elapsed);
```

When the tab regains focus (via `visibilitychange` event), immediately recalculate remaining time from the stored `startTime`. This handles background throttling because the elapsed time calculation doesn't depend on how many ticks fired.

For audio notifications, use the Web Audio API or `Notification` API which can fire even when the tab is backgrounded (with user permission). Consider a Web Worker for the countdown if sub-second accuracy matters.

**Detection:**
- Timer variable increments/decrements a counter (`remaining--`) instead of computing from wall-clock time
- `setInterval(callback, 1000)` with no `visibilitychange` compensation
- Timer shows wrong time after returning from a different tab
- Rest timer notification fires late

**Phase to address:**
Phase 3 (Rest Timer). This is a one-time architectural decision that must be made correctly at implementation time.

---

### Pitfall 7: Workout/Routine Template Coupling Creates Data Integrity Issues

**What goes wrong:**
A routine template references exercises by ID. The user modifies the template (adds an exercise, changes set count). Now, should in-progress workouts started from this template be updated? Should completed workouts retroactively change? If the template is deleted, do all historical workouts lose their structure?

This is the same class of problem the existing codebase solved for recurring tasks (ON DELETE SET NULL for `project_id` FK), but workout templates have deeper nesting.

**Why it happens:**
Developers model routines as live references to workouts. A workout "uses" a routine. But routines are templates, not parents -- they should be copied at workout-start, not referenced.

**Consequences:**
- Editing a routine retroactively changes how historical workouts display
- Deleting a routine makes historical workouts lose their exercise structure
- A workout started from a routine but modified during the session has an inconsistent relationship to its template

**Prevention:**
**Copy-on-start pattern**: When a user starts a workout from a routine:
1. Copy all exercise references and set templates into the new workout row
2. Store `routine_id` as a reference to the source template (for "start this routine again")
3. The workout is now independent -- editing the routine does NOT affect the workout
4. Use `ON DELETE SET NULL` for the `routine_id` FK on workouts (matching the existing `project_id` pattern on tasks)

This means workouts and routines share the same `exercises[]` shape (as Hevy's API demonstrates -- both `Workout` and `Routine` contain an `exercises` array), but they are separate copies after creation.

**Detection:**
- Editing a routine changes how past workouts display
- Deleting a routine causes errors when viewing historical workouts
- No `routine_id` field on the workouts table (or it's a hard FK with CASCADE)

**Phase to address:**
Phase 1 (Data Model). The relationship between routines and workouts must be defined as copy-on-start, not live reference, in the schema design.

---

### Pitfall 8: Sidebar Navigation Crowding When Adding a 4th Top-Level Section

**What goes wrong:**
The current sidebar has 3 items: Dashboard, Habits, Tasks. Adding "Workouts" makes it 4. This seems fine -- 4 items is below the recommended 5-6 max. But the real issue is the badge system. Currently, Dashboard has no badge, Habits shows incomplete count, Tasks shows due count. Workouts might show an "active workout" indicator or "workouts this week" count.

The sidebar counts API (`/api/sidebar/counts`) currently queries habits and tasks. Adding workout counts means a third parallel query, increasing the endpoint's response time and the sidebar's render complexity.

**Why it happens:**
Each new feature owner adds "just one more" badge/count to the sidebar without considering the aggregate performance cost. The sidebar counts endpoint becomes a God query that touches every major table.

**Consequences:**
- Sidebar counts endpoint becomes the slowest API call (touches habits, tasks, AND workouts)
- Badge information overload (too many numbers in the sidebar)
- The 60px collapsed sidebar rail gets tight with 4 icon+badge combinations
- Mobile sidebar sheet needs scrolling with more items

**Prevention:**
1. **Do NOT add workout counts to the existing sidebar counts endpoint.** The sidebar badge for workouts should only show during an active workout session (a simple "in-progress" indicator), not a daily/weekly count.

2. **Use client-side state for the active workout indicator**, not an API call. The workout session state (Pitfall 2) already tracks whether a workout is in progress. The sidebar can check this via a React context or a simple localStorage flag.

3. **Add the Workouts nav item as a 4th flat item** (matching the existing pattern). Use the Dumbbell icon from Lucide. Keep the icon container style consistent with the existing `NavIconContainer`.

4. **Do not group/collapse sidebar items** -- the existing decision was to use a flat sidebar (documented in Key Decisions: "Flat sidebar nav -- remove collapsible groups").

**Detection:**
- Sidebar counts endpoint response time increases by 50%+ after adding workout queries
- Sidebar feels cluttered with too many badges
- Mobile sidebar needs scrolling to see all items

**Phase to address:**
Phase 2 (Workout Logging) for the sidebar integration. The nav item is trivial; the badge strategy needs intentional design.

---

### Pitfall 9: Progression Charts Query Every Set Ever Logged

**What goes wrong:**
To show a bench press progression chart, the naive approach queries:
```sql
SELECT s.weight_value, s.reps, w.started_at
FROM sets s
JOIN workout_exercises we ON s.workout_exercise_id = we.id
JOIN workouts w ON we.workout_id = w.id
WHERE we.exercise_template_id = 'bench-press'
AND w.user_id = $1
ORDER BY w.started_at
```

For a user who has been training for 2 years, 3x/week, with 5 sets per exercise, that's ~1,560 rows. Not huge, but the JOIN across 3 tables on Supabase (with RLS policies on each table) gets expensive. Add muscle group filtering and the query touches even more rows.

**Why it happens:**
Progression charts seem simple until you consider:
- Which metric to chart (max weight? total volume? estimated 1RM?)
- Time range selection (last month? 3 months? all time?)
- Aggregation level (per-workout max, weekly average, monthly trend?)
- Multiple exercise types need different chart metrics

**Consequences:**
- Progression page takes 2-3 seconds to load
- Supabase RLS policies on JOINed tables compound query cost
- The query returns raw sets when the chart only needs aggregated data points (one per workout)

**Prevention:**
1. **Pre-aggregate on write**: When a workout is completed, compute and store per-exercise summary data: `best_set_weight`, `total_volume`, `estimated_1rm`, `top_set_reps`. Store this in a `workout_exercise_summaries` table (or as computed columns on `workout_exercises`). The progression chart reads from summaries, not raw sets.

2. **Limit default time range**: Default to 3 months of data. Let the user expand. At 3x/week, that's ~36 data points -- fast to query and render.

3. **Index strategically**: Create a composite index on `(exercise_template_id, user_id, completed_at)` for the workouts table to support efficient per-exercise history queries.

4. **Use the same date-based SWR key pattern** as the existing dashboard: `/api/exercises/{id}/history?months=3` with `keepPreviousData: true`.

**Detection:**
- Progression chart queries JOINing 3+ tables
- Chart page takes > 1 second to load
- No indexes on exercise_template_id + user_id combinations
- Raw set data sent to the client when only aggregated values are needed

**Phase to address:**
Phase 4 (Progression Charts / Personal Records). But the summary table should be planned in Phase 1 (schema design) and populated in Phase 2 (workout completion).

---

### Pitfall 10: Zod Validation Schema Doesn't Match Discriminated Exercise Types

**What goes wrong:**
The existing codebase uses Zod schemas for all API validation (`lib/validations/`). For workout data, the set validation must vary by exercise type: weight exercises require `weight_value` + `reps`, timed exercises require `duration_seconds`, cardio exercises require `duration_seconds` + `distance_meters`. A flat Zod schema with all fields optional lets through invalid data (a bench press set with no weight, a plank with reps instead of duration).

**Why it happens:**
Developers create a single `setSchema` with all fields optional and rely on the UI to show the right inputs. But the API should reject invalid combinations regardless of what the UI sends.

**Consequences:**
- Invalid data in the database (bench press with NULL weight)
- PRs calculated from garbage data (a "plank" with 999 reps)
- The API accepts anything, and data quality degrades over time
- Downstream features (progression charts, volume calculation) produce wrong results

**Prevention:**
Use Zod discriminated unions (matching the existing `HabitFrequency` pattern):

```typescript
const weightRepsSetSchema = z.object({
  exercise_type: z.literal('weight_reps'),
  weight_value: z.number().positive(),
  weight_unit: z.enum(['kg', 'lbs']),
  reps: z.number().int().positive(),
  rpe: z.number().min(6).max(10).step(0.5).optional(),
});

const durationSetSchema = z.object({
  exercise_type: z.literal('duration'),
  duration_seconds: z.number().int().positive(),
});

const setSchema = z.discriminatedUnion('exercise_type', [
  weightRepsSetSchema,
  durationSetSchema,
  // ... other types
]);
```

Wire this into the workout API routes using `.safeParse()` exactly as the existing habit and task routes do.

**Detection:**
- Set validation schema has all fields optional
- API accepts a bench press set with no weight_value
- No discriminated union on exercise_type in the Zod schemas
- The `lib/validations/` directory has no workout-related files

**Phase to address:**
Phase 1 (Data Model / Validation Schemas). Create `lib/validations/workout.ts` with discriminated union schemas before building API routes.

---

## Minor Pitfalls

Mistakes that cause friction or technical debt but have bounded impact.

### Pitfall 11: Exercise Template Seeding Runs on Every API Call

**What goes wrong:**
The existing categories feature seeds 12 default categories on the first API call (lazy initialization). If the exercise library uses the same pattern (seed 400+ exercises on first call), the first workout-related API request takes 5+ seconds as it INSERTs hundreds of rows.

**Why it happens:**
The "lazy seed" pattern works for 12 categories but not for 400 exercises. The categories seeding inserts 12 rows; exercise seeding inserts 400+ rows with muscle group tags, equipment references, and exercise type metadata.

**Prevention:**
Seed preset exercises via a **Supabase migration** (SQL INSERT in `supabase/migrations/`), not via application code. Preset exercises should be global (shared across all users) or seeded per-user at signup time, not on first API call.

Recommended approach:
- Create a global `exercise_templates` table with no `user_id` (shared across all users)
- Create a `user_exercises` table for custom user-created exercises (with `user_id`)
- The exercise library API returns the union of both tables
- Preset exercises are seeded via migration; no lazy initialization

**Detection:**
- First workout API call takes > 2 seconds
- `exercise_templates` table has `user_id` column with duplicate rows per user
- Application code has a `seedExercises()` function called from API routes

**Phase to address:**
Phase 1 (Data Model / Schema Migration). Seed exercises in the migration, not in application code.

---

### Pitfall 12: i18n Translation Volume Underestimated for Fitness Domain

**What goes wrong:**
The existing locale files (`en.json`, `zh.json`, `zh-TW.json`) have ~812 lines. Workout tracking adds:
- ~400 exercise names (3 locales = 1,200 new strings)
- ~30 muscle group names (90 strings)
- ~20 equipment type names (60 strings)
- ~80 UI strings for workout logging, timer, progression, routines
- Set type labels, chart labels, unit labels

That's 1,400+ new translation strings, nearly doubling the existing translation file size.

**Why it happens:**
The habit/task domain has maybe 50 entity-specific strings. The fitness domain has hundreds of proper nouns (exercise names) that all need translation. "Barbell Bench Press" must be "杠铃卧推" in zh and "槓鈴臥推" in zh-TW.

**Consequences:**
- Locale files become unwieldy (2000+ lines)
- Exercise name translations are missed, showing English in Chinese UI
- zh and zh-TW translations for exercise names diverge (simplified vs. traditional characters)

**Prevention:**
1. **Separate exercise translations from UI translations**: Create `i18n/messages/{locale}/exercises.json` (or a nested key in the existing file: `exercises.names.barbell_bench_press`). This keeps exercise-specific translations organized and separate from UI copy.

2. **Use a translation spreadsheet or database approach**: Exercise names across 3 locales are better managed as structured data (CSV or DB rows) than as nested JSON keys.

3. **Prioritize**: Translate the ~50 most common exercises first. Mark the rest as "fallback to English" with a TODO. Do not block the feature on complete translation of 400+ exercises.

4. **Reuse existing next-intl patterns**: The `useTranslations('workouts')` pattern works; just namespace it clearly.

**Detection:**
- Exercise names appear in English in the Chinese locale
- Locale files exceed 2000 lines and are hard to review in PRs
- zh-TW exercise names use simplified characters (copy-pasted from zh)

**Phase to address:**
Phase 1 (Exercise Library) for the translation structure. Phase 5 (Polish) for complete translation coverage.

---

### Pitfall 13: Superset/Circuit Grouping Attempted Too Early

**What goes wrong:**
Hevy supports supersets (two exercises back-to-back) and the developer tries to implement this in the first iteration. Superset grouping adds significant complexity: exercises need a `superset_id`, the UI needs a grouping visual treatment, the set logging flow changes (alternate between exercises), and the data model must handle N exercises in a group.

**Why it happens:**
Feature envy -- Hevy has it, so we should have it. But supersets are a power-user feature that maybe 20% of users utilize.

**Consequences:**
- The exercise ordering logic becomes complex (sort by superset group, then by order within group)
- UI layout must handle grouped and ungrouped exercises differently
- The MVP takes 2-3x longer to ship

**Prevention:**
Defer supersets to a future iteration. The Hevy API includes a `superset_id` field on exercises, but it's nullable -- most exercises aren't in supersets. Include the `superset_id` column in the schema (nullable, defaulting to NULL) so the data model supports it, but don't build the UI for it in v4.0.

**Detection:**
- Scope includes superset UI in the initial milestone
- Exercise ordering logic handles group membership
- The workout form has a "Create Superset" button

**Phase to address:**
Explicitly defer to v4.1 or v5.0. Add the nullable `superset_id` column in Phase 1 schema design but do not build UI for it.

---

### Pitfall 14: Personal Records Not Computed Incrementally

**What goes wrong:**
Computing personal records (heaviest bench press ever, most reps at a given weight) by scanning all historical workout data on every request. For a user with 500+ workouts, this means aggregating thousands of sets.

**Why it happens:**
PRs seem simple ("just MAX(weight) WHERE exercise = bench press") but there are multiple PR types: heaviest weight, most reps at a given weight, highest volume in one set, highest estimated 1RM. Each requires a different aggregation.

**Prevention:**
Maintain a `personal_records` table that is updated incrementally when a workout is completed:

```sql
CREATE TABLE personal_records (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  exercise_template_id TEXT NOT NULL,
  record_type TEXT NOT NULL, -- 'max_weight', 'max_reps', 'max_volume', 'max_estimated_1rm'
  value NUMERIC NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  UNIQUE(user_id, exercise_template_id, record_type)
);
```

When a workout is completed, compare each exercise's best set against the current PR. Update if beaten. This makes PR lookups O(1) instead of scanning all history.

**Detection:**
- PR display triggers a full-table scan on workout sets
- PR computation takes > 500ms
- No `personal_records` table in the schema

**Phase to address:**
Phase 1 (Schema Design) for the table. Phase 2 (Workout Completion) for the update logic. Phase 4 (Progression) for the display.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Phase 1: Schema Design | Flat set schema (P1), unit storage (P3), template coupling (P7), validation (P10) | Define exercise type enum and discriminated unions FIRST. Store weight in logged unit. Use copy-on-start for routines. |
| Phase 1: Exercise Library | Overengineered search (P5), seeding cost (P11), translation volume (P12) | Load-all-and-filter-client-side. Seed via migration. Separate exercise translations. |
| Phase 2: Workout Logging | State loss on refresh (P2), SWR cache explosion (P4), sidebar crowding (P8) | Dual-write (server + localStorage). Coarse-grained SWR keys. Client-side active workout indicator. |
| Phase 3: Rest Timer | Timer drift in background (P6) | Timestamp-based elapsed time, not tick-counting. Use `visibilitychange` event. |
| Phase 4: Progression Charts | Slow chart queries (P9), PR full-scan (P14) | Pre-aggregate summaries on workout completion. Maintain incremental PR table. Default 3-month range. |
| Phase 4: Routines | Scope creep with supersets (P13) | Include nullable `superset_id` in schema but defer UI to future milestone. |
| All Phases: i18n | Missing translations (P12) | Add workout namespace to all 3 locale files in each phase. Do not defer all translations to the end. |

---

## Integration-Specific Pitfalls (Existing Codebase)

These pitfalls are specific to adding fitness features to the existing BetterR.Me codebase patterns.

### Existing Pattern: Fresh Supabase Client Per Request
The codebase requires `const supabase = await createClient()` in every API route. Workout routes MUST follow this pattern. Do NOT create a singleton `WorkoutsDB` instance -- instantiate it fresh in each handler. The existing pattern is documented in CLAUDE.md and enforced by code review.

### Existing Pattern: Client-Sent Date Parameter
All time-aware endpoints accept a `date` query param from the client (never trust server-local time on Vercel). Workout logging should use `started_at` and `completed_at` timestamps from the client, but validated server-side to be within reasonable bounds (not in the future, not more than 24 hours in the past).

### Existing Pattern: DB Class + Zod Validation Separation
DB classes (`lib/db/`) handle data access. Zod schemas (`lib/validations/`) handle input validation. API routes wire them together. Workout features must follow this separation: `WorkoutsDB`, `ExercisesDB`, `SetsDB` in `lib/db/`, with matching `lib/validations/workout.ts` schemas.

### Existing Pattern: SWR Hook Per Feature
Each feature has a dedicated hook (`use-dashboard.ts`, `use-habits.ts`, `use-projects.ts`). Create `use-workouts.ts`, `use-exercises.ts`, `use-workout-session.ts` following the same pattern. Use the `fetcher` from `lib/fetcher.ts`.

### Existing Pattern: Sidebar Counts Revalidation
The existing `revalidateSidebarCounts()` function is called after habit toggles and task completions. If workout activity should affect sidebar counts (not recommended per Pitfall 8), it would need to call this function too. Prefer client-side state for the active workout indicator instead.

---

## Sources

- Hevy API data model: [Hevy MCP Server](https://github.com/chrisdoc/hevy-mcp), [Hevy API Docs](https://api.hevyapp.com/docs/), [go-hevy package](https://pkg.go.dev/github.com/gregwilson777/go-hevy)
- Hevy exercise library: [400+ Exercises](https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises)
- Hevy exercise types: [Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/)
- Timer throttling: [Why setInterval breaks in inactive tabs](https://pontistechnology.com/learn-why-setinterval-javascript-breaks-when-throttled/), [Why JavaScript Timer Is Unreliable](https://abhi9bakshi.medium.com/why-javascript-timer-is-unreliable-and-how-can-you-fix-it-9ff5e6d34ee0)
- State persistence: [localStorage vs IndexedDB in beforeunload](https://vaughnroyko.com/offline-storage-indexeddb-and-the-onbeforeunloadunload-problem/), [Persisting unsaved sessions with localStorage](https://mstflotfy.com/theindiedev/persist-state-localStorage-OneExercise)
- Unit conversion: [Fitbod unit handling](https://fitbod.zendesk.com/hc/en-us/articles/23560953306263-Unit-of-Measurement)
- Workout schema patterns: [Designing data structure for workouts](https://1df.co/designing-data-structure-to-track-workouts/), [Dittofi workout data model](https://www.dittofi.com/learn/how-to-design-a-data-model-for-a-workout-tracking-app)
- Supabase RLS performance: [RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- Sidebar UX: [Sidebar best practices](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2)
- Workout logging UX: [Fitness app UX design principles](https://stormotion.io/blog/fitness-app-ux/)
- SWR caching: [SWR cache documentation](https://swr.vercel.app/docs/advanced/cache)
- Time-series queries: [PostgreSQL time-series design](https://neon.com/guides/timeseries-data)
