# Architecture Research: Sidebar + Card-on-Gray Layout Redesign

**Domain:** SaaS dashboard UI layout (Next.js App Router + shadcn/ui)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+---------------------------------------------------------------------+
|                         RootLayout (server)                         |
|  app/layout.tsx -- ThemeProvider, NextIntlClientProvider, fonts      |
+---------------------------------------------------------------------+
        |
        +-- Auth pages (app/auth/*) -- no sidebar, standalone layouts
        |
        +-- Landing page (app/page.tsx) -- no sidebar, public layout
        |
+---------------------------------------------------------------------+
|              Authenticated Layout (app/dashboard/layout.tsx)         |
|                                                                     |
|  +---------------------------------------------------------------+  |
|  |                 SidebarProvider (client)                       |  |
|  |    defaultOpen={cookieValue}                                  |  |
|  |                                                               |  |
|  |  +------------------+  +-----------------------------------+  |  |
|  |  |   AppSidebar     |  |        SidebarInset               |  |  |
|  |  |   (client)       |  |        (main content area)        |  |  |
|  |  |                  |  |                                   |  |  |
|  |  | +- SidebarHeader |  |  +- PageHeader (SidebarTrigger    |  |  |
|  |  | |  Logo + Toggle |  |  |   + Breadcrumb)                |  |  |
|  |  | +- SidebarContent|  |  +- Page Content ({children})     |  |  |
|  |  | |  NavGroups     |  |  |   wrapped in card-on-gray      |  |  |
|  |  | |  NavItems      |  |  |   container                    |  |  |
|  |  | +- SidebarFooter |  |  +-------------------------------+  |  |
|  |  | |  User menu     |  |                                   |  |  |
|  |  | |  Theme/Lang    |  |                                   |  |  |
|  |  +------------------+  +-----------------------------------+  |  |
|  +---------------------------------------------------------------+  |
+---------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `SidebarProvider` | Manages collapse/expand state, cookie persistence, mobile detection | shadcn/ui primitive; wraps the entire authenticated shell |
| `AppSidebar` | Navigation links, branding, user menu, theme/language controls | Client component; replaces current `MainNav` + `MobileBottomNav` |
| `SidebarInset` | Main content container; creates the card-on-gray visual effect | shadcn/ui primitive; receives `variant="inset"` styling from peer sidebar |
| `PageHeader` | Per-page header strip with `SidebarTrigger`, breadcrumbs, page actions | Client component; replaces current sticky header bar |
| `AppLayout` (retired) | Currently holds top-nav + mobile bottom nav | **Deleted**; replaced by the sidebar layout pattern above |

## Recommended Project Structure

```
app/
  layout.tsx                  # Root: fonts, ThemeProvider, NextIntlClientProvider
  page.tsx                    # Landing page (public, no sidebar)
  auth/
    layout.tsx                # Auth shell (centered form, no sidebar)
    login/page.tsx
    sign-up/page.tsx
    ...
  (dashboard)/                # Route group for authenticated pages
    layout.tsx                # SidebarProvider + AppSidebar + SidebarInset
    dashboard/
      page.tsx                # Dashboard page content
      settings/
        page.tsx              # Settings page content
    habits/
      page.tsx
      [id]/page.tsx
      [id]/edit/page.tsx
      new/page.tsx
    tasks/
      page.tsx
      [id]/page.tsx
      [id]/edit/page.tsx
      new/page.tsx

components/
  layouts/
    app-sidebar.tsx           # The sidebar component (nav items, user menu)
    sidebar-nav.tsx           # Navigation items configuration
    page-header.tsx           # SidebarTrigger + breadcrumb strip
  ui/
    sidebar.tsx               # shadcn/ui sidebar primitive (added via CLI)
    ...existing ui components
```

### Structure Rationale

- **Route group `(dashboard)/`:** Use a parenthesized route group to apply the sidebar layout to all authenticated pages without adding `/dashboard` as a URL prefix for habits and tasks. This is the key architectural change: currently `dashboard/`, `habits/`, and `tasks/` each import `AppLayout` separately in their own `layout.tsx` files. A route group unifies them under one layout.

- **Alternative: Keep current structure.** If the route group approach is too disruptive (URL changes, redirect updates needed in proxy), the simpler path is to replace the `AppLayout` import in each of the three existing `layout.tsx` files (`dashboard/layout.tsx`, `habits/layout.tsx`, `tasks/layout.tsx`) with the new sidebar shell. This avoids any URL or routing changes. **Recommendation: use this simpler approach** because the app already has working proxy redirects, test fixtures, and E2E paths tied to the current URL structure.

- **`app-sidebar.tsx` replaces `main-nav.tsx` + `mobile-bottom-nav.tsx`:** The shadcn sidebar handles both desktop and mobile (via Sheet drawer), so separate nav components are no longer needed.

- **`page-header.tsx`:** Lightweight client component containing `SidebarTrigger` (hamburger/collapse button) and optional breadcrumbs. Replaces the current sticky `<header>` in `app-layout.tsx`.

## Architectural Patterns

### Pattern 1: Sidebar Layout Shell with Cookie Persistence

**What:** Read sidebar open/closed state from a cookie in the server layout, pass as `defaultOpen` to `SidebarProvider`. The provider writes the cookie on state change.

**When to use:** Always, for the authenticated layout.

**Trade-offs:**
- Pro: No flash of wrong state on page load (SSR reads cookie before render)
- Pro: Zero client-side state initialization delay
- Con: Requires `await cookies()` which makes the layout dynamic (no static rendering)
- Con: Known Next.js 16 issue with Cache Components (#9189), but BetterR.Me does not use `dynamicIO` or Cache Components, so this is not a concern

**Example:**
```typescript
// app/(dashboard)/layout.tsx  OR  app/dashboard/layout.tsx (simpler approach)
import { cookies } from "next/headers";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function AuthenticatedLayout({
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
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Key detail:** Default to `true` (open) by checking `!== "false"` rather than `=== "true"`. First-time visitors with no cookie get an open sidebar, which is the expected default for desktop SaaS.

### Pattern 2: Card-on-Gray via `variant="inset"`

**What:** The sidebar's `variant="inset"` combined with `SidebarInset` creates the card-on-gray visual system automatically. The `SidebarProvider` gets `p-2` padding (revealing the page background as the "gray" area), and `SidebarInset` gets `rounded-xl shadow m-2` to look like a floating card.

**When to use:** This is the recommended approach for BetterR.Me's redesign.

**Trade-offs:**
- Pro: Zero custom CSS needed -- shadcn/ui handles the card-on-gray effect entirely via data attributes and peer selectors
- Pro: Responsive -- inset styling only applies at `md:` breakpoint; mobile gets full-width content
- Con: Known overflow bug (sidebar spacer `h-svh` + provider `p-2` = ~8px overflow). Fix: add `overflow-hidden` to the provider or adjust the spacer height
- Con: Individual page components should NOT wrap their content in additional Card components for the outer container (the SidebarInset IS the card). Inner content cards are fine.

**Example of the CSS variables needed (already in globals.css):**
```css
:root {
  --sidebar: hsl(0 0% 98%);
  --sidebar-foreground: hsl(240 5.3% 26.1%);
  --sidebar-primary: hsl(240 5.9% 10%);
  --sidebar-primary-foreground: hsl(0 0% 98%);
  --sidebar-accent: hsl(240 4.8% 95.9%);
  --sidebar-accent-foreground: hsl(240 5.9% 10%);
  --sidebar-border: hsl(220 13% 91%);
  --sidebar-ring: hsl(217.2 91.2% 59.8%);
}
```

**These already exist in `globals.css` (lines 72-92).** They were added but never used. The sidebar component will pick them up automatically.

### Pattern 3: Unified Mobile/Desktop Navigation via Sidebar

**What:** The shadcn sidebar handles mobile responsiveness internally by rendering inside a `Sheet` (slide-in drawer) when `isMobile` is true. This replaces the need for a separate `MobileBottomNav` component.

**When to use:** Always. The sidebar component detects the mobile breakpoint (768px) and switches behavior automatically.

**Trade-offs:**
- Pro: Single source of truth for navigation items
- Pro: Consistent behavior and animation
- Pro: Mobile drawer slides from left (standard SaaS pattern)
- Con: Loses the iOS-style bottom tab bar that the current design has. However, a sidebar drawer is the SaaS standard and more scalable for future nav items.
- Decision: Use sidebar drawer on mobile, retire `MobileBottomNav`. If bottom nav is still desired for mobile, it can coexist (sidebar for navigation tree, bottom nav for quick-access tabs), but this adds complexity without clear benefit for a 3-item nav.

### Pattern 4: Page Content Wrapper for Consistent Spacing

**What:** Each page's content should follow a consistent structure: page header strip (with trigger + breadcrumb) followed by a content area with standard padding.

**When to use:** Every authenticated page.

**Example:**
```typescript
// components/layouts/page-header.tsx
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface PageHeaderProps {
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}

export function PageHeader({ breadcrumbs, actions }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {breadcrumbs && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => (
              <BreadcrumbItem key={i}>
                {crumb.href ? (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
                {i < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      {actions && <div className="ml-auto">{actions}</div>}
    </header>
  );
}
```

**Page content structure (inside SidebarInset):**
```typescript
// A typical page component
<>
  <PageHeader breadcrumbs={[
    { label: "Dashboard", href: "/dashboard" },
    { label: "Habits" },
  ]} />
  <div className="flex-1 p-4 md:p-6">
    {/* Page-specific content */}
  </div>
