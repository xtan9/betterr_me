# Project Research Summary

**Project:** BetterR.Me UI Style Redesign
**Domain:** SaaS dashboard layout redesign (sidebar + card-on-gray visual system)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

This research covers a comprehensive UI redesign of BetterR.Me's dashboard layout from the current top-nav + mobile bottom-nav pattern to a modern sidebar-based layout with card-on-gray depth system inspired by Linear, Vercel, and Chameleon. The recommended approach is to leverage the shadcn/ui Sidebar component (which the project already has CSS variables for) combined with Tailwind CSS 3 design token modifications. No new dependencies are required beyond running `pnpm dlx shadcn@latest add sidebar`.

The single most important finding: **use the shadcn/ui Sidebar, do not build custom.** It's the most complex component in the shadcn ecosystem, purpose-built for collapsible sidebar navigation with mobile Sheet fallback, cookie persistence, keyboard shortcuts, and dark mode support. All prerequisites (Radix UI, tailwindcss-animate, next-themes) are already installed. The card-on-gray visual system is achieved purely through CSS variable changes to `--background` and `--card` tokens in `globals.css` — no plugins or new components needed.

The critical risks are threefold: (1) visual regression baselines become worthless immediately, requiring explicit baseline management strategy; (2) E2E navigation selectors break across the board when nav moves from top-nav to sidebar, requiring simultaneous E2E updates; (3) background token split between page and card surfaces reveals every place `bg-background` and `bg-card` were used interchangeably. All three are preventable with upfront planning and addressed in Phase 1.

## Key Findings

### Recommended Stack

The project already has everything needed. The shadcn/ui Sidebar component is the single piece to add via CLI. It brings collapsible modes (icon-only, offcanvas), mobile responsiveness via Radix Sheet, cookie-based state persistence, keyboard shortcut (Cmd/Ctrl+B), and full dark mode support. The card-on-gray pattern is pure CSS — modify `--background` to gray and keep `--card` white/elevated. Dark mode uses lighter surfaces for higher elevation (Material Design pattern). No animation library needed beyond the already-installed `tailwindcss-animate`.

**Core technologies:**
- **shadcn/ui Sidebar** (via CLI): Collapsible left sidebar with icon mode, Sheet mobile fallback, and cookie persistence — all solved problems
- **Tailwind CSS 3** (^3.4.1, installed): Card-on-gray via `--background` / `--card` token split; existing utilities propagate automatically
- **Radix UI** (^1.4.3, installed): Sidebar uses Sheet, Collapsible, Tooltip — unified package already present
- **next-themes** (^0.4.6, installed): Class-based dark mode via `.dark` selector; no changes to ThemeProvider needed
- **tailwindcss-animate** (^1.0.7, installed): Sidebar slide/fade animations via `animate-in/out` — no Framer Motion needed

**Critical version note:** Sidebar CSS tokens in `globals.css` (lines 72-92) exist but use `hsl()` wrappers. Shadcn expects raw HSL values (e.g., `--sidebar: 0 0% 98%` not `hsl(0 0% 98%)`). Requires reformatting to match the pattern used by other tokens.

### Expected Features

**Must have (table stakes):**
- **Persistent left sidebar** — The entire point of the redesign; replaces top-nav `AppLayout` with `SidebarLayout`
- **Collapsible sidebar (icon mode)** — Standard in Linear, Vercel, Notion; users expect to reclaim screen space
- **Active state indicators** — Users need to know where they are; every competitor highlights current page
- **Mobile sidebar as Sheet** — shadcn/ui handles automatically; replaces `MobileBottomNav`
- **User avatar + account menu in sidebar footer** — Move from top-right to sidebar footer (Linear/Notion pattern)
- **Card-on-gray background depth** — Second pillar of redesign; creates visual hierarchy
- **Dark mode elevation system** — Lighter surfaces = higher elevation in dark mode (Material pattern)
- **Consistent page header pattern** — Standardize all page headers across Dashboard, Habits, Tasks, Settings
- **Spacious typography and whitespace** — Generous padding (24-32px), display font for headings, reduce borders

**Should have (competitive):**
- **Breadcrumb navigation** — Shows location in nested views (Habits > Edit "Running"); add after page header established
- **Sidebar section groups** — Group "Main" (dashboard, habits, tasks) and "Account" (settings) with collapsible headers
- **Pin/unpin with hover reveal** — Notion pattern; sidebar auto-hides when unpinned, reveals on hover
- **Theme-aware accent desaturation** — Emerald/teal auto-desaturates in dark mode for comfort
- **Notification badges** — Small dot/count on sidebar items (e.g., "3 tasks due" on Tasks)

