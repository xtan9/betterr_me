# Roadmap: BetterR.Me UI Style Redesign

## Overview

Transform BetterR.Me from a top-nav layout with flat white-on-white styling into a modern SaaS dashboard with collapsible left sidebar, card-on-gray depth system, and restrained emerald/teal accent -- inspired by Chameleon (app.chameleon.io). The redesign follows a strict dependency chain: extract design tokens from Chameleon, establish CSS foundation, build sidebar shell, migrate pages one-by-one, add enrichment and polish, then stabilize all tests with fresh baselines. Every existing feature continues working identically; this is a purely visual/layout transformation across all pages and both themes.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Design Token Extraction & CSS Foundation** - Extract Chameleon's CSS values, split background/card tokens, reformat sidebar CSS variables
- [ ] **Phase 2: Sidebar Shell & Navigation Switch** - Install shadcn/ui Sidebar, build AppSidebar, replace top-nav and bottom-nav with sidebar + mobile sheet
- [ ] **Phase 3: Sidebar Collapse & Persistence** - Pin/unpin toggle, icon-only collapsed mode, smooth animations, cookie persistence, keyboard shortcut
- [ ] **Phase 4: Page Header & Content Layout** - Build PageHeader component, apply pixel-perfect spacing/typography, add max-width centering
- [ ] **Phase 5: Dashboard Page Migration** - Migrate dashboard to card-on-gray layout with new PageHeader, stat cards, and responsive grid adjustments
- [ ] **Phase 6: Habits, Tasks & Remaining Pages Migration** - Migrate habits, tasks, profile, and auth pages; add breadcrumb navigation for nested views
- [ ] **Phase 7: Sidebar Enrichment** - User profile footer, collapsible section groups, notification badges, theme/language switchers in sidebar
- [ ] **Phase 8: Visual Polish** - Dark mode accent desaturation, hover/focus micro-interactions across cards and buttons
- [ ] **Phase 9: Test Stabilization & Baseline Regeneration** - All tests passing, visual regression baselines regenerated, locale and accessibility verification

## Phase Details

### Phase 1: Design Token Extraction & CSS Foundation
**Goal**: The visual language is defined -- every color, spacing value, radius, and font size is captured from Chameleon's live site and encoded as CSS custom properties, creating the foundation all subsequent phases build on
**Depends on**: Nothing (first phase)
**Requirements**: VISL-01, VISL-02, VISL-11
**Success Criteria** (what must be TRUE):
  1. CSS custom properties define distinct values for page background (gray) and card surfaces (white) in light mode
  2. Dark mode CSS custom properties use elevation-based surface colors (lighter surfaces for higher elements)
  3. Design tokens (background gray, card radius, sidebar width, font sizes, spacing scale) are documented with values extracted from Chameleon's live dashboard
  4. Sidebar CSS variables in globals.css use raw HSL values (no hsl() wrappers), matching the pattern used by other shadcn tokens
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Sidebar Shell & Navigation Switch
**Goal**: Users navigate the app via a persistent left sidebar instead of the top navigation bar, with mobile users getting a sheet/drawer from the left edge
**Depends on**: Phase 1
**Requirements**: SIDE-01, SIDE-03, SIDE-04, SIDE-07
**Success Criteria** (what must be TRUE):
  1. User sees a left sidebar with icon + label navigation items for Dashboard, Habits, and Tasks on desktop viewports
  2. Current page is visually highlighted with an active state indicator in the sidebar
  3. On mobile viewports (<768px), sidebar appears as a sheet/drawer from the left (no bottom tab bar exists)
  4. Old top navigation bar and mobile bottom navigation are fully removed (no dual-nav state)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Sidebar Collapse & Persistence
**Goal**: Users can control their screen real estate by collapsing the sidebar to icon-only mode, with their preference remembered across sessions
**Depends on**: Phase 2
**Requirements**: SIDE-02, SIDE-06, SIDE-09, SIDE-11, SIDE-12
**Success Criteria** (what must be TRUE):
  1. User can collapse sidebar to icon-only mode via a pin/unpin toggle button, and expand it back
  2. Sidebar expand/collapse animates smoothly with CSS transitions completing in under 300ms
  3. When sidebar is unpinned, it auto-hides and reveals on hover over the left edge
  4. Sidebar collapse state persists across page reloads (cookie-based, no flash of wrong state)
  5. User can toggle sidebar visibility with keyboard shortcut Cmd/Ctrl+B
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Page Header & Content Layout
**Goal**: Every page has a consistent, spacious layout structure with standardized header, generous whitespace, and pixel-perfect typography matching Chameleon's dashboard
**Depends on**: Phase 2
**Requirements**: VISL-03, VISL-04, VISL-05
**Success Criteria** (what must be TRUE):
  1. Every authenticated page displays a consistent page header with title, optional subtitle, and primary action button area
  2. Typography hierarchy (font sizes, weights), padding, margins, border radius, and spacing match Chameleon's dashboard CSS values
  3. Content area has a max-width with horizontal centering on ultra-wide screens (1920px+)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Dashboard Page Migration
