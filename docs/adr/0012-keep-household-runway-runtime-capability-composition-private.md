# Keep Household Runway Runtime capability composition private

ADR 0011 makes the framework-neutral five-method Runtime and the supported browser/React adapters the Household Runway Interview boundary. Side-effecting capability composition is private: the public Runtime factory accepts only deterministic and lifecycle configuration, while a private composition factory supplies restoration, Draft storage, Plan persistence, report, analytics, navigation, focus, confirmation, and scheduling capabilities to the Runtime. Private Draft requests carry the complete internal Household Runway Draft state, and private Plan requests carry the Runtime-owned durable persistence identity explicitly; neither fact crosses a supported public interface through casts or non-enumerable properties.

## Considered Options

- Add complete Draft state and durable Plan identities to the public capability request types.
- Preserve the smaller public request types and continue attaching undeclared properties for the browser adapter to recover.
- Keep capability-aware construction private while leaving the public five-method Runtime contract unchanged.

## Consequences

The browser adapter translates private typed requests directly to the existing Draft storage clients and `/api/finance/cushion` contract, then returns typed capability outcomes to the Runtime. It does not reconstruct internal effects or completion commands. The obsolete generic browser effect executor and its unused Draft, device, report, and analytics branches are removed; focused history and focus helpers remain where the browser adapter needs them. Runtime policy remains centralized: queueing, transitions, retries, stale-result checks, effect deduplication, restoration precedence, and durable identity reuse do not move into composition.

The exported browser options expose only legitimate host configuration rather than inheriting side-effecting ports. Internal contract tests may substitute private capabilities while asserting behavior exclusively through `getSnapshot()`, `subscribe(listener)`, `start()`, `send(intent)`, and `dispose()`. Structural boundary tests prevent hidden request properties, recovery casts, and the obsolete effect/command round trip from returning.

This decision changes ownership and interfaces only. Draft retention and consent, storage envelopes and keys, Plan revision conflicts, retry timing, report and analytics behavior, browser history, screen flow, the HTTP route, and its wire keys remain unchanged.
