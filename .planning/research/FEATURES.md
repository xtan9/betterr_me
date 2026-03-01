# Feature Landscape

**Domain:** Hevy-inspired workout tracking integrated into existing habit/task management app (web-only, single-user)
**Researched:** 2026-02-23
**Overall confidence:** MEDIUM-HIGH

## Context: What Exists Today

BetterR.Me is a habit tracking and task management web app with:
- **Habits:** daily/weekdays/weekly/times_per_week/custom frequency, streaks, milestones, weekly insights
- **Tasks:** Work/Personal sections, named projects, 4-column kanban boards, drag-and-drop
- **Dashboard:** habit completion, task counts, motivation messages
- **Settings:** profile (full_name, avatar), preferences (week_start_day, theme, date_format), data export
- **Categories:** user-defined categories with color and icon, seeded with 12 defaults
- **Tech:** Next.js 16 App Router, Supabase, SWR, shadcn/ui, Tailwind CSS 3, three locales (en, zh, zh-TW)

The v4.0 milestone adds: Hevy-inspired workout logging, exercise library with presets and custom exercises, routine templates, progression charts, personal records, rest timer, and kg/lbs preference.

---

## Table Stakes

Features users expect from ANY app that calls itself a "workout tracker." Missing any of these would make the feature feel broken, half-baked, or unusable for someone who has used Hevy, Strong, or FitNotes.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Start/finish a workout session** | The fundamental interaction. Users tap "Start Workout," log exercises and sets, then finish. The session must have a start time, end time, and elapsed duration. Every competitor has this flow. | Medium | New `workouts` table, workout session state management (SWR or React state) | Hevy shows a floating bar when workout is active. For web, use a sticky banner or dedicated page route. Session persists in DB (not just client state) so refreshes don't lose data. |
| **Exercise library with preset exercises** | Users should not have to manually create "Bench Press" or "Squat." Hevy ships 400+ exercises; Strong has 300+. A curated set of 80-120 common exercises covering major movements is the minimum. | Medium | New `exercises` table (system-seeded rows with `is_custom=false`), seed migration | Each exercise needs: name, primary muscle group, secondary muscle groups, equipment type, exercise type (determines tracking fields). Organize by muscle group for browsing. |
| **Custom user exercises** | Users always have exercises not in the preset library (unique machine at their gym, a variation they invented). Hevy and Strong both support custom exercises. | Low | `exercises` table with `user_id` (null for presets, set for custom) | Custom exercises need: name, primary muscle group, equipment, exercise type. No animations or images needed for custom -- just metadata. |
| **Exercise search and selection** | During a workout, users add exercises by searching a library. Must be fast -- users are mid-workout and sweaty. Searching by name ("bench") and filtering by muscle group ("chest") are the two standard patterns. | Low | Exercise library query with text search + muscle group filter | Hevy uses a searchable list with muscle group tabs. This is the established UX pattern. Do not use a dropdown select for 100+ exercises -- use a full-screen modal or slide-over with search. |
| **Set tracking: weight + reps** | The core data entry for resistance training. User enters weight and reps per set, then marks it complete. This is the primary tracking mode for ~80% of exercises (barbell, dumbbell, machine). | Low | New `workout_sets` table with `weight_kg`, `reps` fields | Hevy auto-fills previous workout values for each set. This is table stakes -- without it, users manually re-enter weights every session. Show previous values alongside input fields. |
| **Set tracking: bodyweight + reps** | Pull-ups, push-ups, dips -- bodyweight exercises need reps only (no weight input). Users track reps per set. Some apps allow adding extra weight (weighted pull-ups) as optional. | Low | `workout_sets` with `reps` field, weight field optional/null for bodyweight type | Exercise type determines which input fields appear. Bodyweight type shows reps only. Optional "+weight" field for weighted bodyweight movements. |
| **Set tracking: duration** | Planks, wall sits, dead hangs -- exercises measured in seconds/minutes, not reps. Must support duration-based input. | Low | `workout_sets` with `duration_seconds` field | Show a mm:ss input or seconds input. Less common than weight+reps but missing this makes core exercises untrackable. |
| **Previous workout values (auto-fill)** | When logging Bench Press, show what you did last time (e.g., "3x8 @ 80kg"). Seeing previous performance is table stakes according to every competitor review. Auto-fill (pre-populate input fields) reduces friction dramatically. | Medium | Query last completed workout containing the same exercise, populate set inputs | Hevy shows previous values on the LEFT of each set row. Strong does the same. This is the #1 feature that makes workout logging fast vs. tedious. Without it, logging a set takes 45 seconds instead of 10. |
| **Workout history list** | Users need to see past workouts in reverse chronological order. Each entry shows: date, workout name/title, exercises performed, total volume/sets. | Low | Query `workouts` table ordered by `started_at DESC` | The workouts page shows a scrollable list of past sessions. Tapping opens the full workout detail. |
| **Workout detail view** | View a completed workout: all exercises, all sets with weight/reps, total volume, duration, and any PRs achieved. | Low | Read workout with joined exercises and sets | Standard detail page. Shows the workout exactly as logged. |
| **Routine templates (create + start from)** | Users repeat the same workouts weekly ("Push Day," "Leg Day," "Full Body A"). Routines are workout templates that pre-fill exercises and target sets/reps/weight. Hevy free plan allows 4 routines. | Medium | New `routines` table and `routine_exercises` / `routine_sets` tables | A routine stores: name, ordered list of exercises, each with target sets (number of sets, target reps, target weight). Starting a workout from a routine pre-fills the session. Users can deviate during the workout. |
| **Rest timer** | Auto-starts a countdown when a set is marked complete. Users expect this -- external phone timers are the workaround without it. Hevy, Strong, and FitNotes all have rest timers. | Medium | Client-side timer state, configurable duration per exercise or globally, audio/vibration alert | Timer triggers on set completion. Configurable default (e.g., 90s). Per-exercise override. +15s / -15s quick adjust buttons during countdown. Visual countdown display. Browser notification or sound on completion. |
| **Weight unit preference (kg/lbs)** | Users train in either kg or lbs. Must be selectable in settings. All weight displays and inputs must respect this preference. Hevy and Strong both support this. | Low | Add `weight_unit: 'kg' \| 'lbs'` to `ProfilePreferences`, conversion utility | Store all weights in kg internally (single source of truth). Convert to lbs for display/input when preference is lbs. Conversion: 1 kg = 2.20462 lbs. Round to nearest 0.5 for display. |
| **Workouts page (sidebar navigation)** | A new top-level section in the sidebar alongside Dashboard, Habits, and Tasks. The entry point for all workout features. | Low | New route `/workouts`, sidebar nav item | Follows existing sidebar pattern. Icon: dumbbell. Page shows: "Start Workout" CTA, recent workouts, routines. |

