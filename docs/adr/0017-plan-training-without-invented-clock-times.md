# Plan training without invented clock times

An intention such as “train legs today” names planned training, not an ordinary
task, a reservation, or a performed workout. The Assistant presents one exact
training proposal and creates it only after confirmation.

Reuse the existing Training Plan identity: a Task Occurrence in a planner series
classified as training. A date-only plan uses `timing_mode = anytime` and the
existing empty Scheduled Period. Its series has an Occurrence Limit of one and
a Last Scheduled Date equal to its initial date. This extends ADR 0016 without
creating a second occurrence ledger or a new Scheduled Period.

Anytime schedules and their revisions contain no clock times, chosen periods,
or protected reservation. Materialization creates no Calendar Event. Moving the
plan changes its Train placement metadata while preserving its immutable
Scheduled Date and occurrence ID. One-off plans are edited individually, not
through recurring-series revisions. Legacy timed readers omit anytime plans.

Assistant proposals use the explicit `training-create` action, gated by client
capability. They may reference an active, usable owned Workout Template by its
exact version. Acceptance revalidates that reference and the date under the
existing atomic capture transaction. A date or start time that has passed
remains pending for revision; it never moves silently. Receipts identify the
actual occurrence, making Today and Train read the same saved plan.

For the initial Assistant contract, an explicit time interval must include both
start and end on the same civil date. Missing duration requires one focused
clarification. Planning and fulfilling a plan never fabricate a workout session,
performed sets, or measured training time.
