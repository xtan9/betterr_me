# Pitfalls Research

**Domain:** SaaS dashboard UI redesign (top-nav to sidebar, card-on-gray design system)
**Researched:** 2026-02-15
**Confidence:** HIGH (verified against codebase, official docs, and multiple community sources)

## Critical Pitfalls

### Pitfall 1: Visual Regression Baselines Become Worthless on First Change

**What goes wrong:**
The project has 18 visual regression baseline screenshots covering dashboard (light/dark), habits list, create habit form, settings page, and login -- across chromium, mobile-chrome, and mobile-small viewports. A sidebar layout migration changes every single page's layout structure, making ALL baselines fail immediately. Teams either waste hours debugging false positives or, worse, blindly `--update-snapshots` everything, losing the safety net that catches real regressions during the migration itself.

**Why it happens:**
Visual regression tests compare pixel-for-pixel against stored baselines. A layout-level change (adding a sidebar, changing background color, removing top-nav) touches every page. The tests cannot distinguish "intentional redesign" from "accidentally broke spacing."

**How to avoid:**
1. Delete all existing baselines at the START of the migration, before any code changes. This is intentional -- they are worthless for the new layout.
2. Build the new layout shell first (Phase 1) and generate fresh baselines for the new layout before making page-level changes.
3. During the migration, use component-level screenshot tests (scoped to specific elements like `page.locator('[data-testid="stat-card"]')`) to catch regressions in content areas while the surrounding layout is still in flux.
4. Regenerate full-page baselines only at the END, once all pages have been migrated.

**Warning signs:**
- Running `pnpm test:e2e:visual` fails on every test after the first layout change.
- PR diffs show dozens of changed `.png` files with no meaningful review.

**Phase to address:**
Phase 1 (Layout Shell) -- delete old baselines upfront, establish new baseline strategy.

---

### Pitfall 2: E2E Navigation Selectors Break Across the Board

**What goes wrong:**
The current E2E tests rely on selectors like `page.getByRole('link')` for `navLinks` (in `dashboard.page.ts`), `page.getByRole('navigation', { name: 'Main navigation' })` for the mobile bottom nav, and text-based selectors for finding navigation elements. When navigation moves from a top-nav `<header>` with `<MainNav>` and a `<MobileBottomNav>` to a sidebar with `SidebarMenu`, `SidebarMenuButton`, and a mobile `Sheet`, every navigation-related E2E assertion fails -- not because anything is broken, but because the DOM structure changed.

**Why it happens:**
The current `DashboardPage.navLinks` is `page.getByRole('link')` -- which returns ALL links on the page. The responsive tests check `navLinks.count()` for navigation presence. The accessibility tests check keyboard navigation through tab order. The mobile bottom nav tests verify specific `aria-current="page"` attributes and `md:hidden` classes. All of these assumptions change when the navigation moves to a sidebar.

**How to avoid:**
1. Audit every E2E page object and spec file for navigation-related selectors BEFORE changing any layout code. Create a checklist of selectors that will break.
2. Use stable `data-testid` attributes on the new sidebar navigation items (e.g., `data-testid="sidebar-nav"`, `data-testid="nav-link-dashboard"`).
3. Update E2E page objects (`dashboard.page.ts`, `habits.page.ts`, etc.) in the SAME commit as the layout change -- never split them.
4. The `MobileBottomNav` component and its test file (`mobile-bottom-nav.test.tsx`) will be deleted entirely when replaced by the sidebar's mobile `Sheet` -- plan for this explicitly.

**Warning signs:**
- E2E tests pass locally on desktop but fail on mobile viewports.
- `responsive.spec.ts` navigation tests start failing intermittently.
- Tab-order accessibility tests (`accessibility.spec.ts`) hit unexpected elements.

**Phase to address:**
Phase 1 (Layout Shell) -- update E2E page objects simultaneously with layout migration.

---

### Pitfall 3: Card-on-Gray Background Token Mismatch in Dark Mode

**What goes wrong:**
The card-on-gray pattern requires three visually distinct background layers: page background (gray), card background (white/elevated), and sidebar background (different shade). In the current codebase, `--background` and `--card` are IDENTICAL in both light and dark modes:
- Light: `--background: 0 0% 100%` / `--card: 0 0% 100%` (both pure white)
- Dark: `--background: 0 0% 3.9%` / `--card: 0 0% 3.9%` (both near-black)

When you change `--background` to gray (e.g., `0 0% 96%` light / `0 0% 7%` dark) for the card-on-gray effect, every component that uses `bg-background` suddenly sits on gray, but cards using `bg-card` remain correct ONLY if `--card` stays white/elevated. The problem: dozens of existing components use `bg-background` for containers that should actually be elevated (forms, modals, content areas), and they will appear "flat" against the gray page background with no visual separation.

