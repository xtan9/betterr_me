# Identify routine occurrences by date and period

The approved mobile period-routine specification requires a single user-visible
series to schedule morning, midday and evening occurrences on the same date.
Each occurrence must retain its own completion, skip, steps and exception history.

Extend the existing lifecycle ledger's immutable position to Series + Scheduled
Date + Scheduled Period. Existing timed routines and web recurrence use an empty
period, preserving their identities and once-per-date behavior. This supersedes
the one-occurrence-per-date restriction in ADR 0001 and refines ADR 0007's key;
materialization and every occurrence transition still belong to the existing
Recurring Task Lifecycle as required by ADR 0005.

The alternative of hidden child series would preserve the old unique key, but
split one routine's revision, pause/end, ownership and retry boundaries across
several independent series. A single task with three checkboxes would lose
independent occurrence identity and confuse steps with separately performed work.

Intentional skips are scoped to the period. Pause/end absences remain capable of
suppressing the whole date. Effective-dated schedule policy selects the periods
to materialize, without invented clock times. Planner-owned period placements
allow an individual occurrence to move without changing its immutable identity,
just as a timed occurrence's calendar reservation may move independently.

Backend rollout precedes the mobile client. Retain ledger columns, schedule
history and receipts on client rollback; never collapse new history back to
one record per date. Legacy read contracts omit unsupported untimed entries and
legacy timed edits reject them. New clients use explicit period-aware reads.
