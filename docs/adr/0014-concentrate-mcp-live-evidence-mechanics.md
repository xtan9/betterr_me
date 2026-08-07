# Concentrate MCP live evidence mechanics in one session

The MCP access-grant compatibility suite will use one capability-injected `LiveEvidenceSession` per target run. The compatibility aggregate runner owns that session and its final artifact, while the public-client path is an observation-producing subjourney that receives only a narrow recorder port; after the deterministic evidence kernel becomes the sole interface for evidence judgment, the session owns request capture, timing, target-aware version collection, observation collection, and two-phase artifact finalization without exposing kernel primitives to either journey.

Canonical target parsing and validation will live in a separate live-side module so both journeys receive the same immutable target, concrete loopback hosts, configured-value redaction set, and anon-key fallback. Malformed target configuration fails before live work begins, while unavailable optional credentials and external capabilities remain evidence-producing `not-proven` outcomes.

This decision narrowly refines [ADR-0009](./0009-isolate-mcp-compatibility-evidence.md): browser and SDK journey sequencing, gate catalogs, token validation, callback behavior, grant authentication, and protocol-security policy remain journey-owned, but duplicated live evidence mechanics no longer need to remain inside each journey file. The deterministic kernel remains free of browser, SDK, network, environment, clock, filesystem, and version-collection dependencies.

## Considered Options

- Preserve ADR-0009's original live-adapter consequence and accept duplicated mechanics.
- Export the duplicated leaf functions as a shared utility collection.
- Use one cohesive live evidence session plus a canonical target boundary while retaining independent journey behavior.

## Consequences

The session records the richer request-evidence superset, captures one target-aware version snapshot, and produces one authoritative aggregate report. The existing aggregate issue identity, required gate IDs, status precedence, report structure, artifact filename, nonproduction loopback allowlist, and provider-policy semantics remain stable; additive request fields and an explicit optional-mirror diagnostic are allowed. A primary artifact failure governs the required evidence gate, while failure of a configured optional mirror is reported separately.

The public-client subjourney no longer finalizes or writes an intermediate report. Unexpected journey failures attempt to preserve partial sanitized evidence before the original error is rethrown. Characterization tests, capability-faked session tests, artifact failure tests, architecture tests, and the aggregate Playwright suite must pass before the duplicated target loading, request capture, version collection, and artifact finalization code is removed.
