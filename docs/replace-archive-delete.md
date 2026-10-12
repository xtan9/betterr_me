# Reviewed task and project deletion

Product spec approved October 12, 2026 in the mobile repository:
`docs/replace-archive-with-delete-spec.md` on `codex/replace-archive-delete`.

The additive migration restores legacy archived tasks/projects without changing
completion or identities, then retires Archive writes. The compatibility fields
remain internal exclusions on tombstones. Public restrictive policies hide
tombstones from ordinary queries, including the task reminder lifecycle role.
Deleted rows cannot be edited; new project, event, queue, priority and reminder
relationships cannot point at deleted items. Routine lifecycle deletion retains
its existing occurrence behavior.

`item_deletion_preview(kind,id)` returns an owner-scoped versioned impact.
`item_delete_command(operation_id,preview)` locks the target and dependent rows,
recomputes the exact impact, rejects changes, and commits atomically. Immutable
private receipts replay an identical request; reusing an ID for another preview
is a conflict. The public RPCs are invokers of private definer functions; those
derive ownership only from auth.uid().

Task deletion removes future app-owned nonrecurring blocks, including explicitly
previewed protected blocks, their reminder lifecycle, and task reminders. Past,
ongoing, external and booking records remain with task links cleared. Existing
work-session snapshots survive. Project deletion detaches live child tasks.
Queue and priority memberships are removed before hiding the task. History
records deletion without advertising Undo.

## Compatibility and rollout

Deploy the backend before the mobile Delete UI. Old archive and unreviewed hard
delete writes fail rather than silently gaining new destructive meaning. Older
web/API deletion controls need to adopt these RPCs before they can delete items;
do not remove the guard to make an obsolete caller work. Existing task/project
create/edit and routine lifecycle operations remain supported.

This is a shared data migration, not a low-risk UI-only merge. Review the
restoration counts and old-client release plan before hosted rollout. No hosted
migration has been applied during development. Rolling clients back must retain
tombstones, receipts and history; never clear deletion markers or recreate
removed future reservations automatically. A database backup is not an Undo UI.

## Verification

`supabase/tests/item_deletion.sql` covers impact, stale rejection, owner isolation,
receipt replay and fingerprint conflicts, transaction rollback, hidden task
state, future protected-block removal, retained history/commitments, detached
children and rejected legacy archiving. Existing completion/stop/undo/project
fixtures continue to exercise adjacent behavior. Registry validation and the
full application unit suite are required separately from these database checks.

Local checks use a dedicated `codex_delete_tests` database created from the local
schema, never the local application's active database or a hosted account.
Native acceptance of mobile confirmation layouts remains a separate device gate.
