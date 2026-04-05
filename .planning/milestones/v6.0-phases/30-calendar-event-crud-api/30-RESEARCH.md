# Phase 30: Calendar Event CRUD API — Research

## Executive Summary

Phase 30 delivers the full Calendar Event CRUD API with recurrence expansion. All foundational infrastructure is in place from Phase 29: the `CalendarEventsDB` class, `CalendarEvent` types, Zod validation schemas, and the `calendar_events` table. The existing `getOccurrencesInRange()` function in `lib/recurring-tasks/recurrence.ts` handles all recurrence frequency types and can be directly reused for calendar event expansion. The main new work is: (1) two API route files following established patterns, (2) a recurrence expansion utility at `lib/calendar/recurrence.ts` that wraps the existing `getOccurrencesInRange()` with exception-awareness and virtual occurrence generation, and (3) comprehensive tests.

**Risk level:** Low. The patterns are well-established, the DB class is ready, and the recurrence algorithm already exists.

## Existing API Route Pattern

All API routes follow a consistent structure. Based on `app/api/habits/route.ts`, `app/api/habits/[id]/route.ts`, `app/api/recurring-tasks/route.ts`, and `app/api/recurring-tasks/[id]/route.ts`:

### List + Create Route (`route.ts`)

```
GET handler:
1. const supabase = await createClient()
2. const { data: { user } } = await supabase.auth.getUser()
3. if (!user) → 401
4. Parse searchParams for filters
5. const db = new XxxDB(supabase)
6. const results = await db.getItems(user.id, filters)
7. return NextResponse.json({ items: results })

POST handler:
1. const supabase = await createClient()
2. const { data: { user } } = await supabase.auth.getUser()
3. if (!user) → 401
4. const body = await request.json()
5. const validation = validateRequestBody(body, createSchema)
6. if (!validation.success) return validation.response
7. await ensureProfile(supabase, user)
8. const db = new XxxDB(supabase)
9. const item = await db.createItem(user.id, { ...validation.data })
10. return NextResponse.json({ item }, { status: 201 })
```

### Single Item Route (`[id]/route.ts`)

```
GET: createClient → getUser → auth check → db.getItem(id, userId) → 404 if null → return item
PATCH: createClient → getUser → auth check → parse body → validateRequestBody(body, updateSchema) → db.updateItem(id, userId, updates) → return updated
DELETE: createClient → getUser → auth check → db.deleteItem(id, userId) → return { success: true }
```

**Key conventions:**
- `params` is `Promise<{ id: string }>` in Next.js 16 (must `await params`)
- Error handling: `try/catch` → `log.error('METHOD /api/path error', error)` → `NextResponse.json({ error: 'message' }, { status })`
- Error message checking for "not found" → 404 in PATCH handlers
- Imports: `NextRequest`, `NextResponse` from `next/server`; `createClient` from `@/lib/supabase/server`; DB class from `@/lib/db`; `validateRequestBody` from `@/lib/validations/api`; `log` from `@/lib/logger`; `ensureProfile` from `@/lib/db/ensure-profile`

**Route path decision:** Context D-01 specifies `app/api/calendar-events/route.ts` and `app/api/calendar-events/[id]/route.ts`. Note: the design spec mentions `api/calendar/events/` but the context decision overrides this.

## CalendarEventsDB Class Methods

Located at `lib/db/calendar-events.ts`, already exported from `lib/db/index.ts`:

| Method | Signature | Notes |
|--------|-----------|-------|
| `getUserEvents` | `(userId, startDate, endDate) → CalendarEvent[]` | Filters by date range overlap (`start_date <= endDate AND end_date >= startDate`). Orders by start_date, start_time ascending. Returns **non-recurring + recurring parents + exceptions** — all events whose date range overlaps the query range. |
| `getEvent` | `(eventId, userId) → CalendarEvent \| null` | Returns null on PGRST116 (not found), throws on other errors |
| `createEvent` | `(userId, event: Omit<CalendarEventInsert, 'user_id'>) → CalendarEvent` | Inserts with user_id spread in |
| `updateEvent` | `(eventId, userId, updates: CalendarEventUpdate) → CalendarEvent` | Standard update with select().single() |
| `deleteEvent` | `(eventId, userId) → void` | Hard delete |
| `getRecurringEvents` | `(userId) → CalendarEvent[]` | All events with `is_recurring: true` (no date filter) |
| `getExceptions` | `(userId, recurringEventId) → CalendarEvent[]` | All exceptions linked to a parent recurring event |

**Important:** The client-side singleton at the bottom of the file (`export const calendarEventsDB`) must NOT be used in API routes. API routes create a fresh instance per request.

## Validation & Request Handling

### `validateRequestBody()` — `lib/validations/api.ts`

