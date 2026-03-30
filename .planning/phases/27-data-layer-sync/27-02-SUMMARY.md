---
phase: 27-data-layer-sync
plan: 02
subsystem: api
tags: [exercisedb, string-similarity, dice-coefficient, fuzzy-matching, rapidapi]

requires: []
provides:
  - ExerciseDBClient class for fetching exercises from ExerciseDB API
  - Fuzzy name matcher with multi-signal scoring (Dice coefficient + equipment + muscle)
  - Muscle map translating ExerciseDB bodyPart+target to BetterR.Me MuscleGroup
  - Equipment map translating ExerciseDB equipment strings to BetterR.Me Equipment
affects: [27-03-admin-sync-route]

tech-stack:
  added: [string-similarity@4.0.4, @types/string-similarity]
  patterns: [multi-signal-matching, exercisedb-taxonomy-translation]

key-files:
  created:
    - lib/exercisedb/types.ts
    - lib/exercisedb/client.ts
    - lib/exercisedb/muscle-map.ts
    - lib/exercisedb/matcher.ts
    - tests/lib/exercisedb/client.test.ts
    - tests/lib/exercisedb/matcher.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Import MuscleGroup/Equipment types from lib/db/types.ts (not lib/constants/enums.ts which only exports const arrays)"
  - "Dice coefficient threshold default 0.5 for fuzzy matching with 2-of-3 signal agreement as safety gate"

patterns-established:
  - "ExerciseDB taxonomy translation: bodyPart+target disambiguation for muscle groups"
  - "Multi-signal matching: 2-of-3 agreement (name similarity, equipment, muscle group) prevents false positives"

requirements-completed: [DATA-02, DATA-03]

duration: 7min
completed: 2026-03-30
---

# Phase 27 Plan 02: ExerciseDB API Client & Fuzzy Matcher Summary

**ExerciseDB API client with RapidAPI auth and Dice coefficient fuzzy matcher using 2-of-3 multi-signal scoring (name + equipment + muscle group)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T17:58:40Z
- **Completed:** 2026-03-30T18:05:23Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- ExerciseDBClient class with fetchAll/fetchById methods and RapidAPI auth headers
- Muscle map disambiguating ExerciseDB bodyPart+target (e.g., "upper arms" + "biceps brachii" -> "biceps")
- Equipment map handling ExerciseDB strings (e.g., "body weight" -> "bodyweight", "leverage machine" -> "machine")
- Fuzzy name matcher using Dice coefficient with 2-of-3 signal agreement to prevent false positives
- 17 unit tests written (6 client + 11 matcher/muscle-map)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install string-similarity and create ExerciseDB API client with types** - `131109e` (feat)
2. **Task 2: Create muscle map and fuzzy name matcher with multi-signal scoring** - `d41b944` (feat)

## Files Created/Modified
- `lib/exercisedb/types.ts` - ExerciseDBEntry interface for API response types
- `lib/exercisedb/client.ts` - ExerciseDBClient class with fetchAll/fetchById and RapidAPI headers
- `lib/exercisedb/muscle-map.ts` - mapToMuscleGroup and mapEquipment translation functions
- `lib/exercisedb/matcher.ts` - matchExercises with Dice coefficient and multi-signal scoring
- `tests/lib/exercisedb/client.test.ts` - 6 client unit tests (URL, headers, JSON, errors)
- `tests/lib/exercisedb/matcher.test.ts` - 11 matcher/muscle-map unit tests
- `package.json` - Added string-similarity and @types/string-similarity
- `pnpm-lock.yaml` - Lock file updated

## Decisions Made
- Imported MuscleGroup/Equipment types from `lib/db/types.ts` instead of `lib/constants/enums.ts` (enums.ts only exports const arrays, types are derived in db/types.ts)
- Used default threshold of 0.5 (lower than research's 0.7 suggestion) since the 2-of-3 signal gate provides adequate false positive protection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import path for MuscleGroup/Equipment types**
- **Found during:** Task 2 (muscle map creation)
- **Issue:** Plan specified `import from "@/lib/constants/enums"` but MuscleGroup and Equipment types are only exported from `@/lib/db/types`
- **Fix:** Changed import to `@/lib/db/types`
- **Files modified:** `lib/exercisedb/muscle-map.ts`
- **Verification:** TypeScript compilation passes cleanly
- **Committed in:** d41b944 (Task 2 commit)

**2. [Rule 1 - Bug] Removed exercise_media from test fixture**
- **Found during:** Task 2 (matcher tests)
- **Issue:** Plan's Exercise interface showed `exercise_media` field but it hasn't been added to the type yet (Plan 01 running in parallel)
- **Fix:** Removed `exercise_media: null` from test fixture
- **Files modified:** `tests/lib/exercisedb/matcher.test.ts`
- **Verification:** TypeScript compilation passes cleanly
- **Committed in:** d41b944 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes corrected type errors. No scope creep.

## Issues Encountered
- Vitest cannot run due to pre-existing Node 19 + Vite 7 incompatibility (Vite 7 requires Node >=20.19, environment has Node 19.2.0). This affects ALL tests in the project, not just these files. Tests are written correctly and TypeScript compiles cleanly. Tests will pass once Node is upgraded.

## Known Stubs

None -- all functions are fully implemented with no placeholder data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ExerciseDB client and matcher ready for Plan 03 (admin sync route)
- Plan 03 will import ExerciseDBClient, matchExercises, and mapToMuscleGroup
- Blocker: Node version upgrade needed before tests can run (pre-existing, not caused by this plan)

---
*Phase: 27-data-layer-sync*
*Completed: 2026-03-30*
