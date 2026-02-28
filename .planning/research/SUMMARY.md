# Project Research Summary

**Project:** BetterR.Me v4.0 -- Fitness Tracking Milestone
**Domain:** Hevy-inspired workout logging integrated into existing habit/task management app (web-only, single-user)
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

BetterR.Me v4.0 adds Hevy-inspired workout tracking to a mature habit and task management app. The feature set is well-understood: exercise library with preset and custom exercises, workout session logging (start/finish, add exercises, log sets), routine templates, rest timer, personal records, and progression charts. The reference implementation is Hevy -- a purpose-built workout app -- and the implementation path is clear across all four research areas. The domain is thoroughly documented (Hevy feature pages, API documentation, public exercise databases) and the codebase patterns generalize cleanly to fitness data.

The stack addition is minimal: only `recharts` v2 (via the shadcn/ui `chart` component) is a new external dependency. Everything else -- timers, audio feedback, exercise seed data -- is implemented with custom hooks and browser-native APIs (~55 lines of code total). The architecture layers entirely onto the existing `DB class -> API route -> SWR hook -> React component` pattern. New tables follow established Supabase RLS patterns. New DB classes follow the constructor-injected client pattern. New API routes follow existing REST conventions. The single largest structural addition is 5 new Supabase tables and ~65 new/modified files.

The highest-risk areas are the data model decisions in Phase 1 -- particularly the exercise type enum, the weight storage strategy, and the session persistence design -- all of which are expensive to retrofit after users have logged workout data. Phase 1 must lock in the schema before any UI work begins. Secondary risks are workout session state loss on browser refresh (mitigated by dual-write to both server and localStorage from day one) and SWR cache design for deeply nested workout data (mitigated by coarse-grained cache keys per workout session). The feature is well-scoped: no social features, no AI, no cardio distance tracking -- a focused strength training logger that bridges workout tracking with BetterR.Me's self-improvement philosophy.

## Key Findings

### Recommended Stack

The existing stack handles all fitness tracking needs. The only new dependency is the charting library, added via the shadcn/ui CLI.