</>
```

## Data Flow

### Sidebar State Flow

```
Cookie ("sidebar_state")
    |
    v (read on server)
Layout (server component)
    |
    | defaultOpen={cookieValue}
    v
SidebarProvider (client component)
    |
    |--- state: "expanded" | "collapsed"
    |--- open: boolean (desktop)
    |--- openMobile: boolean (mobile)
    |
    +---> AppSidebar (reads state via useSidebar())
    |       |--- Renders collapsed icons or full nav
    |       |--- On mobile: renders inside Sheet
    |
    +---> SidebarInset (reads state via CSS peer selectors)
    |       |--- Adjusts margin/width automatically
    |       |--- data-[state] for transition animations
    |
    +---> SidebarTrigger (calls toggleSidebar())
            |--- On click: toggles open state
            |--- Writes cookie: document.cookie = "sidebar_state=..."
```

### Navigation Data Flow

```
sidebar-nav.tsx (navigation configuration)
    |
    | navItems array with icons, labels, hrefs, i18n keys
    v
AppSidebar (client component)
    |
    | usePathname() for active state detection
    | useTranslations() for i18n labels
    v
SidebarMenu > SidebarMenuItem > SidebarMenuButton
    |
    | Each button wraps a Next.js <Link>
    | Active detection: pathname.startsWith(item.href)
    v
