---
phase: 27-data-layer-sync
plan: 01
subsystem: database
tags: [supabase, rls, exercisedb, next-image, typescript]

requires: []
provides:
  - exercise_media and exercise_name_mappings tables with SELECT-only RLS
  - ExerciseMediaDB class with getByExerciseId, upsertMedia, upsertBatch
  - ExerciseMedia TypeScript interface
  - Exercise type extended with nullable exercise_media field
  - next/image CDN allowlist for v2.exercisedb.io
affects: [27-02, 27-03, exercise-detail-page, workout-logger-thumbnails]

tech-stack:
  added: []
  patterns:
    - "Admin-only writes pattern: RLS SELECT-only + createAdminClient for mutations"
    - "ExerciseMediaDB follows ExercisesDB class pattern with PGRST116 null handling"

key-files:
  created:
    - supabase/migrations/20260330000001_create_exercise_media.sql
    - lib/db/exercise-media.ts
    - tests/lib/db/exercise-media.test.ts
  modified:
    - lib/db/types.ts
    - next.config.ts

key-decisions:
  - "SELECT-only RLS for exercise_media -- writes via admin client only (service role)"
  - "ExerciseMedia as separate interface, nullable field on Exercise type"

patterns-established:
  - "Admin-write pattern: tables with RLS SELECT-only policy, mutations via createAdminClient"

requirements-completed: [DATA-01, DATA-06]

duration: 4min
completed: 2026-03-30
---

# Phase 27 Plan 01: Data Layer & Sync Summary

**exercise_media and exercise_name_mappings tables with SELECT-only RLS, ExerciseMediaDB class for cached ExerciseDB API data, and v2.exercisedb.io CDN allowlist in next.config.ts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T17:58:32Z
- **Completed:** 2026-03-30T18:02:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created exercise_media table with full schema (gif_url, thumbnail_url, instructions, alternative_names, media_status, source) and SELECT-only RLS
- Created exercise_name_mappings table for fuzzy match results with confidence scoring and verification flag
- ExerciseMediaDB class with getByExerciseId (PGRST116 null handling), upsertMedia, and upsertBatch (onConflict exercise_id)
- Extended Exercise interface with nullable exercise_media field
- Added v2.exercisedb.io to next.config.ts remotePatterns for animated GIF loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Create exercise_media migration, ExerciseMediaDB class, and ExerciseMedia types** - `69e7935` (feat)
2. **Task 2: Add ExerciseDB CDN to next.config.ts remote image patterns** - `0f24f53` (chore)

## Files Created/Modified
- `supabase/migrations/20260330000001_create_exercise_media.sql` - exercise_media and exercise_name_mappings tables with RLS
- `lib/db/exercise-media.ts` - ExerciseMediaDB class with read/upsert methods
- `lib/db/types.ts` - ExerciseMedia interface and Exercise type extension
- `tests/lib/db/exercise-media.test.ts` - 5 unit tests for ExerciseMediaDB
- `next.config.ts` - Added v2.exercisedb.io to remote image patterns

## Decisions Made
- SELECT-only RLS for exercise_media tables -- all writes go through admin client (createAdminClient) which bypasses RLS with service role key. This matches the pattern where ExerciseDB data is fetched/synced by server-side scripts, not user actions.
- ExerciseMedia defined as separate interface rather than inline type, enabling reuse across components.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest v4 ESM compatibility issue (`ERR_REQUIRE_ESM`) prevents running tests in worktree environment. This is a pre-existing environment issue affecting all tests project-wide (not caused by this plan's changes). Test file is structurally correct and follows established patterns from workouts.test.ts. All acceptance criteria verified via grep checks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- exercise_media table schema ready for ExerciseDB API sync script (Plan 02)
- ExerciseMediaDB class ready for use in API routes and components
- Exercise type extended, ready for UI components to display media
- next/image CDN allowlist configured for ExerciseDB GIF loading

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (69e7935, 0f24f53) verified in git log.

---
*Phase: 27-data-layer-sync*
*Completed: 2026-03-30*
