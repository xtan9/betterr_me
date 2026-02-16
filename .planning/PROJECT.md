# BetterR.Me UI Style Redesign

## What This Is

A comprehensive UI style redesign of BetterR.Me, a habit tracking web app, to adopt a modern, spacious SaaS dashboard aesthetic inspired by Chameleon (app.chameleon.io). The redesign transforms the layout from a top-nav structure to a collapsible left sidebar, introduces a card-on-gray depth system, and applies restrained use of the emerald/teal brand color — across all pages and both light and dark themes.

## Core Value

The app must feel spacious, clean, and professional — like a premium SaaS product — while preserving all existing functionality and the emerald/teal brand identity.

## Requirements

### Validated

<!-- Existing capabilities that must be preserved through the redesign. -->

- ✓ Dashboard with daily greeting, stats, habit checklist, and tasks — existing
- ✓ Habits page with habit management (create, edit, delete, track) — existing
- ✓ Tasks page with task management (create, edit, delete, prioritize) — existing
- ✓ Three-locale i18n support (en, zh, zh-TW) — existing
- ✓ Dark mode with class-based theming (next-themes) — existing
- ✓ Mobile-responsive layout with bottom nav — existing
- ✓ Authentication flow (login, signup, password reset) — existing
- ✓ Profile management — existing

### Active

<!-- UI redesign scope — what we're building. -->

- [ ] Collapsible left sidebar navigation (pin/unpin, icon-only collapsed mode)
- [ ] Card-on-gray layout system (light gray page background, white floating cards)
- [ ] Spacious design with generous padding, whitespace, and breathing room
- [ ] Clean typography hierarchy (bold section titles, minimal clutter)
- [ ] Restrained emerald/teal accent color usage (accent only, not dominant)
- [ ] Redesigned dark mode that matches the new aesthetic
- [ ] Mobile sidebar as drawer/overlay (replaces current bottom nav on mobile or complements it)
- [ ] All pages updated: dashboard, habits, tasks, profile, auth pages
- [ ] Sidebar with navigation items: Dashboard, Habits, Tasks (matching current nav structure)
- [ ] User profile section at bottom of sidebar (like Chameleon)

### Out of Scope

- New features or functionality — this is purely visual/layout
- Chart or data visualization components — none exist currently
- Changes to API routes, database layer, or business logic
- Changes to shadcn/ui primitives in `components/ui/` (managed by shadcn)
- New pages or routes

## Context

**Current state:** BetterR.Me uses a top navigation bar (sticky header with horizontal nav links on desktop, fixed bottom tab bar on mobile). The layout has a white background with white cards — flat appearance with minimal depth. Components use shadcn/ui with emerald/teal brand colors applied somewhat broadly.

**Design reference:** Chameleon (app.chameleon.io) — a product adoption platform with a clean SaaS dashboard aesthetic. Key patterns observed:
- Left sidebar: ~160px wide, white background, icon + label nav items, active state with soft green highlight, user profile at bottom, collapsible with pin/unpin
- Page background: Light gray (#f5f7fa-ish), content is white cards floating on top
- Cards: White background, subtle border, rounded corners (~8-12px), generous internal padding
- Typography: Clean sans-serif, bold section headings, muted subtitles, strong hierarchy
- Color: Mostly neutral (white, gray, dark text) with green/teal only as accent on buttons, active states, and links
- Stat cards: Side-by-side metric cards with label + bold value
- Tables: Clean rows, subtle hover states, status badges with colored pills
- Tab/pill filters inside cards

**Existing tech:** shadcn/ui + Radix UI + Tailwind CSS 3, next-themes for dark mode, CSS custom properties (HSL) for theming. The sidebar CSS tokens already exist in globals.css but are unused.

## Constraints

- **UI primitives**: Do not edit `components/ui/` directly — they are shadcn/ui managed
- **Functionality**: All existing features must work identically after redesign
- **i18n**: All three locales must continue working; any new UI strings need translations
- **Accessibility**: Maintain current accessibility standards (vitest-axe tests must pass)
- **Testing**: Existing Vitest and Playwright tests must continue passing
- **Mobile**: Must remain fully responsive; mobile UX should improve, not regress

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Left sidebar instead of top nav | Chameleon-inspired, provides more content area, feels more like a professional SaaS app | — Pending |
| Collapsible sidebar (pin/unpin) | Chameleon uses this pattern; gives users control over screen real estate | — Pending |
| Card-on-gray depth system | Creates visual hierarchy and depth; Chameleon's signature look | — Pending |
| Keep emerald/teal brand color | Already matches Chameleon's green accent; just use more sparingly | — Pending |
| Redesign both themes simultaneously | Ensures consistency; avoids dark mode becoming an afterthought | — Pending |
| All pages in scope | Global layout change (sidebar) affects every page; partial redesign would look inconsistent | — Pending |

---
*Last updated: 2026-02-15 after initialization*
