# Recurring Task Series compatibility execution design

Status: design accepted; implementation complete

This document resolves architecture-review Candidate 3, "Deepen Recurring
Task Series compatibility execution." The candidate is accepted in a narrower
form than the review proposed. HTTP and AI already share command-value mapping,
failure text, and legacy response projection through
`lib/recurring-tasks/compatibility.ts`; the remaining locality problem is the
repeated execution mechanics around by-ID Series mutations.

The compatibility subpath will execute one explicit canonical mutation intent
through an already-authenticated Series command port. It will select the one
corresponding command, derive the requested coverage range after resume,
invoke the command, and expose the existing typed capability outcome. It will
not interpret HTTP transport state, compose authentication, query a Series to
infer intent, translate failures into a delivery response, or become a second
Recurring Task Lifecycle.

The initial scope is revise, pause, resume, and end. Series creation remains
separate because it uses the collection route, has distinct replay status
semantics, and was not part of the candidate's bounded file set.

## Evidence and correction to the review

The review correctly identifies duplicated execution mechanics, but describes
the duplication too broadly.

Already shared by HTTP and AI:

- legacy creation, revision, and Series-status input mapping;
- canonical command construction;
- failure-message mapping;
- HTTP failure-status mapping; and
- projection of a lifecycle-returned Recurring Task Series into the legacy
  `RecurringTaskResponse` shape.

Actually duplicated or divergent:

- HTTP constructs the resume requested range twice and AI constructs it once;
- HTTP and AI independently dispatch the selected command;
- each delivery adapter has its own success classifier; and
- an omitted effective date currently behaves differently across channels.
  AI substitutes its context's local date and requests coverage through seven
  days after it. HTTP passes no effective date or requested range, leaving the
  lifecycle to choose the date and extend only through an existing Coverage
  Horizon, if any.

The existing parity test covers explicit dates and therefore does not reveal
the omitted-date difference. The design treats that divergence as a
correctness issue to resolve, not behavior to preserve.

## Architectural boundary

The supported recurring-task package remains the only behavior-rich boundary.
The authenticated capability owns Recurring Task Series validation, optimistic
concurrency, idempotency, lifecycle invocation, transactionality, typed
failures, and the lifecycle-returned Series projection. The private lifecycle
and persistence seams remain unchanged.

Compatibility is a delivery-neutral application seam for the two legacy
channels. It may coordinate a single public Series command, but it does not own
the domain transition implemented by that command.

```text
HTTP transport                         AI tool presentation
      |                                        |
      | authenticate and resolve intent/date   |
      +-------------------+--------------------+
                          |
                          v
          Recurring Task Series compatibility execution
          - map one explicit intent
          - derive resume requested range
          - invoke one injected Series command
          - return its typed result unchanged
                          |
                          v
              Authenticated SeriesCommands port
                          |
                          v
              private Recurring Task Lifecycle
```

This refines ADR-0005's requirement that HTTP and AI use shared command
modules. It does not change ADRs 0001-0007. In particular:

- ADR-0001 still makes the lifecycle authoritative for materialized Task
  Occurrences and achieved Coverage Horizon;
- ADR-0002 still defines pause, resume, and end as Series commands;
- ADR-0003 still makes Ended Series terminal and keeps delete/archive language
  at legacy delivery edges;
- ADR-0004 still owns authentication-derived ownership, version checking,
  operation IDs, typed conflict outcomes, and atomic Postgres mutations; and
- ADR-0005 still requires channel-specific translation of typed outcomes and
  forbids callers from inspecting lifecycle internals.

No new ADR is required for this design because it deepens the already accepted
compatibility/command boundary without changing the lifecycle authority or
technology choice. An implementation that needs a new public lifecycle
interface or moves authentication into compatibility would exceed this design
and require a fresh architecture decision.

## Responsibilities

### Compatibility execution owns

- a discriminated, explicit intent for revise, pause, resume, or end;
- translation of that intent into exactly one existing public command;
- resolution of an omitted Series-status effective date from the supplied
  reference local date;
- the requested coverage range after resume;
- invocation of the corresponding injected `SeriesCommands` method; and
- one reusable predicate over the existing mutation-result union for
  identifying a lifecycle success.

### HTTP owns

- cookie authentication and construction of authenticated capabilities;
- query, header, and body parsing and validation;
- legacy `action=pause|resume|end` interpretation;
- legacy desired-status interpretation, including the current `status=active`
  pre-read used to distinguish a Paused, Active, or Ended Series;
- resolution of the person's current reference local date when the request
  supplies no explicit effective date;
- HTTP status codes, JSON envelopes, logging, and unexpected-error handling;
- the legacy `recurring_task` response envelope; and
- legacy DELETE acknowledgement as `{ success: true }`.

