# Phase 5: Test Coverage - Research

**Researched:** 2026-02-16
**Domain:** Vitest unit testing for Next.js API routes, Zod validation, frequency logic
**Confidence:** HIGH

## Summary

Phase 5 is a test-only phase that backfills unit tests for fixes made in prior phases and covers the previously untested `GET /api/habits/[id]/logs` route. The codebase already has 73 passing test files (921 tests) with mature, well-established patterns for mocking Supabase, DB classes, and API route handlers. No new libraries are needed -- only new test files following existing conventions.

The research focused on: (1) understanding the exact mocking patterns already used in the project, (2) examining the API routes that need testing, (3) documenting the validation response contract (`validateRequestBody`) that tests must assert against, and (4) identifying the frequency logic code that regression tests need to exercise.

**Primary recommendation:** Follow the existing test patterns exactly. Use `vi.hoisted` + mock DB classes for API route tests. Assert `{ error: 'Validation failed', details: { fieldName: [...messages] } }` for Zod validation. The logs route, validation, and habit count limit tests are straightforward given the established patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tests assert **full Zod error details** -- field-level errors with specific messages, not just status codes
- Every validated field tested individually (name, description, category, etc.) -- no representative sampling
- Habit count limit test: assert 400 status + presence of error, but **do not lock** the specific error message text
- **One test file per API route** in the existing `tests/` directory
- Describe blocks use **route-first** structure: top-level `describe('GET /api/habits/[id]/logs')`, nested describes for behaviors (date filtering, auth, pagination)
- Keep all tests in `tests/` directory, matching existing project convention
- **Verify-only** approach for frequency tests -- run existing tests, confirm Phase 1 fixes hold
- Add **one explicit regression test** for `times_per_week`: assert that 3 completions in a week = 100% completion rate
- Add **one explicit regression test** for `weekly`: assert that any completion in a week = satisfied
- No comprehensive frequency test matrix -- existing tests are sufficient
- **Exhaustive** edge cases: Unicode, null bytes, extremely large payloads, special characters, SQL injection attempts
- Pagination boundary tests: page=0, page=-1, page=999999, limit=0, limit=-1
- Auth tests cover **both** no-session and expired/invalid session scenarios
- Date range tests include **invalid formats**: '2026-13-45', 'not-a-date', missing params

### Claude's Discretion
- PATCH partial update testing strategy (per-field solo sends vs one combo test)
- Where to place frequency regression tests (existing file vs new file)
- Exact test helper patterns and mock setup

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (project-installed) | Test runner | Already configured in `vitest.config.ts`, jsdom env, globals enabled |
| @testing-library/jest-dom | (project-installed) | DOM matchers | Already in `tests/setup.ts` |
| next/server (NextRequest) | Next.js 16 | Request construction in tests | All existing API route tests use `new NextRequest(url, opts)` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vi.hoisted + vi.mock | vitest built-in | DB class mocking | Every API route test file (established pattern) |

### Alternatives Considered
None -- the project has a mature, consistent test stack. No new libraries needed.

**Installation:**
No new packages required.

## Architecture Patterns

### Project Test Structure (Existing)
```
tests/
  app/
    api/
      habits/
        route.test.ts            # GET/POST /api/habits
        [id]/
          route.test.ts          # GET/PATCH/DELETE /api/habits/[id]
          stats/route.test.ts    # GET /api/habits/[id]/stats
          toggle/route.test.ts   # POST /api/habits/[id]/toggle
          (MISSING: logs/route.test.ts)  # <-- Phase 5 creates this
      tasks/
        route.test.ts
        [id]/route.test.ts
  lib/
    db/
      habit-logs.test.ts         # DB layer tests (existing)
    validations/
      task.test.ts               # Task schema tests (existing)
      profile.test.ts            # Profile schema tests (existing)
      (MISSING: habit.test.ts)   # <-- Phase 5 creates this
```