**Why it happens:**
When `--background` and `--card` are identical (as they are now), developers use them interchangeably. A card-on-gray migration splits these tokens, revealing every place they were used incorrectly.

**How to avoid:**
1. Audit EVERY usage of `bg-background` in the codebase and classify each as either "page-level background" (stays gray) or "elevated surface" (should become `bg-card`).
2. Change tokens in `globals.css` first, then visually inspect every page in both light AND dark mode before proceeding.
3. Pay special attention to the `StatCard` component in `daily-snapshot.tsx` which hardcodes `bg-white dark:bg-slate-900` instead of using semantic tokens -- these will look wrong against a new gray background.
4. The shadcn sidebar variables are already defined in `globals.css` (lines 72-92: `--sidebar`, `--sidebar-foreground`, etc.) -- use these, do not create new ad-hoc sidebar colors.

**Warning signs:**
- Cards appear "invisible" (no border, no shadow, same color as background) in one or both modes.
- Components look correct in light mode but wrong in dark mode (or vice versa).
- The `StatCard` component's hardcoded colors clash with the new design system.

**Phase to address:**
Phase 1 (Design Tokens) -- must be resolved before any component migration begins.

---

### Pitfall 4: Sidebar Causes Content Width Regression on Every Page

**What goes wrong:**
The current layout uses `container max-w-screen-2xl mx-auto px-4` for content width. Adding a sidebar reduces the available main content width by 16rem (the default `SIDEBAR_WIDTH`). Components with hardcoded widths, grid layouts assuming full viewport width, or `max-w-*` constraints break silently -- content overflows, grids collapse to fewer columns prematurely, or forms become uncomfortably narrow on medium-sized screens.

