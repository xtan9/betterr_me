# Phase 3: Sidebar Collapse & Persistence - Research

**Researched:** 2026-02-16
**Domain:** shadcn/ui Sidebar collapsible modes, CSS transitions, cookie persistence, hover-triggered overlay sidebar
**Confidence:** HIGH

## Summary

Phase 3 adds collapse/expand behavior to the existing sidebar from Phase 2. The core interaction is a pin/unpin toggle button at the top of the sidebar. When **pinned**, the sidebar remains expanded (full width at 12.5rem) and pushes content to the right. When **unpinned**, the sidebar fully hides (not an icon rail -- completely hidden) and can be temporarily revealed by hovering over a narrow trigger zone on the left edge of the viewport. The revealed sidebar overlays content (no layout shift) and dismisses instantly on mouse leave.

The shadcn/ui Sidebar component provides strong infrastructure for this but does not natively support the exact pin/unpin + auto-hide-on-hover pattern. The `collapsible="offcanvas"` mode handles the "fully hidden" state (sets sidebar gap to `w-0` and positions the sidebar off-screen via negative `left`), and the existing `SidebarProvider` manages the `open` boolean + `sidebar_state` cookie. The missing piece is the **hover trigger zone** for revealing the sidebar as an overlay when unpinned, and the **pin state** tracking (distinct from open/closed). This requires custom state management layered on top of the existing shadcn primitives -- specifically: (1) a `pinned` boolean persisted to a cookie, (2) a hover trigger zone `<div>` on the left edge, (3) mouse enter/leave handlers that temporarily set `open=true` while hovering, and (4) CSS overrides to make the revealed sidebar overlay rather than push content.

The implementation can be done **without modifying `components/ui/sidebar.tsx`** (the shadcn managed file). All customization lives in `AppSidebar`, `SidebarShell`, and potentially a new `useSidebarPin` hook. The shadcn sidebar's data attributes (`data-state`, `data-collapsible`) and CSS classes already handle the visual transitions; we layer pin/unpin state on top.

