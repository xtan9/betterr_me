# Retain ended recurring task series

The ordinary user-facing destructive action ends a Recurring Task Series instead of physically deleting it. Ending suppresses remaining Open Occurrences while retaining the Series, its revisions, completed history, and Skipped Occurrences; physical deletion is reserved for whole-account or explicit data-erasure workflows.

## Considered Options

- Delete the series row and detach completed tasks through the foreign key.
- Retain an Ended Series as the lineage of historical occurrences.

## Consequences

The lifecycle states are Active, Paused, and Ended. Active may pause or end; Paused may resume or end; Ended is terminal. Reaching an end date or Occurrence Limit uses the same end transition. Ended Series must be excluded from active views by default but remain queryable for history. "Archived" is a view concern, and product copy and APIs should say "end" rather than promising that historical data was deleted.
