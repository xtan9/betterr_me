# Phase 22: Phase 18-19 Bug Fix & Dead Code Cleanup - Research

**Researched:** 2026-02-24
**Domain:** Bug fix (unit display), dead code removal
**Confidence:** HIGH

## Summary

Phase 22 is a surgical cleanup phase with three well-scoped items: (1) fix the hardcoded `'kg'` unit suffix in `WorkoutFinishDialog` to use the user's preferred weight unit via existing `displayWeight`/`formatWeight` utilities, (2) delete the orphaned `WorkoutRestTimer` component and its sole i18n key `restTimerSkip`, and (3) remove the unused `loadWorkoutFromStorage` export from `workout-session.ts`.

All three items are fully diagnosed in the v1.0 milestone audit. The codebase already contains every utility and pattern needed — `useWeightUnit()` is used in the parent `WorkoutLogger`, `displayWeight()`/`formatWeight()` are used in `WorkoutSetRow`, and the dead code has zero consumers. No new libraries, APIs, or architectural patterns are required.

**Primary recommendation:** Fix the finish dialog volume display by accepting `weightUnit` as a prop (already available in `WorkoutLogger`), then delete two files/exports and three i18n keys. One plan, three tasks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETT-02 | All weight displays and inputs respect the user's unit preference (stored as kg internally) | Fix `WorkoutFinishDialog` line 99: replace `\`${stats.totalVolume.toLocaleString()} kg\`` with `formatWeight(totalVolumeKg, weightUnit)`. The `useWeightUnit()` hook and `formatWeight()` utility already exist and are used in `WorkoutSetRow`. The parent `WorkoutLogger` already calls `useWeightUnit()` and holds the value in `weightUnit`. |
</phase_requirements>

## Standard Stack

### Core

No new dependencies. All required utilities already exist in the codebase:

| Utility | Location | Purpose | Already Used By |
|---------|----------|---------|-----------------|
| `displayWeight(kg, unit)` | `lib/fitness/units.ts` | Converts kg to user display unit | `WorkoutSetRow` |
| `formatWeight(kg, unit)` | `lib/fitness/units.ts` | Returns `"60 lbs"` string | `WorkoutSetRow` (formatPreviousSet) |
| `useWeightUnit()` | `lib/hooks/use-active-workout.ts` | Reads `weight_unit` from SWR profile cache | `WorkoutLogger` |
| `WeightUnit` type | `lib/db/types.ts` (line 627) | `"kg" \| "lbs"` | Multiple components |

### Supporting

None needed.

### Alternatives Considered

None — the solution is prescribed by the existing codebase patterns.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Pattern 1: Weight Unit Prop Threading

**What:** The parent component (`WorkoutLogger`) reads the user's weight unit via `useWeightUnit()` and passes it as a prop to children that display weights.

**When to use:** Any component that displays weight values stored in kg internally.

**Example (existing in codebase):**
```typescript
// WorkoutLogger (parent) — already has this line
const weightUnit = useWeightUnit();

// WorkoutExerciseCard receives it as a prop
<WorkoutExerciseCard weightUnit={weightUnit} ... />

// WorkoutFinishDialog should also receive it:
<WorkoutFinishDialog weightUnit={weightUnit} ... />
```

### Pattern 2: formatWeight for Display Strings

**What:** Use `formatWeight(kg, unit)` from `lib/fitness/units.ts` to get a human-readable string with unit suffix (e.g., `"132.28 lbs"`).

**When to use:** Any UI text that needs to show a weight value with its unit label.

**Example (existing in codebase):**
```typescript
// Source: lib/fitness/units.ts
export function formatWeight(kg: number, unit: WeightUnit): string {
  const display = displayWeight(kg, unit);
  return `${display} ${unit}`;
}

// Usage in WorkoutSetRow formatPreviousSet():
formatWeight(prevSet.weight_kg, weightUnit) // "60 kg" or "132.28 lbs"
```

### Anti-Patterns to Avoid

