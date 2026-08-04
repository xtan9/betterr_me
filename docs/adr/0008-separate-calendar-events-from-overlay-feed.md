# Separate Calendar Events from the Calendar Overlay Feed

Calendar Events retain their full-fidelity read path, while a Calendar Overlay Feed projects the selected task, habit, and workout Calendar Layers alongside them. We chose two explicit reads over a nominally unified feed because the existing event projection discards details and recurrence identity required for event editing; the overlay boundary can therefore stay focused on acquisition, normalization, and degraded-result policy without weakening Calendar Events.

## Considered Options

- Keep acquisition and partial-failure policy in the HTTP route.
- Normalize Calendar Events and every overlay layer through one unified feed.
- Keep full-fidelity Calendar Events separate and introduce a focused Calendar Overlay Feed application query.

## Consequences

The internal endpoint becomes `/api/calendar/overlay-feed` and requires one or more of the `tasks`, `habits`, and `workouts` layers. Its framework-free application module accepts an authenticated person, a validated inclusive local-date range of at most 42 days, selected layers, and an optional valid IANA timezone. Authentication, query parsing, HTTP mapping, and UI rendering remain adapters.

Each selected layer is atomic. Task acquisition ensures Coverage Horizon before reading tasks; habit acquisition requires both habits and completion logs. Selected layers start concurrently, and successful items have deterministic display ordering. Capability-shaped acquisition ports hide Supabase, with one Supabase composition adapter supplying the concrete reads.

The module returns typed `complete`, `degraded`, or `failed` outcomes. A degraded outcome contains trustworthy items plus machine-readable unavailable-layer diagnostics; if every selected layer is unavailable, the outcome is failed. The HTTP adapter maps complete and degraded outcomes to 200 and failed acquisition to 503, without exposing raw errors or server-authored display text. The calendar keeps successful layers visible and shows a persistent localized notice with retry while any layer is unavailable.

Overlay items form a discriminated union with one layer-specific action rather than an unconstrained action array or untyped metadata. Core tests own acquisition, degradation, ordering, and concurrency policy; Supabase adapter tests own query mapping and recurring coverage; route tests own authentication, validation, and HTTP translation.
