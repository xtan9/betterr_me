# Concentrate public-client evidence semantics across MCP profiles

The standalone public-client profile and the aggregate compatibility profile
currently implement parallel public-client fact models, input hardening,
normalization, per-family history, security judgments, and IPv4/IPv6
aggregation. The compatibility journey bridges those models with unsafe casts.
We will replace that duplication with one deterministic **Public Client Evidence
Semantics** module while retaining the separate authority of each profile. This
decision refines [ADR-0009](./0009-isolate-mcp-compatibility-evidence.md) and
[ADR-0014](./0014-concentrate-mcp-live-evidence-mechanics.md); it does not merge
the profiles or weaken their existing deterministic/live boundary.

## Decision

`mcp-access-grant-public-client-semantics.ts` will expose a narrow canonical
fact port and a batch evaluator. The canonical journey-fact union will contain
only the discovery and IPv4/IPv6 public-client facts that the live public-client
journey can emit. Profile-only configuration and version snapshots will remain
outside that union. Both profile recorders will accept the same canonical fact
type, so the aggregate journey can pass its public-client recorder directly and
no adapter will cast facts or choose their catalog authority.

The evaluator will accept an ordered immutable fact snapshot, the immutable
target facts needed for judgment, sampled time for time-sensitive token facts,
and explicit dependency conclusions supplied by the calling profile. It will
own the public-client rules that must be identical in both profiles:

- hostile-input copying, validation, size limits, minimization, normalization,
  identity, fingerprinting, and conflict detection;
- per-loopback-family registration, client, grant, and cleanup history;
- negative-registration, consent, authorization, loopback, PKCE, delegated-token,
  authenticated-MCP, grant, and cleanup judgments;
- the public-client prerequisite graph and missing-dependency behavior; and
- IPv4/IPv6 leaf conclusions and their `both` aggregation.

The result will be profile-neutral semantic conclusions: semantic key, family,
status, minimized evidence, and stable error reason. It will not be a report,
artifact, catalog entry, recorder session, or live-operation result. The
evaluator may compose the deterministic evidence and protocol-policy modules,
but neither those lower modules nor the new module may depend on a profile or a
live adapter.

Equal canonical facts, target facts, sampled times, and dependency conclusions
must produce equal semantic conclusions in both profiles. A profile may produce
a different final report only because it supplies different authoritative
dependencies or applies its own catalog, manifest, and report authority.

## Profile authority remains separate

The standalone public-client profile will continue to own its operation,
source policy, authoritative discovery facts, configuration and version
snapshots, required-gate manifest, recorder lifetime, stable boundary error,
report, verification, writer, and artifact result. It will translate the shared
semantic conclusions into its own catalog gates and templates.

The aggregate compatibility profile will continue to own its aggregate
operation, compatibility facts, two source-bound recorders, combined manifest,
compatibility-authoritative discovery, report, verification, writer, and
artifact result. Public-client discovery recorded by the nested journey remains
shadow evidence. The aggregate profile will supply its authoritative discovery
conclusions as dependencies for shared public-client evaluation and then map the
result into its combined catalog.

Consequently, the shared module will not own source tagging, authoritative versus
shadow admission, profile or issue identity, gate catalogs, required-gate
selection, templates, cross-source dependency selection, recorder closure and
poisoning, asynchronous draining, run-level retention limits, clock sampling,
two-phase finalization, persistence, or artifact fallback. Generic duplication
in those mechanics is outside this decision and must not be hidden in the
public-client semantic seam.

Browser, SDK, network, environment, filesystem, physical clock, version
collection, and artifact-writing work remains in the live side established by
ADR-0009 and ADR-0014. The shared module accepts values; it does not acquire or
persist them.

## Compatibility and cutover

The cutover is behavior-preserving except for one known discrepancy that must be
resolved explicitly before extraction: the aggregate profile applies the
cataloged public-client prerequisite graph, while the standalone profile does
not currently apply the equivalent dependency step. The catalog is the
authority. The standalone behavior will first be aligned to it in a separately
reviewable contract change with updated characterization evidence. That change
must not be smuggled into a mechanical extraction.

After that correction, the extraction must preserve issue identities, source
authority, gate IDs, statuses and precedence, evidence projections and wording,
error behavior, report structure, verification, filenames, writer behavior, and
artifact fallback byte-for-byte. A staged cutover should first establish the
canonical recorder type and remove the live cast, then move public-client input
hardening and normalization, and finally move history and judgment behind the
shared evaluator. Each stage must leave both profile operations independently
usable.

## Verification contract

Completion requires all of the following evidence:

- the live public-client journey compiles against the canonical recorder port,
  the aggregate runner passes that recorder directly, and no `unknown` bridge
  remains;
- shared scenario fixtures prove equal semantic conclusions for equal complete
  inputs, including missing dependencies, conflicts, all negative-registration
  cases, both loopback families, token time boundaries, and cleanup;
- hostile-input tests exercise the shared boundary once and both profiles expose
  their existing stable failure behavior;
- authority tests prove standalone discovery remains authoritative, nested
  aggregate discovery remains shadow evidence, and neither profile accepts the
  other profile's source authority;
- profile goldens prove all observable contracts remain byte-exact after the
  separately approved prerequisite correction; and
- architecture tests prove the shared module has no profile, live-adapter,
  browser, SDK, network, environment, filesystem, clock, version-collection, or
  artifact-writing dependency.

## Consequences

Public-client security rules will harden once, tests will share one semantic
interface, and the unsafe aggregate cast will disappear. The profiles remain
deletable and testable independently around a shared deterministic capability.
The design deliberately leaves some generic session and finalization mechanics
duplicated; removing that duplication would require a different boundary and a
separate decision.