- **Hardcoded unit suffix:** Never use `\`${value} kg\`` — always use `formatWeight()` or at minimum `displayWeight()` + the unit from user preferences.
- **Calling `useWeightUnit()` in deeply nested components:** The hook triggers a SWR subscription. Better to read once in the parent and pass as a prop to avoid redundant subscriptions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| kg-to-lbs conversion | Manual multiplication | `displayWeight()` from `lib/fitness/units.ts` | Already handles 2-decimal rounding via `Math.round(x * 100) / 100` |
| Weight string with unit | Template literal with hardcoded unit | `formatWeight()` from `lib/fitness/units.ts` | Already combines `displayWeight()` + unit suffix |
| Reading user's weight preference | Direct localStorage/cookie | `useWeightUnit()` from `lib/hooks/use-active-workout.ts` | Reads from SWR-cached `/api/profile` with 10min dedup |

**Key insight:** Every utility needed for the fix already exists and is battle-tested in `WorkoutSetRow`. The fix is about wiring, not building.

## Common Pitfalls

### Pitfall 1: Volume Calculation Unit Confusion

**What goes wrong:** Converting individual set weights to display unit before summing, causing cumulative rounding errors.
**Why it happens:** Developer converts each `set.weight_kg` to display unit, then sums, instead of summing in kg and converting at the end.
**How to avoid:** Sum `weight_kg * reps` in kg (as the current code already does), then convert the total via `displayWeight()` for display. Only convert at the final display boundary.
**Warning signs:** Volume totals don't match mental math; small but growing discrepancies with more sets.

### Pitfall 2: Forgetting i18n Cleanup Across All Three Locales

**What goes wrong:** Deleting i18n key from `en.json` but forgetting `zh.json` and `zh-TW.json`.
**Why it happens:** Project has 3 locale files that must stay in sync.
**How to avoid:** Delete `restTimerSkip` from all three: `i18n/messages/en.json`, `i18n/messages/zh.json`, `i18n/messages/zh-TW.json`.
**Warning signs:** Build/lint warnings about unused i18n keys (if i18n linting is active).

### Pitfall 3: Breaking WorkoutFinishDialog Interface

**What goes wrong:** Adding `weightUnit` prop to the component but forgetting to pass it from the parent `WorkoutLogger`.
**Why it happens:** TypeScript will catch this at build time, but it's easy to overlook during development.
**How to avoid:** Update both the interface definition AND the caller in `workout-logger.tsx` in the same change.
**Warning signs:** TypeScript compilation error (guaranteed catch).

## Code Examples

Verified patterns from existing codebase:

### Fix 1: WorkoutFinishDialog Volume Display

```typescript
// File: components/fitness/workout-logger/workout-finish-dialog.tsx
//
// CURRENT (line 99, hardcoded):
//   {stats.totalVolume > 0 ? `${stats.totalVolume.toLocaleString()} kg` : "-"}
//
// FIX: Import formatWeight, accept weightUnit prop, use formatWeight()

import { displayWeight, formatWeight } from "@/lib/fitness/units";
import type { WeightUnit } from "@/lib/db/types";

interface WorkoutFinishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: WorkoutWithExercises;
  durationSeconds: number;
  onConfirm: () => void;
  weightUnit: WeightUnit;  // <-- ADD THIS
}

// In the stats useMemo, totalVolume is computed as kg (sum of weight_kg * reps).
// At the display boundary:
{stats.totalVolume > 0
  ? formatWeight(stats.totalVolume, weightUnit)
  : "-"}
```

### Fix 2: Pass weightUnit from WorkoutLogger

```typescript
// File: components/fitness/workout-logger/workout-logger.tsx (line 140-144)
//
// CURRENT:
//   <WorkoutFinishDialog
//     open={showFinishDialog}
//     onOpenChange={setShowFinishDialog}
//     workout={workout}
//     durationSeconds={finishDuration}
//     onConfirm={...}
//   />
//
// FIX: Add weightUnit prop
//   <WorkoutFinishDialog
//     ...
//     weightUnit={weightUnit}  // <-- ADD THIS (already in scope from line 23)
//   />
```

### Fix 3: Delete Orphaned Files/Exports

```bash
# Delete orphaned WorkoutRestTimer component
rm components/fitness/workout-logger/workout-rest-timer.tsx

# Remove loadWorkoutFromStorage from workout-session.ts
# (keep saveWorkoutToStorage and clearWorkoutStorage — they ARE used)
```

### Fix 4: Clean i18n Keys

