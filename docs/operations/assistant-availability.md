# Assistant availability

Approved scope: [#1066](https://github.com/xtan9/betterr_me/issues/1066).

The cloud workflow exercises the production mobile Assistant with a dedicated,
empty ordinary account and the deployed model. A fresh request and conversation
must end with a nonempty NDJSON `complete` event. HTTP 200 and partial text do not
establish availability. A client timeout means unconfirmed completion: the server
can still finish within its longer request deadline.

The schedule targets five minutes, offset from the hour; GitHub can delay/drop
scheduled runs. One failed attempt is retried after 30 seconds. The issue body is
the durable incident/outbox state, with large pending queues paged into bot
comments; each transport retries its own pending event. Pending reminder snapshots
are replaced by the latest reminder; outage/recovery transitions remain queued.
Delivery retries are bounded per channel/run, with GitHub processed before email;
an email backlog cannot consume the worker deadline before the current GitHub
notification. After interrupted page writes, the latest durable event restores
the incident phase so a recovery does not acquire a second event ID.
Workflow concurrency serializes dispatches and scheduled checks. Email calls
Resend directly, independently of the app/gateway. If GitHub state is unavailable,
a stable 30-minute fallback email reports the notification-state failure. There
is no automated production repair.

Resend deduplicates an event ID for 24 hours. A lost acknowledgement followed by
a retry after that provider window can produce a duplicate; the durable sent
flags prevent ordinary repeat delivery. GitHub comments use the same event ID.
Public diagnostics contain only categories, timestamps, timing, status and links.
Provider bodies, generated text, recipient addresses and credentials stay private.

## Setup and verification

1. Apply the reviewed migration through the database pipeline. Use an admin
   session once to create an empty synthetic auth user and insert **only its UUID**
   into `planner_private.assistant_monitor_accounts`. The monitoring worker never
   receives an admin/service-role key. Confirm its profile has the ordinary user
   role and no tasks, calendar events, memories or external connections.
2. Configure repository secrets referenced by the workflow, including the
   synthetic password/user ID/email and private alert recipient. Verify the
   existing `reminders@betterr.me` Resend sender and provide a send-only key when
   available. The existing public Supabase URL/anon key are shared configuration.
3. Dispatch `live`; require `ASSISTANT_PROBE_COMPLETED` with `healthy:true`, one
   genuinely completed generation, and successful account-session cleanup.
4. Dispatch `test_failure`, confirm the labeled email in the intended inbox and
   the bot mention/assignment in the maintainer's GitHub notifications. Let the
   Codex heartbeat observe this same test issue. GitHub Mobile physical push is
   verified separately by the maintainer; issue creation alone is insufficient.
   Dispatch `test_recovery`; confirm one recovery and the issue closed.
5. Set repository variable `ASSISTANT_MONITOR_ENABLED=true`; confirm a scheduled
   live run completes. To pause cloud probes, set that variable to `false`.
   Manual dispatches still work for diagnosis.

The current-chat Codex heartbeat runs every five minutes while its local runtime
is available. It reads the same bot incident and the latest **live** workflow log
marker. Test runs do not refresh live-probe freshness. More than 15 minutes without
a completed live probe is a monitor gap, never a healthy status. Report new
incident events, delivery failures, recovery, and freshness transitions using the
same event IDs; suppress unchanged reports. Email and GitHub continue independently
of the local desktop. Preserve this runtime limitation when reporting coverage.

## Identity and retention

Ordinary quotas remain 10/minute and 100/day. Only the operator registry grants
2/minute and 600/day to the synthetic identity; JWT metadata cannot grant access.
Each attempt runs the authenticated, parameterless cleanup RPC before generation.
It deletes that identity's conversations older than 24 hours, their dependent
messages/turns/planning sessions, source memories and separate proposals. Failed
prepared turns and late completions are included. Quota counters are retained.
Cleanup failures stop the attempt and alert, even during a model outage. Retention
is a 24-hour target; an unavailable database can delay deletion until recovery.

Normal traffic is 288 route requests/day, up to 576 after retries. SDK retries and
generation passes can add upstream calls; this is not a token/cost cap. The probe
never accepts proposals or executes task/calendar mutations.

Run focused checks with `pnpm exec vitest run tests/scripts/assistant-availability.test.ts`
and the registered `assistant-monitor` SQL fixture on disposable Supabase. The SQL
fixture uses admin setup for registry/time fixtures, then tests the actual
authenticated/anon permission boundaries. Required CI runs the complete SQL suite
and verifies fixture rollback, including identity sequences.
