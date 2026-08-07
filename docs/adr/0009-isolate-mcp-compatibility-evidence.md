# Isolate MCP compatibility evidence from live runners

The MCP access-grant compatibility suites will share a deterministic evidence kernel in `e2e/mcp-access-grant-evidence.ts`. Live adapters retain journey sequencing and all browser, SDK, network, environment, clock, filesystem, and version-collection work; the kernel accepts typed, minimized observations, composes the focused protocol rules in `mcp-access-grant-policy.ts`, classifies gates, sanitizes and verifies evidence, and finalizes reports against a required-gate manifest supplied by each suite. This additional seam keeps security judgments independently testable and removes duplicated evidence machinery from the two large live runners.

## Considered Options

- Keep security judgments and reporting mechanics local to each live runner.
- Extract only the public-client runner's currently exported classifiers.
- Share one deterministic evidence kernel while retaining separate live journeys and suite-specific gate catalogs.

## Consequences

The extraction preserves issue numbers, gate IDs, status precedence, report shape, evidence filename, human-readable decisions, and provider-policy semantics. Raw reusable credentials and live SDK or browser objects do not cross the adapter boundary; configured secrets used for leak detection and all time or version facts enter through an explicit immutable run context, replacing module-level mutable secret state. Adapters minimize observations before the kernel applies allow-listing, redaction, and final leak detection. The kernel verifies in-memory evidence, while adapters write artifacts and return the write outcome for the existing combined `sanitized-evidence` gate.

Adapters continue to orchestrate conditional OAuth and MCP steps; the kernel exposes focused classifiers and report accumulation rather than a transport state machine. Characterization and table-driven unit tests move to the kernel, while both live Playwright specs continue to verify their adapters. The migration is complete when unit tests no longer import a live runner and neither runner retains private copies of the shared gate types, report types, sanitizers, gate accumulator, or report finalizer. Deleting either adapter must leave the kernel tests runnable; deleting the kernel must remove the shared evidence capability from both adapters.

This decision does not rewrite OAuth flows, combine the two live journeys, change compatibility gates or artifacts, alter provider policy, or move test-only compatibility architecture into production code.

[ADR-0014](./0014-concentrate-mcp-live-evidence-mechanics.md) narrowly refines this decision by permitting the journeys to share a live evidence session while preserving this ADR's deterministic-kernel boundary, independent journey behavior, and suite-owned gate catalogs.
