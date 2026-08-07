# Concentrate Calendar Overlay Feed presentation behind one adapter

The Calendar page consumes a client `useCalendarOverlayFeed` presentation adapter instead of coordinating Calendar Overlay Feed transport, degradation, retry, actions, invalidation, and projection itself. The adapter accepts an inclusive local-date range and selected Overlay Feed layers; it privately resolves the presentation timezone, constructs and validates the request, and returns semantic Feed state plus a flat display projection. Calendar Events remain a separate full-fidelity read: React retains Calendar Layer selection, Calendar Event acquisition and editing, localization and markup, the single Calendar Event-versus-overlay click dispatch, and final display merging and grouping. This deepens the client boundary established by ADR 0008 without turning the adapter into a controller for the whole calendar.

## Considered Options

- Keep acquisition and actions split across the Calendar page, SWR, and the single-caller `useCalendarActions` hook.
- Create a broad Calendar presentation adapter that owns Calendar Events, the Calendar Overlay Feed, and their combined display projection.
- Concentrate only Calendar Overlay Feed presentation behavior behind one deep client adapter.

Keeping the current split leaves transport keys, degradation policy, retry lifecycle, action routing, and cache knowledge in page markup. A broad adapter would weaken the deliberate Calendar Event/Overlay Feed separation and give an overlay capability responsibility for Calendar Event editing. The focused adapter removes the orchestration leak while keeping the page as the explicit composition point for the two reads.

## Consequences

- The adapter exposes a discriminated `idle`, `loading`, `complete`, `degraded`, or `failed` Feed state. An empty layer selection is idle and performs no request. Loading never blocks Calendar Events.
- Returned items always satisfy the current inclusive date range and selected-layer contract. Contract-valid prior items may remain during transitional loading, but failed acquisition exposes no stale items. A malformed response fails closed for all selected layers.
- A failed request means every selected Overlay Feed layer is unavailable. A degraded response preserves only the server-reported trustworthy items and unavailable-layer diagnostics. React translates and renders persistent notices.
- Retry revalidates the single request for the complete current layer selection, with at most one retry in flight. It does not build client-side per-layer caches.
- The adapter routes each typed overlay action and returns a small typed outcome. React presents localized failure feedback through the existing toast surface. This refactor retains pessimistic mutations rather than adding optimistic state or rollback.
- Successful task and habit actions invalidate the Calendar Overlay Feed cache family because overlapping date ranges and layer selections may contain the same item. They do not invalidate the separate Calendar Event cache. Workout navigation does not invalidate either read.
- The single-caller `useCalendarActions` hook is absorbed into the adapter. The Calendar Event interaction hook remains separate and no longer knows how to execute overlay actions.
- Framework-free Calendar display types, Calendar Event adaptation, and final date grouping remain outside the client hook in a neutrally named display module. Mixed Calendar Event and overlay collections use `items` or `displayItems`, not `events`, and Calendar Layer selection is statically constrained rather than represented as arbitrary strings.
- Adapter tests own request construction, timezone use, response validation, empty-selection suppression, state normalization, stale-item filtering, retry, action routing, and cache invalidation. Page tests mock the adapter and own Calendar Event coexistence, localization, final composition, and mixed-item dispatch.
- The existing `/api/calendar/overlay-feed` route, application query, Calendar Event acquisition behavior, markup, localization, and view choice remain unchanged.

## Follow-up implementation decisions

- `EventBlock` and `EventChip` remain presentation-primitive names. Their interfaces consume `CalendarDisplayItem`, and mixed collections and callbacks use `item` or `displayItems`; renaming the primitives would add churn without deepening the adapter or clarifying a collection contract.
- The response Zod schema remains private to the client adapter because it validates untrusted JSON at that trust seam. The server continues to construct the response from typed application outcomes rather than sharing a runtime wire schema across the network boundary. Local-date and inclusive-range semantics are shared through `lib/validations/calendar-overlay-feed.ts` so the client request adapter and HTTP route cannot drift on the 42-day policy.
