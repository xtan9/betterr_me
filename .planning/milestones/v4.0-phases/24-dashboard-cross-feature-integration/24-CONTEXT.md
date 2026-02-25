# Phase 24: Dashboard & Cross-Feature Integration - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Weave journal functionality into the daily workflow through four features: a dashboard journal widget, habit/task linking on journal entries, "On This Day" past reflections, and a journal streak counter. This phase does NOT add new journal CRUD capabilities — those exist from prior phases.

</domain>

<decisions>
## Implementation Decisions

### Journal Widget (Dashboard)
- **No-entry state:** Claude's discretion — mood selector + prompt, simple CTA, or text preview; pick what fits the dashboard best
- **Entry-exists state:** Show mood icon + first 2-3 lines of entry text, with a "View entry" link
- **Placement:** After the habits section on the dashboard (not top of page, not sidebar)
- **Click behavior:** Navigate to the full journal page — no inline editing or modals on the dashboard
- **Streak counter:** Lives inside the journal widget card (not in a separate stats section)

### Habit/Task Linking
- **Selection UX:** Tag-style chips — type to search, habits/tasks appear as selectable chips (like tagging in a note app)
- **Scope:** Can link to any habit or task, not limited to today's date
- **Availability:** Available in both edit mode AND from the read-only view (quick "Link habit/task" action)
- **Display on entry:** Colored tag chips (like GitHub labels) — habits in one color, tasks in another

### On This Day
- **Location:** Both the dashboard (as a teaser card) and the journal entry page (fuller view)
- **Lookback periods:** Fixed intervals — 30 days ago, 90 days ago, 1 year ago
- **Dashboard preview:** Mood icon + 2-3 line excerpt + time period label (e.g., "30 days ago")
- **Empty state:** Show an encouraging message like "Keep journaling — you'll see reflections here soon!"

### Journal Streak
- **Placement:** Inside the journal widget on the dashboard AND on the journal page (e.g., header bar)
- **Streak definition:** Any entry counts — even just a mood selection with no text keeps the streak alive
- **Milestones:** Subtle visual highlight for milestone numbers (7 days, 30 days, etc.) — rewarding without being flashy

### Claude's Discretion
- Journal widget no-entry state design (mood selector, CTA, or text preview)
- Exact milestone thresholds and their visual treatment
- On This Day card layout and animation
- How the linking chip search/filter works technically
- Loading states and error handling for all new components

</decisions>

<specifics>
## Specific Ideas

- Journal widget sits after habits, before other dashboard sections — journal is part of the daily flow but habits come first for quick check-offs
- Linked items should feel like GitHub issue labels — small, colored, recognizable at a glance
- On This Day on the journal page should show full past entries, not just teasers
- Streak visible while writing to motivate continued journaling

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-dashboard-cross-feature-integration*
*Context gathered: 2026-02-23*
