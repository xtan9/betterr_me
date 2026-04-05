# Phase 32: Calendar UI — Week & Day Views - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 32-calendar-ui-week-day-views
**Areas discussed:** Time Grid Layout, Quick-Create Interaction, All-Day Row, Keyboard Shortcuts
**Mode:** --auto (all defaults auto-selected)

---

## Time Grid Layout

| Option | Description | Selected |
|--------|-------------|----------|
| 48px/hour, 24h grid, scroll to 8AM | Standard height with full day visible, auto-scroll to working hours | ✓ |
| 60px/hour, working hours only (8-20) | Larger slots, hide off-hours | |
| Variable height, compact mode | Smaller slots with zoom capability | |

**User's choice:** [auto] 48px/hour, 24h grid, scroll to 8AM (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Side-by-side columns (Google Calendar) | Overlapping events get equal-width columns | ✓ |
| Stacked with offset | Events stack with slight indent | |
| Single column with expansion | Show one, click to see overlaps | |

**User's choice:** [auto] Side-by-side columns (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Half-hour dashed lines | Light dashed lines at 30-min marks | ✓ |
| Full-hour lines only | Simpler grid, less visual noise | |
| 15-minute sub-grid | More precise time reference | |

**User's choice:** [auto] Half-hour dashed lines (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Scrollable with sticky headers | Day headers and all-day row stay visible | ✓ |
| Fixed height, all hours visible | Compress to fit viewport | |

**User's choice:** [auto] Scrollable with sticky headers (recommended default)

---

## Quick-Create Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Click → popover with title + time pre-filled | Minimal popover, Enter to save | ✓ |
| Click → inline input in time slot | Type directly in the slot | |
| Click → modal dialog | Full form opens immediately | |

**User's choice:** [auto] Click → popover (recommended default, matches design spec)

| Option | Description | Selected |
|--------|-------------|----------|
| Click-and-drag supported | Drag across time slots to set duration | ✓ |
| Click-only, set duration in popover | Simpler interaction, fewer edge cases | |

**User's choice:** [auto] Click-and-drag supported (recommended default, matches EVNT-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Adjacent to clicked slot, viewport-aware | Shifts position to stay visible | ✓ |
| Always below the slot | Fixed positioning | |
| Centered in viewport | Modal-like popover | |

**User's choice:** [auto] Adjacent + viewport-aware (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| "More options" expands to full dialog | Pre-fills dialog from popover context | ✓ |
| No expansion, save-only popover | Quick create only, edit after | |

**User's choice:** [auto] "More options" expansion (recommended default, matches design spec EVNT-10)

---

## All-Day Row

| Option | Description | Selected |
|--------|-------------|----------|
| 3 items visible, "+N more" expandable | Consistent with month view overflow (D-05) | ✓ |
| 2 items visible | More compact | |
| Unlimited, auto-expand | Always show all items | |

**User's choice:** [auto] 3 items with expandable overflow (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable with collapse button | Click "+N more" to see all, click to collapse | ✓ |
| Fixed height with scroll | Scroll within fixed all-day row | |

**User's choice:** [auto] Expandable with collapse (recommended default)

---

## Keyboard Shortcuts

| Option | Description | Selected |
|--------|-------------|----------|
| Global keydown, disabled in inputs | Single-key shortcuts suppressed in text fields | ✓ |
| Modifier-based (Ctrl+D, Ctrl+W) | No conflict with typing but harder to discover | |
| Command palette only (/) | All actions through search/command interface | |

**User's choice:** [auto] Global keydown, disabled in inputs (recommended default, matches design spec)

| Option | Description | Selected |
|--------|-------------|----------|
| Only Esc in popovers/dialogs | All shortcuts suppressed except Esc when overlay open | ✓ |
| All shortcuts work always | Risk of conflicts with typing | |
| No shortcuts in overlays | Even Esc doesn't work | |

**User's choice:** [auto] Only Esc in overlays (recommended default)

---

## Claude's Discretion

- Shared TimeGrid component architecture (reused by week and day views)
- Event block sizing and overlap detection algorithm
- Drag selection visual feedback styling
- Popover positioning approach
- Auto-scroll to current time behavior

## Deferred Ideas

None — all discussion stayed within phase scope.
