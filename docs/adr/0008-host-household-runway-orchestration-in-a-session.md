# Host Household Runway orchestration in a framework-independent session

Household Runway startup, intent handling, and effect scheduling live behind a framework-independent Session instead of at the React render seam. The Session wraps the existing pure Interview core, exposes a snapshot and semantic intents, and depends on narrow capability ports; a thin React adapter only starts, subscribes to, and disposes the Session. This preserves the Interview core while giving hydration, draft recovery, URL projection, persistence, analytics, downloads, and lifecycle cleanup one owner.

## Considered Options

- Keep orchestration in the Household Runway view.
- Move the same orchestration into a React-specific hook.
- Host orchestration in a framework-independent Session with a thin React adapter.

## Consequences

The Session API consists of `getSnapshot`, `subscribe`, `start`, idempotent `dispose`, and `send`; the React-facing hook reduces that to a snapshot and one stable intent dispatcher. Its snapshot contains the render model and presentation-relevant statuses, capabilities, and semantic errors, while effect objects, correlation IDs, hydration bookkeeping, and adapter results remain private. Localization remains a rendering concern, and locale-aware report presentation is provided behind the report-download port.

The Session owns restoration and resume policy, destructive-action confirmation policy, navigation and locale-change subscriptions, and external-effect execution. It commits and publishes each state transition before draining effects on a microtask, deduplicates effects by type, source revision, and correlation ID, allows independent effects to run concurrently, serializes completion commands through its dispatch queue, and ignores completions after disposal. Ports separately provide draft storage, navigation and focus, plan persistence, analytics, report download, confirmation, clock and ID generation, and scheduling.

The extraction must preserve user-visible behavior. Headless Session tests characterize startup, resume conflicts, autosave, navigation, effect deduplication, stale completions, and cleanup; React integration coverage verifies composition and representative end-to-end journeys remain in place.
