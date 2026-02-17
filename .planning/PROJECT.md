# BetterR.Me UI Style Redesign

## What This Is

A comprehensive UI style redesign of BetterR.Me, a habit tracking web app, now featuring a modern SaaS dashboard aesthetic inspired by Chameleon (app.chameleon.io). The app uses a collapsible left sidebar for navigation, a card-on-gray depth system for visual hierarchy, and restrained emerald/teal accent usage — across all pages and both light and dark themes.

## Core Value

The app must feel spacious, clean, and professional — like a premium SaaS product — while preserving all existing functionality and the emerald/teal brand identity.

## Requirements

### Validated

- ✓ Dashboard with daily greeting, stats, habit checklist, and tasks — existing
- ✓ Habits page with habit management (create, edit, delete, track) — existing
- ✓ Tasks page with task management (create, edit, delete, prioritize) — existing
- ✓ Three-locale i18n support (en, zh, zh-TW) — existing
- ✓ Dark mode with class-based theming (next-themes) — existing
- ✓ Mobile-responsive layout with sidebar sheet — v1.0
- ✓ Authentication flow (login, signup, password reset) — existing
- ✓ Profile management — existing
- ✓ Collapsible left sidebar navigation (pin/unpin, icon-only collapsed mode) — v1.0
- ✓ Card-on-gray layout system (light gray page background, white floating cards) — v1.0
- ✓ Spacious design with generous padding, whitespace, and breathing room — v1.0
- ✓ Clean typography hierarchy (bold section titles, minimal clutter) — v1.0
- ✓ Restrained emerald/teal accent color usage (accent only, not dominant) — v1.0
- ✓ Redesigned dark mode with elevation-based surfaces and desaturated accents — v1.0
- ✓ Mobile sidebar as drawer/overlay (replaces bottom nav) — v1.0
- ✓ All pages updated: dashboard, habits, tasks, profile, auth pages — v1.0
- ✓ Sidebar with navigation items: Dashboard, Habits, Tasks, Settings — v1.0
- ✓ User profile section at bottom of sidebar with theme/language switchers — v1.0
- ✓ Breadcrumb navigation on detail/edit views — v1.0
- ✓ Notification badges on sidebar items (habits incomplete, tasks due) — v1.0
- ✓ Full test suite green: 961 unit, 92 E2E, 6 visual baselines, 3 locale verifications — v1.0

### Active

(No active requirements — milestone complete)

### Out of Scope

- New features or functionality — this was purely visual/layout
- Chart or data visualization components — none exist currently
- Changes to API routes, database layer, or business logic (except /api/sidebar/counts added for badges)
- Changes to shadcn/ui primitives in `components/ui/` (managed by shadcn)
- New pages or routes
- Keyboard shortcut for sidebar toggle (Cmd/Ctrl+B) — dropped from v1.0 scope per user decision
- Command palette (Cmd+K) — deferred to v2
- Page transition animations — deferred to v2
- Keyboard shortcut hints on sidebar items — deferred to v2

## Context

**Current state:** BetterR.Me v1.0 redesign complete. The app uses a collapsible left sidebar (200px expanded, 48px icon rail collapsed) with pin/unpin, hover-overlay, and cookie persistence. All pages use card-on-gray layout with PageHeader components. Dark mode uses elevation-based surfaces with desaturated emerald accents. 197 files changed, +19,664/-5,674 lines across 9 phases.

**Tech stack:** Next.js 16 (App Router), Supabase SSR, shadcn/ui + Radix UI + Tailwind CSS 3, next-themes, next-intl, SWR, Vitest + Playwright.

**Design system:** 29 CSS custom properties defining colors, spacing, typography, and sidebar dimensions. Design tokens documented in `DESIGN-TOKENS.md`. Tailwind config extended with custom utilities (bg-page, text-page-title, max-w-content, etc.).

## Constraints

- **UI primitives**: Do not edit `components/ui/` directly — they are shadcn/ui managed
- **Functionality**: All existing features work identically after redesign (verified)
- **i18n**: All three locales continue working with sidebar layout
- **Accessibility**: vitest-axe tests pass for all components
- **Testing**: 961 unit tests + 92 E2E tests + 6 visual baselines all green
- **Mobile**: Fully responsive with sidebar sheet on mobile

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Left sidebar instead of top nav | Chameleon-inspired, provides more content area, feels more like a professional SaaS app | ✓ Good — sidebar provides better navigation UX |
| Collapsible sidebar (pin/unpin) | Chameleon uses this pattern; gives users control over screen real estate | ✓ Good — icon rail + hover overlay works well |
| Card-on-gray depth system | Creates visual hierarchy and depth; Chameleon's signature look | ✓ Good — clear visual separation between background and content |
| Keep emerald/teal brand color | Already matches Chameleon's green accent; just use more sparingly | ✓ Good — desaturated in dark mode for comfort |
| Redesign both themes simultaneously | Ensures consistency; avoids dark mode becoming an afterthought | ✓ Good — elevation-based dark mode feels natural |
| All pages in scope | Global layout change (sidebar) affects every page; partial redesign would look inconsistent | ✓ Good — 15+ pages all consistent |
| Icon rail instead of fully-hidden sidebar | User feedback during Phase 3 — icon rail provides always-visible navigation affordance | ✓ Good — better than invisible trigger zone |
| Drop keyboard shortcut (SIDE-12) | User decision — deemed unnecessary for v1.0 | ✓ Accepted — can revisit in v2 |
| Separate sidebar_pinned cookie from sidebar_state | Avoids cookie conflicts with shadcn sidebar internal state | ✓ Good — prevents flash-of-wrong-state |
| PageHeader uses props API (not children) | Enforces consistent header structure across all pages | ✓ Good — consistency maintained |
| Hover translateY instead of scale | Scale causes layout reflow, translateY is GPU-composited | ✓ Good — smoother 60fps animations |
| Semantic colors preserved (amber, blue, orange) | Warning/info/caution colors serve different purpose than brand accent | ✓ Good — clear semantic distinction |

---
*Last updated: 2026-02-17 after v1.0 milestone*
