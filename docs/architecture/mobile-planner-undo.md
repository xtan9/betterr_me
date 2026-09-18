# Issue 9: atomic persistent Undo

Implements the approved issue #9/spec acceptance criteria AC06, AC10, AC16, AC19, AC23. Schema stays in the shared backend repository; mobile remains an authenticated client of existing accounts/data. Original A, English and Simplified Chinese remain authoritative.

## Mapping and restoration contract

Issues #7/#8 persist owner-private planner_changes with full before/after task, event and session snapshots; completion also retains released events, reminders and deletion ledger tokens. Undo uses those records after restart, without expiry. Today exposes persistent recent changes and an explicit Undo action. Reopened tasks remain a distinct history entry without automatic restoration of released time.

The existing planner_command accepts undo with changeId, expectedVersion and immutable operationId. It checks ownership, receipt replay, supported change kind and change version; locks affected task/project, events, release ledger tokens and sessions; then verifies every expected version before writing. A conflicting edit, deletion, recreation, missing reference or failed constraint rejects the transaction and leaves the current plan intact. Restored rows receive fresh versions, preventing old pre-completion commands from applying to resurrected rows. Priority membership is not rewritten: current views derive the restored task state while preserving later priority choices.

Stop Undo restores the original event and removes the explicit session, keeping its unchanged task intact. Complete Undo restores all original task fields (including a legacy mixed edit), ended events, future reservations and deleted reminders, and removes added sessions. Explicit project completion can be undone after its version check. A prior change is marked undone only in the same successful transaction. Duplicate requests replay the receipt; a different request against an already-undone change conflicts. History remains readable, including the undone marker.

Only a private server helper restores stored snapshots into fixed, allowlisted tables. Snapshot JSON never comes from the client. Security-definer entry points authenticate owner identity; tables remain client-read-only. New version triggers cover history/session edits. Restoring a reservation checks completed-task/project constraints; FK or uniqueness conflicts roll everything back. No hosted writes or production credentials are required for implementation.

## Verification, rollout and rollback

Test authenticated Stop→Undo and Complete→Undo with database readback, duplicate concurrent retries, owner attacks, login restart, later edits, deleted/recreated released IDs, session/history mutation and transactional rollback. UI tests cover persistent history loading, conflict explanations and immutable uncertain retries; independent browser smoke covers actual commands and refresh/restart in both languages. Run typecheck/lint, full mobile suite, iOS export and shared backend CI/SQL/E2E checks.

Apply the additive migration before the mobile client. Roll clients back first; retain history, receipt and version data. Existing Stop/Complete calls remain compatible. Hosted shared-account and physical-iPhone accessibility/modal/background checks remain release gates; local service/browser/export checks do not replace them.