The desired-status pre-read remains HTTP-specific because AI exposes explicit
pause, resume, and end tools. Moving that query into compatibility would turn a
transport convention into a second domain command and would make the shared
seam depend on `SeriesQueries` unnecessarily.

### AI owns

- MCP/user authentication and construction of authenticated capabilities;
- tool schema, descriptions, confirmation policy, and parameter validation;
- the tool context's reference local date;
- tool-specific success presentation and error objects; and
- logging or propagation of unexpected failures at the delivery boundary.

### The authenticated capability and lifecycle continue to own

- validation of command invariants;
- authenticated ownership and RLS;
- operation-ID replay and idempotency;
- opaque Series-version decoding and conflicts;
- Active, Paused, and Ended Series transition rules;
- atomic mutation of the Series, Series Revisions, and Task Occurrences;
- actual Coverage materialization and achieved Coverage Horizon; and
- the authoritative `SeriesProjection` returned by a successful command.

## Conceptual contract

The exact exported names may be chosen during implementation, but the contract
shape is fixed by this design.

```ts
type SeriesCompatibilityIntent =
  | { type: "revise"; command: ReviseSeriesCommand }
  | { type: "pause"; command: SeriesStateCompatibilityInput; referenceDate: string }
  | { type: "resume"; command: SeriesStateCompatibilityInput; referenceDate: string }
  | { type: "end"; command: SeriesStateCompatibilityInput; referenceDate: string };

type SeriesCompatibilityCommandPort = Pick<
  SeriesCommands,
  "reviseSeries" | "pauseSeries" | "resumeSeries" | "endSeries"
>;

type SeriesCompatibilityResult =
  | ReviseSeriesResult
  | PauseSeriesResult
  | ResumeSeriesResult
  | EndSeriesResult;

function executeSeriesCompatibilityIntent(
  commands: SeriesCompatibilityCommandPort,
  intent: SeriesCompatibilityIntent,
): Promise<SeriesCompatibilityResult>;
```

Legacy revision fields are translated with the existing shared
`toReviseSeriesCommand` mapper at each delivery compatibility edge. The
executor receives that canonical `ReviseSeriesCommand` and forwards it without
re-normalizing revision values or inferring an effective Scheduled Date.

The executor accepts only an already-authenticated command port. It never
accepts Supabase, a cookie, an MCP credential, a principal, a user ID, a
lifecycle implementation, or a persistence adapter.

The returned value is the existing typed capability result, unchanged. The
executor does not introduce a parallel success/failure hierarchy. On success,
the lifecycle-returned Recurring Task Series projection remains available on
the existing operation-specific result. On failure, the existing validation,
not-found, conflict, invalid-transition, or coverage-unavailable result remains
intact for the delivery adapter to translate.

Unexpected thrown errors are not converted to domain failures by
compatibility. HTTP retains its catch/log/500 boundary, and AI retains its tool
failure boundary.

## Effective-date and requested-range policy

An explicit valid effective date is authoritative. For pause, resume, and end,
an omitted effective date resolves to the required `referenceDate` supplied by
the delivery adapter. Both values are inclusive local dates in `YYYY-MM-DD`
form and refer to the person's IANA timezone context.

Revision remains different: a revise intent requires an explicit effective
Scheduled Date. The executor must not silently turn a missing revision date
into today's date, because a Series Revision is an effective-dated definition
change rather than a Series-status convenience action.

Resume adds one requested coverage range to the canonical command:

```ts
{
  from: effectiveDate,
  to: addLocalDays(effectiveDate, INITIAL_COVERAGE_DAYS),
}
```

`INITIAL_COVERAGE_DAYS` remains `7`. The range is inclusive, so this preserves
the existing seven-day offset rather than redefining it as seven total calendar
positions. Pause, end, and revise do not gain a compatibility-created range.

This range is a request, not proof. Only a successful lifecycle outcome and its
returned `coverageHorizon` establish the achieved Coverage Horizon. The design
therefore avoids the review's ambiguous phrase "resume Coverage" and uses
"requested coverage range after resume."

The HTTP adapter must gain a deterministic way to obtain the person's current
local date when no explicit date is supplied. That resolver stays outside
compatibility and must use the authenticated person's timezone and an injected
clock. AI continues to pass its established context date. A server UTC date is
not an acceptable substitute for the person's local date.

## Intent selection and legacy behavior

The executor receives an already selected explicit intent. It does not inspect
HTTP query parameters, status fields, AI tool names, or legacy names such as
`archived` or `deleteRecurringTask`.

HTTP keeps these translations:

- `action=pause` and legacy `status=paused` select `pause`;
- `action=resume` selects `resume`;
- `action=end`, legacy `status=archived`, and HTTP DELETE select `end`;
- legacy `status=active` keeps its existing Series query: Paused selects
  `resume`, Ended is rejected, and Active may continue through the existing
  revision path; and
