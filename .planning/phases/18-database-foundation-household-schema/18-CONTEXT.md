# Phase 18: Database Foundation & Household Schema - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

All money-related infrastructure: Supabase migrations for money tables with household-scoped RLS, money arithmetic library (integer cents), sidebar navigation with "Money" item, Calm Finance design tokens, i18n money namespace, lazy household auto-creation, and `/money` page shell. No feature logic — just the foundation for Phases 19-25.

</domain>

<decisions>
## Implementation Decisions

### Calm Finance visual identity
- Primary palette: soft sage/seafoam — very desaturated, almost grey-green. Calming, minimal, spa-like feel
- Negative amounts (expenses, losses): muted amber/warm tone. Amber for expenses, teal/sage for income. Gentle contrast, no red/green
- No aggressive colors anywhere in money views

### Claude's Discretion: Visual zone & dark mode
- Whether money pages feel like a tinted same-system or a subtle visual zone — pick what integrates most naturally with existing design
- Dark mode palette handling — adjust teal/amber hues for dark backgrounds as needed

### Sidebar & money navigation
- Position: after Projects (Dashboard > Habits > Projects > Money)
- Icon: Claude's discretion — pick a Lucide icon that fits the calm aesthetic
- Sub-navigation: single "Money" link to `/money` for Phase 18. Sub-items added as feature phases ship
- Visibility: visible to all users immediately, no feature flag. Household auto-creates on first visit

### Money page shell
- Empty state: welcome message with connect-bank prompt. Calm, friendly tone (e.g., "Your calm financial picture starts here")
- Interim state (Phase 18, before Plaid ships in Phase 19): CTA says "Bank connection coming soon" — honest about current state
- Page header: branded header text, not just "Money". Claude's discretion on exact wording — something warm, reassuring, non-anxiety-inducing

### Amount display formatting
- Always full precision: $1,234.56, $0.07, $10.00 — always two decimal places
- Always USD ($) — no locale-based currency symbol changes
- Negative format: minus prefix (-$1,234.56), not accounting parentheses
- Thousand separators: standard comma grouping

### Claude's Discretion
- Exact sage/seafoam and amber shade selection (CSS custom properties)
- Dark mode palette adjustments
- Visual zone treatment (tinted vs subtle separation)
- Sidebar icon choice (Lucide)
- Branded header text for /money page
- Loading skeleton design
- Error state handling

</decisions>

<specifics>
## Specific Ideas

- Money pages should feel like a meditation app meets finance — spa-like calm, not Wall Street
- The "coming soon" interim state should feel intentional, not broken — user knows features are on the way

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-database-foundation-household-schema*
*Context gathered: 2026-02-21*
