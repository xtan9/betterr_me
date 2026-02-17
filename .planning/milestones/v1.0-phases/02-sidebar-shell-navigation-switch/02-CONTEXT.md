# Phase 2: Sidebar Shell & Navigation Switch - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing top navigation bar and mobile bottom navigation with a persistent left sidebar on desktop and a sheet/drawer on mobile. All existing navigation destinations (Dashboard, Habits, Tasks) remain accessible. No new pages or routes are added. Collapse/persistence behavior belongs in Phase 3; enrichment (user profile, badges, theme switcher) belongs in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Sidebar visual design
- Claude's Discretion: Width, background color, border/shadow treatment, logo/branding placement
- Reference: Chameleon (app.chameleon.io) sidebar style — the project's overall design inspiration
- Must use design tokens from Phase 1 (sidebar-background, sidebar-foreground, etc.)

### Navigation items & active state
- Claude's Discretion: Icon choices, active state indicator style, hover/focus states, item spacing/density
- Items: Dashboard, Habits, Tasks (matching current nav destinations)
- Active state must be visually clear (SIDE-03 requirement)

### Mobile sheet behavior
- Claude's Discretion: Hamburger button placement, overlay style, sheet width, transition animation
- Must appear as sheet/drawer from left edge on <768px (SIDE-04, SIDE-07 requirements)
- Must fully replace bottom tab bar — no dual-nav state

### Top bar replacement
- Claude's Discretion: Whether any top bar remains, page title placement, mobile header treatment
- Old top nav and mobile bottom nav must be fully removed (success criteria #4)

### Claude's Discretion
All four areas above are at Claude's discretion. The user trusts the builder to make design choices that align with the Chameleon-inspired direction and the design tokens established in Phase 1. Key constraints:
- Use shadcn/ui Sidebar component as the foundation
- Follow Chameleon's visual style as the reference
- Leverage Phase 1 design tokens for all color/spacing values
- Ensure i18n compatibility (all three locales)
- Maintain dark mode support using the established token system

</decisions>

<specifics>
## Specific Ideas

- Overall design direction is Chameleon (app.chameleon.io) — clean, spacious, professional SaaS dashboard
- Project core value: "feel spacious, clean, and professional — like a premium SaaS product"
- Emerald/teal brand identity must be preserved in accent usage

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-sidebar-shell-navigation-switch*
*Context gathered: 2026-02-16*