Accepts `(body: unknown, schema: ZodSchema<T>)` and returns a discriminated union:
- `{ success: true, data: T }` — parsed data
- `{ success: false, response: NextResponse }` — 400 response with `{ error: 'Validation failed', details: {...} }`

Usage pattern: `const validation = validateRequestBody(body, schema); if (!validation.success) return validation.response;`

### Calendar Event Schemas — `lib/validations/calendar-events.ts`

**`calendarEventCreateSchema`** validates:
- `title` (required, 1-200 chars)
- `description` (optional, max 2000)
- `start_date` / `end_date` (required, YYYY-MM-DD)
- `start_time` / `end_time` (optional, HH:MM or HH:MM:SS, nullable)
- `location`, `color`, `category_id` (optional)
- `is_recurring` (boolean, default false)
- `recurrence_rule` (optional, reuses `recurrenceRuleSchema` from `lib/validations/recurring-task.ts`)
- `end_type`, `end_date_recurrence`, `end_count` (recurrence termination)
- Refinements: end_time requires start_time; is_recurring requires recurrence_rule; end_date >= start_date

**`calendarEventUpdateSchema`** — PATCH semantics, all fields optional. Single refinement: at least one field required. No cross-field refinements (server merges with existing record).

### Recurrence Rule Schema — `lib/validations/recurring-task.ts`

`recurrenceRuleSchema` is a `z.union()` of 5 sub-schemas: daily, weekly, monthlyByDate, monthlyByWeekday, yearly. Each has `interval` (1-365) plus frequency-specific fields. Already imported and used by the calendar event schemas.

## RecurrenceRule Type & Expansion

### Type Definition — `lib/db/types.ts`

```ts
type RecurrenceRule = DailyRule | WeeklyRule | MonthlyByDateRule | MonthlyByWeekdayRule | YearlyRule;
```

Each extends `BaseRule` (`{ interval: number }`):
- **DailyRule**: `{ frequency: "daily" }`
- **WeeklyRule**: `{ frequency: "weekly", days_of_week: number[] }` (0=Sun...6=Sat)
- **MonthlyByDateRule**: `{ frequency: "monthly", day_of_month: 1-31 }`
- **MonthlyByWeekdayRule**: `{ frequency: "monthly", week_position: WeekPosition, day_of_week_monthly: 0-6 }`
- **YearlyRule**: `{ frequency: "yearly", month_of_year: 1-12, day_of_month: 1-31 }`

Related types: `EndType = "never" | "after_count" | "on_date"`, `WeekPosition = "first" | "second" | "third" | "fourth" | "last"`

### CalendarEvent Recurrence Fields

The `CalendarEvent` interface includes:
- `is_recurring: boolean` — flag to identify parent recurring events
- `recurrence_rule: RecurrenceRule | null` — the rule definition
- `end_type: EndType | null` — how recurrence terminates
- `end_date_recurrence: string | null` — terminal date for `on_date` end type
- `end_count: number | null` — max occurrences for `after_count` end type
- `recurring_event_id: string | null` — self-FK linking exceptions to parent
- `original_date: string | null` — the date the exception replaces
- `is_exception: boolean` — flag for exception records

### Existing Expansion Function — `lib/recurring-tasks/recurrence.ts`

`getOccurrencesInRange(rule, ruleStartDate, rangeStart, rangeEnd) → string[]` is a pure function that returns an array of YYYY-MM-DD date strings. It handles all 5 rule types with fast-forwarding optimizations for ranges far from the rule start date. This function is **directly reusable** for calendar events — it depends only on `RecurrenceRule` from `lib/db/types.ts`, not on any task-specific logic.

Also available: `getNextOccurrence(rule, ruleStartDate, afterDate) → string | null` — searches up to 2 years ahead.

**Important:** The existing function does NOT handle end_type/end_count/end_date_recurrence termination. The caller must handle that logic. For calendar events, the expansion wrapper must:
1. Call `getOccurrencesInRange()` for the query range
2. Apply end_type limits (filter out dates past `end_date_recurrence` or beyond `end_count` total)
3. Filter out dates that have exception records (by matching `original_date`)
4. Merge in exception records that fall within the range

## Exception Handling Pattern

Based on context decisions D-06, D-07, D-08 and the design spec:

### "Edit This Occurrence" (D-06)
1. Client sends POST to create a new event with:
   - `is_exception: true`
   - `recurring_event_id: <parent event id>`
   - `original_date: <the occurrence date being edited>`
   - All other fields copied from parent with the user's edits applied
2. During expansion, any virtual occurrence whose date matches an exception's `original_date` is skipped
3. The exception record is returned in its place

### "Edit All Occurrences" (D-07)
1. Client sends PATCH to the parent recurring event
2. All future virtual expansions automatically reflect changes