**Primary recommendation:** Add a `pinned` state (cookie-persisted, server-read) to the sidebar architecture. When pinned, render `<Sidebar collapsible="offcanvas">` (current default) with `open=true`. When unpinned, set `open=false` and add a hover trigger zone div that temporarily expands the sidebar as a fixed overlay. Use `collapsible="offcanvas"` for the unpinned mode so the gap collapses to zero. All animation comes from the existing CSS transition classes already in `sidebar.tsx` (`transition-[left,right,width] duration-200 ease-linear`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pin/unpin toggle button at the **top of the sidebar** (above the nav list), matching Chameleon's placement
- Button shows tooltip "Unpin" when pinned, "Pin" when unpinned
- Toggle button has pressed/unpressed state for accessibility (aria-pressed)
- Collapsed width: **~4rem** (standard icon rail, comfortable icon size with padding)
- Hovering nav icons shows **tooltip with the label** (nav item name)
- A **compact icon/logo** remains visible at the top in collapsed mode (not hidden)
- When unpinned: sidebar is fully hidden (not showing icon rail)
- Hover trigger zone: **~20-24px wide strip** on the left edge of the viewport
- Reveal: **instant** (0ms delay) -- no hover delay before sidebar appears
- Sidebar **overlays on top of content** (content stays put, no push/resize)
- Dismiss: **instant on mouse leave** -- sidebar hides immediately when cursor exits
- Easing: **smooth ease-in-out** for expand/collapse
- Duration: **fast (~150-200ms)** -- snappy, not sluggish
- Pin state change persists to cookie and triggers the appropriate animation
- Collapse/pin state stored in cookie (matching Phase 2's existing sidebar_state cookie pattern)
- No flash of wrong state on page load -- server reads cookie to set initial state

### Claude's Discretion
- Label animation approach during collapse (fade-then-shrink vs clip overflow)
- Whether main content area resizes with animation or snaps to new width when pinned sidebar toggles
- Exact CSS transition timing function values
- Input focus handling for any future keyboard shortcut

### Deferred Ideas (OUT OF SCOPE)
- SIDE-12 (Cmd/Ctrl+B keyboard shortcut) -- **dropped entirely** per user decision, not deferred to another phase
</user_constraints>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Sidebar | installed (Phase 2) | Sidebar primitive with collapsible modes, data attributes, cookie persistence | Already in place; provides `collapsible="offcanvas"` mode, `useSidebar()` hook, `SidebarProvider` with `open`/`setOpen` |
| Radix UI Tooltip | installed | Tooltips for pin button and collapsed nav icons | Already used by `SidebarMenuButton` tooltip prop; reuse for pin button |
| lucide-react | ^0.511.0 | Pin/unpin icons (`Pin`, `PinOff` or similar) | Already installed; consistent with existing nav icons |
| next-intl | installed | i18n for "Pin"/"Unpin" tooltip labels | Already used in AppSidebar for nav labels |
| next/headers cookies | built-in | Server-side cookie reading for SSR pin state | Already used in SidebarShell for `sidebar_state` cookie |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cookies()` from `next/headers` | built-in | Read `sidebar_pinned` cookie on server for SSR | In `SidebarShell` to determine initial pin state, preventing flash |
| `document.cookie` | browser API | Write `sidebar_pinned` cookie on pin/unpin toggle | In the pin toggle handler, same pattern as existing `sidebar_state` cookie |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom pin state + hover trigger | shadcn `collapsible="icon"` mode | Icon mode shows a permanent icon rail, user wants fully hidden when unpinned. Icon mode does not support hover-reveal overlay. |
| Custom hover trigger div | `SidebarRail` component | SidebarRail is a drag/click toggle rail on the sidebar edge. Not a hover trigger zone. Does not support auto-hide/reveal. |
| Cookie for pin state | localStorage | Cookie is readable server-side (prevents flash). localStorage requires client-side hydration, causing flash of wrong state. Cookie is the correct choice. |
| New `sidebar_pinned` cookie | Reuse existing `sidebar_state` cookie | Possible to encode both states in one cookie (e.g., `"pinned"`, `"unpinned"`), but keeping them separate is simpler and avoids coupling. The `sidebar_state` cookie is managed by shadcn's `SidebarProvider` internally (writes `true`/`false` on every toggle). A separate `sidebar_pinned` cookie avoids interfering with shadcn's internal cookie management. |

### Installation

No new packages needed. All dependencies are already installed from Phase 2.

## Architecture Patterns

### State Model

The sidebar has a **two-dimensional state** in Phase 3:

```
             Pinned                    Unpinned
             ------                    --------
Desktop:     Sidebar visible           Sidebar hidden
             Full width (12.5rem)      Hover trigger zone visible (20-24px)
             Pushes content            Content fills full width
             Cookie: pinned=true       Cookie: pinned=false

Hover:       N/A (always visible)      Sidebar appears as overlay
                                       Fixed position, z-index above content
                                       Instant reveal, instant dismiss

Mobile:      Same as Phase 2           Same as Phase 2
             (Sheet/drawer)            (Sheet/drawer, pin state ignored)
```

The existing shadcn `open`/`state` (expanded/collapsed) maps to:
- **Pinned**: `open=true`, `state="expanded"`, `collapsible="offcanvas"` (but never collapses)
- **Unpinned resting**: `open=false`, `state="collapsed"`, `collapsible="offcanvas"` (fully hidden)
- **Unpinned hovering**: `open=true` temporarily, sidebar fixed-position overlay, content unchanged

### Recommended Approach: Controlled SidebarProvider + Pin State

**What:** Use `SidebarProvider`'s controlled mode (`open` + `onOpenChange` props) so the shell component manages both pin state and open state. The pin state is a separate boolean that determines behavior.

**Why controlled mode:** The uncontrolled mode (`defaultOpen`) writes to cookie on every toggle via `document.cookie`. In Phase 3, we need to differentiate between "user pinned/unpinned" (persisted) and "hover reveal/dismiss" (temporary). Controlled mode lets us intercept `onOpenChange` and decide whether to persist.

**Architecture:**

```
SidebarShell (server component)
  |-- reads sidebar_pinned cookie
  |-- passes defaultPinned to SidebarLayout
  |
  SidebarLayout (client component, NEW)
    |-- manages: pinned (boolean, cookie-persisted)
    |-- manages: hoverOpen (boolean, NOT persisted)
    |-- derives: open = pinned || hoverOpen
    |-- renders SidebarProvider with controlled open
    |-- renders hover trigger zone when !pinned
    |
    SidebarProvider (open={open}, onOpenChange={...})
      |-- AppSidebar (pin toggle button in SidebarHeader)
      |-- SidebarInset (content area)
```

### Pattern 1: SidebarShell with Pin State (Server Component)

**What:** The server component reads the `sidebar_pinned` cookie and passes it as a prop to a client layout wrapper.

**When to use:** The entry point for all authenticated layouts.

**Example:**
```typescript
// components/layouts/sidebar-shell.tsx (server component)
import { cookies } from "next/headers";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";

export async function SidebarShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const pinnedCookie = cookieStore.get("sidebar_pinned")?.value;
  // Default to pinned (true) for first-time visitors
  const defaultPinned = pinnedCookie !== "false";

  return (
    <SidebarLayout defaultPinned={defaultPinned}>
      {children}
    </SidebarLayout>
  );
}
```

### Pattern 2: SidebarLayout Client Component (State Management Hub)

**What:** A client component that owns pin state, hover state, and wires the controlled `SidebarProvider`.

**When to use:** Wraps `SidebarProvider` and manages the two-dimensional state.

**Example:**
```typescript
// components/layouts/sidebar-layout.tsx (client component)
"use client";

import React, { useState, useCallback } from "react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";

const SIDEBAR_PINNED_COOKIE = "sidebar_pinned";
const SIDEBAR_PINNED_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function SidebarLayout({
  defaultPinned,
  children,
}: {
  defaultPinned: boolean;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(defaultPinned);
  const [hoverOpen, setHoverOpen] = useState(false);

  // Derived open state: open if pinned OR hover-revealed
  const open = pinned || hoverOpen;

  const handleTogglePin = useCallback(() => {
    const newPinned = !pinned;
    setPinned(newPinned);
    document.cookie = `${SIDEBAR_PINNED_COOKIE}=${newPinned}; path=/; max-age=${SIDEBAR_PINNED_MAX_AGE}`;

    // When unpinning, also dismiss the sidebar
    if (!newPinned) {
      setHoverOpen(false);
    }
  }, [pinned]);

  const handleMouseEnter = useCallback(() => {
    if (!pinned) {
      setHoverOpen(true);
    }
  }, [pinned]);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      setHoverOpen(false);
    }
  }, [pinned]);

  // Prevent SidebarProvider from writing its own cookie
  // by using controlled mode
  const handleOpenChange = useCallback((newOpen: boolean) => {
    // Only respond to mobile sheet open/close
    // Desktop state is managed by pin + hover
  }, []);

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <AppSidebar
        pinned={pinned}
        onTogglePin={handleTogglePin}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      {/* Hover trigger zone -- visible only when unpinned */}
      {!pinned && !hoverOpen && (
        <div
          className="fixed inset-y-0 left-0 z-20 w-5 md:block hidden"
          onMouseEnter={handleMouseEnter}
          aria-hidden="true"
        />
      )}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="font-display font-bold text-lg text-primary">
            BetterR.me
          </span>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

