# Stack Research: SaaS Dashboard UI Redesign

**Domain:** SaaS dashboard layout redesign (collapsible sidebar + card-on-gray depth system)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Decision

**Use the shadcn/ui built-in Sidebar component.** Do not build a custom sidebar. The shadcn Sidebar is the single most complex component in the shadcn/ui ecosystem -- purpose-built for exactly this use case -- and the project already has most of its dependencies installed. Combined with Tailwind CSS 3 design tokens for the card-on-gray depth system, no new libraries are needed beyond what `pnpm dlx shadcn@latest add sidebar` installs.

---

## Recommended Stack

### Core Technologies (No New Dependencies Required)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| shadcn/ui Sidebar | Latest (via CLI) | Collapsible left sidebar navigation | Purpose-built composable sidebar with collapsible modes (`icon`, `offcanvas`, `none`), mobile Sheet fallback, cookie persistence, keyboard shortcut (Cmd/Ctrl+B), and full dark mode support via CSS variables. The project already has the CSS tokens defined in `globals.css`. No reason to build custom. |
| Tailwind CSS 3 | ^3.4.1 (installed) | Card-on-gray layout, spacing, responsive | Already in the project. The card-on-gray pattern is pure CSS -- custom `--background` token values + existing `bg-card` / `bg-background` utilities. No plugins needed beyond what exists. |
| tailwindcss-animate | ^1.0.7 (installed) | Sidebar slide-in/out animations | Already installed. The shadcn Sidebar component uses `data-[state=open]:animate-in` and `data-[state=closed]:animate-out` patterns from this plugin. No additional animation library needed. |
| next-themes | ^0.4.6 (installed) | Dark mode class toggling | Already installed. The card-on-gray tokens will use the same class-based `.dark` strategy. No changes to the theme provider needed. |
| Radix UI | ^1.4.3 (installed) | Sidebar primitives (Sheet for mobile, Collapsible for groups, Tooltip for icon mode) | Already installed as the unified `radix-ui` package. The sidebar component imports Sheet, Collapsible, and Tooltip from Radix. |
| lucide-react | ^0.511.0 (installed) | Sidebar navigation icons, collapse/expand triggers | Already installed. Provides `PanelLeft`, `ChevronDown`, `ChevronRight` and all nav item icons needed. |

### Supporting Libraries (Already Installed)

| Library | Version | Purpose | How Used in Redesign |
|---------|---------|---------|----------------------|
| class-variance-authority | ^0.7.1 | Component variants | Sidebar menu button variants (default, outline) |
| clsx + tailwind-merge | ^2.1.1 / ^3.3.0 | Conditional class merging | Composing layout classes for card containers and sidebar states |
| next-intl | ^4.8.2 | i18n for sidebar labels | Sidebar nav items need translated labels; use `useTranslations('sidebar')` |

### New Component (Via shadcn CLI)

| Component | Installation | Files Created/Modified |
|-----------|-------------|----------------------|
| Sidebar | `pnpm dlx shadcn@latest add sidebar` | Creates `components/ui/sidebar.tsx`. May update `button.tsx` and `input.tsx`. Creates `hooks/use-mobile.ts` (already exists -- CLI will skip or overwrite). |