---

## Differentiators

Features that set BetterR.Me apart or add significant value beyond minimum viability. Not strictly expected for launch, but some are high-value and low-effort.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Personal records (PR) detection** | Automatic PR banners when users lift heavier or beat their previous best. Hevy shows live PR notifications mid-workout. Extremely motivating -- bridges workout tracking with BetterR.Me's self-improvement philosophy. | Medium | PR computation logic: compare current set against historical best for same exercise. PR types: max weight, estimated 1RM, max volume (weight x reps), max reps at a given weight. | Hevy tracks 5 PR types: heaviest weight, estimated 1RM, best set volume, best session volume, most reps. Start with max weight + best set volume (the two most meaningful). Show a congratulatory banner inline. |
| **Per-exercise progression chart** | Line chart showing weight/volume over time for a specific exercise. Users tap an exercise in their history and see a graph trending upward. Visual proof of progress. | Medium | Query historical sets for exercise, aggregate by workout date, render chart | Use Recharts via shadcn/ui Chart component. Show: max weight per session, total volume per session. Date range selector (1 month, 3 months, 6 months, all time). |
| **Set type labels** | Mark individual sets as Warm-up, Normal, Drop Set, or Failure. Hevy supports all four. Warm-up sets should be excluded from PR calculations and volume totals. | Low | `set_type` enum field on `workout_sets`: 'normal' \| 'warmup' \| 'drop_set' \| 'failure' | Low implementation cost, high UX value. Users who do drop sets or warm-up sets need this distinction. Default is 'normal'. |
| **Workout title/notes** | Name a workout (defaults to routine name or "Workout on [date]") and add freeform notes. Users jot down how they felt, injuries, or observations. | Low | `title` and `notes` fields on `workouts` table | Low effort, high value for reflection. Aligns with BetterR.Me's self-improvement identity. |
| **Exercise notes (per-exercise in workout)** | Attach a note to a specific exercise within a workout (e.g., "Left shoulder felt tight," "Try wider grip next time"). Hevy supports this. | Low | `notes` field on workout-exercise junction | Distinct from workout-level notes. Per-exercise context is valuable for tracking form cues and issues. |
| **Dashboard integration** | Show recent workout activity on the existing BetterR.Me dashboard -- last workout date, current week's workout count, volume trend. | Low | Dashboard API extends to include workout summary stats | Bridges workouts with the existing dashboard. Users see habits + tasks + workouts in one view. Low effort since dashboard API pattern is established. |

