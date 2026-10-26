# Prior actual results and deliberate reuse

This backend slice supports mobile issue [#420](https://github.com/xtan9/betterr_me_mobile/issues/420).
It adds a shared prior-result reader and the continuing Web picker. The native
source-template update uses the existing template command/version contract;
this change does not introduce a new completion format, migration, automatic
progression rule, or Assistant mutation.

## Read authority

`POST /api/mobile/train/prior-results` authenticates a captured native bearer.
`POST /api/workouts/prior-results` authenticates the current Web cookie. Both
validate the request owner against the authenticated principal and use the same
owner-scoped reader. Responses are not cached. The request includes a stable
catalog/custom/preset identity, captured mode, equipment and convention, optional
excluded workout ID, and an optional exact `(startedAt, id)` cursor. Names are
not matching keys. Archived owned references remain readable.

The reader scans twenty completed parent workouts and one lookahead, ordered by
`started_at DESC, id DESC`. It retains the raw Postgres timestamp, including
microseconds, in the cursor. It never treats a page of ineligible exercise rows
as the end of history. `observedWorkoutIds` identifies every inspected parent so
mobile can let remote identity supersede a same-ID local copy even when its
remote measurements are not reusable.

A result requires the exclusive validated v1, v2, v3 or v4 capture, consistent
normalized parent/child IDs, visible exercise references and explicitly completed
normalized sets. Only matching known captured measurement meanings qualify.
Legacy unknown conventions and unsupported documents remain readable through
existing history but cannot authorize reuse. The first eligible parent supplies
all matching duplicate exercise entries in their original order, with every
performed set's stable ID and warm-up/working classification. V1 is projected to
the existing typed weight/reps branch without rewriting its stored document.

The states are `found`, `searching`, `exhausted` and `unavailable`. Only the actual
end of parent pagination is `exhausted`. Authenticated read failures produce
503 with `unavailable/service_unavailable`; a saved reference is retained for
retry. Invalid requests and owner mismatch do not read history. Error logs use
bounded classifications rather than credentials or workout documents.

## Continuing Web

The active workout response carries the typed request/page alongside the
unchanged bounded legacy `previousSets` display. A picker shows source day,
captured name, separate duplicate occurrences and source set classification.
Opening, searching or refreshing it does not modify the workout.

“Use these measurements” copies only applicable measurements to the selected
unfinished set and waits for its accepted write. It preserves the target's type,
count, order, rest setting and completion state. It uses the canonical kilogram
anchor rather than reparsing a converted display. A failed read preserves a
known reference; a failed write preserves inputs and keeps the picker available
for an explicit retry. There is no index pairing, automatic load increase, or
implicit template update.

## Verification

Principal request tests run the real native/cookie authentication adapters,
validation and reader with only the external Auth/PostgREST boundary controlled.
They cover scoped queries, all five performed branches, duplicate groups,
renamed captures, more than twenty ineligible parents, exact cursor fractions,
malformed/unsupported documents, foreign references and unavailable outcomes.
The real WorkoutLogger/SWR/provider workflow controls only network responses and
proves explicit reuse, rejected writes, retry, stored canonical values and
unchanged classification/rest/completion.

The complete candidate unit run passed 513 suites and 6,397 tests, with 21
intentional integration/live skips. TypeScript and scoped ESLint passed.

Run the authenticated loopback and Chromium proof with the existing isolated
runner:

```sh
SUPABASE_CLI=/path/to/pinned/supabase node scripts/e2e/run-train-templates.mjs --prior-results
```

It refuses remote targets and ambient local environment files, uses generated
accounts, and restores the original rollout flags, grants and materialization.
All owned rows and private credentials are removed. The reader extension checks
v1–v4 snapshots, exact microsecond paging beyond twenty legacy parents, duplicate
entries, renamed archived custom references, and actual browser copy/failure/retry.
The browser uses the established completion journey's reload after blank Start
for persisted readback. Initial loading and pre-existing empty-cache failures
are retained separately; no authentication or cache fix is claimed here.

Native acceptance, coordinated mobile disk/HTTP evidence, independent reviews
and dependency-ordered production delivery are separate gates and remain pending
at this backend candidate stage.
