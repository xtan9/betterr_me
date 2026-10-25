# Train measurement modes and units

Backend companion to [mobile #416](https://github.com/xtan9/betterr_me_mobile/issues/416).
The same authenticated protocol-1 completion endpoint and stable create receipt
accept immutable completion v1 and v2 documents. Existing queued v1 bytes and
receipts are never rewritten.

## One recorded authority

`native_completion` remains v1-only. `recorded_completion` stores v2 and future
explicitly supported formats. Both NULL means legacy; two populated columns are
invalid. Readers select once and never fall back from an unknown or malformed
selected document. Web history keeps an unsupported record in its original page
position with an unavailable message, no invented zero metrics, and no interpreted
exercise details. Assistant reads return a clear unsupported result; previous-set suggestions, analytics
and save-as-routine do not guess its meaning.

The shared reader validates identity, owner, timestamps, recorded day, version,
definitions, performed branches and child identities. Valid captured bilingual
names, equipment, modes and conventions remain authoritative after live renames.
The original document and normalized IDs remain available; the live definition is
kept separately. SQL enforces the immutable projection across direct table grants
as well as the native RPC. Deleting an accepted workout leaves its independent
create receipt; retry cannot recreate it, including as a legacy draft.

The generic column permits the old #415 native reader to continue reading v1 and
legacy rows without trying to decode a v2 document as v1. That old reader sees v2
through its normalized legacy path and therefore cannot promise captured-name or
convention semantics. The updated reader uses v2's authority. The coordinated frozen-old-reader proof passed against real bearer/RLS reads: mixed legacy/v1/v2 pagination, exact normalized values, rename behavior and no download enqueue. It does not establish support for opening a v2 local SQLite database with an old binary.

## Performed facts

Each v2 performed set has its own UUID, `mode`, and `kind` (`working` or `warmup`).
Only the fields for that mode are accepted:

| Mode | Recorded measurements | Normalized projection | Convention |
| --- | --- | --- | --- |
| `weight_reps` | `weightKg`, `reps` | `weight_kg`, `reps` | Total including bar, per dumbbell, or selected machine/cable load |
| `bodyweight_reps` | `reps` | Weight NULL, `reps` | Repetitions; no invented bodyweight |
| `weighted_bodyweight` | `addedWeightKg`, `reps` | `weight_kg`, `reps` | Added load only |
| `assisted_bodyweight` | `assistanceKg`, `reps` | `weight_kg`, `reps` | Positive assistance; zero is valid |
| `duration` | `durationSeconds` | Weight/reps NULL, `duration_seconds` | Manual elapsed seconds |

Loads are finite nonnegative JS numbers, reps are positive safe integers, and
manual durations are whole seconds from 1 through 86,400. The workout's elapsed
duration is a separate fact. Distance, RPE, rest and entry notes remain unknown
NULL in native projections. No timer or rest workflow is introduced. Assistance
is retained as a fact but contributes neither lifted-load volume nor weight/volume
personal records; repetitions remain readable.

New or changed completed Web sets obey the same required measurements for these
five modes. Drafts may remain incomplete. The existing active-workout commands
return a typed `measurements` error (HTTP 400) rather than marking a blank set
performed. A database trigger also covers direct grants. Untouched historical
zero/null/negative facts and the three deferred legacy modes remain unchanged;
metadata edits do not retroactively reinterpret them. Save-as-routine keeps its
existing representative-normal-set rule: warmup-only history does not invent a
working target. All eight legacy modes and their fields remain readable.

## Input and unit semantics

One pound equals exactly `0.45359237` kg. The shared literal contract is
`tests/fixtures/train-measurement-contract.json`. Loads use complete decimal text
(up to 128 characters), including `.5`, leading zeroes and optional exponent.
Signs, surrounding whitespace, unfinished `12.`, nonzero underflow and overflow
are rejected. Reps/duration use whole decimal digits; their leading zeroes are
valid and exponent notation is not. Accepted canonical numbers round only once to
the final JS number: `0.123` kg stays exact, 1 lb becomes `0.45359237` kg and 2.5 lb
becomes `1.133980925` kg.

Web editors retain raw text, its input unit, and the last accepted canonical
anchor. Unit switching formats from that anchor; untouched generated text never
writes back. Unfinished input remains visibly in its original unit. Complete
waits for pending writes, and a failed write requires a successful retry before
performing the set. Readouts use faithful decimal text, including tiny/large
values; charts retain finite numeric aggregates or show unavailable values.

## Verification and rollout

- Actual constrained SQL tests rejected v2 before implementation, then proved all
  five projections, 22 keys, exact values, invalid branches, direct immutability,
  retained receipts, and new Web completed-set validation.
- A separately created database applies historical fitness DDL, all intervening
  fitness migrations, 415 and 416. It preserves eight legacy modes, custom IDs,
  10,032 sets, null/deferred fields and an accepted v1 document/receipt. Only the
  six intended key assignments (and their existing update timestamps) and four
  new public definitions differ.
- `scripts/e2e/run-train-completion.mjs` uses real local Auth/PostgREST, native
  bearer, cookie Web and scoped MCP. It checks v1/v2 retries, extreme numbers,
  exclusive snapshots, exact five-mode routine reuse, authoritative Web errors,
  ownership and captured names through a real preset rename. Cleanup restores
  exact preset metadata and removes only generated accounts/records/credentials.
- The Chromium completion journey exercises actual Settings unit changes,
  untouched `0.123` kg round trips, authored 1 lb, empty-finish rejection and
  explicit performed-set completion before reopening history.

Deploy the additive migration and compatible readers before enabling v2 writers.
The account-wide Web active-workout index and existing auth/permission checks are
unchanged. No direct production mutation is part of implementation. Native UI,
real disk and frozen #415 reader acceptance are coordinated in the mobile PR;
backend unit/build checks alone do not establish those gates.

Coordinated authenticated proof passed 12 cases on 2026-10-25: five-mode mobile
upload, unchanged #415 reader/renderer, process interruption/retry, old v1 worker
upload followed by current upgrade/unit change/retry, owner and fresh-install
isolation, 30 mixed legacy/v1/v2 rows over two pages with tied timestamps, captured
versus live names after a preset rename, and owned delete/retry returning the
original receipt without resurrection. The initial pagination run exposed a
missing legacy control fixture; adding an ordinary owned legacy completion
resolved that test setup gap without changing guards. Exact preset metadata was
restored; generated users, sessions, fitness rows and temporary credentials were
removed. Native Form/gesture/appearance acceptance is still a separate mobile gate.

Final local backend validation: 501 Vitest suites / 6,305 tests passed (21
explicit live/integration skips); all 84 SQL fixtures passed without residue;
TypeScript and delivery-write inventory passed. ESLint had zero errors and four
pre-existing unrelated warnings. Chromium authentication, preference presentation
and full exact-unit/performed-completion journeys passed (3 tests). Security
advisors found no Train issue; five unrelated pre-existing warnings remain.
`fitness_private` database lint is clean. Whole-public-schema lint still reports
the pre-existing `increment_goal_current_cents` reference to removed
`savings_goals`; this change does not modify that finance function.
