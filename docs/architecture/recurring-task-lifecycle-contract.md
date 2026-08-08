# Recurring Task Lifecycle contract evidence

Status: completed for issue #896; capability-boundary refinement implemented for issue #886

This document records the post-cutover contract for the Recurring Task Lifecycle. Dependency #691 is the activated lifecycle implementation at `a6209c30`; the release marker is `20260803000001_activate_recurring_task_lifecycle`, and the contract migration is `20260803000002_contract_recurring_task_lifecycle`.

## Contract

The domain model is a Recurring Task Series with Series Defaults, Series Revisions, a Recurrence Anchor, an Activation Date, a Recurrence Rule, a Coverage Horizon, and a Task Occurrence ledger. Occurrences may be Open, Completed, Skipped, Withdrawn, or Extra. Series may be Active, Paused, or Ended. A Series Revision and Occurrence Override preserve effective-dated history; an Occurrence Limit or Last Scheduled Date defines a stopping policy.

Lifecycle commands are the only authority for Series and Task Occurrence mutations. They own ownership, RLS, row locking, idempotency, concurrency tokens, revision conflicts, coverage, retry outcomes, and rollback. Ordinary task reads remain task-model reads: they query materialized Task Occurrence rows and never expand virtual recurrence at read time. Coverage is ensured synchronously for each date-bounded read; optional scheduled prewarming is an optimization and cannot affect correctness.

## Compatibility boundary

The existing HTTP/AI response shape is retained only by the declared adapter in `lib/recurring-tasks/compatibility.ts`. Its legacy field names (`start_date`, `end_type`, `end_date`, and `end_count`) do not represent storage or lifecycle state. Historical HTTP input is translated there at the route boundary into `Recurrence Anchor` and `Activation Date`; the internal creation intent and lifecycle requests use the accepted vocabulary.

No compatibility writer, legacy template store, generation counter, exception/original-date task field, or best-effort materializer remains in the runtime path.

## Confirmed application boundary

This refinement deepens the package boundary already chosen by ADR-0005; it does not replace the lifecycle, persistence, or domain decisions in ADRs 0001-0007. "One behavior-rich seam" means one supported package boundary with focused capabilities, not one object that combines commands, queries, scheduling, compatibility, and maintenance.

### Composition

- An authenticated production factory exposes Series commands, Series queries, and Coverage capabilities. Interactive capabilities derive ownership from the authenticated principal and do not accept a caller-supplied user ID.
- Shared Task Commands accept the visible Task identity and requested scope, detect Series membership, and delegate recurring behavior through a private lifecycle port. Recurring lineage, scope, ownership, and version validity are resolved authoritatively again inside the lifecycle transaction; delivery callers do not select a lifecycle or persistence adapter.
- A separately constructed, narrowly authorized maintenance capability owns active-Series scanning and prewarming. It is not part of the interactive command interface.
- Pure recurrence calculation and description remain available through an explicit `scheduling` subpath. Legacy HTTP and AI translation remains available through an explicit `compatibility` subpath, inside the package but outside the core lifecycle.

### Command contract

- Every mutation carries a stable operation ID that survives retry. Series-definition and Series-state mutations also carry the opaque version returned by a prior Series projection.
- Interactive HTTP, UI, and AI callers propagate those values across retries. A fresh server-generated operation ID is not a substitute for caller-visible retry identity, and a hidden pre-mutation read is not a substitute for optimistic concurrency.
- Commands return narrow, operation-specific results and a stable discriminated failure union. Canonical failures include validation, not-found, conflict, invalid-transition, and coverage-unavailable; delivery adapters map them to channel-specific presentation without parsing messages.
- The canonical destructive command is `endSeries`. Legacy HTTP `DELETE` and AI delete-shaped identifiers translate to ending at the compatibility edge. Physical erasure belongs to a separate account-erasure capability.
- Lifecycle telemetry is emitted through a private injected port rather than being added to every command result. Maintenance results may expose aggregate operational counts.

### Read contract

Focused task, sidebar, dashboard, and calendar query services ensure the requested Coverage before reading materialized Task Occurrences. They return their projection together with a structured completeness result of `complete`, `partial`, or `unavailable`; incomplete data is never represented as complete. Calendar's accepted atomic-layer policy keeps incomplete Task Occurrence overlays unavailable while preserving independently successful Habit and Workout layers, and keeps Calendar Events on their separate full-fidelity recurrence path.

Delivery policy remains explicit at the channel edge. Task reads may return available data with warnings, sidebar reads may fail closed, and AI may return a typed failure. These are presentation choices over one shared Coverage fact, not separate Coverage implementations.

### Supported package surface

The root package exports only the authenticated production capability factory and public contract types. The `scheduling`, `compatibility`, and `coverage-read` subpaths are the only supported production subpaths. Persistence state, in-memory storage, concrete Supabase lifecycle classes, telemetry plumbing, focused persistence adapters, and maintenance composition live under the private `lib/recurring-tasks/internal/` boundary.

The coordinated cutover is complete: creation and Series command behavior is folded behind the authenticated capabilities, visible Task mutations route through shared Task Commands, and the cron delivery uses its separately authorized private maintenance composition. The obsolete creation, Occurrence Adapter, and Series State Adapter entry points are removed. Production architecture tests reject unsupported deep imports, legacy writers, delivery-selected lifecycle adapters, and obsolete exports.

