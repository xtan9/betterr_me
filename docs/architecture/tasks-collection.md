# Tasks collection persistence

Approved companion scope: BetterRMe mobile's 2026-09-19 Tasks/Projects handoff and `docs/ios-mvp-spec.md` refinement. Ready/Later/Done reuse existing tasks, action_queue_state and authenticated command boundaries. Completion dates are existing data, never backfilled from a guessed time.

The additive migration adds task_action_rules.available_after (nullable civil date) evaluated in the rule timezone. The existing rules command preserves it for old clients that omit availableAfter. Existing RLS, ownership predicates, cycle validation, receipt replay and version checks remain in force.

Completed parents now reopen atomically when an unfinished child is added, moved in, restored or reopened. Explicit project completion retains its open-child guard. The planner wrapper adds versioned/idempotent reopen-project and Undo of reopen operations, including parent and occurrence snapshots. Undo checks all affected versions, refuses subsequently added reservations, and restores the original completion timestamp. Undoing an older child completion after explicitly completing its parent conflicts.

Tests: mobile `scripts/verify-tasks-collection.mjs`, action queue, completion and Undo regression scripts run against the existing disposable loopback stack; no hosted changes. Deployment order is backend first, mobile second. Reverting the mobile UI is safe; retain the additive date column and receipt/history records when rolling back commands.

## Verification — 2026-09-19

Registered `supabase/tests/mobile_tasks_collection.sql` as a constrained, transactional CI fixture. It passes using `sql_fixture_test` against the disposable local stack, alongside existing projects, action queue, planner completion, planner Undo and routine occurrence fixtures. Registry validation passes. Mobile authenticated integration scripts additionally cover historical ended sessions, recurring reopening through the shared web command, missing historical completion timestamps, queue preservation, receipt replay and ownership.

The migration was replayed successfully against the pre-feature function definitions within a rolled-back local transaction. Standards and spec reviews cleared reported issues. Supabase's security advisor CLI could not connect locally; direct privilege checks passed for the changed private/public functions. Hosted deployment and shared-account compatibility remain release checks; no hosted schema was changed.