### Pattern 1: API Route Test with vi.hoisted Mock DB Classes
**What:** The standard pattern for testing Next.js API route handlers. Uses `vi.hoisted` to create mock functions, then `vi.mock` with inline class definitions that use those functions.
**When to use:** Every API route test file.
**Example (from `tests/app/api/habits/route.test.ts`):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/habits/route';
import { NextRequest } from 'next/server';

// Step 1: Hoist mock functions
const { mockGetLogsByDateRange } = vi.hoisted(() => ({
  mockGetLogsByDateRange: vi.fn(),
}));

// Step 2: Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

// Step 3: Mock DB class with hoisted fns as methods
vi.mock('@/lib/db', () => ({
  HabitLogsDB: class {
    getLogsByDateRange = mockGetLogsByDateRange;
  },
}));

// Step 4: Import createClient AFTER mocks (for vi.mocked)
import { createClient } from '@/lib/supabase/server';

// Step 5: beforeEach clears mocks and re-configures auth
describe('GET /api/habits/[id]/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should return logs', async () => {
    mockGetLogsByDateRange.mockResolvedValue([/* mock data */]);
    const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs?start_date=2026-01-01');
    const response = await GET(request, { params: Promise.resolve({ id: 'habit-1' }) });
    expect(response.status).toBe(200);
  });
});
```

### Pattern 2: Auth Test (No Session vs Expired)
**What:** Testing authentication by overriding `createClient` to return null user.
**When to use:** Every API route test must have auth failure tests.
**Example:**
```typescript
it('should return 401 if not authenticated', async () => {
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
  } as any);

  const request = new NextRequest('http://localhost:3000/api/habits/habit-1/logs');
  const response = await GET(request, { params: Promise.resolve({ id: 'habit-1' }) });
  expect(response.status).toBe(401);
});
```

### Pattern 3: Dynamic Route Params (Next.js 16 Promise-based)
**What:** Next.js 16 uses `{ params: Promise<{ id: string }> }` for dynamic route params. Tests must wrap params in `Promise.resolve()`.
**When to use:** Every test of a dynamic route (`[id]`).
**Example:**
```typescript
const params = Promise.resolve({ id: 'habit-1' });
const response = await GET(request, { params });
```

### Pattern 4: Validation Error Response Contract
**What:** The `validateRequestBody()` utility returns a structured error response.
**When to use:** When testing Zod validation rejection.
**Response shape (from `lib/validations/api.ts`):**
```json
{
  "error": "Validation failed",
  "details": {
    "name": ["Name is required"],
    "frequency": ["Invalid discriminator value. Expected 'daily' | 'weekdays' | 'weekly' | 'times_per_week' | 'custom'"]
  }
}
```
**Assertion pattern:**
```typescript
const response = await POST(request);
const data = await response.json();
expect(response.status).toBe(400);
expect(data.error).toBe('Validation failed');
expect(data.details.name).toBeDefined();
expect(data.details.name[0]).toContain('required');
```

### Anti-Patterns to Avoid
- **Do NOT use `mockSupabaseClient` from `tests/setup.ts` for API route tests.** That mock is for DB-layer tests only (e.g., `tests/lib/db/habit-logs.test.ts`). API route tests mock at the DB class level using `vi.hoisted` + `vi.mock('@/lib/db', ...)`.
- **Do NOT import route handlers before `vi.mock` calls.** Module mocks must be registered before the mocked modules are imported.
- **Do NOT assert exact error message strings for the habit count limit.** The decision says "assert 400 + presence of error, do not lock message text."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request construction | Custom fetch/request helpers | `new NextRequest(url, { method, body: JSON.stringify(data) })` | Existing pattern, NextRequest handles URL parsing |
| Mock setup | Custom mock framework | `vi.hoisted` + `vi.mock` with inline classes | Established in 10+ test files |
| Auth simulation | Custom auth middleware mocks | `vi.mocked(createClient).mockReturnValue(...)` | Consistent, works for both auth and no-auth |

**Key insight:** Every pattern needed already exists in the codebase. The entire test infrastructure is mature. Phase 5 is purely about applying existing patterns to new test cases.

## Common Pitfalls

### Pitfall 1: Logs Route Has No Pagination
**What goes wrong:** The CONTEXT says to test pagination boundaries (page=0, page=-1, etc.), but the `GET /api/habits/[id]/logs` route does NOT implement pagination -- it returns all logs in the date range.
**Why it happens:** The route uses `start_date`/`end_date`/`days` parameters, not `page`/`limit`.
**How to avoid:** Test the actual query parameters: `start_date`, `end_date`, `days`. Test invalid values for `days` (0, -1, 366, NaN, non-numeric). Skip pagination-specific tests since the route has no pagination support.
**Warning signs:** Looking for `page` or `limit` parameters in the route code and finding none.

### Pitfall 2: The Route Validates Days Range (1-365)
**What goes wrong:** Tests might assume `days` accepts any number.
**Why it happens:** The route explicitly validates: `if (isNaN(days) || days < 1 || days > 365)`.
**How to avoid:** Test boundary values: days=0 (400), days=1 (200), days=365 (200), days=366 (400), days=-1 (400), days='abc' (400).
**Warning signs:** Tests passing with invalid days values.

### Pitfall 3: Date Format Validation is Regex-Only
**What goes wrong:** The route uses `/^\d{4}-\d{2}-\d{2}$/` which accepts syntactically-valid-but-semantically-invalid dates like '2026-13-45'.
**Why it happens:** The regex only checks format, not date validity.
**How to avoid:** Test '2026-13-45' and note it PASSES the regex (returns 200 with the invalid date passed to DB). Test 'not-a-date' (returns 400). This is the actual behavior -- tests should match it.
**Warning signs:** Expecting '2026-13-45' to return 400 when it actually returns 200 (regex passes).

### Pitfall 4: `getLocalDateString()` is Not Mocked in Logs Route
**What goes wrong:** The logs route calls `getLocalDateString()` for today's date as a default. This makes `end_date` default depend on the actual system date.
**Why it happens:** The function uses `new Date()` internally.
**How to avoid:** When testing default behavior (no `end_date`), don't assert exact date values -- just verify the response structure. Or use `vi.useFakeTimers()` if precise date control is needed.
**Warning signs:** Tests failing on different days because default dates change.

### Pitfall 5: Validation Details Use `flatten().fieldErrors`
**What goes wrong:** Tests expect Zod's raw error format instead of the flattened format.
**Why it happens:** `validateRequestBody` calls `result.error.flatten().fieldErrors`, which produces `{ fieldName: string[] }`.
**How to avoid:** Always assert against the flattened format: `data.details.name[0]` not `data.details[0].path`.
**Warning signs:** `data.details` being an object with arrays (correct) vs being an array (wrong expectation).

### Pitfall 6: habitUpdateSchema Uses .refine() -- Details Key Differs
**What goes wrong:** The update schema uses `.refine()` for the "at least one field" check. Refined errors go to the root, not a field.
**Why it happens:** `flatten().fieldErrors` puts refine errors under `_errors` at the form level, not under a specific field.
**How to avoid:** For empty-body PATCH, assert `data.details` exists but do not assert a specific field key. The existing test in `tests/app/api/habits/[id]/route.test.ts` already tests this (line 138-146) and only checks `response.status === 400`.
**Warning signs:** Looking for `data.details.name` in an empty-body test when the error is in `data.details` at root level.

### Pitfall 7: Habit Count Test Already Exists
**What goes wrong:** Creating a duplicate test for the 21st habit limit.
**Why it happens:** `tests/app/api/habits/route.test.ts` already has a test at line 388-404: "should return 400 when habit limit reached" which mocks `getActiveHabitCount(20)` and asserts status 400.
**How to avoid:** The existing test asserts `data.error.toContain('You have 20/20 habits')` which DOES lock the message text. Per the decision, we should adjust this to only assert `data.error` is defined (presence check, no message lock). Or leave it and add a complementary test for count=19 (should succeed).
**Warning signs:** Conflicting assertions between existing and new tests.

## Code Examples

### Example 1: Logs Route GET Handler (the route to test)
Source: `/home/xingdi/code/betterr_me/app/api/habits/[id]/logs/route.ts`
```typescript
// Key behaviors to test:
// 1. Auth check (user null -> 401)
// 2. days param: parseInt, must be 1-365
// 3. start_date param: used directly
// 4. Default: last 30 days
// 5. Date regex validation: /^\d{4}-\d{2}-\d{2}$/
// 6. Calls habitLogsDB.getLogsByDateRange(habitId, userId, startDate, endDate)
// 7. Returns { logs, startDate, endDate, count }
// 8. catch -> 500 with { error: 'Failed to fetch logs' }
```

### Example 2: Validation Response (what Zod errors look like)
Source: `/home/xingdi/code/betterr_me/lib/validations/api.ts`
```typescript
// validateRequestBody returns:
// On success: { success: true, data: T }
// On failure: { success: false, response: NextResponse.json(
//   { error: 'Validation failed', details: fieldErrors },
//   { status: 400 }
// )}
//
// fieldErrors is from zod .flatten().fieldErrors:
// { name: ['Name is required'], frequency: ['Invalid discriminator value...'] }
```

### Example 3: Habit Form Schema (fields to test individually)
Source: `/home/xingdi/code/betterr_me/lib/validations/habit.ts`
```typescript
// Fields to test:
// name: string().trim().min(1).max(100) -- required, trimmed, empty='', whitespace-only='   '
// description: string().max(500).optional().nullable() -- null ok, >500 rejected, omitted ok
// category: enum([5 values]).nullable().optional() -- valid values, invalid value, null, omitted
// frequency: discriminatedUnion('type', [...]) -- each type's specific constraints
//   - daily: no extra fields
//   - weekdays: no extra fields
//   - weekly: no extra fields
//   - times_per_week: count must be 2 or 3
//   - custom: days array, min 1 item, values 0-6
```

### Example 4: Habit Update Schema (PATCH testing)
Source: `/home/xingdi/code/betterr_me/lib/validations/habit.ts`
```typescript
// habitUpdateSchema = habitFormSchema.partial().extend({ status }).refine(nonEmpty)
// This means:
// - All habitFormSchema fields are optional
// - status: enum(['active', 'paused', 'archived']).optional()
// - At least one field required (refine)
// - Each field, when present, is validated by its original rules
```

### Example 5: Frequency Regression Test Pattern
Source: existing `tests/lib/db/habit-logs.test.ts` lines 300-370
```typescript
// times_per_week: 3 completions in a week = 100%
// The test at line 302-319 already shows:
//   mockSupabaseClient.setMockResponse([
//     { logged_date: weekDate(0), completed: true },
//     { logged_date: weekDate(1), completed: true },
//   ]);
//   stats = await habitLogsDB.getDetailedHabitStats(...)
//   expect(stats.thisWeek.percent).toBe(67); // 2/3
//
// For 3/3 = 100%, add a third completion log entry