**Why it happens:**
The dashboard content uses `grid grid-cols-2 md:grid-cols-3 gap-4` for stat cards and `grid gap-6 lg:grid-cols-2` for the habits/tasks grid. These breakpoints are based on VIEWPORT width (Tailwind's `md:` = 768px), not container width. With a 256px sidebar, a 768px viewport only gives 512px of content width -- which is too narrow for a 3-column grid. The breakpoints need adjusting.

**How to avoid:**
1. After adding the sidebar, test EVERY page at viewport widths of 768px, 1024px, and 1280px with sidebar both expanded and collapsed.
2. Adjust Tailwind breakpoints for content grids. The dashboard stat cards grid should likely shift from `md:grid-cols-3` to `lg:grid-cols-3` since `md` viewports now have less content space.
3. Use shadcn's `SidebarInset` component which automatically handles the main content margin offset when using the `inset` variant.
4. Watch for the `overflow-x-hidden` on the current layout's main content area (line 35 of `app-layout.tsx`) -- this masks overflow bugs rather than fixing them. Remove it and fix actual overflow issues.

**Warning signs:**
- Stat cards show 2 columns at desktop widths where they previously showed 3.
- Habit/task grid never splits into 2 columns because the `lg:` breakpoint is too wide with the sidebar taking space.
- Horizontal scroll appears at tablet viewports (the `responsive.spec.ts` tests will catch this).

**Phase to address:**
Phase 2 (Page Migration) -- verify each page's responsive behavior after sidebar integration.

---

### Pitfall 5: Converting AppLayout to Client Component Kills Server Rendering

**What goes wrong:**
The current `AppLayout` is a SERVER component (no `"use client"` directive). It can render `ProfileAvatar` as a server component. When adding sidebar interactivity (collapse/expand state via `useSidebar`, `SidebarProvider`, `SidebarTrigger`), developers add `"use client"` to the entire layout component. This forces EVERYTHING inside it -- including all children -- to render client-side, destroying the server-rendering benefits of Next.js 16's App Router and increasing bundle size.

**Why it happens:**
The shadcn `SidebarProvider` uses React Context (`useState`, `useCallback`) and must be a client component. Developers instinctively wrap the entire layout in `"use client"` to make the Context available. But the correct pattern is to keep the layout as a server component and only make the `SidebarProvider` wrapper a client component.

**How to avoid:**
1. Create a SEPARATE client component wrapper: `components/layouts/sidebar-provider-wrapper.tsx` with `"use client"` that contains only the `SidebarProvider`.
2. Keep the route layout files (`app/dashboard/layout.tsx`, etc.) as server components that import and compose the client wrapper.
3. The sidebar itself should be a client component (needs `usePathname` for active state), but page content should remain server-renderable.
4. Follow the existing pattern: `ProfileAvatar` is a server component, `ProfileAvatarClient` is its client counterpart. Apply this same split to sidebar components.

**Warning signs:**
- `"use client"` appears in `app/layout.tsx` or `app/dashboard/layout.tsx`.
- Build output shows significantly larger client bundles for layout routes.
- Server components inside the layout start requiring client-side data fetching.

**Phase to address:**
Phase 1 (Layout Shell) -- architecture decision must be correct from the start.

---

### Pitfall 6: Sidebar Mobile Sheet Conflicts with Existing Mobile Bottom Nav

**What goes wrong:**
The current app uses `MobileBottomNav` -- a fixed-position bottom navigation bar visible on `md:hidden` screens. The shadcn sidebar's mobile behavior opens as a `Sheet` (slide-out drawer) overlay. If both exist simultaneously, users get two navigation mechanisms: a bottom tab bar AND a slide-out drawer, creating UX confusion. Worse, the bottom nav's `fixed bottom-0` positioning overlaps with the Sheet, and the sidebar trigger button competes with the bottom nav for tap targets.

**Why it happens:**
The migration is incremental. Developers add the new sidebar but forget to remove or conditionally hide the old `MobileBottomNav`. Or they remove it too early, leaving mobile users with no navigation until the sidebar Sheet is fully implemented.

**How to avoid:**
1. Plan the mobile nav transition explicitly: the `MobileBottomNav` component must be REMOVED in the same commit that the sidebar's mobile Sheet becomes functional.
2. The mobile experience should use the sidebar's `collapsible="offcanvas"` mode, which renders as a `Sheet` on mobile (the shadcn sidebar handles this automatically via `isMobile` detection).
3. Test on actual mobile viewports (375px, 390px) -- not just resized desktop browsers -- to verify the Sheet trigger is accessible and the bottom safe area (`env(safe-area-inset-bottom)`) is respected.
4. Update the `mobile-bottom-nav.test.tsx` unit test -- it should be DELETED, not adapted, since the component itself is being removed.

**Warning signs:**
- Two navigation mechanisms visible on mobile at the same time.
- `pb-20 md:pb-0` padding (currently on main content to account for bottom nav height) is still present after bottom nav removal, creating unexplained bottom spacing.
- `z-50` conflicts between bottom nav and sidebar Sheet.

**Phase to address:**
Phase 1 (Layout Shell) -- mobile navigation must be part of the layout shell, not deferred.

---

### Pitfall 7: Theme Switcher Hydration Flash Gets Worse with Sidebar

**What goes wrong:**
The current `ThemeSwitcher` component already has a hydration workaround: it manually forces `document.documentElement.classList` updates via `useEffect` and includes debug `console.log` statements (lines 26-42 of `theme-switcher.tsx`). Adding a sidebar introduces MORE elements that depend on theme state (sidebar background, sidebar border, sidebar text colors). The flash of incorrect theme (FOUC) becomes more visually jarring because the sidebar occupies a large, always-visible area.

**Why it happens:**
`next-themes` cannot know the theme on the server. The sidebar's large surface area (16rem wide, full viewport height) makes any flash of the wrong background color extremely obvious -- much more so than the current top-nav which is only 56px tall.

**How to avoid:**
1. Use CSS variables for ALL sidebar colors (the existing `--sidebar`, `--sidebar-foreground` variables in `globals.css`). Never hardcode colors like `bg-white dark:bg-slate-900`.
2. The `suppressHydrationWarning` is already on `<html>` (line 47 of `app/layout.tsx`) -- verify it stays there.
3. Remove the debug `console.log` statements in `theme-switcher.tsx` before the migration.
4. Test the FOUC by toggling between themes rapidly and doing hard refreshes in both modes. The sidebar should not flash white-then-dark or vice versa.
5. For the sidebar specifically, the `@theme inline` block in `globals.css` (lines 94-103) already maps sidebar CSS variables to Tailwind -- use `bg-sidebar` and `text-sidebar-foreground` classes, not hardcoded values.

**Warning signs:**
- Visible flash of wrong sidebar color on page load.
- Console errors about hydration mismatches mentioning `class` attribute.
- Users report the app "flickers" on navigation.

**Phase to address:**
Phase 1 (Design Tokens) -- clean up theme handling before building sidebar.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding `bg-white dark:bg-slate-900` on cards | Quick visual result | Every card must be individually updated if design tokens change; already present in `daily-snapshot.tsx` | Never -- use `bg-card` semantic token |
| Using `"use client"` on layout files | Sidebar toggle works immediately | Kills server rendering for all children; larger bundles | Never -- isolate client boundary to SidebarProvider wrapper |
| Keeping `MobileBottomNav` during migration | Mobile users still have nav | Two nav mechanisms; z-index conflicts; confusing UX | Only acceptable for 1-2 days during active development, never in a deployable state |
| Skipping responsive testing at each phase | Faster development | Breakpoint regressions compound; fixing late is 3-5x harder | Never -- test at 375px, 768px, 1024px, 1280px after each layout change |
| Using `container max-w-*` inside sidebar content | Familiar pattern from current layout | Creates double-constrained widths (sidebar width + container max-width); wastes space | Never with sidebar layout -- use full-width content within `SidebarInset` |
| Blind `--update-snapshots` on visual regression | Tests pass again | Loses ability to catch real regressions during migration | Only at defined checkpoints with explicit visual review |

## Integration Gotchas

Common mistakes when connecting existing components to the new layout.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| shadcn `SidebarProvider` + Next.js layouts | Wrapping in route `layout.tsx` with `"use client"` | Create a dedicated client wrapper component; import in server layout |
| `next-themes` + sidebar CSS variables | Using `bg-background` for sidebar (looks identical to page background) | Use `bg-sidebar` which maps to `--sidebar` variable |
| `usePathname()` for sidebar active state | Duplicating the logic already in `MainNav` and `MobileBottomNav` | Consolidate to a single `navItems` constant; share between sidebar and any residual nav |
| Sidebar collapse state + `localStorage` | Using `useState` without persistence (sidebar resets on navigation) | shadcn `SidebarProvider` supports `defaultOpen` and cookie-based persistence via `SIDEBAR_STATE_COOKIE` |
| i18n in sidebar nav items | Forgetting to add sidebar-specific translation keys | Reuse existing `common.nav.dashboard`, `common.nav.habits`, `common.nav.tasks` keys -- no new keys needed for nav items |
| `SidebarInset` wrapper | Forgetting to wrap main content in `SidebarInset` when using `variant="inset"` | Always pair `<Sidebar variant="inset">` with `<SidebarInset>` around children |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-rendering entire sidebar on every navigation | Sluggish page transitions; sidebar items flash | Memoize sidebar component; ensure `usePathname` only triggers re-render of active state indicator, not entire tree | Noticeable with 10+ nav items or complex sidebar content |
| Animating sidebar width with `transition: all` | CLS (Cumulative Layout Shift) during collapse/expand; main content jumps | Use `transition: width 200ms` (specific property); or use `transform: translateX()` for offcanvas mode which triggers no layout recalculation | Immediately -- any sidebar interaction triggers layout shift |
| Loading sidebar content (user avatar, preferences) on every route | Extra API calls on each navigation; waterfall requests | Sidebar is in a layout component -- data fetched ONCE and persists across navigations. Use SWR with long stale time | When app has 5+ routes; each navigation triggers redundant fetches |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No sidebar collapse memory | User collapses sidebar, navigates, sidebar reopens -- frustrating | Persist collapse state to cookie (shadcn supports this natively) |
| Sidebar covers content on tablet (768-1024px) | Content becomes unreadable when sidebar is open | Default to collapsed (icon-only) on tablet; expanded only on lg+ |
| No keyboard shortcut for sidebar toggle | Power users must reach for mouse | shadcn sidebar includes `Cmd+B` / `Ctrl+B` by default -- preserve this |
| Mobile sidebar has no backdrop/overlay | Users can interact with content behind the sidebar sheet | Use shadcn's built-in Sheet which includes overlay |
| Sidebar steals focus on mobile open | Screen readers announce wrong content | Ensure focus moves to sidebar on open and returns to trigger on close (Sheet handles this) |
| Card-on-gray makes cards look "clickable" everywhere | Users click non-interactive cards expecting something to happen | Add hover effects only to actually clickable cards; static cards should have no hover state |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Sidebar layout:** Often missing collapsed (icon-only) state -- verify sidebar works with `collapsible="icon"` and all nav items show tooltips when collapsed
- [ ] **Dark mode cards:** Often missing shadow adjustment -- `shadow-sm` is invisible on dark backgrounds; verify cards have `border` OR adjusted `shadow` in dark mode
- [ ] **Mobile sidebar:** Often missing safe area insets -- verify `pb-[env(safe-area-inset-bottom)]` on Sheet content for iPhone notch/bar
- [ ] **Active nav state:** Often missing for nested routes -- verify `/habits/abc-123/edit` highlights the "Habits" nav item (use `startsWith` matching, not exact match)
- [ ] **Keyboard navigation:** Often missing skip-link update -- the "skip to content" target must point to the new main content area, not the old one
- [ ] **Background color transition:** Often missing page background update on auth pages -- login/signup pages should NOT have the gray background (they are outside the sidebar layout)
- [ ] **Loading skeletons:** Often missing sidebar-aware skeleton -- the `DashboardSkeleton` component uses `grid grid-cols-2 md:grid-cols-3` which may need breakpoint updates for the reduced content width
- [ ] **Print styles:** Often missing sidebar hiding -- verify sidebar is hidden in print media queries

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Background token mismatch (cards invisible) | LOW | Audit all `bg-background` and `bg-card` usages; batch-replace in one commit; takes 1-2 hours |
| Client component boundary too high | MEDIUM | Extract server-renderable parts into separate components; restructure imports; may affect 5-10 files; takes 4-8 hours |
| E2E selectors broken | LOW | Update page objects with new `data-testid` selectors; run full suite to verify; takes 2-3 hours |
| Visual baselines invalidated mid-migration | LOW | Delete all baselines; regenerate after migration complete; takes 30 minutes |
| Content width regressions | MEDIUM | Audit all grid/flex layouts in content area; adjust breakpoints; requires testing at multiple viewports; takes 4-6 hours |
| Sidebar/bottom-nav dual navigation | LOW | Remove `MobileBottomNav` component, import references, test file, and bottom padding; takes 1 hour |
| FOUC with sidebar | LOW-MEDIUM | Replace hardcoded colors with CSS variable classes; clean up ThemeSwitcher debug code; takes 2-3 hours |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Visual baselines worthless | Phase 1 (Layout Shell) | Old baselines deleted; no `.png` files in diff until final phase |
| E2E navigation selectors break | Phase 1 (Layout Shell) | All E2E specs pass after layout shell is complete |
| Background token mismatch | Phase 1 (Design Tokens) | Visual inspection of every page in both light and dark mode; no `bg-white` or `bg-slate-*` hardcodes remain |
| Content width regression | Phase 2 (Page Migration) | `responsive.spec.ts` passes; no horizontal scroll at any viewport; stat cards show 3 columns at 1280px with sidebar |
| Client component boundary too high | Phase 1 (Layout Shell) | `"use client"` does NOT appear in any route `layout.tsx` file |
| Sidebar/bottom-nav conflict | Phase 1 (Layout Shell) | `MobileBottomNav` component and test file deleted; only one nav mechanism exists |
| Theme flash with sidebar | Phase 1 (Design Tokens) | No `console.log` in ThemeSwitcher; no hardcoded colors in sidebar; hard-refresh shows no FOUC |

## Sources

- Codebase analysis: `components/layouts/app-layout.tsx`, `components/main-nav.tsx`, `components/mobile-bottom-nav.tsx`, `components/theme-switcher.tsx`, `app/globals.css`, `tailwind.config.ts` (HIGH confidence -- direct inspection)
- [shadcn/ui Sidebar documentation](https://ui.shadcn.com/docs/components/radix/sidebar) (HIGH confidence)
- [shadcn/ui Sidebar issue #5752: dark mode background color specificity bug](https://github.com/shadcn-ui/ui/issues/5752) (HIGH confidence)
- [App Router pitfalls: common Next.js mistakes](https://imidef.com/en/2026-02-11-app-router-pitfalls) (MEDIUM confidence)
- [LedgerHQ navigation E2E migration PR #14343](https://github.com/LedgerHQ/ledger-live/pull/14343) (MEDIUM confidence -- real-world case study)
- [Tailwind CSS dark mode documentation](https://tailwindcss.com/docs/dark-mode) (HIGH confidence)
- [next-themes hydration mismatch patterns](https://medium.com/@pavan1419/fixing-hydration-mismatch-in-next-js-next-themes-issue-8017c43dfef9) (MEDIUM confidence)
- [WordPress Gutenberg nav sidebar breaking E2E tests](https://github.com/WordPress/gutenberg/pull/25918) (MEDIUM confidence -- pattern confirmation)
- E2E test files: `e2e/responsive.spec.ts`, `e2e/visual-regression.spec.ts`, `e2e/dashboard.spec.ts`, `e2e/accessibility.spec.ts` (HIGH confidence -- direct inspection)
- Unit test files: `tests/components/mobile-bottom-nav.test.tsx`, `tests/app/dashboard/dashboard-content.test.tsx` (HIGH confidence -- direct inspection)

---
*Pitfalls research for: BetterR.Me UI Redesign (top-nav to sidebar, card-on-gray)*
*Researched: 2026-02-15*
