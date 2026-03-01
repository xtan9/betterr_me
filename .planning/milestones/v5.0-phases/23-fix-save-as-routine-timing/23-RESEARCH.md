# Phase 23: Fix Save-as-Routine Timing Bug - Research

**Researched:** 2026-02-24
**Domain:** Frontend/API integration bug fix (React state + API guard timing)
**Confidence:** HIGH

## Summary

The bug is a classic race condition between UI flow and API guard logic. The `WorkoutFinishDialog` opens while the workout status is still `in_progress` in the database. Inside that dialog, the user can click "Save as Routine," which calls `POST /api/workouts/[id]/save-as-routine`. That API endpoint checks `workout.status === "in_progress"` and returns a 400 error. The `finishWorkout()` action that transitions the workout status to `completed` only fires when the user clicks the "Finish Workout" confirmation button -- a separate action from the save-as-routine call.

The fix is straightforward: remove the `in_progress` status guard from the save-as-routine API endpoint. The exercises and sets exist in the database regardless of workout status, and there is no data integrity reason to block saving a routine from an in-progress workout. The exercises are already fully logged; the only thing `in_progress` vs `completed` controls is the `completed_at` timestamp and `duration_seconds` -- neither of which are used by the save-as-routine logic.

**Primary recommendation:** Remove the `in_progress` guard from `POST /api/workouts/[id]/save-as-routine` (line 60-65 of the route file). This is a 1-line deletion that fixes the bug without restructuring the UI flow.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROUT-04 | User can save a completed workout as a new routine template | The save-as-routine API and UI are fully implemented. The only issue is the `in_progress` status guard that blocks the API call when invoked from the finish dialog. Removing the guard enables the flow. |
</phase_requirements>

## Standard Stack

### Core

No new libraries required. This is a bug fix within existing code.

| Library | Version | Purpose | Why Relevant |
|---------|---------|---------|--------------|
| Next.js 16 | current | API routes | The API route `app/api/workouts/[id]/save-as-routine/route.ts` is a Next.js route handler |
| React | 19 | UI components | `WorkoutFinishDialog` is the client component where the user triggers save-as-routine |
| Supabase | current | Database | The API queries workout data and creates routine records |

### Supporting

| Library | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| Vitest | current | Unit testing | Writing test for the API route to verify the fix |
| sonner | current | Toast notifications | Already used in the finish dialog for success/error feedback |

### Alternatives Considered

N/A -- this is a targeted bug fix, not a feature design decision.

**Installation:** No new packages needed.

## Architecture Patterns

### The Bug: Status Guard vs. UI Flow Timing

**Current flow (broken):**
```
1. User clicks "Finish" button in WorkoutHeader
   -> setShowFinishDialog(true) -- workout is still in_progress
2. WorkoutFinishDialog opens, showing workout stats
3. User expands "Save as Routine" accordion, enters name, clicks Save
   -> POST /api/workouts/[id]/save-as-routine
   -> API checks: workout.status === "in_progress" -> 400 error!
4. User clicks "Finish Workout" confirmation
   -> actions.finishWorkout() -> PATCH /api/workouts/[id] { status: "completed" }
   -> (too late -- save-as-routine already failed)
```

**Proposed flow (fixed, Option A -- recommended):**
```
1. User clicks "Finish" button in WorkoutHeader
   -> setShowFinishDialog(true) -- workout is still in_progress
2. WorkoutFinishDialog opens, showing workout stats
3. User expands "Save as Routine" accordion, enters name, clicks Save
   -> POST /api/workouts/[id]/save-as-routine
   -> API no longer checks status -> creates routine -> 201 success
4. User clicks "Finish Workout" confirmation
   -> actions.finishWorkout() -> PATCH /api/workouts/[id] { status: "completed" }
```

### Fix Options Analysis

#### Option A: Remove the `in_progress` guard from the API (RECOMMENDED)

**What:** Delete the status check in `app/api/workouts/[id]/save-as-routine/route.ts` (lines 60-65).