// weekly: any completion = satisfied
// The test at line 455-472 already shows:
//   mockSupabaseClient.setMockResponse([{ logged_date: wkDate(2), completed: true }]);
//   expect(stats.thisWeek.percent).toBe(100); // 1/1 = 100%
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct mock of supabase chain methods | Mock at DB class level for API route tests | Already established in codebase | Cleaner, more focused tests |
| Manual request object construction | `NextRequest` from next/server | Next.js 16 | Full URL parsing, searchParams support |
| `params: { id: string }` sync | `params: Promise<{ id: string }>` async | Next.js 15+ | Must use `Promise.resolve()` in tests |

**Nothing deprecated/outdated in the test stack.** The project is on current Vitest with standard patterns.

## Recommendations (Claude's Discretion Areas)

### PATCH Partial Update Testing Strategy
**Recommendation:** Use **per-field solo sends** for validation tests (each field tested alone to verify its individual validation), plus **one combo test** for a multi-field update success path. This matches the exhaustive field-by-field decision while keeping the success path practical.

**Rationale:** The existing PATCH tests in `tests/app/api/habits/[id]/route.test.ts` already test individual fields (name, category, status). Adding per-field Zod validation tests aligns with the decision to test "every validated field individually."

### Frequency Regression Test Placement
**Recommendation:** Add the two regression tests to the **existing** `tests/lib/db/habit-logs.test.ts` file rather than creating a new file. The file already has `times_per_week` and `weekly` describe blocks with the exact helper functions (`weekDate`, `prevWkDate`) needed.

