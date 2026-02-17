# Phase 2: Sidebar Shell & Navigation Switch - Research

**Researched:** 2026-02-16
**Domain:** shadcn/ui Sidebar component, Next.js App Router layout architecture, responsive navigation
**Confidence:** HIGH

## Summary

Phase 2 replaces the existing top navigation bar (`AppLayout` header + `MainNav`) and mobile bottom tab bar (`MobileBottomNav`) with a persistent left sidebar on desktop and a Sheet/drawer on mobile. The shadcn/ui Sidebar component provides the complete foundation: it handles desktop rendering, mobile Sheet rendering (via the already-installed Sheet primitive), active state via `isActive` prop, collapse/expand state management, and cookie persistence for sidebar open state.

The codebase is well-prepared for this change. Phase 1 has already established all sidebar CSS tokens (`--sidebar-background`, `--sidebar-foreground`, etc.) in raw HSL format in `globals.css` and registered them in `tailwind.config.ts` as `bg-sidebar`, `text-sidebar-foreground`, etc. The `useIsMobile` hook already exists at `hooks/use-mobile.ts` with the 768px breakpoint matching the SIDE-04/SIDE-07 requirements. The Sheet component (`components/ui/sheet.tsx`) is already installed. The sidebar component itself (`components/ui/sidebar.tsx`) needs to be installed via `pnpx shadcn@latest add sidebar`.

The main architectural decision is whether to use a route group `app/(dashboard)/layout.tsx` or keep the current three separate layout files. Research recommends the **simpler approach**: replace `AppLayout` in all three existing layout files (`dashboard/layout.tsx`, `habits/layout.tsx`, `tasks/layout.tsx`) with the new sidebar shell. This avoids URL changes, proxy redirect updates, and E2E path breakage.

**Primary recommendation:** Install the shadcn sidebar component, create an `AppSidebar` client component with the three navigation items (Dashboard, Habits, Tasks), replace `AppLayout` usage in all three layout files with `SidebarProvider` + `AppSidebar` + `SidebarInset`, remove `MobileBottomNav` and `MainNav` in the same commit, and add a mobile header bar with `SidebarTrigger` for hamburger menu access.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sidebar visual design: Claude's Discretion for width, background color, border/shadow treatment, logo/branding placement. Reference: Chameleon (app.chameleon.io) sidebar style. Must use design tokens from Phase 1 (sidebar-background, sidebar-foreground, etc.)
- Navigation items & active state: Claude's Discretion for icon choices, active state indicator style, hover/focus states, item spacing/density. Items: Dashboard, Habits, Tasks (matching current nav destinations). Active state must be visually clear (SIDE-03 requirement).
- Mobile sheet behavior: Claude's Discretion for hamburger button placement, overlay style, sheet width, transition animation. Must appear as sheet/drawer from left edge on <768px (SIDE-04, SIDE-07 requirements). Must fully replace bottom tab bar -- no dual-nav state.
- Top bar replacement: Claude's Discretion for whether any top bar remains, page title placement, mobile header treatment. Old top nav and mobile bottom nav must be fully removed (success criteria #4).

### Claude's Discretion
All four areas above are at Claude's discretion. Key constraints:
- Use shadcn/ui Sidebar component as the foundation
- Follow Chameleon's visual style as the reference
- Leverage Phase 1 design tokens for all color/spacing values
- Ensure i18n compatibility (all three locales)
- Maintain dark mode support using the established token system

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

Note: Collapse/persistence behavior belongs in Phase 3; enrichment (user profile, badges, theme switcher in sidebar) belongs in Phase 7.
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Sidebar | latest (via CLI) | Complete sidebar primitive with mobile Sheet, collapse, cookie persistence | Official shadcn component; handles desktop/mobile automatically; uses existing Sheet, Tooltip, Separator primitives |
| lucide-react | ^0.511.0 | Navigation item icons (Home, ClipboardList, ListChecks) | Already installed; same icons used in current `MobileBottomNav` |
| next-intl | installed | i18n for sidebar nav labels | Already used; reuse existing `common.nav.dashboard`, `common.nav.habits`, `common.nav.tasks` keys |

### Supporting (Already Installed)