### "Delete This Occurrence" (D-08)
Two approaches possible:
- **Option A:** Create an exception record with some "cancelled" indicator and skip it during rendering
- **Option B:** Create a minimal exception record; the GET endpoint skips virtual occurrences that have matching exceptions

The simplest approach: create an exception record. During expansion, any exception that exists for an `original_date` replaces the virtual occurrence. For deletion, the exception itself can be returned with a flag (or simply not returned — the virtual occurrence is already suppressed).

**Recommendation:** Add a convention where a "delete this occurrence" creates an exception with `title` set to the parent's title and the API endpoint skips these during expansion. Alternatively, the DELETE endpoint for `[id]` could accept a query param `?occurrence_date=YYYY-MM-DD` to create a cancellation exception for a recurring event, rather than deleting the parent.

### Delete Entire Series
- DELETE the parent event
- Cascade delete all exceptions (or the API explicitly deletes exceptions first)
- Check if the DB has ON DELETE CASCADE for `recurring_event_id` FK

## API Test Patterns

Based on `tests/app/api/habits/route.test.ts`:

### Mock Setup
```ts
// 1. Hoist mock functions
const { mockFn1, mockFn2 } = vi.hoisted(() => ({
  mockFn1: vi.fn(),
  mockFn2: vi.fn(),
}));

// 2. Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } }
      })),
    },
  })),
}));

// 3. Mock DB class with hoisted fns
vi.mock('@/lib/db', () => ({
  CalendarEventsDB: class {
    getUserEvents = mockFn1;
    createEvent = mockFn2;
    // ... etc
  },
}));

// 4. Mock ensureProfile
vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: vi.fn(),
}));
```

### Test Structure
```ts
describe('GET /api/path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return items for authenticated user', async () => {
    mockFn.mockResolvedValue([mockData]);
    const request = new NextRequest('http://localhost:3000/api/path');
    const response = await GET(request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.items).toEqual([mockData]);
  });

  it('should return 401 for unauthenticated user', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);
    // ...
  });
});
```

### Key Patterns
- Request construction: `new NextRequest('http://localhost:3000/api/path?param=value')`
- POST body: `new NextRequest('http://localhost:3000/api/path', { method: 'POST', body: JSON.stringify(data) })`
- Response parsing: `await response.json()`
- Auth override per test: re-mock `createClient` return value
- Test files mirror the route directory structure under `tests/app/api/`

### Recurrence Utility Tests
`tests/lib/recurring-tasks/recurrence.test.ts` already tests `getOccurrencesInRange()`. The new `lib/calendar/recurrence.ts` utility should have its own tests at `tests/lib/calendar/recurrence.test.ts` focusing on: exception filtering, end_type limits, virtual occurrence generation, and the `is_virtual` flag.

## Recurrence Expansion Algorithm Design

The GET endpoint needs to return a flat list of events for a date range. Here is the algorithm:

### Input
- `start_date`, `end_date` query params (both required, per D-09)
- User's events from `CalendarEventsDB.getUserEvents(userId, startDate, endDate)`

### Algorithm

```
function expandEventsForRange(events: CalendarEvent[], startDate: string, endDate: string):
  result = []
  exceptionsByParent = Map<parentId, Map<originalDate, CalendarEvent>>

  // Step 1: Separate events into categories
  standaloneEvents = events.filter(e => !e.is_recurring && !e.is_exception)
  recurringParents = events.filter(e => e.is_recurring && !e.is_exception)
  exceptions = events.filter(e => e.is_exception)

  // Step 2: Index exceptions by parent and original_date
  for each exception:
    exceptionsByParent[exception.recurring_event_id][exception.original_date] = exception

  // Step 3: Add standalone events directly
  result.push(...standaloneEvents)

  // Step 4: Expand each recurring parent
  for each parent in recurringParents:
    // Get raw occurrence dates
    dates = getOccurrencesInRange(parent.recurrence_rule, parent.start_date, startDate, endDate)

    // Apply end_type limits
    if parent.end_type === 'on_date' && parent.end_date_recurrence:
      dates = dates.filter(d => d <= parent.end_date_recurrence)
    if parent.end_type === 'after_count' && parent.end_count:
      // Need ALL occurrences from start to count them
      allDates = getOccurrencesInRange(parent.recurrence_rule, parent.start_date, parent.start_date, endDate)
      allowedDates = Set(allDates.slice(0, parent.end_count))
      dates = dates.filter(d => allowedDates.has(d))

    // Step 5: For each date, check for exception
    parentExceptions = exceptionsByParent[parent.id] || {}
    for each date in dates:
      if parentExceptions[date] exists:
        // Exception replaces this occurrence — add the exception (not virtual)
        result.push(parentExceptions[date])  // Already a real DB record
      else:
        // Generate virtual occurrence
        virtualEvent = {
          ...parent,
          id: `${parent.id}_${date}`,  // Synthetic ID for client-side keying
          start_date: date,
          end_date: date,  // Adjust if multi-day event
          is_virtual: true,           // Not persisted, signals client
          recurring_event_id: parent.id,  // Link back to parent
          original_date: date,
        }
        result.push(virtualEvent)

  // Step 6: Add any exceptions whose original_date falls in range
  // but whose parent might not be in the query (edge case)
  // → Already handled because getUserEvents returns exceptions with date overlap

  return result
```

