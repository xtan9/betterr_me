# Focus history contract v1

Companion to mobile issue [#399](https://github.com/xtan9/betterr_me_mobile/issues/399).
This contract stores device-reported, completed Focus sessions; it does not claim
independently measured usage or alter planner work sessions or device enforcement.

Native clients use bearer-authenticated `GET` and `POST /api/mobile/focus/history`.
The existing web uses cookie-authenticated `GET /api/focus/history`. Both reach the
same owner-authorized persistence boundary. Owner identity is derived from the
verified session; no request accepts a user ID.

## Upload

```ts
type Source = { id: string; label: string; platform: 'ios' | 'macos' | 'web' };
type CompletedSession = {
  id: string; startedAt: number; endedAt: number; completedRounds: number;
  settings: {
    preset: 'quick' | 'classic' | 'deep' | 'open' | 'custom';
    focusMinutes: number; shortBreakMinutes: number; longBreakMinutes: number;
    longBreakEvery: number;
  };
  link: null | { kind: 'task' | 'event'; id: string; title: string; projectName: string | null };
  segments: { start: number; end: number }[];
};
type HistoryEvent = {
  id: string; sequence: number;
  kind: 'focus-session-completed' | 'focus-session-baseline';
  observedAt: number; appVersion: string; session: CompletedSession;
};
type Upload = { schemaVersion: 1; source: Source; events: HistoryEvent[] };
type Acknowledgement = {
  schemaVersion: 1; sourceId: string; acceptedEventIds: string[];
  acknowledgedThrough: number;
};
```

Source, event and session IDs are UUIDs. Each independently persisted producer
journal owns one source ID; its sequence starts at 1. Source metadata is immutable
for that ID. A label describes provenance, not a verified hardware identity.
Record times are integer Unix milliseconds. Server receipt time is separate.
Settings omit all blocking state. Links are historical display snapshots, never
foreign keys whose deletion can destroy history. Session segments must be ordered,
non-overlapping and contained within the session, with end >= start.

Requests allow at most 25 events and 256 KiB of UTF-8 JSON (the database also
bounds its normalized JSON representation to 256 KiB); individual sessions
allow at most 2,048 segments. All objects reject unknown fields. Unsupported or
oversized records remain local and must be shown as unable to upload, not dropped.

The whole batch commits or fails. Reusing an event ID or a source sequence with a
different payload returns HTTP 409 `{error:'conflict'}`. Exact replays succeed.
Out-of-order events can be retained, but acknowledgement advances only over the
contiguous committed prefix. Clients remove pending events only when their
sequence is at or below `acknowledgedThrough`; a gap is never a complete backup.
The prefix never decreases. A source/session can have only one immutable completion
event. A restored session is not enqueued as a new completion.

## Read and recovery

`GET ?after=<opaque cursor>&limit=50` returns:

```ts
type HistoryPage = {
  schemaVersion: 1;
  items: { source: Source; event: HistoryEvent; receivedAt: number }[];
  nextCursor: string | null;
};
```

Limit is 1–100. Omit `after` on the first page. Treat the cursor as opaque. Pages
follow durable server receipt order; each event retains its source sequence and
observed time. Continue until `nextCursor` is null, and deduplicate by event ID
and source. New records may arrive during paging. Reading never changes current
timers, app restrictions or the source journal. Restore sessions as finished
records with blocking disabled and no deadline; never infer active timers.

Failure statuses are 400 invalid input, 401 unauthenticated, 409 immutable identity
conflict, 413 oversized request, and 503 unavailable capability. Every response
uses `Cache-Control: no-store`. Missing backend capability must retain local
records. Roll out additive migrations before dependent clients; rollback keeps
accepted history. This v1 does not yet accept app-limit events; those require a
new validated event variant and migration in T2. The default v1 read must remain
session-only for older clients; later variants need an explicit typed query or
version rather than injecting unknown events into existing session pages.