**Pros:**
- Simplest fix (delete 5 lines)
- No UI restructuring needed
- Exercises and sets are fully valid regardless of workout status
- The API already handles the case where a workout has no completed sets (returns empty routine exercises)
- Satisfies success criterion #2: "works regardless of whether the workout is in_progress or completed"

**Cons:**
- Technically allows saving a routine from a workout that hasn't been finished yet (but this is already the intended UX -- the finish dialog IS the context where save-as-routine lives)
- A discarded workout could also be saved as a routine (already the case for completed workouts, and the original guard only blocked `in_progress`, not `discarded`)

**Risk:** Very low. The save-as-routine logic only reads workout exercises and sets to create routine exercises. It does not depend on or modify the workout's status, `completed_at`, or `duration_seconds`.

#### Option B: Restructure UI to finish workout first, then offer save-as-routine

**What:** Change `onConfirm` to call `finishWorkout()` first, then show a post-completion dialog for save-as-routine.

**Pros:**
- Keeps the API guard as a safety net

**Cons:**
- Significantly more complex: requires a second dialog or a multi-step flow
- After `finishWorkout()`, the SWR cache sets `workout: null` and clears localStorage, so the workout data is gone -- need to capture it before finishing
- Changes the user's mental model: currently they see "Save as Routine" as an optional action while reviewing their workout summary before confirming finish
- Creates a two-dialog flow that feels clunky

**Verdict:** Over-engineered for this problem.

#### Option C: Call save-as-routine after finishWorkout() in the onConfirm handler

**What:** In `WorkoutLogger.onConfirm`, await `finishWorkout()`, then call the save-as-routine API.

**Cons:**
- After `finishWorkout()`, the `workout` state is `null` (SWR mutated to `{ workout: null }`), so the dialog can't access the workout ID
- Would require saving the routine name and workout ID in the parent component's state, creating tight coupling
- Race condition: finishWorkout is fire-and-forget (`void actions.finishWorkout()`) -- changing this to await would require restructuring the dialog callback pattern

**Verdict:** Fragile and requires significant refactoring.

### Pattern: The Code Change

**File:** `app/api/workouts/[id]/save-as-routine/route.ts`

**Current code (lines 60-65):**
```typescript
if (workout.status === "in_progress") {
  return NextResponse.json(
    { error: "Cannot save an in-progress workout as a routine" },
    { status: 400 }
  );
}
```

**Fix:** Remove this entire block. The API will proceed to create the routine regardless of workout status.

**Updated JSDoc comment:** Change line 11 from:
```
 * Only completed or discarded workouts can be saved as routines.
```
to:
```
 * Works for in_progress, completed, or discarded workouts.
```

### Anti-Patterns to Avoid

- **Don't add a "finish then save" flow:** This restructures the UX and creates complexity that isn't warranted for a guard removal.
- **Don't add an "await finishWorkout" before save-as-routine:** The SWR mutation clears the workout data, making the ID unavailable.
- **Don't add client-side retry logic:** The fix should be at the root cause (the API guard), not a workaround.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status coordination | Complex multi-step dialog flow | Remove the unnecessary guard | The guard serves no data integrity purpose |

**Key insight:** The `in_progress` guard was added as a defensive check but the save-as-routine feature was designed to live inside the finish dialog, where the workout is always `in_progress`. The guard contradicts its own usage context.

## Common Pitfalls

### Pitfall 1: Forgetting to update the API comment
**What goes wrong:** The JSDoc at line 11 says "Only completed or discarded workouts can be saved as routines" -- this becomes stale after the fix.
**Why it happens:** Developers focus on the code change and forget the comment.
**How to avoid:** Update the comment as part of the same change.
**Warning signs:** Misleading documentation above the route handler.

### Pitfall 2: Not testing the in_progress case
**What goes wrong:** The fix is deployed without a test confirming the `in_progress` case now works.
**Why it happens:** The existing code has no tests for this API route.
**How to avoid:** Add a unit test for the save-as-routine route that specifically tests with an `in_progress` workout.
**Warning signs:** No test file exists for `save-as-routine/route.ts`.