### Conformance and cutover

The in-memory lifecycle remains private as a fast reference implementation. One shared capability conformance suite runs against both the reference implementation and the production Supabase adapter; HTTP/AI parity, retry/conflict suites, and registered SQL fixtures remain authoritative for RLS, locking, idempotency, conflict handling, rollback, and transaction behavior.

The change ships as one reviewable production cutover: establish the capabilities and conformance suite, migrate all HTTP, UI, AI, query, calendar, dashboard, sidebar, and prewarming callers, propagate operation IDs and version tokens, enforce the import boundary, and remove obsolete paths. Intermediate commits may be incremental, but no deployed state may contain competing production command paths.

## Current evidence map

The following evidence describes the activated post-#692 lifecycle, the #886 capability-boundary refinement, and the completed #896 package cutover.

| Surface | Authority and proof |
| --- | --- |
| HTTP creation/list/read/Series mutation | `app/api/recurring-tasks/route.ts` and `[id]/route.ts` use the authenticated capabilities; legacy fields are translated at the compatibility edge and route tests cover operation IDs, opaque versions, effective dates, and typed failures. |
| AI creation/list/read/Series mutation | `lib/ai/tools/tasks.ts` uses the same public Series command/query capabilities and response adapter; recurring-task tests, `series-creation-parity.test.ts`, and `series-state-parity.test.ts` prove canonical HTTP/AI inputs. |
| Dashboard/read | `lib/dashboard/query.ts` and `lib/dashboard/supabase-query.ts` bind the authenticated principal, ensure structured Coverage before the dashboard reads materialized Task Occurrences, and preserve available data with a typed warning when Coverage is incomplete. No fallback generator or virtual expansion is available. |
| Sidebar/read | `lib/sidebar/query.ts` owns the fail-closed sidebar policy, and `lib/sidebar/supabase-query.ts` composes authenticated Coverage with materialized habit/task reads. `app/api/sidebar/counts/route.ts` passes the authenticated principal to that query and never supplies a user ID, Coverage helper, lifecycle, or persistence adapter. The sidebar query and route/import-boundary suites prove complete, partial, unavailable, authorization, and ensure-before-read behavior. |
| Calendar overlay/read | `lib/calendar/query.ts` owns authenticated Coverage orchestration before materialized Task Occurrence reads; `lib/calendar/supabase-query.ts` binds that query to the authenticated capability factory. Calendar query, adapter, and overlay route suites prove structured completeness, fail-closed task overlays, range boundaries, authorization, and the separate Calendar Event path. |
| Task writes | `lib/tasks/commands.ts` is the sole task-scoped mutation authority: it accepts visible Task identity, routes ordinary and recurring commands, and delegates recurring work through the private lifecycle port. `lib/tasks/writes.ts` remains the ordinary Task creation and reminder boundary; its obsolete recurring compatibility seam is removed. |
| Storage contract | `20260803000002_contract_recurring_task_lifecycle.sql` checks the completed immutable cutover, rewrites installed delivery functions to target storage, removes the legacy table/columns/functions/indexes, and retains only migration facts needed for audit. |
| SQL fixture | `supabase/tests/recurring_task_series_revision_capabilities.sql` is registered as a constrained transactional fixture and checks effective-dated lineage, historical Occurrence preservation, stopping policy, replay, typed stale conflicts, and rollback; the broader recurring-task fixtures provide the remaining storage/RLS evidence. |
| Import boundary | `tests/lib/recurring-tasks/import-boundary.test.ts` and `tests/scripts/recurring-package-architecture.test.ts` prove the generator, legacy DB module, and obsolete adapters are absent; delivery imports are limited to the root, `scheduling`, and `compatibility` entry points. |
| Architecture boundary | `tests/scripts/recurring-cutover-architecture.test.ts`, `series-state-adapter-architecture.test.ts`, and `occurrence-adapter-architecture.test.ts` prove activation ordering, capability routing, private Task Commands composition, no delivery-selected lifecycle adapters, and removal of legacy writers/exports. |
| Database acceptance | The registered `recurring-tasks` fixtures cover lifecycle creation, coverage horizons, overrides, completion/reopen, skip, revisions, Extra/Withdrawn dispositions, pause/resume, ending/stopping policy, retries, deletion, observability, concurrency, RLS, and rollback. |

## Current cross-channel acceptance

The existing delivery, adapter, lifecycle, and SQL suites collectively cover:

- Series creation and initial Coverage;
- Occurrence Override, completion/reopen, and Skip;
- effective-dated Series Revision;
- Extra and Withdrawn Occurrences;
- pause/resume and Ended Series behavior;
- occurrence limits and Last Scheduled Date stopping policies;
- idempotent retry and revision/concurrency conflicts;
- owner isolation, direct-write denial, and transaction rollback.

The #886 refinement and #896 cutover are evidenced by the shared capability conformance suite running against both implementations, HTTP and AI parity tests exercising the supported capabilities, retry and stale-version scenarios, the package/import architecture tests, and the registered transactional SQL fixtures.

The delivery-write inventory records the lifecycle authority as migrated through #896 and keeps ordinary task queries excluded only when they are query-only. This contract and the inventory JSON are coupled release evidence and move together for the completed authority and evidence. The former SHA-256 lock was intentionally retired when the inventory became a permanent empty, fail-closed guard under #658.