| Library | Version | Purpose | Used By Sidebar |
|---------|---------|---------|-----------------|
| Sheet (`components/ui/sheet.tsx`) | installed | Mobile drawer overlay | Sidebar renders as Sheet on mobile (`isMobile === true`) |
| Tooltip (`components/ui/tooltip.tsx`) | installed | Collapsed state tooltips | Shows nav label on hover when sidebar is icon-only |
| Separator (`components/ui/separator.tsx`) | installed | Visual dividers | Between SidebarTrigger and page title in header |
| Collapsible (`components/ui/collapsible.tsx`) | installed | Expandable nav groups | For SidebarGroup collapse (not needed for Phase 2's flat 3-item nav) |
| Breadcrumb (`components/ui/breadcrumb.tsx`) | installed | Page header breadcrumbs | Optional for page-header component |
| `hooks/use-mobile.ts` | installed | Mobile breakpoint detection (768px) | Used internally by sidebar's `SidebarProvider` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Sidebar | Custom sidebar from scratch | Would lose mobile Sheet, cookie persistence, keyboard shortcut, data-attribute-driven styling. No benefit. |
| Route group `(dashboard)/` | Existing 3 separate layouts | Route group is cleaner architecture but requires URL restructuring, proxy updates, E2E path changes. **Use existing layouts** -- simpler, no routing risk. |
| `variant="inset"` (card-on-gray) | `variant="sidebar"` (standard) | Inset provides card-on-gray effect automatically but adds complexity. **Use standard `variant="sidebar"`** for Phase 2 -- card-on-gray layout is a later phase concern. |

### Installation

```bash
pnpx shadcn@latest add sidebar
```

This installs `components/ui/sidebar.tsx` and brings in its dependencies. The command will also install `hooks/use-mobile.ts` if not present (already exists in this codebase).

**IMPORTANT:** After installation, the sidebar component's `SIDEBAR_WIDTH`, `SIDEBAR_WIDTH_MOBILE`, and `SIDEBAR_WIDTH_ICON` constants need to be updated to match Phase 1's design tokens:
- `SIDEBAR_WIDTH = "16rem"` (default) should be changed to `"var(--sidebar-width)"` or kept at a value consistent with `--sidebar-width: 200px` (which is `12.5rem`)
- `SIDEBAR_WIDTH_MOBILE = "18rem"` (default) should match `--sidebar-width-mobile: 280px` (which is `17.5rem`)
- `SIDEBAR_WIDTH_ICON = "3rem"` (default) should match `--sidebar-width-icon: 48px` (which is `3rem` -- already matches)

## Architecture Patterns

### Recommended Project Structure (Changes Only)

```
components/
  layouts/
    app-sidebar.tsx         # NEW: Sidebar navigation component (client)
    app-layout.tsx          # DELETED: Old top-nav layout
  main-nav.tsx              # DELETED: Desktop nav links
  mobile-bottom-nav.tsx     # DELETED: Mobile bottom tab bar
  ui/
    sidebar.tsx             # NEW: shadcn/ui sidebar primitive (installed via CLI)

app/
  dashboard/
    layout.tsx              # MODIFIED: SidebarProvider + AppSidebar + SidebarInset
  habits/
    layout.tsx              # MODIFIED: Same pattern
  tasks/
    layout.tsx              # MODIFIED: Same pattern
```

### Pattern 1: Sidebar Layout Shell (Authenticated Pages)

**What:** Each authenticated route layout wraps children in `SidebarProvider` + `AppSidebar` + `SidebarInset` + mobile header.

**When to use:** Every authenticated layout file (dashboard, habits, tasks).

**Example:**
```typescript
// app/dashboard/layout.tsx (server component -- NO "use client")
import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Mobile header with hamburger trigger */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="font-semibold">BetterR.me</span>
        </header>
        <div className="flex-1 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Key detail:** Layout stays a SERVER component. `SidebarProvider` is a client component internally but can be imported and composed in a server component file. The `await cookies()` call makes the layout dynamic (not statically rendered), which is fine for authenticated pages that already require session checks.

### Pattern 2: AppSidebar Component (Client)

**What:** The sidebar navigation component that renders the logo, nav items with icons, and active state detection.

**When to use:** Imported by each authenticated layout.

**Example:**
```typescript
// components/layouts/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, ListChecks } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/dashboard", icon: Home, labelKey: "dashboard",
    match: (p: string) => p === "/dashboard" || p === "/dashboard/settings" },
  { href: "/habits", icon: ClipboardList, labelKey: "habits",
    match: (p: string) => p.startsWith("/habits") },
  { href: "/tasks", icon: ListChecks, labelKey: "tasks",
    match: (p: string) => p.startsWith("/tasks") },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("common.nav");

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="font-display font-bold text-lg text-primary">
            BetterR.me
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.match(pathname)}
                    tooltip={t(item.labelKey)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
```

**Key details:**
- Navigation items reuse the same icons (`Home`, `ClipboardList`, `ListChecks`) and i18n keys (`common.nav.dashboard`, etc.) from the existing `MobileBottomNav`
- Active state uses `startsWith` matching for nested routes (e.g., `/habits/abc-123/edit` highlights "Habits")
- `SidebarMenuButton` `isActive` prop drives `data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground` styling automatically
- The `tooltip` prop shows the nav label as a tooltip when sidebar is collapsed to icon-only mode
- `SidebarFooter` is empty for now -- user profile, theme switcher, language switcher move here in Phase 7

### Pattern 3: Navigation Item Configuration (Single Source of Truth)

**What:** Define navigation items as a shared constant with icon, href, i18n key, and path-matching function.

**When to use:** Always. Prevents config drift between desktop and mobile navigation.

**Example:** See `navItems` array in Pattern 2 above. This replaces:
- `navItems` in `components/mobile-bottom-nav.tsx` (lines 9-13)
- `navItems` in `components/main-nav.tsx` (lines 12-27)

Both old arrays are deleted when those components are removed.

### Anti-Patterns to Avoid

- **Adding `"use client"` to layout files:** The layout files (`app/dashboard/layout.tsx`, etc.) MUST remain server components. `SidebarProvider` is a client component that can be composed inside a server component. Never add `"use client"` to the layout itself.
- **Keeping `MobileBottomNav` during transition:** The old bottom nav MUST be removed in the same commit that the sidebar's mobile Sheet becomes functional. Never have two navigation mechanisms simultaneously.
- **Using `container max-w-*` inside `SidebarInset`:** The sidebar already constrains content width. Adding `container max-w-screen-2xl` double-constrains the content area, wasting horizontal space. Use simple padding (`p-4 md:p-6`) instead.
- **Wrapping entire page content in another Card:** `SidebarInset` handles the content area styling. Don't add an outer Card wrapper.
- **Hardcoding colors instead of sidebar tokens:** Use `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, etc. Never use `bg-white dark:bg-slate-900` or hardcoded hex values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile sidebar drawer | Custom Sheet + state management | shadcn Sidebar (auto-renders as Sheet on mobile) | Handles overlay, focus trap, animation, safe-area insets |
| Sidebar collapse/expand | Custom useState + CSS | `SidebarProvider` + `useSidebar()` hook | Cookie persistence, keyboard shortcut (Cmd+B), data-attribute-driven CSS transitions |
| Active nav state styling | Custom CSS classes | `SidebarMenuButton isActive` prop | Drives `data-[active=true]` selectors, consistent hover/focus states, works with all sidebar variants |
| Mobile breakpoint detection | Custom `window.matchMedia` | `useIsMobile()` hook (already exists at `hooks/use-mobile.ts`) | Used internally by sidebar; consistent 768px breakpoint |
| Navigation item tooltips | Custom tooltip on hover | `SidebarMenuButton tooltip` prop | Only shows when collapsed to icon-only mode; uses shadcn Tooltip internally |

**Key insight:** The shadcn sidebar component handles the entire desktop/mobile navigation pattern. Every piece of custom navigation logic in the current codebase (`MainNav`, `MobileBottomNav`) is replaced by composing sidebar primitives.

## Common Pitfalls

### Pitfall 1: Sidebar Width Constants vs CSS Token Mismatch
**What goes wrong:** The installed `sidebar.tsx` defines `SIDEBAR_WIDTH = "16rem"` as a JS constant, but Phase 1 defined `--sidebar-width: 200px` (12.5rem) as a CSS custom property. If both exist, the inline CSS variable set by `SidebarProvider` overrides the CSS custom property, creating inconsistency.
**Why it happens:** shadcn uses JS constants for width, but Phase 1 already defined width tokens in CSS.
**How to avoid:** After installing the sidebar component, update the JS constants in `sidebar.tsx` to match Phase 1 tokens: `SIDEBAR_WIDTH = "12.5rem"` (200px), `SIDEBAR_WIDTH_MOBILE = "17.5rem"` (280px), `SIDEBAR_WIDTH_ICON = "3rem"` (48px matches already). Alternatively, use `style={{ "--sidebar-width": "var(--sidebar-width)" }}` on `SidebarProvider`, but updating the constants is cleaner.
**Warning signs:** Sidebar appears wider than expected (256px instead of 200px), or content area width calculations are off.

### Pitfall 2: `pb-20 md:pb-0` Padding Leftover After Bottom Nav Removal
**What goes wrong:** The current `app-layout.tsx` has `pb-20 md:pb-0` on the main content div (line 35) to account for the fixed-position mobile bottom nav (64px = 4rem, plus safe area). After removing `MobileBottomNav`, this padding creates unexplained 80px (5rem) of bottom whitespace on mobile.
**Why it happens:** The padding was added specifically for the bottom nav. When the nav is removed but the padding remains, mobile pages have a large empty gap at the bottom.
**How to avoid:** Remove `pb-20 md:pb-0` when removing `MobileBottomNav`. The new sidebar layout uses `SidebarInset` which does not need bottom padding compensation.
**Warning signs:** Excessive bottom whitespace on mobile views; users can scroll past content to a blank area.

### Pitfall 3: Server Component Layout + Client Component Sidebar
**What goes wrong:** Developers add `"use client"` to the layout file to make `SidebarProvider` work, killing server rendering for all children.
**Why it happens:** `SidebarProvider` uses React Context. Developers assume the file importing it must be a client component.
**How to avoid:** In Next.js App Router, a server component CAN import and render a client component. The layout file stays as a server component and simply composes `SidebarProvider` (which is `"use client"` internally). The `await cookies()` call in the layout confirms it is a server component.
**Warning signs:** `"use client"` at the top of any layout file; server components inside the layout suddenly need client-side data fetching.

### Pitfall 4: Dual Navigation State During Migration
**What goes wrong:** The sidebar's mobile Sheet AND the old `MobileBottomNav` both render on mobile, creating two navigation mechanisms. z-index conflicts cause overlapping UI.
**Why it happens:** Incremental migration -- the new sidebar is added before the old nav is removed.
**How to avoid:** Remove `MobileBottomNav` import from `app-layout.tsx`, remove `MainNav` import, and delete both component files in the SAME commit as adding the sidebar.
**Warning signs:** Two navigation bars visible on mobile; z-50 conflicts; E2E tests finding more navigation links than expected.

### Pitfall 5: Missing `SidebarTrigger` on Mobile
**What goes wrong:** On mobile, the sidebar renders as a Sheet (offcanvas), but there is no visible button to open it. Users are stranded with no navigation.
**Why it happens:** The desktop sidebar is always visible (or has a visible trigger). On mobile, the sidebar is hidden by default and requires an explicit trigger (hamburger button) to open. If `SidebarTrigger` is not placed in a visible mobile header, there is no way to navigate.
**How to avoid:** Add a mobile-only header bar (visible at `md:hidden`) containing `SidebarTrigger` as a hamburger menu button. The Chameleon reference does not show mobile, but standard SaaS pattern is a top-left hamburger icon.
**Warning signs:** Mobile users see content but cannot navigate to other pages; sidebar cannot be opened.

### Pitfall 6: Accessibility Test Regression
**What goes wrong:** The existing accessibility test (`tests/accessibility/a11y.test.tsx`, line 130-137) checks for `nav` element with `aria-label="Main navigation"` on the Navbar component. The existing mobile-bottom-nav test (`tests/components/mobile-bottom-nav.test.tsx`) checks for the same aria-label. Both tests fail when these components are removed.
**Why it happens:** Tests reference specific components that are being deleted.
**How to avoid:** Delete `tests/components/mobile-bottom-nav.test.tsx` entirely. Update or remove the Navbar accessibility test (the Navbar component is the PUBLIC landing page nav, not the authenticated app nav -- it may still exist). Add a new test for the AppSidebar component verifying navigation role and aria-label.
**Warning signs:** Test failures referencing deleted components; `MobileBottomNav` import errors in test files.

## Code Examples

### Installing the Sidebar Component

```bash
# Source: shadcn/ui official docs
pnpx shadcn@latest add sidebar
```

This adds `components/ui/sidebar.tsx`. It will also create `hooks/use-mobile.ts` if missing (already exists in this project).

### Sidebar Width Constant Update After Installation

```typescript
// Source: shadcn sidebar.tsx internal constants
// After installation, update in components/ui/sidebar.tsx:

// BEFORE (shadcn defaults):
const SIDEBAR_WIDTH = "16rem"       // 256px
const SIDEBAR_WIDTH_MOBILE = "18rem" // 288px
const SIDEBAR_WIDTH_ICON = "3rem"    // 48px

// AFTER (aligned with Phase 1 design tokens):
const SIDEBAR_WIDTH = "12.5rem"      // 200px (matches --sidebar-width)
const SIDEBAR_WIDTH_MOBILE = "17.5rem" // 280px (matches --sidebar-width-mobile)
const SIDEBAR_WIDTH_ICON = "3rem"      // 48px (already matches --sidebar-width-icon)
```

### Cookie-Based Default Open State

```typescript
// Source: shadcn/ui sidebar docs + architecture research
// In layout files (server component):
import { cookies } from "next/headers";

export default async function Layout({ children }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Default to TRUE (open) for first-time visitors

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {/* ... */}
    </SidebarProvider>
  );
}
```

### Active State Detection with Nested Routes

```typescript
// Source: Current codebase pattern from mobile-bottom-nav.tsx
const navItems = [
  {
    href: "/dashboard",
    icon: Home,
    labelKey: "dashboard",
    match: (p: string) => p === "/dashboard" || p === "/dashboard/settings",
  },
  {
    href: "/habits",
    icon: ClipboardList,
    labelKey: "habits",
    match: (p: string) => p.startsWith("/habits"),
    // Matches: /habits, /habits/new, /habits/[id], /habits/[id]/edit
  },
  {
    href: "/tasks",
    icon: ListChecks,
    labelKey: "tasks",
    match: (p: string) => p.startsWith("/tasks"),
  },
];
```

### Mobile Header with SidebarTrigger

```typescript
// Source: shadcn sidebar docs (SidebarTrigger usage)
// Mobile-only header bar for hamburger menu access:
<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
  <SidebarTrigger className="-ml-1" />
  <span className="font-display font-bold text-lg text-primary">
    BetterR.me
  </span>
</header>
```

### Full Layout File Pattern

```typescript
// Source: Synthesized from shadcn docs + codebase conventions
// app/dashboard/layout.tsx (also habits/layout.tsx, tasks/layout.tsx)
import { cookies } from "next/headers";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="font-display font-bold text-lg text-primary">
            BetterR.me
          </span>
        </header>
        <div className="flex-1 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

## Chameleon Visual Reference Analysis

**Confidence: HIGH** (direct screenshot analysis of `chameleon-sidebar.png` and `chameleon-home-full.png`)

### Chameleon Sidebar Characteristics

From the Chameleon screenshots, the sidebar has these design properties:

| Property | Observed Value | BetterR.Me Equivalent |
|----------|---------------|----------------------|
| **Width** | ~160-180px (narrow, text-only items) | `--sidebar-width: 200px` (slightly wider for i18n text) |
| **Background** | Very light gray, distinct from white content | `--sidebar-background: 220 20% 98%` (light), `240 28% 12%` (dark) |
| **Border** | No visible right border; separation via background contrast | Subtle border via `--sidebar-border` for accessibility |
| **Logo** | "chameleon" text + icon, top-left, small | "BetterR.me" text in brand color, top-left |
| **Nav items** | Icon (left) + label (right), generous vertical spacing | Same pattern with `SidebarMenuButton` |
| **Active state** | Light gray-blue pill/background on "Home" item, teal icon color | `bg-sidebar-accent` + `text-sidebar-accent-foreground` via `isActive` |
| **Hover state** | Subtle background highlight on hover | `SidebarMenuButton` default hover styling |
| **Item spacing** | ~8-12px vertical gap between items | Standard `SidebarMenu` spacing |
| **User/footer** | User avatar + name + settings gear at very bottom | Phase 7 scope; empty `SidebarFooter` for now |
| **Sub-items** | "Experiences" has a chevron for expanding sub-items | Not needed for Phase 2's flat 3-item nav |
| **Collapse icon** | Small icon next to logo (collapse toggle) | `SidebarTrigger` -- but collapse behavior is Phase 3 scope |

### Design Recommendations for Phase 2

Based on Chameleon analysis and Phase 1 tokens:

1. **Sidebar width:** 200px (`--sidebar-width`) -- slightly wider than Chameleon (~170px) to accommodate Chinese/Traditional Chinese nav labels which tend to be wider than English.

2. **Active state indicator:** Use `isActive` prop on `SidebarMenuButton` which applies `bg-sidebar-accent` (light gray-blue, `216 24% 95%` in light mode) and `text-sidebar-accent-foreground` (dark text). The active item's icon should use the brand teal color via `text-sidebar-primary` class on the icon element. This matches Chameleon's pattern where the active "Home" item has a teal-colored icon and a light background pill.

3. **Logo placement:** Top-left in `SidebarHeader`. Use `font-display font-bold text-lg text-primary` matching the existing brand styling. No background image or complex logo treatment.

4. **Mobile sheet:** 280px width (`--sidebar-width-mobile`). Slides in from left with standard Sheet animation. Hamburger button in a mobile-only header bar (`md:hidden`).

5. **No top bar on desktop:** The sidebar IS the navigation. Desktop has no top bar at all. Content area starts at the top with optional page-header components added by individual pages (future phase).

6. **Mobile top bar:** Minimal -- just hamburger trigger + "BetterR.me" brand text + (optionally) nothing else for now (profile/theme/language controls move to sidebar footer in Phase 7).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top nav + mobile bottom tabs | Sidebar + mobile sheet/drawer | Standard SaaS pattern 2023+ | Every major SaaS (Linear, Notion, Vercel) uses sidebar |
| Separate mobile/desktop nav components | Single sidebar (auto-detects mobile) | shadcn sidebar component 2024 | Eliminates config drift between MobileBottomNav and MainNav |
| Custom sidebar state management | shadcn SidebarProvider with cookie persistence | shadcn sidebar v3 2024 | Zero custom state code needed |
| `@theme inline` for sidebar vars (TW4) | Raw HSL + tailwind.config.ts registration (TW3) | Phase 1 of this project | Sidebar tokens are now fully functional for TW3 |

**Deprecated/outdated:**
- The current `@theme inline` block and `@custom-variant` directive in globals.css were removed in Phase 1. The sidebar variables are now correctly formatted for Tailwind 3.
- The `MobileBottomNav` component pattern (iOS-style bottom tabs) is being replaced by the sidebar Sheet pattern (SaaS standard).

## Open Questions

1. **Sidebar variant for Phase 2**
   - What we know: Three variants exist (`sidebar`, `floating`, `inset`). The `inset` variant creates card-on-gray effect. Phase 2 focuses on navigation switch, not visual card-on-gray treatment.
   - What's unclear: Whether to use `variant="sidebar"` (standard) now and switch to `variant="inset"` in a later phase, or start with `inset` immediately.
   - Recommendation: Use `variant="sidebar"` for Phase 2. This is the simplest variant and focuses the phase on its core goal (navigation switch). The inset/card-on-gray visual treatment can be added when that phase arrives. Starting simple reduces risk.

2. **Shared layout component vs duplicated layout code**
   - What we know: Three layout files (`dashboard/layout.tsx`, `habits/layout.tsx`, `tasks/layout.tsx`) will all have identical sidebar shell code.
   - What's unclear: Whether to extract a shared `SidebarShell` component or accept the duplication.
   - Recommendation: Extract a shared component (e.g., `components/layouts/sidebar-shell.tsx`) that wraps `SidebarProvider` + `AppSidebar` + `SidebarInset` + mobile header. Each layout file imports and uses it, similar to how they currently import `AppLayout`. This maintains the single-source-of-truth pattern and is consistent with the codebase convention.

3. **`components.json` config field**
   - What we know: `components.json` has `"config": ""` (empty string), which is the Tailwind v4 pattern. The project uses Tailwind v3 with `tailwind.config.ts`.
   - What's unclear: Whether the shadcn CLI will correctly install the sidebar component with this config. The CLI might generate TW4-style code instead of TW3-style code.
   - Recommendation: Before running `pnpx shadcn@latest add sidebar`, verify the generated code. If it produces TW4 syntax, update `components.json` to `"config": "tailwind.config.ts"` first. LOW risk -- the existing Sheet, Tooltip, and other components are already installed and working with TW3, so the CLI likely handles this correctly.

4. **Keyboard shortcut (Cmd+B / Ctrl+B)**
   - What we know: The shadcn sidebar includes this keyboard shortcut by default via `SIDEBAR_KEYBOARD_SHORTCUT = "b"` constant.
   - What's unclear: Whether this conflicts with any existing keyboard shortcuts in the app.
   - Recommendation: Keep the default. No known conflicts in the codebase. The shortcut is a UX enhancement that costs nothing. Verify it works during testing.

## Impact Analysis: Files Changed/Deleted

### Files to CREATE
| File | Purpose |
|------|---------|
| `components/ui/sidebar.tsx` | shadcn sidebar primitive (via CLI installation) |
| `components/layouts/app-sidebar.tsx` | Sidebar navigation component with nav items, logo, active state |

### Files to MODIFY
| File | Change |
|------|--------|
| `app/dashboard/layout.tsx` | Replace `AppLayout` import with sidebar shell |
| `app/habits/layout.tsx` | Replace `AppLayout` import with sidebar shell |
| `app/tasks/layout.tsx` | Replace `AppLayout` import with sidebar shell |
| `components/ui/sidebar.tsx` | Update width constants to match Phase 1 tokens |

### Files to DELETE
| File | Reason |
|------|--------|
| `components/layouts/app-layout.tsx` | Replaced by sidebar layout in each layout.tsx |
| `components/main-nav.tsx` | Replaced by navigation inside AppSidebar |
| `components/mobile-bottom-nav.tsx` | Replaced by sidebar's mobile Sheet |
| `tests/components/mobile-bottom-nav.test.tsx` | Component no longer exists |

### Tests to UPDATE
| File | Change |
|------|--------|
| `tests/accessibility/a11y.test.tsx` | Lines 130-137: Navbar test may need update (but Navbar is public landing page nav, separate from AppLayout) |
| New test file needed | `tests/components/layouts/app-sidebar.test.tsx` for the new sidebar component |

### i18n: No New Keys Needed
The sidebar reuses existing translation keys:
- `common.nav.dashboard` = "Dashboard"
- `common.nav.habits` = "Habits"
- `common.nav.tasks` = "Tasks"

These are already defined in all three locale files (en.json, zh.json, zh-TW.json).

## Sources

### Primary (HIGH confidence)
- shadcn/ui sidebar documentation via Context7 (`/shadcn-ui/ui`) -- component API, installation, SidebarProvider, SidebarMenuButton isActive, variants, cookie persistence pattern
- shadcn/ui sidebar source code (`apps/v4/registry/new-york-v4/ui/sidebar.tsx`) via WebFetch -- SIDEBAR_COOKIE_NAME, width constants, data attributes, SidebarInset implementation, mobile Sheet rendering
- Codebase inspection: `app/globals.css`, `tailwind.config.ts`, `components.json`, `components/ui/sheet.tsx`, `components/ui/tooltip.tsx`, `hooks/use-mobile.ts`, `components/layouts/app-layout.tsx`, `components/main-nav.tsx`, `components/mobile-bottom-nav.tsx`, all three layout.tsx files, `i18n/messages/en.json` -- direct file reads
- Phase 1 research and summaries: `01-RESEARCH.md`, `01-02-SUMMARY.md`, `DESIGN-TOKENS.md` -- established token values and patterns
- Chameleon screenshots: `chameleon-sidebar.png`, `chameleon-home-full.png` -- visual analysis of sidebar design reference

### Secondary (MEDIUM confidence)
- Prior architecture research: `.planning/research/ARCHITECTURE.md` -- sidebar layout shell pattern, route group vs existing layouts decision
- Prior pitfalls research: `.planning/research/PITFALLS.md` -- dual-nav state, client component boundary, content width regression
- shadcn/ui official docs via WebFetch (`ui.shadcn.com/docs/components/sidebar`) -- variant descriptions, width customization, SidebarTrigger

### Tertiary (LOW confidence)
- `components.json` `config: ""` impact on CLI installation -- untested; may or may not affect generated code style. Needs validation at install time.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- shadcn sidebar is official, well-documented, all dependencies already installed
- Architecture: HIGH -- verified against codebase structure, layout patterns, and existing research
- Chameleon reference: HIGH -- direct screenshot analysis with clear visual properties
- Pitfalls: HIGH -- verified against actual codebase state (pb-20 padding, dual nav, test files)
- Width constant alignment: MEDIUM -- Phase 1 tokens vs shadcn defaults need post-install manual update
- `components.json` config issue: LOW -- needs validation during installation

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain; shadcn sidebar component is mature)