**Defer (v2+):**
- **Command palette (Cmd+K)** — High value but HIGH complexity; needs search indexing, action registry
- **Page transition animations** — Risk of conflicts with React Suspense; defer until App Router patterns mature
- **Keyboard shortcut hints** — Low priority polish; add when command palette is built

### Architecture Approach

The standard Next.js App Router pattern for authenticated SaaS dashboards: `SidebarProvider` wraps the authenticated layout, containing `AppSidebar` (navigation) and `SidebarInset` (main content). Cookie persistence pattern: server layout reads `await cookies()`, passes `defaultOpen` to `SidebarProvider`, provider writes cookie on state change. No flash of wrong state. The sidebar handles mobile via `isMobile` detection, automatically rendering in a Sheet drawer below `md` breakpoint.

**Major components:**
1. **SidebarProvider** (client) — Manages collapse/expand state, cookie persistence, mobile detection; wraps entire authenticated shell
2. **AppSidebar** (client) — Navigation links, branding, user menu, theme/language controls; replaces current `MainNav` + `MobileBottomNav`
3. **SidebarInset** — Main content container; creates card-on-gray visual effect via `variant="inset"` styling
4. **PageHeader** — Per-page header strip with `SidebarTrigger`, breadcrumbs, page actions; replaces current sticky header bar
5. **AppLayout (retired)** — Currently holds top-nav + mobile bottom nav; DELETED and replaced by sidebar layout pattern

**Critical architecture decision:** Keep authenticated layout as a SERVER component. Do NOT add `"use client"` to `app/dashboard/layout.tsx` or any route layouts. The `SidebarProvider` is client-only, but it should be imported and composed in the server layout. Follow existing pattern: `ProfileAvatar` (server) vs `ProfileAvatarClient` (client). Apply same split to sidebar components.

### Critical Pitfalls

1. **Visual regression baselines become worthless on first change** — 18 existing baselines fail immediately when sidebar is added. DELETE all baselines at START of migration before any code changes. Generate fresh baselines for new layout in Phase 1, then use component-scoped screenshot tests during migration. Regenerate full-page baselines only at END.

2. **E2E navigation selectors break across the board** — Current E2E tests use `page.getByRole('navigation', { name: 'Main navigation' })`, `navLinks.count()`, and `aria-current="page"` checks based on top-nav structure. When nav moves to sidebar with `SidebarMenu`, `SidebarMenuButton`, and mobile Sheet, all selectors fail. Add stable `data-testid` attributes to new sidebar nav. Update E2E page objects (`dashboard.page.ts`, etc.) in SAME commit as layout change. `MobileBottomNav` test file gets DELETED entirely.

3. **Background token mismatch in dark mode** — Currently `--background` and `--card` are IDENTICAL in both modes (white in light, near-black in dark). Card-on-gray requires splitting them. This reveals every component using `bg-background` for elevated surfaces (forms, modals) instead of `bg-card`. Audit EVERY `bg-background` usage, classify as "page-level" or "elevated surface," update accordingly. Watch `StatCard` component which hardcodes `bg-white dark:bg-slate-900` instead of semantic tokens.

4. **Sidebar causes content width regression** — Current layout assumes full viewport width for breakpoints. Adding 256px sidebar means `md:` breakpoint (768px) only gives 512px content width. Dashboard stat cards grid `md:grid-cols-3` needs to shift to `lg:grid-cols-3`. Test EVERY page at 768px, 1024px, 1280px with sidebar expanded AND collapsed.

5. **Converting layout to client component kills server rendering** — Developers add `"use client"` to layout to make `SidebarProvider` work, forcing all children client-side. Keep layout as server component. Create separate client wrapper `sidebar-provider-wrapper.tsx` containing only `SidebarProvider`. Import wrapper in server layout.

6. **Sidebar mobile Sheet conflicts with existing mobile bottom nav** — `MobileBottomNav` (fixed bottom bar) and sidebar Sheet (slide-out drawer) create two navigation mechanisms. `z-50` conflicts and UX confusion. REMOVE `MobileBottomNav` in same commit that sidebar Sheet becomes functional. Mobile uses sidebar's `collapsible="offcanvas"` mode (renders as Sheet via `isMobile`).

