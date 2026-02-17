# Phase 1: Design Token Extraction & CSS Foundation - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract Chameleon's (app.chameleon.io) CSS values and encode them as CSS custom properties in globals.css. This defines the visual foundation — colors, spacing, typography, radius, shadows — that every subsequent phase builds on. Also reformat existing sidebar CSS variables to use raw HSL values (strip hsl() wrappers). No layout changes, no new components, no page migrations — purely CSS token work.

</domain>

<decisions>
## Implementation Decisions

### Background & surface colors (light mode)
- Main content area background is white (or very near-white) — NOT gray
- Cards are white with subtle light gray borders for separation — depth comes from borders, not shadows
- Sidebar background is a distinct light gray — noticeably different from the white content area
- Extract Chameleon's exact measured values for all three surfaces (content bg, card bg, sidebar bg)

### Card treatment
- Subtle light gray border, minimal or no visible box-shadow
- Rounded corners — match Chameleon's exact measured radius (~12px observed)
- Generous internal padding — match Chameleon's measured value (~24px observed)
- Active/highlighted rows (like leaderboard #1) use a light teal/green background tint

### Dark mode surfaces
- Softer dark base (~#1a1a2e range), NOT near-black — easier on eyes, like Linear's dark mode
- 3 elevation levels: page background (darkest), card surface (mid-tone), popover/modal (lightest)
- Sidebar is darker than the main content area in dark mode — sidebar recedes visually
- Reference: Linear's dark mode for overall feel, adapted with emerald/teal accent

### Accent color
- Chameleon uses green/teal (same family as BetterR.Me's current emerald) — NOT blue
- Extract Chameleon's exact accent shade to replace current primary (160 84% 39%)
- Accent used for: active sidebar states, CTA buttons, links, stat values, logo tinting

### Typography
- Extract Chameleon's exact type scale: heading sizes, body text sizes, font weights, line heights
- Chameleon uses Inter — clean sans-serif with clear weight hierarchy
- Page titles are large and bold, body text is well-spaced
- Pixel-perfect extraction of all typographic values

### Chameleon fidelity
- Pixel-perfect extraction of Chameleon's CSS values for light mode
- Extract ALL tokens: colors, border radius, spacing/padding, typography, border colors, shadows
- Only exception: dark mode is Linear-inspired (Chameleon dark mode not used as reference)

### Claude's Discretion
- Exact HSL reformatting approach for sidebar CSS variables
- How to organize/name the extracted design tokens in globals.css
- Dark mode elevation step values (exact lightness increments between 3 levels)
- Which Chameleon page(s) to measure from when values differ between pages

</decisions>

<specifics>
## Specific Ideas

- Chameleon reference screenshots available: `chameleon-home-full.png`, `chameleon-sidebar.png`, `chameleon-tours.png`
- Chameleon accessibility snapshot available: `chameleon-sidebar-snapshot.md`
- Sidebar in Chameleon: collapsible nav with icon+label items, active item gets subtle rounded highlight, user avatar/name/company in footer with settings gear
- Tours page shows the page header pattern: title with icon, subtitle, green CTA button top-right
- Stat cards on Tours page: 4-column row (Live, Started this week, Monthly active users, Lifetime Engagement Index)
- Leaderboard #1 entry highlighted with light green/teal background
- "Experiences" nav item has collapsible sub-menu with chevron

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-design-token-extraction-css-foundation*
*Context gathered: 2026-02-16*
