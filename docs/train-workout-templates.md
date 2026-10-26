# Saved workout templates

Backend companion to [mobile #419](https://github.com/xtan9/betterr_me_mobile/issues/419).
Templates are editable plans. Starting one copies its targets into an independent
workout; it does not complete a set or modify the source template. The expansion
and compatible Web/Assistant release keep `templates.ready` false. A separately
reviewed contract migration follows verification of the deployed adapters.

## Content and references

Existing `routines` and `routine_exercises` IDs remain the template and entry
identities. Ordered private target rows carry stable IDs, working/warm-up kind,
and the four existing measurement fields. Reads project numeric values with SQL
`::text` before JavaScript can round them. NULL, zero, inactive fields and all
eight legacy modes remain inspectable. Each legacy entry retains its original
count, measurements and sort order as evidence; current array order is separate.

A legacy count from 1 through 20 materializes that many identical working
targets once. Unknown or invalid counts remain unresolved until explicitly
replaced. Metadata changes and reordering do not validate or rewrite untouched
legacy measurements. New or changed fields use the existing finite-load,
safe-integer repetition, duration, distance and rest bounds. An empty template
is valid; a supported zero or blank target starts as unfinished input.

Template content has one positive bigint version, encoded as a decimal string.
One SQL authority advances it for parent, entry and target content changes,
including interim legacy writes. A command's final version is greater than its
expected version; it is not necessarily exactly one greater. Usage timestamps
and current definition metadata are separate authorities.

Definition reads retain real exercise UUIDs. Keyed presets, unkeyed legacy
presets, owned custom definitions and unavailable references have explicit
branches. A deployed preset has one actual name, so its captured locale slots
both contain that name. A current custom rename does not change template
content's version or rewrite a prior workout's captured definition. Archived
templates disappear from the Active filter but remain explicitly readable and
startable when their references and targets are usable. New exercise selection
excludes archived definitions.

## Commands, Web and Assistant

Bearer routes live under `/api/mobile/train/templates`; cookie routes under
`/api/routines/templates`. Both expose capabilities, paged list/detail, paged
definition selection and `commands`. Lists use stable UUID cursors with at most
100 rows. Cookie writes require the captured `X-Train-Owner`; SQL derives
ownership from the authenticated principal.

Protocol 1 commands create, narrowly edit, archive, restore, or save a workout
as a new template. An owner/operation lock retains the exact first accepted
receipt or definitive rejection. A changed request under that operation ID is
a conflict. Network, authentication, rollout and availability failures leave
the original request uncertain. The Web journal writes the frozen request
before sending, retains it across remounts, and atomically records a reviewed
replacement with its predecessor. Only HTTP 200 carries acceptance; definitive
rejection requires the matching 404, 409 or 422 envelope. Old first receipts do
not replace current content read from the server.

The continuing Web editor uses ordered per-set content, exact unit-aware load
inputs, retained conflict review, and archive/restore. It supports all eight
existing Web measurement modes. The existing Start endpoint and the trusted
Assistant Start path copy current targets under the authoritative transaction,
preserving the account-wide Web active-workout constraint. The Assistant's
routine reader uses an owner-checked fixed service bridge; arbitrary callers
cannot choose another principal or a generic privileged RPC.

After cutover, stale aggregate CRUD/read routes return `409 refresh_required`.
They cannot flatten new targets or silently write around the command boundary.
Before cutover, those routes retain their existing behavior.

Save as Routine remains the existing representative conversion: completed
working sets when present, otherwise working sets; one representative tuple is
repeated for that count. It does not copy every recorded set separately. The
current UI explains this before saving. The server captures generated IDs and
conversion results once in the first acceptance transaction. Its narrow legacy
copy exception preserves representative zero repetitions or duration as
unfinished targets. Captured recording meaning is checked before conversion;
later live-definition changes cannot silently reinterpret recorded measures.

## Completion v4

Completion protocol 1 and v1–v3 bytes/first receipts stay unchanged. v4 uses the
exclusive `recorded_completion` column and adds the full `templateOrigin`:
ordered source content, definitions actually copied, and source-to-initial
workout entry/set bindings. Removing or leaving an initial set unfinished does
not erase it from that origin. Added workout sets need no source binding.

SQL validates ownership, reference visibility, full origin shape and binding
consistency. v4 alone projects the owned template ID to `workouts.routine_id`;
older completion versions retain their existing NULL rule. Web and Assistant
read the captured document once and retain normalized IDs. Deleting an owned
workout does not erase its first create receipt, so a delayed retry cannot
resurrect it. Profile erasure removes linked workouts, templates and outcomes.

## Release and evidence

1. **A:** additive schema, content revision authority and private target storage;
   existing routines remain unchanged and template readiness is false.
2. **B:** deploy the shared readers, Start adapter, command-aware Web UI and
   Assistant adapters. Verify the exact production alias and real cookie
   workflows while the gate remains false.
3. **C:** separately reviewed migration locks parent/entry tables, materializes
   legacy targets once, enables readiness and revokes ordinary content DML.
   Usage-only updates remain available. No client-controlled bypass is added.

`20261026001702_train_workout_templates_expand.sql` follows the released #418 C
migration `20261025234112`. The isolated historical rehearsal applies exact
#418 C before #419 A and exact C migration
`20261026010107_train_workout_templates_enable.sql`. All ten legacy/current
record tables, original fields/timestamps, expanded parent versions and first
receipts remain unchanged; eight legacy entries become sixteen exact ordered
targets. Replaying C preserves the generated target identities. Ordinary content
writes fail, while an authenticated usage-only update succeeds without changing
the content revision. No shared reset or migration-history repair is part of
this verification.

The registered rollback fixture runs on either side of C. Before activation it
checks the closed gate and historical materialization; after activation it
constructs only its two owned synthetic historical entry sidecars, then runs the
same authenticated command/read/Start assertions. It never resets the current
template gate or rematerializes unrelated templates.

The rollback SQL fixture covers per-set identity/order, raw NULL/zero/deferred
facts, version/CAS outcomes, concurrent-safe first receipts, owned references,
eight-mode continuing starts, trusted-claim restoration, v4 partial completion,
captured-meaning conversion and linked profile erasure. Focused request/journal
tests cover malformed responses, uncertainty and storage failure.

`scripts/e2e/run-train-templates.mjs` accepts only the verified loopback Supabase
stack. Its authenticated run exercises bearer, cookie and scoped MCP requests,
real first outcomes, per-set starts, v4 readback and delete/retry. It restores
the exact original flags, grants and materialization, removes only generated
accounts/rows, and deletes private credentials. `--hold` supplies a mode-0600
short-lived credential file for coordinated mobile process/crash verification.
Credentials are never printed. `--browser` adds the actual Chromium editor,
conflict review, archive/restore, Start and representative conversion journeys.

At runtime `37e17341`, three authenticated HTTP groups and six browser groups
passed. The browser covered heterogeneous target order, duplicate exercise IDs
with distinct entry IDs, untouched legacy zero, lost-response/remount retry,
reviewed conflict replacement, archive/restore, explicit completion after an
unfinished Start, and the conversion disclosure/exact retry. Its first attempt
timed out on the initial session/loading skeleton before any template request;
the screenshot/log are retained. A bounded diagnostic repeat passed with no
runtime change, so this is not evidence of an authentication fix.

The coordinated real-mobile proof passed seven groups against that same server:
before-send/after-response/local-commit process death, discovery fencing,
two-installation CAS review, foreign-token isolation, offline Start with raw
zero/blank/unknown-rest facts, later edit/archive independence, full omitted-target
v4 origin upload/readback, fresh-owner cache separation, ended-start retention,
and preservation of the unrelated Web active workout. Both runs removed their
generated records and credentials and restored the original database state.

The full unit run passed 6,376 tests and found two missing source-inventory
registrations. Those registrations were corrected and all 46 affected tests
passed; TypeScript, mutation-boundary checks and ESLint passed with four existing
warnings. Nine affected SQL fixture groups pass under #418 C. Their final replay
found and fixed the older trusted MCP routine-Start path's missing EXECUTE grant
on the owner-checked capability reader. That grant-only migration delta does not
change the recorded HTTP document or request contract. Hosted gates, independent
review, native UAT and staged production activation remain delivery gates.
