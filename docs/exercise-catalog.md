# Curated exercise catalog

The catalog contains 400 movement and equipment definitions. The original 96
live presets keep their UUIDs and recording definitions; 304 entries are additive.
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

## Delivery evidence

The catalog and admin HTTP tests cover the 400 identities, preservation of the
96 baseline definitions, distinct similar names, preflight conflicts, and an
additive rerun. Checking in this file does not apply data to the live database.
Live insertion and native artwork acceptance are recorded separately during
delivery. Distance-based definitions retain the mobile client's existing
recording-availability boundary.
