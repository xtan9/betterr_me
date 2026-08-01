# Use effective-dated recurring task series revisions

A Recurring Task Series keeps one user-visible identity while its changing definition is represented by effective-dated Series Revisions. A following-scope change closes the prior revision before the selected Task Occurrence and starts a successor revision at that occurrence, rather than overwriting the definition associated with earlier history.

## Considered Options

- Mutate one series row and copy selected fields onto future occurrences.
- Split the user-visible series into unrelated series.
- Retain one series identity with effective-dated revisions.

## Consequences

Materialization resolves the applicable revision for each scheduled date. Scoped changes require transactional orchestration, and Task Occurrences retain which revision produced them. Task-detail defaults may use this, following, or all scope; recurrence and ending-rule changes require an effective cutover date, while pause, resume, and end are Series commands rather than occurrence scopes. Open Occurrences may carry field-level Occurrence Overrides; Series changes update their remaining defaults. When a successor revision removes already-materialized dates, untouched Open Occurrences are withdrawn while overridden ones remain as Extra Occurrences. Untouched future occurrences are provisional for Occurrence Limit sequencing and may be resequenced during revision reconciliation; retained history is stable. Completed and Skipped Occurrences are historical facts and are not rewritten by series-scoped changes. Completion freezes the effective task details; reopening changes completion state without retroactively applying Series changes made while the occurrence was complete.
