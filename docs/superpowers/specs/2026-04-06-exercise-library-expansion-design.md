# Exercise Library Expansion

**Date:** 2026-04-06
**Status:** Draft
**Scope:** Expand from 92 → ~400 preset exercises with self-hosted GIFs

## Problem

BetterR.Me ships 92 preset exercises. Competing apps (Hevy: 400+, Strong: 200-300+) offer significantly larger libraries with animated GIFs for every exercise. The current ExerciseDB sync matched only 9 of 92 exercises, and GIFs are served from an external CDN (v2.exercisedb.io) — creating a runtime dependency on a third-party service.

## Goals

1. Expand preset exercise library to ~400 exercises (Hevy-level)
2. Every exercise has a self-hosted animated GIF in Supabase Storage
3. Preserve all existing user data (workout history, routines, personal records)
4. No runtime dependency on external APIs — GIFs served from our own storage

## Non-Goals

- User-uploaded exercise media (custom exercise images/videos)
- HD video demonstrations (GIFs are sufficient)
- Exercise instructions/form tips in the UI (just images for now)
- Exceeding Supabase free tier storage (1GB)

## Architecture

### Data Pipeline

```
Hevy's ~400 exercises (reference — which exercises to include)
        ↓ identify & curate
ExerciseDB API (1300+ exercises with GIFs)
        ↓ match by name + muscle + equipment
exercise-catalog.json (static mapping file in repo)
        ↓ sync admin tool reads mapping
exercises table + exercise_media (upsert rows)
        ↓ download GIF for each matched exercise
Supabase Storage bucket "exercise-gifs" (self-hosted GIFs)
```

### Static Mapping File

**File:** `lib/exercisedb/exercise-catalog.json`

A curated JSON file committed to the repo. Each entry maps an exercise to its ExerciseDB counterpart:

```json
[
  {
    "name": "Barbell Bench Press",
    "muscle_group_primary": "chest",
    "muscle_groups_secondary": ["triceps", "shoulders"],
    "equipment": "barbell",
    "exercise_type": "weight_reps",
    "exercisedb_id": "0025",
    "exercisedb_name": "barbell bench press"
  }
]
```

This file is the single source of truth for what exercises exist in the app. It is:
- Version-controlled and reviewable
- Independent of any API at runtime
- The input to the admin sync tool

**Creation process:** Research Hevy's exercise list to identify ~400 exercises. For each, find the matching ExerciseDB entry (by name + muscle group + equipment). Exercises without an ExerciseDB match are included without an `exercisedb_id` (they won't get a GIF).

### Migration Strategy

The sync tool handles migration of existing 92 presets:

1. **Fuzzy-match** each of the 92 existing presets to the catalog by name + muscle group + equipment
2. **Matched exercises** (~80-90): UPDATE in-place — same UUID preserved. Update fields if the catalog has better data (e.g., add missing secondary muscles). All foreign keys (workout_exercises, routine_exercises) remain valid.
3. **Unmatched exercises** (2-10 edge cases): Keep as-is in the database. They remain in the library but may not get a GIF if no ExerciseDB match exists.
4. **New exercises** (~300): INSERT with new UUIDs, `user_id = NULL`, `is_custom = false`.

No schema changes to the `exercises` table. No foreign key changes. No user data loss.

### GIF Storage

**Supabase Storage bucket:** `exercise-gifs` (public read, authenticated write)

During sync, for each exercise with an `exercisedb_id`:
1. Download GIF from `https://v2.exercisedb.io/image/{exercisedb_id}`
2. Upload to Supabase Storage: `exercise-gifs/{exercisedb_id}.gif`
3. Store the Supabase Storage public URL in `exercise_media.gif_url` and `thumbnail_url`

**Storage estimate:** 400 GIFs × 200-500KB average = 80-200MB. Well within the 1GB Supabase free tier.

**URL format:** `{SUPABASE_URL}/storage/v1/object/public/exercise-gifs/{exercisedb_id}.gif`

