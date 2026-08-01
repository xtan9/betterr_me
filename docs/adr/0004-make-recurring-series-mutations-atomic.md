# Make recurring task series mutations atomic

The Recurring Task Lifecycle is the TypeScript-facing seam, while every command that changes a Series, its revisions, and its Task Occurrences commits atomically for that Series in Postgres. Coverage expansion may report partial success across independent Series, but it must never advance one Series unless all of that Series' required occurrences and bookkeeping commit together.

## Considered Options

- Orchestrate independent Supabase table calls in TypeScript and repair partial writes on retry.
- Execute each Series mutation inside one database transaction behind the lifecycle adapter.

## Consequences

The Supabase adapter needs transactional database functions for cross-table commands. It serializes concurrent work on the same Series with a row lock while allowing different Series to proceed independently. User-facing revision and state commands also carry an expected revision/state token and return a typed conflict rather than silently applying stale last-write-wins changes; coverage maintenance re-reads and adapts to the latest state. Interactive functions derive ownership from the authenticated principal instead of trusting a caller-supplied user ID; any background-worker capability is separate and narrowly granted. Mutating commands carry an idempotency key whose outcome is recorded in the same transaction, so retrying cannot duplicate revisions or effects. The lifecycle returns explicit per-Series outcomes and may aggregate them into a partial coverage result. Multi-Series reads may return available data with a structured degraded warning, but must never represent incomplete coverage as complete; a single-Series command fails atomically when its required coverage cannot commit.