**New dependencies:**
- `recharts` v2.15.x (via `pnpm dlx shadcn@latest add chart`): SVG-based charting for progression line charts and weekly volume bar charts. The shadcn/ui `chart` component wraps Recharts with automatic dark mode support via CSS custom properties. Recharts v2 is specifically required -- shadcn/ui is not yet compatible with Recharts v3 (PR #8486 open; v3 also adds unnecessary Redux/Immer dependencies).

**Custom implementations (no new libraries needed):**
- `useStopwatch` + `useCountdown` hooks (~55 lines total): client-side workout duration and rest timer. Custom hooks give full control for audio integration, optimistic persistence, and Vitest testing with `vi.useFakeTimers()`.
- `playBeep()` via Web Audio API (~10 lines): rest timer audio alert. No library needed for a single programmatic tone.
- Exercise seed data as curated JSON (~80-120 exercises): seeded via Supabase migration (global, `user_id IS NULL`), following the same pattern as the existing `categories` table -- except seeded via migration SQL, not lazy application code (see Critical Pitfalls #6).

**What NOT to add:** Recharts v3, `react-timer-hook`, `react-countdown-circle-timer`, Chart.js, framer-motion, Zustand/Redux, external exercise APIs (ExerciseDB, wger), `howler.js`, `react-query`, `react-beautiful-dnd`.

See: `.planning/research/STACK.md` for full analysis and all alternatives considered.

### Expected Features

**Must have (table stakes):**
- Start / finish a workout session (sticky or dedicated active-workout UI, persisted to DB with `status: "in_progress"`)
- Exercise library with ~80-120 preset exercises (seeded globally, searchable, filterable by muscle group and equipment)
- Custom user exercises (name, primary muscle, equipment, exercise type)
- Exercise search/selection via full-screen modal with client-side filtering (load-all, no server pagination)
- Set tracking: weight + reps, bodyweight + reps, and duration (covers ~100% of strength exercises)
- Previous workout values auto-filled on each set row (Hevy-style -- single biggest UX driver for logging speed)
- Workout history list (reverse chronological, paginated)
- Workout detail view (all exercises and sets, read-only)
- Routine templates: create, edit, delete, start workout from routine
- Rest timer: client-side countdown auto-starts on set completion, configurable duration, audio beep on completion
- Weight unit preference: kg / lbs (stored in `ProfilePreferences` JSONB, all weights stored as `weight_kg` internally)
- Workouts page as 4th top-level sidebar section (Dumbbell icon, flat nav following existing pattern)

**Should have (differentiators):**
- Personal records (PR) detection: max weight and best set volume per exercise, shown mid-workout as inline banner
- Per-exercise progression chart: line chart of weight over time (Recharts via shadcn Chart)
- Set type labels: warmup / normal / drop set / failure (warmup excluded from PR calculations)
- Workout title and per-exercise notes (freeform)
- Dashboard integration: last workout date and current week workout count

**Defer to v4.1+:**
- Superset grouping (include nullable `superset_id` column in schema; defer UI)
- Muscle group distribution charts (weekly volume per muscle group)
- Estimated 1RM PR type (requires formula selection and user explanation)
- Workout streak tracking (reuse habit streak pattern later)
- Body measurements, plate calculator, video demos, social features, AI generation

**Critical path:** Exercises table (seed) -> Workouts/Sets tables -> Workout logging UI -> Previous value auto-fill -> Routines -> History/Detail views -> PR detection -> Progression charts

See: `.planning/research/FEATURES.md` for the full feature landscape, exercise type taxonomy (8 types), muscle group taxonomy (14 groups), equipment taxonomy (9 types), and anti-features.

### Architecture Approach

The fitness tracking architecture is a clean extension of the existing `DB class -> API route -> SWR hook -> React component` pattern. Five new Supabase tables (`exercises`, `workouts`, `workout_exercises`, `workout_sets`, `routines`/`routine_exercises`), four new DB classes, a new `components/fitness/` component tree, and an `app/workouts/` page hierarchy. No new architectural paradigms are introduced.

**Major components:**
1. **ExercisesDB + `/api/exercises`** -- exercise library CRUD; global preset rows (`user_id IS NULL`) plus per-user custom exercises; client-side filtering (load-all, no server pagination required for ~100-120 exercises)
2. **WorkoutsDB + WorkoutExercisesDB + `/api/workouts`** -- session CRUD, active workout state, set CRUD; unique partial index on `(user_id) WHERE status = 'in_progress'` enforces one active workout per user at the DB level
3. **RoutinesDB + `/api/routines`** -- routine template CRUD; copy-on-start pattern (routine exercises are copied into the new workout at start time, not referenced live -- `ON DELETE SET NULL` for `routine_id` FK on workouts)
4. **Workout Logger UI** -- `WorkoutLogger`, `WorkoutExerciseCard`, `WorkoutSetRow`, rest timer; active workout managed in `useReducer` + localStorage dual-write, synced to server on every set mutation via debounced PATCH
5. **Progress components** -- `ExerciseProgressChart` (Recharts LineChart via shadcn ChartContainer), `PersonalRecordsCard`; exercise history API aggregates per workout with default 3-month limit
6. **Modified: ProfilesDB + preferences API** -- add `weight_unit: "kg" | "lbs"` to existing JSONB preferences column (zero migration needed, schema-on-write)
7. **Modified: AppSidebar** -- add "Workouts" nav item; active workout indicator uses client-side state (not sidebar counts API)

**Key architectural decisions:**
- All weights stored as `weight_kg` (canonical kg) in DB; convert to user preference in UI at display/input boundaries only -- prevents data corruption if user switches units
- Coarse-grained SWR cache: one key per workout (`/api/workouts/[id]` returns full nested workout with exercises and sets); no separate SWR keys for exercises or sets within a workout
- Active workout state in `useReducer` + localStorage during session, synced to server on each mutation -- prevents state loss on refresh
- Exercise library: load-all-then-filter-client-side -- ~80-120 exercises fit in one SWR cache entry; `Array.filter()` is instant vs. API roundtrip during workout

**New vs. modified files:** ~55 new files (migrations, DB classes, API routes, hooks, components, pages, validations, utilities) + ~8 modified files (types.ts, sidebar, settings-content, preferences validation, locale files, lib/db/index.ts, lib/constants.ts).

See: `.planning/research/ARCHITECTURE.md` for full SQL schema (all 6 tables with RLS policies and indexes), component file tree, data flow diagrams, SWR hook implementations, validation schemas, and a 17-step build order.

### Critical Pitfalls

1. **Flat set schema without exercise type semantics** -- A `workout_sets` table with all nullable columns seems fine initially, but volume calculations produce NaN for bodyweight exercises, progression chart code scatters `if (type === 'weight')` everywhere, and DB CHECK constraints cannot enforce required fields per type. **Prevention:** Define `exercise_type` enum on `exercises` table. Centralize field semantics in `lib/fitness/exercise-fields.ts`. Use Zod discriminated unions in `lib/validations/workout.ts`. Address in Phase 1 before any UI work.

2. **In-progress workout state lost on browser refresh** -- Storing workout data only in React state means 20-60 minutes of gym data evaporates on page crash or tab close. This is the single most rage-inducing failure in the domain. **Prevention:** Dual-write on every mutation: PATCH to server (sets `status: "in_progress"`) AND `localStorage.setItem` (synchronous -- survives page teardown). On mount, check both server and localStorage for in-progress workout; show "Resume workout?" banner. Do NOT use IndexedDB in `beforeunload` handlers (async, not guaranteed to flush before page teardown). Must be built into Phase 2 from the start -- not retrofitted.

3. **Weight unit conversion corrupting historical data** -- Rounding the irrational lb->kg conversion and storing the result means switching unit preferences causes historical weights to drift. Retroactively converting stored data is worse. **Prevention:** Store all weights as `weight_kg` (canonical kg, `NUMERIC(7,2)`). Display by converting on read with intelligent rounding (nearest 0.5 lbs for lbs display). `ProfilePreferences.weight_unit` controls display only; never mutate stored values. Address in Phase 1 schema design.

4. **SWR cache explosion from fine-grained workout data** -- Workout data is hierarchical (workout -> exercises -> sets), unlike flat habit/task entities. Per-entity SWR keys cause cascade invalidation bugs (adding a set must invalidate workout detail, workout list, exercise history, and PRs). **Prevention:** Coarse-grained SWR -- one key per workout returns everything nested. Manage active workout mutations in `useReducer` local state. Use a `revalidateWorkoutData()` utility (mirroring existing `revalidateSidebarCounts()`) for targeted post-mutation invalidation.

5. **Exercise library overengineered as a searchable service** -- Adding `tsvector` full-text search, server-side pagination, and GIN indexes to 80-120 exercises is massive overengineering. The entire dataset fits in browser memory (~200KB). **Prevention:** Load all exercises in a single `GET /api/exercises` with long SWR `dedupingInterval` (10+ minutes). Filter client-side. Reserve server-side aggregation for exercise HISTORY (time-series data that grows).

6. **Exercise preset seeding via application code (not migration)** -- The categories "lazy seed" pattern works for 12 rows but would cause 5+ second latency if reused for 80-120 exercises. **Prevention:** Seed preset exercises via Supabase migration SQL (`user_id IS NULL`), not application code. This diverges intentionally from the categories seeding pattern. Address in Phase 1.

7. **Rest timer drifting in background tabs** -- `setInterval` tick-counting is throttled by Chrome/Firefox in background tabs (to 1-minute intervals). Timer shows wrong remaining time when user returns from their phone camera. **Prevention:** Timestamp-based elapsed time: `const remaining = Math.max(0, durationMs - (Date.now() - startTime))`. On `visibilitychange`, immediately recalculate from stored `startTime`. Address in Phase 2 timer implementation.

See: `.planning/research/PITFALLS.md` for the full analysis of 14 pitfalls (5 critical, 5 moderate, 4 minor) with detection signals, phase-to-pitfall mapping, and integration-specific warnings for the BetterR.Me codebase.

## Implications for Roadmap

Based on combined research, the feature decomposes into 4 phases with strict dependency ordering. The schema must be locked before any UI; the exercise library must exist before the workout logger; the workout logger must be functional before routines; history and progression come last because they read from completed workout data.

### Phase 1: Database Foundation & Exercise Library

**Rationale:** Every subsequent feature depends on the schema. The exercise type enum, weight storage strategy, and set field semantics must be locked before any UI is built -- retroactively changing these after workout data exists requires a full data migration. The exercise library is the dependency for workout logging, routines, and progression charts.

**Delivers:**
- Supabase migrations: `exercises`, `workouts`, `workout_exercises`, `workout_sets`, `routines`, `routine_exercises` tables with full RLS policies, constraints, and indexes (including unique partial index on active workout per user)
- Exercise preset seed migration (~80-120 exercises, `user_id IS NULL`, global -- not per-user)
- TypeScript type definitions for all fitness entities (`Exercise`, `Workout`, `WorkoutSet`, `Routine`, `RoutineExercise`, `PersonalRecord`, `ExerciseHistoryEntry`, `WeightUnit`) in `lib/db/types.ts`
- DB classes: `ExercisesDB`, `WorkoutsDB`, `WorkoutExercisesDB`, `RoutinesDB`
- Validation schemas with Zod discriminated unions on `exercise_type`: `lib/validations/exercise.ts`, `lib/validations/workout.ts`, `lib/validations/routine.ts`
- Fitness utilities: `lib/fitness/units.ts` (kg/lbs conversion), `lib/fitness/exercise-fields.ts` (exercise type to input field mapping)
- Exercises API: `GET /api/exercises` (load-all, no pagination), `POST /api/exercises` (custom creation), `GET/PATCH/DELETE /api/exercises/[id]`
- Exercise library UI: browse, search, filter by muscle group and equipment (client-side), create custom exercise form, exercise detail page
- Weight unit preference: extend `ProfilePreferences` TypeScript type + Zod schema + settings UI selector (kg/lbs toggle following existing WeekStartSelector pattern)
- Sidebar: add "Workouts" nav item with Dumbbell icon
- i18n strings for all fitness UI in en/zh/zh-TW (exercise name translations can be incremental -- see Gaps)

**Addresses features:** Exercise library, custom exercises, exercise search/filter, weight unit preference, workouts nav item
**Avoids pitfalls:** P1 (flat schema without type semantics), P3 (weight unit corruption), P5 (overengineered search), P6 (lazy seeding at app-code level), P10 (missing discriminated union validation)

**Verification:** Confirm all 6 tables exist with correct RLS. Verify preset exercises are queryable by all authenticated users. Create a custom exercise -- confirm it appears only for the creating user. Confirm `weight_unit` updates via existing `PATCH /api/profile/preferences`. Exercise library UI should render with client-side search and muscle group filter working without API calls on keystroke.

### Phase 2: Workout Logging (Core Loop)

**Rationale:** The core product loop -- start a workout, add exercises, log sets, finish. This is the feature that all other phases depend on. A user must be able to log a workout end-to-end before routines, history, or progression charts matter. Building this phase proves the schema works, the SWR cache strategy is correct, and the session persistence is reliable.

**Delivers:**
- Workouts API: `POST /api/workouts` (start session), `GET /api/workouts/active` (404 if none), `PATCH /api/workouts/[id]` (update title/notes/finish), `DELETE /api/workouts/[id]`, exercise CRUD endpoints, set CRUD endpoints
- SWR hooks: `useActiveWorkout()` (no auto-refresh, manual mutate), `useWorkouts()` (paginated history list)
- Custom hooks: `useStopwatch` (workout elapsed duration), `useCountdown` (rest timer countdown)
- Active workout session persistence: `useReducer` local state + `localStorage` dual-write on every mutation + recovery banner on mount
- Workout logger UI: `WorkoutLogger`, `WorkoutHeader` (elapsed timer, title, finish/discard buttons), `WorkoutExerciseCard` (sets accordion), `WorkoutSetRow` (weight/reps/duration inputs per exercise type), `WorkoutAddExercise` (exercise picker Sheet/Dialog), `WorkoutRestTimer` (countdown with progress bar, +15s/-15s buttons), `WorkoutFinishDialog` (confirmation modal)
- Previous workout values auto-fill: displayed alongside set input fields (query last workout containing same exercise)
- Rest timer: configurable default (90s default, per-exercise override), auto-starts on set completion, Web Audio API beep on zero
- Set completion: checkbox per set with optimistic SWR update
- Workouts landing page (`/workouts`): "Start Workout" CTA, recent workouts preview, routines preview, active session recovery banner
- Active workout page (`/workouts/active`): redirects to `/workouts` if no active session

**Addresses features:** Start/finish workout, exercise selection mid-workout, set tracking (all 3 types), previous values auto-fill, rest timer, workout session page
**Avoids pitfalls:** P2 (state loss on refresh -- dual-write built in from day one), P4 (SWR cache explosion -- coarse-grained keys, `useReducer` for active session), P8 (sidebar crowding -- active workout indicator from client state, not counts API), P6-timer (timestamp-based countdown, not tick-counting)

**Verification:** Log a complete workout (start, 3 exercises, multiple sets of each, finish). Confirm data in Supabase. Refresh mid-workout -- confirm "Resume workout?" banner appears and all sets restore. Switch to another browser tab for 2 minutes, return -- confirm rest timer shows correct remaining time. Try starting a second workout while one is active -- confirm 409 Conflict response.

### Phase 3: Routines & Templates

**Rationale:** Routines depend on a stable workout logging flow. Users build routines after logging a few raw workouts and wanting to repeat them. The copy-on-start pattern must be implemented correctly at the API layer to prevent the routine/workout coupling pitfall.

**Delivers:**
- Routines API: `POST /api/routines`, `GET /api/routines`, `GET/PATCH/DELETE /api/routines/[id]`, exercise CRUD within routine, `POST /api/routines/from-workout/[workoutId]` (save workout as routine)
- Copy-on-start enforcement: `POST /api/workouts` with `routine_id` copies all `routine_exercises` into `workout_exercises` + creates empty `workout_sets` for target_sets count; subsequent routine edits do NOT affect the workout; `ON DELETE SET NULL` for `routine_id` FK
- SWR hooks: `useRoutines()`, `useRoutineDetail()`
- Routines UI: routines list page, routine card (name, exercise count, last performed date), routine detail (exercise list with targets, "Start Workout" button), routine form (create/edit with drag-to-reorder exercise order), routine exercise row (exercise, target sets/reps/weight, rest timer)
- "Save as routine" from completed workout detail view
- Routines section on workouts landing page (`/workouts`)
- i18n strings for routines in all 3 locales

**Addresses features:** Create/edit/delete routines, start workout from routine, routine exercise ordering with targets
**Avoids pitfalls:** P7 (template-workout coupling -- copy-on-start enforced in API layer, `ON DELETE SET NULL` for `routine_id`)

**Verification:** Create a routine with 3 exercises and target sets. Start a workout from it -- verify exercises and target sets pre-fill the workout. Edit the routine. Confirm the previously started workout's exercises are unchanged. Delete the routine -- confirm historical workouts that used it retain their exercise data (routine_id becomes NULL, exercises remain).

### Phase 4: History, Personal Records & Progression

**Rationale:** Progression tracking requires workout history to exist. Personal records are computed from historical data. This is the "payoff" phase -- the reward that motivates users to keep logging. It is last because it is primarily read-only (reads from data created in phases 1-3) and does not block any other phase.

**Delivers:**
- Exercise history API: `GET /api/exercises/[id]/history` -- aggregated per workout (best set weight, total volume, total normal sets); default 3-month limit with date range selector
- Workout history list page and history cards: paginated reverse chronological list, summary cards (date, title, exercise count, total volume, duration)
- Workout detail view (`/workouts/[id]`): completed workout read-only view showing all exercises, all sets, PRs achieved, duration, total volume
- Exercise detail page (`/workouts/exercises/[id]`): exercise info, progression chart, current PRs
- Personal records: `personal_records` table updated incrementally on workout completion (compare each completed normal set vs. stored best per exercise); PR types: max weight, best set volume (weight x reps)
- PR detection mid-workout: compare current set against stored best; show congratulatory inline banner on new PR
- Per-exercise progression chart: Recharts `LineChart` via shadcn `ChartContainer` -- max weight and/or volume over time, date range selector (1m / 3m / 6m / all time), dark mode automatic via CSS custom properties
- Dashboard integration: last workout date and current week workout count (extends dashboard API query)
- `useExerciseHistory()` SWR hook with `keepPreviousData: true` (matches existing date-based key pattern)

**Addresses features:** Workout history list, workout detail, PR detection (max weight + best set volume), progression charts, dashboard integration
**Uses stack:** `recharts` v2 via shadcn `chart` component (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`)
**Avoids pitfalls:** P9 (slow chart queries -- 3-month default limit, server-side aggregation, consider `supabase.rpc()` if JOINs across RLS tables are slow), P14 (PR full-scan -- incremental `personal_records` table updated on workout completion)

**Verification:** Log 5 workouts with the same exercise, increasing weight each time. Confirm progression chart shows 5 data points with an upward trend. Beat the previous best weight in workout 6 -- confirm PR banner appears mid-workout and `personal_records` table updates. Delete a workout -- confirm chart and PRs update correctly. Check dashboard shows last workout date and week count.

### Phase Ordering Rationale

- **Schema first** because the exercise type enum, weight storage strategy, and the routine/workout copy-on-start relationship cannot be changed after workout data exists. Phase 1 locks these architectural decisions before any UI is built.
- **Exercise library before workout logger** because the workout logger's exercise picker requires the exercise library API and UI to be functional. The set input components also require `weight_unit` preference to be in place.
- **Workout logging (Phase 2) before routines (Phase 3)** because the "start from routine" flow copies exercises into a new workout using the same `POST /api/workouts` endpoint. That endpoint must work correctly before the copy-on-start logic can be tested.
- **History and progression last (Phase 4)** because progression charts and PRs are pure reads from completed workout data and cannot be meaningfully built or tested until Phase 2 has produced completed workouts.
- **This ordering avoids the top pitfalls:** Phase 1 locks schema decisions that are expensive to change. Phase 2 builds dual-write session persistence from day one (not retrofitted). Phase 3 enforces copy-on-start at the API level before any UI depends on the relationship. Phase 4 can focus on data visualization without data integrity concerns.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 1 (Schema Design):** The `workout_sets` nullable-column strategy and Zod discriminated union implementation need careful upfront review. Consider running `EXPLAIN ANALYZE` on the planned exercise history query (Phase 4 concern, but plan the schema now) to determine if `supabase.rpc()` will be needed. The weight storage conflict (store as kg vs. store in logged unit) must be resolved before writing the first migration -- see Gaps.
- **Phase 2 (Workout Logging):** The `useReducer` + localStorage dual-write pattern for active session state is the most novel part relative to the existing codebase. Build a minimal proof-of-concept of the persistence layer first (start workout, add one set, refresh page, verify recovery) before building the full workout logger UI.
- **Phase 4 (Progression Charts):** The exercise history aggregation query (3-table JOIN across RLS-protected tables) should be validated against Supabase's query planner before building the UI. If the query exceeds ~100ms on realistic data (50+ workouts), implement a `supabase.rpc()` PostgreSQL function.

**Phases with standard patterns (skip deep research):**

- **Phase 1 (Exercise Library UI):** Standard CRUD following existing patterns. Load-all-and-filter-client-side is identical to how categories are used in existing task/habit forms. Well-understood shadcn/ui Sheet + search input pattern.
- **Phase 3 (Routines CRUD):** Standard `DB class -> API -> SWR hook -> component` pattern. Follows `HabitsDB`/`TasksDB` exactly. Copy-on-start logic is ~20-30 lines in the API route.
- **Phase 4 (Workout History list and detail):** Standard paginated list + detail view. Recharts usage is documented with multiple shadcn chart examples. No novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Recharts v2 via shadcn/ui Chart is officially documented and npm-verified (React 19 peer dep confirmed). Custom hooks are standard React. Exercise seed dataset (free-exercise-db, Unlicense) verified on GitHub. No uncertainty on the single new dependency. |
| Features | HIGH | Feature scope sourced directly from Hevy's official feature pages and API docs. The 80-120 exercise seed count and 3-exercise-type MVP scope are judgment calls modeled on Hevy's production library. The decision to use max weight + best set volume (not estimated 1RM) as initial PR types is a deliberate simplification with clear rationale. |
| Architecture | HIGH | All patterns are direct extensions of existing BetterR.Me codebase conventions. Data model follows PostgreSQL best practices (partial unique index for one-active-workout enforcement, nullable columns over separate tables per exercise type). RLS patterns identical to existing tables. The exercise history aggregation query is the one area at MEDIUM confidence -- needs `EXPLAIN ANALYZE` validation with real data in Phase 4. |
| Pitfalls | HIGH | Verified against existing codebase analysis (not just theory), Hevy API docs, browser timer throttling documentation, localStorage vs. IndexedDB research, and workout tracking post-mortems. 14 pitfalls identified with concrete prevention strategies and detection signals. One research conflict (weight storage strategy) is documented in Gaps. |

**Overall confidence:** HIGH

### Gaps to Address

- **Weight storage strategy conflict (must resolve before Phase 1 migration):** ARCHITECTURE.md recommends storing all weights as `weight_kg` (single canonical unit, convert on display). PITFALLS.md recommends storing in the logged unit with a `weight_unit` column per set to avoid rounding drift. Recommendation: store as `weight_kg` (canonical kg, `NUMERIC(7,2)`). Display with intelligent rounding (nearest 0.5 lbs for lbs display). This is the industry standard (Hevy's API exposes both `weight_kg` and `weight_lb` as computed fields, sourced from a canonical stored value). The per-set `weight_unit` column adds overhead and complicates aggregate queries. Accept that `135 lbs -> 61.23 kg -> 135.01 lbs` drift exists but is imperceptible at 2-decimal precision with 0.5 lbs rounding. Validate this decision explicitly before writing the Phase 1 migration.

- **Personal records: table vs. on-demand computation (resolve in Phase 1 schema):** PITFALLS.md recommends a `personal_records` table updated incrementally on workout completion (O(1) lookup). ARCHITECTURE.md defers this, accepting on-demand computation for MVP. Recommendation: implement incremental PR table from the start. At 3-4 workouts per week, a user hits 500 workouts in ~3 years. Adding the table later requires backfilling from all historical data. The table is ~10 lines of SQL and ~30 lines of update logic -- not a significant Phase 1 addition.

- **Exercise history aggregation performance (validate in Phase 4 but plan schema in Phase 1):** The progression chart query joins `workout_sets -> workout_exercises -> workouts` across three RLS-protected tables. Supabase's RLS evaluation on cross-table JOINs can be slow. Validate with `EXPLAIN ANALYZE` on 50+ workouts of seed data before building the chart UI. If it exceeds 100ms, implement `supabase.rpc()` with a PostgreSQL function, or add a `workout_exercise_summaries` computed table (pre-aggregate on workout completion).

- **i18n translation volume for exercise names:** Exercise names across 3 locales add 1,200+ translation strings (400 potential exercises x 3 locales). Recommendation: create a separate `exercises` namespace in locale files (`exercises.names.*`). Translate the ~50 most common exercises for v4.0. Block the feature ship on UI string translations (workout logging, routines, settings), not on complete exercise name coverage. Mark untranslated exercise names as falling back to English.

- **Mobile workout logging UX:** Web-based workout logging on a phone is inherently harder than a native app (smaller tap targets, keyboard obscures inputs, no haptic feedback). This gap cannot be resolved by research -- it requires UX testing with real users during Phase 2. Ensure large tap targets on set completion checkboxes, minimal scrolling to reach the next set, and the rest timer visible without scrolling.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Chart docs](https://ui.shadcn.com/docs/components/radix/chart) -- Official chart component, Recharts integration, installation command
- [Recharts v2.15.4 on npm](https://www.npmjs.com/package/recharts) -- Version, React 19 peer deps confirmed
- [shadcn/ui Recharts v3 issue #7669](https://github.com/shadcn-ui/ui/issues/7669) -- v3 migration in progress (reason to stay on v2)
- [Hevy Feature List](https://www.hevyapp.com/features/) -- Authoritative feature scope definition
- [Hevy Tutorial](https://www.hevyapp.com/hevy-tutorial/) -- UX flow reference for workout logging
- [Hevy Custom Exercises](https://www.hevyapp.com/features/custom-exercises/) -- Exercise fields and type taxonomy
- [Hevy Exercise Library](https://www.hevyapp.com/features/exercise-library/) -- Muscle group and equipment categorization
- [Hevy Exercise Programming Options](https://www.hevyapp.com/features/exercise-programming-options/) -- Exercise type taxonomy (weight_reps, bodyweight_reps, duration, etc.)
- [Hevy Gym Performance Tracking](https://www.hevyapp.com/features/gym-performance/) -- Progression metrics (max weight, volume, estimated 1RM)
- [Hevy API Docs](https://api.hevyapp.com/docs/) -- Data model reference for workouts, exercises, sets
- [Hevy MCP Server](https://github.com/chrisdoc/hevy-mcp) -- Hevy API internal data model
- BetterR.Me codebase analysis -- `lib/db/`, `app/api/`, `components/`, `lib/hooks/`, `lib/validations/`, `lib/db/types.ts` -- source of extension patterns
- [free-exercise-db (GitHub)](https://github.com/yuhonas/free-exercise-db) -- 800+ exercises, Unlicense, JSON format (source for curated seed)

### Secondary (MEDIUM confidence)
- [react-timer-hook on npm](https://www.npmjs.com/package/react-timer-hook) -- Evaluated and rejected (trivial to build custom, better testability)
- [Best React chart libraries 2025 (LogRocket)](https://blog.logrocket.com/best-react-chart-libraries-2025/) -- Ecosystem comparison confirming Recharts choice
- [Why setInterval breaks in inactive tabs](https://pontistechnology.com/learn-why-setinterval-javascript-breaks-when-throttled/) -- Rest timer drift prevention rationale
- [localStorage vs IndexedDB in beforeunload](https://vaughnroyko.com/offline-storage-indexeddb-and-the-onbeforeunloadunload-problem/) -- Session persistence strategy (use localStorage not IndexedDB)
- [Designing data structure for workouts (1df.co)](https://1df.co/designing-data-structure-to-track-workouts/) -- Schema design patterns
- [Dittofi workout data model](https://www.dittofi.com/learn/how-to-design-a-data-model-for-a-workout-tracking-app) -- Schema patterns
- [Supabase RLS Performance Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) -- Cross-table JOIN RLS cost and mitigation
- [Hevy Track Workouts](https://www.hevyapp.com/features/track-workouts/) -- Workout logging UX reference
- [Hevy Workout Settings](https://www.hevyapp.com/features/workout-settings/) -- Rest timer and preference features

### Tertiary (LOW confidence)
- [Back4App Fitness Database Schema](https://www.back4app.com/tutorials/how-to-build-a-database-schema-for-a-fitness-tracking-application) -- General schema patterns
- [GeeksforGeeks Fitness DB Design](https://www.geeksforgeeks.org/dbms/how-to-design-a-database-for-health-and-fitness-tracking-applications/) -- General schema patterns
- [Fitness app UX design principles (Stormotion)](https://stormotion.io/blog/fitness-app-ux/) -- UX reference
- [SWR cache documentation](https://swr.vercel.app/docs/advanced/cache) -- Cache strategy reference

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