7. **Theme switcher hydration flash gets worse** — Sidebar's large surface area (16rem wide, full height) makes flash of wrong background extremely obvious. Use CSS variables for ALL sidebar colors (existing `--sidebar`, `--sidebar-foreground`). Remove debug `console.log` statements in `theme-switcher.tsx`. Never hardcode `bg-white dark:bg-slate-900`.

## Implications for Roadmap

Based on research, suggested 3-phase structure with strict dependency ordering:

### Phase 1: Layout Shell + Design Tokens
**Rationale:** Foundation phase. Everything depends on getting the layout shell and CSS variables correct from the start. Background token split affects every page, so it must happen before page migration. Sidebar CSS token cleanup is non-negotiable — the component won't render correctly with wrapped HSL values. E2E and visual regression baseline strategy must be set UPFRONT or regressions compound.

**Delivers:**
- shadcn/ui Sidebar component installed (`pnpm dlx shadcn@latest add sidebar`)
- CSS tokens updated: sidebar tokens reformatted (strip `hsl()` wrappers), `--background` split from `--card`
- Authenticated layout shell with `SidebarProvider` + cookie persistence (server reads cookie, passes `defaultOpen`)
- Basic `AppSidebar` component with navigation items (reuse existing nav config)
- `PageHeader` component (SidebarTrigger + breadcrumb slot)
- `MobileBottomNav` deleted
- E2E page objects updated with new sidebar selectors (`data-testid` attributes)
- Visual regression baselines DELETED (old ones worthless)

**Addresses:**
- **Table stakes:** Persistent left sidebar, collapsible icon mode, mobile Sheet, active state indicators
- **Architecture:** Server component layout with client provider wrapper (avoids Pitfall 5)
- **Pitfall 1:** Baseline deletion upfront
- **Pitfall 2:** E2E updates simultaneous with layout
- **Pitfall 3:** Background token audit complete before page migration
- **Pitfall 6:** Mobile bottom nav removed
- **Pitfall 7:** Theme flash prevention via CSS variables only

**Avoids:** Technical debt from hardcoded colors, client boundary creep, dual mobile nav, baseline chaos

### Phase 2: Page Migration + Responsive Validation
**Rationale:** With layout shell stable, migrate each page to use `PageHeader` + card-on-gray content wrapper. Test responsive behavior at each step since sidebar reduces content width. Breakpoints need adjustment (stat cards grid, habits/tasks grid). Order: Dashboard first (highest traffic, validates pattern), then Habits (complex sub-routes), Tasks, Settings.

**Delivers:**
- Dashboard page with `PageHeader`, content padding standardization
- Habits pages (list, detail, edit, new) with breadcrumbs
- Tasks pages (list, detail, edit, new) with breadcrumbs
- Settings page
- Responsive grid breakpoint adjustments (stat cards `lg:grid-cols-3`, habits/tasks grid tuning)
- `DashboardSkeleton` breakpoint updates for reduced content width
- All pages tested at 768px, 1024px, 1280px (expanded + collapsed sidebar)

**Uses:**
- `SidebarInset` as card wrapper (not additional Card component — avoids anti-pattern from Architecture research)
- `PageHeader` breadcrumbs for nested routes
- Tailwind breakpoint adjustments for sidebar-aware widths

**Implements:**
- Page content wrapper pattern from Architecture (PageHeader + content area with standard padding)
- Consistent spacing: 24-32px padding, display font for titles

**Addresses:**
- **Table stakes:** Consistent page header, spacious typography, breadcrumbs, responsive layout
- **Pitfall 4:** Content width regressions caught via per-page testing

**Avoids:** Breakpoint drift, double-card nesting, hardcoded widths