**Rationale:** The existing file already has 7 tests for `times_per_week` and 2 for `weekly` frequency handling. Adding one more test to each block is minimal, focused, and avoids duplicating mock setup.

### Test Helper Patterns
**Recommendation:** No new shared helpers needed. Each test file is self-contained with its own mock setup (matching every existing test file in the project). Use inline `mockLog` data objects per file.

## Open Questions

1. **Semantically invalid dates (e.g., '2026-13-45')**
   - What we know: The regex `/^\d{4}-\d{2}-\d{2}$/` accepts these. The DB would receive the invalid date string.
   - What's unclear: Does Supabase/Postgres reject '2026-13-45' gracefully or throw?
   - Recommendation: Test that the format passes the route's validation (returns 200 or whatever the DB returns). The CONTEXT asks for testing invalid formats -- '2026-13-45' should be tested to document the actual behavior, even if the route allows it through.

2. **"Expired/invalid session" vs "no session"**
   - What we know: The route checks `!user` (null user). The mock pattern only supports `user: null`.
   - What's unclear: How to simulate an expired session at the API route level. The Supabase client returns `{ data: { user: null } }` for both no-session and expired-session.
   - Recommendation: Test `user: null` (covers both cases at the route level). Add a comment noting that expired sessions also result in `user: null` from `getUser()`. The distinction matters at the middleware level (proxy.ts), not at the API route level.

