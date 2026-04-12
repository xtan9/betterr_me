# Habit Graduation Design

**Date:** 2026-04-12
**Status:** Design approved, pending implementation plan

## Problem

Once a habit becomes truly habitual, there's no closure in the app. A user can hit a 365-day streak and the UI treats it the same as day 8. There is no "graduation" or "formed" concept, so formed habits continue to clutter the daily tracking list forever, and users never get the satisfying moment of looking back at what they've built.

## Goals

1. **Celebration moment** — let users feel accomplishment at milestones and especially at habit formation
2. **Declutter** — move formed habits out of daily tracking into a dedicated gallery
3. **Reinforcement** — let users re-activate a formed habit if it starts slipping
4. **User freedom** — graduation is always user-initiated at any time; the app only *suggests* eligibility

## Non-goals (v1)

- Push/email notifications for graduation eligibility (in-app banner only)
- Social sharing of formed habits
- Analytics on graduation patterns
- Bulk actions on the formed gallery

---

## Lifecycle

Current statuses: `active | paused | archived`
New statuses: `active | paused | formed` — `archived` is **removed**.

| State | Meaning |
|-------|---------|
| `active` | Currently being built, shows in daily tracking list |
| `paused` | Taking a break, visible in Paused tab, no tracking |
| `formed` | Graduated successfully, lives in Formed gallery, not in daily tracking |
| *deleted* | Hard-delete, gone (no soft-delete graveyard) |

Rationale for dropping `archived`: `paused` already covers "taking a break," `formed` covers "I succeeded," and hard-delete covers "I quit." Three lifecycle states is simpler than four, and the archived tab is rarely visited.

---

## Data model

### `habits` table — new columns

```sql
ALTER TABLE habits ADD COLUMN graduated_at TIMESTAMPTZ;
ALTER TABLE habits ADD COLUMN graduated_streak INTEGER;
```

- `graduated_at` — set when user graduates the habit, cleared on reactivation
- `graduated_streak` — snapshot of `current_streak` at graduation so the gallery can display "graduated at 87-day streak" even after reactivation resets `current_streak`

### `habits.status` check constraint

Update from `('active', 'paused', 'archived')` → `('active', 'paused', 'formed')`.

### New table: `habit_graduations`

Preserves full graduate → reactivate → re-graduate history across cycles.

```sql
CREATE TABLE habit_graduations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  graduated_at TIMESTAMPTZ NOT NULL,
  graduated_streak INTEGER NOT NULL,
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_habit_graduations_habit ON habit_graduations(habit_id);
CREATE INDEX idx_habit_graduations_user ON habit_graduations(user_id, graduated_at DESC);
```

RLS policies: same pattern as other user-owned tables (SELECT/INSERT/UPDATE/DELETE where `user_id = auth.uid()`).

### Migration (one-way)

1. Add the new columns and table
2. Update the `status` check constraint
3. **Hard-delete all existing `archived` habits** (approved by user — small impact, archived tab rarely used)
4. Code-only: add `21` to milestone thresholds

---

## Graduation semantics

### Graduate action

- Always available from habit detail page menu ("Graduate this habit") regardless of eligibility
- Flow: confirmation dialog → `status = 'formed'`, `graduated_at = now()`, `graduated_streak = current_streak`, insert `habit_graduations` row → confetti animation + toast → redirect to Formed tab

### Reactivate action

- Available from Formed gallery card
- Flow: confirmation dialog → `status = 'active'`, `current_streak = 0`, `graduated_at = null`, `graduated_streak = null`, update the latest `habit_graduations` row with `reactivated_at = now()`
- `best_streak` is preserved

---

## Graduation eligibility (the nudge)

Eligibility gates *when we show the nudge banner*, not whether the user can graduate. Users can graduate any habit at any time.

Thresholds are intentionally lenient — early nudge is low-cost since the user can dismiss it.

| Frequency | Eligible when |
|-----------|---------------|
| `daily` / `weekdays` | ≥21 days since creation AND ≥80% of scheduled days completed in last 21 scheduled days |
| `times_per_week` (2–3x) | ≥30 days since creation AND ≥80% consistency in last 30 scheduled days |
| `weekly` (1x) | ≥90 days since creation AND ≥80% consistency in last 90 scheduled days |
| `custom` | Bucket by reps/week: ≥4 → daily rule; 2–3 → times/week rule; 1 → weekly rule |

**Computation:** server-side in a new `HabitsDB` method (or extension of `getHabitsWithTodayStatus`). Returned as `graduation_eligible: boolean` on each habit object so the client doesn't recompute.

**Research note:** These thresholds are earlier than the research-backed ~60/90/120-day medians for automaticity ([Lally 2010](https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674), [2024 meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC11641623/)). We chose user-friendliness over scientific strictness — user feedback: "it's fine we remind too early."

---

## UI surfaces

### A. Habits page tabs

Current: `Active | Paused | Archived`
New: `Active | Paused | Formed`

### B. Habit card — graduation nudge banner

Dismissible banner at the top of an eligible habit's card in the Active tab:

```
┌──────────────────────────────────────────────┐
│ 🎓 Ready to graduate?                        │
│ You've built real consistency. Mark it as    │
│ formed anytime.                              │
│                        [Not yet]  [Graduate] │
└──────────────────────────────────────────────┘
```

