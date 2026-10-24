# App-limit continuation contract (v1)

Use native bearer endpoints under `/api/mobile/focus/app-limits/continuations`:

1. `GET /context?sourceId=UUID&sourceRuleId=UUID&destinationSourceId=UUID&destinationRuleId=UUID`
   returns a current source/destination view for review. It creates nothing.
2. `POST` confirms an immutable continuation receipt after repeating all version
   and eligibility checks in one owner-authorized transaction.
3. `GET ?operationId=UUID` recovers that receipt after an uncertain response.
   This is a read, not another confirmation. Also implement the required strict
   query variant `GET ?destinationSourceId=UUID&applyEventId=UUID` now: a clean
   installation has these IDs in its history row but has no operation ID. It
   returns lineage only for the authenticated owner's matching recorded apply
   event. An unknown/foreign/unapplied event returns the same not-found result.
   Do not defer this read path; T3 history must identify the continued origin
   after local disk is erased. T7 can reuse a cookie-authenticated read adapter.

All transport envelopes are strict and use schemaVersion 1; nested Source/Snapshot/version objects retain their exact existing shapes. No owner ID appears in client payloads; responses use no-store.
Use existing UUID/count/time bounds. The source and destination IDs identify
producer journals, not verified hardware. The supported scope is a distinct
destination journal; same-journal continuation is unnecessary for reinstall and
would complicate the promise that source history stays independent.

```ts
type EventVersion = { eventId: UUID; sequence: number };
type Context = {
  schemaVersion: 1;
  source: null | {
    source: Source; ruleId: UUID; acknowledgedThrough: number;
    maxReceivedSequence: number;
    latest: null | { version: EventVersion; snapshot: Snapshot;
      observedAt: EpochMs; receivedAt: EpochMs };
  };
  destination: {
    sourceId: UUID; acknowledgedThrough: number; maxReceivedSequence: number;
    latestRule: null | { version: EventVersion; snapshot: Snapshot };
  };
  eligibility: { allowed: boolean; reason: null | 'source-missing'
    | 'source-incomplete' | 'source-ended' | 'destination-incomplete'
    | 'destination-not-pristine' };
};
type Confirm = {
  schemaVersion: 1; operationId: UUID;
  source: { sourceId: UUID; ruleId: UUID; expectedCheckpoint: number;
    expectedEvent: EventVersion };
  destination: {
    source: Source; ruleId: UUID; expectedCheckpoint: number;
    expectedRuleEvent: EventVersion | null;
    applyEventId: UUID;
    label: string | null; dailyUnlocks: number; minutes: number;
  };
};
type Receipt = {
  schemaVersion: 1; operationId: UUID; confirmedAt: EpochMs;
  source: { source: Source; ruleId: UUID; checkpoint: number;
    event: EventVersion; snapshot: Snapshot; observedAt: EpochMs; receivedAt: EpochMs };
  destination: Confirm['destination'];
  restored: { current: number; best: number };
};
type ReceiptRead = { schemaVersion: 1; receipt: Receipt;
  application: { state: 'awaiting-device' } | {
    state: 'recorded'; eventId: UUID; sequence: number; receivedAt: EpochMs;
  } };
```

`Source` and `Snapshot` are the already agreed T2 shapes. The caller does not
submit restored days/best/source snapshots: the server copies them from the
verified current source event. A missing destination journal is version zero;
confirmation may register its immutable source metadata with checkpoint zero.

### Confirmation transaction

Take T2's existing owner advisory lock, the same lock used by native history
ingestion. Look up the owner/operation receipt first. An identical replay returns
the existing immutable result even if the source later changes; changed input
under the same operation ID is 409. This is essential after a lost response.

For a new operation:

- Source checkpoint must equal expectedCheckpoint. Source max received sequence
  must equal its contiguous checkpoint: a received post-gap reset/removal cannot
  be bypassed by choosing the earlier prefix. Select the latest event for this
  rule at or below that checkpoint and require exact event ID/sequence match.
- A source with status removed or current zero is not continuable. A paused
  source with positive earned days is eligible; no unobserved interval earns days.
  New unrelated source events may cause a conservative version refresh, not loss.
- Destination cloud checkpoint must equal expectedCheckpoint, with no known gap.
  Native preparation must have flushed its journal to exactly that checkpoint.
  Check the latest destination rule event against expectedRuleEvent.
- Minimum eligible target is absent, or pristine: current/best/usedToday/
  overridesToday all zero, not removed, and no known override/removal/relaxation
  for that rule. This permits a newly configured rule without overwriting
  earned progress or a deliberate break. Native must separately reject an
  application whose existing token maps to protected/removed rule history.
- Requested unlock count AND duration must each be no greater than source
  settings, and no greater than existing destination settings when present.
  Server validates bounds; native repeats the comparisons before apply.
- Insert one immutable receipt for `(owner, operationId)` and uniquely bind its
  destination applyEventId. Do not reserve a target rule forever merely because
  an earlier confirmation was never applied: a stale local apply may need a new
  operation after explicit re-review. Only an applied event establishes active
  destination lineage. Repeated confirmation of the same operation creates one
  receipt, never another credit.

Statuses: 400 invalid request, 401 unauthenticated, 409 stale/reused operation or
destination conflict, 422 non-continuable source/settings, 503 unavailable.
Return structured non-sensitive error codes such as `source_changed`,
`source_incomplete`, `destination_changed`, `source_ended`, `settings_loosened`.

### Native prepare, apply and retry