## Sources

### Primary (HIGH confidence)
- Project source code -- All patterns directly verified from existing test files
  - `tests/app/api/habits/route.test.ts` -- API route test pattern (vi.hoisted, mock DB classes)
  - `tests/app/api/habits/[id]/route.test.ts` -- PATCH/DELETE test pattern, dynamic params
  - `tests/app/api/habits/[id]/stats/route.test.ts` -- Multiple DB class mocking pattern
  - `tests/app/api/habits/[id]/toggle/route.test.ts` -- Error handling test patterns
  - `tests/lib/db/habit-logs.test.ts` -- DB-layer test pattern, frequency tests
  - `tests/lib/validations/task.test.ts` -- Schema validation test pattern
  - `tests/lib/validations/profile.test.ts` -- Schema validation test pattern

- Route source code -- Exact behavior verified
  - `app/api/habits/[id]/logs/route.ts` -- The untested route (only GET, params: days/start_date/end_date)
  - `app/api/habits/route.ts` -- POST with Zod validation + habit count limit
  - `app/api/habits/[id]/route.ts` -- PATCH with habitUpdateSchema
  - `lib/validations/habit.ts` -- habitFormSchema and habitUpdateSchema definitions
  - `lib/validations/api.ts` -- validateRequestBody response format

- Test infrastructure
  - `vitest.config.ts` -- jsdom, globals, coverage thresholds
  - `tests/setup.ts` -- mockSupabaseClient (for DB tests only), polyfills

### Secondary (MEDIUM confidence)
None needed -- all research was from primary project sources.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- directly verified from 73 existing test files
- Architecture: HIGH -- patterns copied from 10+ existing API route test files
- Pitfalls: HIGH -- identified from reading actual route code and comparing with existing test patterns

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- testing patterns don't change rapidly)