**Confidence: HIGH** -- Verified via official shadcn/ui documentation at [ui.shadcn.com/docs/components/radix/sidebar](https://ui.shadcn.com/docs/components/radix/sidebar).

---

## Key Technical Decisions

### 1. Use shadcn/ui Sidebar, NOT Custom (HIGH confidence)

**Why:**
- The shadcn Sidebar is the most fully-featured sidebar component in the React ecosystem for this stack. It handles collapsible state management, mobile responsiveness (via Sheet), cookie-based state persistence, keyboard shortcuts, icon-only mode, and RTL support out of the box.
- The project already has all prerequisites: `radix-ui` (unified package), `tailwindcss-animate`, Sheet, Tooltip, Skeleton, Separator, Collapsible, and the `use-mobile` hook.
- The sidebar CSS variables (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, etc.) are already defined in `globals.css` with both light and dark mode values.
- Building custom would mean reimplementing mobile Sheet behavior, cookie persistence, keyboard shortcuts, collapsed-to-icon transitions, and accessible ARIA patterns -- all solved problems in the shadcn component.

**Configuration to use:**
- `collapsible="icon"` -- Collapses to icon-only width (matches Chameleon's pin/unpin behavior)
- `variant="sidebar"` -- Standard sidebar (not floating or inset)
- `side="left"` -- Left-side navigation
- Cookie persistence via `defaultOpen` prop reading from `cookies()` in the server layout

### 2. No Animation Library Needed (HIGH confidence)

**Why:**
- `tailwindcss-animate` (already installed) provides all animations the sidebar uses: `animate-in`, `animate-out`, `slide-in-from-left`, `slide-out-to-left`, `fade-in`, `fade-out`.
- The sidebar's desktop collapse transition uses CSS `transition-[width,padding]` with `duration-200` -- pure CSS, no JS animation library.
- The mobile sidebar uses Sheet, which already has slide-in/out animations via `tailwindcss-animate`.
- Framer Motion, Motion, or any other JS animation library would be unnecessary overhead for this use case.

**Confidence: HIGH** -- Verified by examining the shadcn Sheet component (already in the codebase at `components/ui/sheet.tsx`) which uses `data-[state=open]:animate-in data-[state=closed]:animate-out` patterns.

### 3. Card-on-Gray via CSS Token Modification, Not New Components (HIGH confidence)

**The approach:** Modify the existing CSS custom properties in `globals.css` to create the depth system:

```css
/* Light mode: gray page background, white cards */
:root {
  --background: 210 20% 96%;      /* ~#f0f3f7 -- light gray page */
  --card: 0 0% 100%;              /* pure white cards */
  --card-foreground: 0 0% 3.9%;   /* dark text on cards */
}

/* Dark mode: dark page background, slightly lighter cards */
.dark {
  --background: 0 0% 5%;          /* very dark page */
  --card: 0 0% 9%;                /* slightly lighter dark cards */
  --card-foreground: 0 0% 98%;    /* light text on dark cards */
}
```

**Why this approach:**
- The existing `bg-background` and `bg-card` Tailwind utilities already reference these CSS variables throughout the codebase.
- Changing the token values propagates everywhere automatically -- no per-component changes needed.
- The shadcn Card component (`components/ui/card.tsx`) already uses `bg-card text-card-foreground` classes.
- Dark mode works automatically because the `.dark` selector overrides the variables.
- This matches the design token pattern recommended by both shadcn/ui and Tailwind CSS documentation for scalable theming.

**No Tailwind plugins needed.** The existing `tailwindcss-animate` plugin is the only plugin required, and it is already installed.

### 4. Sidebar CSS Tokens Already Partially Set Up (HIGH confidence)

The project's `globals.css` already contains sidebar-specific CSS variables:

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

**Issue:** These tokens are defined with `hsl()` wrappers, but the shadcn/ui sidebar component expects raw HSL values (without the `hsl()` wrapper) so that Tailwind can compose them with `hsl(var(--sidebar))`. The standard shadcn approach uses raw values like `--sidebar-background: 0 0% 98%`. These tokens need to be reformatted to match the pattern used by the other tokens in the file (e.g., `--background: 0 0% 100%`).

Additionally, the tokens need to be moved into the `@layer base` block alongside the other theme tokens for consistency. The `@theme inline` block that maps `--color-sidebar-*` is already set up correctly for Tailwind v4 compatibility.

**Action needed:** Reformat sidebar tokens from `hsl()` wrapped values to raw HSL values, and move them into the existing `@layer base :root` and `.dark` blocks.

### 5. Dark Mode: Extend Existing Pattern (HIGH confidence)

**Approach:** The project already uses class-based dark mode via `next-themes` with `attribute="class"` and `storageKey="betterr-theme"`. The redesign extends this by:

1. Adjusting `--background` and `--card` token values (see Decision 3 above)
2. Keeping sidebar tokens in the `.dark` block (already present in `globals.css`)
3. Customizing the sidebar's dark mode accent to use the project's emerald/teal brand color:

```css
.dark {
  --sidebar-primary: 142 71% 45%;              /* emerald accent */
  --sidebar-primary-foreground: 0 0% 9%;       /* dark text on accent */
  --sidebar-accent: 0 0% 14.9%;                /* subtle hover bg */
}
```

No changes to `ThemeProvider` configuration or `next-themes` usage are needed.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Framer Motion / Motion | Unnecessary bundle size for simple slide/fade transitions. The sidebar only needs CSS transitions. | `tailwindcss-animate` (already installed) + native CSS `transition` |
| Custom sidebar from scratch | Reimplements solved problems: cookie persistence, mobile Sheet, keyboard shortcuts, icon collapse, a11y. 500+ lines of code the shadcn component already handles. | `pnpm dlx shadcn@latest add sidebar` |
| Tailwind CSS 4 migration | The project runs Tailwind v3 with PostCSS config. Migrating to v4 during a visual redesign adds unnecessary risk and scope. | Stay on Tailwind CSS 3.4.x |
| `@headlessui/react` sidebar | Different component library; would conflict with existing Radix UI ecosystem. | shadcn/ui Sidebar (uses Radix UI internally) |
| CSS Modules or styled-components | Breaks the utility-first Tailwind approach used throughout the codebase. | Tailwind utility classes + CSS variables |
| tailwind-scrollbar plugin | Unnecessary for sidebar. Sidebar uses native `overflow-y-auto` which is fine for the nav item count. | Native CSS overflow |

---

## Installation

```bash
# Install the shadcn/ui Sidebar component (and any missing sub-dependencies)
pnpm dlx shadcn@latest add sidebar
```

This single command:
- Creates `components/ui/sidebar.tsx`
- Ensures `separator.tsx`, `sheet.tsx`, `tooltip.tsx`, `skeleton.tsx` exist (all already present)
- May update `button.tsx` and `input.tsx` (already present)
- Creates `hooks/use-mobile.ts` (already present -- verify CLI behavior)

**No `pnpm install` needed** -- all npm dependencies (`radix-ui`, `tailwindcss-animate`, `lucide-react`) are already in `package.json`.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| shadcn/ui Sidebar | Custom sidebar with Radix Sheet | Only if you need a sidebar pattern radically different from what shadcn supports (e.g., multi-level mega-menu). Not the case here. |
| `collapsible="icon"` mode | `collapsible="offcanvas"` mode | If you want the sidebar to fully slide off-screen when collapsed rather than shrink to icons. Chameleon uses icon-collapse, not offcanvas. |
| CSS token modification | Per-component `dark:` classes | If you only need dark mode on a few components. Not suitable here -- the redesign affects every page. |
| `tailwindcss-animate` | Framer Motion | If you need physics-based springs, gesture animations, or layout animations. Not needed for sidebar slide/fade. |
| Staying on Tailwind v3 | Migrating to Tailwind v4 | If you want the new `@theme` directive and CSS-first config. But do this as a separate milestone, not during a visual redesign. |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `radix-ui` | ^1.4.3 | shadcn/ui sidebar (latest) | The unified `radix-ui` package includes Sheet, Collapsible, Tooltip -- all sidebar dependencies. |
| `tailwindcss` | ^3.4.1 | `tailwindcss-animate` ^1.0.7 | Both installed. No version conflicts. |
| `next` | 16.1.6 | shadcn/ui sidebar | App Router layout pattern is the recommended setup for `SidebarProvider`. |
| `next-themes` | ^0.4.6 | Class-based dark mode | Works with `darkMode: ["class"]` in `tailwind.config.ts` (already configured). |
| shadcn/ui CLI | `@latest` | `components.json` (new-york style, rsc: true) | The project's `components.json` uses `"style": "new-york"` and `"rsc": true`, which is the standard configuration for the sidebar CLI. |

---

## Stack Patterns by Variant

**If the sidebar only needs two states (expanded/collapsed to icons):**
- Use `collapsible="icon"` with `SidebarRail` for hover-to-expand
- This matches Chameleon's pin/unpin pattern exactly
- Most content stays visible in collapsed state via tooltips on icons

**If the sidebar needs to fully hide on desktop:**
- Use `collapsible="offcanvas"` instead
- The sidebar slides completely off-screen
- Less common for SaaS dashboards; more common for content-focused apps

**If you want the sidebar to appear inset (with rounded corners, floating look):**
- Use `variant="inset"` with `<SidebarInset>` wrapping main content
- Creates a card-like sidebar separate from page edge
- Adds visual flair but uses more horizontal space

**Recommendation for BetterR.Me:** Use `collapsible="icon"` + `variant="sidebar"` for the standard Chameleon-like experience.

---

## CSS Architecture for the Redesign

### Token Changes in `globals.css`

The card-on-gray depth system requires changing only 4-6 CSS variable values:

| Token | Current Value (Light) | New Value (Light) | Purpose |
|-------|----------------------|-------------------|---------|
| `--background` | `0 0% 100%` (white) | `210 20% 96%` (light gray) | Page background becomes gray |
| `--card` | `0 0% 100%` (white) | `0 0% 100%` (stays white) | Cards float on gray bg |
| `--card-foreground` | `0 0% 3.9%` | `0 0% 3.9%` (stays) | No change needed |

| Token | Current Value (Dark) | New Value (Dark) | Purpose |
|-------|---------------------|------------------|---------|
| `--background` | `0 0% 3.9%` | `0 0% 5%` or `220 15% 6%` | Darker page bg |
| `--card` | `0 0% 3.9%` | `0 0% 9%` or `220 10% 10%` | Card stands out from bg |
| `--card-foreground` | `0 0% 98%` | `0 0% 98%` (stays) | No change needed |

### Sidebar Token Cleanup

Move sidebar tokens from standalone `:root` / `.dark` blocks into the `@layer base` block, and strip `hsl()` wrappers:

```css
/* Before (current -- broken pattern) */
:root {
  --sidebar: hsl(0 0% 98%);
}

/* After (correct pattern) */
@layer base {
  :root {
    --sidebar: 0 0% 98%;
  }
}
```

### Brand Color (Emerald/Teal) Integration

The sidebar's active state should use the project's existing `--primary` color (emerald) rather than the default shadcn blue. Map sidebar tokens:

```css
:root {
  --sidebar-primary: 160 84% 39%;              /* matches --primary */
  --sidebar-primary-foreground: 0 0% 100%;     /* white text on emerald */
}
```

---

## Sources

- [shadcn/ui Sidebar Documentation](https://ui.shadcn.com/docs/components/radix/sidebar) -- Official docs, installation, props, CSS variables, all sub-components (HIGH confidence)
- [shadcn/ui Sidebar Blocks](https://ui.shadcn.com/blocks/sidebar) -- Pre-built sidebar layout patterns (HIGH confidence)
- [shadcn/ui Theming Documentation](https://ui.shadcn.com/docs/theming) -- CSS variable patterns, dark mode tokens (HIGH confidence)
- [shadcn/ui Dark Mode Documentation](https://ui.shadcn.com/docs/dark-mode) -- next-themes integration (HIGH confidence)
- [Tailwind CSS Dark Mode v3 Documentation](https://v3.tailwindcss.com/docs/dark-mode) -- Class-based dark mode strategy (HIGH confidence)
- [shadcn Sidebar Cookie Persistence](https://www.achromatic.dev/blog/shadcn-sidebar) -- Cookie-based state persistence pattern (MEDIUM confidence)
- [shadcn Sidebar Architecture Blog](https://medium.com/@rivainasution/shadcn-ui-react-series-part-11-sidebar-architecting-a-scalable-sidebar-system-in-react-f45274043863) -- Component dependencies and file structure (MEDIUM confidence)
- Existing codebase analysis: `globals.css`, `tailwind.config.ts`, `components.json`, `package.json`, `app-layout.tsx` -- Direct inspection (HIGH confidence)

---
*Stack research for: BetterR.Me UI Style Redesign*
*Researched: 2026-02-15*
