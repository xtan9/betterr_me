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

## Planned period

The mobile Today task groups spec approved on 2026-10-15 adds a nullable
`planned_period`: `morning`, `afternoon`, or `evening`; null means Anytime.
The period is a chosen grouping, not a time or timezone conversion. It does not
create a Calendar Event or alter existing reservations or daily priorities.

`task_capture_command` accepts the period in the same atomic create/edit command
as `planned_date`. Changing only the date preserves the period. Changing only
the period preserves the date; clearing the period chooses Anytime. Clearing
the date clears both. A non-null period requires a date and a standalone task.
An explicit non-null period with a cleared date is rejected. Recurring,
completed, and archived tasks reject planning edits through this command;
completion and reopening retain the saved placement.

The storage constraint also rejects unknown periods and periods without a date.
A narrow trigger clears the period when older direct writers clear the date.
Other partial writes preserve it, including the existing web Task Command.
Operation receipts still replay the original result, version checks prevent
overwriting later edits, and owner-scoped reads keep task placement private.

Apply `20261016031457_task_planned_period.sql` before releasing a mobile reader
that selects `planned_period`. No backfill is needed: every existing task's
period remains null. On application rollback retain both planning columns and
the command/clear-trigger support, so old clients preserve saved placement.

The repository's `Database Migration` workflow applies migration changes after
the exact merged main commit passes CI, using the Production environment and
then checking remote migration history. Merge only when the mobile release is
ready to consume the contract; wait for that workflow to succeed before serving
the new reader. The workflow requires its existing Supabase access token and
database password secrets. No additional permissions or secrets are introduced.

`supabase/tests/task_planned_period.sql` is a registered constrained transactional
fixture. It covers atomic creation/rollback, invalid input, same-task moves,
Anytime/clear semantics, legacy partial writes, replay/conflicts, completion,
recurring eligibility, owner isolation, and absence of calendar reservations.
