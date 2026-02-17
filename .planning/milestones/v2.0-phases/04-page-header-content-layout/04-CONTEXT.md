# Phase 4: Page Header & Content Layout - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable PageHeader component and establish the content layout system (spacing, typography, max-width centering) that all subsequent page migrations will use. This phase creates the layout primitives — actual page-by-page migration happens in Phases 5 and 6.

</domain>

<decisions>
## Implementation Decisions

### Header anatomy
- Match Chameleon's page header pattern exactly: title region on the left, action area on the right
- Chameleon reference shows: greeting/title + subtitle on the left, optional actions (search, CTA buttons) on the right
- PageHeader component must be flexible: accept title (required), subtitle (optional), and action slot (optional ReactNode)
- Title uses the largest content font size from Chameleon's typography scale
- Subtitle uses muted/secondary text color, smaller size

### Content density & spacing
- Match Chameleon's generous, airy spacing pixel-for-pixel
- Extract exact padding, margin, and gap values from Chameleon's live dashboard
- Apply consistent vertical rhythm: header-to-content gap, card-to-card gaps, section spacing
- The app should feel like a premium SaaS dashboard, not a compact personal tool

### Content width behavior
- Extract Chameleon's max-width value for the content area
- Content should center horizontally within the available space on ultra-wide screens (1920px+)
- When sidebar collapses/expands, content area should respond fluidly (not jump)
- Side gutters match Chameleon's padding values

### Mobile adaptation
- Make mobile experience as good as possible
- Header should stack gracefully: title/subtitle on top, actions below on narrow screens
- Reduce spacing proportionally on mobile (not just raw desktop values)
- Ensure touch-friendly action button sizes

### Typography scale
- Extract Chameleon's exact font sizes, weights, and line heights
- Establish hierarchy: page title > section header > card title > body text
- Use the design tokens already established in Phase 1

### Claude's Discretion
- All specific pixel values (researcher will extract from Chameleon)
- Exact breakpoint thresholds for responsive behavior
- Component API design (props, slots, composition pattern)
- Whether to use CSS Grid vs Flexbox for the content layout
- Loading/skeleton states for the PageHeader
- Mobile spacing ratios

</decisions>

<specifics>
## Specific Ideas

- "Make it pixel level same as Chameleon" — the Chameleon dashboard at app.chameleon.io is the single source of truth for all visual decisions
- Use Playwright to verify changes work in the QA process
- Use the frontend-design skill when implementing
- Reference screenshot available at `chameleon-home-full.png` in project root
- Chameleon accessibility snapshot available at `chameleon-sidebar-snapshot.md`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-page-header-content-layout*
*Context gathered: 2026-02-16*
