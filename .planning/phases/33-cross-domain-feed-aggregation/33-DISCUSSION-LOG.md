# Phase 33: Cross-Domain Feed Aggregation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 33-cross-domain-feed-aggregation
**Areas discussed:** Feed API Structure, Inline Actions, Domain Item Rendering, Layer Toggle Integration
**Mode:** --auto (all defaults auto-selected)

---

## Feed API Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single unified `/api/calendar/feed` endpoint | Server-side aggregation, returns CalendarItem[] | ✓ |
| Multiple per-domain endpoints | Client aggregates from 5 separate calls | |
| Hybrid (events endpoint + aggregation endpoint) | Two calls, one for events one for the rest | |

**User's choice:** [auto] Single unified endpoint (recommended default, matches design spec)

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side parallel aggregation | Query all DB classes with Promise.all, normalize to CalendarItem | ✓ |
| Client-side aggregation | Fetch each domain separately, merge client-side | |

**User's choice:** [auto] Server-side parallel aggregation (recommended default)

---

## Inline Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic SWR updates calling existing domain APIs | Use PATCH/POST/DELETE on existing routes, optimistically update feed cache | ✓ |
| Dedicated feed mutation endpoints | New endpoints that handle cross-domain mutations | |

**User's choice:** [auto] Optimistic SWR updates with existing APIs (recommended default)

---

## Domain Item Rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Domain-colored blocks/chips with action icons | Same shape as events but domain-specific color and inline action | ✓ |
| Completely separate components per domain | Different visual treatment for each domain | |

**User's choice:** [auto] Domain-colored blocks/chips with action icons (recommended default)

---

## Layer Toggle Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side filtering, all layers enabled by default | Feed returns everything, UI filters by active toggles | ✓ |
| Server-side filtering via query params | Feed accepts `layers=events,tasks` params | |
| Client-side filtering, only events enabled by default | User opts into other domains | |

**User's choice:** [auto] Client-side filtering, all enabled (recommended default)

---

## Claude's Discretion

- CalendarItem component internal structure
- Optimistic update implementation details per domain
- shouldTrackOnDate server-side invocation
- Feed response sorting
- Workout time extraction

## Deferred Ideas

None — all discussion stayed within phase scope.
