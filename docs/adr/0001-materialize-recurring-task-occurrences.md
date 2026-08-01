# Materialize recurring task occurrences

Task Occurrences are persisted before callers read them instead of being expanded virtually at query time. This keeps completion, exceptions, scoped changes, and ordinary task queries on one task model; the Recurring Task Lifecycle must make materialization idempotent and ensure the caller's requested date range is covered.

## Considered Options

- Persist Task Occurrences before reads.
- Expand virtual occurrences during reads and persist only after interaction.

## Consequences

The lifecycle owns generation bookkeeping and recovery from partial writes. Reads that need occurrences through a date must explicitly ensure that Coverage Horizon before querying task storage. A scheduled job may prewarm coverage but is not required for correctness. Series identity plus Scheduled Date is the stable unique identity of one occurrence even when its due date changes; a Series cannot schedule twice on one local date. A Skipped Occurrence must leave durable evidence so later materialization cannot recreate it. Recurrence uses wall-clock local dates; the lifecycle derives today from its clock and the user's stored IANA timezone unless user intent supplies an explicit effective date.
