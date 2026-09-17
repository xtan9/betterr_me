# Issue 2: shared task capture

Approved scope: issue #2 and `ios-mvp-spec.md`, original A, English/Simplified Chinese. Implementation uses the existing Supabase identity and `public.tasks`; no calendar event is created.

## Mapping and preservation

The web main baseline is `ad211c21`. Tasks already contain title, description, priority, category, project, completion/status, section/order, due_date (DATE), due_time (TIME), recurrence identities/overrides, and timestamps. Estimates and archive state do not exist. Existing task commands provide ownership and replay but ordinary edits do not compare a row version.

Add nullable `estimate_minutes` (positive integer), nullable `archived_at`, and a UUID `version` changed by a database trigger on every update, including legacy web writes. Unknown estimates remain null; do not derive them from calendar blocks, difficulty, or actual work. Archive changes only archived_at. It does not change completion/status, recurrence, linked events, reminders, or history. Unarchive clears only archived_at. Read completed tasks without exposing completion controls.

The native editor sends a patch containing only changed title/estimate/due-date fields. Keep due_time, reminder configuration, availability, projects, priority, completion, and other richer fields untouched. Dates remain YYYY-MM-DD strings, never converted to UTC. Recurring title/due-date edits delegate to the existing occurrence lifecycle after locking series, occurrence, and task in lifecycle order. Estimates and archive state are task-owned metadata; they do not end a series or change occurrence state. Completed/skipped/withdrawn occurrences retain lifecycle restrictions for title/date edits and return explicit rejection.

## Authenticated command and compatibility

An additive `task_capture_command` RPC provides create, edit, archive and unarchive for tasks. Derive owner exclusively from auth.uid(); require a UUID operation ID; require the exact row version for existing-task mutations. Lock the operation identity and row in one transaction. Compare request fingerprints before replay; reject reuse with a changed payload. Store successful outcomes in an RLS-protected receipt table. Replay the saved response before checking the now-advanced version. Reject unsupported fields and operations.

All existing writers advance the row version, so mobile stale writes cannot overwrite newer web edits. The companion web PR adds version checking to the ordinary edit command and sends the version captured when its edit form loaded. Old clients without a supplied version retain legacy behavior; this is not a claim that every old API/AI caller has acquired optimistic concurrency. Native request failures preserve the immutable pending command for retry, lock its inputs until resolved, and never report success before a receipt. Conflicts retain draft text and offer explicit reload of current data. Refresh on entering Tasks and app foreground; no offline queue or realtime guarantee.

## Migration, rollout, rollback

Schema ownership stays in the web repository. Companion branch: `codex/mobile-shared-tasks`. Deploy its additive migration before enabling the mobile screen. No backfill alters existing task semantics. A missing RPC/schema is a visible load/save failure, never a local-only success. Roll back the mobile binary and web code first; retain additive columns and receipts to preserve saved estimates, archives and retry identities. Do not drop data as rollback. Shared production migration is not applied merely to make local tests pass.

## Verification seams and release gates

Use the already-approved authenticated persistence boundary for create/read/edit/archive/retry/conflict/isolation checks, including unknown-field preservation and absence of calendar side effects. Use the native screen boundary for empty capture, pending/failed-save retry, language preservation, conflict/reload, and navigation/account reset. Follow TDD at these seams. Run typecheck, focused tests, full native suite, lint and iOS export. Independently review against main and the issue before PR creation.

Use an isolated PostgreSQL instance for migration/transaction tests and record any distinction from hosted Supabase/API testing. Physical-iPhone verification (keyboard, VoiceOver, light/dark, locale, restart, shared-account web visibility) remains required. Apple enrollment/signing was not complete in the latest recorded auth verification. Leave PRs unmerged and issue open if required service/device validation is blocked.