Before confirmation, the native picker/authorization flow stores a durable local
prepared operation with owner, operationId, selected token, target rule ID,
applyEventId, source selection, settings and exact destination journal/version.
Tokens and live authorization stay inside that local document. Preparation and
canceling the picker do not create a rule, grant or timer. After flushing current
history and receiving context, the person explicitly reviews source label,
recorded days, last observed date and chosen local app/settings, then confirms.

Persist the confirmed server receipt into the local pending operation before
applying it. Under the same native cross-process lock:

1. If an applied receipt for operationId exists, return that same result first.
2. Otherwise verify active owner, fresh required authorization, selected app
   identity, expected destination version, no conflicting rule/runtime state and
   the settings comparisons. Any newer local action makes this preparation stale.
3. Atomically write rule state, one native apply receipt, and one pending journal
   event with the preallocated applyEventId at expectedCheckpoint + 1. Set current
   from receipt and best from the preserved recorded best. Start on the current
   local civil day as ineligible/partial; never advance across the source gap.
   Clear no other rule and create no active unlock, pending override or timer.

After a crash, repeat POST with the exact saved request or GET the receipt. A
receipt confirmed earlier remains the origin of an independent continuation;
later source events do not rewrite it. If local state changed after confirmation,
native apply rejects instead of overwriting it. A fresh explicit review uses a
new operation; an existing applied target is no longer pristine and cannot be
credited again. Local cancellation records the operation as canceled and never
auto-applies a recovered cloud receipt.

### Preserve T2 v1 payloads

Do not add unknown event fields/kinds/reasons to old T2 pages. An absent target's
applied event can use `app-limit-change` / `limitCreated`, before null. A pristine
existing target can use `app-limit-change` / `resumed`, with the real before
snapshot. Both already exist in T2. Link operation/source provenance through the
separate immutable receipt keyed by applyEventId. T3's ingestion addition checks
that a registered apply event matches its receipt's owner, destination source/
rule/sequence, copied days/best and settings; its day/time describe actual local
apply. ReceiptRead derives `recorded` only from that accepted event. This is a
device report, not independently attested authorization.

### Tests at already agreed seams

SQL + real bearer HTTP:

- Latest positive source accepted; older pre-reset event rejected; latest zero or
  removed rejected; received reset above a gap blocks confirmation.
- Stale source checkpoint/event, destination checkpoint/event, foreign owner and
  absent source rejected without changing history. Each setting dimension tested
  separately; tighter/equal settings accepted.
- Exact replay returns same receipt after source changes; changed payload under
  operation ID conflicts. Two concurrent confirmations/ingests have a single
  serial outcome under the existing owner lock; no partial receipt/source writes.
- Apply event matches receipt; changed apply ID/payload does not claim that
  receipt. Session v1 and T2 history reads remain parseable by older validators.
- Wipe all local pending-operation/receipt caches, read an applied history row,
  then resolve its source provenance by destinationSourceId + applyEventId.
  Foreign account/event combinations reveal nothing; an ordinary event has no
  continuation lineage. The strict history DTO remains unchanged.

Native store/bridge + process-death fixture:

- Terminate before/after prepare persistence, after server commit with response
  lost, after receipt save, before atomic native commit, and after commit before
  bridge reply. Re-entering yields one local effect/event/receipt.
- Authorization/picker cancellation, account switch, local destination edit,
  override/removal, wrong source receipt and looser settings leave data intact.
- New day/timezone and long offline gap copy recorded days/best only, excluding
  the gap and partial reconnection day. No grant/permission/timer restored.
- Late source reset after confirmation stays visible on the source; destination
  progress remains independent. Native UI shows recorded dates/provenance and an
  actionable safe retry. Physical Screen Time cases remain a separate gate.


## Frozen transport details

POST returns `ReceiptRead`, with the immutable receipt nested under `receipt`.
Context and receipt reads return the exact envelopes above. The web cookie read
adapter is `/api/focus/app-limits/continuations`, with both lookup variants.
A missing receipt returns HTTP 404 `{error:"not_found"}`; context missing state is
a normal 200 eligibility result. All error bodies are `{error:code}`.
UUID comparisons identify the same UUID irrespective of casing; stored source
and request JSON are preserved byte-for-byte in value/casing for exact replay.
JSON object key order is irrelevant. Confirmation body maximum is 16 KiB.

Apply events use `app-limit-change`, status `counting`, usedToday/overridesToday
both zero, exact requested label/settings and exact receipt restored current/best.
Their sequence is destination.expectedCheckpoint+1. An absent rule uses
`limitCreated`/null before; an existing rule uses `resumed` and its confirmed
latestRule snapshot as before. Day/observedAt/appVersion reflect actual application.
The first local day remains ineligible inside native enforcement; it is not a new
portable field. Receipt lookup by destination/apply event only returns accepted
recorded lineage, never an unapplied confirmation.

## Error mapping

- 400 `invalid` (413 when the body exceeds 16 KiB).
- 401 `unauthorized`; 404 `not_found` for either receipt lookup variant.
- 409 `operation_conflict`, `source_changed`, `source_incomplete`,
  `destination_changed`, `destination_incomplete`, `destination_not_pristine`.
- 422 `source_missing`, `source_ended`, `settings_loosened`.
- 503 `unavailable`, including a missing database capability.

Context eligibility uses the documented hyphenated reasons; error bodies use
the underscore codes above. Context is read-only and does not reserve a target.
Two confirmations may be pending for one pristine target, but their preallocated
apply events compete for the same next sequence; only one can be accepted. Native
version checking rejects a second local effect.