Router navigation (client-side)
```

### Key Data Flows

1. **Sidebar collapse persistence:** Server reads cookie -> passes `defaultOpen` -> client provider manages state -> writes cookie on toggle. Round-trip ensures no flash.

2. **Theme/language in sidebar footer:** `ThemeSwitcher` and `LanguageSwitcher` move from the top-right header area into the `SidebarFooter`. They remain client components. On collapsed sidebar, they can show icon-only via `group-data-[collapsible=icon]:hidden` on their labels.

3. **User profile in sidebar footer:** `ProfileAvatar` (currently a server component in the header) moves to `SidebarFooter`. Since the sidebar is a client component tree, the user data should be fetched at the layout level (server) and passed down as props, or the profile section should use a separate server component pattern (e.g., a server component wrapper that passes serialized data to the client sidebar).

## Component Boundaries & Build Order

### Build Order (Dependencies Flow Downward)

```
Phase 1: Foundation (must be first)
  |
  +-- Install shadcn sidebar component (npx shadcn add sidebar)
  +-- Update globals.css sidebar tokens to match emerald theme
  +-- Create app-sidebar.tsx (navigation items, basic structure)
  +-- Create page-header.tsx (SidebarTrigger + breadcrumb)
  |
Phase 2: Layout Shell (depends on Phase 1)
  |
  +-- Create new authenticated layout with SidebarProvider
  +-- Wire cookie persistence in layout
  +-- Replace AppLayout imports in dashboard/habits/tasks layout.tsx
  +-- Delete old app-layout.tsx, main-nav.tsx, mobile-bottom-nav.tsx
  |
Phase 3: Page Content Migration (depends on Phase 2)
  |
  +-- Update dashboard page to use PageHeader + content wrapper
  +-- Update habits pages (list, detail, new, edit)
  +-- Update tasks pages (list, detail, new, edit)
  +-- Update settings page
  |
Phase 4: Polish & Cleanup (depends on Phase 3)
  |
  +-- Move theme/language switchers into sidebar footer
  +-- Move user profile/avatar into sidebar footer
  +-- Add collapsible icon-only mode styling
  +-- Keyboard shortcut verification (Cmd+B / Ctrl+B)
  +-- Test pass: unit tests, E2E, visual regression
