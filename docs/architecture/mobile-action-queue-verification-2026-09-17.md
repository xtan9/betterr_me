# Issue 3 verification — September 17, 2026

Implementation is reviewable. Hosted deployment and physical-iPhone verification remain pending; issue #3 is not certified complete. No production schema or founder data was changed.

## Delivered behavior

Tasks has a separate Action queue view with explicit add/remove/up/down controls. Waiting/resume, weekly allowed hours in a named timezone, and owned task dependencies are saved through shared authenticated commands. Queue removal preserves the task. Rules do not alter legacy task status, ordering, recurrence, due dates, reminders or calendar events. Reasons and unchanged estimates come from the same backend snapshot intended for later recommendations.

The editor retains drafts across language/tab changes and conflicts. Unconfirmed saves retain the exact command for retry. Failed refreshes disable changes and identify displayed facts as potentially stale. Bottom navigation stays present; per-tab scroll state is remembered, including after tapping the current tab again.

## Evidence

- Native: **12 suites, 95 tests pass**. TypeScript and Expo lint pass. Final iOS production bundle export passes; this is compilation evidence, not a physical-device test.
- Disposable Supabase Auth/PostgREST/PostgreSQL 17: explicit order and restart reads; removal leaves tasks; no calendar side effects; changed-request replay rejected; concurrent reorders have one winner; task/rule version conflicts; waiting/resume; completed and missing dependencies; self/cyclic dependency rejection; invalid timezone/day rejection; two-account read/write/reference isolation; direct planning-table writes denied; a 120-minute estimate does not fit an 80-minute gap.
- Deterministic availability checks cover inclusive starts/exclusive ends, adjacent intervals, midnight, spring-forward elapsed duration, fall-back repeated times and nonexistent spring-time boundaries. Repeated wall-time boundaries include both occurrences; nonexistent boundaries move forward by PostgreSQL's timezone gap, and reversed intervals are empty.
- The final migration replays from a clean disposable database alongside every existing web migration. The registered `mobile_action_queue.sql` fixture passes as the constrained, non-superuser `sql_fixture_test` role. The existing `verify-shared-tasks.mjs` real-service regression also passes, including recurring overrides and richer-field preservation.
- Database lint reports the pre-existing `increment_goal_current_cents` reference to missing `savings_goals`; no new queue/rule function errors.
- Browser visual validation was attempted, but Chrome automation was blocked by another extension's open UI. No visual or device pass is claimed.

## Standards review

One initial finding: reselecting the current tab could disable scroll tracking. Fixed in `0f6d4e3`; a regression test first reproduced the stale position, then passed after the guard. Independent re-review reported no unresolved standards findings.

## Spec review

The separate reviewer found the same scroll issue; re-review confirmed the fix and regression coverage. No unresolved concrete implementation mismatch or scope creep was reported. Hosted and iPhone validation remain separate acceptance gates.

Review totals after fixes: standards 0 unresolved; spec 0 unresolved code findings, with release verification still pending.

## Reproduce and release

Initialize a disposable local Supabase stack with the companion web migrations including `20260918010045_mobile_action_queue.sql`. Set `TASK_TEST_URL`, `TASK_TEST_ANON_KEY` and `TASK_TEST_SERVICE_ROLE_KEY` only in the test process, then run `node scripts/verify-action-queue.mjs`. It refuses non-loopback URLs and creates disposable users. The older shared-task regression may retain its recurring fixture account due to existing lifecycle deletion guards; remove the isolated stack after verification. Never use privileged keys in Expo public configuration.

Before release: deploy/review the companion additive migration, verify hosted grants/RLS and actual shared-client sessions, and verify the installed iPhone flow (restart, keyboard/scroll reachability, VoiceOver, large text, light/dark, English/Chinese and failure recovery). Keep both PRs unmerged and issue #3 open until required evidence is recorded. Rollback retains added tables and receipts; dropping them would lose saved queue choices and rules.
