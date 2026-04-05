# Phase 30: Calendar Event CRUD API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 30-calendar-event-crud-api
**Areas discussed:** API route structure, Recurrence expansion, Exception handling, Date range query
**Mode:** --auto (all decisions auto-selected)

---

## API Route Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Nested routes | `/api/calendar-events/route.ts` + `/api/calendar-events/[id]/route.ts` — matches existing pattern | ✓ |
| Flat routes | Single route file with method switching | |

**User's choice:** [auto] Nested routes (recommended — matches habits/tasks pattern)
**Notes:** Consistent with all existing API routes in the codebase.

---

## Recurrence Expansion

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side expansion | Expand recurring events in GET API, return flat list | ✓ |
| Client-side expansion | Return raw recurring events, client calculates occurrences | |

**User's choice:** [auto] Server-side expansion (recommended — client stays simple)
**Notes:** Pure utility function in lib/calendar/recurrence.ts for testability.

---

## Exception Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Exception records | Create exception row for single edits, update parent for all edits | ✓ |
| Inline modifications | Store edit overrides in parent's JSONB field | |

**User's choice:** [auto] Exception records (recommended — matches design spec)
**Notes:** Follows the recurring_event_id + is_exception + original_date pattern from the design spec.

---

## Date Range Query

| Option | Description | Selected |
|--------|-------------|----------|
| Query params | `?start_date=...&end_date=...` with recurrence expansion inline | ✓ |
| POST body | Send date range in request body | |

**User's choice:** [auto] Query params (recommended — RESTful, matches existing pattern)
**Notes:** Client sends local date strings per timezone handling convention.

---

## Claude's Discretion

- Recurrence expansion algorithm details
- Error response format for edge cases
- Soft-delete support decision

## Deferred Ideas

None.
