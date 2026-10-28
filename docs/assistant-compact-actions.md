# Compact Assistant task actions

Approved in the mobile UI cleanup conversation on October 28, 2026. Ordinary
task creation should need one readable card and one explicit Add action. The
assistant must not turn an untimed task or notification request into an
unrequested calendar reservation.

The existing authenticated command route and owner-scoped SQL command are the
acceptance seams. Route tests control remote Google/DB boundaries; constrained
SQL fixtures exercise real ownership, locking, exact versions, receipts,
atomicity and history. Neither establishes live provider or mobile acceptance.

An optional `revalidate: true` on Accept checks the exact stored body against
current state within the existing transaction. It may accept an expired capture
or an unrelated planner revision when the referenced records still match and
all current occupancy checks succeed. Legacy callers keep expiry/context
behavior. No model call, new proposed dates or implicit acceptance occurs.
An exact task or routine start that was future when its proposal was created
but has since passed returns `past-time` without writes. Intentionally historic
starts already in the past at proposal creation remain supported. A date-only
deadline remains the user's exact date, including an overdue date; it is not a
calendar reservation and is never silently moved.

`POST /api/mobile/assistant/revise` accepts a new request ID, conversation ID,
source proposal ID/version, locale, task title, optional estimate/deadline, and
optional exact schedule. It supports one task-create item. Omitted fields
retain their values; null clears an optional value or removes the schedule.
It preserves project/item metadata and uses an atomic new Assistant turn to
supersede the exact source proposal. It never writes tasks or invokes a model.
An uncertain revision retries the identical request ID/body. A definitively
failed revision preserves the source and creates no partial conversation turn.

New errors are HTTP 409 `{error:'past-time'}` for revision and either that shape
or `{status:'past-time'}` from command RPC. Conflicts remain `conflict`; unknown
outcomes remain `unavailable` and retain retry identity. Successful revisions
return the existing Assistant response with proposal ID equal to request ID and
`supersededCaptureProposalId` equal to the source ID.

Rollout order is database migration, backend API, then mobile capability use.
Existing clients and guided planning commands retain their behavior. Roll back
clients first and preserve receipts/history.