**Goal**: The dashboard page fully embodies the new card-on-gray aesthetic with floating white cards on a gray background, spacious stat cards, and the habit checklist working within the new layout
**Depends on**: Phase 1, Phase 4
**Requirements**: (none exclusive -- contributes to VISL-10 which is assigned to Phase 6)
**Success Criteria** (what must be TRUE):
  1. Dashboard displays white cards floating on the gray page background with visible depth separation
  2. Stat cards, habit checklist, and task summary render correctly within the new content layout
  3. Dashboard responsive grid works at 768px, 1024px, and 1280px with sidebar both expanded and collapsed
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Habits, Tasks & Remaining Pages Migration
**Goal**: All pages in the app (habits, tasks, profile, auth) use the new card-on-gray layout with consistent page headers, and nested views show breadcrumb navigation
**Depends on**: Phase 4, Phase 5
**Requirements**: VISL-08, VISL-10
**Success Criteria** (what must be TRUE):
  1. Habits pages (list, detail, edit, create) display with card-on-gray layout and consistent page headers
  2. Tasks pages (list, detail, edit, create) display with card-on-gray layout and consistent page headers
  3. Profile and auth pages (login, signup, password reset) use the updated visual system
  4. Detail and edit views show breadcrumb navigation in the page header (e.g., Habits > Edit "Running")
  5. All pages render correctly at 768px, 1024px, and 1280px with sidebar expanded and collapsed
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Sidebar Enrichment
**Goal**: The sidebar becomes a complete navigation and account hub with user profile, organized sections, live notification badges, and relocated theme/language controls
**Depends on**: Phase 3, Phase 6
**Requirements**: SIDE-05, SIDE-08, SIDE-10, VISL-09
**Success Criteria** (what must be TRUE):
  1. User avatar, name, and account dropdown (with logout and settings links) appear in the sidebar footer
  2. Sidebar nav items are organized into collapsible section groups (Main: Dashboard/Habits/Tasks, Account: Settings)
  3. Sidebar items display notification badges showing live data (e.g., tasks due count, incomplete habits count)
  4. Theme switcher and language switcher are accessible from the sidebar (removed from any top header area)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Visual Polish
**Goal**: Both light and dark themes feel refined with comfortable accent colors in dark mode and subtle interactive feedback on all clickable elements
**Depends on**: Phase 6
**Requirements**: VISL-06, VISL-07
**Success Criteria** (what must be TRUE):
  1. Emerald/teal accent color is visibly desaturated in dark mode compared to light mode, providing eye comfort
  2. Cards and buttons display subtle hover and focus micro-interactions (e.g., shadow lift, opacity shift, border highlight)
  3. Micro-interactions feel consistent across all pages and both themes
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Test Stabilization & Baseline Regeneration
**Goal**: The entire test suite (unit, E2E, visual regression, accessibility) passes green with fresh baselines that reflect the new design, confirming zero functional regressions
**Depends on**: Phase 7, Phase 8
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. All existing Vitest unit tests pass without modification to business logic (only selector/layout updates)
  2. All Playwright E2E tests pass with updated selectors for sidebar navigation
  3. Visual regression baselines are regenerated and all visual regression tests pass against new baselines
  4. Accessibility tests (vitest-axe) pass for all components in the new layout
  5. All three locales (en, zh, zh-TW) render correctly with the sidebar layout in both light and dark mode
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

Note: Phase 4 depends on Phase 2 (not Phase 3). Phases 4 and 3 can execute in parallel after Phase 2 completes. Phase 5 depends on Phases 1 and 4. Phase 7 depends on Phases 3 and 6. Phase 9 depends on Phases 7 and 8.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Design Token Extraction & CSS Foundation | 0/2 | Not started | - |
| 2. Sidebar Shell & Navigation Switch | 0/2 | Not started | - |
| 3. Sidebar Collapse & Persistence | 0/1 | Not started | - |
| 4. Page Header & Content Layout | 0/1 | Not started | - |
| 5. Dashboard Page Migration | 0/1 | Not started | - |
| 6. Habits, Tasks & Remaining Pages Migration | 0/2 | Not started | - |
| 7. Sidebar Enrichment | 0/1 | Not started | - |
| 8. Visual Polish | 0/1 | Not started | - |
| 9. Test Stabilization & Baseline Regeneration | 0/2 | Not started | - |
