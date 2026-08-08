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

## Issue #910 public-client evidence operation

`e2e/mcp-access-grant-public-client-profile.ts` is the deterministic Candidate 2
public-client value entry point. `runPublicClientEvidence` owns the fixed
`publicClient` profile, report issue, gate manifest, templates, sanitization,
ordering, serialization, and one artifact boundary. Its journey callback gets
only a source-bound asynchronous `record` function; facts contain primitive
observations and cannot select a source, profile, gate, status, or finalizer.

The accepted public facts cover resource/provider discovery, configuration and
versions, primary and negative registration, untrusted metadata, approval,
denial, abandonment, cleanup, exact IPv4/IPv6 loopback callback and request
binding, and S256 PKCE. Response, browser, callback, verifier, state, and token
surfaces are bounded and minimized before the recorder promise resolves.
Credential presence is tri-state; an incomplete or bounded-overflow surface is
`unknown`, and only proven absence can pass a negative-registration gate.
Missing later producers are emitted in manifest order as stable `not-proven`
gates. The artifact writer is injected, so fixed-clock tests exercise the whole
callback-to-artifact path without ambient time, filesystem, environment,
browser, SDK, or network access.

This issue deliberately does not invoke either live adapter. Delegated-token
validation and authenticated MCP-operation producers remain `not-proven` in
this profile until the later producer slices land; the adapter cutover remains
out of scope. The local deterministic contract is therefore the exact
integration limitation for #910: it proves the recorder/report/artifact
boundary and all earlier facts without claiming live provider or browser
execution.

## Issue #911 public-client security producers

The standalone profile now also accepts closed, family-specific delegated-token,
MCP-operation, grant-management, and cleanup facts. The recorder parses and
minimizes bounded token/JWKS input immediately; raw cryptographic material never
enters the retained fact history or artifact. Token policy uses the injected
sampled clock, target issuer/resource, the registered client accepted by the
family's registration history, and any grant identity accepted by the public
grant history. MCP outcomes are derived from the protected-resource request and
primitive SDK observations. Grant and cleanup facts share one family cleanup
gate, with the fixed public leaf and aggregate order preserved.

No live adapter invokes these new producers yet. The operation remains a
deterministic integration-branch capability until the planned atomic cutover.

## Issue #912 aggregate compatibility evidence

`e2e/mcp-access-grant-aggregate-profile.ts` adds the aggregate
`runAggregateCompatibilityEvidence` operation. Each invocation owns one private
session and gives its callback two source-bound recorder ports: the
compatibility recorder is authoritative, while the public-client recorder can
submit only closed shadow resource/provider discovery observations. Public
shadow discovery is retained as context but cannot decide the shared gates.

The operation derives the core compatibility profile in fixed order through
discovery, registration, authorization, loopback, S256 PKCE, protocol-negative
proofs, delegated-token verification, and an authenticated MCP operation.
Credential presence is computed from bounded primitive response surfaces, and
issuer, resource, client, grant, signing-key, and sampled-time context is
derived by the deterministic kernel. Family identity and conclusion fields are
rejected at both recorder layers.

Refresh, grant revocation, post-revocation behavior, cleanup, and the nested
public journey remain explicit `not-proven` gates in catalog order. No live
adapter invokes this operation yet; its deterministic aggregate goldens are
the evidence boundary for this slice.
