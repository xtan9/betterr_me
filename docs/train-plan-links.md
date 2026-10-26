# Training plans, saved workouts and Today

This shared backend implements the contracts for mobile issues
[#422](https://github.com/xtan9/betterr_me_mobile/issues/422),
[#423](https://github.com/xtan9/betterr_me_mobile/issues/423) and
[#424](https://github.com/xtan9/betterr_me_mobile/issues/424).

```text
save completed workout → ordinary immutable upload receipt
                        → separately journaled occurrence association
optional plan check-off → captured versions → existing planner command
                         changed → explicit reviewed replacement
```

A workout has at most one explicit occurrence association. An occurrence can
have several workouts. Matching dates never establish an association. Existing
v1–v4 captures and first upload receipts remain unchanged; their old `planId`
continues to be opaque provenance. A failed association or plan action cannot
roll back the workout or imply fulfillment.

## Plan and template authority

The existing `planner_routine_command` accepts optional `trainingTemplateId`
for training create/edit. Create sets a series default; edit sets an occurrence
override. Omission preserves the current choice, while explicit null defers it.
An archived owned template remains a valid existing reference. The normal
version checks, operation receipts, scheduling commands and Steps Undo remain
authoritative. An editor Undo restores the reference with its title/date/steps,
and conflicts when a subsequent edit changed that snapshot.

`planner_routine_snapshot_v2` retains its existing fields and adds resolved
`occurrence.training_template_id` on training rows. This explicit null takes
precedence over `schedule.training_template_id`, which is only the default.
`TrainingPlan.templateId` exposes the same resolved value. Original
`scheduledDate` and current `plannedDay` are separate. Known timed placement is
retained before completion releases the reservation; unknown historical
placement stays null. Retained occurrences may have null task identity/version.

## Request and read boundaries

All native routes verify a captured bearer principal, use no-store responses,
and compare any request owner to that principal. The SQL functions independently
check `auth.uid()` and occurrence → series → owned training schedule identity.
New link/outcome tables permit owner reads and no ordinary direct writes.
Trusted Assistant detail reads have SELECT only and explicitly filter the owned
workout and joined association; no generic principal impersonation was added.

- `GET /api/mobile/train/plans?date=YYYY-MM-DD&after=UUID` reads up to 100
  current-day occurrences, including moved and fulfilled plans.
- `GET /api/mobile/train/plans/{id}` reads an owned occurrence independently
  of its original date. Only an actual missing record returns 404.
- `GET /api/mobile/train/plans/workouts/{id}` returns the saved workout's
  explicit link, or null. A deleted occurrence keeps its captured association
  identity with null current plan data.
- `POST /api/mobile/train/plans/commands` accepts protocol 1 `link-workout`
  or `fulfill-plan`. A fulfillment captures task/occurrence/event versions and
  the series token. It calls the existing completion preview and planner command
  in the same transaction. Already completed returns no new change ID.
- `POST /api/mobile/train/day` takes owner, persisted day and optional raw
  `(startedAt,id)` cursor. It scans twenty day-matching completed parents and
  one lookahead, preserving microseconds and descending identity order. Responses
  contain exact supported full v1–v4 captures plus their links. Unsupported
  records are isolated without losing the scanned cursor. Unknown legacy days
  are not invented from the viewer's current time zone.

Accepted receipts and definitive rejections are immutable first outcomes under
owner + operation ID. The same bytes return the first outcome even after later
changes. Reusing an operation for different bytes conflicts. Changed plans
return the current owned snapshot and require a new reviewed operation. Missing,
skipped/deleted, already-completed and transient failures stay distinct. An
uncertain transport response supplies no invented acknowledgement. Deleting an
owned workout removes its link; retrying an old accepted request returns its
receipt without recreating either record. Profile erasure cascades owned data.

Continuing cookie and Assistant workout detail includes optional
`trainingPlanLink` metadata. Workout counts/captures remain independent of plan
fulfillment; same-day grouping is a mobile presentation decision.

## Verification and delivery

`supabase/tests/train_plan_links.sql` is a constrained, rollback-only fixture
using actual authenticated planner/template/completion commands. It covers
archived template selection, explicit defer and Undo, stable retries, changed
source/reconfirmation, missing/skipped/deleted plans, transaction failure,
multiple and cross-day associations, exact DST day pagination, foreign access,
direct-write denial and deletion without resurrection. Existing planned-training,
Steps and period-routine fixtures cover the affected command compatibility.

Request tests exercise strict owner/outcome matching, moved occurrence reads,
unknown-vs-failed links, exact captured day documents and sanitized errors.
The one complete unit run had only an omitted native route-inventory entry;
that documented policy was added and its two-test file rerun successfully.
TypeScript, lint of fresh-checkout source and delivery-write inventory pass.
Older ignored reviewer repros are excluded from the local lint evidence, as they
are absent from CI checkouts.

The existing isolated runner adds `--plans` to reuse Auth/HTTP/cleanup setup
without replaying template acceptance groups:

```sh
SUPABASE_CLI=/path/to/pinned/supabase node scripts/e2e/run-train-templates.mjs --plans
```

It verifies actual bearer upload/link/fulfillment/day reads, concurrent first
receipts, cookie and trusted Assistant compatibility, and foreign/direct-write
isolation. Optional `--hold` exposes only generated accounts through a temporary
mode0600 file for the coordinated real SQLite/process-termination proof. Cleanup
removes owned Auth/data/credentials/server and restores exact local flags/grants.
The coordinated mobile proof passed three groups across 29 separate processes;
the separate durable recovery proof passed four groups across 31 processes.

The additive migration was rehearsed in a separate disposable database with a
reconstructed pre-addition schema and historical fixtures. Twelve planner and
fitness relations retained all identities, relationships, raw values, unknowns
and eight legacy modes. Actual role/grant behavior is proved separately by the
constrained SQL and authenticated HTTP paths.

This migration can precede the app deployment: existing callers omit the new
field and keep the original planner path. It does not enable a new completion
format or revoke existing product permissions. Independent review, hosted gates,
coordinated production deployment and mobile/native acceptance remain separate
release gates; this backend document does not claim native UAT completion.
