# Issue 2 verification — September 17, 2026

Implementation is reviewable, but issue #2 is not certified complete. The production Supabase migration and physical-iPhone validation remain pending. No production schema or founder task data was changed.

## Delivered behavior

- Native Tasks reads the shared owner-scoped task table, including existing and completed records, with active/archive views and explicit refresh.
- Capture/edit title, optional whole-minute estimate and optional date without creating calendar time. Send changed fields only; preserve richer fields, due time, reminders and completion state. New/changed titles follow the web editor's 100-character limit; an unchanged longer legacy title is preserved.
- Archive/unarchive preserve the task and its linked history. Recurring title/date edits update occurrence overrides through the existing lifecycle; sibling occurrences stay unchanged. Terminal occurrences retain the existing lifecycle restrictions and display explicit rejection.
- Immutable operation identity on retry, version conflict feedback with draft preservation, explicit discard/reload, and account-keyed screen state. No offline queue or completion/reopen control is introduced.

## Evidence

- Native suite: **11 suites, 90 tests pass**. TypeScript and Expo lint pass. iOS production bundle export passes; this is compilation evidence, not a device test.
- Real local Supabase Auth/PostgREST/PostgreSQL 17: empty-account create; no calendar event created; duplicate and concurrent request replay; changed-payload key rejection; second-account read/write/receipt isolation; new authenticated client reads saved data; stale mobile and web ordinary edits rejected; stale recurring web edits rejected; richer description/priority/due-time preservation; reminder preservation across archive/unarchive; invalid writes leave current data intact; recurring overrides and sibling/history preservation. Reproducible entry point: `scripts/verify-shared-tasks.mjs`.
- The companion backend has a registered constrained SQL fixture for capture, replay, no calendar side effect, ordinary cross-client conflicts, archive/unarchive and two-account isolation. It passes using the non-superuser `sql_fixture_test` role.
- Browser preview against that isolated service: sign-in, empty Tasks, create with estimate/date, switch English to Chinese while keeping entered text, save, reload and restore, archive, find in Archived, and unarchive all pass. Dark presentation inspected. Local profile access required the web repository's existing `e2e_local_authenticated_grants.sql` fixture, not a production grant change.
- Standards review found a canceled-reload race; fixed with editor identity and a deferred-response regression. Spec review found recurring web version propagation missing; fixed and verified at the real RPC boundary. Both independent re-reviews report no remaining findings.
- Full companion web suite initially found missing Traditional Chinese keys (fixed) and one unrelated MCP architecture failure. That MCP test also fails unchanged on web main `ad211c21`, at `tests/e2e/mcp-access-grant-architecture.test.ts:154`. Final full web run: 469 suites pass, 5,774 tests pass, and that one baseline test fails. Relevant task/API/lifecycle/translation/fixture checks pass. Backend TypeScript passes; lint has no errors and the existing React Hook Form compiler warning.
- The final migration replays successfully from a clean isolated database with all existing web migrations.
- Local database lint reports the existing `increment_goal_current_cents` reference to missing `savings_goals`; no new task-function errors.

## Reproduce persistence checks

Use a disposable local Supabase stack initialized from the companion web migrations, including `20260917234436_mobile_task_capture.sql`. Set `TASK_TEST_URL`, `TASK_TEST_ANON_KEY`, and `TASK_TEST_SERVICE_ROLE_KEY` only in the test process, then run `node scripts/verify-shared-tasks.mjs`. The script refuses non-loopback URLs. These privileged test variables are never Expo public configuration. It creates disposable accounts; existing recurring deletion guards can retain a fixture account, so remove the entire isolated test stack afterward. Never run cleanup against shared services.

## Remaining release gates

1. Review and deploy the companion additive migration, then verify the hosted API's grants/RLS and both real client sessions. Web code and the native binary depend on that migration.
2. On an installed iPhone development build, verify keyboard/scroll reachability, VoiceOver, large text, light/dark, both languages, restart/session restore, failed-save retry and cross-client changes. Apple enrollment/signing was still pending in the latest account-access report.
3. Legacy callers that omit task versions retain legacy concurrency behavior. The updated web edit form and native commands carry versions; this does not claim every older API/AI write path is versioned. Web archive/estimate controls are not added by this native slice; the columns are retained in shared records.

Keep the issue open and PRs unmerged until required hosted and device evidence is recorded. Rollback retains added columns and receipts; do not drop user estimates, archives or retry history.