### Pattern 3: Pin Toggle Button in AppSidebar Header

**What:** The pin/unpin button sits at the top of the sidebar, above the nav list, with tooltip and aria-pressed.

**When to use:** Always rendered inside `SidebarHeader`.

**Example:**
```typescript
// Inside AppSidebar component
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// In SidebarHeader:
<SidebarHeader>
  <div className="flex items-center justify-between px-2 py-1">
    <span className="font-display font-bold text-lg text-primary">
      BetterR.me
    </span>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? t("unpin") : t("pin")}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-sidebar-accent"
        >
          {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {pinned ? t("unpin") : t("pin")}
      </TooltipContent>
    </Tooltip>
  </div>
</SidebarHeader>
```

### Pattern 4: Overlay Mode for Unpinned Hover-Reveal

**What:** When the sidebar is revealed via hover (unpinned), it must overlay content rather than push it. This requires CSS overrides on the sidebar's gap div.

**When to use:** When `!pinned && hoverOpen`.

**How it works with existing shadcn classes:**

The shadcn `Sidebar` component renders two key divs on desktop:
1. **Gap div** (the spacer): `relative w-[--sidebar-width] bg-transparent transition-[width]` -- this is what pushes content right
2. **Fixed sidebar div**: `fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width]` -- this is the actual visible sidebar

For overlay mode, the **gap div must remain at `w-0`** while the **fixed sidebar div is visible**. The `collapsible="offcanvas"` mode already sets `group-data-[collapsible=offcanvas]:w-0` on the gap div and `group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]` on the fixed div.

When `open=true` + unpinned: The sidebar is `state="expanded"`, so `data-collapsible=""` (empty string), and the gap div expands to `w-[--sidebar-width]`, pushing content. **This is the problem** -- we need the sidebar visible but the gap at zero.

**Solution approaches:**

**Approach A: CSS class override on the wrapper.**
Pass a prop or data attribute (e.g., `data-overlay="true"`) to the SidebarProvider wrapper div when in hover-overlay mode. Use this to override the gap div width:

```css
/* In the SidebarLayout, add a className to SidebarProvider when overlay */
[data-overlay="true"] .group.peer [data-state="expanded"] > div:first-child {
  width: 0 !important;
}
```

This is brittle (targets internal DOM structure).

**Approach B: Conditionally pass `collapsible` prop to `<Sidebar>`.**
Switch between `collapsible="offcanvas"` (when unpinned, gap collapses to 0) and keep `open=true` for the fixed sidebar to be visible. But when `state="expanded"` and `collapsible="offcanvas"`, the gap div still expands because `data-collapsible` is only set when `state === "collapsed"`.

**Approach C (Recommended): Use the `style` prop to override `--sidebar-width` to `0px` on the SidebarProvider when in overlay mode.**
The gap div uses `w-[--sidebar-width]`. If we set `--sidebar-width: 0px` in overlay mode on the provider, the gap collapses to 0, but the fixed sidebar div also uses `w-[--sidebar-width]`, so it would also be 0.

**Approach D (Recommended): Add a simple wrapper div with `onMouseEnter`/`onMouseLeave` around the Sidebar, and use `position: fixed` with explicit width.**
Instead of fighting shadcn's internal CSS, wrap the `<Sidebar>` in a container that:
- When pinned: renders normally (no wrapper interference)
- When unpinned + hoverOpen: adds `fixed left-0 top-0 h-full z-30 w-[--sidebar-width] shadow-lg` styles, making the sidebar overlay regardless of its internal gap div behavior. The sidebar renders but the gap div is hidden behind the overlay.

**Approach E (Simplest, Recommended): Don't use SidebarProvider's open for hover. Instead, toggle CSS visibility/transform directly.**
Keep `SidebarProvider open={pinned}` (so when unpinned, `state="collapsed"`, `data-collapsible="offcanvas"`, gap=0, sidebar off-screen). For hover reveal, use a CSS class on the sidebar wrapper that overrides `left: calc(var(--sidebar-width) * -1)` to `left: 0` with a transition. Add `z-index: 30` and `box-shadow` for overlay effect.

This approach is cleanest because:
- SidebarProvider's `open` state correctly reflects the pinned state
- Cookie persistence works automatically via shadcn's built-in cookie mechanism (open=pinned)
- Hover reveal is purely CSS (transform/left override) -- no React state causing re-renders
- The gap div stays at `w-0` (offcanvas collapsed) while hover CSS moves the fixed sidebar into view