---

## Anti-Features

Features to explicitly NOT build. Either wrong for a web-only personal tool, premature, or scope creep that would delay the core workout logging experience.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Social feed / sharing** | Hevy's social features (posting workouts, following users, leaderboards) are its biggest differentiator but require user profiles, privacy controls, feed algorithms, and moderation. BetterR.Me is explicitly single-user. Building social would change the entire product identity. | Omit completely. No sharing, no public profiles, no feed. |
| **AI workout generation** | Hevy has "HevyGPT" and "Hevy Trainer" for AI-generated workout plans. Requires LLM integration, prompt engineering, workout plan validation, and ongoing AI costs. Premature for v4.0. | Omit. Users create their own routines. |
| **Cardio tracking with distance/pace** | Tracking runs, cycling, and swimming requires distance, pace, route mapping, GPS integration, and different UI paradigms. Web apps cannot access GPS easily. | Support duration-only tracking for cardio exercises (e.g., "30 min treadmill"). Do NOT build distance/pace/route tracking. Users who run seriously use Strava. |
| **Body measurement tracking** | Hevy tracks 15 body measurements (weight, body fat, 14 circumferences) plus progress photos. This is a separate product feature that requires camera integration, photo storage, measurement input UI, and graphing. | Omit for v4.0. Could be a future milestone. |
| **Plate calculator** | Hevy shows which plates to load on the barbell. Requires plate inventory configuration, barbell weight configuration, and a visual plate diagram. | Omit. Users know their plate math. |
| **Video/GIF exercise demonstrations** | Hevy and ExerciseDB provide animated exercise demos. Sourcing, hosting, and licensing exercise videos/GIFs is a content problem, not a code problem. Significant storage and bandwidth costs. | Omit visual demos. Provide text-only exercise names with muscle group tags. |
| **Live Activity / watch integration** | Hevy's Live Activity shows workout status on lock screen and Apple Watch. Web apps cannot access these native platform APIs. | Omit. This is a native-app-only feature. |
| **Workout programs / periodization** | Multi-week structured programs (5/3/1, Starting Strength, nSuns) with automatic weight progression, deload weeks, and percentage-based loading. Requires a program engine, cycle tracking, and complex auto-fill logic. | Support simple routines only. |
| **RPE (Rate of Perceived Exertion) tracking** | Adds another input field per set, RPE-based auto-regulation logic, and RPE charts. Niche feature used by intermediate-advanced lifters. | Omit for v4.0. Could be added later as an optional field. |
| **Superset grouping** | Pair 2-3 exercises to be performed back-to-back (superset/circuit). Adds UI complexity for visual grouping. | Log exercises sequentially. Users can note supersets in exercise notes. |
| **Estimated 1RM as a PR type** | Requires choosing a formula (Epley, Brzycki, Lombardi), explaining the formula to users, and handling edge cases. | Defer to post-v4.0 polish. Track max weight and best set volume as initial PR types. |