```bash
# Remove "restTimerSkip" from all three locale files:
# - i18n/messages/en.json (line 938)
# - i18n/messages/zh-TW.json (line 938)
# - i18n/messages/zh.json (line 938)
```

## Detailed File Inventory

### Files to MODIFY

| File | Change | Lines Affected |
|------|--------|----------------|
| `components/fitness/workout-logger/workout-finish-dialog.tsx` | Add `weightUnit` prop, import `formatWeight`, replace hardcoded `kg` | ~5 lines changed |
| `components/fitness/workout-logger/workout-logger.tsx` | Pass `weightUnit` to `WorkoutFinishDialog` | 1 line added |
| `lib/fitness/workout-session.ts` | Remove `loadWorkoutFromStorage` function and its export | ~10 lines removed |
| `i18n/messages/en.json` | Remove `restTimerSkip` key | 1 line removed |
| `i18n/messages/zh.json` | Remove `restTimerSkip` key | 1 line removed |
| `i18n/messages/zh-TW.json` | Remove `restTimerSkip` key | 1 line removed |

### Files to DELETE

| File | Reason |
|------|--------|
| `components/fitness/workout-logger/workout-rest-timer.tsx` | Orphaned — never imported, rest timer display implemented inline in `workout-header.tsx` |

### Files NOT to Touch

| File | Reason |
|------|--------|
| `lib/fitness/units.ts` | Already correct — `displayWeight`, `formatWeight`, `toKg` are fine |
| `lib/hooks/use-active-workout.ts` | Already exports `useWeightUnit()` — no changes needed |
| `components/fitness/workout-logger/workout-header.tsx` | Contains working inline rest timer — leave as-is |
| `components/fitness/workout-logger/workout-set-row.tsx` | Already uses `displayWeight`/`formatWeight` correctly |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standalone `WorkoutRestTimer` component | Inline rest timer in `WorkoutHeader` | Phase 19-05 | The standalone component was built in 19-03 but replaced by the header-integrated version in 19-05 |
| `loadWorkoutFromStorage` for crash recovery | SWR fetch from `/api/workouts/active` on page load | Phase 19-01 | Server is source of truth; localStorage is write-only fallback |

**Deprecated/outdated:**
- `WorkoutRestTimer` component: Superseded by inline header implementation in Phase 19-05
- `loadWorkoutFromStorage`: Never wired — SWR handles session recovery via API

## Testing Strategy

No existing tests cover the affected files. Given the small scope:

1. **Manual verification:** Start a workout, log sets with weight, switch to lbs in settings, open finish dialog — verify volume shows in lbs.
2. **Unit test (optional but recommended):** Test `formatWeight` is already trivially tested via its implementation. A render test for `WorkoutFinishDialog` with `weightUnit="lbs"` could verify the displayed string.
3. **Build check:** `pnpm build` ensures no broken imports after file deletion.
4. **Lint check:** `pnpm lint` ensures no unused imports remain.

## Open Questions

None. All three items are fully diagnosed with clear implementation paths. No ambiguity remains.

## Sources

### Primary (HIGH confidence)

- **Codebase inspection** — Direct file reads of all affected source files:
  - `components/fitness/workout-logger/workout-finish-dialog.tsx` — hardcoded `kg` on line 99
  - `components/fitness/workout-logger/workout-rest-timer.tsx` — orphaned, zero importers
  - `lib/fitness/workout-session.ts` — `loadWorkoutFromStorage` exported but never imported
  - `lib/fitness/units.ts` — `displayWeight`, `formatWeight`, `toKg` utilities
  - `components/fitness/workout-logger/workout-logger.tsx` — parent already holds `weightUnit`
  - `components/fitness/workout-logger/workout-set-row.tsx` — reference implementation of weight unit pattern
- **v1.0 Milestone Audit** (`.planning/v1.0-MILESTONE-AUDIT.md`) — identifies all three gaps
- **Project REQUIREMENTS.md** — SETT-02 definition and traceability

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all utilities already exist and are verified in production
- Architecture: HIGH — prop-threading pattern is used throughout the codebase
- Pitfalls: HIGH — all pitfalls are well-understood with clear prevention strategies

**Research date:** 2026-02-24
**Valid until:** Indefinite (codebase-specific findings, not library-version-dependent)
