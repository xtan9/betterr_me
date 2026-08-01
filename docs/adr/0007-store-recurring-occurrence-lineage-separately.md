# Store recurring occurrence lineage separately from tasks

A recurring-occurrence ledger keyed by Recurring Task Series and Scheduled Date stores Series Revision lineage, disposition, sequence position, and field-level overrides, with an optional one-to-one link to the visible task row. Open, completed, and Extra Occurrences have task rows; a Skipped Occurrence keeps ledger evidence without appearing as a generic task workflow status.

## Considered Options

- Keep every state, tombstone, override, and revision link on the generic tasks table.
- Delete skipped task rows and store only separate suppression dates.
- Store recurrence lineage in an occurrence ledger linked to visible tasks.

## Consequences

Lifecycle commands must update the ledger and task row in one transaction. Generic task queries stay simple, while recurrence history and idempotent materialization no longer depend on the continued presence of a visible task row.
