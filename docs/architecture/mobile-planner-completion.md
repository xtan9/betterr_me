# Issue 8: compatible linked completion

Approved scope: issue #8, ios-mvp-spec.md, original A and CONTEXT.md. Shared schema ownership remains in the web repository. No recurrence-template completion is introduced in mobile.

## Existing write-path inventory

Web PATCH and toggle routes and assistant task tools already route through lib/tasks/commands.ts to task_command_atomic. Ordinary complete/reopen uses task_command_state_atomic; mixed field/status edits use task_command_edit_atomic (version wrapper over task_command_edit_unversioned_atomic). Legacy lib/db/tasks.ts and lib/tasks/writes.ts can still update task completion directly. Existing recurring commands route through recurring_task_lifecycle/recurring_task_occurrence_command_checked and recurring_task_edit_occurrence_atomic; preserve their existing occurrence behavior without treating a template as an ordinary task.

Enforce ordinary false-to-true completion effects with a task transition trigger, covering all those write paths and direct table writes. It only acts for exact non-recurring tasks. Mobile rejects recurring completion; existing recurrence lifecycle stays authoritative and does not release ordinary task reservations. This preserves compatibility without forcing old callers to invent new preview IDs.

## Commands, mapping and concurrency

planner_completion_preview returns the owned task and eligible event plan across every date, including effective instants, action (end/release) and event versions. Eligibility requires exact task_id, app_owned, not protected, timed, no recurrence or ambiguous recurrence metadata, no previous explicit end, and actual remaining occupied time. Protected commitments, appointments, all-day records, unrelated work and recurrence survive.

planner_command adds complete/reopen/complete-project. Complete checks task version and the exact preview plan again under locks. A boundary change or intervening edit rejects the whole operation. A database trigger commits task state, active event ends, explicit session records, future releases/reminder lifecycle and one before/after change record together. Existing web/AI commands reach that same trigger, including mixed edits. Duplicate command receipts replay before version validation. Reopen changes only task status and never restores reservations.

Retain release snapshots including full event/reminder data. Add an event mutation-version ledger, advanced on insert/update/delete, so later Undo can detect intervening edits or delete/recreate cycles even for absent released rows. Owner-private ledger/history is read-only to clients. No expiry or automatic cleanup.

Project completion adds completed_at without redefining legacy active/archived status. It requires explicit command, exact project version and no unarchived incomplete children. Child writes lock/check the project, preventing new unresolved children after completion. Completing the final child never automatically completes its project. Existing web project edits preserve the additive completion field.

## Validation and rollout

Use the approved authenticated command/readback seam, real isolated transactions and owner attacks, deterministic founder gap, native UI previews/cancel/retry and independent browser smoke. Verify ordinary and mixed web command compatibility, duplicate calls, rollback, stale previews, protected/unrelated/recurring preservation, later-date release, reopen, explicit project completion and child guards. Roll back clients before backend; retain history, completion metadata and ledgers. Hosted-account and physical-iPhone tests remain release gates and local checks do not authorize hosted schema rollout.