### Phase 3: Polish + Baseline Regeneration
**Rationale:** Core layout is stable. Add visual polish, move theme/language/profile controls to sidebar footer, finalize dark mode accent tweaks, add section groups. Only after ALL pages migrated can we regenerate visual regression baselines safely (they're meaningful again). E2E suite verification ensures no regressions before marking done.

**Delivers:**
- Theme/language switchers moved to `SidebarFooter`
- User profile/avatar moved to `SidebarFooter` with DropdownMenu (logout, settings)
- Sidebar section groups (Main: dashboard/habits/tasks, Account: settings)
- Dark mode accent desaturation (emerald adjustments for comfort)
- Notification badges wired to data (tasks due count, habits incomplete)
- Visual regression baselines REGENERATED for new layout
- Full E2E test pass (responsive, accessibility, visual regression, navigation)
- Keyboard shortcut verification (Cmd/Ctrl+B)
- Old components deleted (`app-layout.tsx`, `main-nav.tsx`, `mobile-bottom-nav.tsx`)

**Addresses:**
- **Should have:** Section groups, theme-aware accent, notification badges
- **Pitfall 1:** Fresh baselines ONLY after migration complete

**Avoids:** Premature baseline regeneration, component cleanup before migration done

### Phase Ordering Rationale

- **Phase 1 first:** Layout shell and design tokens are the foundation. Cannot migrate pages without stable shell. Background token split must happen before pages are touched or rework is 3-5x costlier. E2E and baseline strategy must be set upfront or regressions compound.

- **Phase 2 second:** Page migration depends on Phase 1 shell. Order within phase (Dashboard > Habits > Tasks > Settings) validates pattern early with highest-traffic page and handles complex sub-routes (habits/tasks detail/edit) before simpler pages.

- **Phase 3 last:** Polish features (footer controls, section groups, badges) are cosmetic and do not affect layout. Baseline regeneration MUST be last — generating them mid-migration creates noise and false positives.

**Dependency chain from Architecture research:**
```
Card-on-gray background (CSS variables)
    +---> Dark mode elevation (extends same CSS pattern)
    +---> Consistent page header (needs bg contrast)

Persistent left sidebar (SidebarLayout)
    +--requires--> Active state indicators
    +--requires--> Icons + text labels
    +--requires--> User avatar in footer
    +--requires--> Mobile sheet
    +--enhances--> Collapsible sidebar
                      +--enhances--> Pin/unpin hover reveal (v2)
    +--enhances--> Section groups (Phase 3)
    +--enhances--> Notification badges (Phase 3)

Breadcrumb navigation
    +--requires--> Consistent page header (breadcrumbs go inside header)
```

This maps cleanly to Phase 1 (foundation), Phase 2 (pages + breadcrumbs), Phase 3 (polish).

### Research Flags

**Phases needing deeper research during planning:**
- **None.** This is a UI layout migration, not feature development. All patterns are well-documented in shadcn/ui official docs (HIGH confidence). Architecture patterns verified against Vercel Admin Dashboard template and Linear/Notion references. No niche domains or sparse documentation.

**Phases with standard patterns (skip `/gsd:research-phase`):**
- **Phase 1:** Sidebar installation is CLI-driven (`shadcn add sidebar`). Cookie persistence pattern documented in shadcn v3 docs. CSS token updates are straightforward Tailwind theming (official docs).
- **Phase 2:** Page migration is repetitive — apply same `PageHeader` + content wrapper pattern to each route. Responsive testing is manual but not research-dependent.
- **Phase 3:** Moving components to sidebar footer is DOM restructuring. Section groups use shadcn `SidebarGroup` + `Collapsible` (documented). Baseline regeneration is Playwright workflow (known process).

**Recommendation:** No phase-level research needed. Research complete. Roadmapper can proceed directly to requirements definition.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via official shadcn/ui documentation, codebase inspection (`package.json`, `globals.css`, `components.json`). All dependencies confirmed installed. Sidebar CSS tokens exist but need reformatting (actionable). |
| Features | HIGH | Table stakes confirmed via NN/g eyetracking research, Linear/Vercel/Notion UI analysis, UX Planet sidebar best practices. Differentiators sourced from Command Palette UX patterns (Medium), dark mode guides (Toptal, Netguru). Anti-features validated against glassmorphism accessibility issues (WCAG), neumorphism trend data. |
| Architecture | HIGH | Official shadcn Sidebar docs, Vercel Admin Dashboard template (Next.js 16 reference), cookie persistence pattern from shadcn v3 docs. Server/client boundary pattern confirmed via Next.js App Router docs. Anti-patterns verified against known Next.js 16 Cache Components issue (#9189, not applicable here). |
| Pitfalls | HIGH | Visual regression baseline issue confirmed via LedgerHQ nav migration PR (#14343, real-world case). E2E selector breakage pattern from WordPress Gutenberg nav PR (#25918). Background token mismatch via codebase inspection (`globals.css` lines 14-24). Theme flash via `theme-switcher.tsx` lines 26-42 analysis. |

**Overall confidence:** HIGH

Research is comprehensive, multi-sourced, and verified against the actual codebase. All stack decisions confirmed installable. All architectural patterns documented with official sources. Pitfalls grounded in real-world migrations and codebase-specific inspection.

### Gaps to Address

**Minor gap:** Sidebar CSS token values for emerald brand alignment. Research identifies the issue (HSL wrapper format) and provides correct pattern, but exact HSL values for emerald accent need fine-tuning during implementation. Current `--primary: 160 84% 39%` should map to `--sidebar-primary`, but dark mode desaturation value needs visual validation.

**Handling:** Phase 1 includes CSS token update task. Use existing `--primary` value for light mode sidebar tokens. For dark mode, start with `142 71% 45%` (existing dark primary) and adjust based on visual inspection. Not research-blocking — this is design fine-tuning.

**Minor gap:** Content area max-width tightening. FEATURES.md suggests `max-w-screen-xl` instead of current `max-w-screen-2xl` for ultra-wide monitors, but ideal max-width depends on sidebar width + content density. Need to validate during Phase 2 page migration at 1920px+ viewports.

**Handling:** Phase 2 responsive validation includes ultra-wide testing. Start with `max-w-screen-xl` (1280px), adjust if content feels cramped or too loose. Not blocking.

**No blocking gaps.** Roadmap can proceed.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Sidebar Documentation](https://ui.shadcn.com/docs/components/radix/sidebar) — Component API, installation, props, CSS variables, mobile behavior
- [shadcn/ui Sidebar Blocks](https://ui.shadcn.com/blocks/sidebar) — Pre-built layout patterns, `variant="inset"` examples
- [shadcn/ui Theming Documentation](https://ui.shadcn.com/docs/theming) — CSS variable patterns, dark mode tokens
- [shadcn/ui Dark Mode Documentation](https://ui.shadcn.com/docs/dark-mode) — next-themes integration, class-based strategy
- [Tailwind CSS Dark Mode v3 Documentation](https://v3.tailwindcss.com/docs/dark-mode) — Class-based dark mode strategy
- [Linear UI Redesign (Part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) — Design philosophy, layout behaviors
- [NN/g Vertical Navigation Research](https://www.nngroup.com/articles/vertical-nav/) — Left-side scanning, scalability advantages
- Codebase direct inspection (HIGH confidence): `app-layout.tsx`, `main-nav.tsx`, `mobile-bottom-nav.tsx`, `theme-switcher.tsx`, `globals.css`, `tailwind.config.ts`, `package.json`, `components.json`, E2E specs (`responsive.spec.ts`, `visual-regression.spec.ts`, `dashboard.spec.ts`)

### Secondary (MEDIUM confidence)
- [Vercel New Dashboard Sidebar](https://vercel.com/try/new-dashboard) — Sidebar patterns (collapse, tabs)
- [Vercel Admin Dashboard Template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) — Reference implementation, Next.js 16 + sidebar + card-on-gray
- [UX Planet Sidebar Best Practices](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2) — Width guidelines (240-300px expanded, 48-64px collapsed)
- [Notion Sidebar UX Breakdown (Medium)](https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d) — Accordion sections, progressive disclosure
- [shadcn Sidebar Cookie Persistence](https://www.achromatic.dev/blog/shadcn-sidebar) — Cookie-based state persistence pattern
- [Toptal: Dark UI Design Principles](https://www.toptal.com/designers/ui/dark-ui-design) — Elevation with light, desaturation
- [Netguru: Dark Mode UI Tips](https://www.netguru.com/blog/tips-dark-mode-ui) — Avoid pure black, 3-4 elevation levels
- [LedgerHQ navigation E2E migration PR #14343](https://github.com/LedgerHQ/ledger-live/pull/14343) — Real-world E2E selector migration case study
- [WordPress Gutenberg nav sidebar PR #25918](https://github.com/WordPress/gutenberg/pull/25918) — E2E pattern confirmation

### Tertiary (LOW confidence — informational only, not actionable)
- [SaaSFrame: Dashboard UI Examples](https://www.saasframe.io/categories/dashboard) — Visual inspiration gallery
- [Command Palette UX Patterns (Medium)](https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1) — Cmd+K patterns (deferred to v2)

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
