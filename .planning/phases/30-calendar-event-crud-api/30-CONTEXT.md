# Phase 30: Calendar Event CRUD API - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** Auto-selected defaults (--auto mode)

<domain>
## Phase Boundary

Full event create/read/update/delete API with recurrence support, testable independently before any UI. This phase delivers API routes only — no frontend components.

</domain>

<decisions>
## Implementation Decisions

### API Route Structure
- **D-01:** Use nested route pattern: `app/api/calendar-events/route.ts` (GET list, POST create) and `app/api/calendar-events/[id]/route.ts` (GET single, PATCH update, DELETE). Matches existing habits/tasks/recurring-tasks patterns.
- **D-02:** All routes follow the established pattern: `createClient()` → `getUser()` → auth check → instantiate DB class → operation → return JSON.

### Recurrence Expansion
- **D-03:** Server-side recurrence expansion in the GET list endpoint. When querying a date range, expand recurring events into virtual occurrences for that range. Client receives a flat list of events (both standalone and expanded occurrences).
- **D-04:** Reuse the existing `RecurrenceRule` type and expansion logic pattern from recurring tasks. The recurrence expansion function should be a pure utility in `lib/calendar/recurrence.ts` for testability.
- **D-05:** Expanded occurrences should be marked with a `is_virtual: true` flag (not persisted) so the client knows they're generated, not stored.

### Exception Handling (Edit This/All Occurrences)
- **D-06:** "Edit this occurrence" → Create an exception record: new row with `is_exception: true`, `recurring_event_id` pointing to parent, `original_date` set to the occurrence date being edited. The exception replaces the virtual occurrence for that date.
- **D-07:** "Edit all occurrences" → Update the parent recurring event directly. All future virtual expansions reflect the change.
- **D-08:** "Delete this occurrence" → Create an exception with the original fields but mark it as cancelled (or simply skip that date during expansion by checking exceptions). Implementation detail: use a `status: 'cancelled'` convention or simply check `is_exception` records during expansion to skip matching dates.

### Date Range Query
- **D-09:** GET `/api/calendar-events?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` returns all events (standalone + expanded recurring) in the range. Both params required.
- **D-10:** The `date` query param pattern from existing APIs (habits, tasks) is followed — client sends local date strings.

### Validation
- **D-11:** Use the Zod schemas created in Phase 29 (`calendarEventCreateSchema`, `calendarEventUpdateSchema`) via `validateRequestBody()` helper.

### Claude's Discretion
- Recurrence expansion algorithm details (how to generate dates from rules)
- Error response format for conflict cases (e.g., editing a deleted exception)
- Whether to add a `status` field to calendar_events for soft-delete support

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Spec
- `docs/superpowers/specs/2026-03-30-calendar-reminders-design.md` — Full design spec for calendar & reminders milestone. Defines data model, recurrence approach, and architecture.

### Existing Patterns (API routes)
- `app/api/habits/route.ts` — Reference pattern for list + create API route
- `app/api/habits/[id]/route.ts` — Reference pattern for single item CRUD
- `app/api/recurring-tasks/route.ts` — Reference for recurrence-related API patterns
- `app/api/recurring-tasks/[id]/route.ts` — Reference for individual recurring entity CRUD

### DB & Validation (Phase 29 outputs)
- `lib/db/calendar-events.ts` — CalendarEventsDB class with CRUD methods
- `lib/db/types.ts` — CalendarEvent, CalendarEventInsert, CalendarEventUpdate types + RecurrenceRule type
- `lib/validations/calendar-events.ts` — Zod create/update schemas
- `lib/validations/api.ts` — validateRequestBody helper

### Utilities
- `lib/db/ensure-profile.ts` — ensureProfile helper (used in POST routes)
- `lib/utils.ts` — getLocalDateString utility

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CalendarEventsDB` class (Phase 29) — getUserEvents, getEvent, createEvent, updateEvent, deleteEvent, getRecurringEvents, getExceptions
- `calendarEventCreateSchema` / `calendarEventUpdateSchema` — Zod validation ready
- `RecurrenceRule` type and `recurrenceRuleSchema` — from recurring tasks, reusable for expansion logic
- `validateRequestBody()` — standard validation helper for API routes

### Established Patterns
- API routes: createClient → getUser → auth check → DB class → respond
- Error handling: try/catch → log.error → NextResponse.json({ error }, { status })
- Date handling: client sends local date string, never use server-side UTC

### Integration Points
- `app/api/calendar-events/` — new route directory
- `lib/calendar/` — new directory for recurrence expansion utility
- Categories table FK already in place (category_id on calendar_events)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing API patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-calendar-event-crud-api*
*Context gathered: 2026-03-31 via --auto mode*
