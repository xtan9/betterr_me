# Phase 19: Workout Logging Core Loop - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can log a complete workout session end-to-end — start a workout, add exercises from the library, log sets (weight+reps, reps-only, or duration), use a rest timer between sets, and finish — with session state surviving browser refresh. Routines/templates (Phase 20) and history/PRs (Phase 21) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Active workout screen layout
- Stacked cards — each exercise is a separate card with its set rows inside, scrollable vertically
- Sticky top bar — always visible, showing elapsed timer, workout title, and Finish button
- "Add Exercise" button at the bottom of the workout — opens a sheet/modal with exercise library search & filter
- Navigation behavior: Claude's discretion based on existing app patterns (full-screen takeover vs keeping nav)

### Set logging interaction
- Row per set structure: [Set#] [Previous] [Weight] [Reps] [checkmark]
- Previous workout values shown as a dedicated read-only inline reference column (e.g., "60kg x 10") — always visible next to input fields
- Set type labeling: short-press the set number to open a menu with options (warmup, normal, drop set, failure)
- "+ Add Set" button below the last row in each exercise card; swipe-left or trash icon to remove a set

### Rest timer behavior
- Always auto-starts when any set is marked complete — user can skip/dismiss
- Per-exercise default rest times (e.g., 3min for heavy compounds, 60s for accessories), configurable
- +15s/-15s adjustment buttons available during countdown
- Timer end: audio beep via Web Audio API + visual flash, then auto-dismisses after a few seconds
- Timer display placement: Claude's discretion
- Tab-switch accuracy: timer must show correct remaining time after switching tabs (use absolute timestamps)

### Session persistence & lifecycle
- Dual-write: server + localStorage for crash resilience
- Resume banner: top banner on workouts page — "You have an active workout" with Resume and Discard buttons (not a blocking modal)
- Finish flow: confirmation dialog showing workout summary (duration, exercises, total sets) — Confirm or Cancel
- Discard: soft delete — workout marked as discarded in DB but not permanently removed (confirmation dialog required)
- Multiple start entry points: workouts page, exercise detail, dashboard quick-action

### Claude's Discretion
- Navigation mode during active workout (full-screen takeover vs keeping sidebar/bottom nav)
- Rest timer display placement (overlay banner, inline, or in header)
- Exact card styling, spacing, and typography
- Error state handling and loading states
- Exercise reordering within the workout (if any)

</decisions>

<specifics>
## Specific Ideas

- Set row layout inspired by common gym apps: Set# | Previous | Weight | Reps | Complete checkbox — clean and scannable
- Short-press on set number for label menu (not long-press or cycling) — more discoverable than long-press, less error-prone than cycling
- Rest timer auto-dismisses after beep — don't make users tap to clear it every time
- Soft-delete discarded workouts — user data is valuable, never permanently destroy it in this phase

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-workout-logging-core-loop*
*Context gathered: 2026-02-23*