```

### What Changes First vs Last

| Order | Component | Reason |
|-------|-----------|--------|
| 1st | `sidebar.tsx` (UI primitive) | Foundation -- everything else depends on it |
| 2nd | `app-sidebar.tsx` | Navigation configuration -- needed before layout shell |
| 3rd | `page-header.tsx` | Lightweight, needed by all pages |
| 4th | Authenticated layout.tsx | The shell that ties sidebar + content together |
| 5th | Dashboard page | Highest-traffic page, validate pattern works |
| 6th | Habits pages | Apply pattern, verify sub-routes work |
| 7th | Tasks pages | Apply pattern |
| 8th | Settings page | Apply pattern |
| Last | Delete old components | Only after all pages migrated and tested |

## Anti-Patterns

### Anti-Pattern 1: Wrapping SidebarInset Content in a Full-Page Card

**What people do:** When switching to card-on-gray, developers wrap their entire page content in a `<Card>` component inside `SidebarInset`, creating a double-card appearance.

**Why it's wrong:** `SidebarInset` with `variant="inset"` already IS the card. Adding another Card creates nested borders, doubled padding, and visual noise.

**Do this instead:** Use `SidebarInset` as the card. Put content directly inside with standard padding (`p-4 md:p-6`). Use Card components only for interior content sections (stats cards, habit cards, etc.), not as the page wrapper.

### Anti-Pattern 2: Duplicating Navigation Config Across Desktop and Mobile

**What people do:** Define nav items separately in the sidebar component and in a mobile bottom nav, leading to config drift.

**Why it's wrong:** When a new page is added, developers update one but forget the other, causing broken mobile navigation.

**Do this instead:** Define navigation items once in `sidebar-nav.tsx` as a shared config array. The shadcn sidebar consumes it for both desktop and mobile (drawer) rendering automatically.

### Anti-Pattern 3: Making SidebarProvider a Client-Only Component

**What people do:** Put `SidebarProvider` in a client component and read sidebar state from localStorage on mount, causing a flash of incorrect layout.

**Why it's wrong:** On first render, the sidebar shows as open/closed based on default, then jumps to the stored state after hydration. This causes layout shift.

**Do this instead:** Read the cookie in the server layout component using `await cookies()` and pass `defaultOpen` to `SidebarProvider`. The server renders the correct initial state, eliminating flash.

### Anti-Pattern 4: Putting SidebarProvider in the Root Layout

**What people do:** Put `SidebarProvider` in `app/layout.tsx` so it wraps everything, including auth pages and the landing page.

**Why it's wrong:** Auth pages and the landing page don't need a sidebar. Wrapping them causes unnecessary sidebar state management, potential layout interference, and wasted rendering.

**Do this instead:** Put `SidebarProvider` in the authenticated layout only (`app/dashboard/layout.tsx` or a route group layout). The root layout stays clean with only ThemeProvider and NextIntlClientProvider.

### Anti-Pattern 5: Sidebar State in React Context Instead of Cookie

**What people do:** Create a custom React context for sidebar state and persist to localStorage.

**Why it's wrong:** shadcn's `SidebarProvider` already manages this with cookie-based persistence. Adding a second state management layer creates conflicts, race conditions, and makes the cookie the provider writes meaningless.

**Do this instead:** Use shadcn's built-in `SidebarProvider` state. Access it via `useSidebar()` hook. The cookie persistence is handled automatically.

## Scaling Considerations

Not applicable to this UI layout redesign. The sidebar is a purely presentational concern that does not affect backend scaling. The component renders identically regardless of user count.

| Concern | At any scale | Notes |
|---------|-------------|-------|
| Sidebar render performance | Negligible | ~10 nav items, no virtualization needed |
| Cookie persistence | Works at any scale | Client-side cookie, no server storage |
| Mobile drawer | Standard Sheet component | No performance concerns |

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| next-themes | `ThemeSwitcher` moves to sidebar footer | No API change, just DOM location change |
| next-intl | `LanguageSwitcher` moves to sidebar footer | No API change |
| Supabase auth | User profile data passed from server layout to sidebar | Already fetched in layout; pass as props |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Layout -> Sidebar | Props (`defaultOpen` via cookie, user data) | Server-to-client data flow |
| Sidebar -> Pages | CSS peer selectors (`data-[state]`, `data-[variant]`) | No JS communication needed for layout adjustment |
| SidebarTrigger -> SidebarProvider | `useSidebar()` hook (`toggleSidebar()`) | Context-based, automatic |
| Pages -> PageHeader | Props (breadcrumbs, actions) | Simple prop drilling |
| Navigation config -> Sidebar | Shared `navItems` array import | Static config, not runtime data |

## Migration Strategy: Current Layout to Sidebar Layout

### What Gets Replaced

| Current Component | Replacement | Notes |
|-------------------|-------------|-------|
| `components/layouts/app-layout.tsx` | Sidebar layout in `layout.tsx` | Delete after migration |
| `components/main-nav.tsx` | Navigation inside `AppSidebar` | Delete after migration |
| `components/mobile-bottom-nav.tsx` | Sidebar Sheet (mobile drawer) | Delete after migration |
| Top-right theme/language/profile controls | `SidebarFooter` contents | Move, not delete |
| Sticky header with logo | `SidebarHeader` (logo) + `PageHeader` (trigger) | Split into two concerns |

### What Stays The Same

| Component | Why |
|-----------|-----|
| `app/layout.tsx` (root) | No change -- ThemeProvider, fonts, NextIntl stay here |
| Auth pages (`app/auth/*`) | No sidebar; independent layout |
| Landing page (`app/page.tsx`) | No sidebar; independent layout |
| All page content components | Only their outer container changes, not internal structure |
| Dashboard content, habit cards, task cards | Internal component structure unchanged |
| `components/ui/*` (shadcn primitives) | Only addition: `sidebar.tsx` via CLI |

### CSS Token Updates for Brand Alignment

The existing sidebar CSS tokens in `globals.css` use the default shadcn blue/gray palette. They should be updated to match BetterR.Me's emerald brand:

```css
:root {
  --sidebar: hsl(0 0% 98%);                    /* Keep: light sidebar background */
  --sidebar-foreground: hsl(240 5.3% 26.1%);   /* Keep: dark text on light sidebar */
  --sidebar-primary: hsl(160 84% 39%);          /* Change: emerald-600 (brand primary) */
  --sidebar-primary-foreground: hsl(0 0% 100%); /* Change: white on emerald */
  --sidebar-accent: hsl(160 84% 97%);           /* Change: emerald-50 tint for hovers */
  --sidebar-accent-foreground: hsl(160 84% 20%);/* Change: dark emerald for accent text */
  --sidebar-border: hsl(220 13% 91%);           /* Keep: subtle border */
  --sidebar-ring: hsl(160 84% 39%);             /* Change: emerald focus ring */
}

