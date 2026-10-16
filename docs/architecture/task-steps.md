# Task and routine Steps

The approved mobile specification keeps projects and tasks, and adds one level of
optional Steps. A Step has a UUID, title, checked state, and position in an array.
There are at most 100 Steps per parent and 100 characters per title. Steps have no
schedule, priority, dependencies, notification, or separate task identity.

`tasks.steps` stores the ordered checklist in the task snapshot. Existing rows
default to an empty array. Routine revision defaults hold an unchecked definition;
materialization copies that definition to each occurrence. Occurrence overrides
retain local checklist edits and progress, so the existing preservation workflow
protects started occurrences during future series revisions.

The `check-step` planner command requires the owning task's version and a stable
operation ID. It locks the series, occurrence, and task in the established order.
The final new check invokes the existing parent completion command. Unchecking a
completed task, or adding an unchecked Step, invokes Reopen. Direct parent
completion normalizes every Step to checked for ordinary and recurring clients.
Rename, reorder, and deletion alone never complete an open parent.

Checklist edits enter through task capture or the routine editing command. A
successful operation stores one recoverable change. Completion/Reopen retain
their existing linked work and project snapshots; checklist-only changes use the
`steps` history kind. Combined routine timing and checklist edits retain the
pre-save occurrence, task, and reservation. Undo verifies stored versions before
restoring partial progress and affected records. It does not replay the action
against newer state. Reusing an operation ID with a different body is a conflict.
Priority supplied with a checklist save goes through the canonical task command
inside the capture transaction, before its recoverable snapshot is finalized.
Combined routine edits track protected reservations and reminder versions even
when the final Step completes the occurrence. Undo reconciles restored reminder
timing and removes any reservation created by that save. It locks the former
project before checking whether restoring an open child would reopen it.

Validation and account ownership apply on the server. Helpers are private. Raw
checklist updates and new checklist edits through the generic occurrence API are
rejected; older unrelated edits omit Steps and preserve them. Parent completion
continues through the shared completion authority, including web/AI callers.

## Verification

`supabase/tests/task_steps.sql` runs under the constrained fixture role. It covers
capture, progress, parent completion, protected/unrelated reservations, project
completion remaining explicit, exact Undo, rollback after an enclosing failure,
replay, changed-payload rejection, ownership, legacy edits, and invalid shapes.
It also covers final-Step routine completion, completed checklist editing,
newly checked draft Steps, atomic priority, intervening project completion,
missing reservations, protected reservations, and relative reminder recovery.
Existing completion/occurrence/Undo and series fixtures remain applicable.

The companion mobile `scripts/verify-task-steps.mjs` uses real local Auth and REST
requests to exercise repeated writes/readback, partial and parent completion,
reopening, combined editing/Undo, occurrence isolation, and effective-date series
revision. It rejects non-local test origins and deletes its disposable accounts.

## Coordinated rollout

The user approved coordinated production rollout on 2026-10-16, after reviewing
the linked backend and mobile PRs. Merging the backend triggers the production
migration workflow after CI succeeds.

The Steps migration follows the planned-period migration, which replaces task
capture. Replay and live upgrade therefore extend the same capture function and
retain both `planned_date` and `planned_period` when saving checklist progress.

After approval, merge this backend change, verify its migration workflow, then
merge the dependent mobile change. Verify a task's Steps and a routine's next
occurrence with a disposable test account. Move the shared Metro preview to the
updated primary mobile checkout on 8082 and verify its manifest and iOS bundle.
Physical-device appearance and VoiceOver acceptance are separate from tests and
bundle verification.

Rollback the mobile client first if necessary. Keep the additive column and
stored data; older clients preserve the field and the shared completion rule.
Do not drop the column or discard occurrence overrides as a rollback shortcut.