### Key Design Points

1. **`is_virtual` flag (D-05):** Not a DB column. Added at the API layer to mark expanded occurrences. The client uses this to know whether to send PATCH to the event directly or prompt "edit this/all".

2. **Synthetic ID for virtual occurrences:** Use `${parentId}_${date}` pattern so the client has a stable key. When the client wants to "edit this occurrence," it sends the parent ID + original_date, and the API creates an exception.

3. **`after_count` limitation:** Requires counting ALL occurrences from the rule start date, not just those in the query range. For efficiency, the expansion function should count from `parent.start_date` through `endDate` and take the first `end_count`. This could be expensive for long-running rules with large counts — but in practice, personal calendar events rarely exceed hundreds of occurrences.

4. **Multi-day recurring events:** If a parent event spans multiple days (end_date > start_date), each virtual occurrence should preserve the same duration. Calculate duration = end_date - start_date, then virtual.end_date = date + duration.

5. **Exception placement:** Exceptions have their own `start_date`/`end_date` which may differ from the original occurrence date (user moved the event). The `original_date` field is what links it to the parent's occurrence slot. During expansion, exceptions suppress the virtual occurrence at `original_date`.

### Utility Location

Per D-04: `lib/calendar/recurrence.ts` — a pure utility with no DB dependencies. It imports `getOccurrencesInRange` from `lib/recurring-tasks/recurrence.ts` and adds the exception-aware expansion layer on top.

## Dependencies & Risks

### Dependencies (all satisfied by Phase 29)
- `CalendarEventsDB` class — ready at `lib/db/calendar-events.ts`
- `CalendarEvent`, `CalendarEventInsert`, `CalendarEventUpdate` types — ready at `lib/db/types.ts`
- `calendarEventCreateSchema`, `calendarEventUpdateSchema` — ready at `lib/validations/calendar-events.ts`
- `recurrenceRuleSchema` — ready at `lib/validations/recurring-task.ts`
- `validateRequestBody()` — ready at `lib/validations/api.ts`
- `getOccurrencesInRange()` — ready at `lib/recurring-tasks/recurrence.ts`
- `ensureProfile` — ready at `lib/db/ensure-profile.ts`
- `log` — ready at `lib/logger.ts`
- `calendar_events` table with RLS — ready (Phase 29 migration)

### New Files to Create
1. `app/api/calendar-events/route.ts` — GET (list with expansion) + POST (create)
2. `app/api/calendar-events/[id]/route.ts` — GET (single) + PATCH (update) + DELETE
3. `lib/calendar/recurrence.ts` — Recurrence expansion utility (exception-aware)
4. `tests/app/api/calendar-events/route.test.ts` — Route tests
5. `tests/app/api/calendar-events/[id]/route.test.ts` — Single item route tests
6. `tests/lib/calendar/recurrence.test.ts` — Recurrence expansion utility tests

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `after_count` expansion performance for large counts | Low — personal use, counts rarely exceed 100 | Cap expansion range or add a max occurrences constant |
| Exception for a date outside query range not found | Low | `getUserEvents` already returns exceptions based on date overlap |
| Cascade delete behavior for exceptions when parent deleted | Medium | Verify DB migration has ON DELETE CASCADE for `recurring_event_id` FK, or manually delete exceptions in the DELETE handler |
| `is_virtual` not a DB field — type confusion | Low | Define a distinct `ExpandedCalendarEvent` type extending `CalendarEvent` with `is_virtual: boolean` |
| No existing `lib/calendar/` directory | None | Create it as part of this phase |

### Open Questions for Planning
1. Should the DELETE endpoint support `?occurrence_date=YYYY-MM-DD` to create a cancellation exception for a single occurrence of a recurring event? Or should the client create an exception via POST instead?
2. Does the DB migration have ON DELETE CASCADE on the `recurring_event_id` FK? If not, the DELETE handler must clean up exceptions manually.
3. Should the response include the virtual `is_virtual` flag as part of a new `ExpandedCalendarEvent` type, or as an ad-hoc property added at the API layer?

## RESEARCH COMPLETE