---

## Feature Dependencies

```
Weight unit preference (kg/lbs) in ProfilePreferences
    |
    +--> All weight display/input respects unit preference

Exercises table (preset seed + custom user exercises)
    |
    +--> Exercise search/selection UI
    |       |
    |       +--> Add exercise to active workout
    |       |
    |       +--> Add exercise to routine template
    |
    +--> Muscle group metadata (for filtering and future distribution charts)

Workouts table (session: start, end, duration, title, notes)
    |
    +--> Workout exercises junction (ordered list of exercises in a workout)
    |       |
    |       +--> Workout sets (weight, reps, duration, set_type per set per exercise)
    |       |       |
    |       |       +--> Previous workout auto-fill (query last workout with same exercise)
    |       |       |
    |       |       +--> PR detection (compare current set vs historical best)
    |       |       |
    |       |       +--> Set type labels (normal, warmup, drop_set, failure)
    |       |
    |       +--> Exercise notes (per-exercise within workout)
    |
    +--> Rest timer (client-side, triggers on set completion)
    |
    +--> Workout history list
    |       |
    |       +--> Workout detail view
    |
    +--> Per-exercise progression charts (aggregate historical sets)
    |
    +--> Dashboard integration (summary stats from workouts)

Routines table (template: name, exercises with targets)
    |
    +--> Start workout from routine (copy routine into active workout session)
```

**Critical path:** Exercises table (seed) -> Workouts/Sets tables -> Workout logging UI -> Previous value auto-fill -> Routines -> History/Detail views -> PR detection -> Progression charts

**The exercise library must exist first** because workouts, routines, and all tracking features reference exercises.

---

## MVP Recommendation

### Phase 1 -- Database Foundation & Exercise Library
1. Add `weight_unit` to `ProfilePreferences` type and settings UI
2. Create `exercises` table with system-seeded preset exercises (80-120 common exercises)
3. Create `workouts`, `workout_exercises`, `workout_sets` tables
4. Create `routines` table
5. Exercise search/filter API endpoint
6. Seed migration with curated exercise data (name, primary/secondary muscles, equipment, type)

**Rationale:** All subsequent features depend on these tables existing. The exercise library is the foundation.

### Phase 2 -- Workout Logging (Core Loop)
7. "Start Empty Workout" flow: create session, add exercises, log sets (weight+reps / reps only / duration)
8. Set completion (checkbox per set)
9. Previous workout value auto-fill
10. Rest timer (client-side countdown with configurable duration)
11. Finish workout (save, compute duration)
12. Workouts page with sidebar navigation

**Rationale:** This is the core product loop. A user must be able to log a workout end-to-end before any other feature matters.

### Phase 3 -- Routines & Templates
13. Create routine (name, ordered exercises with target sets/reps/weight)
14. Edit and delete routines
15. Start workout from routine (pre-fills session)
16. Routine list on workouts page

**Rationale:** Routines depend on the workout logging flow being stable. Users build routines after they have logged a few workouts and want to repeat them.

### Phase 4 -- History, PRs & Progression
17. Workout history list (reverse chronological)
18. Workout detail view
19. PR detection: max weight per exercise, best set volume (weight x reps)
20. Per-exercise progression chart (weight over time)
21. Dashboard integration (last workout, week workout count)

**Rationale:** Progression tracking requires workout history to exist. PRs are computed from historical data. This is the "payoff" phase where users see their progress.

### Defer to future milestones:
- **Superset grouping:** Visual nicety, not blocking core logging
- **Muscle group distribution chart:** High effort visualization, defer
- **Set type labels (warmup/drop/failure):** Can be added to existing set rows later
- **Estimated 1RM PR type:** Requires formula selection, defer
- **Workout streak tracking:** Reuse habit streak pattern later

