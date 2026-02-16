# Phase 5: Test Coverage - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Backfill unit tests to validate all fixes from prior phases (frequency correctness, Zod validation, habit count limit) and cover the previously untested habit logs API route. No new features, no refactoring — tests only.

</domain>

<decisions>
## Implementation Decisions

### Validation error contract
- Tests assert **full Zod error details** — field-level errors with specific messages, not just status codes
- Every validated field tested individually (name, description, category, etc.) — no representative sampling
- Habit count limit test: assert 400 status + presence of error, but **do not lock** the specific error message text

### Test file organization
- **One test file per API route** in the existing `tests/` directory
- Describe blocks use **route-first** structure: top-level `describe('GET /api/habits/[id]/logs')`, nested describes for behaviors (date filtering, auth, pagination)
- Keep all tests in `tests/` directory, matching existing project convention

### Frequency test scope
- **Verify-only** approach — run existing tests, confirm Phase 1 fixes hold
- Add **one explicit regression test** for `times_per_week`: assert that 3 completions in a week = 100% completion rate
- Add **one explicit regression test** for `weekly`: assert that any completion in a week = satisfied
- No comprehensive frequency test matrix — existing tests are sufficient

### Edge case depth
- **Exhaustive** edge cases: Unicode, null bytes, extremely large payloads, special characters, SQL injection attempts
- Pagination boundary tests: page=0, page=-1, page=999999, limit=0, limit=-1
- Auth tests cover **both** no-session and expired/invalid session scenarios
- Date range tests include **invalid formats**: '2026-13-45', 'not-a-date', missing params

### Claude's Discretion
- PATCH partial update testing strategy (per-field solo sends vs one combo test)
- Where to place frequency regression tests (existing file vs new file)
- Exact test helper patterns and mock setup

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing project mocking patterns from CLAUDE.md (mockSupabaseClient, vi.hoisted + mock DB classes, SWR mocks).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-test-coverage*
*Context gathered: 2026-02-16*