**Implementation sketch for Approach E:**
```typescript
// The sidebar wrapper gets a data attribute:
<div
  data-sidebar-overlay={!pinned && hoverOpen ? "true" : undefined}
  onMouseEnter={handleMouseEnter}
  onMouseLeave={handleMouseLeave}
>
  <Sidebar collapsible="offcanvas" />
</div>

// CSS (in globals.css or inline):
// When overlay is active, override the sidebar's left position
[data-sidebar-overlay="true"] [data-state="collapsed"][data-collapsible="offcanvas"] > div:last-child {
  left: 0 !important;
  z-index: 30;
  box-shadow: 4px 0 12px rgba(0,0,0,0.1);
}
```

Wait -- when `state="collapsed"` and `collapsible="offcanvas"`, the fixed div has `left: calc(var(--sidebar-width) * -1)` which hides it. We need to override this to `left: 0` for the hover reveal. But this relies on internal DOM structure.

**Final Recommended Approach: Controlled mode + managed CSS class.**

After analyzing all approaches, the cleanest pattern is:

1. Use **controlled mode** on `SidebarProvider` with `open={pinned}` for normal state
2. For hover reveal: directly apply CSS to the `<Sidebar>`'s outer wrapper div using `className` prop
3. The `<Sidebar>` component accepts `className` which gets applied to the fixed sidebar div
4. When hovering (unpinned), pass a class that overrides `left` from `-12.5rem` to `0` via a utility class or inline style

Actually, looking at the Sidebar source code again carefully:

```tsx
// Line 228: The outer wrapper div
<div
  ref={ref}
  className="group peer hidden text-sidebar-foreground md:block"
  data-state={state}
  data-collapsible={state === "collapsed" ? collapsible : ""}
  data-variant={variant}
  data-side={side}
>
```

The `className` prop gets applied to the **fixed inner div** (line 246-256), NOT to this outer wrapper. So we can't easily override the outer wrapper's data-driven CSS via the `className` prop.

**Truly Final Approach:** Use a wrapper `<div>` around `<Sidebar>` with mouse events and a `data-sidebar-hover` attribute. Style the override in `globals.css`:

```css
/* Override offcanvas hidden state when hover-revealing */
[data-sidebar-hover="true"] [data-state="collapsed"][data-collapsible="offcanvas"] > .fixed {
  left: 0;
  z-index: 30;
  box-shadow: var(--sidebar-overlay-shadow);
  transition: left 150ms ease-in-out;
}
```

This is still somewhat brittle but acceptable since it targets specific data attributes that are stable API.

### Anti-Patterns to Avoid

- **Modifying `components/ui/sidebar.tsx`:** This is a shadcn managed file. All customization should be done via props, className, CSS overrides, or wrapper components. The only exception from Phase 2 was aligning width constants, which is a configuration adjustment. Phase 3 should NOT add custom logic to sidebar.tsx.

- **Using `collapsible="icon"` for the unpinned state:** The user explicitly decided "When unpinned: sidebar is fully hidden (not showing icon rail)." The icon mode would show a 48px rail, which contradicts the decision.

- **Persisting hover state to cookie:** The hover-reveal state is temporary and must NOT be written to the cookie. Only the pin/unpin state persists. If using controlled `SidebarProvider`, be careful that `onOpenChange` does not trigger cookie writes for hover toggles.

- **Using `localStorage` instead of cookies for pin state:** Cookies are readable server-side, preventing flash of wrong state. localStorage requires client-side hydration.

- **Adding delay to hover reveal/dismiss:** User explicitly decided "instant (0ms delay)" for both reveal and dismiss. Do not add `setTimeout` or CSS transition-delay for the hover trigger.

