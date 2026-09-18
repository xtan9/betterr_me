# Issue 10: routine occurrences

Approved scope: issue #10 and ios-mvp-spec.md. Test seams are the approved authenticated command/readback boundary, isolated database transactions and ownership, deterministic date/time examples, selected native UI tests and independent browser smoke.

## Existing authority and additive mapping

The shared recurring_task_lifecycle owns recurring_task_series, immutable revisions, concrete recurring_task_occurrences, intentional absences and task projections. The obsolete recurring_tasks projection was removed by the contract migration; it must not be recreated. Calendar recurrence is separate: parent/exception events expand virtually. Richer existing calendar and task recurrence remains untouched and read-only where mobile cannot represent it.

Mobile creates daily or selected-weekday task series through that lifecycle. An owner-private planner_routine_schedules row supplies local reservation times and protection for a series. Each materialized task occurrence receives a concrete calendar reservation linked to its exact task and occurrence. No shared task is attached to every virtual calendar date. Coverage is extended for requested dates through the existing lifecycle; saved skips are never regenerated. Editing one occurrence preserves its scheduled identity and changes only that occurrence's task/schedule. Bulk template revision remains outside this slice.

## Time policy, before implementation

Series use a validated explicit IANA timezone. Preserve civil start/end times across offset changes; changing the profile timezone does not reinterpret a saved series. PostgreSQL and the existing mobile localInstant resolver choose the later instant in a repeated autumn hour. Nonexistent spring times are not shifted: retain the occurrence in routine details with a visible time-correction warning, omit an invalid occupied interval, and require an explicit occurrence edit or skip. An explicit edit also rejects nonexistent times. Initial support uses same-day intervals with end after start; overnight work remains available through ordinary calendar capture and richer existing recurrence remains preserved.

## Commands, shared behavior and Undo

Native routine commands validate daily/weekly interval-one rules, title, civil dates/times, ownership and immutable operation IDs. Occurrence writes lock series, occurrence and task in that order and require exact task/occurrence/event versions. Delegate edit/skip/completion to the existing lifecycle; unsupported richer edits reject without simplifying data. Shared recurring completion entry points apply the same exact-task linked completion effects and record before/after occurrence snapshots. Ordinary completion behavior is preserved.

Occurrence completion restores through the existing persistent Undo path, checking occurrence and series definition tokens in addition to task/event/session/release versions. Restore only the identified occurrence ledger and task/reservations, never siblings or template fields. Reopening remains distinct and does not restore released reservations. Skipping persists the lifecycle's intentional absence and removes that occurrence's reservation; it does not claim completion or work duration.

## Rollout and validation

Apply additive backend migration before the mobile client. Roll clients back first, retaining schedule associations, occurrences, receipts and history. No production migration/data rewrite is authorized by local verification. Verify daily/weekdays concrete identities, spring/fall and timezone cases, edit/skip and sibling preservation, shared web commands, completion/Undo, duplicate retry, stale versions, rollback, restart and two-account privacy. Run typecheck/lint, mobile suite, iOS export, constrained SQL and backend CI; independent review/browser comments are addressed before merge. Hosted-account and physical-iPhone validation remain explicit release gates.