- a general validated by-ID update selects `revise`.

AI tool names already identify explicit intents and require no status query.

The executor invokes exactly one command. It never performs a read-before-write,
retries a command, invokes a fallback command, or combines mutations. Those
constraints preserve optimistic concurrency and the atomicity guarantees of
ADR-0004.

## Presentation boundary

Compatibility execution centralizes semantic success detection but does not
erase channel contracts.

- PATCH continues to return the `recurring_task` envelope.
- HTTP DELETE continues to return `{ success: true }`.
- AI revise and Series-status tools continue to return their established tool
  values.
- HTTP continues to map typed failures to status codes and JSON errors.
- AI continues to map typed failures to tool error presentation.
- Legacy `RecurringTaskResponse` mapping remains a separate pure compatibility
  function because it requires the authenticated owner ID and represents a
  delivery shape, not the execution result.

Series creation is deliberately excluded. Its 201-versus-200 replay behavior,
initial requested range, collection route, and tool presentation remain as
they are. A later proposal may include creation only if new duplication proves
that the broader executor would be cohesive.

## Testing contract

Parity tests shrink but do not disappear. Shared executor tests replace
duplicated mechanics; thin channel-level parity tests continue to prove that
HTTP and AI reach the same canonical command for equivalent intent.

Focused executor tests must cover:

- each of revise, pause, resume, and end invokes exactly one matching port
  method;
- operation ID, Series ID, opaque version, and explicit effective date pass
  through unchanged;
- an omitted pause/resume/end date uses the supplied reference local date;
- resume alone receives the inclusive `effectiveDate` through
  `effectiveDate + 7 days` requested range;
- explicit date overrides reference date;
- every typed capability failure is returned unchanged;
- `complete` and `already-applied` operation results both classify as success;
  and
- thrown exceptions remain thrown.

Thin HTTP/AI parity tests must retain evidence for:

- explicit pause and resume dates;
- omitted dates producing the same canonical effective date and resume range;
- end semantics across HTTP DELETE and the delete-shaped AI tool;
- revision mapping; and
- channel-specific result presentation.

HTTP route tests continue to own desired-status pre-read behavior, Ended Series
rejection, request validation, authentication, failure-to-status mapping, and
JSON envelopes. AI tests continue to own schemas, context-date composition,
confirmation language, and tool result presentation.

Architecture tests must prove that:

- HTTP and AI construct authenticated capabilities themselves;
- compatibility accepts only the narrow command port;
- no production delivery imports the private lifecycle or persistence modules;
- compatibility has no Supabase, request, response, cookie, MCP, logger, or
  `SeriesQueries` dependency; and
- legacy transport terms do not enter the canonical intent or command types.

## Cutover and acceptance

Implementation, if authorized separately, is one reviewable cutover across the
compatibility executor, HTTP by-ID route, AI task tools, and their focused
tests. There is no deployed state in which one channel uses the executor and
the other retains a competing execution path.

The design is implemented only when all of the following are true:

- revise, pause, resume, and end execution mechanics live once in the supported
  compatibility subpath;
- HTTP and AI pass already-authenticated commands into that seam;
- no resume-range construction remains in either delivery adapter;
- omitted effective dates have one local-date behavior across both channels;
- HTTP desired-status orchestration remains outside the shared executor;
- the executor returns existing capability results without translating
  channel presentation;
- operation IDs and opaque versions cross the seam unchanged;
- lifecycle and package import boundaries remain intact;
- focused executor, route, AI, parity, capability, architecture, and lifecycle
  suites pass; and
- no compatibility alias or parallel execution path remains.

## Deliberately separate work

- Series creation execution;
- changing the seven-day offset policy;
- changing recurrence, pause, resume, end, or Coverage Horizon semantics;
- replacing the public authenticated capability interface;
- moving authentication or capability composition into compatibility;
- redesigning the legacy HTTP API or AI tool names and result shapes;
- removing the HTTP desired-status pre-read;
- changing retry, idempotency, optimistic concurrency, or transaction policy;
- changing physical data erasure behavior; and
- reducing parity coverage below the thin cross-channel evidence described
  above.

## Canonical language

The design uses the existing glossary terms Recurring Task Series, Series
Revision, Active Series, Paused Series, Ended Series, Scheduled Date, Task
Occurrence, and Coverage Horizon. "Revision command" means the command that
creates or changes a Series Revision; it is not itself a Series Revision.

Legacy `recurring task`, `template`, `archived`, and `delete` language remains
confined to existing HTTP and AI compatibility presentation. "Authoritative
Series" is avoided in favor of "lifecycle-returned Recurring Task Series
projection," and "resume Coverage" is avoided in favor of "requested coverage
range after resume" or "achieved Coverage Horizon," according to meaning.
