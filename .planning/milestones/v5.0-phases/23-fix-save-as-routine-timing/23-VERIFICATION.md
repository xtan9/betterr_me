---
phase: 23-fix-save-as-routine-timing
verified: 2026-02-27T22:30:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
human_verification: []
---

# Phase 23: Fix Save-as-Routine Timing Verification Report

**Phase Goal:** Fix integration bug where save-as-routine from the finish dialog fails because the workout is still in_progress when the API is called
**Verified:** 2026-02-27T22:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Save-as-routine API returns 201 when workout status is in_progress | VERIFIED | `route.ts` has no status guard; test "creates routine from in_progress workout (timing fix)" asserts 201 and passes |
| 2 | Save-as-routine API returns 201 when workout status is completed (existing behavior preserved) | VERIFIED | Test "creates routine from completed workout" asserts 201; route logic unchanged below former guard |
| 3 | Save-as-routine API returns 401 for unauthenticated users | VERIFIED | `route.ts` lines 24-26: `if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`. Test asserts 401 and error text. |
| 4 | Save-as-routine API returns 404 for non-existent workouts | VERIFIED | `route.ts` lines 49-55: PGRST116 check returns 404. Test asserts 404 and "Workout not found". |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/workouts/[id]/save-as-routine/route.ts` | Save-as-routine endpoint without in_progress status guard; JSDoc says "Works for in_progress, completed, or discarded workouts" | VERIFIED | File is 143 lines, fully substantive. No in_progress guard block exists. JSDoc at line 11 reads exactly "Works for in_progress, completed, or discarded workouts." |
| `tests/app/api/workouts/[id]/save-as-routine/route.test.ts` | Unit tests covering all status scenarios; min 80 lines | VERIFIED | File is 192 lines (exceeds 80-line minimum). Contains 4 tests covering in_progress, completed, 401, and 404 scenarios. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/app/api/workouts/[id]/save-as-routine/route.test.ts` | `app/api/workouts/[id]/save-as-routine/route.ts` | direct import of POST handler | VERIFIED | Line 26: `import { POST } from "@/app/api/workouts/[id]/save-as-routine/route";` — matches pattern `import.*POST.*save-as-routine/route` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ROUT-04 | 23-01-PLAN.md | User can save a completed workout as a new routine template | SATISFIED | The feature was structurally implemented in Phase 20. Phase 23 removes the in_progress status guard that blocked the save-as-routine path when invoked from the finish dialog (while the workout is still in_progress). The API now accepts any workout status, making the requirement fully functional end-to-end. REQUIREMENTS.md marks ROUT-04 as Complete under Phase 20 — Phase 23 resolves the integration defect that prevented practical goal achievement. |

**Note on REQUIREMENTS.md table:** The requirements coverage table in REQUIREMENTS.md maps ROUT-04 to Phase 20, which is where the save-as-routine feature was originally built. Phase 23 is a targeted bug fix that brings the implementation into alignment with the requirement's intent. The table entry pre-dates the bug discovery and does not reflect Phase 23's contribution; this is a documentation lag, not an orphaned requirement.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No anti-patterns detected in either modified file. No TODO/FIXME/placeholder comments. No empty implementations. No stub returns.

### Human Verification Required

None. The fix is a server-side API change with full unit-test coverage. All observable behaviors are verifiable programmatically through the test suite and code inspection:

- The absence of the in_progress guard is confirmed by grep (no match for "Cannot save an in-progress workout as a routine").
- The JSDoc update is confirmed by direct file read (line 11).
- Both commits (fb1a83d, c59368e) exist in git history.
- The test file imports and calls the actual POST handler (not a stub).

### Gaps Summary

No gaps. All four truths are verified, both artifacts exist and are substantive, the key link is wired, and ROUT-04 is satisfied.

---

## Verification Detail

### Commit Verification

Both commits documented in SUMMARY.md exist in git history:

- `fb1a83d` — fix(23-01): remove in_progress status guard from save-as-routine API
- `c59368e` — test(23-01): add unit tests for save-as-routine API route

### Guard Removal Confirmation

Grep for `"Cannot save an in-progress workout as a routine"` in `route.ts` returns **no matches** — the guard is definitively absent.

The only occurrence of "in_progress" in `route.ts` is in the JSDoc comment at line 11: "Works for in_progress, completed, or discarded workouts." This is the correct updated documentation.

### Route Logic After Fix

After the guard removal, the route flow is:

1. Auth check (returns 401 if no user)
2. Body validation via `saveAsRoutineSchema`
3. Fetch workout + exercises + sets from Supabase (returns 404 on PGRST116)
4. Insert routine record into `routines` table
5. For each workout exercise, insert a `routine_exercises` record with best-set values derived from completed sets
6. Return `{ routine }` with status 201

No status check exists anywhere in this flow. The fix is complete and correct.

### Test Substantiveness

The 192-line test file contains:

- A `makeWorkout(status)` factory that produces realistic nested workout data with exercises and sets
- A `makeRequest()` helper constructing valid NextRequest objects
- A `setupSupabaseMock()` function that builds a full chainable Supabase mock covering `workouts`, `routines`, and `routine_exercises` tables
- 4 distinct `it()` blocks, each asserting specific status codes and response shapes
- The primary regression test ("creates routine from in_progress workout (timing fix)") directly validates that the bug is fixed

---

_Verified: 2026-02-27T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
