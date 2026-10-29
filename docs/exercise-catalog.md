# Curated exercise catalog

The catalog contains 410 movement and equipment definitions. The original 96
live presets keep their UUIDs and recording definitions; the first expansion
added 304 entries, and the Hevy coverage audit adds ten more. All previous 400
entries retain their UUIDs and complete definitions.
The old 163-entry target list was a repository artifact, not the live preset count.

`lib/exercisedb/exercise-catalog-provenance.json` records the reconciliation and
first-party factual sources. The selection covers bands, kettlebells, suspension
training, Smith machines, machines, free weights and bodyweight variations.
Hevy advertises more than 400 app exercises; its 124 public exercise articles are
only one source. This catalog is our curated selection, not an export of its app.

## Stable identities and additive sync

Every entry has a reviewed `preset_id`. The admin sync checks the whole catalog
before writing and rejects malformed or duplicate identities, changed definitions
for existing UUIDs, and ambiguous existing matches. It matches the exact name,
equipment and recording mode, with case and surrounding-space normalization.
Similar names never authorize rewriting a previous movement.

Existing global presets remain unchanged. Missing entries use their catalog UUIDs
on insert. Reruns report them as unchanged; the primary key also prevents a second
identity during a concurrent retry. Custom exercises and saved workout/template
history are outside this operation. New entries do not invent catalog keys or
measurement conventions.

The response preserves `updated: 0` for compatibility and adds `unchanged`.
`dryRun` performs no writes. GIF downloading and media synchronization remain an
independent option; original mobile illustrations are bundled by the mobile app.

`scripts/build-exercise-catalog.ts` refreshes URLs only for already reviewed
ExerciseDB IDs. It preserves all definitions and UUIDs and never assigns new
media by fuzzy name matching.

## Hevy coverage additions

Ten movement variants fill gaps identified in imported Hevy exercise names:
weighted back extension, chest-supported dumbbell Y raise, weighted decline
crunch, incline sliding-bench pull-up, Garhammer raise, reverse-grip triceps
pushdown, dumbbell seal row, single-leg dumbbell calf raise, seated machine
triceps extension and a general timed warm-up.

The user confirmed a lying bench/floor Garhammer raise and an incline
sliding-bench pull-up machine. The latter records repetitions; it does not claim
that an incline setting equals counterweight assistance. Warm Up deliberately
remains general. Weighted bodyweight variants record added load separately from
unloaded variants. These are active library definitions for future selection;
imported source exercise IDs, unknown conventions and frozen workout records
are not rewritten or made comparable by this catalog addition.

The mobile catalog uses explicit search aliases for different Hevy wording and
bundles matching original illustrations. No third-party GIF is guessed for these
ten entries, and the catalog sync does not copy or relink imported records.

For this bounded addition, `scripts/maintenance/prepare-hevy-catalog-sync.mjs`
prints SQL without connecting to a database. Run its default `--preflight` output
first. `--apply` prints an atomic transaction that requires the existing 400
identities to match, rejects UUID/definition collisions, and inserts only the ten
missing entries. It compares all preexisting exercise rows and hashes related
workout, template, import and history rows before and after insertion. Any
unexpected change rolls back the transaction; an identical rerun inserts zero.
A five-second lock timeout and thirty-second statement timeout bound the work.
The generator deliberately refuses a catalog other than the reviewed 400 + 10.

```sh
node scripts/maintenance/prepare-hevy-catalog-sync.mjs --preflight > preflight.sql
node scripts/maintenance/prepare-hevy-catalog-sync.mjs --apply > apply.sql
```

Execute the reviewed SQL only after the matching mobile artwork passes native
acceptance. These files are maintenance input, not automatically run migrations.

## Delivery evidence

The catalog and admin HTTP tests cover the 410 identities, preservation of the
96 baseline definitions, distinct similar names, preflight conflicts, and an
additive rerun. Checking in this file does not apply data to the live database.
Live insertion and native artwork acceptance are recorded separately during
delivery. Distance-based definitions retain the mobile client's existing
recording-availability boundary.
