# Phase 1: Frequency Correctness - Research

**Researched:** 2026-02-15
**Domain:** Habit frequency calculation logic (shouldTrackOnDate, streaks, stats, insights)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **times_per_week stats calculation**: Per-week evaluation, NOT per-day. 3x/week habit with 3 completions = 100% for that week. Streak: +1 for each week meeting count threshold. `shouldTrackOnDate()` should NOT return `true` for every day when `times_per_week`.
- **weekly frequency behavior**: "Once per week, any day counts" -- NOT a specific scheduled day. Streak: +1 for each week with at least 1 completion. `shouldTrackOnDate()` must NOT hardcode Monday. No day picker. No schema migration. No `day` field.
- **shouldTrackOnDate deduplication**: Remove the duplicate in `lib/db/habit-logs.ts` -- single source in `lib/habits/format.ts`. All consumers import from `lib/habits/format.ts`.
- **WeeklyInsight discriminated union**: Replace flat `Record<string, string | number>` params with discriminated union by `type` field. Enables exhaustive `switch` statements.
- **Test updates**: All 8 tests asserting incorrect behavior must be updated. 2 pre-existing failures in `habit-logs.test.ts` (issue #98) should pass after the fix.
- **Transition experience**: Silent fix -- stats just become correct. No user notification needed.

### Claude's Discretion
- Exact implementation approach for weekly-group evaluation in stats callers
- How `shouldTrackOnDate` handles `times_per_week` (return true always and let callers do weekly grouping, OR make it week-boundary-aware)
- Which insight types need discriminated union variants

### Deferred Ideas (OUT OF SCOPE)
- User-chosen day for weekly habits -- decided against per PRD (weekly = any day counts)
- CORR-03 (day picker UI) and CORR-04 (backwards compatibility for day field) -- removed from requirements
</user_constraints>

## Summary

This phase fixes calculation logic bugs in `shouldTrackOnDate()` and its downstream consumers for `weekly` and `times_per_week` frequency types. The current implementation hardcodes `weekly` to Monday only (`dayOfWeek === 1`) and treats `times_per_week` as daily tracking (`return true`), both contradicting PRD V1.2 section 6.2 which defines weekly as "any day that week counts" and times_per_week as week-level evaluation.

The fix touches one core function (`shouldTrackOnDate` in `lib/habits/format.ts`), removes one duplicate (`private shouldTrackOnDate` in `lib/db/habit-logs.ts`), and updates six consumer modules across the codebase. The `getDetailedHabitStats` and `calculateWeeklyStreak` methods in `habit-logs.ts` already have correct weekly-group logic for `times_per_week` -- they bypass `shouldTrackOnDate` entirely for that frequency type. The main issue is in the other consumers (insights, absence, heatmap, habits DB) that call `shouldTrackOnDate` directly and get wrong answers for `weekly` and `times_per_week`.

Additionally, the `WeeklyInsight` type is defined in two places (`lib/db/insights.ts` and `components/dashboard/weekly-insight-card.tsx`) with a loose `params: Record<string, string | number>` that provides no type safety when consuming different insight types. This should be replaced with a discriminated union.

**Primary recommendation:** Fix `shouldTrackOnDate` to return `true` for all days when frequency is `weekly` (any day counts), keep `times_per_week` returning `true` for all days (already correct there), and update all consumers that need weekly-group semantics to handle evaluation at the week level rather than the day level.

## Standard Stack

### Core (no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | strict mode | Type safety for discriminated unions | Already in project |
| Vitest | existing | Unit testing for all calculation logic | Already in project |
| date-fns | 4.1.0 | Date manipulation in heatmap module | Already used in `lib/habits/heatmap.ts` |

### Supporting
No new libraries needed. This phase is pure logic refactoring within existing code.

## Architecture Patterns

### Current Module Structure (relevant files)
```
lib/
  habits/
    format.ts          # shouldTrackOnDate (canonical), formatFrequency
    absence.ts         # computeMissedDays (uses shouldTrackOnDate)
    heatmap.ts         # buildHeatmapData (uses shouldTrackOnDate)
  db/
    types.ts           # HabitFrequency discriminated union type
    habits.ts          # getHabitsWithTodayStatus (uses shouldTrackOnDate)
    habit-logs.ts      # DUPLICATE shouldTrackOnDate (private), calculateStreak, getDetailedHabitStats
    insights.ts        # computePerHabitRates, computePerDayRates (uses shouldTrackOnDate)
components/
  dashboard/
    weekly-insight-card.tsx  # DUPLICATE WeeklyInsight type definition
```

### Pattern 1: shouldTrackOnDate Behavior Change for `weekly`

**What:** Change `weekly` case from `dayOfWeek === 1` (Monday only) to `return true` (any day counts).

**Why this is correct:** PRD V1.2 section 6.2 defines weekly as "+1 for each week with at least 1 completion" and "Full week passes with 0 completions" as the break rule. The function answers "should this habit appear as trackable on this date?" -- for weekly habits, the answer is yes for any day, because the user can complete it on any day of the week.

**Impact analysis:** This change affects every consumer of `shouldTrackOnDate` for `weekly` frequency:

| Consumer | Current behavior with `weekly` | After fix |
|----------|-------------------------------|-----------|
| `lib/habits/heatmap.ts` | Only Monday shows as "missed/completed", other days "not_scheduled" | All days show as trackable |
| `lib/habits/absence.ts` | Only counts missed Mondays | Counts missed days (needs weekly-group logic) |
| `lib/db/habits.ts` (`getScheduledDays`) | Counts only Mondays in month | Counts all days (needs weekly-group logic) |
| `lib/db/insights.ts` (`computePerHabitRates`) | Evaluates only Monday completion | Evaluates all-day completion (needs weekly-group logic) |
| `lib/db/insights.ts` (`computePerDayRates`) | Only Monday is "scheduled" | All days are "scheduled" |
| `lib/db/habit-logs.ts` (private duplicate) | Same as canonical -- will be removed | N/A (removed) |

**Critical insight:** Simply changing `shouldTrackOnDate` to return `true` for `weekly` will fix heatmap (correctly shows all days as trackable) but will BREAK stats callers that divide completions by scheduled days. A `weekly` habit tracked daily would show 1/7 = 14% for a week with 1 completion instead of the correct 100%. Stats callers need special handling.

**Example (canonical fix in `lib/habits/format.ts`):**
```typescript
case "weekly":
  return true;  // Any day of the week counts (PRD V1.2 section 6.2)
```

### Pattern 2: Weekly-Group Evaluation for Stats Callers

**What:** Stats callers that compute completion rates must evaluate `weekly` and `times_per_week` at the week level, not the day level.

**Recommendation:** For callers that compute completion rates (insights `computePerHabitRates`, habits `getScheduledDays`, absence `computeMissedDays`), add week-level evaluation logic similar to what `getDetailedHabitStats` already does for `times_per_week`.

**Key callers that need weekly-group logic:**

1. **`lib/db/habits.ts` -- `getScheduledDays()`**: Currently counts individual days where `shouldTrackOnDate` returns true. For `weekly`, should count weeks and multiply by 1. For `times_per_week`, already has special handling (counts Mondays as week markers) but the approach is fragile.

2. **`lib/db/insights.ts` -- `computePerHabitRates()`**: Iterates day-by-day checking `shouldTrackOnDate`. For `weekly` and `times_per_week`, should group by week and evaluate per-week success.

3. **`lib/db/insights.ts` -- `computePerDayRates()`**: Computes which day-of-week has worst completion. For `weekly` habits, this metric is less meaningful (user picks any day). Could either skip weekly/times_per_week habits or handle gracefully.

4. **`lib/habits/absence.ts` -- `computeMissedDays()`**: Walks backwards counting consecutive missed scheduled days. For `weekly`, should count consecutive missed weeks, not days. For `times_per_week`, currently counts every day (line 143-157 of absence test confirms this) -- should evaluate at week level.

5. **`lib/habits/heatmap.ts` -- `buildHeatmapData()`**: Day-level display is fine. For `weekly`, all days show as "missed" until completed -- this is acceptable UX behavior (shows the day user completed and marks others as "not yet done this week"). However, consider whether showing all non-completed days as "missed" is confusing. The heatmap could potentially show "not_scheduled" for days after the first completion in a week. This is a UX nuance the planner should address.

**Example (weekly-group evaluation for insights `computePerHabitRates`):**
```typescript
private computePerHabitRates(
  habits: Habit[],
  logs: Array<{ habit_id: string; logged_date: string }>,
  weekStart: Date,
  weekEnd: Date,
): Map<string, number> {
  const rates = new Map<string, number>();
  const logsByHabit = new Map<string, Set<string>>();

  for (const log of logs) {
    const set = logsByHabit.get(log.habit_id) || new Set<string>();
    set.add(log.logged_date);
    logsByHabit.set(log.habit_id, set);
  }

  for (const habit of habits) {
    const habitLogs = logsByHabit.get(habit.id) || new Set<string>();

    if (habit.frequency.type === 'weekly') {
      // Weekly: 1 completion in the week = 100%
      const hasCompletion = [...habitLogs].length > 0;
      rates.set(habit.id, hasCompletion ? 100 : 0);
    } else if (habit.frequency.type === 'times_per_week') {
      // times_per_week: count completions vs target
      const completions = [...habitLogs].length;
      const target = habit.frequency.count;
      rates.set(habit.id, Math.min(Math.round((completions / target) * 100), 100));
    } else {
      // Day-level evaluation (daily, weekdays, custom)
      let scheduled = 0;
      let completed = 0;
      const checkDate = new Date(weekStart);
      while (checkDate <= weekEnd) {
        if (shouldTrackOnDate(habit.frequency, checkDate)) {
          scheduled++;
          if (habitLogs.has(getLocalDateString(checkDate))) {
            completed++;
          }
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
      if (scheduled > 0) {
        rates.set(habit.id, Math.round((completed / scheduled) * 100));
      }
    }
  }

  return rates;
}
```

### Pattern 3: Deduplication of shouldTrackOnDate

**What:** Remove the `private shouldTrackOnDate` method from `lib/db/habit-logs.ts` (lines 295-321) and import from `lib/habits/format.ts`.

**Current state:**
- `lib/habits/format.ts` exports `shouldTrackOnDate` (canonical)
- `lib/db/habit-logs.ts` has a private method `shouldTrackOnDate` with identical logic (duplicate)
- The `habit-logs.ts` private method is used by `calculateStreak` (line 201) and `countDaysInRange` (line 424)

**Fix approach:**
1. Add `import { shouldTrackOnDate } from '@/lib/habits/format'` to `habit-logs.ts`
2. Remove the `private shouldTrackOnDate` method (lines 295-321)
3. Change `this.shouldTrackOnDate(...)` calls to `shouldTrackOnDate(...)` (remove `this.`)

**Important:** After deduplication, `calculateStreak` for non-times_per_week habits (daily, weekdays, weekly, custom) uses `shouldTrackOnDate` in its backward walk. For `weekly`, this will now return `true` for every day, which means the streak calculation will count every day -- but `weekly` streak should count weeks, not days. The `times_per_week` case already has special handling that bypasses `shouldTrackOnDate` (line 189). A similar bypass needs to be added for `weekly`.

### Pattern 4: WeeklyInsight Discriminated Union

**What:** Replace the flat `params: Record<string, string | number>` with a discriminated union keyed on `type`.

**Current type (in two places):**
```typescript
// lib/db/insights.ts
export interface WeeklyInsight {
  type: "best_week" | "worst_day" | "best_habit" | "streak_proximity" | "improvement" | "decline";
  message: string;
  params: Record<string, string | number>;
  priority: number;
}

// components/dashboard/weekly-insight-card.tsx (DUPLICATE)
export interface WeeklyInsight {
  type: string;          // Even looser -- just string
  message: string;
  params: Record<string, string | number>;
  priority: number;
}
```

**Proposed discriminated union:**
```typescript
// lib/db/insights.ts (single source of truth)
export type WeeklyInsight = {
  message: string;
  priority: number;
} & (
  | { type: "best_week"; params: { percent: number } }
  | { type: "worst_day"; params: { day: string } }
  | { type: "best_habit"; params: { habit: string; percent: number } }
  | { type: "streak_proximity"; params: { habit: string; days: number; milestone: number } }
  | { type: "improvement"; params: { change: number } }
  | { type: "decline"; params: { percent: number; lastPercent: number } }
);
```

**Param shapes (verified from `lib/db/insights.ts` source code):**
| Type | Params | Source lines |
|------|--------|-------------|
| `best_week` | `{ percent: number }` | L170 |
| `worst_day` | `{ day: string }` | L191 |
| `best_habit` | `{ habit: string; percent: number }` | L158 |
| `streak_proximity` | `{ habit: string; days: number; milestone: number }` | L133 |
| `improvement` | `{ change: number }` | L218 |
| `decline` | `{ percent: number; lastPercent: number }` | L202 |

**Consumer impact:**
- `components/dashboard/weekly-insight-card.tsx` -- remove duplicate type, import from `lib/db/insights.ts`
- `tests/components/dashboard/weekly-insight-card.test.tsx` -- update import
- `tests/lib/db/insights.test.ts` -- update test data to match typed params
- `tests/app/api/insights/weekly.test.ts` -- update mock data

### Anti-Patterns to Avoid
- **Changing shouldTrackOnDate without updating all callers:** The function has 6 consumers. Missing even one will silently produce wrong stats.
- **Assuming shouldTrackOnDate result equals "is this a tracked period":** For weekly/times_per_week, the tracked period is a week, not a day. Callers must understand this distinction.
- **Testing at the wrong granularity:** Tests for weekly stats should assert week-level percentages (100% if 1+ completion in week), not day-level (14% for 1/7 days).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Week boundary calculation | Custom week math | Existing `getWeekStart()` and `getWeekKey()` helpers in `habit-logs.ts` | Already handles weekStartDay preference, tested |
| Date string parsing | `new Date(dateStr)` | `const [y,m,d] = dateStr.split('-').map(Number); new Date(y, m-1, d)` | UTC vs local timezone bugs. The split-and-construct pattern is already used throughout the codebase |

**Key insight:** The `getWeekStart()` and `getWeekKey()` helper functions in `habit-logs.ts` are currently module-private. They should be extracted to a shared location (e.g., `lib/habits/week-utils.ts` or `lib/utils.ts`) since insights, absence, and habits modules will also need week-grouping logic.

## Common Pitfalls

### Pitfall 1: Weekly shouldTrackOnDate Breaking Streak Calculation
**What goes wrong:** After fixing `shouldTrackOnDate` to return `true` for `weekly`, the `calculateStreak` method in `habit-logs.ts` (which uses `shouldTrackOnDate` for daily/weekdays/weekly/custom) will walk backwards day-by-day and expect a completion every day for weekly habits.
**Why it happens:** `calculateStreak` was written assuming weekly = Monday only, so walking past a Tuesday would skip it (not scheduled). With the fix, Tuesday becomes "scheduled" and missing it breaks the streak.
**How to avoid:** Add a special case for `weekly` in `calculateStreak` similar to the existing `times_per_week` handling (line 189). Route `weekly` to `calculateWeeklyStreak` with `targetPerWeek = 1`.
**Warning signs:** Weekly habit streaks always showing 0 or 1 after the fix.

### Pitfall 2: Heatmap Showing All Days as "Missed" for Weekly
**What goes wrong:** After fixing `shouldTrackOnDate`, the heatmap for weekly habits will show every day as "missed" except the day with a completion.
**Why it happens:** `buildHeatmapData` marks any scheduled day without a completion as "missed". With weekly returning `true` for all days, 6 out of 7 days per week will show red/missed.
**How to avoid:** The heatmap should either (a) use week-level evaluation for weekly habits (show entire week as completed/missed), or (b) show only the completion day as "completed" and other days as "not_scheduled" once the week's goal is met. Option (b) is simpler and aligns with the "any day counts" semantics.
**Warning signs:** Users seeing a mostly-red heatmap for a perfectly-tracked weekly habit.

### Pitfall 3: Absence Counting Days Instead of Weeks for Weekly
**What goes wrong:** `computeMissedDays` walks backwards day-by-day. For weekly with `shouldTrackOnDate` returning `true` for all days, it will count every missed day rather than missed weeks.
**Why it happens:** The function was designed for day-granular frequencies.
**How to avoid:** Add week-level evaluation for `weekly` and `times_per_week` in `computeMissedDays`, similar to what's needed in other callers.
**Warning signs:** Absence cards showing "7 missed days" instead of "1 missed week" for weekly habits.

### Pitfall 4: Monthly Completion Rate Inflation/Deflation
**What goes wrong:** `getHabitsWithTodayStatus` in `habits.ts` calculates `monthly_completion_rate` using `getScheduledDays`. For weekly, currently only counts Mondays (so ~4 scheduled days/month). After fix, it would count every day (~30 scheduled days/month), drastically lowering the percentage.
**Why it happens:** The scheduled-day denominator changes from ~4 to ~30.
**How to avoid:** `getScheduledDays` needs special handling for `weekly` and `times_per_week` that counts weeks, not days.
**Warning signs:** Monthly completion rate dropping from ~100% to ~14% for well-tracked weekly habits.

### Pitfall 5: Two Pre-existing Test Failures (Issue #98)
**What goes wrong:** Tests in `habit-logs.test.ts` for `times_per_week getDetailedHabitStats` currently fail.
**Why it happens:** The test expectations were written based on incorrect understanding, or the implementation was changed after tests were written.
**How to avoid:** After fixing the logic, run these specific tests to verify they now pass. The fix to `shouldTrackOnDate` deduplication + correct weekly-group evaluation should resolve these failures.
**Warning signs:** Tests still failing after changes -- double-check both test expectations and implementation.

### Pitfall 6: Timezone Sensitivity in Week Boundary Calculations
**What goes wrong:** Using `new Date(dateStr)` instead of explicit `new Date(y, m-1, d)` can cause dates to shift by one day in negative-offset timezones.
**Why it happens:** `new Date('2026-01-01')` is interpreted as UTC midnight, which becomes Dec 31 in US timezones.
**How to avoid:** Always use the split-and-construct pattern: `const [y,m,d] = dateStr.split('-').map(Number); new Date(y, m-1, d)`. This is already the convention in the codebase.
**Warning signs:** Tests passing locally but failing in CI with different timezone settings.

## Code Examples

### Existing times_per_week Weekly-Group Logic (already correct)
```typescript
// Source: lib/db/habit-logs.ts lines 189-191
// In calculateStreak, times_per_week already bypasses day-level evaluation:
if (frequency.type === 'times_per_week') {
  return this.calculateWeeklyStreak(completedDates, frequency.count, weekStartDay, today, previousBestStreak);
}
```

### Existing getTimesPerWeekStats (already correct pattern for weekly-group evaluation)
```typescript
// Source: lib/db/habit-logs.ts lines 520-599
// getTimesPerWeekStats groups completions by week, counts successful weeks
// This same pattern should be applied for `weekly` frequency (with targetPerWeek = 1)
```

### PRD V1.2 Section 6.2 Streak Rules (source of truth)
```
| Frequency       | Streak Increment Rule                    | Streak Break Rule                         |
|-----------------|------------------------------------------|-------------------------------------------|
| Weekly          | +1 for each week with at least 1 comp.   | Full week passes with 0 completions       |
| 3x/week         | +1 for each week meeting 3+ completions  | Week ends with <3 completions             |
| 2x/week         | +1 for each week meeting 2+ completions  | Week ends with <2 completions             |
```

### Complete List of Tests Asserting Incorrect Behavior (8 tests)
```
1. tests/lib/habits/format.test.ts:117
   "weekly tracks only Monday" -- asserts shouldTrackOnDate returns true only for Monday

2. tests/lib/habits/format.test.ts:123
   "times_per_week tracks every day (count enforced elsewhere)" -- assertion is CORRECT but
   test name/comment is misleading. The assertion itself (returns true) is correct behavior.
   UPDATE: This test is actually correct. Only the description is slightly misleading.

3. tests/lib/habits/heatmap.test.ts:119
   "handles weekly frequency: only Monday is scheduled" -- asserts Tuesday is "not_scheduled"

4. tests/lib/habits/heatmap.test.ts:129
   "handles times_per_week frequency: all days are scheduled" -- assertion is CORRECT.
   This test actually asserts the right thing (all days scheduled/missed). May not need updating.

5. tests/lib/habits/absence.test.ts:116
   "handles weekly frequency (Monday only)" -- asserts only Monday counted as scheduled

6. tests/lib/habits/absence.test.ts:131
   "counts missed weeks for weekly frequency" -- asserts missed based on Monday-only logic

7. tests/lib/habits/absence.test.ts:143
   "treats every day as scheduled for times_per_week frequency" -- day-level evaluation
   (may need updating if absence logic changes to week-level for times_per_week)

8. Pre-existing failures in habit-logs.test.ts (issue #98) -- 2 tests that should pass after fix
```

**Refined count:** After detailed analysis, here are the tests that DEFINITELY need updating:
- format.test.ts: 1 test (weekly tracks only Monday)
- heatmap.test.ts: 1 test (weekly: only Monday is scheduled)
- absence.test.ts: 2-3 tests (weekly Monday-only, weekly missed weeks, times_per_week day-level)
- habit-logs.test.ts: 2 tests (pre-existing failures, issue #98)

Total: 6-8 tests, depending on how absence and times_per_week tests are updated.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `weekly` = Monday only | `weekly` = any day that week | This phase | Fixes incorrect streak/stats for weekly habits |
| `times_per_week` evaluated daily | `times_per_week` evaluated weekly | Partially done in `getDetailedHabitStats` | Needs extending to insights, absence, heatmap |
| Duplicate `shouldTrackOnDate` | Single source in `format.ts` | This phase | Eliminates maintenance divergence |
| `WeeklyInsight` flat params | Discriminated union params | This phase | Type-safe consumer code |

## Open Questions

1. **How should the heatmap display weekly habits after the fix?**
   - What we know: Currently shows only Monday as scheduled. After fix, all days will show as trackable.
   - What's unclear: Should days after the weekly completion show as "not_scheduled" (user met goal) or remain "missed" (technically trackable)?
   - Recommendation: Show all days as trackable (via `shouldTrackOnDate` returning `true`), and let the current "completed"/"missed" logic handle it. A weekly habit with 1 completion will show 1 green + 6 red, which is slightly misleading but functional. A more sophisticated approach would mark remaining days as "not_scheduled" after the week's goal is met, but this adds complexity and is a UI concern beyond this phase's scope (no UI changes).

2. **Should `computeMissedDays` evaluate weekly/times_per_week at week level?**
   - What we know: Current behavior counts individual days. The absence card shows "X missed scheduled days."
   - What's unclear: Is "3 missed weeks" more meaningful than "21 missed days" for a weekly habit?
   - Recommendation: Keep day-level granularity for the absence count but acknowledge that for weekly habits, the "missed" metric is less precise. This maintains backward compatibility and avoids changing the absence card UX. Alternatively, since the phase allows changes to calculation logic (not UI), the computeMissedDays could return week-count for weekly habits. The planner should decide.

3. **Should `getWeekStart` and `getWeekKey` be extracted to a shared utility?**
   - What we know: These helpers exist in `habit-logs.ts` and are duplicated in `insights.ts`. Multiple consumers will need week-grouping.
   - What's unclear: Best location -- `lib/utils.ts` (already has `getLocalDateString`) or a new `lib/habits/week-utils.ts`.
   - Recommendation: Extract to `lib/utils.ts` alongside `getLocalDateString` since they're general-purpose date utilities.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- Direct reading of all 6 source files containing `shouldTrackOnDate` usage
- **PRD V1.2 section 6.2** (`docs/BETTERR_ME_PRD_V1.2.md` lines 275-284) -- Streak calculation rules table
- **Test files** -- All 5 test files covering frequency logic, directly read and analyzed
- **Type definitions** (`lib/db/types.ts`) -- `HabitFrequency` discriminated union definition

### Secondary (MEDIUM confidence)
- **REQUIREMENTS.md** (`.planning/REQUIREMENTS.md`) -- CORR-01 through CORR-08 requirement definitions

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure logic refactoring
- Architecture: HIGH -- all affected files read and analyzed, call chains traced
- Pitfalls: HIGH -- identified from direct code analysis of all consumers and their interactions
- Test impact: HIGH -- all test files read, specific tests identified with line numbers

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- internal logic, no external dependencies changing)
