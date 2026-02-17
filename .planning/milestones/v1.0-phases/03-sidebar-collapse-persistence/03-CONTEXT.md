# Phase 3: Sidebar Collapse & Persistence - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Add collapse/expand functionality to the existing sidebar from Phase 2. Users can pin/unpin the sidebar, collapse it to an icon-only rail, and have their preference persist across sessions via cookies. The sidebar shell and navigation items already exist — this phase adds the collapse behavior, auto-hide on hover, smooth animations, and cookie persistence.

Note: Keyboard shortcut (SIDE-12) has been dropped from scope per user decision.

</domain>

<decisions>
## Implementation Decisions

### Toggle button placement & design
- Pin/unpin toggle button at the **top of the sidebar** (above the nav list), matching Chameleon's placement
- Button shows tooltip "Unpin" when pinned, "Pin" when unpinned
- Toggle button has pressed/unpressed state for accessibility (aria-pressed)

### Collapsed (icon-only) mode
- Collapsed width: **~4rem** (standard icon rail, comfortable icon size with padding)
- Hovering nav icons shows **tooltip with the label** (nav item name)
- A **compact icon/logo** remains visible at the top in collapsed mode (not hidden)

### Auto-hide hover behavior
- When unpinned: sidebar is fully hidden (not showing icon rail)
- Hover trigger zone: **~20-24px wide strip** on the left edge of the viewport
- Reveal: **instant** (0ms delay) — no hover delay before sidebar appears
- Sidebar **overlays on top of content** (content stays put, no push/resize)
- Dismiss: **instant on mouse leave** — sidebar hides immediately when cursor exits

### Animation & transitions
- Easing: **smooth ease-in-out** for expand/collapse
- Duration: **fast (~150-200ms)** — snappy, not sluggish
- Pin state change persists to cookie and triggers the appropriate animation

### Cookie persistence
- Collapse/pin state stored in cookie (matching Phase 2's existing sidebar_state cookie pattern)
- No flash of wrong state on page load — server reads cookie to set initial state

### Claude's Discretion
- Label animation approach during collapse (fade-then-shrink vs clip overflow)
- Whether main content area resizes with animation or snaps to new width when pinned sidebar toggles
- Keyboard shortcut behavior details (dropped from scope)
- Exact CSS transition timing function values
- Input focus handling for any future keyboard shortcut

</decisions>

<specifics>
## Specific Ideas

- "Same as Chameleon" — the pin/unpin button placement and overall collapse pattern should follow Chameleon's sidebar behavior
- Chameleon's sidebar has: "Unpin sidebar navigation. Currently pinned." as the button label with tooltip, positioned at the top of the sidebar above the nav list

</specifics>

<deferred>
## Deferred Ideas

- SIDE-12 (Cmd/Ctrl+B keyboard shortcut) — **dropped entirely** per user decision, not deferred to another phase

</deferred>

---

*Phase: 03-sidebar-collapse-persistence*
*Context gathered: 2026-02-16*
