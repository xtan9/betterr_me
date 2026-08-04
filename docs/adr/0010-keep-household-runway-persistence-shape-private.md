# Keep Household Runway persistence shape private

Household Runway callers consume a domain `HouseholdRunwayPlan` containing a revision and committed inputs, while the Household Runway repository adapter exclusively owns the `finance_cushions` row shape, its minimal selected columns, legacy scalar-column reconstruction, and row validation. Shared input-version migration remains independent of persistence because both persisted Plans and Household Runway Drafts use it; the HTTP adapter preserves the legacy `/api/finance/cushion` path and meaningful `revision`/`answers` wire keys without exposing database metadata to domain callers.

## Considered Options

- Continue returning a storage-shaped `FinanceCushionView` and only move its declaration.
- Give callers a minimal Household Runway Plan and keep storage interpretation private to the repository.

## Consequences

`HouseholdRunwayPlan.revision` is the single revision authority, and Plan construction rejects invalid revisions. A missing revision on a genuine legacy read normalizes to zero, but a present invalid revision or non-null answers that cannot be migrated raises a typed persistence-integrity error; commit responses are stricter and must contain current valid answers whose revision matches the RPC outcome. Repository tests own current-row mapping, legacy reconstruction, commit mapping, and invalid-row cases; answer-migration tests remain separate, and an import-boundary test prevents database record concepts from returning to the calculation module.
