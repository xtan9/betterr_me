# Recurring Task Lifecycle contract evidence

Status: accepted for issue #692

This document records the post-cutover contract for the Recurring Task Lifecycle. Dependency #691 is the activated lifecycle implementation at `a6209c30`; the release marker is `20260803000001_activate_recurring_task_lifecycle`, and the contract migration is `20260803000002_contract_recurring_task_lifecycle`.

## Contract

The domain model is a Recurring Task Series with Series Defaults, Series Revisions, a Recurrence Anchor, an Activation Date, a Recurrence Rule, a Coverage Horizon, and a Task Occurrence ledger. Occurrences may be Open, Completed, Skipped, Withdrawn, or Extra. Series may be Active, Paused, or Ended. A Series Revision and Occurrence Override preserve effective-dated history; an Occurrence Limit or Last Scheduled Date defines a stopping policy.

Lifecycle commands are the only authority for Series and Task Occurrence mutations. They own ownership, RLS, row locking, idempotency, concurrency tokens, revision conflicts, coverage, retry outcomes, and rollback. Ordinary task reads remain task-model reads: they query materialized Task Occurrence rows and never expand virtual recurrence at read time. Coverage is ensured synchronously for each date-bounded read; optional scheduled prewarming is an optimization and cannot affect correctness.

## Compatibility boundary

The existing HTTP/AI response shape is retained only by the declared adapter in `lib/recurring-tasks/compatibility.ts`. Its legacy field names (`start_date`, `end_type`, `end_date`, and `end_count`) do not represent storage or lifecycle state. Historical HTTP input is translated there at the route boundary into `Recurrence Anchor` and `Activation Date`; the internal creation intent and lifecycle requests use the accepted vocabulary.

No compatibility writer, legacy template store, generation counter, exception/original-date task field, or best-effort materializer remains in the runtime path.

## Evidence map

| Surface | Authority and proof |
| --- | --- |
| HTTP creation/list/read | `app/api/recurring-tasks/route.ts` and `[id]/route.ts` call the activated lifecycle; response translation is explicit and tested in the route suites. |
| AI creation/list/read | `lib/ai/tools/tasks.ts` uses the lifecycle and the same response adapter; `tests/lib/ai/tools/recurring-tasks.test.ts` and `series-creation-parity.test.ts` prove parity. |
| Dashboard/read | `lib/dashboard/dashboard-snapshot.ts` requires `ensureRecurringCoverage` before ordinary task queries; failed coverage is surfaced as a typed warning. No fallback generator or virtual expansion is available. |
| Task writes | `lib/tasks/writes.ts`, `occurrence-adapter.ts`, and `series-state-adapter.ts` use narrow Task/Occurrence and Series State seams; ordinary Task Writes reject scoped recurrence mutations unless the lifecycle adapter owns them. |
| Storage contract | `20260803000002_contract_recurring_task_lifecycle.sql` checks the completed immutable cutover, rewrites installed delivery functions to target storage, removes the legacy table/columns/functions/indexes, and retains only migration facts needed for audit. |
| SQL fixture | `supabase/tests/recurring_task_legacy_contract.sql` is registered as a constrained transactional fixture and checks retired storage, active function bodies, RLS, execute/direct-write privileges, and rollback. |
| Import boundary | `tests/lib/recurring-tasks/import-boundary.test.ts` proves the generator and legacy DB module are absent and compatibility translation is declared. |
| Architecture boundary | `tests/scripts/recurring-cutover-architecture.test.ts`, `series-state-adapter-architecture.test.ts`, and `occurrence-adapter-architecture.test.ts` prove activation ordering, adapter routing, and no legacy writers. |
| Database acceptance | The registered `recurring-tasks` fixtures cover lifecycle creation, coverage horizons, overrides, completion/reopen, skip, revisions, Extra/Withdrawn dispositions, pause/resume, ending/stopping policy, retries, deletion, observability, concurrency, RLS, and rollback. |

## Cross-channel acceptance

The acceptance suite proves the same lifecycle outcomes across HTTP, AI, dashboard/read, and the SQL boundary for:

- Series creation and initial Coverage;
- Occurrence Override, completion/reopen, and Skip;
- effective-dated Series Revision;
- Extra and Withdrawn Occurrences;
- pause/resume and Ended Series behavior;
- occurrence limits and Last Scheduled Date stopping policies;
- idempotent retry and revision/concurrency conflicts;
- owner isolation, direct-write denial, and transaction rollback.

The delivery-write inventory records the lifecycle authority as migrated under #692 and keeps ordinary task queries excluded only when they are query-only. This file, the inventory JSON, and its SHA-256 lock are release evidence and must move together.
