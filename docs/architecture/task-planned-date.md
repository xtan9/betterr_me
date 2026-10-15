# Task planned date

Approved in the mobile date-only Schedule spec on 2026-10-15. A standalone task
has one nullable `planned_date`, independent of `due_date` and calendar events.
The recurring `scheduled_date` remains its immutable occurrence identity.

The existing owner-scoped, versioned, idempotent `task_capture_command` accepts
`planned_date` as an ISO civil date or null. An edit replaces or clears the date.
Recurring, completed, and archived tasks reject planned-date edits. Other task
fields, reservations, priorities, and reminders are unchanged. Existing RLS and
the task version trigger continue to apply. There is no backfill.

Apply the additive migration before releasing the mobile reader. Older clients
ignore the new nullable column and preserve it through partial edits. For a UI
rollback, keep the column and command support so saved dates survive; do not drop
the column as part of an application rollback.

`supabase/tests/task_planned_date.sql` verifies owner isolation, preserving the
deadline, no reservation, replacement, clearing, leap dates, stale versions, and
idempotent retries through the existing task command boundary.