- **Dual cookie confusion:** Don't try to encode pin state into the existing `sidebar_state` cookie that shadcn manages internally. Use a separate `sidebar_pinned` cookie. When using controlled mode, shadcn's internal cookie write is bypassed (the `onOpenChange` callback handles it, or the internal `setOpen` doesn't fire).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar show/hide animation | Custom CSS animation keyframes | shadcn's existing `transition-[left,right,width] duration-200 ease-linear` classes | Already built into sidebar.tsx; consistent with framework |
| Tooltip for pin button | Custom hover tooltip | Radix Tooltip (already used by SidebarMenuButton) | Accessible, positioned, keyboard-navigable |
| Cookie read on server | Manual `request.headers.cookie` parsing | `cookies()` from `next/headers` | Already used in SidebarShell; handles encoding, type safety |
| Cookie write on client | Full cookie library | `document.cookie = ...` string | Same pattern used by shadcn SidebarProvider internally (line 93) |
| Mobile breakpoint detection | Custom media query | `useIsMobile()` hook (already exists) | Used by SidebarProvider; consistent 768px breakpoint |
| Tooltip on collapsed nav icons | Custom tooltip component | `SidebarMenuButton tooltip` prop | Already configured in Phase 2's AppSidebar; shows only when `state === "collapsed"` |

**Key insight:** The shadcn sidebar component already handles all animation and transition logic for expand/collapse via CSS. The pin/unpin feature layers on top of this -- it controls WHEN the sidebar is expanded vs collapsed, not HOW it animates.

## Common Pitfalls

### Pitfall 1: Flash of Wrong Pin State (FOUC)
**What goes wrong:** On page load, the sidebar briefly shows as pinned before JavaScript reads the unpinned state and hides it (or vice versa).
**Why it happens:** If pin state is stored in localStorage or only read on client, the server-rendered HTML defaults to pinned, and then client hydration corrects it.
**How to avoid:** Store pin state in a **cookie** (`sidebar_pinned`). Read it in the **server component** (`SidebarShell`) via `await cookies()`. Pass the initial state as a prop to the client layout component. The server-rendered HTML already has the correct state.
**Warning signs:** Sidebar flickers on page load; brief layout shift as sidebar appears/disappears.

### Pitfall 2: Cookie Write Conflict with shadcn Internal Cookie
**What goes wrong:** When using controlled `SidebarProvider` (`open` + `onOpenChange`), the provider's internal `setOpen` callback still writes to `document.cookie` because the `setOpen` function unconditionally writes the cookie (sidebar.tsx line 93).
**Why it happens:** In controlled mode, `openProp` is provided, but the `setOpen` callback still calls `setOpenProp(openState)` AND writes the cookie. When hover toggles the open state rapidly, the `sidebar_state` cookie gets overwritten with `true`/`false` values that don't reflect the actual pin state.
**How to avoid:** When using controlled mode, the `onOpenChange` callback IS the `setOpenProp`. The internal `_setOpen` is bypassed. But the cookie write in `setOpen` still fires. To prevent cookie pollution from hover toggles: either (1) override `onOpenChange` to only write cookie when the pin button is clicked, not during hover, or (2) ignore the `sidebar_state` cookie entirely and manage state exclusively via the `sidebar_pinned` cookie.
**Warning signs:** `sidebar_state` cookie oscillates between `true` and `false` on every hover. Page reloads show wrong state.

**Recommended mitigation:** Do NOT use controlled mode on SidebarProvider for the hover reveal. Instead:
1. Set `SidebarProvider defaultOpen={pinned}` (uncontrolled mode, initial state from cookie)
2. When the pin toggle is clicked, use `useSidebar().setOpen()` to change state (this writes the cookie correctly)
3. For hover reveal, bypass SidebarProvider state entirely and use CSS-only approach (override the sidebar's `left` position via a data attribute on a wrapper div)

This avoids the controlled-mode cookie conflict entirely.

### Pitfall 3: Hover Trigger Zone Blocks Click Events
**What goes wrong:** The invisible 20-24px hover trigger zone on the left edge intercepts click events meant for content below it (especially on touch devices or when content has clickable elements near the left edge).
**Why it happens:** A div with `position: fixed; left: 0; width: 20px; height: 100vh` sits on top of page content.
**How to avoid:** Set `pointer-events: none` on the trigger zone and use `pointer-events: auto` only within an inner invisible `onMouseEnter` target. Or: only render the trigger zone on desktop (`hidden md:block`). Or: use a very thin width (20px) and ensure the trigger zone has no visual presence. The trigger zone should also be `aria-hidden="true"` since it has no semantic meaning.
**Warning signs:** Users on desktop can't click elements near the left edge of the content area; scrollbars near left edge are unresponsive.

### Pitfall 4: Transition Duration Mismatch
**What goes wrong:** The sidebar expand/collapse animation feels inconsistent -- the sidebar slides in at one speed but the content area resizes at a different speed, or the overlay shadow appears before the sidebar is fully visible.
**Why it happens:** The shadcn sidebar has `duration-200 ease-linear` on both the gap div and the fixed sidebar div. If custom CSS overrides use different duration/easing values, they get out of sync.
**How to avoid:** Match the user's specified duration (~150-200ms) and easing (ease-in-out) on ALL animated properties: the sidebar's `left` or `transform`, the gap div's `width`, and any shadow/overlay opacity. The existing shadcn code uses `duration-200 ease-linear`; update to `duration-150 ease-in-out` (or `duration-200 ease-in-out`) for consistency.
**Warning signs:** Visual "jank" during transitions; sidebar and content don't move in sync.

### Pitfall 5: Pin Button Not Accessible
**What goes wrong:** Screen readers cannot determine pin state; keyboard users cannot reach or activate the pin button.
**Why it happens:** The pin button is added without proper ARIA attributes or keyboard handling.
**How to avoid:** The pin button must have: `aria-pressed={pinned}` (toggle button pattern), `aria-label` describing the action ("Unpin sidebar navigation. Currently pinned." matching Chameleon), and standard button keyboard handling (Enter/Space to activate). Use a proper `<button>` element, not a `<div>`.
**Warning signs:** Accessibility tests fail; screen reader announces button without state information.

### Pitfall 6: i18n Keys Missing for Pin/Unpin Labels
**What goes wrong:** The "Pin" and "Unpin" tooltip/label text is hardcoded in English, breaking the app's i18n support.
**Why it happens:** New UI text is added without adding translation keys to all three locale files.
**How to avoid:** Add translation keys to `en.json`, `zh.json`, and `zh-TW.json` under a `common.sidebar` namespace:
```json
{
  "common": {
    "sidebar": {
      "pin": "Pin",
      "unpin": "Unpin",
      "pinLabel": "Pin sidebar navigation. Currently unpinned.",
      "unpinLabel": "Unpin sidebar navigation. Currently pinned."
    }
  }
}
```
**Warning signs:** Tooltip shows English text regardless of locale selection.

### Pitfall 7: Keyboard Shortcut Still Active Despite Being Dropped
**What goes wrong:** The Cmd/Ctrl+B keyboard shortcut from shadcn's default sidebar code (line 106-118 of sidebar.tsx) toggles the sidebar, conflicting with the pin/unpin behavior.
**Why it happens:** The `SIDEBAR_KEYBOARD_SHORTCUT = "b"` constant and the `useEffect` for `handleKeyDown` are part of the installed shadcn sidebar component.
**How to avoid:** Since SIDE-12 is dropped, the keyboard shortcut behavior that already exists in `sidebar.tsx` can remain as-is -- it calls `toggleSidebar()` which maps to `setOpen(!open)`. In pin mode, this toggles between pinned-expanded and pinned-collapsed. We need to decide: should Cmd+B toggle pin state, or should it do nothing? **Recommendation:** Leave the existing keyboard shortcut as-is for now. It provides a toggle between expanded/collapsed that the user may find useful even though they dropped it from scope. If it causes confusion, it can be removed in a future phase.
**Warning signs:** Users accidentally toggle sidebar with Cmd+B and don't understand why.

## Code Examples

### Reading Pin Cookie on Server

```typescript
// Source: Existing SidebarShell pattern from Phase 2
import { cookies } from "next/headers";

export async function SidebarShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const pinnedCookie = cookieStore.get("sidebar_pinned")?.value;
  const defaultPinned = pinnedCookie !== "false"; // Default to pinned

  return (
    <SidebarLayout defaultPinned={defaultPinned}>
      {children}
    </SidebarLayout>
  );
}
```

### Writing Pin Cookie on Client

```typescript
// Source: Same pattern as shadcn SidebarProvider (sidebar.tsx line 93)
const SIDEBAR_PINNED_COOKIE = "sidebar_pinned";
const SIDEBAR_PINNED_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function handleTogglePin() {
  const newPinned = !pinned;
  setPinned(newPinned);
  document.cookie = `${SIDEBAR_PINNED_COOKIE}=${newPinned}; path=/; max-age=${SIDEBAR_PINNED_MAX_AGE}`;
}
```

### Pin Toggle Button with Chameleon-style Accessibility

```typescript
// Source: Chameleon accessibility snapshot analysis
// Chameleon: button "Unpin sidebar navigation. Currently pinned." [pressed]
// Chameleon: tooltip "Unpin"

<Tooltip>
  <TooltipTrigger asChild>
    <button
      onClick={onTogglePin}
      aria-pressed={pinned}
      aria-label={pinned ? t("sidebar.unpinLabel") : t("sidebar.pinLabel")}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md
                 text-sidebar-foreground/70 hover:bg-sidebar-accent
                 hover:text-sidebar-accent-foreground"
    >
      {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
    </button>
  </TooltipTrigger>
  <TooltipContent side="right">
    {pinned ? t("sidebar.unpin") : t("sidebar.pin")}
  </TooltipContent>
</Tooltip>
```

### Hover Trigger Zone

```typescript
// Source: Custom implementation based on user decisions
// 20-24px wide, left edge, instant reveal, hidden on mobile

{!pinned && (
  <div
    className="fixed inset-y-0 left-0 z-20 hidden w-[22px] md:block"
    onMouseEnter={handleHoverReveal}
    aria-hidden="true"
  />
)}
```

### CSS Override for Overlay Mode

```css
/* Source: Custom CSS targeting shadcn data attributes */
/* Apply to sidebar when in hover-overlay mode */
/* The sidebar wrapper div gets data-sidebar-hover="true" from JS */

[data-sidebar-hover="true"] .peer[data-state="collapsed"][data-collapsible="offcanvas"] > div:last-child {
  left: 0;
  z-index: 30;
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.08);
  transition: left 150ms ease-in-out;
}

.dark [data-sidebar-hover="true"] .peer[data-state="collapsed"][data-collapsible="offcanvas"] > div:last-child {
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.3);
}
```

### Content Area Transition (Pinned Toggle)

When pin state changes, the content area resizes because the sidebar gap div changes width. The gap div already has `transition-[width] duration-200 ease-linear`. To match the user's requested `ease-in-out`:

```css
/* Optional: override in globals.css if needed */
.peer > div:first-child {
  transition-timing-function: ease-in-out;
}
```

Or, per Claude's Discretion, the content area can snap to new width without animation (simpler, no override needed).

**Recommendation (Claude's Discretion):** Let the content area animate its width transition. The existing `transition-[width] duration-200` on the gap div already handles this. Change `ease-linear` to `ease-in-out` would require modifying sidebar.tsx -- instead, accept `ease-linear` as "close enough" to the user's request, or add a global CSS override.

## Discretion Recommendations

### Label Animation During Collapse (Claude's Discretion)

**Recommendation: Use `overflow: hidden` (clip approach).**

When the sidebar collapses from expanded to icon-only (during the pin/unpin animation), the text labels need to disappear. Two approaches:

1. **Fade-then-shrink:** Labels fade out (opacity 0) first, then sidebar width shrinks. Requires two-phase animation, more complex.
2. **Clip overflow:** Sidebar width shrinks with `overflow: hidden` on the content area, and labels are simply clipped as width reduces. This is what shadcn already does via `group-data-[collapsible=icon]:overflow-hidden` on SidebarContent.

The clip approach is already built into the shadcn sidebar and requires zero custom code. For the `offcanvas` mode, the entire sidebar slides out of view, so labels disappear naturally with the sliding motion. **No custom label animation needed.**

### Content Area Resize Behavior (Claude's Discretion)

**Recommendation: Animate with existing CSS transition.**

When the user pins/unpins the sidebar, the content area width changes. The shadcn sidebar's gap div already has `transition-[width] duration-200 ease-linear`. This provides smooth content resize. The `ease-linear` timing is not exactly `ease-in-out` as the user requested, but the difference is subtle at 200ms duration.

**Do not** snap the content (removing the transition) -- the animated resize looks polished and professional. The existing transition is sufficient.

### CSS Transition Timing Values (Claude's Discretion)

**Recommendation:** Use `duration-150` and `ease-in-out` where we have control (custom CSS for overlay reveal). Accept `duration-200 ease-linear` where shadcn controls the timing (gap div, fixed sidebar position). The visual difference between 150ms and 200ms is imperceptible. The difference between `ease-linear` and `ease-in-out` is subtle at these durations.

If a global override is desired, add to `globals.css`:
```css
/* Smooth sidebar transitions */
.peer > div:first-child,
.peer > div:last-child {
  transition-timing-function: ease-in-out !important;
  transition-duration: 150ms !important;
}
```

**However**, this modifies the transition for ALL sidebar states (including mobile sheet). **Recommendation:** Accept the default `ease-linear` timing and only override for the hover-reveal overlay.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Icon-only collapse rail | Full auto-hide with overlay reveal | VS Code, Linear, Notion pattern 2024+ | Modern SaaS apps prefer full auto-hide over icon rail for more content space |
| JavaScript-driven animation | CSS transitions on data attributes | shadcn sidebar 2024 | Zero JS animation code; all transitions via Tailwind + CSS |
| localStorage for sidebar state | Cookie-based persistence | Next.js SSR pattern | Cookie readable on server prevents flash of wrong state |
| Separate toggle button in content area | Pin/unpin button inside sidebar header | Chameleon, Linear, Notion pattern | Pin control lives with the sidebar, not in the content area |

**Deprecated/outdated:**
- `collapsible="icon"` for auto-hide behavior: This shows a permanent icon rail, not full auto-hide. Use `collapsible="offcanvas"` for full hide.

## Open Questions

1. **Sidebar width constant: 3rem vs 4rem for `SIDEBAR_WIDTH_ICON`**
   - What we know: Phase 1 defined `--sidebar-width-icon: 48px` (3rem). The user's CONTEXT says "Collapsed width: ~4rem." The existing sidebar.tsx has `SIDEBAR_WIDTH_ICON = "3rem"`.
   - What's unclear: Whether the user wants to change the icon-only width from 3rem to 4rem, or if "~4rem" was approximate and 3rem (48px) is acceptable.
   - Recommendation: Keep 3rem (48px). The "collapsed (icon-only) mode" description in CONTEXT may describe a reference pattern rather than the actual unpinned behavior (which is fully hidden, not icon-only). If the icon-only mode is not shown when unpinned (user decided "fully hidden"), this constant is not user-facing in Phase 3. Leave as-is; can be adjusted in a future phase if needed.

2. **Existing keyboard shortcut (Cmd/Ctrl+B) behavior**
   - What we know: shadcn's sidebar.tsx includes a keyboard shortcut handler (lines 106-118) that calls `toggleSidebar()`. SIDE-12 (keyboard shortcut) was dropped from Phase 3 scope.
   - What's unclear: Should the existing shortcut be disabled since it's "dropped"? Or is it acceptable that it already works?
   - Recommendation: Leave it as-is. The shortcut already exists in the shadcn code. It toggles the sidebar open/closed state, which effectively acts as a pin/unpin toggle when `SidebarProvider open={pinned}`. This gives users a keyboard shortcut "for free" without any implementation effort. If the user dislikes it, it can be explicitly disabled later.

3. **Controlled vs Uncontrolled SidebarProvider**
   - What we know: Controlled mode prevents shadcn's internal cookie writes but requires careful management of all state transitions. Uncontrolled mode with `defaultOpen` lets shadcn handle cookies but may conflict with hover-reveal state.
   - What's unclear: Whether the existing `sidebar_state` cookie from Phase 2 should be repurposed, replaced by `sidebar_pinned`, or both kept.
   - Recommendation: **Hybrid approach.** Use uncontrolled mode (`defaultOpen={pinned}`) for the base SidebarProvider. The pin toggle calls `useSidebar().setOpen(newPinned)` which writes the `sidebar_state` cookie. For hover reveal, use CSS-only overlay (no React state change to SidebarProvider). The `sidebar_state` cookie effectively becomes the pin state cookie. No need for a separate `sidebar_pinned` cookie -- reuse the existing one.

   **Revised architecture (simpler):**
   - `SidebarShell` reads `sidebar_state` cookie (already does this) -> this IS the pin state
   - `SidebarProvider defaultOpen={defaultPinned}` (where `defaultPinned = cookie !== "false"`)
   - Pin button calls `useSidebar().setOpen(!open)` (shadcn writes cookie automatically)
   - When `state="collapsed"` (unpinned), render hover trigger zone
   - Hover trigger adds `data-sidebar-hover="true"` to wrapper, CSS overrides slide sidebar in
   - Hover leave removes `data-sidebar-hover`, CSS slides sidebar out
   - No controlled mode, no custom cookie, no cookie conflicts

   This is significantly simpler and builds directly on Phase 2's existing pattern.

## Impact Analysis: Files Changed

### Files to CREATE
| File | Purpose |
|------|---------|
| (possibly) `components/layouts/sidebar-layout.tsx` | Client component wrapper for pin state + hover management -- only if SidebarShell refactoring is needed |

### Files to MODIFY
| File | Change |
|------|--------|
| `components/layouts/sidebar-shell.tsx` | May need refactoring to pass pin state to a client wrapper |
| `components/layouts/app-sidebar.tsx` | Add pin toggle button in SidebarHeader, accept `pinned`/`onTogglePin` props (or use `useSidebar()`) |
| `app/globals.css` | Add CSS overrides for hover-overlay mode (targeting data attributes) |
| `i18n/messages/en.json` | Add `common.sidebar.pin`, `common.sidebar.unpin`, `common.sidebar.pinLabel`, `common.sidebar.unpinLabel` |
| `i18n/messages/zh.json` | Same keys in Chinese |
| `i18n/messages/zh-TW.json` | Same keys in Traditional Chinese |
| `tests/components/layouts/app-sidebar.test.tsx` | Add tests for pin toggle button rendering, aria-pressed, tooltip |

### Files NOT Modified
| File | Reason |
|------|--------|
| `components/ui/sidebar.tsx` | shadcn managed file; all customization via props, CSS overrides, wrapper components |
| `app/dashboard/layout.tsx` | Already uses `SidebarShell`, no change needed |
| `app/habits/layout.tsx` | Same |
| `app/tasks/layout.tsx` | Same |

### i18n: New Keys Needed

```json
{
  "common": {
    "sidebar": {
      "pin": "Pin",
      "unpin": "Unpin",
      "pinLabel": "Pin sidebar navigation. Currently unpinned.",
      "unpinLabel": "Unpin sidebar navigation. Currently pinned."
    }
  }
}
```

All three locale files (en, zh, zh-TW) need these keys.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection:** `components/ui/sidebar.tsx` (774 lines) -- direct reading of collapsible modes, data attributes, CSS classes, cookie handling, SidebarProvider state management, SidebarMenuButton tooltip behavior
- **Codebase inspection:** `components/layouts/sidebar-shell.tsx`, `components/layouts/app-sidebar.tsx` -- Phase 2 implementations that Phase 3 extends
- **Codebase inspection:** `app/globals.css` -- sidebar CSS tokens, `--sidebar-width-icon: 48px`
- **Codebase inspection:** `hooks/use-mobile.ts` -- 768px breakpoint
- **shadcn/ui sidebar docs via Context7** (`/websites/ui_shadcn`) -- `collapsible` prop types (offcanvas, icon, none), `useSidebar` hook API, controlled/uncontrolled `SidebarProvider`, `SidebarRail` component
- **Chameleon sidebar snapshot** (`chameleon-sidebar-snapshot.md`) -- accessibility tree showing `button "Unpin sidebar navigation. Currently pinned." [pressed]`, `tooltip "Unpin"`, `navigation "Main navigation sidebar, currently expanded and pinned"`
- **Chameleon screenshots** (`chameleon-sidebar.png`, `chameleon-home-full.png`, `chameleon-tours.png`) -- visual reference for pin button placement (top-right of sidebar, next to logo)
- **Phase 2 research and plans** (`02-RESEARCH.md`, `02-01-PLAN.md`, `02-02-PLAN.md`) -- established architecture, decisions, patterns

### Secondary (MEDIUM confidence)
- **Phase 2 verification** (`02-VERIFICATION.md`) -- confirms Phase 2 implementation is complete and tested, establishes the baseline that Phase 3 builds on
- **Design tokens reference** (`DESIGN-TOKENS.md`) -- sidebar color tokens, dimensions, layout constants
- **Requirements document** (`REQUIREMENTS.md`) -- SIDE-02, SIDE-06, SIDE-09, SIDE-11 requirement text

### Tertiary (LOW confidence)
- **CSS-only hover overlay approach:** The approach of using CSS `left` override via data attributes on the sidebar wrapper is synthesized from understanding of the component internals. It has not been tested in the actual codebase yet. Needs validation during implementation.
- **Cookie reuse (`sidebar_state` as pin state):** The simplified approach of reusing the existing `sidebar_state` cookie as the pin state depends on shadcn's internal cookie behavior remaining stable. If a future shadcn update changes how `setOpen` writes cookies, this approach could break.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, no new dependencies
- Architecture (state model): HIGH -- directly derived from shadcn component internals + user requirements
- Architecture (hover overlay CSS): MEDIUM -- approach is sound but untested; CSS selector targeting of internal DOM may need adjustment during implementation
- Pitfalls: HIGH -- cookie flash, controlled mode conflicts, and transition mismatches are well-documented patterns
- Code examples: MEDIUM -- examples are illustrative and may need adjustment during implementation
- i18n: HIGH -- straightforward addition of translation keys in established pattern

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain; shadcn sidebar component is mature, no breaking changes expected)
