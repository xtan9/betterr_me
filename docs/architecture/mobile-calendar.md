# Issue 5: shared Calendar editing

Approved scope: issue #5 and ios-mvp-spec.md (original A). Backend baseline: 2ef89b04; mobile baseline: 76f0617. Backend schema ownership remains in the web repository, companion branch codex/mobile-calendar.

## Mapping and identity

Use public.calendar_events, not the lossy task/habit overlay. Keep existing UUIDs and civil start_date/start_time/end_date/end_time. Add nullable timezone (legacy rows use profile timezone), task_id (explicit owner-scoped foreign key), is_protected (default true), app_owned (default false), and version (UUID advanced on every update). New mobile events record the selected IANA timezone. No title-based task inference. All-day and recurrence rows remain visible, but recurrence edits are deferred to issue #6. Preserve description/location/category/color/reminders and all recurrence fields by patching only supported fields. Stable virtual occurrence identity is parent UUID plus original local date.

## Commands and compatibility

Authenticated calendar_capture_command supports create/edit/remove with a UUID operation ID and exact expected version for existing rows. Validate ownership including linked tasks, times, timezone and allowed fields at the database boundary. Lock operation identity then event; replay immutable receipts before version validation. Persist before/after event and reminder snapshots with the receipt for recoverable removal/unlink history. Removal uses the existing atomic reminder lifecycle; tasks are never mutated. Recurring records, exceptions and records with recurrence metadata reject mobile mutations. Existing richer appointment fields survive ordinary patches.

All writes advance versions. Web event edit requests carry the version loaded by the editor; lifecycle checks it under the same event lock. Legacy callers omitting a version retain their legacy contract. A mobile failed request keeps an immutable command for retry; confirmed conflicts preserve drafts and require explicit reload. Reads refresh on date/tab changes and foreground. No optimistic success or offline write queue.

## Time and agenda

Dates remain civil strings; never derive them with UTC slicing of the user's clock. Each timed event has an explicit timezone. Compare occupied instants, including cross-midnight and other-zone events; adjacent end/start boundaries do not conflict. All-day dates are inclusive as in the existing web model. Recurrence reads use the existing web recurrence rules without adding series editing. Unsupported representations must be surfaced rather than silently dropped or rewritten.

## Migration and rollback

Additive migration only; legacy protection defaults conservatively to true, with no invented task links. Existing web lifecycle and reminder behavior remain authoritative. Record snapshots without expiry. Roll back clients first and retain columns/receipts; do not drop saved links or history. Validate on an isolated Supabase service before any hosted rollout.

## Verification

Use the spec-approved authenticated command/persistence and calendar-time/native-screen seams. Prove retries, stale writes in both client directions, cross-owner read/link/mutation isolation, field preservation, unlink/remove task survival and restart reads against real isolated PostgreSQL/Auth/PostgREST. Check English/Chinese, date navigation, conflict rendering, retry and read-only records in UI tests and browser smoke testing. Native export is compilation evidence only; physical iPhone validation remains a separate release gate. PR comments must distinguish executed checks from blocked hosted/device checks.
