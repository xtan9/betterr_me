# Plan routine series management

Approved by the user on 2026-09-25; product spec is `docs/plan-workspace-spec.md` in betterr_me_mobile. Plan contains Tasks, Projects and Routines. This adds the date-independent library and previewed edit/pause/resume/end of scheduled routine series, not unscheduled web repeating tasks.

The existing Recurring Task Lifecycle remains the writer of series, revisions and occurrences. An atomic mobile command combines it with effective-dated reservation times. Historical, completed, started and individually adjusted occurrences keep their content; retained open occurrences use full defaults as overrides when a series change would otherwise alter them. Suppressed retained occurrences become Extra Occurrences under the established lifecycle. No completion button acts on a series.

Time zone is immutable here. Local effective dates cannot precede today, activation or the current revision. Resume never fills the pause interval; Ended is terminal. Complex rules are readable but not editable in mobile. A bounded real rule calculation supplies the next date; unavailable or exhausted calculations are explicit, never fabricated.

Operational bounds: an interactive effective date must be within 366 days of the earliest valid date. Edit/resume require the chosen day's start to be in the future; the client defaults to tomorrow once today's time has passed. Before a future end boundary, materialize its remaining active interval in the same transaction because an Ended Series must never generate new occurrences later. A future pause retains effective-dated active coverage before its boundary.

Preview is read-only and binds the series/schedule and affected occurrence/task/event versions plus the proposed command in a digest. Commit checks it under the series lock, preserves exceptions, delegates the lifecycle, synchronizes reservations, and records an immutable operation receipt in one transaction. Transport retry reuses that request; a changed request or stale preview conflicts. Unexpected downstream failure rolls everything back.

Test seam: authenticated public RPCs and observable readback, rollback, replay, stale preview, two-account isolation, time changes and pause/resume calendar consistency. Deploy the additive migration before mobile. Roll back the client first; retain revisions, receipts and history. Local verification does not authorize a production data rewrite. Physical iOS acceptance is recorded separately.