.dark {
  --sidebar: hsl(0 0% 7%);                     /* Slightly lighter than background */
  --sidebar-foreground: hsl(240 4.8% 95.9%);   /* Keep: light text on dark sidebar */
  --sidebar-primary: hsl(142 71% 45%);          /* Change: emerald-500 (dark mode primary) */
  --sidebar-primary-foreground: hsl(0 0% 100%); /* White on emerald */
  --sidebar-accent: hsl(142 71% 15%);           /* Dark emerald tint for hovers */
  --sidebar-accent-foreground: hsl(142 71% 85%);/* Light emerald for accent text */
  --sidebar-border: hsl(240 3.7% 15.9%);       /* Keep: dark border */
  --sidebar-ring: hsl(142 71% 45%);             /* Change: emerald focus ring */
}
```

## Sources

- [shadcn/ui Sidebar documentation](https://ui.shadcn.com/docs/components/radix/sidebar) -- HIGH confidence. Official component docs with API reference, examples, and CSS variable list.
- [shadcn/ui Sidebar Blocks](https://ui.shadcn.com/blocks/sidebar) -- HIGH confidence. Official pre-built sidebar layout examples showing SidebarInset patterns.
- [shadcn/ui Changelog](https://ui.shadcn.com/docs/changelog) -- HIGH confidence. Tracks sidebar component updates including Tailwind v4 compatibility.
- [Next.js 16 cookie issue (#9189)](https://github.com/shadcn-ui/ui/issues/9189) -- HIGH confidence. Documents Cache Components conflict; not applicable to BetterR.Me since `dynamicIO` is not enabled.
- [SidebarInset overflow bug (#7947)](https://github.com/shadcn-ui/ui/issues/7947) -- MEDIUM confidence. Known 8px overflow with `variant="inset"`; fixable with CSS.
- [Vercel Admin Dashboard Template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) -- MEDIUM confidence. Reference implementation of sidebar + card-on-gray with Next.js 16.
- [Cookie persistence approach (v3 docs)](https://v3.shadcn.com/docs/components/sidebar) -- HIGH confidence. Shows the `await cookies()` pattern for server-side state reading.
- Existing codebase analysis (app-layout.tsx, globals.css, layout files) -- HIGH confidence. Direct inspection of current architecture.

---
*Architecture research for: BetterR.Me sidebar + card-on-gray layout redesign*
*Researched: 2026-02-15*
