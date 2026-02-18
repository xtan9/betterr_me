# Phase 11: Sidebar Polish - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Refine the sidebar's spacing, transitions, and visual hierarchy to match the Chameleon (app.chameleon.io) design reference. The sidebar should feel intentional and polished — consistent spacing, smooth interactions, and clear visual hierarchy. All changes use design tokens. No new navigation capabilities.

</domain>

<decisions>
## Implementation Decisions

### Spacing & Density (Match Chameleon Exactly)
- Sidebar width: 224px (up from 200px) — Chameleon's current width
- Item height: 36px (up from 32px) — `h-9` instead of `h-8`
- Item padding: asymmetric `6px 12px 6px 6px` (Chameleon's exact padding)
- Item gap: 4px between items (already matches via `gap-1`)
- Font: 14px, font-weight 600 (semibold) for ALL nav items, not just active
- Border radius: 12px on nav items (pill-shaped) — add/update design token if needed

### Icon Treatment
- Wrap each icon in a 24×24px container box with 8px border-radius
- Icon container background: white (`rgb(255,255,255)`) in light mode
- Icons remain Lucide, rendered inside the container box
- 8px gap between icon container and label text (margin-right on icon)

### Hover State
- Background: teal/primary brand color tint (light teal background, like Chameleon uses light green)
- Text color: shifts to darker teal/primary shade
- Inset box-shadow ring: subtle 0.5px inset border in teal
- Transition: `0.2s cubic-bezier(0.4, 0, 0.2, 1)` — smooth, not abrupt

### Active State
- Background: light blue-gray (similar to `rgb(238, 241, 246)` / sidebar-accent token)
- Inset box-shadow ring: subtle 0.5px inset border (`rgb(203, 213, 225)` equivalent)
- Icon container: white background (distinct from inactive items)
- Font-weight: 600 (same as inactive — no weight change, distinguished by bg + ring)

### Navigation Structure
- Remove collapsible group headers ("Navigation" / "Management" labels and chevrons)
- Flat list of nav items: Dashboard, Habits, Tasks (no group separators)
- Remove Settings nav item from sidebar (already accessible via footer dropdown menu)

### User Footer
- Keep current dropdown menu (settings/theme/language/logout)
- Replace ChevronsUpDown icon with gear (Settings) icon
- Apply teal/primary hover treatment to footer button (same as nav items)

### Claude's Discretion
- Exact dark mode values for icon container bg, hover tint, active ring
- Whether to adjust `--sidebar-width-icon` (collapsed state) proportionally
- Exact Tailwind utility mapping for the asymmetric padding (custom class or inline style)
- How to handle the icon container in collapsed/icon-only mode

</decisions>

<specifics>
## Specific Ideas

- Match Chameleon (app.chameleon.io) sidebar exactly — this is the visual reference for the entire project
- Chameleon measurements extracted via Playwright: 224px wide sidebar, 36px item height, `6px 12px 6px 6px` padding, 12px border-radius, 24×24 icon boxes, 0.2s cubic-bezier transitions
- Active state uses `rgb(238, 241, 246)` bg with `rgb(203, 213, 225)` 0.5px inset ring
- Hover state uses `rgb(233, 249, 239)` bg (green tint) with `rgb(167, 232, 191)` 0.5px inset ring — adapt to our teal brand color
- Chameleon uses Satoshi font — we keep our existing font-display/system font stack
- Chameleon has no group headers — flat list with consistent spacing between all items

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-sidebar-polish*
*Context gathered: 2026-02-17*
