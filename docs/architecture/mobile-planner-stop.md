# Issue 7: Stop for now

Approved issue #7 and original A End sheet. An explicit Stop records only an end; no actual start or worked duration is inferred. Cancel writes nothing, and Task is complete stays unavailable until issue #8.

Add owner-scoped work_sessions (event/task IDs, planned event snapshot, explicit ended_at, nullable actual_start/duration), planner_changes (before/after state and version), and planner_command_receipts. No legacy backfill. Shared schema remains in the web repo. Tables expose private read-only RLS; private definer commands check auth.uid() with public invoker wrappers.

planner_command accepts a stop request with operationId, eventId and exact expectedVersion. Under one transaction it serializes the operation, replays identical receipts before revalidation, locks the event, requires an active app-owned flexible non-recurring task-linked block, shortens only that event to the server's explicit current second, records the session and before/after snapshots, and stores the receipt. Recurrence/ambiguous/protected events reject this operation. Task status and all later reservations stay unchanged. Reminder start time is unchanged; end edits use existing lifecycle. A second stop with a different ID rejects an already-ended block.

Snapshots include original event data, resulting event version, session version and task identity/version. Future Undo must validate all affected versions and restore the linked operation atomically; no expiry is introduced. Uncertain failures keep the exact immutable request for retry. Known conflicts require reload. Sessions survive reload through private shared reads, including after calendar changes.

Calendar session_ended_at preserves the exact end instant during the repeated autumn hour; Today/Calendar use it over ambiguous civil end time. Explicit rescheduling clears that marker while retained work_sessions preserve history. Ordinary title/link edits retain it.

Rollback clients first and retain additive tables/history. Do not deploy hosted migrations during local verification. Test the approved authenticated command/readback seam on an isolated real service: replay, private reads, stale versions, preserved task/later blocks, failure atomicity and restart. Deterministic Today tests establish the founder's 11:50-to-12:30 forty-minute gap. Browser smoke validates explanation/cancel/stop/history; physical-iPhone and hosted-account evidence remain release gates. This intermediate slice is not a releasable manual MVP.