### Pitfall 3: Breaking the completed/discarded case
**What goes wrong:** Removing the guard might accidentally break the working flow for already-completed workouts.
**Why it happens:** Hasty editing that removes more than the guard.
**How to avoid:** Only remove the 5-line `if` block. Keep all other code intact.
**Warning signs:** The routine creation logic below the guard is affected.

## Code Examples

### The Fix (verified from codebase inspection)

**Before (`app/api/workouts/[id]/save-as-routine/route.ts`):**
```typescript
// Lines 60-65 -- REMOVE THIS BLOCK
if (workout.status === "in_progress") {
  return NextResponse.json(
    { error: "Cannot save an in-progress workout as a routine" },
    { status: 400 }
  );
}
```

**After:**
```typescript
// Block removed -- no status check needed.
// The routine creation logic proceeds directly after fetching the workout.
```

### Test Pattern (following project conventions)

```typescript
// Test file: __tests__/api/workouts/[id]/save-as-routine/route.test.ts

const { mockCreateClient, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("POST /api/workouts/[id]/save-as-routine", () => {
  it("creates routine from in_progress workout (timing fix)", async () => {
    // Setup mock chain for supabase
    // Assert: response is 201 (not 400)
  });

  it("creates routine from completed workout", async () => {
    // Assert: response is 201 (existing behavior preserved)
  });

  it("returns 401 for unauthenticated user", async () => {
    // Assert: response is 401
  });

  it("returns 404 for non-existent workout", async () => {
    // Assert: response is 404
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Guard `in_progress` status | Allow any status | Phase 23 (this fix) | Enables save-as-routine from finish dialog |

**Deprecated/outdated:**
- The `in_progress` guard in save-as-routine API was a premature defensive check that contradicts the UX design.

## Open Questions

1. **Should discarded workouts also support save-as-routine?**
   - What we know: The original guard only blocked `in_progress`, not `discarded`. After the fix, all statuses are allowed.
   - What's unclear: Is saving a discarded workout as a routine a useful user flow?
   - Recommendation: Allow it. The user might discard a workout but still want to save the exercise template. No harm in allowing it. The original code already allowed it for `completed` and `discarded` (only `in_progress` was blocked).

2. **Are there any RLS implications?**
   - What we know: The API route already checks `supabase.auth.getUser()` for auth, and RLS policies on the `workouts` table scope queries to the authenticated user.
   - What's unclear: Nothing -- RLS handles authorization correctly.
   - Recommendation: No RLS changes needed.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `app/api/workouts/[id]/save-as-routine/route.ts` -- verified the exact guard logic and line numbers
- Codebase inspection: `components/fitness/workout-logger/workout-finish-dialog.tsx` -- verified the dialog calls the API while workout is in_progress
- Codebase inspection: `components/fitness/workout-logger/workout-logger.tsx` -- verified `onConfirm` fires `finishWorkout()` separately from the dialog's save-as-routine
- Codebase inspection: `lib/hooks/use-active-workout.ts` -- verified `finishWorkout()` mutates SWR to `{ workout: null }`
- `.planning/v4.0-MILESTONE-AUDIT.md` -- documented the integration bug with fix options

### Secondary (MEDIUM confidence)
- `.planning/phases/20-routines-templates/20-03-PLAN.md` -- original plan that created the save-as-routine feature

## Metadata

**Confidence breakdown:**
- Bug diagnosis: HIGH -- verified by reading all involved source files end-to-end
- Fix approach: HIGH -- Option A (remove guard) is the simplest and most correct solution
- Impact analysis: HIGH -- the guard removal only affects the 5-line status check; all other code paths are unaffected
- Test strategy: HIGH -- follows existing project test patterns from CLAUDE.md

**Research date:** 2026-02-24
**Valid until:** Indefinite (bug fix research tied to specific code, not evolving APIs)