---

## Exercise Type Taxonomy

Based on Hevy and competitor analysis, exercises fall into these tracking modes:

| Exercise Type | Input Fields | Examples | Proportion |
|---------------|-------------|----------|------------|
| **Weight + Reps** (`weight_reps`) | weight (kg/lbs), reps | Bench Press, Squat, Deadlift, Rows, Curls | ~75% of exercises |
| **Bodyweight + Reps** (`bodyweight_reps`) | reps (weight optional for weighted variants) | Pull-ups, Push-ups, Dips, Sit-ups | ~15% of exercises |
| **Duration** (`duration`) | seconds/minutes | Plank, Wall Sit, Dead Hang, Stretches | ~10% of exercises |

**Do NOT support** Distance+Duration (cardio with distance tracking) in v4.0. Duration-only covers treadmill/bike logging adequately for a strength-focused tracker.

---

## Muscle Group Taxonomy

Standard 14-group taxonomy covering all major muscle groups:

| Muscle Group | Common Exercises |
|-------------|-----------------|
| Chest | Bench Press, Chest Fly, Push-ups |
| Back | Rows, Lat Pulldown, Deadlift |
| Shoulders | Overhead Press, Lateral Raise, Face Pull |
| Biceps | Barbell Curl, Hammer Curl, Preacher Curl |
| Triceps | Tricep Pushdown, Skull Crushers, Dips |
| Forearms | Wrist Curls, Farmer's Walk |
| Quadriceps | Squat, Leg Press, Lunges, Leg Extension |
| Hamstrings | Romanian Deadlift, Leg Curl, Good Morning |
| Glutes | Hip Thrust, Bulgarian Split Squat, Glute Bridge |
| Calves | Calf Raise (Standing/Seated) |
| Abs | Crunch, Cable Crunch, Ab Wheel |
| Obliques | Russian Twist, Side Plank |
| Traps | Shrugs, Face Pull |
| Lats | Pull-ups, Lat Pulldown, Seated Row |

Each exercise has one **primary** muscle group and zero or more **secondary** muscle groups.

---

## Equipment Taxonomy

| Equipment | Examples |
|-----------|---------|
| Barbell | Bench Press, Squat, Deadlift, Overhead Press |
| Dumbbell | Dumbbell Curl, Dumbbell Fly, Goblet Squat |
| Machine | Leg Press, Lat Pulldown, Cable Crossover |
| Cable | Cable Fly, Tricep Pushdown, Face Pull |
| Bodyweight | Pull-ups, Push-ups, Dips, Planks |
| Kettlebell | Kettlebell Swing, Turkish Get-up |
| Band | Band Pull-apart, Banded Squat |
| Plate | Plate Raise, Plate Pinch |
| Other | Medicine Ball, Foam Roller, TRX |

Equipment is metadata on the exercise, used for filtering. NOT used for tracking logic.

---

## Sources

### Primary Sources (HIGH confidence -- official feature pages)
- [Hevy Feature List](https://www.hevyapp.com/features/)
- [Hevy Tutorial: How to Use Hevy](https://www.hevyapp.com/hevy-tutorial/)
- [Hevy: Custom Exercises](https://www.hevyapp.com/features/custom-exercises/)
- [Hevy: Exercise Library](https://www.hevyapp.com/features/exercise-library/)
- [Hevy: Gym Performance Tracking](https://www.hevyapp.com/features/gym-performance/)
- [Hevy: Workout Settings](https://www.hevyapp.com/features/workout-settings/)

### Exercise Database References (MEDIUM confidence)
- [free-exercise-db (GitHub)](https://github.com/yuhonas/free-exercise-db) -- 800+ exercises, Unlicense, JSON format
- [exercises.json (GitHub)](https://github.com/wrkout/exercises.json) -- Public domain exercise dataset
- [Hevy Exercises Archive](https://www.hevyapp.com/exercises/)