- Shows **once per eligibility crossing**
- "Not yet" dismisses for 30 days (then re-evaluates)
- State persisted per-habit (simplest: `graduation_nudge_dismissed_at` column on habits, or a separate `habit_dismissals` table — decide in plan)

### C. Formed gallery (Formed tab)

Card grid layout (more celebratory than a list). Each card shows:
- Habit name + icon/category
- "Graduated on {date}"
- "At {graduated_streak}-day streak"
- Total days active (creation → graduation)
- Best streak (preserved)
- Actions: **Reactivate** / **Delete**
- Subtle 🎓 badge

Sort: `graduated_at DESC` (most recent first).

### D. Habit detail page — graduate action

Add **"Graduate this habit"** to the action menu (alongside Pause / Delete). Always available.

Confirmation dialog:
> **Graduate "Morning meditation"?**
> This habit will move to your Formed gallery. You can reactivate it anytime.
> [Cancel] [Graduate 🎓]

On confirm: confetti + toast "🎓 Graduated! Find it in your Formed gallery" → redirect to Formed tab.

### E. Reactivation dialog

From Formed gallery card:
> **Reactivate "Morning meditation"?**
> This will move it back to Active. Your streak starts fresh, but your best streak of {n} days is preserved.
> [Cancel] [Reactivate]

### F. Milestone celebrations (existing + day 21)

Update `MILESTONE_THRESHOLDS` in `lib/habits/milestones.ts`:
```ts
export const MILESTONE_THRESHOLDS = [7, 14, 21, 30, 50, 100, 200, 365] as const;
```

Day 21 fires the same confetti + toast + `habit_milestones` row that all other milestones do. No new UI needed — the milestone system handles it.

Day 21 also aligns with graduation-eligibility for daily/weekdays habits, so a user hitting 21 with ≥80% consistency will see both the milestone celebration *and* the graduation nudge on the same day. That's intentional — the moments reinforce each other.

---

## API changes

### New endpoints

- `POST /api/habits/[id]/graduate` — sets status to formed, snapshots streak, inserts graduation row
- `POST /api/habits/[id]/reactivate` — sets status to active, resets streak, stamps reactivated_at on latest graduation row
- `POST /api/habits/[id]/dismiss-graduation-nudge` — marks nudge dismissed for 30 days

### Existing endpoints

- `GET /api/habits` (or wherever `getHabitsWithTodayStatus` is surfaced) — add `graduation_eligible: boolean` to each habit
- Remove any `archiveHabit` flows (method, endpoint, UI triggers)

### AI/MCP tools

Add to `lib/ai/tools/habits.ts`:
- `graduateHabit(habitId)` — user can ask chat "graduate my reading habit"
- `reactivateHabit(habitId)` — user can ask chat "bring back my meditation habit"

Remove `archiveHabit` from MCP tools.

---

## Testing

- **DB layer** (`tests/lib/db/habits.test.ts`): `graduateHabit`, `reactivateHabit`, graduation history row creation, streak reset semantics, best_streak preservation
- **Eligibility** (new `tests/lib/habits/graduation.test.ts`): per-frequency thresholds, 80% consistency edge cases, custom-frequency bucketing by reps/week
- **API routes**: graduate/reactivate/dismiss-nudge endpoints, `graduation_eligible` field in list response
- **AI tools** (`tests/lib/ai/tools/habits.test.ts`): new graduate/reactivate tools
- **Components**: nudge banner (renders when eligible, dismissible, re-shows after 30 days), Formed tab rendering, graduate confirmation dialog, reactivate dialog
- **Migration**: archived habits auto-hard-deleted; existing habits unaffected

---

## i18n

All new strings in `en`, `zh`, `zh-TW`:
- `habits.tabs.formed`
- `habits.graduate.nudge_title`, `habits.graduate.nudge_body`, `habits.graduate.nudge_cta`, `habits.graduate.nudge_dismiss`
- `habits.graduate.confirm_title`, `habits.graduate.confirm_body`, `habits.graduate.confirm_cta`
- `habits.graduate.success_toast`
- `habits.reactivate.confirm_title`, `habits.reactivate.confirm_body`, `habits.reactivate.confirm_cta`
- `habits.formed_gallery.graduated_on`, `habits.formed_gallery.at_streak`, `habits.formed_gallery.total_days_active`, `habits.formed_gallery.best_streak`, `habits.formed_gallery.reactivate`, `habits.formed_gallery.empty_state`

---

## Open questions for implementation plan

- Where to store nudge dismissal state (column on habits vs. separate table)
- Exact visual treatment of Formed gallery cards (use existing habit card or new celebratory variant)
- Whether confetti animation reuses an existing component from milestone celebrations or introduces a new one
- Exact copy for milestone-21 vs. other milestones — should day 21 get a different celebratory message ("You've built real momentum")?

---

## References

- [Lally et al. 2010 — How are habits formed: Modelling habit formation in the real world](https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674)
- [Time to Form a Habit: Systematic Review & Meta-Analysis (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11641623/)
- [Making health habitual: the psychology of 'habit-formation'](https://pmc.ncbi.nlm.nih.gov/articles/PMC3505409/)
- [What can machine learning teach us about habit formation? (PNAS 2023)](https://www.pnas.org/doi/10.1073/pnas.2216115120)
