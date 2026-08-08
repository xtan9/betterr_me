# Candidate 2 MCP evidence catalogs

Issue #907 locks the evidence contract used by the two Candidate 2 report
profiles. The machine-owned catalog is
[`e2e/mcp-access-grant-catalogs.ts`](../../e2e/mcp-access-grant-catalogs.ts):
it contains the profile identities, gate order, family expansion, closed fact
identities, source authority, dependency graph, classifiers, templates,
projections, request recipes, and decision cases.

The public-client profile is issue #765 and the compatibility profile is issue
#768. Both produce `mcp-access-grant-evidence.json`. Required gate IDs are
ordered in `PUBLIC_CLIENT_REQUIRED_GATE_IDS` and
`COMPATIBILITY_REQUIRED_GATE_IDS`; the public family gates expand in the
fixed order `ipv4`, `ipv6`, followed by their `-both` aggregate. Missing
observations are `not-proven`, and aggregate outcomes use the precedence
`fail`, `not-proven`, `pass` when selecting the most severe child result.

Compatibility discovery is authoritative for the compatibility profile.
Nested public-client discovery observations are shadow evidence and cannot
replace compatibility-owned facts. A source/fact combination that is not in
the closed source-policy catalog is rejected. The negative-registration rule
is security-first: credentials or any 2xx response fail; a recognized 400 or
422 metadata error passes only when credential absence is proven; every other
state remains `not-proven`.

## Kernel and live-session boundary

The private deterministic kernel records and classifies evidence facts. The
live `LiveEvidenceSession` mechanics described by ADR 0014 own target,
request, version, environment, artifact, and cleanup mechanics. The catalogs
are the contract shared by those layers; this ticket does not change adapter
journey behavior.

An unexpected callback is a rejected observation, not a partial success. Per
the Candidate 2 decision in issue #906, the live session closes and drains
accepted work, discards raw callback references, skips evidence finalization
and writing, and rethrows a stable secret-free error. This resolves the older
partial-artifact expectation in favor of #906 while retaining ADR 0014's live
ownership boundary.

Validate the complete catalog with:

```text
pnpm exec vitest run tests/e2e/mcp-access-grant-catalogs.test.ts
```
