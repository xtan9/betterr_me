# Preserve legacy recurring task facts during migration

Migration treats existing task rows as authoritative, freezes completed occurrences, infers field-level overrides only from observable differences, and does not regenerate unexplained gaps before the migrated Coverage Horizon. Because legacy data has neither pause-effective timestamps nor durable skipped-occurrence evidence, the migration cutover date is the boundary from which the new pause and skip guarantees apply.

## Consequences

Legacy history may not fully express the new model, but migration will not invent, delete, or rewrite user-visible facts to make it appear otherwise. Additive schema and backfill may ship ahead of the behavior change, but every HTTP, AI, and task writer switches in one coordinated cutover; there is never a prolonged mix of legacy and lifecycle writers.
