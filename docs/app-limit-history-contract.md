# App-limit history contract v1

Backend companion to mobile [#400](https://github.com/xtan9/betterr_me_mobile/issues/400).
Native clients use bearer-authenticated `GET` and `POST
/api/mobile/focus/app-limits/history`; web uses cookie-authenticated `GET
/api/focus/app-limits/history`. The existing Focus session v1 endpoints and payloads
are unchanged. App-limit journals have separate tables and source identities.

```ts
type Source = { id: UUID; label: string; platform: 'ios' | 'macos' | 'web' };
type Snapshot = {
  label: string | null;
  day: string; // actual Gregorian YYYY-MM-DD, years 0001..9999
  dailyUnlocks: number; // integer 1..50
  minutes: number; // integer 1..60
  current: number; best: number; // integers 0..1,000,000; best >= current
  status: 'counting' | 'paused' | 'removed';
  usedToday: number; overridesToday: number; // integers 0..1,000,000
};
type Reason = 'baseline' | 'limitCreated' | 'limitChanged' | 'labelChanged'
  | 'dayAdvanced' | 'authorizationUnavailable' | 'authorizationDenied'
  | 'authorizationCheckFailed' | 'accountChanged' | 'signedOut'
  | 'limitRemoved' | 'limitRelaxed' | 'extraUnlock' | 'unlocked' | 'resumed';
type Event = {
  schemaVersion: 1;
  id: UUID; sequence: number;
  kind: 'app-limit-baseline' | 'app-limit-change';
  observedAt: number; // integer Unix milliseconds 0..8,640,000,000,000,000
  appVersion: string; // 1..64 characters
  ruleId: UUID; reason: Reason;
  before: Snapshot | null; after: Snapshot;
};
type Upload = { schemaVersion: 1; source: Source; events: Event[] };
type Acknowledgement = {
  schemaVersion: 1; sourceId: UUID;
  acceptedEventIds: UUID[]; acknowledgedThrough: number;
};
type Page = {
  schemaVersion: 1;
  items: { source: Source; event: Event; receivedAt: number; acknowledgedThrough: number }[];
  nextCursor: string | null;
};
```

All objects reject unknown fields, including owner IDs, selection tokens, live
permissions, grants and monitor state. Source label is nonblank, at most 100
characters, and immutable for its journal identity. Snapshot label is a nullable,
nonblank user label of at most 100 characters. Label edits append `labelChanged`
even when streak values are unchanged. `status` describes the historical counting
state; it is never a transferable authorization or enforcement capability.

An independently persisted native journal owns a source ID for one account, with
a single increasing sequence across its rules. It must not share the JS Focus
journal's source ID or sequence. Sequences are integers 1..9,007,199,254,740,991.
Baseline events use kind `app-limit-baseline`, reason `baseline`, and null before;
they record a current observation without reconstructing old actions. Change
events use kind `app-limit-change`; `limitCreated` has null before, all other
reasons require before. Removing a rule keeps a final removed snapshot and all
history. A rule may have arbitrarily many events; only event identity/sequence
is unique within the owner/source journal.

Upload batches allow 1..25 events and at most 256 KiB UTF-8 JSON, also bounded in
the normalized database representation. A batch commits atomically. An exact
replay succeeds; event/sequence identity reuse with changed content returns 409.
Accepted IDs identify the current batch, but only the monotonic contiguous
`acknowledgedThrough` prefix permits removing pending local events. Out-of-order
events can be stored above that prefix. More than 100 unacknowledged events must
remain local independently of the recent UI history cap.

Read with `?limit=50&after=<opaque cursor>`, omitting `after` initially. Limit is
1..100; pages follow stable server receipt order, preserving original source
sequence and observation time. Each item's checkpoint comes from the same database
read as its event. A consumer uses the maximum observed checkpoint for each source;
a delayed page cannot move it backward. Deduplicate by owner/source/event ID.

For T3, latest confirmed per-rule state means the greatest source sequence for
that rule at or below the source's contiguous checkpoint, including removed/reset
states. Later received events above a gap remain inspectable but cannot bypass
the missing predecessors. Confirmation must re-read current cloud/destination
versions online; a cached page is not a continuation authorization. A later T3
command will persist its own operation receipt and source event/checkpoint
provenance. This contract does not activate a timer, restore a grant, credit an
unverified gap, or mutate the source journal during recovery.

Responses are `Cache-Control: no-store`. Failure statuses follow session history:
400 invalid input, 401 unauthenticated, 409 immutable identity conflict, 413 too
large, 503 unavailable. An unsupported backend retains local pending records.
