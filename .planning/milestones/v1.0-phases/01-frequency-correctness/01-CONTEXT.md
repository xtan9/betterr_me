# Phase 1: Frequency Correctness - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix `shouldTrackOnDate()` and all stats/streak consumers so users see accurate completion percentages and streaks for `times_per_week` and `weekly` frequency types. No UI changes — this is purely calculation logic fixes.

</domain>

<decisions>
## Implementation Decisions

### times_per_week stats calculation
- Per-week evaluation, NOT per-day: a 3x/week habit with 3 completions in a week = 100% for that week
- Streak: +1 for each week meeting count threshold (3+, 2+). Break: week ends under threshold.
- `shouldTrackOnDate()` should NOT return `true` for every day when `times_per_week` — stats callers need weekly-group evaluation instead
- Source: PRD V1.2 §6.2 streak rules table

### weekly frequency behavior
- "Once per week, any day counts" — NOT a specific scheduled day
- Streak: +1 for each week with at least 1 completion. Break: full week passes with 0 completions.
- `shouldTrackOnDate()` must NOT hardcode Monday. The `weekly` type means "any day this week" for stats purposes.
- No day picker needed. No schema migration needed. No `day` field on frequency object.
- Source: PRD V1.2 §6.2 — `{ type: 'weekly' }` defined as "Once per week (any day counts)"

### shouldTrackOnDate deduplication
- Remove the duplicate in `lib/db/habit-logs.ts` — single source in `lib/habits/format.ts`
- All consumers import from `lib/habits/format.ts`

### WeeklyInsight discriminated union
- Replace flat `Record<string, string | number>` params with discriminated union by `type` field
- Enables exhaustive `switch` statements with compile-time safety in consumer components

### Test updates
- All 8 tests asserting incorrect behavior (Monday-only for weekly, daily tracking for times_per_week) must be updated to assert correct behavior
- 2 pre-existing failures in `habit-logs.test.ts` (issue #98) should pass after the fix

### Transition experience
- Silent fix — stats just become correct. No user notification needed.
- Users will see improved (higher) completion rates for times_per_week habits

### Claude's Discretion
- Exact implementation approach for weekly-group evaluation in stats callers
- How `shouldTrackOnDate` handles `times_per_week` (return true always and let callers do weekly grouping, OR make it week-boundary-aware)
- Which insight types need discriminated union variants

</decisions>

<specifics>
## Specific Ideas

- PRD V1.2 §6.2 is the source of truth for streak calculation rules by frequency type
- PRD glossary: "Completion rate = Percentage of scheduled days where habit was completed"
- The `custom` frequency type already works correctly — only `times_per_week` and `weekly` need fixes
- `getDetailedHabitStats` in `habit-logs.ts` already has some weekly-group logic for `times_per_week` — may be partially correct

</specifics>

<deferred>
## Deferred Ideas

- User-chosen day for weekly habits — decided against per PRD (weekly = any day counts), but could revisit if users request it
- CORR-03 (day picker UI) and CORR-04 (backwards compatibility for day field) are no longer needed — remove from requirements

</deferred>

---

*Phase: 01-frequency-correctness*
*Context gathered: 2026-02-15*
