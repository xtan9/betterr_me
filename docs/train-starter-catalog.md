# Train starter catalog identity

[Mobile #413](https://github.com/xtan9/betterr_me_mobile/issues/413) records an
unfinished workout offline. Native bundled definitions need a portable identity
that resolves to the existing shared catalog when completed synchronization is
added in #415. Seeded exercise UUIDs were generated per database; they cannot be
invented or copied between environments.

`exercises.catalog_key` is nullable and unique. Only built-in rows may have a key. Custom exercises and unselected built-ins retain null. The migration
matches the twelve approved name/equipment/weight-reps tuples exactly, aborts if
any match is missing or ambiguous, and leaves every exercise UUID intact. A
read-only production audit found exactly one row for every tuple. Keys are
versioned meanings: future meaning changes require a new key, not relabeling
historical measurements.

The mapping covers Barbell/Dumbbell Bench Press, Barbell Squat, Deadlift,
Barbell/Dumbbell Row, Overhead Press, Dumbbell Shoulder Press, Machine Chest
Press, Leg Press, Lat Pulldown and Seated Cable Row. Native V1 explicitly records
barbell load including the bar, load per dumbbell, or the selected machine/cable
load. Assigning a catalog key does **not** retroactively establish these
conventions for legacy records.

Existing Web and Assistant reads still use `ExercisesDB.getAllExercises` and
receive the same rows/UUIDs plus an optional field. The public write types do not
accept catalog keys. Existing RLS prevents accounts from modifying presets, and
a database constraint prevents custom rows from claiming a built-in key. This
change adds no synchronization endpoint and changes no authorization grants.

## Validation

- The new constrained SQL fixture failed before migration (missing column), then
  passed with all workouts fixtures after migration. Every fixture rolled back
  or cleaned its exact records; the runner found no schema/data residue.
- A rollback-only migration rehearsal inserted a legacy routine, completed
  workout, zero-set workout, entry and drop set with load/reps/duration/distance
  and RPE. Comparing JSON for all rows of the six fitness tables proved that IDs,
  relationships, measurements and unknown time facts survived. Exercise
  `updated_at` is deliberately excluded because the existing update trigger runs
  while assigning the key; no workout or set timestamp changes.
- Authenticated local bearer reads resolve all twelve bundled keys. Attempts to
  rewrite a preset or assign a key to a custom exercise fail. Existing Web cookie
  catalog/history responses preserve the same UUIDs, modes and raw measurements.
  The cross-repository runner is `scripts/e2e/train-history.mjs` in the mobile PR.
- Local environment difference: the previous planning schema was already present
  in the shared local database, but its migration history was missing. Only this
  catalog migration was applied with `psql --single-transaction`; the planning
  migration was not replayed, and unrelated migration history was not repaired.
  Production's planning migration was separately verified by its deployment.

## Full starter catalog (#416)

The twelve original keys and UUIDs are retained. The additive measurement
migration assigns keys to six existing audited presets: Push-up, Pull-up, Dip,
Bodyweight Squat, Plank and Jump Rope. The first four use bodyweight repetitions;
Plank and Jump Rope use manually entered duration. Four distinct new public
presets receive database-generated UUIDs: Weighted Pull-up, Weighted Dip,
Machine-assisted Pull-up and Machine-assisted Dip. They have separate keys and
recording meanings; weighted variants use bodyweight equipment/added load, while
assisted variants use machine equipment/positive assistance.

The migration requires exactly one matching name/equipment/mode tuple for each
existing preset, fails on ambiguous keys, and never invents cross-environment
UUIDs. The production preflight found all six existing tuples and none of the
four new tuples. No exercise media is introduced. See [measurement semantics and
compatibility](train-measurements.md) for the v2 snapshot and verification.