### Admin Sync Tool Changes

**Location:** `/dashboard/admin` (existing admin page)

The existing "Exercise Media Sync" card is upgraded:

**New sync flow:**
1. Read `exercise-catalog.json` from the codebase (not an API call)
2. For each catalog entry:
   a. Match to existing exercise by name (fuzzy) or insert new
   b. If `exercisedb_id` exists: download GIF from ExerciseDB API, upload to Supabase Storage
   c. Upsert `exercise_media` row with local Supabase Storage URL
3. Report results

**UI changes:**
- Progress indicator: "Syncing 45/400..." (GIF downloads are slow)
- Stats display: "400 exercises, 380 with GIFs, 20 unmatched"
- Dry run toggle preserved
- Error handling for individual GIF download failures (skip and continue)

**API changes to `POST /api/admin/sync-exercise-media`:**
- Read catalog from `exercise-catalog.json` instead of relying solely on fuzzy matching
- Download GIFs and upload to Supabase Storage
- Accept optional `threshold` for fuzzy matching existing exercises to catalog entries
- Return progress-friendly response (or use streaming for real-time progress)

### ExerciseDB API Usage

**When:** Only during admin sync (not at runtime)
**What:** Fetch exercise data + download GIF images
**Rate limiting:** ExerciseDB RapidAPI free tier allows 100 requests/day. For ~400 GIF downloads, the sync must be resumable — track which GIFs are already downloaded and skip them on re-run. Run the sync across 4-5 days, or temporarily upgrade to the Basic tier ($10/month, 10,000 requests) for a one-time bulk download, then cancel.
**Caching:** Once a GIF is downloaded to Supabase Storage, it never needs to be fetched again. Re-syncing only downloads missing GIFs.

### What Doesn't Change

- `exercises` table schema — no column changes
- `exercise_media` table schema — no column changes (just different URL values)
- Exercise picker UI — already renders thumbnails from `exercise_media.gif_url`
- Custom exercises — unaffected, remain user-scoped
- RLS policies — unchanged
- ExercisesDB class — unchanged (already JOINs exercise_media)

## Files Changed

| File | Change |
|------|--------|
| `lib/exercisedb/exercise-catalog.json` | NEW — static mapping of ~400 exercises to ExerciseDB IDs |
| `lib/exercisedb/catalog-builder.ts` | NEW — script/utility to build the catalog from Hevy reference + ExerciseDB matching |
| `app/api/admin/sync-exercise-media/route.ts` | EDIT — read catalog, download GIFs, upload to Supabase Storage |
| `components/admin/admin-dashboard-content.tsx` | EDIT — progress indicator for GIF downloads |
| `lib/exercisedb/client.ts` | EDIT — add method to download GIF binary |
| `lib/supabase/storage.ts` | NEW — utility for uploading to Supabase Storage bucket |

## Testing

| Test | What it verifies |
|------|-----------------|
| `tests/lib/exercisedb/catalog-builder.test.ts` | Catalog JSON is valid, all entries have required fields |
| `tests/app/api/admin/sync-exercise-media.test.ts` | Updated: catalog-based sync, GIF download + upload flow |
| `tests/lib/supabase/storage.test.ts` | Upload utility works, handles errors |
| Manual: Run sync from admin dashboard | End-to-end: exercises populated, GIFs visible in exercise picker |

## Implementation Order

1. **Build exercise-catalog.json** — Research Hevy's list, match to ExerciseDB, produce the mapping file
2. **Supabase Storage setup** — Create bucket, write upload utility
3. **Update sync endpoint** — Catalog-based sync with GIF download + upload
4. **Update admin UI** — Progress indicator
5. **Run sync** — Populate the database
6. **Verify** — Check exercise picker shows GIFs

Step 1 is the biggest effort (curation). Steps 2-4 are straightforward code. Step 5 is operational.

## Open Questions

None — all decisions captured above.
