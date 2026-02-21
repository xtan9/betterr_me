# Absence Card Redesign

## Summary

Redesign the AbsenceCard component to be an informational reminder with dismiss capability, removing the redundant "Complete today" action (already available in the habit checklist below).

## Changes

### Remove
- Checkbox + "Complete today" label from recovery/lapse variants
- "Resume today" button from hiatus variant
- `onToggle` prop (no longer needed)
- `isCompleting` / `justCompleted` state
- `handleComplete` function

### Add
- **Dismiss X button** (top-right corner) — hides card for the rest of the day
- **"View habit" text link** — navigates to `/habits/{id}`

### Keep
- Variant visuals: recovery (amber), lapse (blue), hiatus (orange)
- Previous streak info for lapse variant
- "Change frequency" link for hiatus variant (same row as "View habit")

## Layout

### Recovery / Lapse
```
┌──────────────────────────────────────────────┐
│ [icon] Habit — missed X days              ✕  │
│        You had a N-day streak before         │
│        View habit ->                         │
└──────────────────────────────────────────────┘
```

### Hiatus
```
┌──────────────────────────────────────────────┐
│ [icon] Habit — it's been X days           ✕  │
│        View habit · Change frequency         │
└──────────────────────────────────────────────┘
```

## Dismiss Behavior

- localStorage key: `absence-dismissed-${habitId}-${todayDateString}`
- Clicking X sets the key and hides the card immediately
- Next day the key is stale — card reappears if the habit still has absence
- Pattern mirrors existing `WeeklyInsightCard` dismiss logic

## Files to Modify

- `components/dashboard/absence-card.tsx` — main changes
- `components/dashboard/dashboard-content.tsx` — remove `onToggle` prop from AbsenceCard, add dismiss filtering
- `i18n/messages/en.json`, `zh.json`, `zh-TW.json` — add "viewHabit" string, remove "markComplete"/"resume"/"completed"
- `tests/components/dashboard/absence-card.test.tsx` — update tests
- `tests/app/dashboard/dashboard-content.test.tsx` — update tests
